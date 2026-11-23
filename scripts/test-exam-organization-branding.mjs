import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const checks = [];
function check(label, condition) {
  assert.ok(condition, label);
  checks.push(label);
}

const brandComponent = await read("src/components/ExamBrandHeader.tsx");
const joinPage = await read("src/app/exam/join/[token]/page.tsx");
const joinClient = await read("src/app/exam/join/[token]/JoinClient.tsx");
const accessPage = await read("src/app/exam-access/page.tsx");
const accessClient = await read("src/app/exam-access/ExamAccessClient.tsx");
const stateRoute = await read("src/app/api/exam/state/route.ts");
const takeClient = await read("src/app/take-exam/[attemptId]/TakeExamClient.tsx");
const resultPage = await read("src/app/exam/result/[token]/page.tsx");
const migration = await read("supabase/migrations/20261123135246_restore_oak_organization_exam_branding.sql");
const logoPath = new URL("public/brand/oak-international-school-logo.webp", root);
const logo = await readFile(logoPath);

check("supplied logo extraction is a WebP image", logo.subarray(0, 4).toString() === "RIFF" && logo.subarray(8, 12).toString() === "WEBP");
check("logo asset is compact for responsive student headers", (await stat(logoPath)).size < 100_000);
check("exam identity uses the organization's persisted name and logo URL", /organization\.name/.test(brandComponent) && /organization\.logo_url/.test(brandComponent));
check("exam header retains EVALORA and exact platform credit", /<Logo/.test(brandComponent) && /<PlatformCredit/.test(brandComponent) && /Powered by M\. SADIKOU/.test(await read("src/components/PlatformCredit.tsx")));
check("logo dimensions are reserved and the original aspect ratio is preserved", /object-contain/.test(brandComponent) && /width=\{compact \? 40 : 52\}/.test(brandComponent));
check("shared exam access resolves organization by the exam's organization_id", /from\("organizations"\)[\s\S]*?eq\("id", exam\.organization_id\)/.test(joinPage));
check("candidate invitation page renders the organization header", /organization=\{organization\}/.test(joinPage) && /ExamBrandHeader organization=\{organization\}/.test(joinClient));
check("legacy code entry includes organization identity when an exam is resolved", /organization=\{organization\}/.test(accessPage) && /ExamBrandHeader organization=\{organization\}/.test(accessClient));
check("authenticated attempt state fetches branding from its own exam organization", /eq\("id", exam\.organization_id\)/.test(stateRoute) && /    organization,/.test(stateRoute));
check("active, question navigation, review and submission use a persistent identity header", /exam-header sticky top-0[\s\S]*?ExamBrandHeader[\s\S]*?organization=\{state\.organization\}/.test(takeClient));
check("submitted candidate results inherit organization branding", /ExamBrandHeader organization=\{organization\}/.test(resultPage));
check("migration brands only the existing Oak organization by immutable ID and preserves its current slug", /where id = '0a400000-0000-4000-8000-000000000001'::uuid/.test(migration) && !/slug\s*=/.test(migration) && /set name = 'Oak International School',[\s\S]*?logo_url = '\/brand\/oak-international-school-logo\.webp'/.test(migration) && !/update public\.(exams|exam_attempts|questions|exam_answers)/.test(migration));
check("organization header is multi-tenant and contains no Oak-specific name or path", !/Oak International School|oak-international-school/.test(brandComponent));

console.log(`${checks.length} checks passed`);
for (const label of checks) console.log(`✓ ${label}`);
