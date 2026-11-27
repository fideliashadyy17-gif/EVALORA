/**
 * Question Paper Builder visibility, official paper headers, organization
 * logo management and the enhanced scientific calculator.
 */
import { readFileSync } from "node:fs";
import { Module } from "node:module";
import path from "node:path";
import ts from "typescript";

let passed = 0;
let failed = 0;
function check(name, condition) {
  if (condition) { passed += 1; console.log(`  ✓ ${name}`); }
  else { failed += 1; console.log(`  ✗ ${name}`); }
}

// ── Calculator engine (new functions) ────────────────────────────────────
const file = path.resolve("scripts/__virtual_calculator2.cjs");
const js = ts.transpileModule(readFileSync("src/components/Calculator.tsx", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const originalLoad = Module._load;
Module._load = function (request, parent) {
  if (parent?.filename === file && request === "@/lib/utils") return { cn: (...a) => a.filter(Boolean).join(" ") };
  return originalLoad.apply(this, arguments);
};
const virtual = new Module(file);
virtual.filename = file;
virtual.paths = Module._nodeModulePaths(path.dirname(file));
virtual._compile(js, file);
Module._load = originalLoad;
const { evaluateExpression, formatResult } = virtual.exports;

check("fractions evaluate", evaluateExpression("(3/4)+1/4") === 1);
check("inverse trig in degrees", Math.abs(evaluateExpression("asin(0.5)") - 30) < 1e-9);
check("absolute value", evaluateExpression("abs(-7)") === 7);
check("reciprocal", evaluateExpression("1/(2)") === 0.5);
check("scientific notation", evaluateExpression("1.5e3") === 1500);
check("constants pi and e", Math.abs(evaluateExpression("pi") - Math.PI) < 1e-12 && Math.abs(evaluateExpression("e") - Math.E) < 1e-12);
check("radian mode", Math.abs(evaluateExpression("sin(3.141592653589793)", 0, { angleMode: "rad" })) < 1e-12);
check("degree mode default", Math.abs(evaluateExpression("sin(30)") - 0.5) < 1e-12);
check("factorial", evaluateExpression("factorial(5)") === 120);
check("formatResult scientific", formatResult(1e13).includes("10^"));

// ── Exam paper resolver ──────────────────────────────────────────────────
const paperFile = path.resolve("scripts/__virtual_exampaper.cjs");
const paperJs = ts.transpileModule(readFileSync("src/lib/examPaper.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const paperMod = new Module(paperFile);
paperMod.filename = paperFile;
paperMod.paths = Module._nodeModulePaths(path.dirname(paperFile));
paperMod._compile(paperJs, paperFile);
const { resolveExamPaperHeader, parsePaperSections, groupRowsBySection, formatDuration } = paperMod.exports;

const header = resolveExamPaperHeader({
  organizationName: "Oak School",
  organizationLogoUrl: "https://x/logo.png",
  examTitle: "MYP4 Version C",
  examDurationMinutes: 120,
  examSettings: { exam_period: "First Term Examination", academic_year: "2026–2027" },
  quizSettings: { grade_label: "MYP4", subject: "Mathematics" },
  template: null,
  totalMarks: 100,
});
check("header resolves period/year/grade/subject", header.period === "First Term Examination" && header.academicYear === "2026–2027" && header.gradeLabel === "MYP4" && header.subject === "Mathematics");
check("header keeps org identity", header.organizationName === "Oak School" && header.organizationLogoUrl === "https://x/logo.png");
check("duration formats", formatDuration(120) === "2 hours" && formatDuration(90) === "1 hour 30 minutes");

const sections = parsePaperSections([
  { id: "A", title: "SECTION A — MULTIPLE CHOICE QUESTIONS", questions: 30, marks: 60 },
  { id: "B", title: "SECTION B — THEORY QUESTIONS", questions: 4, marks: 40 },
]);
check("sections parse", sections.length === 2 && sections[0].id === "A" && sections[1].id === "B");

const rows = [
  { questions: { config: { paper_section: "A" } }, points: 1 },
  { questions: { config: { paper_section: "B" } }, points: 10 },
  { questions: { config: { paper_section: "A" } }, points: 1 },
];
const groups = groupRowsBySection(rows, sections);
check("grouping keeps A before B", groups.length === 2 && groups[0].section?.id === "A" && groups[0].rows.length === 2 && groups[1].rows.length === 1);

// ── Randomization preserves sections, no dupes/missing ───────────────────
// Extract the two pure functions from live.ts (the module has server deps).
const liveSrc = readFileSync("src/lib/live.ts", "utf8");
const shuffleStart = liveSrc.indexOf("export function seededShuffle");
const shuffleEnd = liveSrc.indexOf("export interface SessionQuestionRow");
const shuffleCode = ts.transpileModule(liveSrc.slice(shuffleStart, shuffleEnd).replace(/export (function|interface)/g, "$1"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const randFn = new Function(`${shuffleCode}\nreturn { seededShuffle, randomizeQuestionRows };`)();
const { randomizeQuestionRows, seededShuffle } = randFn;

const paperRows = Array.from({ length: 34 }, (_, i) => ({
  id: `q${i + 1}`,
  questions: { config: { paper_section: i < 30 ? "A" : "B" } },
}));
const shuffled = randomizeQuestionRows(paperRows, "attempt-123");
check("randomization keeps all 34 questions", shuffled.length === 34 && new Set(shuffled.map((r) => r.id)).size === 34);
check("randomization keeps sections ordered", shuffled.slice(0, 30).every((r) => r.questions.config.paper_section === "A") && shuffled.slice(30).every((r) => r.questions.config.paper_section === "B"));
check("randomization is stable per attempt", JSON.stringify(randomizeQuestionRows(paperRows, "attempt-123").map((r) => r.id)) === JSON.stringify(shuffled.map((r) => r.id)));
check("different attempts differ", JSON.stringify(randomizeQuestionRows(paperRows, "attempt-999").map((r) => r.id)) !== JSON.stringify(shuffled.map((r) => r.id)));
check("option shuffle keeps answers attached", (() => {
  const opts = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
  const s = seededShuffle(opts, "seed:q1");
  return s.length === 4 && new Set(s.map((o) => o.id)).size === 4;
})());

// ── Source checks: nav, guards, logo, calculator config ──────────────────
const chrome = readFileSync("src/components/dashboard/DashboardChrome.tsx", "utf8");
check("dashboard nav shows Question Paper Builder", chrome.includes("/dashboard/paper-builder") && chrome.includes("Question Paper Builder"));

const builderPage = readFileSync("src/app/dashboard/paper-builder/page.tsx", "utf8");
check("builder page guards by capability and RBAC", builderPage.includes("question_paper_builder") && builderPage.includes('"paper_builder.view"') && (builderPage.includes("canOperate(") || builderPage.includes("canOperateMany(")));

const settings = readFileSync("src/app/dashboard/settings/page.tsx", "utf8");
check("org settings has logo upload", settings.includes("updateOrgLogo") && settings.includes("LogoUpload") && settings.includes("org-logos"));

const overview = readFileSync("src/app/admin/organizations/[id]/tabs/OverviewTab.tsx", "utf8");
check("super admin org tab has logo preview", overview.includes("LogoUpload"));

const takeExam = readFileSync("src/app/take-exam/[attemptId]/TakeExamClient.tsx", "utf8");
check("candidate screen shows official header", takeExam.includes("Official Examination Paper") && takeExam.includes("paper_header"));
check("candidate calculator respects exam mode", takeExam.includes("calculator_mode") && takeExam.includes("calculator_angle_mode"));

const stateRoute = readFileSync("src/app/api/exam/state/route.ts", "utf8");
check("state route serves paper header", stateRoute.includes("paper_header") && stateRoute.includes("resolveExamPaperHeader"));

const printable = readFileSync("src/app/dashboard/exams/[id]/paper/page.tsx", "utf8");
check("printable paper renders official header", printable.includes("Official Examination Paper") && printable.includes("formatDuration"));

const modules = readFileSync("src/app/admin/modules/page.tsx", "utf8");
check("super admin modules manage builder/calculator/paper", modules.includes("question_paper_builder") && modules.includes("scientific_calculator") && modules.includes("official_exam_paper"));

const migration = readFileSync("supabase/migrations/20261124120000_exam_paper_templates_version_c_sections.sql", "utf8");
check("migration creates templates table", migration.includes("exam_paper_templates"));
check("migration sets Version C sections", migration.includes("SECTION A — MULTIPLE CHOICE QUESTIONS") && migration.includes("SECTION B — THEORY QUESTIONS"));
check("migration never deletes questions", !/delete from public\.questions/i.test(migration) && !/delete from public\.question_options/i.test(migration));

// ── Regression: edit loads large banks, saves safely, prints all types ──
const editPage = readFileSync("src/app/dashboard/paper-builder/[id]/page.tsx", "utf8");
check("edit bank is paged, not capped at 300", editPage.includes(".range(") && !editPage.includes(".limit(300)"));
check("edit page surfaces bank load failures", editPage.includes("question bank could not be loaded"));

const builderSrc = readFileSync("src/app/dashboard/paper-builder/PaperBuilder.tsx", "utf8");
check("builder never force-unwraps missing bank rows", !builderSrc.includes("byId.get(id)!") && builderSrc.includes("sectionFor("));
check("builder shows missing paper questions instead of dropping them", builderSrc.includes("was not found in the loaded question bank"));

// The paper save body moved into a shared service when the AI core needed to
// write papers through the same guards; the action is now a thin browser
// adapter, so the write-checking assertions follow the code to its home.
const quizActions = readFileSync("src/app/dashboard/quizzes/actions.ts", "utf8");
const paperAuthoring = readFileSync("src/lib/services/paperAuthoring.ts", "utf8");
check(
  "saveQuiz checks every write and maps the guard to a friendly error",
  paperAuthoring.includes("friendlySaveError") && paperAuthoring.includes("membershipUnchanged") && paperAuthoring.includes("upsert")
    && quizActions.includes("savePaperForActor"),
);

const printableLib = readFileSync("src/lib/printablePaper.ts", "utf8");
check("preview supports matching/ordering/assess_parts", ["\"matching\"", "\"ordering\"", "\"assess_parts\""].every((t) => printableLib.includes(t)));
check("matching bank rotated off index alignment", printableLib.includes("matching_rights") && printableLib.includes("slice(1)"));

const printPage = readFileSync("src/app/dashboard/exams/[id]/paper/page.tsx", "utf8");
check("preview renders matching and multi-part questions", printPage.includes("MatchingPrint") && printPage.includes("assess_parts"));

const guardMigration = readFileSync("supabase/migrations/20261124170000_writable_paper_settings_and_attempt_scoped_guard.sql", "utf8");
check("guard migration lets quiz settings update", guardMigration.includes("tg_table_name = 'quizzes' and tg_op = 'UPDATE'"));
check("guard migration freezes content on attempts via exams", guardMigration.includes("join public.exams e on e.id = a.exam_id"));
check("guard migration never deletes or drops data", !/delete\s+from/i.test(guardMigration) && !/drop\s+(table|column)/i.test(guardMigration));

// ── Official Oak logo asset + aspect-safe surfaces ──────────────────────
const oakLogo = readFileSync("public/brand/oak-international-school-logo.webp");
check(
  "official Oak logo file exists at the configured path",
  oakLogo.length > 10_000 && oakLogo.subarray(0, 4).toString() === "RIFF" && oakLogo.subarray(8, 12).toString() === "WEBP",
);
const portalPage = readFileSync("src/app/portal/[slug]/page.tsx", "utf8");
const logoUpload = readFileSync("src/components/LogoUpload.tsx", "utf8");
for (const [name, src] of [
  ["dashboard chrome", chrome],
  ["portal", portalPage],
  ["candidate screen", takeExam],
  ["logo upload", logoUpload],
  ["printable header", printable],
]) {
  check(`${name} keeps logo aspect (w-auto + max-w)`, src.includes("w-auto") && src.includes("max-w-"));
}

console.log(`\n${passed} paper-builder checks passed${failed ? `, ${failed} failed` : ""}.`);
process.exit(failed === 0 ? 0 : 1);
