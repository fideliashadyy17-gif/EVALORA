-- Keep the existing quiz/question model, but make any resources used by an
-- examination or live quiz immutable at the database boundary. This is a
-- backward-compatible version-lock: no existing rows are rewritten and all
-- existing exam/attempt foreign keys and historical content remain untouched.
-- A writer must duplicate the paper (and create new questions for edits) to
-- make a different version. Advisory transaction locks serialize exam/session
-- attachment against paper/question edits so there is no check-then-write gap.

create or replace function public.guard_assessment_source_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_paper_ids uuid[] := array[]::uuid[];
  v_question_ids uuid[] := array[]::uuid[];
  v_id uuid;
  v_lock_key text;
  v_locked boolean;
begin
  if tg_table_name = 'quizzes' then
    if tg_op <> 'INSERT' then v_paper_ids := array_append(v_paper_ids, old.id); end if;
    if tg_op <> 'DELETE' then v_paper_ids := array_append(v_paper_ids, new.id); end if;
  elsif tg_table_name = 'quiz_questions' then
    if tg_op <> 'INSERT' then
      v_paper_ids := array_append(v_paper_ids, old.quiz_id);
      v_question_ids := array_append(v_question_ids, old.question_id);
    end if;
    if tg_op <> 'DELETE' then
      v_paper_ids := array_append(v_paper_ids, new.quiz_id);
      v_question_ids := array_append(v_question_ids, new.question_id);
    end if;
  elsif tg_table_name = 'questions' then
    if tg_op <> 'INSERT' then v_question_ids := array_append(v_question_ids, old.id); end if;
    if tg_op <> 'DELETE' then v_question_ids := array_append(v_question_ids, new.id); end if;
  elsif tg_table_name = 'question_options' then
    if tg_op <> 'INSERT' then v_question_ids := array_append(v_question_ids, old.question_id); end if;
    if tg_op <> 'DELETE' then v_question_ids := array_append(v_question_ids, new.question_id); end if;
  else
    raise exception 'unsupported assessment source table: %', tg_table_name;
  end if;

  -- Quiz metadata/deletion also takes locks for its current questions so
  -- cascaded link writes follow the same question-before-paper order.
  if tg_table_name = 'quizzes' and tg_op <> 'INSERT' then
    select coalesce(array_agg(distinct qq.question_id), array[]::uuid[])
      into v_question_ids
      from public.quiz_questions qq where qq.quiz_id = old.id;
  end if;

  -- Lock question identities BEFORE querying their links. A concurrent paper
  -- link insert takes this same lock before it can commit; without this order,
  -- an edit could inspect a stale empty link set and race an exam attachment.
  if cardinality(v_question_ids) > 0 then
    for v_id in select distinct x from unnest(v_question_ids) as ids(x) where x is not null order by x loop
      perform pg_advisory_xact_lock(hashtextextended('question:' || v_id::text, 0));
    end loop;

    select coalesce(array_agg(distinct qq.quiz_id), array[]::uuid[])
      into v_paper_ids
      from public.quiz_questions qq
     where qq.question_id = any(v_question_ids);
  end if;

  -- Preserve explicitly affected quiz IDs (including a not-yet-inserted link)
  -- and de-duplicate before taking paper locks in a deterministic order.
  if tg_table_name = 'quiz_questions' and tg_op <> 'INSERT' then v_paper_ids := array_append(v_paper_ids, old.quiz_id); end if;
  if tg_table_name = 'quiz_questions' and tg_op <> 'DELETE' then v_paper_ids := array_append(v_paper_ids, new.quiz_id); end if;
  if tg_table_name = 'quizzes' and tg_op <> 'INSERT' then v_paper_ids := array_append(v_paper_ids, old.id); end if;
  if tg_table_name = 'quizzes' and tg_op <> 'DELETE' then v_paper_ids := array_append(v_paper_ids, new.id); end if;

  for v_id in select distinct x from unnest(v_paper_ids) as ids(x) where x is not null order by x loop
    perform pg_advisory_xact_lock(hashtextextended('paper:' || v_id::text, 0));
  end loop;

  foreach v_id in array v_paper_ids loop
    if v_id is null then continue; end if;
    select exists (select 1 from public.exams e where e.quiz_id = v_id)
        or exists (select 1 from public.quiz_sessions s where s.quiz_id = v_id)
      into v_locked;
    if v_locked then
      raise exception 'assessment content is immutable after an examination or live session uses this paper; duplicate it to create a new version'
        using errcode = '55000', detail = 'ASSESSMENT_SOURCE_IMMUTABLE';
    end if;
  end loop;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

-- The direct quiz row is protected (metadata, settings, publication state and
-- deletion). Link rows protect question membership, order, and marks.
drop trigger if exists quizzes_assessment_source_guard on public.quizzes;
create trigger quizzes_assessment_source_guard
  before update or delete on public.quizzes
  for each row execute function public.guard_assessment_source_mutation();

drop trigger if exists quiz_questions_assessment_source_guard on public.quiz_questions;
create trigger quiz_questions_assessment_source_guard
  before insert or update or delete on public.quiz_questions
  for each row execute function public.guard_assessment_source_mutation();

-- Question content and all answer options are protected if linked to any used
-- paper, including when a question is shared by multiple quizzes/organizations.
drop trigger if exists questions_assessment_source_guard on public.questions;
create trigger questions_assessment_source_guard
  before update or delete on public.questions
  for each row execute function public.guard_assessment_source_mutation();

drop trigger if exists question_options_assessment_source_guard on public.question_options;
create trigger question_options_assessment_source_guard
  before insert or update or delete on public.question_options
  for each row execute function public.guard_assessment_source_mutation();

-- Serialize attachment of a new exam/live session with source edits. Repointing
-- an existing examination or session is forbidden; it would rewrite its paper.
create or replace function public.lock_exam_paper_on_attach()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_quiz record;
  v_item_count integer;
  v_foreign_items integer;
begin
  if tg_op = 'UPDATE' and old.quiz_id is distinct from new.quiz_id then
    raise exception 'an examination or live session cannot be moved to a different paper after creation'
      using errcode = '55000', detail = 'EXAM_PAPER_IMMUTABLE';
  end if;
  if new.quiz_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('paper:' || new.quiz_id::text, 0));
  end if;

  -- Revalidate under the same paper lock held by all paper/question edits.
  -- This closes the action-level check/insert race (e.g. a draft editor saves
  -- while an organizer is creating an exam) without touching existing exams.
  if tg_table_name = 'exams' and tg_op = 'INSERT' then
    if new.quiz_id is null then
      raise exception 'a new examination requires a published paper'
        using errcode = '23514', detail = 'EXAM_PAPER_REQUIRED';
    end if;
    select id, organization_id, status into v_quiz
      from public.quizzes where id = new.quiz_id;
    if not found or v_quiz.organization_id is distinct from new.organization_id or v_quiz.status <> 'published' then
      raise exception 'a new examination requires a published paper owned by the same organization'
        using errcode = '23514', detail = 'EXAM_PAPER_INVALID';
    end if;
    select count(*)::integer,
           count(*) filter (where q.organization_id is distinct from new.organization_id)::integer
      into v_item_count, v_foreign_items
      from public.quiz_questions qq
      join public.questions q on q.id = qq.question_id
     where qq.quiz_id = new.quiz_id;
    if v_item_count = 0 or v_foreign_items > 0 then
      raise exception 'a new examination requires a non-empty paper containing only same-organization questions'
        using errcode = '23514', detail = 'EXAM_PAPER_CONTENT_INVALID';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists exams_lock_paper_on_attach on public.exams;
create trigger exams_lock_paper_on_attach
  before insert or update of quiz_id on public.exams
  for each row execute function public.lock_exam_paper_on_attach();

drop trigger if exists quiz_sessions_lock_paper_on_attach on public.quiz_sessions;
create trigger quiz_sessions_lock_paper_on_attach
  before insert or update of quiz_id on public.quiz_sessions
  for each row execute function public.lock_exam_paper_on_attach();
