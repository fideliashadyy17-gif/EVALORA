// Migration 0035 exercised in isolated PGlite: proctoring review history is
// append-only and complete, organization attribution cannot be forged, and the
// retention routine never removes a decision.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const A = '00000000-0000-4000-8000-000000000001';   // org A
const B = '00000000-0000-4000-8000-000000000002';   // org B
const U = '00000000-0000-4000-8000-000000000003';   // supervisor @ A
const EA = '00000000-0000-4000-8000-000000000011';  // exam @ A
const EB = '00000000-0000-4000-8000-000000000012';  // exam @ B
const CA = '00000000-0000-4000-8000-000000000021';  // candidate @ EA
const IA = '00000000-0000-4000-8000-000000000041';  // observation
const RA = '00000000-0000-4000-8000-000000000051';  // room @ EA

let n = 0;
const test = async (name, fn) => { await fn(); n++; console.log('  ✓ ' + name); };
const asUser = async (uid) => {
  await db.exec(`reset role; select set_config('test.uid','${uid}',false); set role authenticated;`);
};
const asOwner = async () => { await db.exec('reset role'); };

try {
  await db.exec(`
    create schema auth;
    create role authenticated;
    create role anon;
    create role service_role bypassrls;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('test.uid',true),'')::uuid$$;
    grant usage on schema auth to authenticated, anon, service_role;

    create table public.organizations(id uuid primary key, name text, slug text);
    create table public.profiles(id uuid primary key, email text, platform_role text default 'user', status text default 'active');
    create table public.organization_members(organization_id uuid, user_id uuid, role text, status text);
    create function public.is_super_admin() returns boolean language sql stable security definer as $$
      select exists(select 1 from public.profiles where id=auth.uid() and platform_role='super_admin')$$;
    create function public.org_role(org uuid) returns text language sql stable security definer as $$
      select role from public.organization_members where user_id=auth.uid() and organization_id=org and status='active' limit 1$$;
    create function public.can_manage_org(org uuid) returns boolean language sql stable security definer as $$
      select coalesce(public.org_role(org) in ('owner','admin'),false)$$;

    create table public.exams(id uuid primary key, organization_id uuid not null references public.organizations(id), title text);
    create table public.exam_candidates(id uuid primary key, exam_id uuid not null references public.exams(id), full_name text);

    create table public.proctoring_incidents(
      id uuid primary key default gen_random_uuid(),
      exam_id uuid not null references public.exams(id) on delete cascade,
      candidate_id uuid references public.exam_candidates(id) on delete set null,
      attempt_id uuid,
      type text not null,
      severity text not null default 'medium',
      note text,
      reported_by uuid references public.profiles(id),
      status text not null default 'open' check (status in ('open','valid','invalid','investigating')),
      reviewed_by uuid references public.profiles(id),
      created_at timestamptz not null default now()
    );
    create table public.proctoring_rooms(
      id uuid primary key default gen_random_uuid(),
      exam_id uuid not null references public.exams(id) on delete cascade,
      room_name text unique not null,
      status text not null default 'active',
      created_at timestamptz not null default now()
    );
    create table public.proctoring_recordings(
      id uuid primary key default gen_random_uuid(),
      exam_id uuid references public.exams(id) on delete set null,
      room_name text, egress_id text, file_url text,
      status text not null default 'pending',
      retention_until timestamptz,
      created_at timestamptz not null default now()
    );

    insert into public.organizations values ('${A}','Alpha','alpha'),('${B}','Beta','beta');
    insert into public.profiles values ('${U}','supervisor@alpha.invalid','user','active');
    insert into public.organization_members values ('${A}','${U}','supervisor','active');
    insert into public.exams values ('${EA}','${A}','Alpha Exam'),('${EB}','${B}','Beta Exam');
    insert into public.exam_candidates values ('${CA}','${EA}','Candidate One');

    grant select,insert,update,delete on all tables in schema public to service_role;
    grant usage on schema public to authenticated, anon, service_role;
    grant select on public.exams, public.exam_candidates, public.profiles to authenticated;
    grant select on public.proctoring_incidents to authenticated;
    grant insert (exam_id,candidate_id,attempt_id,type,severity,note,reported_by) on public.proctoring_incidents to authenticated;
    grant update (status,reviewed_by) on public.proctoring_incidents to authenticated;
  `);

  await db.exec(readFileSync('supabase/migrations/0035_proctoring_review_history_and_retention.sql', 'utf8'));

  await test('new structures and columns exist', async () => {
    const t = await db.query(`select table_name from information_schema.tables where table_schema='public'
      and table_name in ('proctoring_incident_reviews','proctoring_room_events','proctoring_retention_policies','proctoring_retention_runs')`);
    assert.equal(t.rows.length, 4);
    const c = await db.query(`select column_name from information_schema.columns where table_schema='public'
      and table_name='proctoring_incidents' and column_name in ('organization_id','reviewed_at','review_note','retention_state','retention_applied_at')`);
    assert.equal(c.rows.length, 5);
  });

  await test('reporting an observation records who reported it', async () => {
    // Insert as the table owner with the reporter's uid in context, because the
    // fixture deliberately withholds INSERT on the id column (as production does).
    await asOwner();
    await db.exec(`select set_config('test.uid','${U}',false)`);
    await db.exec(`insert into public.proctoring_incidents(id,exam_id,candidate_id,type,severity,note,reported_by)
      values('${IA}','${EA}','${CA}','second_person','high','Second person visible','${U}')`);
    await asOwner();
    const r = await db.query(`select decision,new_status,reviewer_id,note,source,organization_id
      from public.proctoring_incident_reviews where incident_id='${IA}'`);
    assert.equal(r.rows.length, 1);
    assert.equal(r.rows[0].decision, 'reported');
    assert.equal(r.rows[0].new_status, 'open');
    assert.equal(r.rows[0].reviewer_id, U);
    assert.equal(r.rows[0].note, 'Second person visible');
    assert.equal(r.rows[0].source, 'workspace');
    assert.equal(r.rows[0].organization_id, A, 'organization derived from the examination');
  });

  await test('a review appends history and stamps the reviewer time', async () => {
    await asUser(U);
    await db.exec(`update public.proctoring_incidents set status='investigating',reviewed_by='${U}' where id='${IA}'`);
    await db.exec(`update public.proctoring_incidents set status='valid',reviewed_by='${U}',review_note='Confirmed on replay' where id='${IA}'`);
    await asOwner();
    const r = await db.query(`select decision,previous_status,new_status,note,reviewer_id
      from public.proctoring_incident_reviews where incident_id='${IA}' order by created_at, decision`);
    assert.equal(r.rows.length, 3);
    assert.deepEqual(r.rows.map(x => x.decision), ['reported', 'investigating', 'confirmed']);
    assert.equal(r.rows[2].previous_status, 'investigating');
    assert.equal(r.rows[2].new_status, 'valid');
    assert.equal(r.rows[2].note, 'Confirmed on replay');
    assert.equal(r.rows[2].reviewer_id, U);
    const st = await db.query(`select reviewed_at, review_note from public.proctoring_incidents where id='${IA}'`);
    assert.ok(st.rows[0].reviewed_at, 'reviewed_at stamped server-side');
    assert.equal(st.rows[0].review_note, 'Confirmed on replay');
  });

  await test('a repeated decision is recorded again, never overwritten', async () => {
    await asUser(U);
    await db.exec(`update public.proctoring_incidents set status='invalid',reviewed_by='${U}',review_note='Reopened after appeal' where id='${IA}'`);
    await asOwner();
    const r = await db.query(`select decision,new_status from public.proctoring_incident_reviews where incident_id='${IA}' order by created_at`);
    assert.equal(r.rows.length, 4);
    assert.equal(r.rows[3].decision, 'dismissed');
    assert.equal(r.rows[2].decision, 'confirmed', 'earlier decision preserved');
  });

  await test('history cannot be rewritten or deleted', async () => {
    await assert.rejects(() => db.exec(`update public.proctoring_incident_reviews set decision='confirmed' where incident_id='${IA}'`), /append-only/);
    await assert.rejects(() => db.exec(`delete from public.proctoring_incident_reviews where incident_id='${IA}'`), /append-only/);
  });

  await test('organization attribution cannot be reassigned by a client', async () => {
    // Layer 1: the client has no column privilege on organization_id at all.
    await asUser(U);
    await assert.rejects(() => db.exec(`update public.proctoring_incidents set organization_id='${B}' where id='${IA}'`), /permission denied/);
    // Layer 2: even with full privileges the trigger refuses the reassignment.
    await asOwner();
    await assert.rejects(() => db.exec(`update public.proctoring_incidents set organization_id='${B}' where id='${IA}'`), /cannot be reassigned/);
    const r = await db.query(`select organization_id from public.proctoring_incidents where id='${IA}'`);
    assert.equal(r.rows[0].organization_id, A);
  });

  await test('staff cannot write review history or room evidence directly', async () => {
    await asUser(U);
    await assert.rejects(() => db.exec(`insert into public.proctoring_incident_reviews(incident_id,organization_id,exam_id,decision,new_status)
      values('${IA}','${A}','${EA}','dismissed','invalid')`), /permission denied/);
    await assert.rejects(() => db.exec(`insert into public.proctoring_room_events(room_id,organization_id,exam_id,participant_identity,event)
      values('${RA}','${A}','${EA}','candidate-x','joined')`), /permission denied/);
    await asOwner();
  });

  await test('room evidence must match its room organization and examination', async () => {
    await db.exec(`insert into public.proctoring_rooms(id,exam_id,room_name,organization_id) values('${RA}','${EA}','exam-${EA}','${A}')`);
    await assert.rejects(() => db.exec(`insert into public.proctoring_room_events(room_id,organization_id,exam_id,participant_identity,event)
      values('${RA}','${B}','${EB}','candidate-x','joined')`), /must belong to its room/);
    await db.exec(`insert into public.proctoring_room_events(room_id,organization_id,exam_id,participant_identity,event)
      values('${RA}','${A}','${EA}','candidate-${CA}','joined')`);
    const r = await db.query(`select count(*)::int c from public.proctoring_room_events where room_id='${RA}'`);
    assert.equal(r.rows[0].c, 1);
  });

  await test('no configured policy means nothing is ever purged', async () => {
    const r = await db.query(`select public.proctoring_apply_retention('${A}',true) j`);
    assert.equal(r.rows[0].j.reason, 'no_policy_configured');
    assert.equal(r.rows[0].j.applied, false);
  });

  await test('a dry run reports the exact effect and changes nothing', async () => {
    await db.exec(`insert into public.proctoring_retention_policies(organization_id,observation_retention_days,review_note_retention_days)
      values('${A}',30,30)`);
    await db.exec(`update public.proctoring_incidents set created_at = now() - interval '90 days' where id='${IA}'`);
    const d = await db.query(`select public.proctoring_apply_retention('${A}',true) j`);
    assert.equal(d.rows[0].j.observations_anonymized, 1);
    const after = await db.query(`select note, retention_state from public.proctoring_incidents where id='${IA}'`);
    assert.equal(after.rows[0].note, 'Second person visible', 'dry run preserved the note');
    assert.equal(after.rows[0].retention_state, 'active');
  });

  await test('applying retention redacts narrative but keeps every decision', async () => {
    const applied = await db.query(`select public.proctoring_apply_retention('${A}',false) j`);
    assert.equal(applied.rows[0].j.applied, true);
    assert.equal(applied.rows[0].j.observations_anonymized, 1);

    const inc = await db.query(`select note, retention_state, retention_applied_at, status, reviewed_by
      from public.proctoring_incidents where id='${IA}'`);
    assert.equal(inc.rows[0].note, null);
    assert.equal(inc.rows[0].retention_state, 'anonymized');
    assert.ok(inc.rows[0].retention_applied_at);
    assert.equal(inc.rows[0].status, 'invalid', 'decision state preserved');
    assert.equal(inc.rows[0].reviewed_by, U, 'reviewer preserved');

    const hist = await db.query(`select decision, reviewer_id, note from public.proctoring_incident_reviews
      where incident_id='${IA}' order by created_at`);
    assert.equal(hist.rows.length, 4, 'no decision record was deleted');
    assert.deepEqual(hist.rows.map(x => x.decision), ['reported', 'investigating', 'confirmed', 'dismissed']);
    assert.equal(hist.rows[3].reviewer_id, U, 'reviewer preserved in history');

    const runs = await db.query(`select mode from public.proctoring_retention_runs where organization_id='${A}' order by created_at`);
    assert.ok(runs.rows.some(r => r.mode === 'dry_run'));
    assert.ok(runs.rows.some(r => r.mode === 'apply'));
  });

  await test('legal hold suspends every automatic action', async () => {
    await db.exec(`update public.proctoring_incidents set created_at = now() - interval '200 days' where id='${IA}'`);
    await db.exec(`update public.proctoring_retention_policies set legal_hold=true where organization_id='${A}'`);
    const r = await db.query(`select public.proctoring_apply_retention('${A}',false) j`);
    assert.equal(r.rows[0].j.reason, 'legal_hold');
    const runs = await db.query(`select count(*)::int c from public.proctoring_retention_runs where organization_id='${A}' and mode='held'`);
    assert.equal(runs.rows[0].c, 1);
  });

  await test('retention is scoped to one organization only', async () => {
    await db.exec(`update public.proctoring_retention_policies set legal_hold=false where organization_id='${A}'`);
    const r = await db.query(`select public.proctoring_apply_retention('${B}',false) j`);
    assert.equal(r.rows[0].j.reason, 'no_policy_configured');
  });

  await test('end users cannot execute the retention routine', async () => {
    await asUser(U);
    await assert.rejects(() => db.query(`select public.proctoring_apply_retention('${A}',false)`), /permission denied/);
    await asOwner();
  });

  console.log(`\n${n} proctoring review-history and retention checks passed (migration 0035 in isolated PGlite).`);
} catch (err) {
  console.error('\nFAILED:', err.message);
  process.exit(1);
} finally {
  await db.close();
}
