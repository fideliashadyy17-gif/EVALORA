/**
 * Functional checks for tenant subdomains, class/student import
 * validation and multi-format document extraction.
 * Run: node scripts/test-school-systems.mjs
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";

const outDir = "/tmp/evalora-school-test";
execSync(
  `npx tsc src/lib/tenant.ts src/lib/studentImport.ts src/lib/extractServer.ts --outDir ${outDir} --rootDir src --module commonjs --target es2022 --esModuleInterop --skipLibCheck --moduleResolution node`,
  { stdio: "inherit" },
);
execSync(`ln -sfn "$(pwd)/node_modules" ${outDir}/node_modules`, { stdio: "inherit" });

const require = createRequire(import.meta.url);
const tenant = require(`${outDir}/lib/tenant.js`);
const imp = require(`${outDir}/lib/studentImport.js`);
const extract = require(`${outDir}/lib/extractServer.js`);

let passed = 0;
const ok = (name, condition) => {
  if (!condition) throw new Error(`FAIL: ${name}`);
  passed += 1;
  console.log(`  ✓ ${name}`);
};

/* ── Tenant subdomains ───────────────────────────────────────────── */
ok("reserved subdomain rejected", !tenant.validateSubdomain("admin").ok);
ok("valid subdomain accepted", tenant.validateSubdomain("Greenwood High").slug === "greenwood-high");
ok("short subdomain rejected", !tenant.validateSubdomain("ab").ok);
ok("demo.localhost resolves", tenant.getTenantSlugFromHost("demo.localhost:3000") === "demo");
ok("www is main site", tenant.getTenantSlugFromHost("www.example.com", "example.com") === null);
ok("root domain is main site", tenant.getTenantSlugFromHost("example.com", "example.com") === null);
ok("school subdomain resolves", tenant.getTenantSlugFromHost("greenwood.example.com", "example.com") === "greenwood");
ok("nested subdomain ignored", tenant.getTenantSlugFromHost("a.b.example.com", "example.com") === null);
ok("vercel preview is not a tenant", tenant.getTenantSlugFromHost("evalora-abc.vercel.app") === null);
ok("suggestions are valid", tenant.subdomainSuggestions("greenwood").every((s) => tenant.validateSubdomain(s).ok));

/* ── Import mapping / normalization / validation ─────────────────── */
ok("header synonym: Matricule", imp.guessFieldForHeader("Matricule") === "student_ref");
ok("header synonym: Classe", imp.guessFieldForHeader("Classe") === "class_name");
ok("header synonym: Date de naissance", imp.guessFieldForHeader("Date de naissance") === "date_of_birth");
ok("header detection", imp.looksLikeHeader(["Full Name", "Email", "Class"]));
ok("date ISO kept", imp.normalizeDateOfBirth("2012-05-14") === "2012-05-14");
ok("date D/M/Y normalized", imp.normalizeDateOfBirth("14/05/2012") === "2012-05-14");
ok("date M/D/Y when unambiguous", imp.normalizeDateOfBirth("05/14/2012") === "2012-05-14");
ok("invalid date rejected", imp.normalizeDateOfBirth("31/02/2012") === null);
ok("gender normalized (Fille)", imp.normalizeGender("Fille") === "female");

const classes = [{ id: "c1", name: "JSS 1A", code: "J1A", academic_year_id: "y1", status: "active" }];
const emptyExisting = () => ({ refs: new Set(), emails: new Set(), nameDob: new Set() });
const rows = [
  ["Full Name", "Email", "Class", "Date of Birth"],
  ["Ada Lovelace", "ada@example.com", "JSS 1A", "2012-05-14"],
  ["Ada Lovelace", "ada@example.com", "JSS 1A", "2012-05-14"],
  ["", "not-an-email", "Unknown 9Z", "31/02/2012"],
];
const mapping = rows[0].map((h) => imp.guessFieldForHeader(h));
const records = imp.rowsToRecords(rows, mapping, true);
ok("records built from rows", records.length === 3 && records[0].full_name === "Ada Lovelace");
const seen = emptyExisting();
const v1 = imp.validateImportRecord(records[0], classes, emptyExisting(), seen, true);
ok("first record valid", v1.errors.length === 0 && !v1.duplicate);
const v2 = imp.validateImportRecord(records[1], classes, emptyExisting(), seen, true);
ok("in-file duplicate detected", v2.duplicate === "in_file");
const v3 = imp.validateImportRecord(records[2], classes, emptyExisting(), seen, true);
ok("missing name + bad email + bad date + unknown class flagged", v3.errors.length >= 4);
const existing = emptyExisting(); existing.emails.add("ada@example.com");
const v4 = imp.validateImportRecord(records[0], classes, existing, emptyExisting(), true);
ok("existing-student duplicate detected", v4.duplicate === "existing");
ok("class resolved by code", imp.resolveClass({ class_id: "", class_name: "j1a" }, classes)?.id === "c1");

/* ── Extraction: CSV / XLSX / PDF / DOCX ─────────────────────────── */
const csv = await extract.extractStudentRows("roster.csv", Buffer.from("full_name;email;class\nAda Lovelace;ada@example.com;JSS 1A\n"));
ok("semicolon CSV extracted", csv.rows.length === 2 && csv.rows[1][0] === "Ada Lovelace");

const XLSX = require("xlsx");
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Students");
const xlsxBuf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
const xls = await extract.extractStudentRows("roster.xlsx", xlsxBuf);
ok("XLSX extracted", xls.rows.length === 4 && xls.rows[1][1] === "ada@example.com");

const pdfPath = "/tmp/test-students.pdf";
if (existsSync(pdfPath)) {
  const pdf = await extract.extractStudentRows("roster.pdf", readFileSync(pdfPath));
  ok("text PDF extracted", pdf.rows.flat().join(" ").includes("Ada Lovelace"));
  ok("text PDF does not need OCR", !pdf.needsOcr);
}

const docx = await extract.extractStudentRows("tables.docx", readFileSync("node_modules/mammoth/test/test-data/tables.docx"));
ok("DOCX tables extracted", docx.rows.length >= 2 && docx.method === "word tables");

let unsupported = false;
try { await extract.extractStudentRows("roster.pages", Buffer.from("x")); } catch { unsupported = true; }
ok("unsupported format rejected", unsupported);

console.log(`\n${passed} school-systems checks passed`);
