/**
 * Functional checks for the unified mathematical editor, structured
 * question serialization, candidate-safe payloads, server examination
 * deadlines and the A–H Super Admin route tree.
 *
 * Run: node scripts/test-rich-content.mjs
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";

const outDir = "/tmp/evalora-rich-test";
execSync(
  `npx tsc src/lib/content.ts src/lib/exam.ts src/lib/questionValidation.ts src/components/editor/mathKeyboard.ts --outDir ${outDir} --rootDir src --module commonjs --target es2022 --esModuleInterop --skipLibCheck --moduleResolution node`,
  { stdio: "inherit" },
);
execSync(`ln -sfn "$(pwd)/node_modules" ${outDir}/node_modules`, { stdio: "inherit" });

const require = createRequire(import.meta.url);
const {
  docIsEmpty,
  docToLabel,
  docToPlainText,
  renderLatex,
  textToDoc,
  validateLatex,
} = require(`${outDir}/lib/content.js`);
const { attemptDeadline } = require(`${outDir}/lib/exam.js`);
const { publicQuestion } = require(`${outDir}/lib/live.js`);
const { questionPublishIssues } = require(`${outDir}/lib/questionValidation.js`);
const { MATH_CATEGORIES, templateToPlaceholderLatex } = require(`${outDir}/components/editor/mathKeyboard.js`);

let passed = 0;
const ok = (name, condition) => {
  if (!condition) throw new Error(`FAIL: ${name}`);
  passed += 1;
  console.log(`  ✓ ${name}`);
};

/* ─── Structured sample mathematics question ─────────────────────── */
const sampleDoc = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Solve " },
        { type: "mathInline", attrs: { latex: "\\frac{\\sqrt{x^2+1}}{x_i}" } },
        { type: "text", text: " and use the diagram." },
      ],
    },
    {
      type: "image",
      attrs: {
        src: "https://example.supabase.co/storage/v1/object/public/question-media/diagram.png",
        alt: "Right triangle diagram",
        title: "Triangle ABC",
      },
    },
    {
      type: "mathBlock",
      attrs: {
        latex:
          "\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix},\\quad \\sum_{i=1}^{n}i,\\quad \\int_0^1 x^2\\,dx,\\quad \\lim_{x\\to0}\\frac{\\sin x}{x},\\quad \\frac{dy}{dx}",
      },
    },
  ],
};
const plain = docToPlainText(sampleDoc);
ok("structured fraction/root/power/subscript survive serialization", plain.includes("$\\frac{\\sqrt{x^2+1}}{x_i}$"));
ok("matrix survives serialization", plain.includes("\\begin{pmatrix}"));
ok("summation survives serialization", plain.includes("\\sum_{i=1}^{n}"));
ok("integral survives serialization", plain.includes("\\int_0^1"));
ok("limit survives serialization", plain.includes("\\lim_{x\\to0}"));
ok("derivative survives serialization", plain.includes("\\frac{dy}{dx}"));
ok("mixed text/math/image document is non-empty", !docIsEmpty(sampleDoc));
ok("image-only option label falls back to alt text", docToLabel({ type: "doc", content: [sampleDoc.content[1]] }) === "Right triangle diagram");

const roundTrip = textToDoc("Find $\\sqrt{\\frac{x^2}{y_i}}$.\n\n$$\\int_a^b f(x)\\,dx$$");
const roundTripText = docToPlainText(roundTrip);
ok("legacy inline/display LaTeX round-trips through structured docs", roundTripText.includes("\\sqrt{\\frac{x^2}{y_i}}") && roundTripText.includes("$$\\int_a^b"));
ok("valid advanced LaTeX passes validation", validateLatex("\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}") === null);
ok("invalid LaTeX is rejected without being rewritten", validateLatex("\\frac{1}") !== null);
ok("KaTeX renders assembled mathematics", renderLatex("\\frac{\\sqrt{x^2+1}}{2}", true).includes("katex"));

/* ─── Permanent mathematical keyboard inventory ─────────────────── */
const categories = new Map(MATH_CATEGORIES.map((c) => [c.label, c.keys]));
for (const label of [
  "Basic",
  "Fractions & Roots",
  "Powers & Indices",
  "Equations & Inequalities",
  "Algebra",
  "Geometry",
  "Trigonometry",
  "Functions",
  "Limits",
  "Derivatives",
  "Integrals",
  "Sums & Products",
  "Matrices",
  "Greek Letters",
  "Sets & Logic",
  "Statistics & Probability",
  "Vectors",
  "Structures",
]) ok(`keyboard category exists: ${label}`, categories.has(label));

const templates = MATH_CATEGORIES.flatMap((c) => c.keys.map((k) => k.i)).join(" ");
for (const [name, token] of [
  ["fraction template", "\\frac{#0}{#1}"],
  ["root template", "\\sqrt{#0}"],
  ["superscript template", "^{#0}"],
  ["subscript template", "_{#0}"],
  ["integral bounds template", "\\int_{#0}^{#1}"],
  ["summation template", "\\sum_{#0}^{#1}"],
  ["product template", "\\prod_{#0}^{#1}"],
  ["limit template", "\\lim_{x\\to #0}"],
  ["derivative template", "\\frac{d#0}{d#1}"],
  ["matrix template", "\\begin{pmatrix}"],
  ["piecewise structure", "\\begin{cases}"],
]) ok(name, templates.includes(token));
ok("keyboard button faces use rendered LaTeX rather than English structure words", MATH_CATEGORIES.every((c) => c.keys.every((k) => k.d.trim().length > 0 && !/^(fraction|integral|square root|summation|derivative)$/i.test(k.d.trim()))));
ok(
  "text-mode structures preserve MathLive placeholders",
  templateToPlaceholderLatex("\\frac{#0}{#1}") === "\\frac{\\placeholder{}}{\\placeholder{}}",
);
const richEditorSource = readFileSync("src/components/editor/RichContentEditor.tsx", "utf8");
const mathFieldSource = readFileSync("src/components/editor/MathField.tsx", "utf8");
ok("mathematical keyboard stays mounted to avoid React/Tippy insertBefore crashes", richEditorSource.includes("hidden={!showKeyboard}"));
ok("BubbleMenus have a stable React insertion anchor", richEditorSource.includes("data-rce-bubble-menu-anchor"));
ok("MathField can select the first structured placeholder", mathFieldSource.includes("moveToNextPlaceholder"));

/* ─── Candidate-safe rich question payload ───────────────────────── */
const row = {
  id: "qq-1",
  question_id: "q-1",
  position: 0,
  points: 4,
  time_limit_seconds: null,
  questions: {
    id: "q-1",
    type: "single_choice",
    prompt: "Choose $\\sqrt{4}$",
    prompt_doc: sampleDoc,
    explanation: "SECRET worked solution",
    explanation_doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "SECRET" }] }] },
    points: 4,
    config: { numeric_answer: 2, marking_criteria: "SECRET" },
    question_options: [
      { id: "o-1", label: "2", content_doc: sampleDoc, is_correct: true, position: 0 },
      { id: "o-2", label: "4", content_doc: null, is_correct: false, position: 1 },
    ],
  },
};
const pub = publicQuestion(row);
ok("candidate payload carries structured prompt/option docs", pub.prompt_doc === sampleDoc && pub.options[0].content_doc === sampleDoc);
ok("candidate payload strips correctness", !JSON.stringify(pub).includes("is_correct"));
ok("candidate payload strips explanations and marking config", !JSON.stringify(pub).includes("SECRET"));

/* ─── Published-question readiness ──────────────────────────────── */
ok("complete single-choice question can publish", questionPublishIssues({ type: "single_choice", prompt: "2+2?", points: 1, options: [{ label: "4", is_correct: true }, { label: "5", is_correct: false }] }).length === 0);
ok("single-choice question with two correct options cannot publish", questionPublishIssues({ type: "single_choice", prompt: "2+2?", points: 1, options: [{ label: "4", is_correct: true }, { label: "5", is_correct: true }] }).length > 0);
ok("numeric question requires finite answer", questionPublishIssues({ type: "numeric", prompt: "x?", points: 1, config: {} }).length > 0);
ok("numeric tolerance cannot be negative", questionPublishIssues({ type: "numeric", prompt: "x?", points: 1, config: { numeric_answer: 2, tolerance: -1 } }).length > 0);
ok("matching question requires two complete pairs", questionPublishIssues({ type: "matching", prompt: "Match", points: 1, config: { pairs: [{ left: "a", right: "1" }] } }).length > 0);
ok("structured response requires marking criteria", questionPublishIssues({ type: "open_ended", prompt: "Prove…", points: 5, config: {} }).length > 0);

/* ─── Server-side examination deadlines/extensions ───────────────── */
const started = "2026-01-01T10:00:00.000Z";
ok(
  "base deadline is start + duration",
  attemptDeadline({ duration_minutes: 60, ends_at: null }, started).toISOString() === "2026-01-01T11:00:00.000Z",
);
ok(
  "authorized extension moves deadline exactly",
  attemptDeadline({ duration_minutes: 60, ends_at: null }, started, 15).toISOString() === "2026-01-01T11:15:00.000Z",
);
ok(
  "extension also shifts a hard examination window for that candidate",
  attemptDeadline({ duration_minutes: 120, ends_at: "2026-01-01T10:30:00.000Z" }, started, 15).toISOString() === "2026-01-01T10:45:00.000Z",
);

// The closing rules now live in one module (src/lib/examSubmission.ts) rather than
// inline in the submit route, so these assertions read the module that owns them.
const submitSource = readFileSync("src/app/api/exam/submit/route.ts", "utf8");
const submissionSource = readFileSync("src/lib/examSubmission.ts", "utf8");
ok("a late submission is recorded as auto_submitted", submissionSource.includes('const finalStatus = isDeadline ? "auto_submitted" : "submitted"'));
ok(
  "a late submission is stamped at the deadline, never at the request time",
  submissionSource.includes("const submittedInstant = isDeadline ? window.deadlineMs : options.nowMs"),
);
ok("an automatic closure before the deadline is refused", submissionSource.includes("refused_premature"));
for (const route of ["access", "save", "state", "submit"]) {
  const source = readFileSync(`src/app/api/exam/${route}/route.ts`, "utf8");
  ok(
    `/api/exam/${route} uses the authoritative extension-aware deadline`,
    (source.includes("attemptDeadline") || source.includes("submissionWindow")) &&
      (source.includes("extension_minutes") || source.includes("submissionWindow")),
  );
}

/* ─── A–H navigation and route existence ─────────────────────────── */
const shell = readFileSync("src/app/admin/AdminShell.tsx", "utf8");
for (const title of [
  "A. Overview",
  "B. Organizations & Schools",
  "C. Students & Users",
  "D. Live Competition",
  "E. Quiz & Questions",
  "F. Examinations",
  "G. Payments & Subscriptions",
  "H. Platform Administration",
]) ok(`navigation group exists: ${title}`, shell.includes(`title: "${title}"`));

const hrefs = [...new Set([...shell.matchAll(/href: "(\/admin[^" ]*)"/g)].map((m) => m[1]))];
ok("navigation exposes at least 55 functional destinations", hrefs.length >= 55);
for (const href of hrefs) {
  const path = href.split(/[?#]/)[0];
  const page = path === "/admin" ? "src/app/admin/page.tsx" : `src/app${path}/page.tsx`;
  ok(`route exists for ${href}`, existsSync(page));
}

/* ─── Shared QuestionForm/editor security contracts ──────────────── */
const adminQuestionAction = readFileSync("src/app/admin/questions/actions.ts", "utf8");
const examActions = readFileSync("src/app/admin/examinations/actions.ts", "utf8");
ok("Super Admin question saves require server-side authorization", adminQuestionAction.includes("requireSuperAdmin"));
ok("question images use Supabase Storage question-media bucket", adminQuestionAction.includes('.from("question-media")'));
ok("question images are not stored as base64 data URLs", !adminQuestionAction.includes("data:image"));
ok("Super Admin examination mutations require server-side authorization", examActions.includes("requireSuperAdmin"));
ok("extension grants are audit logged", examActions.includes("exam.extension_granted"));

console.log(`\nAll ${passed} rich-content/examination/navigation checks passed.`);
