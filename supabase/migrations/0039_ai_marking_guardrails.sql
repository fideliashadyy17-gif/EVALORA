-- Guard rails for AI marking suggestions (see 0038 for the table).
--
-- A suggestion is a draft: it cannot exceed its criterion, cannot be attached to
-- a rubric the examination does not use, cannot be rewritten after a decision,
-- and cannot be accepted without an attributable decider. Replacing the answer
-- retires suggestions about the old text, so nothing can be accepted about an
-- answer that no longer exists.
--
-- The last part makes the pre-existing 'ai_assisted' audit label reachable: a
-- mark written from an accepted suggestion is logged as such rather than as an
-- anonymous regrade.

create or replace function public.guard_ai_marking_proposal()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_attempt uuid;
  v_question uuid;
  v_exam uuid;
  v_org uuid;
  v_rubric uuid;
  v_max numeric;
begin
  if tg_op = 'DELETE' then
    if old.status <> 'proposed' then
      raise exception 'A decided suggestion cannot be deleted; it is part of the marking record.';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    select attempt_id, question_id into v_attempt, v_question
      from public.exam_answers where id = new.answer_id;
    if not found then raise exception 'Answer not found.'; end if;
    select exam_id into v_exam from public.exam_attempts where id = v_attempt;
    if not found then raise exception 'Attempt not found.'; end if;
    select organization_id into v_org from public.exams where id = v_exam;

    select rubric_id, max_marks into v_rubric, v_max
      from public.grading_rubric_criteria where id = new.criterion_id;
    if not found then raise exception 'Rubric criterion not found.'; end if;
    if v_rubric is distinct from new.rubric_id then
      raise exception 'A suggestion must use the criterion''s own rubric.';
    end if;
    if new.proposed_marks > v_max then
      raise exception 'A suggested mark (%) cannot exceed the criterion maximum (%).', new.proposed_marks, v_max;
    end if;
    if not exists (
      select 1 from public.exam_rubric_links l
       where l.exam_id = v_exam and l.rubric_id = new.rubric_id
         and (l.question_id is null or l.question_id = v_question)
    ) then
      raise exception 'The rubric is not attached to this examination.';
    end if;
    if new.status <> 'proposed' then
      raise exception 'A new suggestion must start as proposed.';
    end if;

    new.attempt_id := v_attempt;
    new.exam_id := v_exam;
    new.organization_id := v_org;
    new.requested_by := coalesce(new.requested_by, auth.uid());
    return new;
  end if;

  -- A decision is final. The suggestion it decided stays readable as history.
  if old.status <> 'proposed' then
    raise exception 'This suggestion has already been decided and cannot be changed.';
  end if;
  if new.answer_id is distinct from old.answer_id
     or new.criterion_id is distinct from old.criterion_id
     or new.rubric_id is distinct from old.rubric_id
     or new.proposed_marks is distinct from old.proposed_marks
     or new.rationale is distinct from old.rationale then
    raise exception 'Only the decision on a suggestion may change, never the suggestion itself.';
  end if;

  if new.status = 'accepted' then
    select max_marks into v_max from public.grading_rubric_criteria where id = old.criterion_id;
    if new.decided_marks is null then new.decided_marks := old.proposed_marks; end if;
    if new.decided_marks < 0 or new.decided_marks > v_max then
      raise exception 'The accepted mark (%) must be between 0 and the criterion maximum (%).', new.decided_marks, v_max;
    end if;
    new.decided_by := coalesce(new.decided_by, auth.uid());
    if new.decided_by is null then
      raise exception 'An accepted suggestion must record who accepted it.';
    end if;
    new.decided_at := coalesce(new.decided_at, now());
  elsif new.status = 'rejected' then
    new.decided_by := coalesce(new.decided_by, auth.uid());
    new.decided_at := coalesce(new.decided_at, now());
  else
    -- 'superseded' is housekeeping, not a human judgement.
    new.decided_by := null;
    new.decided_marks := null;
    new.decided_at := null;
  end if;

  return new;
end $$;

drop trigger if exists ai_marking_proposal_guard on public.ai_marking_proposals;
create trigger ai_marking_proposal_guard
  before insert or update or delete on public.ai_marking_proposals
  for each row execute function public.guard_ai_marking_proposal();

-- If the candidate's answer is replaced, any suggestion about the old text is
-- no longer about anything real; retire it rather than let it be accepted.
create or replace function public.supersede_ai_marking_proposals()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.answer is distinct from old.answer then
    update public.ai_marking_proposals
       set status = 'superseded'
     where answer_id = new.id and status = 'proposed';
  end if;
  return null;
end $$;

drop trigger if exists ai_proposals_superseded_on_answer_change on public.exam_answers;
create trigger ai_proposals_superseded_on_answer_change
  after update of answer on public.exam_answers
  for each row execute function public.supersede_ai_marking_proposals();

alter table public.ai_marking_proposals enable row level security;

drop policy if exists amp_select on public.ai_marking_proposals;
create policy amp_select on public.ai_marking_proposals for select to authenticated
  using (public.is_super_admin() or coalesce(public.org_role(organization_id) in ('owner','admin','teacher','corrector'), false));

-- No insert/update/delete policy: proposals are created and decided by the
-- server (service role) after it has authorised the marker. A client cannot
-- invent a suggestion, and cannot quietly rewrite one.
revoke insert, update, delete, truncate on public.ai_marking_proposals from authenticated;
revoke all on public.ai_marking_proposals from anon;

-- Make the existing audit label reachable: a mark that came from an accepted
-- suggestion is logged as 'ai_assisted', not as an anonymous regrade. This is a
-- verbatim copy of 0036's recorder plus the grading_method branch, and the
-- trigger now also fires when the method changes.
create or replace function public.record_grade_change()
returns trigger language plpgsql security definer set search_path=public as $$
declare attempt_exam uuid; exam_org uuid; actor uuid; actor_mail text; kind text;
begin
  if new.points_awarded is not distinct from old.points_awarded
     and new.is_correct is not distinct from old.is_correct
     and new.marked_by is not distinct from old.marked_by
     and new.moderation_status is not distinct from old.moderation_status
     and new.grading_method is not distinct from old.grading_method then
    return null;
  end if;

  select exam_id into attempt_exam from public.exam_attempts where id = new.attempt_id;
  if attempt_exam is null then return null; end if;
  select organization_id into exam_org from public.exams where id = attempt_exam;

  actor := coalesce(new.marked_by, new.moderated_by, auth.uid());
  select email into actor_mail from public.profiles where id = actor;

  kind := case
    when new.moderation_status is distinct from old.moderation_status then 'moderated'
    when new.points_awarded is null then 'cleared'
    when new.grading_method = 'ai_assisted' then 'ai_assisted'
    when old.points_awarded is null then 'marked'
    else 'regraded'
  end;

  insert into public.grade_change_log
    (answer_id, attempt_id, exam_id, organization_id, actor_id, actor_email, change_type,
     previous_points, new_points, previous_is_correct, new_is_correct,
     previous_moderation, new_moderation, note)
  values
    (new.id, new.attempt_id, attempt_exam, exam_org, actor, actor_mail, kind,
     old.points_awarded, new.points_awarded, old.is_correct, new.is_correct,
     old.moderation_status, new.moderation_status, new.marker_note);
  return null;
end $$;

drop trigger if exists grade_change_recorder on public.exam_answers;
create trigger grade_change_recorder
  after update of points_awarded, is_correct, marked_by, moderation_status, grading_method on public.exam_answers
  for each row execute function public.record_grade_change();
