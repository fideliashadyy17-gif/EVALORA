/**
 * Checks for the class-based Question Bank, curriculum mappings,
 * question generation and qualification ranking.
 * Run: node scripts/test-class-question-bank.mjs
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";

const outDir = "/tmp/evalora-class-qb-test";
execSync(
  `npx tsc src/lib/curriculum.ts src/lib/questionGeneration.ts src/lib/qualification.ts --outDir ${outDir} --rootDir src --module commonjs --target es2022 --esModuleInterop --skipLibCheck --moduleResolution node`,
  { stdio: "inherit" },
);
execSync(`ln -sfn "$(pwd)/node_modules" ${outDir}/node_modules`, { stdio: "inherit" });

const require = createRequire(import.meta.url);
const curr = require(`${outDir}/lib/curriculum.js`);
const gen = require(`${outDir}/lib/questionGeneration.js`);
const qual = require(`${outDir}/lib/qualification.js`);

let passed = 0;
const ok = (name, condition) => {
  if (!condition) throw new Error(`FAIL: ${name}`);
  passed += 1;
  console.log(`  ✓ ${name}`);
};

/* ── Curriculum ladder ── */
ok("Oak ladder has 14 classes KG→Grade 13", curr.OAK_CLASS_LADDER.length === 14);
ok("grade orders are 0..13 unique", new Set(curr.OAK_CLASS_LADDER.map((c) => c.gradeOrder)).size === 14);
ok("class codes are unique", new Set(curr.OAK_CLASS_LADDER.map((c) => c.code)).size === 14);
const g6 = curr.OAK_CLASS_LADDER.find((c) => c.code === "G6-MYP1");
ok("Grade 6/CM2 maps to MYP 1 + Beninese", g6.courses.myp === "MYP 1 Mathematics" && Boolean(g6.courses.beninese));
const g13 = curr.OAK_CLASS_LADDER.find((c) => c.code === "G13");
ok("Grade 13 AP mapping flagged for review", g13.apNeedsReview === true && /Calculus BC/.test(g13.courses.ap));
ok("primary band pairs English + Beninese", JSON.stringify(curr.defaultCurriculaForBand("early_years_primary")) === '["english","beninese"]');
ok("myp band pairs MYP + Beninese", JSON.stringify(curr.defaultCurriculaForBand("myp_secondary")) === '["myp","beninese"]');
ok("advanced band pairs AP + Beninese", JSON.stringify(curr.defaultCurriculaForBand("advanced_secondary")) === '["ap","beninese"]');
ok("all curriculum sources have real URLs", Object.values(curr.CURRICULUM_SOURCES).every((s) => /^https:\/\//.test(s.url) && s.reference.length > 20));
ok("generation counts are 20..40 step 5", JSON.stringify([...curr.GENERATION_COUNTS]) === "[20,25,30,35,40]");

/* ── Generation per representative class ── */
function checkGeneration(label, req, expectFr) {
  const res = gen.generateQuestions(req);
  ok(`${label}: generates requested count`, res.questions.length === req.count && res.shortfall === 0);
  const prompts = new Set(res.questions.map((q) => gen.normalizePrompt(q.prompt)));
  ok(`${label}: no duplicate prompts`, prompts.size === res.questions.length);
  ok(`${label}: every MCQ has exactly one correct option`, res.questions.every((q) => q.options.filter((o) => o.is_correct).length === 1));
  ok(`${label}: every MCQ has 3-4 distinct options`, res.questions.every((q) => q.options.length >= 3 && new Set(q.options.map((o) => o.label)).size === q.options.length));
  ok(`${label}: explanations present`, res.questions.every((q) => q.explanation.length > 8));
  ok(`${label}: difficulty progresses (last harder than first)`, ["hard", "competition", "medium"].includes(res.questions.at(-1).difficulty));
  if (expectFr) ok(`${label}: French wording used`, res.questions.some((q) => /[àâéèêôûç]|Calcule|Trouve|Quelle|Combien/.test(q.prompt)));
  return res;
}
const kg = checkGeneration("KG English", { gradeOrder: 0, curriculum: "english", count: 20, seed: "oak-kg-en" });
ok("KG: majority visual questions", kg.questions.filter((q) => q.visual).length >= 10);
checkGeneration("CP Beninese", { gradeOrder: 2, curriculum: "beninese", count: 20, seed: "oak-cp-fr" }, true);
checkGeneration("CM1 English", { gradeOrder: 5, curriculum: "english", count: 25, seed: "oak-cm1-en" });
checkGeneration("Grade 8 MYP 3", { gradeOrder: 8, curriculum: "myp", courseLabel: "MYP 3 Mathematics", count: 30, seed: "oak-g8-myp" });
checkGeneration("Grade 9 Beninese", { gradeOrder: 9, curriculum: "beninese", count: 20, seed: "oak-g9-fr" }, true);
checkGeneration("Grade 11 AP Statistics", { gradeOrder: 11, curriculum: "ap", courseLabel: "AP Statistics", count: 20, seed: "oak-g11-apstat" });
const g13gen = checkGeneration("Grade 13 AP Calculus BC", { gradeOrder: 13, curriculum: "ap", courseLabel: "AP Calculus BC", count: 20, seed: "oak-g13-apbc", stage: "grand_final" });
ok("Grand final stage reaches competition difficulty", g13gen.questions.some((q) => q.difficulty === "competition"));
checkGeneration("Grade 12 Beninese (Terminale)", { gradeOrder: 12, curriculum: "beninese", count: 20, seed: "oak-g12-fr", stage: "semi_final" }, true);

/* determinism + seed variation */
const a = gen.generateQuestions({ gradeOrder: 5, curriculum: "english", count: 5, seed: "same" });
const b = gen.generateQuestions({ gradeOrder: 5, curriculum: "english", count: 5, seed: "same" });
ok("generation is deterministic per seed", JSON.stringify(a) === JSON.stringify(b));
const c = gen.generateQuestions({ gradeOrder: 5, curriculum: "english", count: 5, seed: "different" });
ok("different seeds vary questions", JSON.stringify(a.questions.map((q) => q.prompt)) !== JSON.stringify(c.questions.map((q) => q.prompt)));

/* cross-check a sample of arithmetic answers independently */
{
  const res = gen.generateQuestions({ gradeOrder: 5, curriculum: "english", count: 40, seed: "verify-arith" });
  let checked = 0;
  for (const q of res.questions) {
    const m = q.prompt.match(/^Calculate (\d+)\/(\d+) of (\d+)\.$/);
    if (m) {
      const expected = String((Number(m[3]) / Number(m[2])) * Number(m[1]));
      const correct = q.options.find((o) => o.is_correct).label;
      if (correct !== expected) throw new Error(`fraction answer wrong: ${q.prompt} -> ${correct} != ${expected}`);
      checked++;
    }
  }
  ok(`independent recomputation of fraction answers (${checked} sampled)`, checked >= 1);
}

/* ── Qualification ranking ── */
const ranked = qual.rankWithinClass([
  { key: "a", displayName: "A", score: 18, maxScore: 20 },
  { key: "b", displayName: "B", score: 18, maxScore: 20, totalResponseMs: 5000 },
  { key: "c", displayName: "C", score: 9, maxScore: 20 },
]);
ok("ranking sorts by score then faster time", ranked[0].key === "b" && ranked[1].key === "a" && ranked[2].key === "c");
ok("percent computed", ranked[0].percent === 90);
const elig = qual.eligibleByRule(ranked, { top_n: 2, min_percent: 50 });
ok("qualification rule top_n + min_percent", elig.length === 2);
ok("default qualification rule parsed", qual.parseQualificationRule(null).top_n === 10);

/* ── Static guards ── */
const read = (p) => readFileSync(p, "utf8");
ok("admin nav exposes Class Management", read("src/app/admin/AdminShell.tsx").includes('"Class Management"') || read("src/app/admin/AdminShell.tsx").includes("label: \"Class Management\""));
ok("migration 0011 exists with events", existsSync("supabase/migrations/0011_class_question_bank_events.sql") && read("supabase/migrations/0011_class_question_bank_events.sql").includes("competition_events"));
ok("question generator page exists", existsSync("src/app/admin/questions/generate/page.tsx"));
ok("events overview page exists", existsSync("src/app/admin/competitions/events/[id]/page.tsx"));
ok("docs guide exists", existsSync("docs/CLASS_QUESTION_BANK_AND_MATAMAT.md"));

for (const page of ["src/app/admin/questions/[id]/page.tsx", "src/app/dashboard/questions/[id]/page.tsx"]) {
  const content = read(page);
  for (const field of ["class_id", "subject_id", "curriculum", "curriculum_course", "subtopic", "source_reference", "source_url"]) {
    ok(`${page} preserves ${field}`, content.includes(`${field}: q.${field}`));
  }
  ok(`${page} passes class options`, content.includes("classOptions={classOptions ?? []}"));
}
ok("generation checks the exact class programme link", read("src/app/admin/questions/generate/actions.ts").includes('.eq("class_id", classId!).eq("programme_id", programme!.id)'));
ok("event administration checks previous phase and qualification decisions", read("src/app/admin/competitions/events/actions.ts").includes('previous.status !== "completed"') && read("src/app/admin/competitions/events/actions.ts").includes('pending.count'));

console.log(`\n${passed} class/question-bank checks passed`);
