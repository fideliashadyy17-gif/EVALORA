// Interface locale × examination content language isolation matrix.
//
//   node scripts/test-exam-language-isolation.mjs
//
// The platform switches ONLY the application interface. Examination content
// keeps the author-selected paper language (en/fr/es) and is shielded from
// browser translation engines. These checks lock that contract at the source
// level plus the pure language module.
import { readFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

let checks = 0;
const failures = [];
function ok(cond, message) {
  checks += 1;
  if (!cond) failures.push(message);
}

// ── 1. lib/examLanguage: en/fr/es supported, explicit author value wins ──
mkdirSync(".tmp-test-lang", { recursive: true });
const build = spawnSync(
  "npx",
  ["tsc", "src/lib/examLanguage.ts", "--target", "es2022", "--module", "commonjs", "--skipLibCheck", "--outDir", ".tmp-test-lang"],
  { encoding: "utf8" },
);
ok(build.status === 0, `tsc transpile of examLanguage.ts failed: ${build.stderr?.slice(0, 400)}`);
const examLanguage = require(`${process.cwd()}/.tmp-test-lang/examLanguage.js`);

for (const code of ["en", "fr", "es", "EN", "ES-MX", "español", "Français"]) {
  const normalized = examLanguage.normalizeExamLanguage(code);
  const expected = code.toLowerCase().startsWith("fr") || code === "Français" ? "fr" : code.toLowerCase().startsWith("es") || code.toLowerCase() === "español" ? "es" : "en";
  ok(normalized === expected, `normalize(${code}) → ${normalized}, expected ${expected}`);
}
ok(examLanguage.normalizeExamLanguage("auto") === null, "auto is not a content language");
ok(examLanguage.examLanguageLabel("es") === "Spanish", "Spanish label");
ok(examLanguage.examLanguageLabel("fr") === "French", "French label");

// Explicit author setting ALWAYS wins over detection — interface locale is
// never an input to this function.
ok(examLanguage.detectExamLanguage("es", "The quick brown fox answers 42") === "es", "explicit es beats English sample");
ok(examLanguage.detectExamLanguage("fr", "Calculate the value of x") === "fr", "explicit fr beats English sample");
// Spanish content auto-detects.
ok(examLanguage.detectExamLanguage(null, "¿Cuál es la solución? Calcula el número de respuestas.") === "es", "auto-detect Spanish");
ok(examLanguage.detectExamLanguage("auto", "Explain the answer and show your working with the given value") === "en", "auto-detect English");

// ── 2. Source contracts ──
const read = (p) => readFileSync(p, "utf8");

// LanguageSwitcher/Provider: writes ONLY the interface cookie + html lang.
const provider = read("src/components/i18n/I18nProvider.tsx");
ok(provider.includes("document.cookie = `${LOCALE_COOKIE}="), "provider persists locale cookie");
ok(provider.includes(`LOCALE_COOKIE_MAX_AGE`), "cookie has a long-lived max-age");
const setLocaleBody = provider.match(/setLocale = useCallback\(([\s\S]{0,1600}?)\n  \)/)?.[1] ?? "";
ok(setLocaleBody.length > 0, "setLocale body located");
ok(!/exam|paper|question|results_published/i.test(setLocaleBody), "setLocale must not touch exam content state");
ok(/document\.documentElement\.lang = next/.test(setLocaleBody), "setLocale updates <html lang> for the interface only");

// ExamLanguageShield: translate=no mechanism driven by PaperLanguage.
const shield = read("src/components/ExamLanguageShield.tsx");
ok(shield.includes('setAttribute("translate", "no")'), "shield sets translate=no");
ok(shield.includes('classList.add("notranslate")'), "shield adds notranslate class");
ok(shield.includes('name = "google"'), "shield writes google notranslate meta");
ok(shield.includes("html.setAttribute(\"lang\", language)"), "shield sets html lang to PAPER language");

// Take-exam passes the exam's authored language to the shield.
const takeExam = read("src/app/take-exam/[attemptId]/TakeExamClient.tsx");
ok(takeExam.includes("<ExamLanguageShield language={paperLanguage}"), "take-exam shields with authored paper language");
ok(takeExam.includes("const paperLanguage: PaperLanguage = exam.language"), "paper language comes from exam row, not UI locale");

// Author controls content language at creation — workspace + admin.
const newExamForm = read("src/app/dashboard/exams/new/page.tsx");
ok(newExamForm.includes('name="language"'), "workspace exam creation exposes content language");
ok(newExamForm.includes('<option value="es">Spanish</option>'), "workspace creation offers Spanish content");
const adminExamForm = read("src/app/admin/examinations/new/page.tsx");
ok(adminExamForm.includes('<option value="es">Spanish</option>'), "admin creation offers Spanish content");
const adminCreate = read("src/app/admin/examinations/actions.ts");
ok(adminCreate.includes("normalizeExamLanguage(formData.get(\"language\")) ?? \"auto\""), "admin create persists normalized language only");
const wsCreate = read("src/app/dashboard/exams/actions.ts");
ok(wsCreate.includes("normalizeExamLanguage(formData.get(\"language\")) ?? \"auto\""), "workspace create persists normalized language only");

// Root layout lang = interface locale (UI), independent of paper.
const layout = read("src/app/layout.tsx");
// The tag may carry further attributes (data-theme, suppressHydrationWarning);
// what must hold is that `lang` is bound to the resolved interface locale.
ok(/<html\s+lang=\{locale\}[\s>]/.test(layout), "html lang follows interface locale");
ok(layout.includes("getRequestLocale"), "root layout resolves interface locale");

// Candidate APIs never accept a language override from the client.
for (const route of ["src/app/api/exam/state/route.ts", "src/app/api/exam/submit/route.ts"]) {
  const src = read(route);
  ok(!src.includes('formData.get("language")'), `${route} must not read a client-provided content language`);
  ok(!src.includes("language:") || src.includes("detectExamLanguage"), `${route} derives language server-side only`);
}

if (failures.length) {
  console.error(`exam-language-isolation: ${failures.length} FAILURE(S)`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`exam-language-isolation: ${checks} checks passed`);
