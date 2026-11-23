import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const sql = readFileSync("supabase/migrations/20261123174623_enforce_feature_entitlements_and_storage.sql", "utf8");
const db = new PGlite();
await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema auth; create schema storage;
  create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
  create function public.is_super_admin() returns boolean language sql stable as $$ select false $$;
  create table public.organizations (id uuid primary key, status text not null);
  create table public.platform_settings (key text primary key, value jsonb);
  create table public.test_entitlements (organization_id uuid primary key, limits jsonb not null);
  create function public.org_entitlement_limits(p_org uuid) returns jsonb language sql stable as $$
    select limits from public.test_entitlements where organization_id = p_org
  $$;
  create function public.org_limit(p_org uuid, p_key text) returns integer language sql stable as $$
    select case when jsonb_typeof(public.org_entitlement_limits(p_org) -> p_key) = 'number'
      then (public.org_entitlement_limits(p_org) ->> p_key)::integer else -1 end
  $$;
  create table public.profiles (id uuid primary key, platform_role text, status text);
  create table public.questions (id uuid primary key, organization_id uuid);
  create table public.question_options (id uuid primary key, question_id uuid);
  create table public.question_categories (id uuid primary key, organization_id uuid);
  create table public.question_pools (id uuid primary key, organization_id uuid);
  create table public.question_pool_items (id uuid primary key, pool_id uuid);
  create table public.question_usage (id uuid primary key, organization_id uuid);
  create table public.question_hints (id uuid primary key, organization_id uuid);
  create table public.quizzes (id uuid primary key, organization_id uuid);
  create table public.quiz_questions (id uuid primary key, quiz_id uuid);
  create table public.exams (id uuid primary key, organization_id uuid);
  create table public.exam_candidates (id uuid primary key, exam_id uuid);
  create table public.exam_attempts (id uuid primary key, exam_id uuid);
  create table public.exam_answers (id uuid primary key, attempt_id uuid);
  create table public.exam_messages (id uuid primary key, organization_id uuid);
  create table public.exam_presence (id uuid primary key, organization_id uuid);
  create table public.competitions (id uuid primary key, organization_id uuid);
  create table public.competition_access_codes (id uuid primary key, competition_id uuid);
  create table public.competition_registrations (id uuid primary key, competition_id uuid);
  create table public.quiz_sessions (
    id uuid primary key, organization_id uuid, status text, admission_open boolean, settings jsonb,
    quiz_id uuid, host_id uuid, join_code text
  );
  create table public.session_participants (
    id uuid primary key default gen_random_uuid(), session_id uuid, display_name text,
    participant_ref text, user_id uuid, qualification_token_hash text, avatar_key text,
    status text, access_token uuid default gen_random_uuid()
  );
  create table public.participant_answers (id uuid primary key, session_id uuid);
  create table public.proctoring_incidents (id uuid primary key, organization_id uuid);
  create table public.proctoring_rooms (id uuid primary key, exam_id uuid);
  create table public.proctoring_recordings (id uuid primary key, organization_id uuid);
  create table public.proctoring_room_events (id uuid primary key, organization_id uuid);
  create table storage.objects (
    id uuid primary key default gen_random_uuid(), bucket_id text, name text, metadata jsonb
  );
`);
await db.exec(sql);

const org = "11111111-1111-4111-8111-111111111111";
const session = "22222222-2222-4222-8222-222222222222";
await db.query("insert into public.organizations values ($1, 'active')", [org]);
await db.query("insert into public.test_entitlements values ($1, $2::jsonb)", [org, JSON.stringify({ max_quizzes: 5, max_participants_per_session: 1, max_exams: 2, max_questions: 100, proctoring: true, storage_mb: 2 })]);
await db.query("insert into public.platform_settings values ('features', '{\"live_quizzes\":true,\"examinations\":true,\"proctoring\":true}')");
await db.query("insert into public.quiz_sessions values ($1, $2, 'lobby', true, '{\"max_participants\":4}', $3, null, 'ABC123')", [session, org, "33333333-3333-4333-8333-333333333333"]);
const admitted = await db.query("select * from public.admit_live_participant($1, 'First')", [session]);
assert.equal(admitted.rows[0].display_name, "First");
await assert.rejects(
  () => db.query("select * from public.admit_live_participant($1, 'Second')", [session]),
  /reached its plan limit/,
);
const checks = await db.query("select public.org_has_feature($1, 'live_competitions') as live, public.org_has_feature($1, 'examinations') as exams, public.org_has_storage($1) as storage", [org]);
assert.deepEqual(checks.rows[0], { live: true, exams: true, storage: true });
await db.query("insert into storage.objects (bucket_id, name, metadata) values ('question-media', $1, '{\"size\":\"1500000\"}')", [`${org}/first.webp`]);
await assert.rejects(
  () => db.query("insert into storage.objects (bucket_id, name, metadata) values ('student-imports', $1, '{\"size\":\"700000\"}')", [`${org}/batch/second.csv`]),
  /reached its plan storage limit/,
);
await db.query("update public.organizations set status = 'suspended' where id = $1", [org]);
const disabled = await db.query("select public.org_has_feature($1, 'live_competitions') as live, public.org_has_storage($1) as storage", [org]);
assert.deepEqual(disabled.rows[0], { live: false, storage: false });
await assert.rejects(
  () => db.query("insert into storage.objects (bucket_id, name, metadata) values ('question-media', $1, '{\"size\":\"1\"}')", [`${org}/after-suspension.webp`]),
  /unavailable for this workspace/,
);
await db.close();
console.log("7 feature-entitlement migration execution checks passed (isolated PGlite schema fixture; no production writes).");
