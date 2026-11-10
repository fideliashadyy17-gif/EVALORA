// Migration 0076 in an isolated PGlite database.
//
// Proves the database-level guarantees, not just the TypeScript ones:
//   * permanent links are backfilled to an expiry and never left permanent;
//   * a retake can only be requested for a SUBMITTED attempt, in the same
//     tenant, candidate and examination;
//   * one pending request per candidate/examination (concurrent duplicates fail);
//   * an approval needs an access window and cannot be re-decided;
//   * a second attempt is a NEW row; the original attempt and its answers are
//     untouched;
//   * one ACTIVE attempt per candidate, and unique attempt numbers.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
let checks = 0;
const check = (name, fn) => { fn(); checks += 1; console.log(`✓ ${name}`); };
const query = (sql, params) => db.query(sql, params);
const one = async (sql, params) => (await query(sql, params)).rows[0];

try {
  await db.exec(`
    create schema if not exists auth;
    create role authenticated;
    create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
    create function public.is_super_admin() returns boolean language sql stable as $$ select false $$;
    create function public.org_role(uuid) returns text language sql stable as $$ select null::text $$;

    create table public.profiles (id uuid primary key, platform_role text not null default 'user');
    create table public.organizations (id uuid primary key, name text not null);
    create table public.exams (
      id uuid primary key,
      organization_id uuid not null references public.organizations(id),
      title text not null,
      status text not null default 'draft',
      access_code text,
      settings jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      starts_at timestamptz,
      ends_at timestamptz,
      invite_token uuid not null,
      invite_expires_at timestamptz,
      shared_link_enabled boolean not null default true
    );
    create table public.students (
      id uuid primary key,
      organization_id uuid not null references public.organizations(id),
      user_id uuid,
      full_name text not null
    );
    create table public.exam_candidates (
      id uuid primary key,
      exam_id uuid not null references public.exams(id),
      full_name text not null,
      student_id uuid references public.students(id),
      status text not null default 'registered'
    );
    create table public.exam_attempts (
      id uuid primary key,
      exam_id uuid not null references public.exams(id),
      candidate_id uuid not null references public.exam_candidates(id),
      access_token uuid not null,
      status text not null default 'in_progress',
      started_at timestamptz not null default now(),
      submitted_at timestamptz,
      score numeric,
      max_score numeric,
      question_order jsonb not null default '[]'::jsonb,
      identity_data jsonb not null default '{}'::jsonb,
      unique (exam_id, candidate_id)
    );
    create table public.exam_answers (
      id uuid primary key,
      attempt_id uuid not null references public.exam_attempts(id),
      question_id uuid not null,
      answer jsonb not null default '{}'::jsonb
    );
    create table public.platform_settings (key text primary key, value jsonb not null, updated_at timestamptz not null default now());

    insert into public.organizations values
      ('11111111-1111-1111-1111-111111111111', 'School A'),
      ('22222222-2222-2222-2222-222222222222', 'School B');
    insert into public.profiles values ('33333333-3333-3333-3333-333333333333', 'super_admin');
    insert into public.students values ('44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 'Amina Student');
    insert into public.exams (id, organization_id, title, status, access_code, invite_token, invite_expires_at)
      values ('55555555-5555-5555-5555-555555555555', '11111111-1111-1111-1111-111111111111', 'Legacy permanent link', 'open', 'LEGACY01', gen_random_uuid(), null);
    insert into public.exams (id, organization_id, title, status, access_code, invite_token, invite_expires_at)
      values ('66666666-6666-6666-6666-666666666666', '11111111-1111-1111-1111-111111111111', 'Expiring link', 'open', 'EXPIRES1', gen_random_uuid(), now() + interval '10 days');
    insert into public.exam_candidates values
      ('77777777-7777-7777-7777-777777777777', '55555555-5555-5555-5555-555555555555', 'Amina Student', '44444444-4444-4444-4444-444444444444', 'submitted');
    insert into public.exam_attempts (id, exam_id, candidate_id, access_token, status, submitted_at, score, max_score, question_order)
      values ('88888888-8888-8888-8888-888888888888', '55555555-5555-5555-5555-555555555555', '77777777-7777-7777-7777-777777777777', gen_random_uuid(), 'submitted', timestamptz '2026-11-01 09:00:00+00', 42, 60, '["q1"]');
    insert into public.exam_answers values ('99999999-9999-9999-9999-999999999999', '88888888-8888-8888-8888-888888888888', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '{"choice":"A"}');
  `);

  // Snapshot the original attempt so we can prove it is never rewritten.
  const before = await one(`select status, submitted_at, score, max_score, question_order::text as qo from public.exam_attempts where id='88888888-8888-8888-8888-888888888888'`);
  const answersBefore = (await one(`select count(*)::int n, min(answer::text) a from public.exam_answers where attempt_id='88888888-8888-8888-8888-888888888888'`));

  await db.exec(readFileSync("supabase/migrations/0076_exam_retakes_and_link_lifecycle.sql", "utf8"));

  const legacy = await one(`select invite_expires_at, invite_expiry_policy from public.exams where id='55555555-5555-5555-5555-555555555555'`);
  assert.ok(legacy.invite_expires_at, "legacy link must receive an expiry");
  assert.equal(legacy.invite_expiry_policy, "backfilled_30_days");
  const horizon = await one(`select invite_expires_at > now() + interval '6 days' as ok from public.exams where id='55555555-5555-5555-5555-555555555555'`);
  assert.equal(horizon.ok, true, "backfill must not cut off a running examination");
  checks += 1; console.log("✓ migration leaves no permanent link behind");

  const expiring = await one(`select invite_expires_at > now() + interval '9 days' as ok from public.exams where id='66666666-6666-6666-6666-666666666666'`);
  assert.equal(expiring.ok, true, "an existing expiry must not be overwritten");
  checks += 1; console.log("✓ an existing expiration is preserved");

  const platform = await one(`select value from public.platform_settings where key='exam_link_policy'`);
  assert.equal(platform.value.allow_no_expiry, false);
  checks += 1; console.log("✓ platform policy forbids permanent links by default");

  // ── Retake request guards ─────────────────────────────────────────────
  await assert.rejects(
    db.query(
      `insert into public.exam_retake_requests (organization_id, exam_id, candidate_id, attempt_id, requester_name)
       values ('22222222-2222-2222-2222-222222222222','55555555-5555-5555-5555-555555555555','77777777-7777-7777-7777-777777777777','88888888-8888-8888-8888-888888888888','Amina Student')`,
    ),
    /tenant|organization/i,
  );
  checks += 1; console.log("✓ a request cannot be filed under another tenant's organization");

  // Re-open a submitted attempt to prove in-progress attempts are refused, then
  // restore it — this only affects the isolated test database.
  await db.exec(`update public.exam_attempts set status='in_progress', submitted_at=null where id='88888888-8888-8888-8888-888888888888'`);
  await assert.rejects(
    db.query(
      `insert into public.exam_retake_requests (organization_id, exam_id, candidate_id, attempt_id, requester_name)
       values ('11111111-1111-1111-1111-111111111111','55555555-5555-5555-5555-555555555555','77777777-7777-7777-7777-777777777777','88888888-8888-8888-8888-888888888888','Amina Student')`,
    ),
    /submitted/i,
  );
  checks += 1; console.log("✓ a retake cannot be requested for an attempt still in progress");
  await db.exec(`update public.exam_attempts set status='submitted', submitted_at=timestamptz '2026-11-01 09:00:00+00' where id='88888888-8888-8888-8888-888888888888'`);

  const insertRequest = (id, extra = "") => db.query(
    `insert into public.exam_retake_requests (id, organization_id, exam_id, candidate_id, attempt_id, requester_name, reason${extra ? ", " + extra.split("=")[0].trim() : ""})
     values ($1,'11111111-1111-1111-1111-111111111111','55555555-5555-5555-5555-555555555555','77777777-7777-7777-7777-777777777777','88888888-8888-8888-8888-888888888888','Amina Student','Lost connection'${extra ? ", " + extra.split("=").slice(1).join("=").trim() : ""})`,
    [id],
  );
  await insertRequest("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
  await assert.rejects(insertRequest("cccccccc-cccc-cccc-cccc-cccccccccccc"), /duplicate key|unique/i);
  checks += 1; console.log("✓ a second pending request for the same candidate/examination is refused");

  // ── Decisions ────────────────────────────────────────────────────────
  await assert.rejects(
    db.query(
      `update public.exam_retake_requests set status='approved', decided_by='33333333-3333-3333-3333-333333333333', decided_at=now() where id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'`,
    ),
    /decision_check|check constraint/i,
  );
  checks += 1; console.log("✓ an approval without an access window is refused by the database");

  await db.query(
    `update public.exam_retake_requests set status='approved', decided_by='33333333-3333-3333-3333-333333333333', decided_at=now(), access_expires_at=now() + interval '7 days', granted_attempts=1 where id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'`,
  );
  await assert.rejects(
    db.query(`update public.exam_retake_requests set status='rejected', decided_by='33333333-3333-3333-3333-333333333333', decided_at=now() where id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'`),
    /re-decided|decided/i,
  );
  checks += 1; console.log("✓ an approval cannot be silently re-decided as a rejection");

  // ── New attempt creation ─────────────────────────────────────────────
  await db.query(
    `insert into public.exam_attempts (id, exam_id, candidate_id, access_token, status, attempt_number, previous_attempt_id, retake_request_id)
     values ('dddddddd-dddd-dddd-dddd-dddddddddddd','55555555-5555-5555-5555-555555555555','77777777-7777-7777-7777-777777777777', gen_random_uuid(), 'in_progress', 2, '88888888-8888-8888-8888-888888888888', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')`,
  );
  const after = await one(`select status, submitted_at, score, max_score, question_order::text as qo from public.exam_attempts where id='88888888-8888-8888-8888-888888888888'`);
  assert.deepEqual(after, before);
  const answersAfter = await one(`select count(*)::int n, min(answer::text) a from public.exam_answers where attempt_id='88888888-8888-8888-8888-888888888888'`);
  assert.deepEqual(answersAfter, answersBefore);
  checks += 1; console.log("✓ the original attempt and its answers are preserved byte-for-byte");

  const rows = await query(`select attempt_number, status from public.exam_attempts where candidate_id='77777777-7777-7777-7777-777777777777' order by attempt_number`);
  assert.equal(rows.rows.length, 2);
  assert.equal(rows.rows[1].attempt_number, 2);
  checks += 1; console.log("✓ the retake is a separate attempt with its own number");

  await assert.rejects(
    db.query(
      `insert into public.exam_attempts (id, exam_id, candidate_id, access_token, status, attempt_number)
       values ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','55555555-5555-5555-5555-555555555555','77777777-7777-7777-7777-777777777777', gen_random_uuid(), 'in_progress', 2)`,
    ),
    /duplicate key|unique/i,
  );
  checks += 1; console.log("✓ two active attempts (or two attempts with the same number) are impossible");

  await db.query(`update public.exam_attempts set status='submitted', submitted_at=now() where id='dddddddd-dddd-dddd-dddd-dddddddddddd'`);
  await db.query(
    `insert into public.exam_attempts (id, exam_id, candidate_id, access_token, status, attempt_number)
     values ('ffffffff-ffff-ffff-ffff-ffffffffffff','55555555-5555-5555-5555-555555555555','77777777-7777-7777-7777-777777777777', gen_random_uuid(), 'in_progress', 3)`,
  );
  const seq = await query(`select attempt_number from public.exam_attempts where candidate_id='77777777-7777-7777-7777-777777777777' order by attempt_number`);
  assert.deepEqual(seq.rows.map((r) => r.attempt_number), [1, 2, 3]);
  checks += 1; console.log("✓ subsequent authorized attempts are preserved in order");

  // ── RLS is enabled on the new table ──────────────────────────────────
  const rls = await one(`select relrowsecurity from pg_class where oid='public.exam_retake_requests'::regclass`);
  assert.equal(rls.relrowsecurity, true);
  const policies = await query(`select policyname from pg_policies where tablename='exam_retake_requests' order by policyname`);
  assert.deepEqual(policies.rows.map((r) => r.policyname), ["err_insert", "err_select", "err_update"]);
  checks += 1; console.log("✓ RLS is enabled with explicit select/insert/update policies");

  console.log(`\n${checks} checks passed`);
} finally {
  await db.close();
}
