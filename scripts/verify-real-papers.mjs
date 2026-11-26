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
        content_doc: null,
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

function buildPaper(fixture, { published, preview }) {
  const settings = published ? { results_published: true } : {};
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
      title: "MYP5 Mathematics — Version C",
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
    quizSettings: { subject: "Mathematics", curriculum: "MYP 5", grade_level: "Grade 10" },
    className: "Grade 10 — MYP 5",
    orderedRows: toSessionRows(fixture),
    savedAnswers: toSavedAnswers(fixture),
    // Only handed to the builder when the caller is allowed to see marks.
    result: { published, criteria: fixture.criteria.map((c) => ({ ...c, percent: null })) },
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

const fixture = MYP5_OXANE;
const label = fixture.label;
console.log(`\nReal submission rendering — ${label}`);
console.log(`Candidate ${fixture.student} · stored total ${fixture.score}/${fixture.maxScore}\n`);

// ── The published paper: markings must be visibly present ──────────────────
const publishedData = buildPaper(fixture, { published: true, preview: false });
const publishedPdf = await candidatePaperPdf.renderCandidateExamPaperPdf(publishedData);
const published = await extractPdf(publishedPdf);

// Keep the real artefacts for inspection.
mkdirSync("docs/real-paper-proof", { recursive: true });
writeFileSync("docs/real-paper-proof/myp5-oxane-published.pdf", publishedPdf);

await check("real paper renders a multi-page A4 document", async () => {
  assert.ok(published.numPages >= 3, `expected several pages, got ${published.numPages}`);
});

await check("every marked question shows its awarded mark out of the maximum", async () => {
  // 12/2 scored 2/2, 11 scored 0/2, 16 scored 3/3, 19 scored 1/3 ...
  for (const expected of ["Awarded: 2 / 2", "Awarded: 0 / 2", "Awarded: 3 / 3", "Awarded: 1 / 3", "Awarded: 0 / 10"]) {
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
  // The verdict sits in the question header after the awarded marks once the
  // question block is drawn, so match the header marks and the verdict label
  // separately and require the per-part fractions to be present too.
  // Partial credit is a question-level verdict (2/3), because the school stored
  // whole marks per question and never a fraction per part.
  assert.ok(
    /Awarded: 2 \/ 3\s+·\s+PARTIAL CREDIT/.test(published.fullText),
    "partial credit must show marks awarded",
  );
  assert.ok(/[0-9]+\/[0-9]+\s+CORRECT/.test(published.fullText), "a part must read marks/total CORRECT");
  assert.ok(published.fullText.includes("WRONG"), "a part must read WRONG");
});

await check("a wrong multiple-choice answer names the expected answer", async () => {
  // Q11 keyed C, candidate chose A; Q20 keyed C, candidate chose A.
  assert.ok(published.fullText.includes("Expected answer:"), "missing expected answer for wrong choice");
  assert.ok(/Selected:\s*A/.test(published.fullText), "candidate's own choice must be preserved");
});

await check("wrong written parts print the expected value", async () => {
  // Q23 Row 1 asked for "Arithmetic, 2"; candidate wrote "Arithmetic U5= 72".
  assert.ok(published.fullText.includes("Arithmetic U5= 72"), "candidate's answer must be preserved verbatim");
  assert.ok(published.fullText.includes("Arithmetic, 2"), "expected answer must be shown for the wrong part");
});

await check("a wrong written answer is not credited just because it mentions the topic", async () => {
  // Q15 (ii) is keyed n^2 and the candidate wrote "Tn=n+3". The paper must show
  // 0/1 WRONG with the expected rule, never a passing mark for near wording.
  assert.ok(/0\/1\s+WRONG/.test(published.fullText), "Q15 (ii) must be marked 0/1 WRONG");
  assert.ok(published.fullText.includes("Tn=n+3"), "Q15 answer must be preserved");
  assert.ok(published.fullText.includes("Expected answer: n^2"), "Q15 must print the expected rule");
});

await check("marks a part cannot hold are disclosed in the question total", async () => {
  assert.ok(
    /2 of the 3 marks on this question were awarded for the answer as a whole/.test(published.fullText),
    "the unattributed marks must be disclosed, not dropped",
  );
});

await check("a blank part reads as not answered, never as allocated", async () => {
  assert.ok(/NOT ANSWERED/.test(published.fullText), "a blank part must read NOT ANSWERED");
});

await check("MYP criteria A, B, C and D are all shown with marks", async () => {
  for (const code of ["A", "B", "C", "D"]) {
    assert.ok(published.fullText.includes(`Criterion ${code}`), `missing Criterion ${code}`);
  }
  // Real per-criterion totals: A 15/32, B 8/24, C 9/20, D 9/24 (41 raw marks).
  assert.ok(/15\s*\/\s*32/.test(published.fullText), "criterion A marks 15/32 missing");
  assert.ok(/8\s*\/\s*24/.test(published.fullText), "criterion B marks 8/24 missing");
  assert.ok(/9\s*\/\s*20/.test(published.fullText), "criterion C marks 9/20 missing");
  assert.ok(/9\s*\/\s*24/.test(published.fullText), "criterion D marks 9/24 missing");
});

await check("the overall score and percentage are shown", async () => {
  assert.ok(published.fullText.includes("56 / 100"), "missing overall 56 / 100");
});

await check("the criterion marks add up to the marks on the answers", async () => {
  const raw = Object.values(fixture.answers).reduce((sum, a) => sum + Number(a.points_awarded ?? 0), 0);
  const criteriaTotal = fixture.criteria.reduce((sum, c) => sum + c.marksAwarded, 0);
  assert.equal(raw, 41, "fixture changed: raw answer marks");
  // A 15 + B 8 + C 9 + D 9 = 41, the marks earned on the paper.
  assert.equal(criteriaTotal, raw, "criterion totals must equal the marks earned");
});

await check("no adjustment label or adjustment detail leaks into the paper", async () => {
  assert.ok(!/adjust/i.test(published.fullText), "paper text must never mention adjustments");
  assert.ok(!/bonus/i.test(published.fullText), "paper text must never mention bonus points");
});

await check("no answer keys or internal identifiers leak", async () => {
  assert.ok(!published.fullText.includes(fixture.attempt), "attempt uuid leaked");
  assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(published.fullText), "internal uuid leaked");
});

// ── Staff preview: same markings BEFORE publication ────────────────────────
const previewData = buildPaper(fixture, { published: false, preview: true });
const previewPdf = await candidatePaperPdf.renderCandidateExamPaperPdf(previewData);
const preview = await extractPdf(previewPdf);
writeFileSync("docs/real-paper-proof/myp5-oxane-staff-preview.pdf", previewPdf);

await check("staff can preview full question-level marking before publication", async () => {
  assert.ok(preview.fullText.includes("CORRECT"), "preview must show CORRECT");
  assert.ok(preview.fullText.includes("WRONG"), "preview must show WRONG");
  assert.ok(preview.fullText.includes("PARTIAL CREDIT"), "preview must show PARTIAL CREDIT");
  assert.ok(preview.fullText.includes("Awarded: 2 / 2"), "preview must show per-question marks");
  assert.ok(preview.fullText.includes("Criterion D"), "preview must show the criterion breakdown");
});

await check("a preview is unmistakably labelled as not released", async () => {
  assert.ok(preview.fullText.includes("STAFF PREVIEW"), "preview must be labelled");
  assert.ok(!preview.fullText.includes("Published"), "preview must not claim to be published");
});

// ── Withheld paper: no marks at all ───────────────────────────────────────
const withheldData = buildPaper(fixture, { published: false, preview: false });
const withheldPdf = await candidatePaperPdf.renderCandidateExamPaperPdf(withheldData);
const withheld = await extractPdf(withheldPdf);

await check("a withheld paper shows no marks, verdicts or criteria", async () => {
  assert.ok(withheld.fullText.includes("withheld"), "withheld banner missing");
  assert.ok(!withheld.fullText.includes("CORRECT"), "withheld paper leaked CORRECT");
  assert.ok(!withheld.fullText.includes("WRONG"), "withheld paper leaked WRONG");
  assert.ok(!withheld.fullText.includes("Expected answer:"), "withheld paper leaked an expected answer");
  // Every question prompt legitimately names its criterion, so the leak test is
  // the results panel itself, not the words "Criterion A".
  assert.ok(!withheld.fullText.includes("Validated Results by Criterion"), "withheld paper leaked the criteria panel");
  assert.ok(!/Criterion [A-D][^a-z]{0,3}\s*\d+\s*\/\s*\d+/.test(withheld.fullText), "withheld paper leaked criterion marks");
  assert.ok(!/Awarded:/.test(withheld.fullText), "withheld paper leaked per-question marks");
  // The candidate's own answers must still be there — that is the evidence.
  assert.ok(withheld.fullText.includes("Arithmetic U5= 72"), "withheld paper must still preserve the answer");
});

console.log(`\n${passed} passed, ${failed} failed.`);
console.log("Proof PDFs written to docs/real-paper-proof/\n");
if (failed > 0) process.exitCode = 1;
