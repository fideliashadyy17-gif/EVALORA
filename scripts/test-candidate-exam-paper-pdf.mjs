/**
 * Individual Candidate Examination Paper PDF Download (ManageBac Evidence) test suite.
 *
 * Verifies:
 *  1. Pure candidate-paper builder across all EVALORA question & answer types,
 *     exact deterministic candidate option randomization, multi-part responses,
 *     blank/unanswered handling, and unpublished vs published results gating.
 *  2. Real A4 PDF generation via `pdf-lib` + independent text/geometry extraction
 *     via `pdfjs-dist` (A4 bounds, `Page X of Y` footers, non-empty pages,
 *     LaTeX/WinAnsi typography, native vector graphs/stats/diagrams/tables/images).
 *  3. Strict negative leakage guarantees: zero answer keys, model explanations,
 *     marking schemes, hidden hints, admin override notes, other candidates' data,
 *     proctoring/lockdown records, or internal DB UUIDs anywhere in the PDF.
 *  4. Filename sanitization against accents, path traversal, quotes, and CRLF.
 *  5. Security, authorization, IDOR, tenant isolation, read-only integrity, and UI
 *     wiring checks across both API routes and all candidate/staff interfaces.
 *
 * Run: node scripts/test-candidate-exam-paper-pdf.mjs
 */
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import ts from "typescript";

const outDir = "/tmp/evalora-candidate-paper-pdf-test";
execSync(`rm -rf ${outDir} && mkdir -p ${outDir}`);

// On-demand TS transpiler for pure src/lib modules
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
      tsCandidate = path.resolve(path.dirname(parentOrigRel), request + ".ts");
    } else if (request.startsWith("@/lib/")) {
      tsCandidate = path.resolve("src/lib", request.slice("@/lib/".length) + ".ts");
    }
    if (tsCandidate) {
      try {
        readFileSync(tsCandidate);
        return compileTsToCjs(tsCandidate);
      } catch {
        // fall through to default resolution
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

let passed = 0;
async function check(name, fn) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

async function extractPdfInfo(bytes) {
  const doc = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: true, isEvalSupported: false }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i);
    const vp = page.getViewport({ scale: 1 });
    const textContent = await page.getTextContent();
    const items = textContent.items
      .filter((item) => "str" in item && item.str.trim().length > 0)
      .map((item) => ({
        str: item.str,
        x: item.transform[4],
        y: item.transform[5],
        width: item.width ?? 0,
        height: item.height ?? 0,
      }));
    const text = textContent.items.map((item) => ("str" in item ? item.str : "")).join(" ");
    pages.push({ pageNumber: i, width: vp.width, height: vp.height, text, items });
  }
  return { numPages: doc.numPages, pages, fullText: pages.map((p) => p.text).join("\n") };
}

// 1x1 valid PNG data URL for embedded image testing
const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

const ATTEMPT_ID_A = "11111111-2222-4333-8444-555555555555";
const ATTEMPT_ID_B = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const EXAM_UUID = "cd000000-0000-4000-8000-000000000002";
const CANDIDATE_UUID = "99999999-8888-4777-8666-555555555555";

function buildFixtureRows() {
  return [
    {
      position: 0,
      points: 2,
      questions: {
        id: "q-uuid-1111-1111-1111-111111111111",
        type: "single_choice",
        prompt: "Evaluate $\\dfrac{3^2 + 7}{4}$ and choose the correct value.",
        prompt_doc: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                { type: "text", text: "Evaluate " },
                { type: "mathInline", attrs: { latex: "\\dfrac{3^2 + 7}{4}" } },
                { type: "text", text: " and choose the correct value." },
              ],
            },
          ],
        },
        explanation: "CANARY_MODEL_EXPLANATION_8822 — 9 + 7 = 16, divided by 4 = 4.",
        points: 2,
        config: {
          paper_section: "A",
          myp_criterion: "A",
          question_number: 1,
          marking_breakdown: "CANARY_MARKING_SCHEME_7733",
        },
        question_options: [
          { id: "opt-1", label: "3", is_correct: false, position: 0 },
          { id: "opt-2", label: "4 (CANARY_ANSWER_KEY_9911_NEVER_SHOW_AS_KEY)", is_correct: true, position: 1 },
          { id: "opt-3", label: "5", is_correct: false, position: 2 },
          { id: "opt-4", label: "6", is_correct: false, position: 3 },
        ],
      },
    },
    {
      position: 1,
      points: 3,
      questions: {
        id: "q-uuid-2222-2222-2222-222222222222",
        type: "multiple_select",
        prompt: "Select all prime numbers below.",
        prompt_doc: null,
        explanation: "CANARY_MODEL_EXPLANATION_PRIME",
        points: 3,
        config: { paper_section: "A", myp_criterion: "A", question_number: 2 },
        question_options: [
          { id: "ms-1", label: "2", is_correct: true, position: 0 },
          { id: "ms-2", label: "4", is_correct: false, position: 1 },
          { id: "ms-3", label: "7", is_correct: true, position: 2 },
          { id: "ms-4", label: "9", is_correct: false, position: 3 },
        ],
      },
    },
    {
      position: 2,
      points: 4,
      questions: {
        id: "q-uuid-3333-3333-3333-333333333333",
        type: "assess_parts",
        prompt: "Study the graph and table, then answer parts (a) and (b).",
        prompt_doc: {
          type: "doc",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "Study the linear graph and grid pattern below." }] },
            {
              type: "graphBlock",
              attrs: {
                spec: {
                  version: 1,
                  title: "Linear Graph y = 2x - 1",
                  domain: { xMin: -5, xMax: 5, yMin: -6, yMax: 6, showGrid: true, showAxes: true },
                  functions: [{ id: "f1", expression: "2x - 1", label: "y = 2x - 1", color: "#0a5c36", style: "solid", width: 2, visible: true }],
                  points: [{ id: "p1", x: 1, y: 1, label: "P(1,1)", color: "#c23d3d", visible: true }],
                  segments: [],
                  annotations: [],
                  strokes: [],
                  regions: [],
                },
              },
            },
            {
              type: "assessDiagramBlock",
              attrs: {
                spec: {
                  version: 1,
                  kind: "grid_pattern",
                  title: "Tile Border Pattern",
                  gridPatterns: [
                    { label: "n = 1", cols: 3, rows: 3, style: "core_border" },
                    { label: "n = 2", cols: 4, rows: 4, style: "core_border" },
                  ],
                },
              },
            },
            {
              type: "image",
              attrs: { src: TINY_PNG, alt: "Tiny embedded proof graphic", caption: "Figure 1: Embedded diagram" },
            },
            {
              type: "image",
              attrs: { src: "https://untrusted.example.com/blocked.webp", alt: "Blocked WebP chart", caption: "Unsupported external image" },
            },
          ],
        },
        points: 4,
        config: {
          paper_section: "B",
          myp_criterion: "B",
          question_number: 3,
          parts: [
            {
              id: "a",
              label: "(a)",
              prompt: "Find the gradient $m$ of the line.",
              kind: "numeric",
              points: 2,
              answer: "CANARY_PART_KEY_2",
              hint: "CANARY_HIDDEN_HINT_6644",
            },
            {
              id: "b",
              label: "(b)",
              prompt: "State the $y$-intercept.",
              kind: "numeric",
              points: 2,
              answer: "-1",
            },
          ],
        },
        question_options: [],
      },
    },
    {
      position: 3,
      points: 4,
      questions: {
        id: "q-uuid-4444-4444-4444-444444444444",
        type: "matching",
        prompt: "Match each formula to its geometric name.",
        prompt_doc: {
          type: "doc",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "Match each formula to its geometric name." }] },
            {
              type: "statsBlock",
              attrs: {
                spec: {
                  version: 1,
                  chart: "histogram",
                  title: "Grouped Height Distribution",
                  xLabel: "Height (cm)",
                  yLabel: "Frequency density",
                  dataMode: "grouped",
                  groups: [
                    { id: "g1", from: 140, to: 150, frequency: 10 },
                    { id: "g2", from: 150, to: 170, frequency: 30 },
                  ],
                  values: [],
                  categories: [],
                },
              },
            },
            {
              type: "assessDiagramBlock",
              attrs: {
                spec: {
                  version: 1,
                  kind: "stem_leaf",
                  title: "Class Test Scores",
                  stemRows: [
                    { stem: "6", leaves: ["2", "5", "8"] },
                    { stem: "7", leaves: ["0", "4"] },
                  ],
                  stemKey: "6 | 2 means 62 marks",
                },
              },
            },
          ],
        },
        points: 4,
        config: {
          paper_section: "B",
          myp_criterion: "C",
          question_number: 4,
          pairs: [
            { left: "pi r^2", right: "Area of circle" },
            { left: "2 pi r", right: "Circumference" },
          ],
        },
        question_options: [],
      },
    },
    {
      position: 4,
      points: 3,
      questions: {
        id: "q-uuid-5555-5555-5555-555555555555",
        type: "open_ended",
        prompt: "Explain how you modeled the real-life situation and draw a Venn summary.",
        prompt_doc: {
          type: "doc",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "Explain how you modeled the real-life situation." }] },
            {
              type: "table",
              content: [
                {
                  type: "tableRow",
                  content: [
                    { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "Month" }] }] },
                    { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "Sales ($)" }] }] },
                  ],
                },
                {
                  type: "tableRow",
                  content: [
                    { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "January" }] }] },
                    { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "120" }] }] },
                  ],
                },
              ],
            },
          ],
        },
        points: 3,
        config: { paper_section: "B", myp_criterion: "D", question_number: 5 },
        question_options: [],
      },
    },
    {
      position: 5,
      points: 2,
      questions: {
        id: "q-uuid-6666-6666-6666-666666666666",
        type: "numeric",
        prompt: "Calculate the perimeter of a square of side $5\\text{ cm}$.",
        prompt_doc: null,
        points: 2,
        config: {
          paper_section: "B",
          myp_criterion: "A",
          question_number: 6,
          answer: "CANARY_NUMERIC_ANSWER_20_KEY",
        },
        question_options: [],
      },
    },
  ];
}

// Note: keep opt-2 clean in option label while putting key only in hidden config/explanation
function cleanRows() {
  const rows = buildFixtureRows();
  rows[0].questions.question_options[1].label = "4";
  rows[0].questions.config.accepted = ["CANARY_ANSWER_KEY_9911"];
  return rows;
}

const sampleAnswers = [
  {
    question_id: "q-uuid-1111-1111-1111-111111111111",
    answer: { option_id: "opt-1" }, // student chose "3" (NOT the key "4")
    points_awarded: 0,
    marker_note: "Check the numerator addition carefully.",
    grading_note: null,
  },
  {
    question_id: "q-uuid-2222-2222-2222-222222222222",
    answer: { option_ids: ["ms-1", "ms-3"] },
    points_awarded: 3,
    marker_note: "CANARY_ADMIN_OVERRIDE_5555",
    grading_note: "CANARY_ADMIN_OVERRIDE_5555", // equal -> internal override note, MUST NOT LEAK
  },
  {
    question_id: "q-uuid-3333-3333-3333-333333333333",
    answer: {
      parts: { a: "2" }, // part (b) left blank intentionally!
      working: "Rise over run = (3 - 1) / (2 - 1) = 2.",
    },
    points_awarded: 2,
    marker_note: "Clear gradient calculation; remember to complete part (b).",
    grading_note: null,
  },
  {
    question_id: "q-uuid-4444-4444-4444-444444444444",
    answer: {
      pairs: [
        { left: "pi r^2", right: "Area of circle" },
        { left: "2 pi r", right: "Circumference" },
      ],
    },
    points_awarded: 4,
    marker_note: null,
    grading_note: null,
  },
  {
    question_id: "q-uuid-5555-5555-5555-555555555555",
    answer: {
      text: "The model grows linearly by 15 dollars per month.",
      venn: {
        version: 1,
        sets: 2,
        labels: ["Math", "Science"],
        universalLabel: "U",
        regions: { A: "12", B: "8", AnB: "5", neither: "3" },
        items: [],
        title: "Club Membership",
        instructions: "",
        showCounts: true,
      },
      stem_leaf: {
        version: 1,
        layout: "standard",
        title: "Candidate Stem Plot",
        stemLabel: "Stem",
        leafLabel: "Leaves",
        leftLeafLabel: "",
        rightLeafLabel: "",
        key: "4 | 5 = 45",
        rows: [{ id: "r1", stem: "4", leaves: "5 8" }],
      },
    },
    points_awarded: 3,
    marker_note: null,
    grading_note: null,
  },
  // Question 6 intentionally omitted from savedAnswers -> unanswered!
];

console.log("\nIndividual Candidate Examination Paper PDF Tests\n");

/* ─── 1. Filename Sanitization ──────────────────────────────────────── */

await check("filename builder produces ManageBac-friendly sanitized names", () => {
  const f1 = candidatePaper.buildCandidatePaperFilename({
    className: "Grade 9 — MYP 4",
    gradeLabel: "MYP 4",
    examTitle: "MYP 4 (Grade 9) Mathematics — End of First Term Summative Assessment (Version C)",
    subject: "Mathematics",
    candidateFullName: "Mélina OUSSOU",
  });
  assert.equal(f1, "EVALORA_MYP4_Mathematics_Melina_OUSSOU_Exam.pdf");

  const f2 = candidatePaper.buildCandidatePaperFilename({
    className: "Grade 10 — MYP 5",
    gradeLabel: "MYP 5",
    examTitle: "MYP 5 (Grade 10) Mathematics — End of First Term E-assessment (Version C)",
    subject: "Mathematics",
    candidateFullName: "../../Zoé \"Sèwa\"\r\nKODINGAR; rm -rf /",
  });
  assert.ok(f2.startsWith("EVALORA_MYP5_Mathematics_"));
  assert.ok(f2.endsWith("_Exam.pdf"));
  assert.doesNotMatch(f2, /[\/\\"\r\n;]/);
  assert.ok(f2.length <= 120);
});

/* ─── 2. Deterministic Candidate Option Randomization ─────────────────── */

await check("MCQ option order is deterministically reconstructed per candidate attempt seed", () => {
  const rows = cleanRows();
  const baseInput = {
    exam: {
      title: "MYP 4 (Grade 9) Mathematics — End of First Term Summative Assessment (Version C)",
      duration_minutes: 100,
      settings: {
        randomize_options: true,
        results_published: false,
        sections: [
          { id: "A", title: "SECTION A", marks: 5 },
          { id: "B", title: "SECTION B", marks: 13 },
        ],
      },
    },
    candidate: { full_name: "Mélina OUSSOU", first_name: "Mélina", last_name: "OUSSOU" },
    organization: { name: "Oak International School", logo_url: null },
    quizSettings: { subject: "Mathematics", curriculum: "MYP 4", grade_level: "Grade 9" },
    className: "Grade 9 — MYP 4",
    orderedRows: rows,
    savedAnswers: sampleAnswers,
  };

  const paperA1 = candidatePaper.buildCandidatePaperData({
    ...baseInput,
    attempt: { id: ATTEMPT_ID_A, status: "submitted", submitted_at: "2026-11-26T08:42:00Z", score: 12, max_score: 18 },
  });
  const paperA2 = candidatePaper.buildCandidatePaperData({
    ...baseInput,
    attempt: { id: ATTEMPT_ID_A, status: "submitted", submitted_at: "2026-11-26T08:42:00Z", score: 12, max_score: 18 },
  });
  const paperB = candidatePaper.buildCandidatePaperData({
    ...baseInput,
    attempt: { id: ATTEMPT_ID_B, status: "submitted", submitted_at: "2026-11-26T08:42:00Z", score: 12, max_score: 18 },
  });

  // Same attempt produces byte-identical option order
  assert.deepEqual(
    paperA1.questions[0].options.map((o) => o.label),
    paperA2.questions[0].options.map((o) => o.label),
  );
  // Candidate's chosen option ("3") is marked selected regardless of shuffled position
  const chosenA = paperA1.questions[0].options.find((o) => o.selectedByCandidate);
  assert.equal(chosenA?.label, "3");
  assert.equal(paperA1.questions[0].answer.selectedOptions[0]?.letter, chosenA?.letter);
  // No option carries `is_correct`
  for (const opt of paperA1.questions[0].options) {
    assert.equal("is_correct" in opt, false);
  }
  // Across distinct attempts at least one MCQ order differs (deterministic seeded shuffle)
  const seqA = paperA1.questions.slice(0, 2).flatMap((q) => q.options.map((o) => o.label));
  const seqB = paperB.questions.slice(0, 2).flatMap((q) => q.options.map((o) => o.label));
  assert.notDeepEqual(seqA, seqB);
});

/* ─── 3. Unpublished Paper PDF Generation, Visual Layout & Zero Leakage ─ */

await check("unpublished candidate PDF renders valid A4 document with zero scores, keys, or internal IDs", async () => {
  const data = candidatePaper.buildCandidatePaperData({
    attempt: {
      id: ATTEMPT_ID_A,
      status: "auto_submitted",
      started_at: "2026-11-26T07:25:00Z",
      submitted_at: "2026-11-26T09:05:00Z",
      score: 12,
      max_score: 18,
      first_name: "Mélina",
      last_name: "OUSSOU",
    },
    exam: {
      title: "MYP 4 (Grade 9) Mathematics — End of First Term Summative Assessment (Version C)",
      duration_minutes: 100,
      settings: {
        randomize_options: true,
        results_published: false,
        sections: [
          { id: "A", title: "SECTION A", instructions: "Answer all questions.", marks: 5 },
          { id: "B", title: "SECTION B", instructions: "Show full working.", marks: 13 },
        ],
      },
    },
    candidate: { full_name: "Mélina OUSSOU", first_name: "Mélina", last_name: "OUSSOU" },
    organization: { name: "Oak International School", logo_url: null },
    quizSettings: { subject: "Mathematics", curriculum: "MYP 4", grade_level: "Grade 9" },
    className: "Grade 9 — MYP 4",
    orderedRows: cleanRows(),
    savedAnswers: sampleAnswers,
  });

  // Unpublished gate assertions on data model
  assert.equal(data.header.resultsPublished, false);
  assert.equal(data.header.score, null);
  assert.equal(data.header.maxScore, null);
  assert.equal(data.header.percentage, null);
  assert.equal(data.header.examVersion, "Version C");
  assert.equal(data.header.subject, "Mathematics");
  assert.equal(data.header.answeredCount, 5);
  assert.equal(data.header.questionCount, 6);
  for (const q of data.questions) {
    assert.equal(q.awardedMarks, null);
    assert.equal(q.teacherFeedback, null);
  }

  const pdfBytes = await candidatePaperPdf.renderCandidateExamPaperPdf(data);
  assert.ok(pdfBytes.byteLength > 4000, "PDF must be a real non-trivial PDF document");
  assert.equal(Buffer.from(pdfBytes.slice(0, 5)).toString("ascii"), "%PDF-");

  const info = await extractPdfInfo(pdfBytes);
  assert.ok(info.numPages >= 2, `Expected multi-page A4 paper, got ${info.numPages}`);

  // Verify exact A4 dimensions & page numbering on EVERY page
  for (const p of info.pages) {
    assert.ok(Math.abs(p.width - 595.28) < 1, `Page ${p.pageNumber} width must be A4`);
    assert.ok(Math.abs(p.height - 841.89) < 1, `Page ${p.pageNumber} height must be A4`);
    assert.ok(p.text.trim().length > 20, `Page ${p.pageNumber} must not be blank`);
    assert.ok(p.text.includes(`Page ${p.pageNumber} of ${info.numPages}`), `Missing footer on page ${p.pageNumber}`);
  }

  // Positive content checks
  assert.ok(info.fullText.includes("EVALORA"));
  assert.ok(info.fullText.includes("Oak International School"));
  assert.ok(info.fullText.includes("Mélina OUSSOU"), "Accented student name must render cleanly in WinAnsi");
  assert.ok(info.fullText.includes("Grade 9 — MYP 4"));
  assert.ok(info.fullText.includes("Version C"));
  assert.ok(info.fullText.includes("Mathematics"));
  assert.ok(info.fullText.includes("Auto-submitted"));
  assert.ok(info.fullText.includes("Pending publication"));
  assert.ok(info.fullText.includes("SECTION A"));
  assert.ok(info.fullText.includes("SECTION B"));
  assert.ok(info.fullText.includes("(3² + 7)/4"), "LaTeX fraction & exponent must render cleanly");
  assert.ok(info.fullText.includes("Rise over run = (3 - 1) / (2 - 1) = 2."));
  assert.ok(info.fullText.includes("Area of circle"));
  assert.ok(info.fullText.includes("The model grows linearly by 15 dollars per month."));
  assert.ok(info.fullText.includes("No answer submitted."), "Blank part/question must say 'No answer submitted.'");
  assert.ok(info.fullText.includes("Unsupported external image"), "Unsupported image must show visible fallback");

  // Strict negative leakage checks (zero keys, zero scores, zero internal IDs)
  const forbidden = [
    "CANARY_ANSWER_KEY_9911",
    "CANARY_MODEL_EXPLANATION_8822",
    "CANARY_MODEL_EXPLANATION_PRIME",
    "CANARY_MARKING_SCHEME_7733",
    "CANARY_PART_KEY_2",
    "CANARY_HIDDEN_HINT_6644",
    "CANARY_ADMIN_OVERRIDE_5555",
    "CANARY_NUMERIC_ANSWER_20_KEY",
    "Check the numerator addition carefully.", // unpublished -> no teacher feedback!
    "Awarded:", // unpublished -> no per-question marks!
    "12 / 18", // unpublished -> no overall score!
    ATTEMPT_ID_A,
    EXAM_UUID,
    CANDIDATE_UUID,
    "q-uuid-1111",
    "proctoring",
    "Lockdown Browser",
  ];
  for (const needle of forbidden) {
    assert.equal(info.fullText.includes(needle), false, `FORBIDDEN LEAK DETECTED in unpublished PDF: ${needle}`);
  }
});

/* ─── 4. Published Paper PDF (Scores + Genuine Feedback, STILL Zero Keys) ─ */

await check("published candidate PDF includes score & genuine teacher feedback while STILL blocking keys & admin override notes", async () => {
  const data = candidatePaper.buildCandidatePaperData({
    attempt: {
      id: ATTEMPT_ID_A,
      status: "marked",
      submitted_at: "2026-11-26T09:05:00Z",
      score: 12,
      max_score: 18,
      first_name: "Zoé",
      last_name: "KODINGAR",
    },
    exam: {
      title: "MYP 5 (Grade 10) Mathematics — End of First Term E-assessment (Version C)",
      duration_minutes: 100,
      settings: { randomize_options: true, results_published: true },
    },
    candidate: { full_name: "Zoé KODINGAR", first_name: "Zoé", last_name: "KODINGAR" },
    organization: { name: "Oak International School", logo_url: null },
    quizSettings: { subject: "Mathematics", curriculum: "MYP 5", grade_level: "Grade 10" },
    className: "Grade 10 — MYP 5",
    orderedRows: cleanRows(),
    savedAnswers: sampleAnswers,
  });

  const pdfBytes = await candidatePaperPdf.renderCandidateExamPaperPdf(data);
  const info = await extractPdfInfo(pdfBytes);

  // Published marks & genuine teacher feedback appear
  assert.ok(info.fullText.includes("12 / 18 (66.7%)"));
  assert.ok(info.fullText.includes("Awarded: 0 / 2"));
  assert.ok(info.fullText.includes("Awarded: 2 / 4"));
  assert.ok(info.fullText.includes("Check the numerator addition carefully."));
  assert.ok(info.fullText.includes("Clear gradient calculation; remember to complete part (b)."));

  // STILL strictly excludes answer keys, explanations, marking schemes, hints, admin overrides, and UUIDs!
  const stillForbidden = [
    "CANARY_ANSWER_KEY_9911",
    "CANARY_MODEL_EXPLANATION_8822",
    "CANARY_MARKING_SCHEME_7733",
    "CANARY_PART_KEY_2",
    "CANARY_HIDDEN_HINT_6644",
    "CANARY_ADMIN_OVERRIDE_5555",
    "CANARY_NUMERIC_ANSWER_20_KEY",
    ATTEMPT_ID_A,
    EXAM_UUID,
  ];
  for (const needle of stillForbidden) {
    assert.equal(info.fullText.includes(needle), false, `FORBIDDEN LEAK DETECTED in published PDF: ${needle}`);
  }
});

/* ─── 5. Security, Read-Only Integrity, Tenant Isolation & UI Wiring ── */

const src = (p) => readFileSync(p, "utf8");
const candidateRoute = src("src/app/api/exam/candidate-paper/route.ts");
const staffRoute = src("src/app/api/dashboard/exams/[id]/attempts/[attemptId]/paper-pdf/route.ts");
const loaderLib = src("src/lib/candidatePaper.ts");
const pdfLib = src("src/lib/candidatePaperPdf.ts");

await check("candidate paper loader, renderer, and API routes are strictly READ-ONLY (zero DB writes)", () => {
  for (const [label, code] of [
    ["candidatePaper.ts", loaderLib],
    ["candidatePaperPdf.ts", pdfLib],
    ["candidate-paper route", candidateRoute],
    ["staff paper-pdf route", staffRoute],
  ]) {
    assert.doesNotMatch(code, /\.(insert|update|delete|upsert)\s*\(/, `${label} must NEVER write to DB`);
    assert.doesNotMatch(code, /\.rpc\s*\(/, `${label} must NEVER invoke mutating RPCs`);
    assert.doesNotMatch(code, /proctoring_incidents|exam_lockdown_challenges|exam_presence/, `${label} must NEVER read proctoring/lockdown tables`);
    assert.doesNotMatch(code, /answerReveal|releasedFeedback/, `${label} must NEVER invoke answer-key reveal helpers`);
  }
});

await check("candidate API route enforces token/student ownership, anti-IDOR, submission gate, and no-store headers", () => {
  assert.match(candidateRoute, /\.eq\("access_token", token\)/);
  assert.match(candidateRoute, /attemptIdParam && attempt\.id !== attemptIdParam/);
  assert.match(candidateRoute, /\.eq\("user_id", ctx\.profile\.id\)/);
  assert.match(candidateRoute, /attempt\.student_id \|\| !studentIds\.has/);
  assert.match(candidateRoute, /examOrg\.organization_id !== org\.id/);
  assert.match(candidateRoute, /isAttemptEligibleForPaperPdf/);
  assert.match(candidateRoute, /Cache-Control.*private, no-store, max-age=0/);
  assert.match(candidateRoute, /X-Content-Type-Options.*nosniff/);
  assert.match(candidateRoute, /Content-Type.*application\/pdf/);
});

await check("staff API route enforces auth (401), tenant boundary (404), non-learner check, and centralized RBAC canOperate", () => {
  assert.match(staffRoute, /getSessionContext\(\)/);
  assert.match(staffRoute, /errorResponse\(401,/);
  assert.match(staffRoute, /ctx\.memberships\.find\(\(m\) => m\.organization_id === orgId\)/);
  assert.match(staffRoute, /isMypLearner\(membership\.role\)/);
  assert.match(staffRoute, /canOperate\(ctx, orgId, "results\.view", "exam_results"\)/);
  assert.match(staffRoute, /\.eq\("id", attemptId\)\s*\.eq\("exam_id", examId\)/);
  assert.match(staffRoute, /isAttemptEligibleForPaperPdf\(attempt\.status\)/);
  assert.match(staffRoute, /Cache-Control.*private, no-store, max-age=0/);
});

await check("UI buttons are wired into Candidate Link, Post-Submission, Student Portal, and Teacher/Admin views", () => {
  assert.match(src("src/app/exam/result/[token]/page.tsx"), /Download My Exam \(PDF\)/);
  assert.match(src("src/app/exam/result/[token]/page.tsx"), /CandidatePaperDownloadButton/);
  assert.match(src("src/app/take-exam/[attemptId]/TakeExamClient.tsx"), /Download My Exam \(PDF\)/);
  assert.match(src("src/app/student/page.tsx"), /Download My Exam \(PDF\)/);
  assert.match(src("src/app/student/results/[attemptId]/page.tsx"), /Download My Exam \(PDF\)/);
  assert.match(src("src/app/dashboard/exams/[id]/page.tsx"), /Download Candidate Paper \(PDF\)/);
  assert.match(src("src/app/dashboard/results/page.tsx"), /Download Candidate Paper \(PDF\)/);
  assert.match(src("src/app/dashboard/reports/exam/[id]/page.tsx"), /Download Candidate Paper \(PDF\)/);
  assert.match(src("src/app/dashboard/myp-results/[attemptId]/page.tsx"), /Download Candidate Paper \(PDF\)/);
  assert.match(src("src/app/dashboard/exams/[id]/monitor/ExamMonitor.tsx"), /Download Candidate Paper \(PDF\)/);
});

await check("download component passes candidate token via Authorization header (not URL query) and guards double clicks", () => {
  const btn = src("src/components/CandidatePaperDownloadButton.tsx");
  assert.match(btn, /headers\.Authorization = `Bearer \$\{props\.token\}`/);
  assert.match(btn, /inFlight\.current/);
  assert.match(btn, /cache: "no-store"/);
  assert.doesNotMatch(btn, /useEffect/);
});

/* ─── 6. Real Oak MYP4/MYP5 Shapes, Performance & Geometric Bounds ──── */

await check("Oak MYP4/5 real option content_doc, part-map working, **bold** cleanup, 34-question stress & A4 clipping checks", async () => {
  const oakStyleRows = Array.from({ length: 34 }, (_, idx) => {
    const qId = `cd000000-0000-4000-8000-000000001${String(idx + 1).padStart(3, "0")}`;
    if (idx % 3 === 0) {
      return {
        id: `qq-${idx + 1}`,
        position: idx + 1,
        points: 2,
        questions: {
          id: qId,
          type: "single_choice",
          prompt: `Q${idx + 1}: Which variable is **quantitative continuous**?`,
          prompt_doc: {
            type: "doc",
            content: [{ type: "paragraph", content: [{ type: "text", text: `Which variable is **quantitative continuous** for item ${idx + 1}?` }] }],
          },
          explanation: `CANARY_OAK_EXPL_${idx}`,
          points: 2,
          config: { paper_section: idx < 20 ? "A" : "B", myp_criterion: "A", question_number: idx + 1 },
          question_options: [
            { id: `${qId}-a`, label: "A", position: 0, is_correct: false, content_doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Blood group (A, B, AB, O)" }] }] } },
            { id: `${qId}-b`, label: "B", position: 1, is_correct: false, content_doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Number of siblings" }] }] } },
            { id: `${qId}-c`, label: "C", position: 2, is_correct: true, content_doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Body mass (in kg)" }] }] } },
            { id: `${qId}-d`, label: "D", position: 3, is_correct: false, content_doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Clinic ward code" }] }] } },
          ],
        },
      };
    }
    return {
      id: `qq-${idx + 1}`,
      position: idx + 1,
      points: 3,
      questions: {
        id: qId,
        type: "assess_parts",
        prompt: `Synthesize statistics for task ${idx + 1}.`,
        prompt_doc: {
          type: "doc",
          content: [
            { type: "paragraph", content: [{ type: "text", text: `**(a)** Compute frequency density for task ${idx + 1}.` }] },
            ...(idx === 1
              ? [
                  {
                    type: "statsBlock",
                    attrs: {
                      spec: {
                        version: 1,
                        chart: "histogram",
                        title: "Waiting times at a pharmacy",
                        xLabel: "Wait time t (min)",
                        yLabel: "Frequency",
                        dataMode: "grouped",
                        groups: [
                          { id: "g0", from: 0, to: 5, frequency: 6 },
                          { id: "g1", from: 5, to: 10, frequency: 14 },
                          { id: "g2", from: 10, to: 15, frequency: 12 },
                          { id: "g3", from: 15, to: 20, frequency: 8 },
                        ],
                        values: [],
                        categories: [],
                      },
                    },
                  },
                ]
              : []),
          ],
        },
        points: 3,
        config: {
          paper_section: idx < 20 ? "A" : "B",
          myp_criterion: "C",
          question_number: idx + 1,
          ...(idx === 1
            ? {
                response_stem_leaf: {
                  starter: {
                    version: 1,
                    layout: "back_to_back",
                    title: "UNTOUCHED_STARTER_SHOULD_NOT_PRINT",
                    stemLabel: "Stem",
                    leafLabel: "Leaf",
                    leftLeafLabel: "Before",
                    rightLeafLabel: "After",
                    key: "",
                    rows: [{ id: "r11", stem: "11", leaves: "", leftLeaves: "", rightLeaves: "" }],
                  },
                },
              }
            : {}),
          parts: [
            { id: "a", label: "(a)", prompt: "Frequency density", kind: "numeric", points: 1, answer: "1.5" },
            { id: "b", label: "(b)", prompt: "Class width", kind: "numeric", points: 2, answer: "15" },
          ],
        },
        question_options: [],
      },
    };
  });

  const oakAnswers = oakStyleRows.map((row, idx) => {
    if (idx % 3 === 0) {
      return { question_id: row.questions.id, answer: { option_id: `${row.questions.id}-c` }, points_awarded: 2 };
    }
    if (idx === 1) {
      // Real Oak MYP4 C nested workspace inside `working[partId]`:
      // - `a` has filled back-to-back stem-and-leaf plot + typed math working
      // - `b` has ONLY an untouched blank starter stem-and-leaf (must NOT clutter PDF)
      return {
        question_id: row.questions.id,
        answer: {
          parts: { a: "1.5", b: "15" },
          working: {
            a: {
              version: 1,
              text: "15 / 10 = 1.5",
              doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "FD = 15 / 10 = 1.5" }] }] },
              stem_leaf: {
                version: 1,
                layout: "back_to_back",
                title: "Before and after broad-jump distances (cm)",
                stemLabel: "Stem",
                leafLabel: "Leaf",
                leftLeafLabel: "Before",
                rightLeafLabel: "After",
                key: "Dual key: 5 | 11 | 8 means 115 cm before and 118 cm after",
                rows: [
                  { id: "r11", stem: "11", leaves: "", leftLeaves: "5,9,8", rightLeaves: "" },
                  { id: "r12", stem: "12", leaves: "", leftLeaves: "8,2,5,4", rightLeaves: "9,8" },
                  { id: "r13", stem: "13", leaves: "", leftLeaves: "1,5", rightLeaves: "6,3,9" },
                ],
              },
            },
            b: {
              version: 1,
              text: "",
              doc: { type: "doc", content: [{ type: "paragraph" }] },
              stem_leaf: {
                version: 1,
                layout: "back_to_back",
                title: "UNTOUCHED_STARTER_SHOULD_NOT_PRINT",
                stemLabel: "Stem",
                leafLabel: "Leaf",
                leftLeafLabel: "Before",
                rightLeafLabel: "After",
                key: "",
                rows: [{ id: "r11", stem: "11", leaves: "", leftLeaves: "", rightLeaves: "" }],
              },
            },
          },
        },
        points_awarded: 3,
      };
    }
    if (idx === 2) {
      // Real Oak MYP4 C case: empty `parts: {}`, student filled ONLY a data_table inside `working.b`
      return {
        question_id: row.questions.id,
        answer: {
          parts: {},
          working: {
            b: {
              version: 1,
              text: "",
              doc: { type: "doc", content: [{ type: "paragraph" }] },
              data_table: {
                version: 1,
                title: "Frequency Table Work",
                columns: ["Interval", "Density"],
                rows: [["0 <= t < 10", "1.5"], ["10 <= t < 25", "2.4"]],
                rowHeaders: false,
              },
            },
          },
        },
        points_awarded: 0,
      };
    }
    return idx % 6 === 1
      ? { question_id: row.questions.id, answer: { parts: { a: "1.5", b: "15" }, working: { a: "15 / 10 = 1.5" } }, points_awarded: 3 }
      : { question_id: row.questions.id, answer: { parts: { a: "1.5" }, working: {} }, points_awarded: 1 };
  });

  const t0 = performance.now();
  const data = candidatePaper.buildCandidatePaperData({
    attempt: {
      id: ATTEMPT_ID_A,
      status: "submitted",
      started_at: "2026-11-26T07:48:29Z",
      submitted_at: "2026-11-26T09:45:22Z",
      score: 64,
      max_score: 100,
      first_name: "VERA LIZ",
      last_name: "LELE NGUEMETA",
    },
    exam: {
      title: "MYP 4 (Grade 9) Mathematics — End of First Term Summative Assessment (Version C)",
      duration_minutes: 120,
      settings: {
        randomize_options: true,
        results_published: false,
        sections: [
          { id: "A", marks: 60, title: "SECTION A — MULTIPLE CHOICE QUESTIONS" },
          { id: "B", marks: 40, title: "SECTION B — THEORY QUESTIONS" },
        ],
      },
    },
    candidate: { full_name: "VERA LIZ LELE NGUEMETA", first_name: "VERA LIZ", last_name: "LELE NGUEMETA" },
    organization: { name: "Oak International School", logo_url: "/brand/oak-international-school-logo.webp" },
    quizSettings: { subject: "Mathematics", curriculum: "MYP 4", grade_level: "Grade 9" },
    className: "Grade 9 — MYP 4",
    orderedRows: oakStyleRows,
    savedAnswers: oakAnswers,
  });
  const pdfBytes = await candidatePaperPdf.renderCandidateExamPaperPdf(data);
  const elapsedMs = performance.now() - t0;

  assert.ok(elapsedMs < 2000, `34-question full PDF should generate fast (< 2000ms), took ${elapsedMs.toFixed(1)}ms`);
  assert.equal(data.filename, "EVALORA_MYP4_Mathematics_VERA_LIZ_LELE_NGUEMETA_Exam.pdf");

  const info = await extractPdfInfo(pdfBytes);
  // Option text must show "Body mass (in kg)" (NEVER raw "Selected: B. C" or "**quantitative")
  assert.ok(info.fullText.includes("Body mass (in kg)"));
  assert.equal(info.fullText.includes("**quantitative"), false, "Markdown ** must be cleaned");
  assert.ok(info.fullText.includes("Working shown for (a):"), "Per-part working heading must render cleanly");
  assert.ok(info.fullText.includes("FD = 15 / 10 = 1.5"), "Per-part rich-text working must render cleanly");
  assert.ok(info.fullText.includes("Before and after broad-jump distances (cm)"), "Per-part back-to-back stem-and-leaf must render cleanly");
  assert.equal(info.fullText.includes("UNTOUCHED_STARTER_SHOULD_NOT_PRINT"), false, "Empty starter stem-and-leaf must not clutter PDF");
  assert.ok(info.fullText.includes("Frequency Table Work"), "Working-only data_table must render even when typed parts are empty");
  assert.equal(data.questions[2].answer.answered, true, "Question with per-part working workspace only must count as answered");
  assert.equal(info.fullText.includes("CANARY_OAK_EXPL_"), false, "No explanation leaks");

  // Geometric clipping check across ALL pages
  for (const p of info.pages) {
    assert.ok(p.text.trim().length > 25, `No blank page on page ${p.pageNumber}`);
    for (const item of p.items) {
      assert.ok(item.x >= 25, `Horizontal left clipping on p.${p.pageNumber}: "${item.str}" at x=${item.x}`);
      assert.ok(item.x + item.width <= 575, `Horizontal right clipping on p.${p.pageNumber}: "${item.str}" ends at ${item.x + item.width}`);
      assert.ok(item.y >= 12 && item.y <= 838, `Vertical clipping on p.${p.pageNumber}: "${item.str}" at y=${item.y}`);
    }
  }
});

/* ─── 7. Behavioral HTTP Route Security, IDOR & Tenant-Isolation Tests ── */

function createMockSupabase(fixture) {
  let writeCount = 0;
  function makeQuery(table) {
    const filters = [];
    const chain = {
      select() { return chain; },
      eq(col, val) { filters.push([col, val]); return chain; },
      order() { return chain; },
      limit() { return chain; },
      insert() { writeCount += 1; throw new Error("FORBIDDEN WRITE: insert"); },
      update() { writeCount += 1; throw new Error("FORBIDDEN WRITE: update"); },
      delete() { writeCount += 1; throw new Error("FORBIDDEN WRITE: delete"); },
      upsert() { writeCount += 1; throw new Error("FORBIDDEN WRITE: upsert"); },
      maybeSingle: async () => {
        const rows = (fixture[table] ?? []).filter((r) => filters.every(([c, v]) => r[c] === v));
        return { data: rows[0] ?? null, error: null };
      },
      single: async () => {
        const rows = (fixture[table] ?? []).filter((r) => filters.every(([c, v]) => r[c] === v));
        return { data: rows[0] ?? null, error: rows[0] ? null : { message: "not found" } };
      },
      then(resolve, reject) {
        const rows = (fixture[table] ?? []).filter((r) => filters.every(([c, v]) => r[c] === v));
        return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
      },
    };
    return chain;
  }
  return {
    from(table) { return makeQuery(table); },
    rpc() { writeCount += 1; throw new Error("FORBIDDEN WRITE: rpc"); },
    getWriteCount() { return writeCount; },
  };
}

// Runtime route harness with controllable session, RBAC, and mock DB
const ORG_A = "0a400000-0000-4000-8000-000000000001";
const ORG_B = "0b500000-0000-4000-8000-000000000002";
const EXAM_A = "cd000000-0000-4000-8000-000000000002";
const EXAM_ARCHIVED = "cd000000-0000-4000-8000-000000000099";
const QUIZ_A = "cd000000-0000-4000-8000-000000000001";
const ATT_SUBMITTED = "8e7fd331-db9d-44f1-929a-4cfc51048396";
const ATT_IN_PROGRESS = "8e7fd331-db9d-44f1-929a-4cfc51048397";
const ATT_OTHER_STUDENT = "8e7fd331-db9d-44f1-929a-4cfc51048398";
const ATT_ARCHIVED = "8e7fd331-db9d-44f1-929a-4cfc51048399";
const TOKEN_SUBMITTED = "10000000-0000-4000-8000-000000000001";
const TOKEN_IN_PROGRESS = "10000000-0000-4000-8000-000000000002";
const TOKEN_ARCHIVED = "10000000-0000-4000-8000-000000000003";
const CAND_1 = "c0000000-0000-4000-8000-000000000001";
const CAND_2 = "c0000000-0000-4000-8000-000000000002";
const STU_1 = "50000000-0000-4000-8000-000000000001";
const STU_2 = "50000000-0000-4000-8000-000000000002";
const USER_STU_1 = "u0000000-0000-4000-8000-000000000001";

const dbFixture = {
  organizations: [{ id: ORG_A, name: "Oak International School", logo_url: null }],
  quizzes: [{ id: QUIZ_A, settings: { subject: "Mathematics", curriculum: "MYP 4", grade_level: "Grade 9" } }],
  classes: [{ id: "cls-9", name: "Grade 9 — MYP 4" }],
  exams: [
    {
      id: EXAM_A,
      organization_id: ORG_A,
      quiz_id: QUIZ_A,
      title: "MYP 4 (Grade 9) Mathematics — End of First Term Summative Assessment (Version C)",
      duration_minutes: 120,
      settings: { randomize_options: true, results_published: false },
      deleted_at: null,
    },
    {
      id: EXAM_ARCHIVED,
      organization_id: ORG_A,
      quiz_id: QUIZ_A,
      title: "Archived Exam",
      duration_minutes: 60,
      settings: { archived: true },
      deleted_at: null,
    },
  ],
  exam_candidates: [
    { id: CAND_1, exam_id: EXAM_A, full_name: "Mélina OUSSOU", first_name: "Mélina", last_name: "OUSSOU", class_id: "cls-9" },
    { id: CAND_2, exam_id: EXAM_A, full_name: "Other Student", first_name: "Other", last_name: "Student", class_id: "cls-9" },
    { id: "c-arch", exam_id: EXAM_ARCHIVED, full_name: "Archived Student", first_name: "Archived", last_name: "Student", class_id: "cls-9" },
  ],
  students: [
    { id: STU_1, user_id: USER_STU_1, organization_id: ORG_A },
  ],
  exam_attempts: [
    {
      id: ATT_SUBMITTED,
      exam_id: EXAM_A,
      candidate_id: CAND_1,
      student_id: STU_1,
      class_id: "cls-9",
      access_token: TOKEN_SUBMITTED,
      question_order: null,
      status: "submitted",
      started_at: "2026-11-26T07:45:00Z",
      submitted_at: "2026-11-26T09:15:00Z",
      score: 15,
      max_score: 18,
      attempt_number: 1,
      first_name: "Mélina",
      last_name: "OUSSOU",
    },
    {
      id: ATT_IN_PROGRESS,
      exam_id: EXAM_A,
      candidate_id: CAND_1,
      student_id: STU_1,
      class_id: "cls-9",
      access_token: TOKEN_IN_PROGRESS,
      question_order: null,
      status: "in_progress",
      started_at: "2026-11-26T07:45:00Z",
      submitted_at: null,
      score: null,
      max_score: 18,
      attempt_number: 1,
    },
    {
      id: ATT_OTHER_STUDENT,
      exam_id: EXAM_A,
      candidate_id: CAND_2,
      student_id: STU_2,
      class_id: "cls-9",
      access_token: "10000000-0000-4000-8000-000000000099",
      question_order: null,
      status: "submitted",
      started_at: "2026-11-26T07:45:00Z",
      submitted_at: "2026-11-26T09:20:00Z",
      score: 18,
      max_score: 18,
      attempt_number: 1,
      first_name: "Other",
      last_name: "Student",
    },
    {
      id: ATT_ARCHIVED,
      exam_id: EXAM_ARCHIVED,
      candidate_id: "c-arch",
      student_id: null,
      class_id: "cls-9",
      access_token: TOKEN_ARCHIVED,
      question_order: null,
      status: "submitted",
      started_at: "2026-11-26T07:45:00Z",
      submitted_at: "2026-11-26T08:45:00Z",
      score: 10,
      max_score: 18,
      attempt_number: 1,
    },
  ],
  quiz_questions: cleanRows().map((r, i) => ({
    id: `qq-${i + 1}`,
    quiz_id: QUIZ_A,
    position: r.position,
    points: r.points,
    questions: r.questions,
  })),
  exam_answers: sampleAnswers.map((a) => ({ ...a, attempt_id: ATT_SUBMITTED })),
};

const mockDb = createMockSupabase(dbFixture);
let currentSession = null;
let currentCanOperate = false;

// Register minimal virtual mocks for server-only auth/supabase/rbac adapters used by routes
const virtualModules = {
  "@/lib/supabase/server": {
    createAdminClient: () => mockDb,
    createClient: async () => mockDb,
  },
  "@/lib/auth": {
    getSessionContext: async () => currentSession,
    activeOrg: (ctx) => {
      const m = ctx?.memberships?.[0];
      return m ? { id: m.organization_id, role: m.role, name: "Oak" } : null;
    },
  },
  "@/lib/operationalAccess": {
    canOperate: async () => currentCanOperate,
  },
  "@/lib/mypAccess": {
    isMypLearner: (role) => ["student", "candidate", "participant", "parent"].includes(role ?? ""),
  },
};

const prevLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (parent && parent.filename.startsWith(outDir) && virtualModules[request]) {
    return virtualModules[request];
  }
  return prevLoad.call(this, request, parent, isMain);
};

const { NextRequest } = req("next/server");
const candidateRouteMod = req(compileTsToCjs(path.resolve("src/app/api/exam/candidate-paper/route.ts")));
const staffRouteMod = req(
  compileTsToCjs(path.resolve("src/app/api/dashboard/exams/[id]/attempts/[attemptId]/paper-pdf/route.ts")),
);

await check("candidate route enforces token auth, anti-IDOR, student ownership, status & archive gates with 0 DB writes", async () => {
  // 1. No token & unauthenticated -> 401
  currentSession = null;
  let res = await candidateRouteMod.GET(new NextRequest("https://evalora-edu.online/api/exam/candidate-paper"));
  assert.equal(res.status, 401);

  // 2. Malformed token -> 404
  res = await candidateRouteMod.GET(
    new NextRequest("https://evalora-edu.online/api/exam/candidate-paper", { headers: { authorization: "Bearer not-a-uuid" } }),
  );
  assert.equal(res.status, 404);

  // 3. Unknown UUID token -> 404
  res = await candidateRouteMod.GET(
    new NextRequest("https://evalora-edu.online/api/exam/candidate-paper", {
      headers: { authorization: "Bearer ffffffff-ffff-4fff-8fff-ffffffffffff" },
    }),
  );
  assert.equal(res.status, 404);

  // 4. IDOR: Candidate A's valid token paired with Candidate B's attempt_id -> 404
  res = await candidateRouteMod.GET(
    new NextRequest(`https://evalora-edu.online/api/exam/candidate-paper?attempt_id=${ATT_OTHER_STUDENT}`, {
      headers: { authorization: `Bearer ${TOKEN_SUBMITTED}` },
    }),
  );
  assert.equal(res.status, 404);

  // 5. In-progress attempt -> 403
  res = await candidateRouteMod.GET(
    new NextRequest("https://evalora-edu.online/api/exam/candidate-paper", {
      headers: { authorization: `Bearer ${TOKEN_IN_PROGRESS}` },
    }),
  );
  assert.equal(res.status, 403);

  // 6. Archived exam -> 410
  res = await candidateRouteMod.GET(
    new NextRequest("https://evalora-edu.online/api/exam/candidate-paper", {
      headers: { authorization: `Bearer ${TOKEN_ARCHIVED}` },
    }),
  );
  assert.equal(res.status, 410);

  // 7. Valid completed attempt token -> 200 real PDF with private/no-store headers
  res = await candidateRouteMod.GET(
    new NextRequest("https://evalora-edu.online/api/exam/candidate-paper", {
      headers: { authorization: `Bearer ${TOKEN_SUBMITTED}` },
    }),
  );
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "application/pdf");
  assert.equal(res.headers.get("cache-control"), "private, no-store, max-age=0");
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.match(res.headers.get("content-disposition") ?? "", /attachment; filename="EVALORA_MYP4_Mathematics_Melina_OUSSOU_Exam\.pdf"/);
  const body = new Uint8Array(await res.arrayBuffer());
  assert.equal(Buffer.from(body.slice(0, 5)).toString("ascii"), "%PDF-");

  // 8. Signed-in Student 1 attempting to download Student 2's attempt -> 404 (anti-IDOR!)
  currentSession = {
    profile: { id: USER_STU_1, status: "active", platform_role: "user" },
    memberships: [{ organization_id: ORG_A, role: "student" }],
  };
  res = await candidateRouteMod.GET(
    new NextRequest(`https://evalora-edu.online/api/exam/candidate-paper?attempt_id=${ATT_OTHER_STUDENT}`),
  );
  assert.equal(res.status, 404);

  // 9. Signed-in Student 1 downloading Student 1's own completed attempt -> 200 PDF
  res = await candidateRouteMod.GET(
    new NextRequest(`https://evalora-edu.online/api/exam/candidate-paper?attempt_id=${ATT_SUBMITTED}`),
  );
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "application/pdf");

  assert.equal(mockDb.getWriteCount(), 0, "Candidate paper route must execute ZERO DB writes");
});

await check("staff route enforces 401/403/404, tenant isolation, RBAC canOperate, and 0 DB writes", async () => {
  const callStaff = (examId, attemptId) =>
    staffRouteMod.GET(new NextRequest(`https://evalora-edu.online/api/dashboard/exams/${examId}/attempts/${attemptId}/paper-pdf`), {
      params: Promise.resolve({ id: examId, attemptId }),
    });

  // 1. Unauthenticated -> 401
  currentSession = null;
  let res = await callStaff(EXAM_A, ATT_SUBMITTED);
  assert.equal(res.status, 401);

  // 2. Learner attempting staff route -> 404
  currentSession = {
    profile: { id: USER_STU_1, status: "active", platform_role: "user" },
    memberships: [{ organization_id: ORG_A, role: "student" }],
  };
  currentCanOperate = true;
  res = await callStaff(EXAM_A, ATT_SUBMITTED);
  assert.equal(res.status, 404);

  // 3. Cross-tenant teacher (Org B requesting Org A exam) -> 404
  currentSession = {
    profile: { id: "teacher-b", status: "active", platform_role: "user" },
    memberships: [{ organization_id: ORG_B, role: "teacher" }],
  };
  currentCanOperate = true;
  res = await callStaff(EXAM_A, ATT_SUBMITTED);
  assert.equal(res.status, 404);

  // 4. Same-org member lacking `results.view` RBAC permission -> 403
  currentSession = {
    profile: { id: "staff-no-perm", status: "active", platform_role: "user" },
    memberships: [{ organization_id: ORG_A, role: "teacher" }],
  };
  currentCanOperate = false;
  res = await callStaff(EXAM_A, ATT_SUBMITTED);
  assert.equal(res.status, 403);

  // 5. Authorized same-org teacher requesting in_progress attempt -> 409
  currentCanOperate = true;
  res = await callStaff(EXAM_A, ATT_IN_PROGRESS);
  assert.equal(res.status, 409);

  // 6. Authorized same-org teacher requesting completed attempt -> 200 PDF
  res = await callStaff(EXAM_A, ATT_SUBMITTED);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "application/pdf");
  const staffPdf = new Uint8Array(await res.arrayBuffer());
  assert.equal(Buffer.from(staffPdf.slice(0, 5)).toString("ascii"), "%PDF-");

  // 7. Super Admin across organizations -> 200 PDF
  currentSession = {
    profile: { id: "super-1", status: "active", platform_role: "super_admin" },
    memberships: [],
  };
  currentCanOperate = false;
  res = await callStaff(EXAM_A, ATT_SUBMITTED);
  assert.equal(res.status, 200);

  assert.equal(mockDb.getWriteCount(), 0, "Staff paper route must execute ZERO DB writes");
});

console.log(`\n${passed} passed, 0 failed.\n`);
