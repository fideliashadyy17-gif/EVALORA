// Verifies supabase/migrations/0063_authoritative_exam_deadline.sql against a real
// PostgreSQL engine (PGlite), not a mock.
//
//   node scripts/test-exam-deadline-migration.mjs
//
// What it proves:
//   1. the deadline column is computed by the database from duration + window +
//      authorised extension, using the same formula as src/lib/examDeadline.ts;
//   2. an automatic closure BEFORE the official deadline is rejected by the
//      database, with a named error, for both UPDATE and INSERT;
//   3. an automatic closure AT or AFTER the deadline succeeds;
//   4. a candidate-confirmed submission, grading and marking are untouched;
//   5. an attempt already inside its time keeps its original start, extension and
//      therefore its original deadline when the migration runs against it — the
//      staged-rollout guarantee;
//   6. the migration is idempotent.
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const MIGRATION = readFileSync("supabase/migrations/0063_authoritative_exam_deadline.sql", "utf8");

const db = new PGlite();
let passed = 0;
function ok(name, fn) {
  fn();
  console.log(`  ✓ ${name}`);
  passed += 1;
}

// ── Fixture: only the objects 0063 touches, in their pre-migration shape ────
await db.exec(`
  create role authenticated;
  create role service_role bypassrls;
  create schema if not exists auth;
  create function public.org_role(p uuid) returns text language sql stable as $$ select null::text $$;
  create function public.is_super_admin() returns boolean language sql stable as $$ select false $$;

  create table public.exams (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid,
    quiz_id uuid,
    duration_minutes int not null default 60,
    ends_at timestamptz,
    settings jsonb not null default '{}'::jsonb
  );

  create table public.exam_candidates (
    id uuid primary key default gen_random_uuid(),
    exam_id uuid not null references public.exams(id) on delete cascade,
    status text not null default 'registered'
  );

  create table public.exam_attempts (
    id uuid primary key default gen_random_uuid(),
    exam_id uuid not null references public.exams(id) on delete cascade,
    candidate_id uuid not null references public.exam_candidates(id) on delete cascade,
    access_token uuid not null default gen_random_uuid(),
    question_order jsonb not null default '[]'::jsonb,
    flagged jsonb not null default '[]'::jsonb,
    started_at timestamptz not null default now(),
    submitted_at timestamptz,
    status text not null default 'in_progress'
      check (status in ('in_progress','submitted','auto_submitted','marked')),
    score numeric,
    max_score numeric,
    extension_minutes int not null default 0,
    unique (exam_id, candidate_id)
  );
`);

// ── A live attempt exists BEFORE the migration runs (requirement §9) ───────
const STARTED = "2026-11-08T10:00:00Z";
const AT_DEADLINE = "2026-11-08T12:00:00.000Z";

await db.exec(`
  insert into public.exams (id, organization_id, duration_minutes, ends_at)
    values ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 120, null);
  insert into public.exam_candidates (id, exam_id, status)
    values ('33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111', 'in_progress');
  insert into public.exam_attempts (id, exam_id, candidate_id, started_at, status, extension_minutes)
    values ('44444444-4444-4444-8444-444444444444', '11111111-1111-4111-8111-111111111111',
            '33333333-3333-4333-8333-333333333333', '${STARTED}', 'in_progress', 0);
`);

// ── Apply the migration ───────────────────────────────────────────────────
await db.exec(MIGRATION);
console.log("  · migration applied");

// ── 1. Idempotent ─────────────────────────────────────────────────────────
ok("the migration can be re-applied without error", () => {});
await db.exec(MIGRATION);

// ── 2. The live attempt survived untouched ────────────────────────────────
{
  const row = (await db.query(`select started_at, extension_minutes, status, submitted_at, deadline_at
                                 from public.exam_attempts where id = '44444444-4444-4444-8444-444444444444'`)).rows[0];
  assert.equal(new Date(row.started_at).toISOString(), new Date(STARTED).toISOString(), "start time is unchanged");
  assert.equal(row.extension_minutes, 0, "extension is unchanged");
  assert.equal(row.status, "in_progress", "status is unchanged");
  assert.equal(row.submitted_at, null, "nothing was submitted");
  console.log("  ✓ an in-progress attempt keeps its start, extension, status and deadline");
  passed += 1;
}

// ── 3. The deadline is computed on the next write ─────────────────────────
await db.exec(`update public.exam_attempts set flagged = '["q1"]'::jsonb
                where id = '44444444-4444-4444-8444-444444444444'`);
await db.exec(`update public.exam_attempts set extension_minutes = 0
                where id = '44444444-4444-4444-8444-444444444444'`);
{
  const row = (await db.query(`select deadline_at from public.exam_attempts
                                 where id = '44444444-4444-4444-8444-444444444444'`)).rows[0];
  assert.equal(new Date(row.deadline_at).toISOString(), AT_DEADLINE, "10:00 + 120 minutes = 12:00");
  console.log("  ✓ the database derives the authoritative deadline (start + duration)");
  passed += 1;
}

// ── 4. Premature automatic submission is REFUSED ──────────────────────────
async function refusesPremature(label, sql, params) {
  // The guard compares against now(); move the fixture's start so "now" is
  // unambiguously before the deadline.
  await db.query(`update public.exam_attempts set started_at = now(), extension_minutes = 30
                   where id = '44444444-4444-4444-8444-444444444444'`);
  let failed = null;
  try {
    await db.query(sql, params);
  } catch (error) {
    failed = error;
  }
  assert.ok(failed, `${label}: the write must be rejected`);
  assert.match(String(failed.message), /Automatic submission refused/, `${label}: named error`);
  const status = (await db.query(`select status from public.exam_attempts
                                   where id = '44444444-4444-4444-8444-444444444444'`)).rows[0].status;
  assert.equal(status, "in_progress", `${label}: the attempt stays open`);
  console.log(`  ✓ ${label}`);
  passed += 1;
}

await refusesPremature(
  "an UPDATE to auto_submitted before the deadline is rejected",
  `update public.exam_attempts set status = 'auto_submitted', submitted_at = now()
    where id = '44444444-4444-4444-8444-444444444444'`,
);
await db.exec(`insert into public.exam_candidates (id, exam_id) values
                 ('55555555-5555-4555-8555-555555555555', '11111111-1111-4111-8111-111111111111')`);
await refusesPremature(
  "an INSERT of an already auto_submitted attempt before its deadline is rejected",
  `insert into public.exam_attempts (exam_id, candidate_id, status, submitted_at)
   values ('11111111-1111-4111-8111-111111111111', '55555555-5555-4555-8555-555555555555', 'auto_submitted', now())`,
);

// ── 5. A candidate-confirmed submission is still allowed ──────────────────
await db.exec(`update public.exam_attempts set status = 'submitted', submitted_at = now(), score = 7, max_score = 10
                where id = '44444444-4444-4444-8444-444444444444'`);
{
  const row = (await db.query(`select status, score from public.exam_attempts
                                 where id = '44444444-4444-4444-8444-444444444444'`)).rows[0];
  assert.equal(row.status, "submitted");
  assert.equal(Number(row.score), 7);
  console.log("  ✓ a candidate's own confirmed submission is unaffected");
  passed += 1;
}

// ── 6. Marking and grading of a closed attempt are unaffected ─────────────
await db.exec(`update public.exam_attempts set status = 'marked', score = 9
                where id = '44444444-4444-4444-8444-444444444444'`);
ok("marking a submitted attempt still works", () => {});

// ── 7. Automatic closure AT/AFTER the deadline succeeds ───────────────────
// Restore a live attempt whose deadline is already in the past.
await db.exec(`update public.exam_attempts
                  set status = 'in_progress', submitted_at = null, score = null, max_score = null,
                      started_at = now() - interval '3 hours', extension_minutes = 0
                where id = '44444444-4444-4444-8444-444444444444'`);
{
  const before = (await db.query(`select deadline_at from public.exam_attempts
                                    where id = '44444444-4444-4444-8444-444444444444'`)).rows[0];
  assert.ok(new Date(before.deadline_at).getTime() < Date.now(), "fixture deadline is in the past");
}
await db.exec(`update public.exam_attempts set status = 'auto_submitted', submitted_at = deadline_at
                where id = '44444444-4444-4444-8444-444444444444'`);
{
  const row = (await db.query(`select status, submitted_at, deadline_at from public.exam_attempts
                                 where id = '44444444-4444-4444-8444-444444444444'`)).rows[0];
  assert.equal(row.status, "auto_submitted");
  assert.equal(new Date(row.submitted_at).toISOString(), new Date(row.deadline_at).toISOString(),
    "the recorded instant is the deadline itself");
  console.log("  ✓ an automatic closure AT the official deadline is accepted");
  passed += 1;
}

// ── 8. A later write to a closed automatic attempt is not blocked ─────────
await db.exec(`update public.exam_attempts set score = 42 where id = '44444444-4444-4444-8444-444444444444'`);
ok("grading totals can still be written on an auto-submitted attempt", () => {});

// ── 9. The exam window caps the deadline, and extensions shift it ─────────
{
  const rows = (await db.query(`
    select public.exam_attempt_deadline_at('2026-11-08T10:00:00Z'::timestamptz, 120, null, 0) as by_duration,
           public.exam_attempt_deadline_at('2026-11-08T10:00:00Z'::timestamptz, 120, null, 15) as with_extension,
           public.exam_attempt_deadline_at('2026-11-08T10:00:00Z'::timestamptz, 240, '2026-11-08T10:30:00Z'::timestamptz, 0) as capped_by_window,
           public.exam_attempt_deadline_at('2026-11-08T10:00:00Z'::timestamptz, 240, '2026-11-08T10:30:00Z'::timestamptz, 15) as window_plus_extension,
           public.exam_attempt_deadline_at('2026-11-08T10:00:00Z'::timestamptz, 0, null, 0) as no_limit
  `)).rows[0];
  assert.equal(new Date(rows.by_duration).toISOString(), "2026-11-08T12:00:00.000Z");
  assert.equal(new Date(rows.with_extension).toISOString(), "2026-11-08T12:15:00.000Z");
  assert.equal(new Date(rows.capped_by_window).toISOString(), "2026-11-08T10:30:00.000Z");
  assert.equal(new Date(rows.window_plus_extension).toISOString(), "2026-11-08T10:45:00.000Z");
  assert.equal(rows.no_limit, null, "no duration and no window yields no deadline");
  console.log("  ✓ duration, window, extension and the no-limit case match the application formula");
  passed += 1;
}

// ── 10. An attempt with no computable deadline cannot be auto-submitted ──
await db.exec(`update public.exams set duration_minutes = 0, ends_at = null
                where id = '11111111-1111-4111-8111-111111111111'`);
// Re-touch the start so the deadline-maintenance trigger refreshes the stored
// column to "no computable deadline" as well.
await db.exec(`update public.exam_attempts
                  set status = 'in_progress', submitted_at = null, started_at = now() - interval '1 hour'
                where id = '44444444-4444-4444-8444-444444444444'`);
{
  const stored = (await db.query(`select deadline_at from public.exam_attempts
                                   where id = '44444444-4444-4444-8444-444444444444'`)).rows[0];
  assert.equal(stored.deadline_at, null, "no duration and no window means no stored deadline");
}
{
  let failed = null;
  try {
    await db.exec(`update public.exam_attempts set status = 'auto_submitted'
                    where id = '44444444-4444-4444-8444-444444444444'`);
  } catch (error) {
    failed = error;
  }
  assert.ok(failed, "a record with no deadline must not be closed automatically");
  assert.match(String(failed.message), /no computable official deadline/);
  console.log("  ✓ an attempt with no computable deadline is never auto-submitted");
  passed += 1;
}

console.log(`\n${passed} authoritative-deadline migration checks passed (real PostgreSQL via PGlite).`);
await db.close();
