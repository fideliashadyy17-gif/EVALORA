/**
 * Pure rules behind the dedicated retake access page.
 *
 * The approval issues a code; the student must type their first name, their
 * last name and that code. Everything that decides whether the code still
 * authorizes an attempt is tested here, without a database: the route can be
 * wrong, these rules must not be.
 *
 * Run: node scripts/test-exam-retake-access.mjs
 */
import { execSync } from "node:child_process";
import { createRequire } from "node:module";

const outDir = "/tmp/evalora-retake-access-test";
execSync(
  `npx tsc src/lib/examRetake.ts --outDir ${outDir} --rootDir src --module commonjs --target es2022 --strict --skipLibCheck`,
  { stdio: "inherit" },
);
const require = createRequire(import.meta.url);
const r = require(`${outDir}/lib/examRetake.js`);

let checks = 0;
const ok = (name, condition) => {
  if (!condition) throw new Error(`FAIL: ${name}`);
  checks += 1;
  console.log(`  ✓ ${name}`);
};

/* ── Codes ────────────────────────────────────────────────────────────── */
const deterministic = (seed) => (size) => Uint8Array.from({ length: size }, (_, i) => seed + i);

const code = r.generateRetakeCode(deterministic(7));
ok("a generated code has the documented length", code.length === r.RETAKE_CODE_LENGTH);
ok("a generated code only uses the unambiguous alphabet", [...code].every((c) => r.RETAKE_CODE_ALPHABET.includes(c)));
ok("a generated code passes its own shape check", r.isValidRetakeCode(code));
ok("every byte position maps inside the alphabet", r.generateRetakeCode(() => Uint8Array.from([0, 1, 2, 3, 4, 5, 249, 250, 251, 252])).length === 10);

ok("typing is case-insensitive", r.normalizeRetakeCode(` ${code.toLowerCase()} `) === code);
ok("spaces and dashes never break a code", r.normalizeRetakeCode(`${code.slice(0, 5)} ${code.slice(5, 7)}-${code.slice(7)}`) === code);
ok("ambiguous characters are dropped from typed input", r.normalizeRetakeCode("O0I1L" + code) === code);
ok("a truncated code is not valid", !r.isValidRetakeCode(code.slice(0, 9)));
ok("an empty code is not valid", !r.isValidRetakeCode("   "));

/* ── Names ────────────────────────────────────────────────────────────── */
ok("names ignore case, accents and extra spaces",
  r.retakeNameMatches({ firstName: "  EMILY ", lastName: "gathoni" }, { firstName: "Emily", lastName: "Gathoni" }));
ok("a diacritic in the stored record is not a lockout",
  r.retakeNameMatches({ firstName: "Jose", lastName: "Nunez" }, { firstName: "José", lastName: "Núñez" }));
ok("a wrong first name is refused",
  !r.retakeNameMatches({ firstName: "Emilie", lastName: "Gathoni" }, { firstName: "Emily", lastName: "Gathoni" }));
ok("a wrong last name is refused",
  !r.retakeNameMatches({ firstName: "Emily", lastName: "Gathon" }, { firstName: "Emily", lastName: "Gathoni" }));
ok("an empty name is refused",
  !r.retakeNameMatches({ firstName: "", lastName: "Gathoni" }, { firstName: "Emily", lastName: "Gathoni" }));
ok("a record that only stores a full name still matches",
  r.retakeNameMatches({ firstName: "Emily", lastName: "Gathoni" }, { fullName: "Emily Gathoni" }));
ok("a full name stored in the other order still matches",
  r.retakeNameMatches({ firstName: "Emily", lastName: "Gathoni" }, { fullName: "Gathoni Emily" }));
ok("a different student's name never matches a full-name record",
  !r.retakeNameMatches({ firstName: "Brian", lastName: "Otieno" }, { fullName: "Emily Gathoni" }));

/* ── What still authorizes an attempt ─────────────────────────────────── */
const now = new Date("2026-11-10T12:00:00.000Z");
const approved = {
  status: "approved",
  access_expires_at: "2026-11-17T12:00:00.000Z",
  granted_attempts: 1,
  retake_code: "ABCDEFGHJK",
  retake_code_consumed_at: null,
};

ok("an approved, unused, in-window code authorizes an attempt", r.retakeAccessProblem(approved, 0, now) === null);
ok("a used-up authorization is refused", r.retakeAccessProblem(approved, 1, now) === "consumed");
ok("a consumed code is refused even before the window closes",
  r.retakeAccessProblem({ ...approved, retake_code_consumed_at: "2026-11-10T13:00:00.000Z" }, 0, now) === "consumed");
ok("an expired window is refused",
  r.retakeAccessProblem({ ...approved, access_expires_at: "2026-11-10T11:59:00.000Z" }, 0, now) === "expired");
ok("a missing window is refused",
  r.retakeAccessProblem({ ...approved, access_expires_at: null }, 0, now) === "expired");
ok("a pending request is never startable", r.retakeAccessProblem({ ...approved, status: "pending" }, 0, now) === "not_approved");
ok("a rejected request is never startable", r.retakeAccessProblem({ ...approved, status: "rejected" }, 0, now) === "rejected");
ok("a cancelled request is never startable", r.retakeAccessProblem({ ...approved, status: "cancelled" }, 0, now) === "rejected");
ok("an approval without a code cannot be redeemed", r.retakeAccessProblem({ ...approved, retake_code: null }, 0, now) === "no_code");
ok("two authorized attempts allow the second one",
  r.retakeAccessProblem({ ...approved, granted_attempts: 2 }, 1, now) === null);
ok("two authorized attempts stop at the third",
  r.retakeAccessProblem({ ...approved, granted_attempts: 2 }, 2, now) === "consumed");
// The column is constrained to 1..3; anything else is clamped rather than
// trusted, so a corrupted row can never authorize an unbounded number of papers.
ok("the granted attempt count is clamped to three",
  r.retakeAccessProblem({ ...approved, granted_attempts: 99 }, 2, now) === null
  && r.retakeAccessProblem({ ...approved, granted_attempts: 99 }, 3, now) === "consumed");

ok("every refusal has student-readable copy",
  ["not_approved", "rejected", "expired", "consumed", "no_code"].every(
    (problem) => typeof r.retakeAccessProblemMessage(problem) === "string" && r.retakeAccessProblemMessage(problem).length > 20,
  ));
ok("the rejection copy states the decision plainly",
  /rejected/i.test(r.retakeAccessProblemMessage("rejected")));
ok("the consumed copy tells the student what to do next",
  /another approval/i.test(r.retakeAccessProblemMessage("consumed")));

console.log(`\n${checks} checks passed — retake access rules (pure module).`);
