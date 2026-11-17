/**
 * Premium examination experience: candidate-name canonicalisation, paper
 * language detection, the entitlement resolution and the forward-only
 * duplicate guard's database contract.
 *
 * These are pure checks plus source-contract checks; the admission route and
 * trigger are exercised by the database verification recorded in the delivery
 * notes.
 */
import { readFileSync } from "node:fs";
import ts from "typescript";

function load(relative) {
  const js = ts.transpileModule(readFileSync(relative, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const exports = {};
  const mod = { exports };
  new Function("exports", "module", "require", js)(exports, mod, () => ({}));
  return mod.exports;
}

const identity = load("src/lib/candidateIdentity.ts");
const language = load("src/lib/examLanguage.ts");
const experience = load("src/lib/examExperience.ts");

let passed = 0;
let failed = 0;
function check(name, condition) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.log(`  ✗ ${name}`);
  }
}

// ── duplicate identity ────────────────────────────────────────────────
check("case and extra whitespace canonicalise to one identity",
  identity.canonicalCandidateName("  AWA   Koffi ") === "awa koffi");
check("non-breaking / full-width spaces cannot bypass the rule",
  identity.canonicalCandidateName("AWA\u00a0\u3000Koffi") === "awa koffi");
check("compatibility characters fold (NFKC)",
  identity.canonicalCandidateName("ＡＷＡ Koffi") === "awa koffi");
check("separate first/last and a stored full name match",
  identity.candidateNamesMatch(
    { first_name: "Awa", last_name: "KOFFI" },
    { full_name: "  awa   koffi " },
  ));
check("different names remain different",
  !identity.candidateNamesMatch(
    { first_name: "Awa", last_name: "Koffi" },
    { first_name: "Awa", last_name: "Koffi2" },
  ));
check("accents are preserved (Zoé is not Zoe)",
  !identity.candidateNamesMatch(
    { first_name: "Zoé", last_name: "Kodingar" },
    { first_name: "Zoe", last_name: "Kodingar" },
  ));
check("the refusal explains that the original attempt is untouched",
  /timer have not been changed/i.test(identity.DUPLICATE_EXAM_CANDIDATE_MESSAGE) &&
  /resume your existing attempt/i.test(identity.DUPLICATE_EXAM_CANDIDATE_MESSAGE));

// ── paper language ────────────────────────────────────────────────────
check("an explicit French paper stays French",
  language.detectExamLanguage("fr", "Calculate the value of x.") === "fr");
check("an explicit English paper stays English",
  language.detectExamLanguage("en", "Calculez la valeur de x.") === "en");
check("French content is detected without a setting",
  language.detectExamLanguage("auto", "Calculez la valeur de x. Expliquez votre réponse dans le tableau.") === "fr");
check("English content is detected without a setting",
  language.detectExamLanguage(null, "Calculate the value of x. Explain your answer in the table.") === "en");
check("language labels are human-readable",
  language.examLanguageLabel("fr") === "French" && language.examLanguageLabel("en") === "English");

// ── premium entitlement ───────────────────────────────────────────────
const premium = experience.examExperienceFromLimits({
  premium_exam_experience: true,
  exam_duplicate_protection: true,
  exam_language_lock: true,
  floating_calculator: true,
  interactive_math_tools: true,
  premium_math_interface: true,
});
check("Premium plans receive all five capabilities",
  premium.premium && premium.duplicateProtection && premium.languageLock &&
  premium.floatingCalculator && premium.interactiveMathTools && premium.premiumMathInterface);
const free = experience.examExperienceFromLimits({
  premium_exam_experience: false,
  exam_duplicate_protection: false,
  exam_language_lock: false,
  floating_calculator: false,
  interactive_math_tools: false,
  premium_math_interface: false,
});
check("Free plans do not receive the premium examination experience",
  !free.premium && !free.duplicateProtection && !free.languageLock &&
  !free.floatingCalculator && !free.interactiveMathTools && !free.premiumMathInterface);
const tailored = experience.examExperienceFromLimits({
  premium_exam_experience: true,
  floating_calculator: false,
  premium_math_interface: false,
});
check("the Super Admin can remove one granular capability without removing the umbrella",
  tailored.premium && !tailored.floatingCalculator && !tailored.premiumMathInterface &&
  tailored.duplicateProtection && tailored.languageLock && tailored.interactiveMathTools);
check("a missing granular value inherits the umbrella (backward-compatible plans)",
  experience.examExperienceFromLimits({ premium_exam_experience: true }).floatingCalculator === true);

// ── source contracts ──────────────────────────────────────────────────
const admission = readFileSync("src/app/api/exam/link-access/route.ts", "utf8");
check("shared-link admission checks a stronger identifier before the name rule",
  admission.includes("candidateNamesMatch") && admission.includes("byStudent") &&
  admission.includes("namedWithIdentity") && admission.includes("DUPLICATE_EXAM_CANDIDATE_MESSAGE"));
check("the insert path translates the database race into the same refusal",
  /EXAM_CANDIDATE_DUPLICATE_NAME[\s\S]{0,200}DUPLICATE_EXAM_CANDIDATE_MESSAGE/.test(admission));
const state = readFileSync("src/app/api/exam/state/route.ts", "utf8");
check("the examination state carries the paper language and premium capability set",
  state.includes("language,") && state.includes("experience,") && state.includes("detectExamLanguage"));
check("optional premium workspaces are withheld for a non-entitled plan",
  state.includes("!experience.interactiveMathTools") && state.includes("premium_tools_limited"));
const migration = readFileSync("supabase/migrations/20261117194556_exam_duplicate_name_guard.sql", "utf8");
check("the database guard is race-safe and does not delete existing rows",
  migration.includes("pg_advisory_xact_lock") && migration.includes("EXAM_CANDIDATE_DUPLICATE_NAME") &&
  !/delete\s+from/i.test(migration) && migration.includes("generated always as"));

console.log(`\n${passed} premium examination checks passed${failed ? `, ${failed} failed` : ""}.`);
process.exit(failed === 0 ? 0 : 1);
