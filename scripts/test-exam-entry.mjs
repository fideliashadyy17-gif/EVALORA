// Run: node scripts/test-exam-entry.mjs
// The `/exam` entry page: "/exam" used to 404, which is what a student gets when
// they type the bare address instead of pasting their invitation link.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { Module } from "node:module";
import path from "node:path";
import ts from "typescript";

const source = readFileSync("src/lib/examEntry.ts", "utf8");
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const file = path.resolve("scripts/__virtual_exam_entry_test.cjs");
const mod = new Module(file);
mod.filename = file;
mod.paths = Module._nodeModulePaths(path.dirname(file));
mod._compile(js, file);
const { parseExamEntryInput, examEntryHref, normalizeAccessCode } = mod.exports;

let passed = 0;
function ok(name, condition) {
  assert.ok(condition, name);
  console.log(`  ✓ ${name}`);
  passed++;
}

const TOKEN = "3f867709-0d11-4649-909d-a6a72e120783";

/* ── What the candidate typed ── */
ok("nothing typed is not an error", parseExamEntryInput(null).kind === "empty" && parseExamEntryInput("   ").kind === "empty");
ok("an access code is recognised and upper-cased", (() => {
  const parsed = parseExamEntryInput("  myp4-stat-2026 ");
  return parsed.kind === "code" && parsed.code === "MYP4-STAT-2026";
})());
ok("a bare invitation token is recognised", (() => {
  const parsed = parseExamEntryInput(TOKEN);
  return parsed.kind === "token" && parsed.token === TOKEN;
})());
ok("a pasted invitation link is recognised", (() => {
  const parsed = parseExamEntryInput(`https://evalora-six.vercel.app/exam/join/${TOKEN}`);
  return parsed.kind === "link" && parsed.token === TOKEN && parsed.code === null;
})());
ok("a pasted link keeps the access code it carries", (() => {
  const parsed = parseExamEntryInput(`https://evalora-six.vercel.app/exam/join/${TOKEN}?code=myp4-stat-2026`);
  return parsed.kind === "link" && parsed.code === "MYP4-STAT-2026";
})());
ok("a trailing slash does not break the link", parseExamEntryInput(`https://evalora-six.vercel.app/exam/join/${TOKEN}/`).kind === "link");

/* ── Nothing else is forwarded, nothing external is produced ── */
ok("extra parameters in a pasted link are dropped", (() => {
  const href = examEntryHref(parseExamEntryInput(`https://evalora-six.vercel.app/exam/join/${TOKEN}?code=ABC12345&next=//evil.example`));
  return href === `/exam/join/${TOKEN}?code=ABC12345`;
})());
ok("the destination is always an internal /exam/join path", [
  `https://evalora-six.vercel.app/exam/join/${TOKEN}`,
  TOKEN,
  "ABC12345",
].map((raw) => examEntryHref(parseExamEntryInput(raw))).every((href) => href === null || (href.startsWith("/exam/join/") && !href.startsWith("//"))));
ok("a non-examination URL is rejected", parseExamEntryInput("https://evil.example/phish").kind === "invalid");
ok("a javascript: URL is rejected", parseExamEntryInput("javascript:alert(1)").kind === "invalid");
ok("a uuid buried in a long string is rejected", parseExamEntryInput(`${"a".repeat(80)}${TOKEN}`).kind === "invalid");
ok("a too-short code is rejected", parseExamEntryInput("ABC").kind === "invalid");
ok("garbage with spaces is rejected", parseExamEntryInput("open the exam please!").kind === "invalid");
ok("an access code is never turned into a link by the parser", examEntryHref(parseExamEntryInput("MYP4-STAT-2026")) === null);
ok("normalisation trims and upper-cases", normalizeAccessCode("  myp4-stat-2026 ") === "MYP4-STAT-2026");

/* ── The page itself ── */
const page = readFileSync("src/app/exam/page.tsx", "utf8");
ok("the /exam route exists", existsSync("src/app/exam/page.tsx"));
ok("it is rendered per request, never cached", /export const dynamic = "force-dynamic"/.test(page));
ok("a typed code is matched against the stored hash, not the plain code", /access_code_hash/.test(page) && /sha256\(input\.code\)/.test(page) && !/access_code\b(?!_hash)/.test(page));
ok("only an open, shared-link assessment can be resolved", /\.eq\("status", "open"\)/.test(page) && /\.eq\("shared_link_enabled", true\)/.test(page));
ok("it redirects only when exactly one assessment matches", /matches\?\.length === 1/.test(page));
ok("it never selects questions, options or answers", !/questions|question_options|answer_key|is_correct/.test(page));
ok("the failure copy is generic, whatever the reason", /No open assessment answered to/.test(page) && /That link or code is not complete/.test(page) && !/this code does not exist|code not found/i.test(page));
ok("it accepts the link, the token or the code", /parseExamEntryInput/.test(page) && /examEntryHref/.test(page));
ok("it points exam-code candidates to the candidate access page", /\/exam-access/.test(page));
ok("internal links use next/link", /import Link from "next\/link"/.test(page) && !/<a href="\//.test(page));
ok("the form submits by GET to /exam so the code never lands in a POST body log", /<form action="\/exam" method="get"/.test(page));
ok("the field is labelled for screen readers", /<label htmlFor="exam-code"/.test(page) && /id="exam-code"/.test(page));

console.log(`\n${passed} checks passed.`);
