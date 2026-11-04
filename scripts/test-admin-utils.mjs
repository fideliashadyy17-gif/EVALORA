/**
 * Unit checks for the pure logic behind the Owner Control Center:
 * CSV import parsing/validation inputs, code generation, CSV export.
 * Run: node scripts/test-admin-utils.mjs  (compiles the TS sources first)
 */
import { execSync } from "node:child_process";
import { createRequire } from "node:module";

execSync(
  "npx tsc src/lib/csv.ts src/lib/utils.ts --outDir /tmp/evalora-test --module commonjs --target es2022 --esModuleInterop --skipLibCheck --moduleResolution node",
  { stdio: "inherit" },
);
// Compiled utils.js requires clsx/tailwind-merge — make them resolvable from /tmp.
execSync("ln -sf \"$(pwd)/node_modules\" /tmp/evalora-test/node_modules");
const require = createRequire(import.meta.url);
const { parseCsv, parseCsvRecords, isEmail } = require("/tmp/evalora-test/csv.js");
const { genCode, toCsv, slugify } = require("/tmp/evalora-test/utils.js");

let passed = 0;
const ok = (name, cond) => {
  if (!cond) throw new Error(`FAIL: ${name}`);
  passed++;
  console.log(`  ✓ ${name}`);
};

// CSV parsing: headers normalized, quoted commas, CRLF, BOM
const csv = "\uFEFFfull_name,student_ref,email\r\n\"Ade, yemi\",STU-1,adeyemi@example.com\r\nOr,STU-2,bad-email\n";
const { headers, records } = parseCsvRecords(csv);
ok("headers normalized", headers.join(",") === "full_name,student_ref,email");
ok("quoted comma preserved", records[0].full_name === "Ade, yemi");
ok("CRLF rows parsed", records.length === 2);
ok("email validator accepts valid", isEmail(records[0].email));
ok("email validator rejects invalid", !isEmail(records[1].email));
ok("blank lines dropped", parseCsv("a,b\n\n1,2\n").length === 2);

// Code generation: shape + uniqueness over a sample
const codes = new Set(Array.from({ length: 2000 }, () => genCode(6)));
ok("codes are 6 chars from safe alphabet", [...codes].every((c) => /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(c)));
ok("codes are effectively unique", codes.size > 1990);

// CSV export escaping
const out = toCsv([["Name", "Note"], ["A, B", 'said "hi"']]);
ok("CSV export quotes commas", out.includes('"A, B"'));
ok("CSV export doubles quotes", out.includes('"said ""hi"""'));

// Slugs used for organizations
ok("slugify accents", slugify("Lycée Classique de Porto-Novo") === "lycee-classique-de-porto-novo");

console.log(`\nAll ${passed} admin-utility checks passed.`);
