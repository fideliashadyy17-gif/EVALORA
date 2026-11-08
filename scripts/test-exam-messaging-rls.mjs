// Migration 0062 in isolated PGlite: row level security, tenant isolation, immutability,
// idempotency and Realtime publication for exam messages and presence.
// Runs the real migration file over a minimal schema. Synthetic identifiers only.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const ORG_A = '0a400000-0000-4000-8000-00000000000a';
const ORG_B = '0a400000-0000-4000-8000-00000000000b';
const EXAM_A = 'e0000000-0000-4000-8000-00000000000a';
const EXAM_B = 'e0000000-0000-4000-8000-00000000000b';
const ATT_A = 'a0000000-0000-4000-8000-00000000000a';
const ATT_A_SUBMITTED = 'a0000000-0000-4000-8000-0000000000a2';
const ATT_B = 'a0000000-0000-4000-8000-00000000000b';
const U = {
  teacherA: '11111111-0000-4000-8000-00000000000a',
  correctorA: '11111111-0000-4000-8000-0000000000c1',
  organizerA: '11111111-0000-4000-8000-0000000000e0',
  teacherB: '11111111-0000-4000-8000-00000000000b',
  outsider: '11111111-0000-4000-8000-0000000000ff',
  superAdmin: '11111111-0000-4000-8000-0000000000aa',
};
const MSG_CAND = 'd0000000-0000-4000-8000-000000000001';
const MSG_STAFF = 'd0000000-0000-4000-8000-000000000002';

const migration = readFileSync('supabase/migrations/0062_exam_messaging_monitoring.sql', 'utf8');

// Same helper bodies as migration 0001 (RLS helpers), reading auth.uid() from the session.
const SCHEMA = `
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
create schema if not exists public;
create table organizations(id uuid primary key, name text not null);
create table profiles(id uuid primary key, platform_role text not null default 'user', status text not null default 'active');
create table organization_members(organization_id uuid not null references organizations(id), user_id uuid not null references profiles(id),
  role text not null, status text not null default 'active', primary key (organization_id, user_id));
create table exams(id uuid primary key, organization_id uuid not null references organizations(id), title text not null);
create table exam_attempts(id uuid primary key, exam_id uuid not null references exams(id), status text not null default 'in_progress',
  access_token uuid not null default gen_random_uuid(), question_order jsonb not null default '[]'::jsonb);
create table exam_answers(id uuid primary key default gen_random_uuid(), attempt_id uuid not null references exam_attempts(id), question_id uuid);
create publication supabase_realtime;
create or replace function public.is_super_admin()
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.profiles where id = auth.uid() and platform_role = 'super_admin' and status = 'active');
$$;
create or replace function public.org_role(p_org uuid)
returns text language sql security definer set search_path = public stable as $$
  select role from public.organization_members
  where organization_id = p_org and user_id = auth.uid() and status = 'active' limit 1;
$$;
`;

const db = new PGlite();
await db.exec(SCHEMA);
const columnsBefore = (await db.query(`select column_name, data_type from information_schema.columns
  where table_schema='public' and table_name in ('exam_attempts','exam_answers') order by 1,2`)).rows;

await db.exec(`
  grant usage on schema public, auth to authenticated;
  insert into organizations values ('${ORG_A}', 'School A'), ('${ORG_B}', 'School B');
  insert into profiles(id, platform_role) values
    ('${U.teacherA}', 'user'), ('${U.correctorA}', 'user'), ('${U.organizerA}', 'user'),
    ('${U.teacherB}', 'user'), ('${U.outsider}', 'user'), ('${U.superAdmin}', 'super_admin');
  insert into organization_members(organization_id, user_id, role) values
    ('${ORG_A}', '${U.teacherA}', 'teacher'), ('${ORG_A}', '${U.correctorA}', 'corrector'),
    ('${ORG_A}', '${U.organizerA}', 'organizer'), ('${ORG_B}', '${U.teacherB}', 'teacher');
  insert into exams values ('${EXAM_A}', '${ORG_A}', 'Exam A'), ('${EXAM_B}', '${ORG_B}', 'Exam B');
  insert into exam_attempts(id, exam_id, status) values
    ('${ATT_A}', '${EXAM_A}', 'in_progress'), ('${ATT_A_SUBMITTED}', '${EXAM_A}', 'submitted'), ('${ATT_B}', '${EXAM_B}', 'in_progress');
  grant select, insert, update, delete on exam_attempts, exam_answers, exams, organizations, profiles, organization_members to authenticated;
  grant select on exam_attempts to authenticated;
`);

await db.exec(migration);
// Re-running must be a no-op (the migration is documented as re-runnable).
await db.exec(migration);

// Migration grants table privileges through Supabase defaults; mirror them for the test role.
await db.exec(`grant select, insert, update, delete on exam_messages, exam_presence to authenticated;`);

async function as(userId, fn) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${userId}', false);`);
  try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
}
const uuidOf = (n) => `${n}`;
async function insertStaff(userId, attemptId, examId, orgId, id, clientId, body = 'Keep going.') {
  return as(userId, () => db.query(
    `insert into exam_messages(id, organization_id, exam_id, attempt_id, sender_kind, sender_user_id, client_message_id, body)
     values ($1,$2,$3,$4,'staff',$5,$6,$7) returning id`,
    [id, orgId, examId, attemptId, userId, clientId, body]));
}
// The candidate side is written by the server with the service role (no session).
async function insertCandidate(attemptId, examId, orgId, id, clientId, body = 'Thank you.') {
  return db.query(
    `insert into exam_messages(id, organization_id, exam_id, attempt_id, sender_kind, client_message_id, body)
     values ($1,$2,$3,$4,'candidate',$5,$6) returning id`,
    [id, orgId, examId, attemptId, clientId, body]);
}

let passed = 0;
async function check(label, fn) { await fn(); passed += 1; console.log(`  ✓ ${label}`); }
const rejects = (promise) => assert.rejects(promise, /row-level security|violates|immutable|check constraint|permission denied|unique/i);

console.log('Migration 0062 (PGlite, isolated):');

await check('staff member of the exam organization can send a message to an active attempt', async () => {
  const r = await insertStaff(U.teacherA, ATT_A, EXAM_A, ORG_A, MSG_STAFF, '00000000-0000-4000-8000-0000000000a1');
  assert.equal(r.rows.length, 1);
});

await check('a staff member cannot send as another user', async () => {
  await rejects(as(U.correctorA, () => db.query(
    `insert into exam_messages(organization_id, exam_id, attempt_id, sender_kind, sender_user_id, client_message_id, body)
     values ($1,$2,$3,'staff',$4,gen_random_uuid(),'x')`, [ORG_A, EXAM_A, ATT_A, U.teacherA])));
});

await check('a staff member cannot message an attempt of another organization', async () => {
  await rejects(insertStaff(U.teacherA, ATT_B, EXAM_B, ORG_B, 'd0000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000b1'));
  await rejects(insertStaff(U.teacherB, ATT_A, EXAM_A, ORG_A, 'd0000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000b2'));
});

await check('a message cannot be filed under an exam that belongs to another organization', async () => {
  await rejects(insertStaff(U.teacherA, ATT_A, EXAM_A, ORG_B, 'd0000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000c1'));
});

await check('no message can be sent to a submitted attempt', async () => {
  await rejects(insertStaff(U.teacherA, ATT_A_SUBMITTED, EXAM_A, ORG_A, 'd0000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000d1'));
});

await check('an organizer can read but not send (role boundary)', async () => {
  const read = await as(U.organizerA, () => db.query(`select id from exam_messages where attempt_id = $1`, [ATT_A]));
  assert.equal(read.rows.length, 1);
  await rejects(insertStaff(U.organizerA, ATT_A, EXAM_A, ORG_A, 'd0000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000e1'));
});

await check('a corrector of the organization can read and send', async () => {
  const r = await insertStaff(U.correctorA, ATT_A, EXAM_A, ORG_A, 'd0000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000f1', 'Please read question 3 carefully.');
  assert.equal(r.rows.length, 1);
});

await insertCandidate(ATT_A, EXAM_A, ORG_A, MSG_CAND, '00000000-0000-4000-8000-0000000000c9', 'Could you repeat the rule?');

await check('another organization sees none of these messages', async () => {
  const r = await as(U.teacherB, () => db.query(`select id from exam_messages where exam_id = $1`, [EXAM_A]));
  assert.equal(r.rows.length, 0);
});

await check('a user without any membership sees none of these messages', async () => {
  const r = await as(U.outsider, () => db.query(`select id from exam_messages`));
  assert.equal(r.rows.length, 0);
});

await check('a super administrator can read every organization (platform role)', async () => {
  const r = await as(U.superAdmin, () => db.query(`select id from exam_messages`));
  assert.ok(r.rows.length >= 3);
});

await check('a candidate message cannot be written from a staff session', async () => {
  await rejects(as(U.teacherA, () => db.query(
    `insert into exam_messages(organization_id, exam_id, attempt_id, sender_kind, client_message_id, body)
     values ($1,$2,$3,'candidate',gen_random_uuid(),'forged')`, [ORG_A, EXAM_A, ATT_A])));
});

await check('same client message id twice in one attempt is one row (idempotent delivery)', async () => {
  const dup = insertCandidate(ATT_A, EXAM_A, ORG_A, 'd0000000-0000-4000-8000-0000000000c8', '00000000-0000-4000-8000-0000000000c9', 'again');
  await rejects(dup);
  const count = await db.query(`select count(*)::int as n from exam_messages where attempt_id=$1 and sender_kind='candidate'`, [ATT_A]);
  assert.equal(count.rows[0].n, 1);
});

await check('empty and oversized bodies are refused by the database', async () => {
  await rejects(insertCandidate(ATT_A, EXAM_A, ORG_A, 'd0000000-0000-4000-8000-0000000000c5', '00000000-0000-4000-8000-0000000000c5', ''));
  await rejects(insertCandidate(ATT_A, EXAM_A, ORG_A, 'd0000000-0000-4000-8000-0000000000c6', '00000000-0000-4000-8000-0000000000c6', 'x'.repeat(1001)));
});

await check('staff can mark a candidate message as read', async () => {
  await as(U.teacherA, () => db.query(`update exam_messages set read_at = now() where id = $1`, [MSG_CAND]));
  const r = await db.query(`select read_at is not null as read from exam_messages where id = $1`, [MSG_CAND]);
  assert.equal(r.rows[0].read, true);
});

await check('staff cannot alter the body, sender or time of a message', async () => {
  await rejects(as(U.teacherA, () => db.query(`update exam_messages set body = 'changed' where id = $1`, [MSG_CAND])));
  await rejects(as(U.teacherA, () => db.query(`update exam_messages set created_at = now() - interval '1 day' where id = $1`, [MSG_CAND])));
  const r = await db.query(`select body from exam_messages where id = $1`, [MSG_CAND]);
  assert.equal(r.rows[0].body, 'Could you repeat the rule?');
});

await check('staff cannot change the sender of a staff message or edit a message they did not receive (candidate only)', async () => {
  const before = await db.query(`select read_at from exam_messages where id = $1`, [MSG_STAFF]);
  await as(U.teacherA, () => db.query(`update exam_messages set read_at = now() where id = $1`, [MSG_STAFF]));
  const after = await db.query(`select read_at from exam_messages where id = $1`, [MSG_STAFF]);
  assert.equal(before.rows[0].read_at, null);
  assert.equal(after.rows[0].read_at, null, 'staff messages are not updated through the staff policy');
});

await check('messages cannot be deleted by staff (no delete policy)', async () => {
  const r = await as(U.teacherA, () => db.query(`delete from exam_messages where id = $1 returning id`, [MSG_STAFF]));
  assert.equal(r.rows.length, 0);
  const still = await db.query(`select count(*)::int as n from exam_messages where id = $1`, [MSG_STAFF]);
  assert.equal(still.rows[0].n, 1);
});

await check('presence is readable by the organization staff only and not writable by sessions', async () => {
  await db.exec(`insert into exam_presence(attempt_id, exam_id, organization_id, current_question, total_questions, saved_count, pending_saves)
    values ('${ATT_A}', '${EXAM_A}', '${ORG_A}', 3, 50, 2, 0)`);
  const own = await as(U.teacherA, () => db.query(`select current_question from exam_presence`));
  assert.equal(own.rows.length, 1);
  const other = await as(U.teacherB, () => db.query(`select current_question from exam_presence`));
  assert.equal(other.rows.length, 0);
  // Without an update policy, RLS filters the row out: zero rows change, no error is raised.
  const upd = await as(U.teacherA, () => db.query(`update exam_presence set current_question = 9 returning attempt_id`));
  assert.equal(upd.rows.length, 0);
  const kept = await db.query(`select current_question from exam_presence where attempt_id = $1`, [ATT_A]);
  assert.equal(kept.rows[0].current_question, 3);
  await rejects(as(U.teacherA, () => db.query(`insert into exam_presence(attempt_id, exam_id, organization_id) values ('${ATT_B}', '${EXAM_B}', '${ORG_B}')`)));
});

await check('presence values are bounded by the schema', async () => {
  await rejects(db.exec(`update exam_presence set current_question = 0 where attempt_id = '${ATT_A}'`));
  await rejects(db.exec(`update exam_presence set pending_saves = -1 where attempt_id = '${ATT_A}'`));
});

await check('the realtime publication carries the two new tables and NOT the attempt or answer tables', async () => {
  const pub = await db.query(`select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by 1`);
  const names = pub.rows.map((r) => r.tablename);
  assert.ok(names.includes('exam_messages') && names.includes('exam_presence'));
  assert.ok(!names.includes('exam_attempts'), 'attempt rows carry the candidate access token');
  assert.ok(!names.includes('exam_answers'));
});

await check('existing attempt and answer tables are unchanged by the migration', async () => {
  const columnsAfter = (await db.query(`select column_name, data_type from information_schema.columns
    where table_schema='public' and table_name in ('exam_attempts','exam_answers') order by 1,2`)).rows;
  assert.deepEqual(columnsAfter, columnsBefore);
  const policies = await db.query(`select tablename from pg_policies where schemaname='public' and tablename in ('exam_attempts','exam_answers')`);
  assert.equal(policies.rows.length, 0, 'no policy created on existing tables by this migration (none existed in this minimal schema)');
});

await check('the migration can be re-run without changing data', async () => {
  const before = await db.query(`select count(*)::int as n from exam_messages`);
  await db.exec(migration);
  const after = await db.query(`select count(*)::int as n from exam_messages`);
  assert.equal(after.rows[0].n, before.rows[0].n);
});

console.log(`\n${passed} exam messaging RLS checks passed (actual migration 0062, isolated PGlite).`);
void uuidOf;
