// Migration 0053 exercised in isolated PGlite with no production data.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const A = "00000000-0000-4000-8000-000000000001";
const B = "00000000-0000-4000-8000-000000000002";
const TEACHER = "00000000-0000-4000-8000-000000000003";
const STUDENT = "00000000-0000-4000-8000-000000000004";
const EXAM = "00000000-0000-4000-8000-000000000011";
const CANDIDATE = "00000000-0000-4000-8000-000000000012";
const QUIZ_A = "00000000-0000-4000-8000-000000000021";
const QUIZ_B = "00000000-0000-4000-8000-000000000022";
const SESSION_A = "00000000-0000-4000-8000-000000000031";
const SESSION_B = "00000000-0000-4000-8000-000000000032";
const PARTICIPANT_A = "00000000-0000-4000-8000-000000000041";
const PARTICIPANT_B = "00000000-0000-4000-8000-000000000042";
const EXAM_INCIDENT = "00000000-0000-4000-8000-000000000051";
const LIVE_INCIDENT = "00000000-0000-4000-8000-000000000052";
let n = 0;
const test = async (name, fn) => { await fn(); n++; console.log(`  ✓ ${name}`); };
const asUser = async (uid) => db.exec(`reset role; select set_config('test.uid','${uid}',false); set role authenticated;`);
const asOwner = async () => db.exec("reset role");

try {
  await db.exec(`
    create schema auth;
    create role authenticated; create role anon; create role service_role bypassrls;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
    grant usage on schema auth to authenticated,anon,service_role;
    create table public.organizations(id uuid primary key,name text);
    create table public.profiles(id uuid primary key,email text,platform_role text default 'user',status text default 'active');
    create table public.organization_members(organization_id uuid,user_id uuid,role text,status text);
    create function public.is_super_admin() returns boolean language sql stable security definer as $$select exists(select 1 from public.profiles where id=auth.uid() and platform_role='super_admin')$$;
    create function public.org_role(org uuid) returns text language sql stable security definer as $$select role from public.organization_members where user_id=auth.uid() and organization_id=org and status='active' limit 1$$;
    create function public.proctoring_decision_for_status(s text) returns text language sql immutable as $$select case s when 'valid' then 'confirmed' when 'invalid' then 'dismissed' when 'investigating' then 'investigating' else 'reopened' end$$;

    create table public.quizzes(id uuid primary key,organization_id uuid not null,title text);
    create table public.quiz_sessions(id uuid primary key,quiz_id uuid not null,organization_id uuid not null,host_id uuid,title text,join_code text);
    create table public.session_participants(id uuid primary key,session_id uuid not null,display_name text,participant_ref text);
    create table public.exams(id uuid primary key,organization_id uuid not null,title text);
    create table public.exam_candidates(id uuid primary key,exam_id uuid not null,full_name text);
    create table public.exam_attempts(id uuid primary key,exam_id uuid not null,candidate_id uuid not null);
    create table public.proctoring_incidents(
      id uuid primary key default gen_random_uuid(),exam_id uuid not null references public.exams(id) on delete cascade,
      candidate_id uuid references public.exam_candidates(id) on delete set null,attempt_id uuid,
      type text not null,severity text not null default 'medium',note text,reported_by uuid,
      status text not null default 'open',reviewed_by uuid,created_at timestamptz not null default now(),
      organization_id uuid not null,reviewed_at timestamptz,review_note text,
      retention_state text not null default 'active',retention_applied_at timestamptz
    );
    create table public.proctoring_incident_reviews(
      id uuid primary key default gen_random_uuid(),incident_id uuid not null,organization_id uuid not null,
      exam_id uuid not null,candidate_id uuid,decision text not null,previous_status text,new_status text not null,
      note text,reviewer_id uuid,reviewer_email text,reviewer_role text,source text not null default 'workspace',
      created_at timestamptz not null default now()
    );
    alter table public.proctoring_incidents enable row level security;
    alter table public.proctoring_incident_reviews enable row level security;
    create function public.proctoring_review_append_only() returns trigger language plpgsql as $$begin raise exception 'Proctoring review history is append-only'; end$$;
    create trigger proctoring_review_immutable before update or delete on public.proctoring_incident_reviews for each row execute function public.proctoring_review_append_only();

    insert into public.organizations values('${A}','Alpha'),('${B}','Beta');
    insert into public.profiles values('${TEACHER}','teacher@alpha.invalid','user','active'),('${STUDENT}','student@alpha.invalid','user','active');
    insert into public.organization_members values('${A}','${TEACHER}','teacher','active'),('${A}','${STUDENT}','participant','active');
    insert into public.quizzes values('${QUIZ_A}','${A}','Alpha quiz'),('${QUIZ_B}','${B}','Beta quiz');
    insert into public.quiz_sessions values('${SESSION_A}','${QUIZ_A}','${A}','${TEACHER}','Alpha live','ALPHA'),('${SESSION_B}','${QUIZ_B}','${B}',null,'Beta live','BETA');
    insert into public.session_participants values('${PARTICIPANT_A}','${SESSION_A}','Live student','S1'),('${PARTICIPANT_B}','${SESSION_B}','Other student','S2');
    insert into public.exams values('${EXAM}','${A}','Existing exam');
    insert into public.exam_candidates values('${CANDIDATE}','${EXAM}','Existing candidate');
    insert into public.proctoring_incidents(id,exam_id,candidate_id,type,organization_id) values('${EXAM_INCIDENT}','${EXAM}',null,'observation','${A}');
    insert into public.proctoring_incident_reviews(incident_id,organization_id,exam_id,candidate_id,decision,new_status) values('${EXAM_INCIDENT}','${A}','${EXAM}',null,'reported','open');

    grant usage on schema public to authenticated,anon,service_role;
    grant select on public.quiz_sessions to authenticated;
    grant select,insert,update,delete on all tables in schema public to service_role;
  `);

  const before = await db.query("select count(*)::int n from public.proctoring_incidents");
  await db.exec(readFileSync("supabase/migrations/0053_shared_live_quiz_integrity.sql", "utf8"));

  await test("existing examination incidents and general observations are preserved", async () => {
    const after = await db.query("select id,exam_id,candidate_id from public.proctoring_incidents");
    assert.equal(after.rows.length, before.rows[0].n);
    assert.equal(after.rows[0].id, EXAM_INCIDENT);
    assert.equal(after.rows[0].candidate_id, null);
  });

  await test("valid live incident derives organization and appends complete history", async () => {
    await db.exec(`insert into public.proctoring_incidents(id,exam_id,quiz_id,session_id,participant_id,type,severity,note,organization_id)
      values('${LIVE_INCIDENT}',null,'${QUIZ_A}','${SESSION_A}','${PARTICIPANT_A}','integrity_tab_hidden','medium','{}','${B}')`);
    const row = await db.query("select organization_id,exam_id,quiz_id,session_id,participant_id from public.proctoring_incidents where id=$1", [LIVE_INCIDENT]);
    assert.equal(row.rows[0].organization_id, A, "forged org replaced by session org");
    assert.equal(row.rows[0].exam_id, null);
    const history = await db.query("select quiz_id,session_id,participant_id,decision,reviewer_role,source from public.proctoring_incident_reviews where incident_id=$1", [LIVE_INCIDENT]);
    assert.equal(history.rows.length, 1);
    assert.equal(history.rows[0].quiz_id, QUIZ_A);
    assert.equal(history.rows[0].session_id, SESSION_A);
    assert.equal(history.rows[0].participant_id, PARTICIPANT_A);
    assert.equal(history.rows[0].decision, "reported");
    assert.equal(history.rows[0].reviewer_role, "participant_browser");
  });

  await test("cross-quiz, cross-session and ambiguous attribution are rejected", async () => {
    await assert.rejects(() => db.exec(`insert into public.proctoring_incidents(exam_id,quiz_id,session_id,participant_id,type,organization_id) values(null,'${QUIZ_B}','${SESSION_A}','${PARTICIPANT_A}','integrity_copy','${A}')`), /same quiz/);
    await assert.rejects(() => db.exec(`insert into public.proctoring_incidents(exam_id,quiz_id,session_id,participant_id,type,organization_id) values(null,'${QUIZ_A}','${SESSION_A}','${PARTICIPANT_B}','integrity_copy','${A}')`), /same live session/);
    await assert.rejects(() => db.exec(`insert into public.proctoring_incidents(exam_id,quiz_id,session_id,participant_id,type,organization_id) values('${EXAM}','${QUIZ_A}','${SESSION_A}','${PARTICIPANT_A}','integrity_copy','${A}')`), /same live session|assessment_scope/);
    await assert.rejects(() => db.exec(`insert into public.proctoring_incidents(exam_id,quiz_id,session_id,participant_id,type,organization_id) values(null,'${QUIZ_A}','${SESSION_A}',null,'integrity_copy','${A}')`), /same live session|assessment_scope/);
  });

  await test("live assessment, participant and organization links are immutable", async () => {
    await assert.rejects(() => db.exec(`update public.proctoring_incidents set participant_id='${PARTICIPANT_B}' where id='${LIVE_INCIDENT}'`), /cannot be reassigned/);
    await assert.rejects(() => db.exec(`update public.proctoring_incidents set organization_id='${B}' where id='${LIVE_INCIDENT}'`), /cannot be reassigned/);
  });

  await test("teacher sees only own tenant and can append a review decision", async () => {
    await asUser(TEACHER);
    const rows = await db.query("select id from public.proctoring_incidents order by id");
    assert.deepEqual(rows.rows.map((r) => r.id).sort(), [EXAM_INCIDENT, LIVE_INCIDENT].sort());
    await db.exec(`update public.proctoring_incidents set status='valid',reviewed_by='${TEACHER}',review_note='Reviewed live event' where id='${LIVE_INCIDENT}'`);
    await asOwner();
    const history = await db.query("select decision,note,session_id from public.proctoring_incident_reviews where incident_id=$1 order by created_at", [LIVE_INCIDENT]);
    assert.equal(history.rows.length, 2);
    assert.equal(history.rows[1].decision, "confirmed");
    assert.equal(history.rows[1].session_id, SESSION_A);
  });

  await test("student role cannot read, insert, rewrite or delete incidents", async () => {
    await asUser(STUDENT);
    assert.equal((await db.query("select id from public.proctoring_incidents")).rows.length, 0);
    await assert.rejects(() => db.exec(`insert into public.proctoring_incidents(quiz_id,session_id,participant_id,type,reported_by) values('${QUIZ_A}','${SESSION_A}','${PARTICIPANT_A}','integrity_copy','${STUDENT}')`), /row-level security|permission denied/);
    await assert.rejects(() => db.exec(`update public.proctoring_incidents set note='forged' where id='${LIVE_INCIDENT}'`), /permission denied|row-level security/);
    await assert.rejects(() => db.exec(`delete from public.proctoring_incidents where id='${LIVE_INCIDENT}'`), /permission denied/);
    await assert.rejects(() => db.query("select id from public.proctoring_incident_reviews"), /permission denied|row-level security/);
    await asOwner();
  });

  await test("review history remains immutable for live rows", async () => {
    await assert.rejects(() => db.exec(`update public.proctoring_incident_reviews set decision='dismissed' where incident_id='${LIVE_INCIDENT}'`), /append-only/);
  });

  console.log(`\n${n} live integrity schema/RLS checks passed (migration 0053 in isolated PGlite).`);
} catch (error) {
  console.error("\nFAILED:", error);
  process.exit(1);
} finally {
  await db.close();
}
