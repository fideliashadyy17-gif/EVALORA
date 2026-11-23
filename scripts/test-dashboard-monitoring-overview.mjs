import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const chrome = readFileSync("src/components/dashboard/DashboardChrome.tsx", "utf8");
const overview = readFileSync("src/app/dashboard/monitoring/page.tsx", "utf8");
const monitorPage = readFileSync("src/app/dashboard/exams/[id]/monitor/page.tsx", "utf8");
const monitorClient = readFileSync("src/app/dashboard/exams/[id]/monitor/ExamMonitor.tsx", "utf8");
const monitorApi = readFileSync("src/app/api/monitor/exams/[id]/route.ts", "utf8");

assert.match(chrome, /href: "\/dashboard\/monitoring", label: "Live Exam Monitoring"/);
assert.match(chrome, /roles: \["owner", "admin", "teacher", "supervisor", "corrector"\]/);
assert.match(chrome, /\.filter\(\(item\) => !item\.roles \|\| item\.roles\.includes\(orgRole \?\? ""\)\)/);
assert.match(chrome, /capability: "examinations"/);

assert.match(overview, /const ctx = await requireUser\(\)/);
assert.match(overview, /can\(ctx, org\.id, PROCTOR_ROLES\)/);
assert.match(overview, /getCapabilities\(supabase, ctx, org\.id\)/);
assert.match(overview, /if \(!capabilities\.examinations\)/);
assert.match(overview, /\.eq\("organization_id", org\.id\)/);
assert.match(overview, /\.eq\("exams\.organization_id", org\.id\)/);
assert.match(overview, /\.eq\("status", "in_progress"\)/);
assert.match(overview, /href=\{`\/dashboard\/exams\/\$\{exam\.id\}\/monitor`\}/);
assert.doesNotMatch(overview, /\.insert\(|\.update\(|\.delete\(|\.rpc\(/);
assert.doesNotMatch(overview, /access_token|access_code|question_order|exam_answers/);

// The index reuses, rather than replaces, the existing secure realtime monitor.
assert.match(monitorPage, /loadMonitorSnapshot\(supabase, id\)/);
assert.match(monitorPage, /can\(ctx, loaded\.exam\.organization_id, PROCTOR_ROLES\)/);
assert.match(monitorApi, /staffExamAccess\(id\)/);
assert.match(monitorApi, /loadMonitorSnapshot\(access\.supabase, id\)/);
assert.match(monitorClient, /\.channel\(`exam-monitor-\$\{examId\}`\)/);
assert.match(monitorClient, /\/api\/monitor\/exams\/\$\{examId\}/);
assert.match(monitorClient, /MONITOR_RECONCILE_MS/);

console.log("Live monitoring overview: role, entitlement, tenant, read-only and existing realtime integration checks passed.");
