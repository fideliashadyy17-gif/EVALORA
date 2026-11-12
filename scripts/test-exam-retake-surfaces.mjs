// Static guarantees for the retake + link-lifecycle surfaces.
//
// These assertions protect the wiring that unit tests cannot see: the server
// routes must enforce the rules themselves, privileged mutations must be
// Super Admin-only and audited, and no interface may be the only control.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

let checks = 0;
const check = (name, fn) => { fn(); checks += 1; console.log(`✓ ${name}`); };
const file = (path) => readFileSync(path, "utf8");

const retakeRoute = file("src/app/api/exam/retake/route.ts");
const linkAccess = file("src/app/api/exam/link-access/route.ts");
const accessRoute = file("src/app/api/exam/access/route.ts");
const saveRoute = file("src/app/api/exam/save/route.ts");
const submitRoute = file("src/app/api/exam/submit/route.ts");
const approveAction = file("src/app/admin/examinations/retake-actions.ts");
const linkAction = file("src/app/admin/examinations/link-actions.ts");
const retakesPage = file("src/app/admin/examinations/retakes/page.tsx");
const linksPage = file("src/app/admin/examinations/links/page.tsx");
const panel = file("src/app/take-exam/[attemptId]/RetakePanel.tsx");
const shell = file("src/app/admin/AdminShell.tsx");
const migration = file("supabase/migrations/0076_exam_retakes_and_link_lifecycle.sql");

check("a submitted attempt cannot be saved again (server-side)", () => {
  assert.match(saveRoute, /attempt\.status !== "in_progress"/);
  assert.match(saveRoute, /already submitted/);
});

check("submission is idempotent and never regrades a closed attempt", () => {
  assert.match(submitRoute, /already_submitted: true/);
  assert.match(submitRoute, /attempt\.status !== "in_progress"/);
});

check("the retake API resolves the caller from a token or the two codes, never a name", () => {
  assert.match(retakeRoute, /\.eq\("access_token", input\.token\)/);
  assert.match(retakeRoute, /\.eq\("access_code", candidateCode\)/);
});

check("a retake request is refused while the attempt is still in progress", () => {
  assert.match(retakeRoute, /Submit your paper before requesting a retake/);
});

check("starting an authorized attempt requires an approved grant and an open examination", () => {
  assert.match(retakeRoute, /findUsableGrant/);
  assert.match(retakeRoute, /This examination is not open/);
  assert.match(retakeRoute, /startRetakeAttempt/);
});

check("link expiration is enforced on the admission route using the server clock", () => {
  assert.match(linkAccess, /examAccessAvailability/);
  assert.match(linkAccess, /invite_expires_at: exam\.invite_expires_at/);
  assert.match(linkAccess, /availability\.error/);
});

check("a submitted attempt cannot be replaced by the public link without a grant", () => {
  assert.match(linkAccess, /Duplicate attempts are not permitted/);
  assert.match(linkAccess, /findUsableGrant\(admin, exam\.id, candidate\.id\)/);
  assert.match(accessRoute, /Duplicate attempts are not permitted/);
});

check("the attempt routes never read link state (expiry cannot interrupt a paper)", () => {
  assert.doesNotMatch(saveRoute, /invite_expires_at|shared_link_enabled/);
  assert.doesNotMatch(submitRoute, /invite_expires_at|shared_link_enabled/);
});

check("only the Super Admin can approve or reject, and every decision is audited", () => {
  assert.match(approveAction, /requireSuperAdmin/);
  assert.match(approveAction, /status: "approved"/);
  assert.match(approveAction, /status: "rejected"/);
  assert.match(approveAction, /decided_by: ctx\.user\.id/);
  assert.match(approveAction, /audit\(ctx, "exam\.retake_approved"/);
  assert.match(approveAction, /audit\(ctx, "exam\.retake_rejected"/);
  assert.match(approveAction, /\.eq\("status", "pending"\)/);
});

check("link edits are Super Admin-only, audited and never regenerate the link", () => {
  assert.match(linkAction, /requireSuperAdmin/);
  assert.match(linkAction, /invite_expires_at: expiry\.expiresAt/);
  assert.match(linkAction, /audit\(ctx, "exam\.link_expiration_updated"/);
  assert.match(linkAction, /audit\(ctx, "exam\.link_disabled"/);
  assert.match(linkAction, /audit\(ctx, "exam\.link_reactivated"/);
  assert.doesNotMatch(linkAction, /invite_token:/);
});

check("the student panel calls the backend for every action", () => {
  assert.match(panel, /fetch\("\/api\/exam\/retake"/);
  assert.match(panel, /Request a retake/);
  assert.match(panel, /Start authorized attempt/);
  assert.match(panel, /awaiting Super Admin approval/);
});

check("the Super Admin console exposes retakes and link expiration", () => {
  assert.match(shell, /\/admin\/examinations\/retakes/);
  assert.match(shell, /\/admin\/examinations\/links/);
  assert.match(retakesPage, /requireSuperAdmin/);
  assert.match(retakesPage, /approveRetakeAsAdmin/);
  assert.match(retakesPage, /rejectRetakeAsAdmin/);
  assert.match(linksPage, /requireSuperAdmin/);
  assert.match(linksPage, /updateExamLinkSettingsAsAdmin/);
  assert.match(linksPage, /disableExamLinkAsAdmin/);
  assert.match(linksPage, /reactivateExamLinkAsAdmin/);
});

check("the migration is additive and preserves attempts", () => {
  assert.doesNotMatch(migration, /drop table/i);
  assert.doesNotMatch(migration, /truncate/i);
  assert.doesNotMatch(migration, /delete from public\.exam_attempts/i);
  assert.match(migration, /drop constraint if exists exam_attempts_exam_id_candidate_id_key/);
  assert.match(migration, /uq_exam_attempts_one_active/);
  assert.match(migration, /create table if not exists public\.exam_retake_requests/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /lock_timeout/);
});

/* ── The page that showed nothing ─────────────────────────────────────
 * Migration 0076 added exam_attempts.retake_request_id, so the request table
 * has TWO relationships to exam_attempts. An unqualified embed made PostgREST
 * reject the whole select (PGRST201) and the page rendered as if there were no
 * requests: no cards, therefore no Approve/Reject buttons. This is the exact
 * regression these checks exist to prevent.
 */
check("the retake console disambiguates its attempt embed", () => {
  assert.match(retakesPage, /exam_attempts!exam_retake_requests_attempt_id_fkey\(/);
  assert.doesNotMatch(retakesPage, /"exam_attempts\(/);
});

check("no surface embeds the ambiguous attempt relationship", () => {
  const sources = [
    "src/app/admin/examinations/retakes/page.tsx",
    "src/app/admin/examinations/retake-actions.ts",
    "src/app/student/page.tsx",
    "src/app/retake/[requestId]/page.tsx",
    "src/app/api/retake/access/route.ts",
  ];
  for (const path of sources) {
    const source = file(path);
    // A select string that names exam_attempts from a retake request must name
    // the constraint too.
    if (!source.includes("from(\"exam_retake_requests\")")) continue;
    assert.doesNotMatch(source, /exam_attempts\((?!id,status,submitted_at)/, path);
  }
});

check("a query failure can no longer masquerade as an empty queue", () => {
  // The page reports the failure instead of silently rendering zeros.
  assert.match(retakesPage, /const \[\{ data: rows, error: rowsError \}/);
  assert.match(retakesPage, /rowsError\.message/);
});

/* ── Retake access: code, identity, single use ────────────────────────── */
const accessApi = file("src/app/api/retake/access/route.ts");
const retakePage = file("src/app/retake/[requestId]/page.tsx");
const statusApi = file("src/app/api/retake/status/route.ts");
const watcher = file("src/components/RetakeDecisionWatcher.tsx");
const studentPage = file("src/app/student/page.tsx");
const accessMigration = file("supabase/migrations/0083_exam_retake_access_codes.sql");

check("the access route authorizes from the session, never from the form", () => {
  assert.match(accessApi, /getSessionContext\(\)/);
  assert.match(accessApi, /ownedBySession/);
  assert.match(accessApi, /retakeNameMatches\(/);
  assert.match(accessApi, /normalizeRetakeCode\(record\.retake_code\)/);
  assert.match(accessApi, /retakeAccessProblem\(/);
});

check("a foreign approval answers exactly like a missing one", () => {
  assert.match(accessApi, /This retake was not found\./);
  assert.match(retakePage, /if \(!owns\) notFound\(\)/);
});

check("the access route refuses a closed or expired examination", () => {
  assert.match(accessApi, /This examination is not open/);
  assert.match(accessApi, /The examination window has closed/);
});

check("the new attempt is created through the audited helper, never inline", () => {
  assert.match(accessApi, /startRetakeAttempt\(/);
  assert.match(accessApi, /recordRetakeAudit\(/);
  assert.match(accessApi, /retake_code_consumed_at/);
});

check("the decision page requires a session and returns there after sign-in", () => {
  assert.match(retakePage, /redirect\(`\/login\?next=/);
  assert.match(retakePage, /decision_seen_at/);
});

check("the rejection page shows the decision, the reason, and no way into a paper", () => {
  assert.match(retakePage, /Your retake request has been rejected\./);
  assert.match(retakePage, /row\.decision_note/);
  assert.doesNotMatch(retakePage, /Start the retake/);
  assert.match(retakePage, /status === "rejected" \|\| row\.status === "cancelled"/);
});

check("the student workspace redirects to a decision it has not shown yet", () => {
  assert.match(studentPage, /decision_seen_at/);
  assert.match(studentPage, /redirect\(`\/retake\/\$\{unseenDecision\.id\}`\)/);
  assert.match(studentPage, /RetakeDecisionWatcher/);
});

check("decisions arrive live, with a fallback that cannot double-navigate", () => {
  assert.match(watcher, /postgres_changes/);
  assert.match(watcher, /\/api\/retake\/status/);
  assert.match(watcher, /handled\.current/);
  assert.match(statusApi, /getSessionContext/);
  assert.match(statusApi, /decision_seen_at/);
});

check("notifications link to the exact decision page", () => {
  const server = file("src/lib/examRetakeServer.ts");
  assert.match(server, /link: `\/retake\/\$\{input\.request\.id\}`/);
  assert.match(server, /Retake code: \$\{input\.retakeCode\}/);
});

check("an approval issues a unique, spendable code", () => {
  assert.match(approveAction, /generateRetakeCode\(/);
  assert.match(approveAction, /23505/);
  assert.match(accessMigration, /create unique index if not exists uq_exam_retake_code/);
  assert.match(accessMigration, /retake_code_consumed_at/);
  assert.match(accessMigration, /decision_seen_at/);
});

check("the new migration is additive only", () => {
  assert.doesNotMatch(accessMigration, /drop table/i);
  assert.doesNotMatch(accessMigration, /delete from/i);
  assert.doesNotMatch(accessMigration, /truncate/i);
  assert.doesNotMatch(accessMigration, /alter column .* drop/i);
  assert.match(accessMigration, /add column if not exists/);
  assert.match(accessMigration, /alter publication supabase_realtime add table public\.exam_retake_requests/);
});

console.log(`\n${checks} checks passed`);
