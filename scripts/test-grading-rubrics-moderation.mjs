// Migration 0036 exercised in isolated PGlite: reusable rubrics with derived
// totals, criterion scoring with hard bounds, moderation projection, and an
// append-only grade-change audit that cannot be bypassed.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const ORG = '00000000-0000-4000-8000-000000000001';
const ORG2 = '00000000-0000-4000-8000-000000000002';
const TEACH = '00000000-0000-4000-8000-000000000003';
const TEACH2 = '00000000-0000-4000-8000-000000000004';
const EXAM = '00000000-0000-4000-8000-000000000011';
const CAND = '00000000-0000-4000-8000-000000000021';
const ATT = '00000000-0000-4000-8000-000000000031';
const Q = '00000000-0000-4000-8000-000000000041';
const ANS = '00000000-0000-4000-8000-000000000051';
const RUB = '00000000-0000-4000-8000-000000000061';
const C1 = '00000000-0000-4000-8000-000000000071';
const C2 = '00000000-0000-4000-8000-000000000072';

let n = 0;
const test = async (name, fn) => { await fn(); n++; console.log('  ✓ ' + name); };
const asOwner = async () => { await db.exec('reset role'); };
const asTeacher = async (uid = TEACH) => {
  await db.exec(`reset role; select set_config('test.uid','${uid}',false); set role authenticated;`);
};

try {
  await db.exec(`
    create schema auth;
    create role authenticated;
    create role anon;
    create role service_role bypassrls;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('test.uid',true),'')::uuid$$;
    grant usage on schema auth to authenticated, anon, service_role;

    create table public.organizations(id uuid primary key, name text);
    create table public.profiles(id uuid primary key, email text, platform_role text default 'user', status text default 'active');
    create table public.organization_members(organization_id uuid, user_id uuid, role text, status text);
    create function public.is_super_admin() returns boolean language sql stable security definer as $$
      select exists(select 1 from public.profiles where id=auth.uid() and platform_role='super_admin')$$;
    create function public.org_role(org uuid) returns text language sql stable security definer as $$
      select role from public.organization_members where user_id=auth.uid() and organization_id=org and status='active' limit 1$$;
    create function public.can_manage_org(org uuid) returns boolean language sql stable security definer as $$
      select coalesce(public.org_role(org) in ('owner','admin'),false)$$;

    create table public.exams(id uuid primary key, organization_id uuid not null references public.organizations(id), title text);
    create table public.questions(id uuid primary key, organization_id uuid not null, points numeric default 10, type text default 'open_ended');
    create table public.exam_candidates(id uuid primary key, exam_id uuid not null references public.exams(id), full_name text);
    create table public.exam_attempts(
      id uuid primary key,
      exam_id uuid not null references public.exams(id),
      candidate_id uuid not null references public.exam_candidates(id),
      status text not null default 'submitted',
      score numeric
    );
    create table public.exam_answers(
      id uuid primary key default gen_random_uuid(),
      attempt_id uuid not null references public.exam_attempts(id) on delete cascade,
      question_id uuid not null references public.questions(id),
      answer jsonb not null default '{}'::jsonb,
      is_correct boolean,
      points_awarded numeric,
      marked_by uuid references public.profiles(id),
      marker_note text,
      updated_at timestamptz not null default now()
    );

    insert into public.organizations values ('${ORG}','Alpha'),('${ORG2}','Beta');
    insert into public.profiles values ('${TEACH}','teacher@alpha.invalid'),('${TEACH2}','grader2@alpha.invalid');
    insert into public.organization_members values ('${ORG}','${TEACH}','teacher','active'),('${ORG}','${TEACH2}','corrector','active');
    insert into public.exams values ('${EXAM}','${ORG}','Alpha Exam');
    insert into public.questions values ('${Q}','${ORG}',10,'open_ended');
    insert into public.exam_candidates values ('${CAND}','${EXAM}','Candidate One');
    insert into public.exam_attempts values ('${ATT}','${EXAM}','${CAND}','submitted',null);
    insert into public.exam_answers(id,attempt_id,question_id,answer) values ('${ANS}','${ATT}','${Q}','{"text":"Some answer"}');

    grant select,insert,update,delete on all tables in schema public to service_role;
    grant usage on schema public to authenticated, anon, service_role;
    grant select, insert, update on public.exam_answers to authenticated;
    grant select on public.exams, public.questions, public.exam_attempts to authenticated;
  `);

  await db.exec(readFileSync('supabase/migrations/0036_grading_rubrics_moderation_audit.sql', 'utf8'));

  // Supabase grants `authenticated` on public tables by default (RLS is the
  // gate). Reproduce that baseline, then the migration's own revokes, so the
  // privilege assertions below test what production actually enforces.
  await db.exec(`
    grant select, insert, update, delete on
      public.grading_rubrics, public.grading_rubric_criteria, public.exam_rubric_links,
      public.answer_rubric_scores, public.grading_assignments, public.grading_moderation,
      public.grade_change_log
      to authenticated;
    revoke update, delete, truncate on public.grading_moderation from authenticated;
    revoke insert, update, delete, truncate on public.grade_change_log from authenticated;
  `);

  await test('grading structures and answer metadata exist', async () => {
    const t = await db.query(`select table_name from information_schema.tables where table_schema='public'
      and table_name in ('grading_rubrics','grading_rubric_criteria','exam_rubric_links','answer_rubric_scores',
                         'grading_assignments','grading_moderation','grade_change_log')`);
    assert.equal(t.rows.length, 7);
    const c = await db.query(`select column_name from information_schema.columns where table_schema='public'
      and table_name='exam_answers' and column_name in ('moderation_status','moderated_by','moderated_at','grading_method')`);
    assert.equal(c.rows.length, 4);
  });

  await test('rubric total is derived from its criteria, never hand-maintained', async () => {
    await asTeacher();
    await db.exec(`insert into public.grading_rubrics(id,organization_id,title,framework,created_by)
      values('${RUB}','${ORG}','MYP Criterion A','IB MYP','${TEACH}')`);
    await db.exec(`insert into public.grading_rubric_criteria(id,rubric_id,organization_id,position,code,label,max_marks)
      values('${C1}','${RUB}','${ORG}',0,'A','Knowing and understanding',8)`);
    await db.exec(`insert into public.grading_rubric_criteria(id,rubric_id,organization_id,position,code,label,max_marks)
      values('${C2}','${RUB}','${ORG}',1,'B','Investigating patterns',8)`);
    await asOwner();
    let r = await db.query(`select total_marks from public.grading_rubrics where id='${RUB}'`);
    assert.equal(Number(r.rows[0].total_marks), 16);
    await db.exec(`delete from public.grading_rubric_criteria where id='${C2}'`);
    r = await db.query(`select total_marks from public.grading_rubrics where id='${RUB}'`);
    assert.equal(Number(r.rows[0].total_marks), 8);
    await db.exec(`insert into public.grading_rubric_criteria(id,rubric_id,organization_id,position,code,label,max_marks)
      values('${C2}','${RUB}','${ORG}',1,'B','Investigating patterns',8)`);
  });

  await test('the criterion organization always follows its rubric', async () => {
    await asTeacher();
    await assert.rejects(() => db.exec(`update public.grading_rubric_criteria set organization_id='${ORG2}' where id='${C1}'`),
      /own its rubric|must belong/);
    // Even with full privileges the trigger refuses a cross-organization write.
    await asOwner();
    await assert.rejects(() => db.exec(`update public.grading_rubric_criteria set organization_id='${ORG2}' where id='${C1}'`),
      /must belong/);
    const r = await db.query(`select organization_id from public.grading_rubric_criteria where id='${C1}'`);
    assert.equal(r.rows[0].organization_id, ORG);
  });

  await test('a rubric from another organization cannot be attached', async () => {
    await asOwner();
    const foreign = '00000000-0000-4000-8000-000000000062';
    await db.exec(`insert into public.grading_rubrics(id,organization_id,title) values('${foreign}','${ORG2}','Beta rubric')`);
    await assert.rejects(() => db.exec(`insert into public.exam_rubric_links(organization_id,exam_id,rubric_id)
      values('${ORG}','${EXAM}','${foreign}')`), /own organization/);
    await db.exec(`insert into public.exam_rubric_links(organization_id,exam_id,rubric_id) values('${ORG}','${EXAM}','${RUB}')`);
    const r = await db.query(`select organization_id from public.exam_rubric_links where exam_id='${EXAM}' and rubric_id='${RUB}'`);
    assert.equal(r.rows[0].organization_id, ORG);
  });

  await test('criterion marks are bounded by the criterion maximum', async () => {
    await asTeacher();
    await assert.rejects(() => db.exec(`insert into public.answer_rubric_scores(answer_id,attempt_id,question_id,rubric_id,criterion_id,organization_id,marks_awarded,grader_id)
      values('${ANS}','${ATT}','${Q}','${RUB}','${C1}','${ORG}',9,'${TEACH}')`), /exceed the criterion maximum/);
    await db.exec(`insert into public.answer_rubric_scores(answer_id,attempt_id,question_id,rubric_id,criterion_id,organization_id,marks_awarded,grader_id)
      values('${ANS}','${ATT}','${Q}','${RUB}','${C1}','${ORG}',6,'${TEACH}')`);
    await asOwner();
    const r = await db.query(`select organization_id, marks_awarded from public.answer_rubric_scores where answer_id='${ANS}'`);
    assert.equal(r.rows.length, 1);
    assert.equal(r.rows[0].organization_id, ORG, 'organization derived from the attempt');
    assert.equal(Number(r.rows[0].marks_awarded), 6);
  });

  await test('an unattached rubric cannot score an answer', async () => {
    await asOwner();
    await db.exec(`insert into public.grading_rubrics(id,organization_id,title) values('00000000-0000-4000-8000-000000000063','${ORG}','Unattached')`);
    await db.exec(`insert into public.grading_rubric_criteria(id,rubric_id,organization_id,position,label,max_marks)
      values('00000000-0000-4000-8000-000000000073','00000000-0000-4000-8000-000000000063','${ORG}',0,'x',5)`);
    await assert.rejects(() => db.exec(`insert into public.answer_rubric_scores(answer_id,attempt_id,question_id,rubric_id,criterion_id,organization_id,marks_awarded,grader_id)
      values('${ANS}','${ATT}','${Q}','00000000-0000-4000-8000-000000000063','00000000-0000-4000-8000-000000000073','${ORG}',3,'${TEACH}')`),
      /not attached to this examination/);
  });

  await test('multiple graders each keep their own criterion score', async () => {
    await asTeacher(TEACH2);
    await db.exec(`insert into public.answer_rubric_scores(answer_id,attempt_id,question_id,rubric_id,criterion_id,organization_id,marks_awarded,grader_id)
      values('${ANS}','${ATT}','${Q}','${RUB}','${C1}','${ORG}',7,'${TEACH2}')`);
    await asOwner();
    const r = await db.query(`select grader_id from public.answer_rubric_scores where answer_id='${ANS}' and criterion_id='${C1}' order by grader_id`);
    assert.equal(r.rows.length, 2, 'both graders retained independently');
  });

  await test('marking an answer is recorded in the grade change log', async () => {
    await asTeacher();
    await db.exec(`update public.exam_answers set points_awarded=6, is_correct=true, marked_by='${TEACH}', marker_note='Solid reasoning' where id='${ANS}'`);
    await asOwner();
    const r = await db.query(`select change_type, previous_points, new_points, actor_id, actor_email, organization_Id
      from public.grade_change_log where answer_id='${ANS}' order by created_at`);
    assert.equal(r.rows.length, 1);
    assert.equal(r.rows[0].change_type, 'marked');
    assert.equal(r.rows[0].previous_points, null);
    assert.equal(Number(r.rows[0].new_points), 6);
    assert.equal(r.rows[0].actor_id, TEACH);
    assert.equal(r.rows[0].actor_email, 'teacher@alpha.invalid');
  });

  await test('a regrade keeps the previous mark', async () => {
    await asTeacher();
    await db.exec(`update public.exam_answers set points_awarded=7, is_correct=true, marked_by='${TEACH}', marker_note='Adjusted after review' where id='${ANS}'`);
    await asOwner();
    const r = await db.query(`select change_type, previous_points, new_points, note from public.grade_change_log
      where answer_id='${ANS}' order by created_at`);
    assert.equal(r.rows.length, 2);
    assert.equal(r.rows[1].change_type, 'regraded');
    assert.equal(Number(r.rows[1].previous_points), 6);
    assert.equal(Number(r.rows[1].new_points), 7);
    assert.equal(r.rows[1].note, 'Adjusted after review');
  });

  await test('moderation state cannot be self-set by a bare update', async () => {
    await asTeacher(TEACH2);
    await assert.rejects(() => db.exec(`update public.exam_answers set moderation_status='returned' where id='${ANS}'`),
      /recording a moderation decision/);
    await asOwner();
  });

  await test('a moderation decision projects onto the answer atomically', async () => {
    await asTeacher(TEACH2);
    await db.exec(`insert into public.grading_moderation(answer_id,attempt_id,exam_id,organization_id,decision,moderator_id,moderator_email,note)
      values('${ANS}','${ATT}','${EXAM}','${ORG}','approved','${TEACH2}','grader2@alpha.invalid','Agrees with the marker')`);
    await asOwner();
    const a = await db.query(`select moderation_status, moderated_by, moderated_at, points_awarded from public.exam_answers where id='${ANS}'`);
    assert.equal(a.rows[0].moderation_status, 'approved');
    assert.equal(a.rows[0].moderated_by, TEACH2);
    assert.ok(a.rows[0].moderated_at);
    assert.equal(Number(a.rows[0].points_awarded), 7, 'approval does not alter the mark');
    const m = await db.query(`select previous_marks, organization_id from public.grading_moderation where answer_id='${ANS}'`);
    assert.equal(Number(m.rows[0].previous_marks), 7, 'previous mark captured');
    assert.equal(m.rows[0].organization_id, ORG);
  });

  await test('an adjustment changes the mark and is audited as moderated', async () => {
    await asTeacher(TEACH2);
    await db.exec(`insert into public.grading_moderation(answer_id,attempt_id,exam_id,organization_id,decision,proposed_marks,moderator_id,moderator_email,note)
      values('${ANS}','${ATT}','${EXAM}','${ORG}','adjusted',8.5,'${TEACH2}','grader2@alpha.invalid','Criterion B evidence overlooked')`);
    await asOwner();
    const a = await db.query(`select moderation_status, points_awarded, is_correct from public.exam_answers where id='${ANS}'`);
    assert.equal(a.rows[0].moderation_status, 'adjusted');
    assert.equal(Number(a.rows[0].points_awarded), 8.5);
    assert.equal(a.rows[0].is_correct, true);
    const log = await db.query(`select change_type, previous_points, new_points from public.grade_change_log
      where answer_id='${ANS}' order by created_at`);
    const last = log.rows[log.rows.length - 1];
    assert.equal(last.change_type, 'moderated');
    assert.equal(Number(last.previous_points), 7);
    assert.equal(Number(last.new_points), 8.5);
  });

  await test('moderation decisions and the grade log are append-only', async () => {
    await asOwner();
    await assert.rejects(() => db.exec(`update public.grading_moderation set decision='approved' where answer_id='${ANS}'`), /append-only/);
    await assert.rejects(() => db.exec(`delete from public.grade_change_log where answer_id='${ANS}'`), /append-only/);
    // marked, regraded, moderated (approved), moderated (adjusted)
    const c = await db.query(`select count(*)::int c from public.grade_change_log where answer_id='${ANS}'`);
    assert.equal(c.rows[0].c, 4);
  });

  await test('grade log records the moderation state transition', async () => {
    await asOwner();
    const r = await db.query(`select previous_moderation, new_moderation from public.grade_change_log
      where answer_id='${ANS}' and change_type='moderated' order by created_at`);
    assert.equal(r.rows.length, 2);
    assert.equal(r.rows[0].previous_moderation, 'not_required');
    assert.equal(r.rows[0].new_moderation, 'approved');
    assert.equal(r.rows[1].previous_moderation, 'approved');
    assert.equal(r.rows[1].new_moderation, 'adjusted');
  });

  await test('staff cannot write the grade log directly', async () => {
    await asTeacher();
    await assert.rejects(() => db.exec(`insert into public.grade_change_log(answer_id,attempt_id,exam_id,organization_id,change_type)
      values('${ANS}','${ATT}','${EXAM}','${ORG}','regraded')`), /permission denied/);
    await asOwner();
  });

  await test('grading metadata may only reference the same organization', async () => {
    await asOwner();
    const foreignExam = '00000000-0000-4000-8000-000000000012';
    const foreignCand = '00000000-0000-4000-8000-000000000022';
    const foreignAtt = '00000000-0000-4000-8000-000000000032';
    const foreignAns = '00000000-0000-4000-8000-000000000052';
    await db.exec(`insert into public.exams values('${foreignExam}','${ORG2}','Beta Exam')`);
    await db.exec(`insert into public.exam_candidates values('${foreignCand}','${foreignExam}','Beta Candidate')`);
    await db.exec(`insert into public.exam_attempts values('${foreignAtt}','${foreignExam}','${foreignCand}','submitted',null)`);
    await db.exec(`insert into public.exam_answers(id,attempt_id,question_id) values('${foreignAns}','${foreignAtt}','${Q}')`);
    // The attempt belongs to Beta, so the audit row is attributed to Beta even
    // if the caller supplied Alpha.
    await db.exec(`update public.exam_answers set points_awarded=3, marked_by='${TEACH}' where id='${foreignAns}'`);
    const r = await db.query(`select organization_id from public.grade_change_log where answer_id='${foreignAns}'`);
    assert.equal(r.rows[0].organization_id, ORG2);
  });

  console.log(`\n${n} grading rubric, moderation and audit checks passed (migration 0036 in isolated PGlite).`);
} catch (err) {
  console.error('\nFAILED:', err.message);
  process.exit(1);
} finally {
  await db.close();
}
