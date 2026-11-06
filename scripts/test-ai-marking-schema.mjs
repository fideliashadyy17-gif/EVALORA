// Migration 0038 in isolated PGlite: a suggestion is always a draft, a decision
// is final, and a mark that came from one is logged as such.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();

const ORG = '00000000-0000-4000-8000-000000000001';
const OTHER_ORG = '00000000-0000-4000-8000-000000000002';
const MARKER = '00000000-0000-4000-8000-000000000003';
const EXAM = '00000000-0000-4000-8000-000000000010';
const ATTEMPT = '00000000-0000-4000-8000-000000000011';
const ANSWER = '00000000-0000-4000-8000-000000000012';
const QUESTION = '00000000-0000-4000-8000-000000000013';
const RUBRIC = '00000000-0000-4000-8000-000000000020';
const OTHER_RUBRIC = '00000000-0000-4000-8000-000000000021';
const C1 = '00000000-0000-4000-8000-000000000030';
const C2 = '00000000-0000-4000-8000-000000000031';
const FOREIGN_CRITERION = '00000000-0000-4000-8000-000000000032';
const UNATTACHED_RUBRIC = '00000000-0000-4000-8000-000000000022';
const UNATTACHED_CRITERION = '00000000-0000-4000-8000-000000000033';

let n = 0;
const test = async (name, fn) => { await fn(); n++; console.log('  ✓ ' + name); };
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
const rejects = async (sql, params, pattern) => {
  let error = null;
  try { await db.query(sql, params); } catch (e) { error = e; }
  assert.ok(error, `expected a rejection: ${sql}`);
  if (pattern) assert.match(error.message, pattern);
  return error;
};
const asMarker = async () => {
  await db.exec(`select set_config('test.uid','${MARKER}',false);`);
};
const asSystem = async () => {
  await db.exec("select set_config('test.uid','',false);");
};

try {
  await db.exec(`
    create schema auth;
    create role authenticated;
    create role anon;
    create function auth.uid() returns uuid language sql stable as $f$
      select nullif(current_setting('test.uid', true), '')::uuid $f$;

    create table public.organizations(id uuid primary key default gen_random_uuid(), name text);
    create table public.profiles(id uuid primary key, email text);
    create table public.exams(id uuid primary key default gen_random_uuid(), organization_id uuid not null, quiz_id uuid);
    create table public.exam_attempts(id uuid primary key default gen_random_uuid(), exam_id uuid not null, status text not null default 'submitted');
    create table public.exam_answers(
      id uuid primary key default gen_random_uuid(),
      attempt_id uuid not null,
      question_id uuid not null,
      answer jsonb,
      points_awarded numeric(10,2),
      is_correct boolean,
      marked_by uuid,
      moderated_by uuid,
      moderation_status text,
      marker_note text,
      grading_method text
    );
    create table public.grading_rubrics(id uuid primary key default gen_random_uuid(), organization_id uuid not null, title text);
    create table public.grading_rubric_criteria(
      id uuid primary key default gen_random_uuid(),
      rubric_id uuid not null,
      organization_id uuid not null,
      position integer not null default 0,
      code text,
      label text,
      description text,
      max_marks numeric(10,2) not null
    );
    create table public.exam_rubric_links(
      id uuid primary key default gen_random_uuid(),
      exam_id uuid not null,
      rubric_id uuid not null,
      question_id uuid,
      organization_id uuid not null
    );
    create table public.grade_change_log(
      id uuid primary key default gen_random_uuid(),
      answer_id uuid not null,
      attempt_id uuid not null,
      exam_id uuid not null,
      organization_id uuid,
      actor_id uuid,
      actor_email text,
      change_type text not null,
      previous_points numeric(10,2),
      new_points numeric(10,2),
      previous_is_correct boolean,
      new_is_correct boolean,
      previous_moderation text,
      new_moderation text,
      note text,
      created_at timestamptz not null default now()
    );

    create function public.org_role(p_org uuid) returns text language sql stable as $f$ select 'corrector'::text $f$;
    create function public.is_super_admin() returns boolean language sql stable as $f$ select false $f$;

    insert into public.organizations(id, name) values ('${ORG}','One'), ('${OTHER_ORG}','Two');
    insert into public.profiles(id, email) values ('${MARKER}','marker@example.test');
    insert into public.exams(id, organization_id, quiz_id) values ('${EXAM}','${ORG}', gen_random_uuid());
    insert into public.exam_attempts(id, exam_id, status) values ('${ATTEMPT}','${EXAM}','submitted');
    insert into public.exam_answers(id, attempt_id, question_id, answer) values
      ('${ANSWER}','${ATTEMPT}','${QUESTION}','{"text":"Photosynthesis has two stages."}'::jsonb);
    insert into public.grading_rubrics(id, organization_id, title) values
      ('${RUBRIC}','${ORG}','Science'), ('${OTHER_RUBRIC}','${ORG}','History'), ('${UNATTACHED_RUBRIC}','${ORG}','Unattached');
    insert into public.grading_rubric_criteria(id, rubric_id, organization_id, position, label, max_marks) values
      ('${C1}','${RUBRIC}','${ORG}',0,'Names the light stage',4),
      ('${C2}','${RUBRIC}','${ORG}',1,'Names the dark stage',4),
      ('${FOREIGN_CRITERION}','${OTHER_RUBRIC}','${ORG}',0,'Dates the treaty',5),
      ('${UNATTACHED_CRITERION}','${UNATTACHED_RUBRIC}','${ORG}',0,'Something else',5);
    insert into public.exam_rubric_links(exam_id, rubric_id, question_id, organization_id) values
      ('${EXAM}','${RUBRIC}', null, '${ORG}');
  `);

  await db.exec(readFileSync('supabase/migrations/0038_ai_marking_proposals.sql', 'utf8'));
  await db.exec(readFileSync('supabase/migrations/0039_ai_marking_guardrails.sql', 'utf8'));

  // ── A suggestion is only ever a draft ────────────────────────────────────
  await test('a suggestion above the criterion maximum is refused', async () => {
    await asMarker();
    await rejects(
      `insert into public.ai_marking_proposals(answer_id,attempt_id,exam_id,organization_id,rubric_id,criterion_id,proposed_marks,rationale,provider,model)
       values ($1,$2,$3,$4,$5,$6,4.5,'too generous','openai','gpt-4o-mini')`,
      [ANSWER, ATTEMPT, EXAM, ORG, RUBRIC, C1],
      /cannot exceed the criterion maximum/,
    );
  });

  await test('a criterion from another rubric cannot be used', async () => {
    await asMarker();
    await rejects(
      `insert into public.ai_marking_proposals(answer_id,attempt_id,exam_id,organization_id,rubric_id,criterion_id,proposed_marks,rationale,provider,model)
       values ($1,$2,$3,$4,$5,$6,2,'mismatch','openai','gpt-4o-mini')`,
      [ANSWER, ATTEMPT, EXAM, ORG, RUBRIC, FOREIGN_CRITERION],
      /criterion's own rubric/,
    );
  });

  await test('a rubric not attached to the examination cannot be used', async () => {
    await asMarker();
    await rejects(
      `insert into public.ai_marking_proposals(answer_id,attempt_id,exam_id,organization_id,rubric_id,criterion_id,proposed_marks,rationale,provider,model)
       values ($1,$2,$3,$4,$5,$6,2,'unattached','openai','gpt-4o-mini')`,
      [ANSWER, ATTEMPT, EXAM, ORG, UNATTACHED_RUBRIC, UNATTACHED_CRITERION],
      /not attached to this examination/,
    );
  });

  await test('context is derived from the answer, not trusted from the caller', async () => {
    await asMarker();
    const row = await one(
      `insert into public.ai_marking_proposals(answer_id,attempt_id,exam_id,organization_id,rubric_id,criterion_id,proposed_marks,rationale,provider,model,requested_by)
       values ($1, gen_random_uuid(), gen_random_uuid(), $2, $3, $4, 2, 'derived', 'openai', 'gpt-4o-mini', null)
       returning attempt_id, exam_id, organization_id, requested_by`,
      [ANSWER, OTHER_ORG, RUBRIC, C2],
    );
    assert.equal(row.attempt_id, ATTEMPT, 'attempt is taken from the answer');
    assert.equal(row.exam_id, EXAM, 'examination is taken from the attempt');
    assert.equal(row.organization_id, ORG, 'workspace is taken from the examination');
    assert.equal(row.requested_by, MARKER, 'the requester is the authenticated caller');
  });

  await test('only one live suggestion exists per criterion', async () => {
    await asMarker();
    await db.exec("truncate public.ai_marking_proposals");
    await db.query(
      `insert into public.ai_marking_proposals(answer_id,attempt_id,exam_id,organization_id,rubric_id,criterion_id,proposed_marks,rationale,provider,model)
       values ($1,$2,$3,$4,$5,$6,2,'first','openai','m')`,
      [ANSWER, ATTEMPT, EXAM, ORG, RUBRIC, C2],
    );
    await rejects(
      `insert into public.ai_marking_proposals(answer_id,attempt_id,exam_id,organization_id,rubric_id,criterion_id,proposed_marks,rationale,provider,model)
       values ($1,$2,$3,$4,$5,$6,3,'second','openai','m')`,
      [ANSWER, ATTEMPT, EXAM, ORG, RUBRIC, C2],
      /duplicate key|unique/i,
    );
  });

  await test('a suggestion cannot be inserted as already decided', async () => {
    await asMarker();
    await rejects(
      `insert into public.ai_marking_proposals(answer_id,attempt_id,exam_id,organization_id,rubric_id,criterion_id,proposed_marks,rationale,provider,model,status)
       values ($1,$2,$3,$4,$5,$6,2,'sneaky','openai','m','accepted')`,
      [ANSWER, ATTEMPT, EXAM, ORG, RUBRIC, C1],
      /must start as proposed/,
    );
  });

  // ── A decision is final, and only a person makes it ──────────────────────
  await test('accepting records who decided and the accepted mark', async () => {
    await asMarker();
    await db.exec("truncate public.ai_marking_proposals");
    const { id } = await one(
      `insert into public.ai_marking_proposals(answer_id,attempt_id,exam_id,organization_id,rubric_id,criterion_id,proposed_marks,rationale,provider,model)
       values ($1,$2,$3,$4,$5,$6,3,'looks right','openai','m') returning id`,
      [ANSWER, ATTEMPT, EXAM, ORG, RUBRIC, C1],
    );
    await db.query("update public.ai_marking_proposals set status='accepted' where id=$1", [id]);
    const row = await one('select status, decided_by, decided_marks, decided_at from public.ai_marking_proposals where id=$1', [id]);
    assert.equal(row.status, 'accepted');
    assert.equal(row.decided_by, MARKER);
    assert.equal(Number(row.decided_marks), 3, 'accepting without an override keeps the proposed value');
    assert.ok(row.decided_at, 'the decision is stamped');
  });

  await test('the accepted mark must also respect the criterion maximum', async () => {
    await asMarker();
    const { id } = await one(
      `insert into public.ai_marking_proposals(answer_id,attempt_id,exam_id,organization_id,rubric_id,criterion_id,proposed_marks,rationale,provider,model)
       values ($1,$2,$3,$4,$5,$6,2,'ok','openai','m') returning id`,
      [ANSWER, ATTEMPT, EXAM, ORG, RUBRIC, C2],
    );
    await rejects(
      "update public.ai_marking_proposals set status='accepted', decided_marks=9 where id=$1",
      [id],
      /between 0 and the criterion maximum/,
    );
  });

  await test('an acceptance with no attributable decider is refused', async () => {
    await asSystem();
    await db.exec("truncate public.ai_marking_proposals");
    const { id } = await one(
      `insert into public.ai_marking_proposals(answer_id,attempt_id,exam_id,organization_id,rubric_id,criterion_id,proposed_marks,rationale,provider,model)
       values ($1,$2,$3,$4,$5,$6,2,'anon','openai','m') returning id`,
      [ANSWER, ATTEMPT, EXAM, ORG, RUBRIC, C1],
    );
    await rejects(
      "update public.ai_marking_proposals set status='accepted', decided_marks=2 where id=$1",
      [id],
      /must record who accepted it/,
    );
  });

  await test('a decided suggestion cannot be changed or deleted', async () => {
    await asMarker();
    await db.exec("truncate public.ai_marking_proposals");
    const { id } = await one(
      `insert into public.ai_marking_proposals(answer_id,attempt_id,exam_id,organization_id,rubric_id,criterion_id,proposed_marks,rationale,provider,model)
       values ($1,$2,$3,$4,$5,$6,2,'settled','openai','m') returning id`,
      [ANSWER, ATTEMPT, EXAM, ORG, RUBRIC, C1],
    );
    await db.query("update public.ai_marking_proposals set status='rejected' where id=$1", [id]);
    await rejects(
      "update public.ai_marking_proposals set status='accepted', decided_marks=2 where id=$1",
      [id],
      /already been decided/,
    );
    await rejects('delete from public.ai_marking_proposals where id=$1', [id], /cannot be deleted/);
  });

  await test('the suggestion itself cannot be rewritten at decision time', async () => {
    const { id } = await one(
      `insert into public.ai_marking_proposals(answer_id,attempt_id,exam_id,organization_id,rubric_id,criterion_id,proposed_marks,rationale,provider,model)
       values ($1,$2,$3,$4,$5,$6,1,'weak','openai','m') returning id`,
      [ANSWER, ATTEMPT, EXAM, ORG, RUBRIC, C2],
    );
    await rejects(
      "update public.ai_marking_proposals set proposed_marks = 4 where id=$1",
      [id],
      /never the suggestion itself/,
    );
  });

  await test('replacing the answer retires suggestions about the old text', async () => {
    await asMarker();
    await db.exec("truncate public.ai_marking_proposals");
    const { id } = await one(
      `insert into public.ai_marking_proposals(answer_id,attempt_id,exam_id,organization_id,rubric_id,criterion_id,proposed_marks,rationale,provider,model)
       values ($1,$2,$3,$4,$5,$6,2,'about the old answer','openai','m') returning id`,
      [ANSWER, ATTEMPT, EXAM, ORG, RUBRIC, C1],
    );
    await db.query(`update public.exam_answers set answer = '{"text":"A completely different answer."}'::jsonb where id=$1`, [ANSWER]);
    const row = await one('select status, decided_by from public.ai_marking_proposals where id=$1', [id]);
    assert.equal(row.status, 'superseded');
    assert.equal(row.decided_by, null, 'superseding is housekeeping, not a human decision');
  });

  // ── The audit label becomes reachable ────────────────────────────────────
  await test('a mark written from an accepted suggestion is logged as ai_assisted', async () => {
    await asMarker();
    await db.query("delete from public.grade_change_log");
    await db.query(
      "update public.exam_answers set points_awarded = 6, is_correct = true, marked_by = $1, grading_method = 'ai_assisted' where id = $2",
      [MARKER, ANSWER],
    );
    const row = await one("select change_type, new_points, actor_id, actor_email from public.grade_change_log where answer_id=$1", [ANSWER]);
    assert.equal(row.change_type, 'ai_assisted', 'the pre-existing audit label is finally used');
    assert.equal(Number(row.new_points), 6);
    assert.equal(row.actor_id, MARKER);
    assert.equal(row.actor_email, 'marker@example.test');
  });

  await test('an ordinary regrade keeps its own label', async () => {
    await asMarker();
    await db.query("delete from public.grade_change_log");
    await db.query(
      "update public.exam_answers set points_awarded = 5, grading_method = 'rubric' where id = $1",
      [ANSWER],
    );
    const row = await one("select change_type from public.grade_change_log where answer_id=$1", [ANSWER]);
    assert.equal(row.change_type, 'regraded', 'a manual change is not labelled as AI-assisted');
  });

  console.log(`\n${n} AI-marking schema checks passed (migrations 0038–0039 in isolated PGlite).`);
} finally {
  await db.close();
}
