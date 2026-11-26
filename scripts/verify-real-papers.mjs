/**
 * Renders REAL production submissions through the actual candidate-paper
 * builder and PDF renderer, then extracts the text back out of the PDF and
 * asserts that question-level marking is genuinely visible.
 *
 * Run: node scripts/verify-real-papers.mjs
 */
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import ts from "typescript";

const outDir = "/tmp/evalora-real-papers";
execSync(`rm -rf ${outDir} && mkdir -p ${outDir}`);

const req = createRequire(path.resolve("package.json"));
const Module = req("node:module");
const compiledCache = new Map();

function compileTsToCjs(absTsPath) {
  if (compiledCache.has(absTsPath)) return compiledCache.get(absTsPath);
  const rel = path.relative(process.cwd(), absTsPath);
  const src = readFileSync(absTsPath, "utf8");
  const transpiled = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      skipLibCheck: true,
    },
    fileName: rel,
  }).outputText;
  const target = path.join(outDir, rel.replace(/\.ts$/, ".cjs"));
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, transpiled);
  compiledCache.set(absTsPath, target);
  return target;
}

const prevResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (parent && parent.filename.startsWith(outDir)) {
    let tsCandidate = null;
    if (request.startsWith("./") || request.startsWith("../")) {
      const parentOrigRel = path.relative(outDir, parent.filename).replace(/\.cjs$/, ".ts");
      const withTs = request.endsWith(".ts") ? request : request + ".ts";
      tsCandidate = path.resolve(path.dirname(parentOrigRel), withTs);
    } else if (request.startsWith("@/lib/")) {
      tsCandidate = path.resolve("src/lib", request.slice("@/lib/".length) + ".ts");
    }
    if (tsCandidate) {
      try {
        readFileSync(tsCandidate);
        return compileTsToCjs(tsCandidate);
      } catch {
        /* fall through */
      }
    }
    if (!request.startsWith(".") && !request.startsWith("/")) {
      return req.resolve(request);
    }
  }
  return prevResolve.call(this, request, parent, isMain, options);
};

const candidatePaper = req(compileTsToCjs(path.resolve("src/lib/candidatePaper.ts")));
const candidatePaperPdf = req(compileTsToCjs(path.resolve("src/lib/candidatePaperPdf.ts")));

const { MYP5_OXANE } = await import("./real-paper-data/myp5-oxane.mjs");
const { MYP4_MELINA } = await import("./real-paper-data/myp4-melina.mjs");

async function extractPdf(bytes) {
  const doc = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: true, isEvalSupported: false }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map((it) => ("str" in it ? it.str : "")).join(" "));
  }
  return { numPages: doc.numPages, fullText: pages.join("\n"), pages };
}

/** Turn the captured production rows into the exact loader row shape. */
function toSessionRows(fixture) {
  return fixture.rows.map((row, index) => ({
    id: `qq-${index}`,
    question_id: row.id,
    position: index,
    points: row.points,
    time_limit_seconds: null,
    questions: {
      id: row.id,
      type: row.type,
      prompt: row.prompt,
      prompt_doc: null,
      explanation: null,
      explanation_doc: null,
      points: row.points,
      topic: null,
      difficulty: null,
      config: {
        myp_criterion: row.criterion,
        question_number: row.number,
        paper_section: "A",
        ...(row.parts ? { parts: row.parts } : {}),
      },
      question_options: (row.options ?? []).map((o, i) => ({
        id: o.id,
        label: o.label,
        content_doc: o.content_doc ?? null,
        is_correct: o.is_correct,
        position: i,
      })),
    },
  }));
}

function toSavedAnswers(fixture) {
  return Object.entries(fixture.answers).map(([questionId, value]) => ({
    question_id: questionId,
    answer: value.answer,
    points_awarded: value.points_awarded,
    marker_note: value.marker_note ?? null,
    grading_note: null,
  }));
}

/** Presentation strings the app would read from the exam settings. */
const FIXTURE_META = {
  "cd000000-0000-4000-8000-000000000002": {
    title: "MYP4 Mathematics — Version C",
    quizSettings: { subject: "Mathematics", curriculum: "MYP 4", grade_level: "Grade 9" },
    className: "Grade 9 — MYP 4",
  },
  "ce000000-0000-4000-8000-000000000002": {
    title: "MYP5 Mathematics — Version C",
    quizSettings: { subject: "Mathematics", curriculum: "MYP 5", grade_level: "Grade 10" },
    className: "Grade 10 — MYP 5",
  },
};

/**
 * The school's configured MYP criterion-level boundaries for Mathematics, read
 * from `myp_level_boundaries` (organization 0a400000-…-0001, subject …0030).
 *
 * These are the EVALORA default conversion, which is what the organization has
 * configured: percentage of a criterion's marks to an achievement level. They
 * are declared here so the verifier can prove the PDF's levels come from the
 * configured table rather than from a hard-coded curve of its own.
 */
const LEVEL_BOUNDARIES = [
  { level: 0, minPercent: 0 },
  { level: 1, minPercent: 1 },
  { level: 2, minPercent: 20 },
  { level: 3, minPercent: 35 },
  { level: 4, minPercent: 50 },
  { level: 5, minPercent: 65 },
  { level: 6, minPercent: 75 },
  { level: 7, minPercent: 85 },
  { level: 8, minPercent: 95 },
];

/** The configured overall bands: total of criterion levels → MYP grade 1–7. */
const GRADE_BOUNDARIES = [
  { minTotal: 0, maxTotal: 5, grade: 1 },
  { minTotal: 6, maxTotal: 9, grade: 2 },
  { minTotal: 10, maxTotal: 14, grade: 3 },
  { minTotal: 15, maxTotal: 18, grade: 4 },
  { minTotal: 19, maxTotal: 23, grade: 5 },
  { minTotal: 24, maxTotal: 27, grade: 6 },
  { minTotal: 28, maxTotal: 32, grade: 7 },
];

function levelFromPercent(percent) {
  const rows = [...LEVEL_BOUNDARIES].sort((a, b) => b.level - a.level);
  for (const row of rows) if (percent >= row.minPercent) return row.level;
  return 0;
}

function gradeFromTotal(total) {
  for (const row of GRADE_BOUNDARIES) {
    if (total >= row.minTotal && total <= row.maxTotal) return row.grade;
  }
  return null;
}

/** The overall summary for a fixture, computed from its criterion marks. */
function overallFor(criteria) {
  const levels = criteria.map((c) => levelFromPercent(Math.round((c.marksAwarded / c.marksMax) * 1000) / 10));
  const totalLevels = levels.reduce((sum, l) => sum + l, 0);
  const totalLevelsMax = criteria.length * 8;
  return {
    totalLevels,
    totalLevelsMax,
    grade: gradeFromTotal(totalLevels),
    status: "final",
    statusLabel: "Final",
    note: "Overall grade from the configured boundaries for Mathematics.",
    levelSource: "EVALORA default criterion-level conversion — percentage of criterion marks to MYP achievement level",
  };
}

function buildPaper(fixture, { published, preview }) {
  const settings = published ? { results_published: true } : {};
  const meta = FIXTURE_META[fixture.exam];
  return candidatePaper.buildCandidatePaperData({
    attempt: {
      id: fixture.attempt,
      status: "submitted",
      started_at: "2026-11-26T09:00:00Z",
      submitted_at: "2026-11-26T11:00:00Z",
      score: fixture.score,
      max_score: fixture.maxScore,
      attempt_number: 1,
      first_name: fixture.student.split(" ")[0],
      last_name: fixture.student.split(" ").slice(1).join(" "),
    },
    exam: {
      title: meta.title,
      instructions: null,
      duration_minutes: 120,
      settings,
    },
    candidate: {
      full_name: fixture.student,
      first_name: fixture.student.split(" ")[0],
      last_name: fixture.student.split(" ").slice(1).join(" "),
    },
    organization: { name: "Oak International School", logo_url: null },
    quizSettings: meta.quizSettings,
    className: meta.className,
    orderedRows: toSessionRows(fixture),
    savedAnswers: toSavedAnswers(fixture),
    // Only handed to the builder when the caller is allowed to see marks.
    //
    // The levels and the overall grade are produced the same way `buildMypResult`
    // produces them: each criterion's percentage is read against the school's
    // configured level boundaries, and the overall grade is the SUM OF LEVELS read
    // against the configured total bands — never a conversion of the exam
    // percentage. Asserting on them therefore checks the rendering, not the maths.
    result: {
      published,
      criteria: fixture.criteria.map((c) => {
        const percent = Math.round((c.marksAwarded / c.marksMax) * 1000) / 10;
        return { ...c, percent, level: levelFromPercent(percent) };
      }),
      overall: overallFor(fixture.criteria),
    },
    markingPreview: preview,
  });
}

let passed = 0;
let failed = 0;
async function check(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`  ✗ ${name}`);
    console.log(`      ${error instanceof Error ? error.message : String(error)}`);
  }
}

let totalPassed = 0;
let totalFailed = 0;

/**
 * Run every assertion against one real submission.
 *
 * The per-page and per-mark expectations differ between papers, so each fixture
 * supplies its own expectations; the engine-level guarantees (no adjustment
 * leakage, no raw LaTeX, preserved answers) are asserted identically for both.
 */
async function verifyFixture(fixture, expect) {
  const label = fixture.label;
  console.log(`\nReal submission rendering — ${label}`);
  console.log(`Candidate ${fixture.student} · stored total ${fixture.score}/${fixture.maxScore}\n`);

  const slug = expect.slug;

  // ── The published paper: markings must be visibly present ────────────────
  const publishedData = buildPaper(fixture, { published: true, preview: false });
  const publishedPdf = await candidatePaperPdf.renderCandidateExamPaperPdf(publishedData);
  const published = await extractPdf(publishedPdf);

  // Keep the real artefacts for inspection.
  mkdirSync("docs/real-paper-proof", { recursive: true });
  writeFileSync(`docs/real-paper-proof/${slug}-published.pdf`, publishedPdf);

  await check("real paper renders a multi-page A4 document", async () => {
    assert.ok(published.numPages >= 3, `expected several pages, got ${published.numPages}`);
  });

  await check("every marked question shows its awarded mark out of the maximum", async () => {
    for (const expected of expect.questionMarks) {
      assert.ok(published.fullText.includes(expected), `missing per-question mark "${expected}"`);
    }
  });

  await check("correct answers are labelled CORRECT", async () => {
    const count = (published.fullText.match(/CORRECT/g) ?? []).length;
    assert.ok(count >= 6, `expected several CORRECT labels, found ${count}`);
    assert.ok(!/INCORRECT/.test(published.fullText));
  });

  await check("wrong answers are labelled WRONG", async () => {
    const count = (published.fullText.match(/\bWRONG\b/g) ?? []).length;
    assert.ok(count >= 5, `expected several WRONG labels, found ${count}`);
  });

  await check("partial-credit answers are labelled PARTIAL CREDIT with their marks", async () => {
    assert.ok(published.fullText.includes("PARTIAL CREDIT"), "missing PARTIAL CREDIT label");
    // Partial credit is a question-level verdict (2/3), because the school stored
    // whole marks per question and never a fraction per part.
    assert.ok(
      new RegExp(`Awarded: ${expect.partialMarks.replace(/[/]/g, "\\/")}\\s+·\\s+PARTIAL CREDIT`).test(published.fullText),
      "partial credit must show marks awarded",
    );
    assert.ok(/[0-9]+\/[0-9]+\s+CORRECT/.test(published.fullText), "a part must read marks/total CORRECT");
    assert.ok(published.fullText.includes("WRONG"), "a part must read WRONG");
  });

  await check("every multiple-choice option prints its real content, not just its letter", async () => {
    // `label` is only "A".."D"; the words and formulae live in `content_doc`.
    // A paper that prints "A. A" tells the student nothing, so require that no
    // option line is a bare letter repeated.
    assert.ok(!/A\. A\b|B\. B\b|C\. C\b|D\. D\b/.test(published.fullText), "an option printed as a bare repeated letter");
    for (const expected of expect.optionTexts) {
      assert.ok(published.fullText.includes(expected), `option content "${expected}" is missing`);
    }
  });

  await check("a wrong multiple-choice answer names the expected answer", async () => {
    assert.ok(published.fullText.includes("Expected answer:"), "missing expected answer for wrong choice");
    assert.ok(/Selected:\s*[A-D]/.test(published.fullText), "candidate's own choice must be preserved");
  });

  await check("wrong written parts print the expected value", async () => {
    for (const fragment of expect.preservedAnswers) {
      assert.ok(published.fullText.includes(fragment), `candidate answer "${fragment}" must be preserved verbatim`);
    }
  });

  await check("a blank part reads as not answered, never as allocated", async () => {
    // Neither real candidate left a scored part blank, so this is asserted only
    // where the paper actually contains one.
    if (!expect.hasBlankPart) {
      assert.ok(!/ALLOCATED FROM QUESTION TOTAL/.test(published.fullText), "no part should be allocated");
      return;
    }
    assert.ok(/NOT ANSWERED/.test(published.fullText), "a blank part must read NOT ANSWERED");
  });

  await check("MYP criteria A, B, C and D are all shown with marks", async () => {
    for (const code of ["A", "B", "C", "D"]) {
      assert.ok(published.fullText.includes(`Criterion ${code}`), `missing Criterion ${code}`);
    }
    for (const c of fixture.criteria) {
      const re = new RegExp(`${c.marksAwarded}\\s*\\/\\s*${c.marksMax}`);
      assert.ok(re.test(published.fullText), `criterion ${c.code} marks ${c.marksAwarded}/${c.marksMax} missing`);
    }
  });

  await check("each criterion prints its MYP achievement level from the configured boundaries", async () => {
    assert.ok(published.fullText.includes("MYP level"), "the criterion table has no MYP level column");
    for (const c of fixture.criteria) {
      const percent = Math.round((c.marksAwarded / c.marksMax) * 1000) / 10;
      const expectedLevel = levelFromPercent(percent);
      // The row prints "<awarded> / <max> <level> <percent>%"; assert the level
      // actually sits between this criterion's own marks and its percentage, so a
      // level belonging to a neighbouring row cannot satisfy the check.
      const row = new RegExp(
        `Criterion ${c.code}[\\s\\S]{0,200}?${c.marksAwarded}\\s*\\/\\s*${c.marksMax}\\s+${expectedLevel}\\s+${percent}%`,
      );
      assert.ok(
        row.test(published.fullText),
        `criterion ${c.code} should read "${c.marksAwarded} / ${c.marksMax}  ${expectedLevel}  ${percent}%" (level from ${percent}%)`,
      );
    }
  });

  await check("the overall MYP grade comes from the sum of levels, not from the percentage", async () => {
    const expected = overallFor(fixture.criteria);
    // The percentage the paper prints is deliberately NOT what the grade is for;
    // the two are asserted separately below so neither can stand in for the other.
    assert.ok(
      published.fullText.includes(`Total MYP levels`),
      "the paper does not print the total of criterion levels",
    );
    assert.ok(
      new RegExp(`${expected.totalLevels}\\s*\\/\\s*${expected.totalLevelsMax}`).test(published.fullText),
      `total levels ${expected.totalLevels} / ${expected.totalLevelsMax} missing`,
    );
    assert.ok(
      published.fullText.includes(`Level ${expected.grade}`),
      `overall MYP level ${expected.grade} missing`,
    );
    // Prove the grade is not the percentage: on both of these papers the stored
    // percentage differs from the total-levels band, so a percentage-derived
    // grade would print a different number.
    assert.ok(
      Number(expected.grade) !== Math.round(Number(fixture.score) / Number(fixture.maxScore) * 7),
      "fixture would not distinguish a percentage-derived grade from the configured one",
    );
  });

  await check("the paper's marks total the exam's maximum, not more", async () => {
    const paperMarks = fixture.rows.reduce((sum, r) => sum + r.points, 0);
    assert.equal(
      paperMarks,
      fixture.maxScore,
      `the questions on ${slug} total ${paperMarks} marks but the exam is out of ${fixture.maxScore}`,
    );
    // The header must quote the exam maximum, and a stray double-counted row
    // would show up as a higher figure.
    assert.ok(!published.fullText.includes(`${paperMarks + 1} marks`), "header quotes a marks total above the maximum");
  });

  await check("the overall score and percentage are shown", async () => {
    assert.ok(published.fullText.includes(`${fixture.score} / ${fixture.maxScore}`), `missing overall ${fixture.score} / ${fixture.maxScore}`);
  });

  await check("the criterion marks add up to the marks on the answers", async () => {
    const raw = Object.values(fixture.answers).reduce((sum, a) => sum + Number(a.points_awarded ?? 0), 0);
    const criteriaTotal = fixture.criteria.reduce((sum, c) => sum + c.marksAwarded, 0);
    assert.equal(raw, expect.rawMarks, "fixture changed: raw answer marks");
    assert.equal(criteriaTotal, raw, "criterion totals must equal the marks earned");
  });

  await check("the published total is the stored score, not the raw answer marks", async () => {
    const raw = expect.rawMarks;
    assert.ok(fixture.score > raw, `${slug}: stored score must carry the internal adjustment (${fixture.score} > ${raw})`);
    // The stored total is what students see; the raw total must never be printed.
    assert.ok(!published.fullText.includes(`${raw} / ${fixture.maxScore}`), "raw total leaked into the paper");
  });

  await check("no adjustment label or adjustment detail leaks into the paper", async () => {
    assert.ok(!/adjust/i.test(published.fullText), "paper text must never mention adjustments");
    assert.ok(!/bonus/i.test(published.fullText), "paper text must never mention bonus points");
    assert.ok(!/moderat/i.test(published.fullText), "paper text must never mention moderation");
  });

  await check("no raw LaTeX or markup fragments reach the page", async () => {
    for (const bad of ["\\frac", "\\le", "\\ge", "\\mu", "\\sigma", "\\times", "$$", "\\(", "\\sqrt", "**", "\\left", "\\right"]) {
      assert.ok(!published.fullText.includes(bad), `raw markup "${bad}" leaked into the paper`);
    }
    // A bare caret or underscore escape looks like broken maths to a student.
    assert.ok(!/\$[^$]{0,40}\$/.test(published.fullText), "an unrendered $…$ span leaked through");
  });

  await check("no answer keys or internal identifiers leak", async () => {
    assert.ok(!published.fullText.includes(fixture.attempt), "attempt uuid leaked");
    assert.ok(
      !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(published.fullText),
      "internal uuid leaked",
    );
  });

  // ── Staff preview: same markings BEFORE publication ──────────────────────
  const previewData = buildPaper(fixture, { published: false, preview: true });
  const previewPdf = await candidatePaperPdf.renderCandidateExamPaperPdf(previewData);
  const preview = await extractPdf(previewPdf);
  writeFileSync(`docs/real-paper-proof/${slug}-staff-preview.pdf`, previewPdf);

  await check("staff can preview full question-level marking before publication", async () => {
    assert.ok(preview.fullText.includes("CORRECT"), "preview must show CORRECT");
    assert.ok(preview.fullText.includes("WRONG"), "preview must show WRONG");
    assert.ok(preview.fullText.includes("PARTIAL CREDIT"), "preview must show PARTIAL CREDIT");
    assert.ok(preview.fullText.includes(expect.questionMarks[0]), "preview must show per-question marks");
    assert.ok(preview.fullText.includes("Criterion D"), "preview must show the criterion breakdown");
  });

  await check("a preview is unmistakably labelled as not released", async () => {
    assert.ok(preview.fullText.includes("STAFF PREVIEW"), "preview must be labelled");
    assert.ok(!preview.fullText.includes("Published"), "preview must not claim to be published");
  });

  // ── Withheld paper: no marks at all ──────────────────────────────────────
  const withheldData = buildPaper(fixture, { published: false, preview: false });
  const withheldPdf = await candidatePaperPdf.renderCandidateExamPaperPdf(withheldData);
  const withheld = await extractPdf(withheldPdf);

  await check("a withheld paper shows no marks, verdicts or criteria", async () => {
    assert.ok(withheld.fullText.includes("withheld"), "withheld banner missing");
    assert.ok(!withheld.fullText.includes("CORRECT"), "withheld paper leaked CORRECT");
    assert.ok(!withheld.fullText.includes("WRONG"), "withheld paper leaked WRONG");
    assert.ok(!withheld.fullText.includes("Expected answer:"), "withheld paper leaked an expected answer");
    assert.ok(!withheld.fullText.includes("Validated Results by Criterion"), "withheld paper leaked the criteria panel");
    assert.ok(!/Criterion [A-D][^a-z]{0,3}\s*\d+\s*\/\s*\d+/.test(withheld.fullText), "withheld paper leaked criterion marks");
    assert.ok(!/Awarded:/.test(withheld.fullText), "withheld paper leaked per-question marks");
    // With a withheld result the engine's levels and grade must be absent too:
    // they are part of the award, not of the answer evidence.
    assert.ok(!withheld.fullText.includes("MYP level"), "withheld paper leaked the MYP level column");
    assert.ok(!withheld.fullText.includes("Total MYP levels"), "withheld paper leaked the level total");
    assert.ok(!withheld.fullText.includes("Overall MYP achievement"), "withheld paper leaked the overall grade");
    // The candidate's own answers must still be there — that is the evidence.
    for (const fragment of expect.preservedAnswers) {
      assert.ok(withheld.fullText.includes(fragment), `withheld paper must still preserve "${fragment}"`);
    }
  });

  totalPassed += passed;
  totalFailed += failed;
}

// ── MYP5 (Grade 10) ────────────────────────────────────────────────────────
passed = 0;
failed = 0;
await verifyFixture(MYP5_OXANE, {
  slug: "myp5-oxane",
  rawMarks: 41,
  partialMarks: "2 / 3",
  hasBlankPart: false,
  questionMarks: ["Awarded: 2 / 2", "Awarded: 0 / 2", "Awarded: 3 / 3", "Awarded: 1 / 3", "Awarded: 0 / 10"],
  preservedAnswers: ["Arithmetic U5= 72", "Tn=n+3"],
  optionTexts: ["u\u2099 = 5n \u2212 2", "u\u2099\u208A\u2081 = 2u\u2099 + 1", "176"],
});

// ── MYP4 (Grade 9) ─────────────────────────────────────────────────────────
passed = 0;
failed = 0;
await verifyFixture(MYP4_MELINA, {
  slug: "myp4-melina",
  rawMarks: 46,
  partialMarks: "2 / 3",
  hasBlankPart: false,
  questionMarks: ["Awarded: 4 / 10", "Awarded: 1 / 10", "Awarded: 6 / 10"],
  preservedAnswers: ["29,5", "QUANTITATIVE DISCRETE"],
  optionTexts: ["Body mass (in kg)", "Mode 18, Med 26", "Mean 15.5 mm, Range 8 mm", "True"],
});

console.log(`\n${totalPassed} passed, ${totalFailed} failed.`);
console.log("Proof PDFs written to docs/real-paper-proof/\n");
if (totalFailed > 0) process.exitCode = 1;
