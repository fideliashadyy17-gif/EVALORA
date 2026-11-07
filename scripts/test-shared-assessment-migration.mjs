// Isolated PostgreSQL-compatible migration test using PGlite; this never
// connects to Supabase or writes production data.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
await db.exec(`
  create role authenticated;
  create role anon;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
  create table public.organizations(id uuid primary key, name text);
  create table public.profiles(id uuid primary key, email text);
  create table public.organization_members(organization_id uuid, user_id uuid, role text, status text);
  create table public.quizzes(id uuid primary key, organization_id uuid, title text);
  create table public.exams(id uuid primary key, organization_id uuid, quiz_id uuid, title text);
  create table public.quiz_sessions(id uuid primary key, quiz_id uuid, organization_id uuid, host_id uuid, status text, settings jsonb);
  create table public.session_participants(id uuid primary key, session_id uuid references public.quiz_sessions(id), status text, display_name text);
  create table public.exam_candidates(id uuid primary key, exam_id uuid references public.exams(id), full_name text);
  create table public.exam_attempts(id uuid primary key, exam_id uuid references public.exams(id), candidate_id uuid references public.exam_candidates(id), status text, started_at timestamptz, submitted_at timestamptz, extension_minutes integer default 0, score numeric, max_score numeric, flagged jsonb default '[]');
  create table public.proctoring_incidents(
    id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
    exam_id uuid not null references public.exams(id), candidate_id uuid references public.exam_candidates(id),
    attempt_id uuid references public.exam_attempts(id), type text not null, severity text not null,
    note text, reported_by uuid references public.profiles(id), reviewed_by uuid references public.profiles(id),
    status text not null default 'open', created_at timestamptz not null default now(), reviewed_at timestamptz,
    review_note text, retention_state text not null default 'active', retention_applied_at timestamptz
  );
  create table public.proctoring_incident_reviews(
    id uuid primary key default gen_random_uuid(), incident_id uuid not null references public.proctoring_incidents(id) on delete cascade,
    organization_id uuid not null references public.organizations(id), exam_id uuid not null references public.exams(id),
    candidate_id uuid references public.exam_candidates(id), decision text not null check(decision in ('reported','confirmed','dismissed','investigating','reopened')),
    previous_status text, new_status text not null check(new_status in ('open','valid','invalid','investigating')),
    note text, reviewer_id uuid references public.profiles(id), reviewer_email text, reviewer_role text,
    source text not null default 'workspace' check(source in ('workspace','platform','service','retention')),
    created_at timestamptz not null default now()
  );
  create function public.is_super_admin() returns boolean language sql stable as $$ select false $$;
  create function public.org_role(uuid) returns text language sql stable as $$ select null::text $$;
  create function public.proctoring_decision_for_status(text) returns text language sql immutable as $$
    select case $1 when 'valid' then 'confirmed' when 'invalid' then 'dismissed' when 'investigating' then 'investigating' else 'reopened' end
  $$;
  create function public.record_proctoring_incident_history() returns trigger language plpgsql as $$ begin return new; end $$;
  create trigger incident_history_recorder after insert or update of status,reviewed_by
    on public.proctoring_incidents for each row execute function public.record_proctoring_incident_history();
`);
await db.exec(readFileSync("supabase/migrations/0061_shared_assessment_integrity_and_submission_provenance.sql", "utf8"));

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const org = id(1), profile = id(2), quiz = id(3), exam = id(4), candidate = id(5), attempt = id(6), session = id(7), participant = id(8);
await db.query("insert into organizations(id,name) values($1,'Tenant')", [org]);
await db.query("insert into profiles(id,email) values($1,'reviewer@example.test')", [profile]);
await db.query("insert into quizzes(id,organization_id,title) values($1,$2,'Quiz')", [quiz, org]);
await db.query("insert into exams(id,organization_id,quiz_id,title) values($1,$2,$3,'Exam')", [exam, org, quiz]);
await db.query("insert into exam_candidates(id,exam_id,full_name) values($1,$2,'Candidate')", [candidate, exam]);
await db.query("insert into exam_attempts(id,exam_id,candidate_id,status,started_at) values($1,$2,$3,'in_progress',now())", [attempt, exam, candidate]);
await db.query("insert into quiz_sessions(id,quiz_id,organization_id,host_id,status,settings) values($1,$2,$3,$4,'live','{}')", [session, quiz, org, profile]);
await db.query("insert into session_participants(id,session_id,status,display_name) values($1,$2,'admitted','Participant')", [participant, session]);

await db.query("insert into proctoring_incidents(organization_id,exam_id,candidate_id,attempt_id,type,severity,reported_by) values($1,$2,$3,$4,'integrity_focus_lost','low',$5)", [org, exam, candidate, attempt, profile]);
await db.query("insert into proctoring_incidents(organization_id,exam_id,candidate_id,attempt_id,quiz_id,session_id,participant_id,type,severity,note,reported_by) values($1,null,null,null,$2,$3,$4,'integrity_meta_key','low','{\"source\":\"browser\"}',null)", [org, quiz, session, participant]);

const { rows: provenance } = await db.query("select submission_reason from exam_attempts where id=$1", [attempt]);
assert.equal(provenance[0].submission_reason, null, "existing attempts remain unlabelled rather than inferred");
await db.query("update exam_attempts set status='submitted', submission_reason='candidate_confirmed' where id=$1", [attempt]);
let rejectedReason = false;
try { await db.query("update exam_attempts set status='auto_submitted' where id=$1", [attempt]); } catch { rejectedReason = true; }
assert.ok(rejectedReason, "candidate-confirmed provenance cannot label an auto-submitted attempt");
await db.query("update exam_attempts set status='auto_submitted', submission_reason='deadline' where id=$1", [attempt]);
const { rows: incidents } = await db.query("select organization_id,exam_id,quiz_id,session_id,participant_id from proctoring_incidents order by created_at,id");
assert.equal(incidents.length, 2);
assert.equal(incidents[1].organization_id, org, "tenant scope is derived from the live session");
assert.equal(incidents[1].exam_id, null);
assert.equal(incidents[1].session_id, session);
const { rows: history } = await db.query("select exam_id,session_id,participant_id,reviewer_role,source from proctoring_incident_reviews order by created_at,id");
assert.equal(history.length, 2, "both exam and live observations receive immutable history rows");
assert.equal(history[1].reviewer_role, "participant_browser");
assert.equal(history[1].source, "service");

await db.query("update proctoring_incidents set status='investigating', reviewed_by=$1, review_note='reviewed' where session_id=$2", [profile, session]);
const { rows: afterReview } = await db.query("select count(*)::int as n from proctoring_incident_reviews where session_id=$1", [session]);
assert.equal(afterReview[0].n, 2, "authorized review decision is appended without rewriting the report");
let rejected = false;
try {
  await db.query("insert into proctoring_incidents(organization_id,exam_id,candidate_id,attempt_id,quiz_id,session_id,participant_id,type,severity) values($1,null,null,null,$2,$3,$4,'integrity_focus_lost','low')", [org, id(999), session, participant]);
} catch { rejected = true; }
assert.ok(rejected, "live observation cannot attach another quiz or participant scope");
console.log("\n8 shared assessment migration checks passed (isolated PGlite schema; no Supabase connection).");
await db.close();
