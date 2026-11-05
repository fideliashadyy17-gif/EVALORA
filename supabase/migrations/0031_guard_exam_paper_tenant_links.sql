-- Reject new cross-tenant exam/paper links, including direct PostgREST writes.
-- Existing rows are not modified. Share locks serialize links with tenant moves.
create or replace function public.guard_exam_quiz_tenant()
returns trigger language plpgsql security definer set search_path = public as $$
declare quiz_org uuid;
begin
  if new.quiz_id is null then return new; end if; -- existing ON DELETE SET NULL contract
  select organization_id into quiz_org from public.quizzes where id = new.quiz_id for share;
  if not found or quiz_org is distinct from new.organization_id then
    raise exception 'Examination paper must belong to the same organization.';
  end if;
  return new;
end $$;

drop trigger if exists exam_quiz_tenant_guard on public.exams;
create trigger exam_quiz_tenant_guard before insert or update of organization_id, quiz_id on public.exams
for each row execute function public.guard_exam_quiz_tenant();

create or replace function public.guard_quiz_question_tenant()
returns trigger language plpgsql security definer set search_path = public as $$
declare quiz_org uuid; question_org uuid;
begin
  select organization_id into quiz_org from public.quizzes where id = new.quiz_id for share;
  if not found then raise exception 'Question paper is unavailable.'; end if;
  select organization_id into question_org from public.questions where id = new.question_id for share;
  if not found or question_org is distinct from quiz_org then
    raise exception 'Question must belong to the same organization as its paper.';
  end if;
  return new;
end $$;

drop trigger if exists quiz_question_tenant_guard on public.quiz_questions;
create trigger quiz_question_tenant_guard before insert or update of quiz_id, question_id on public.quiz_questions
for each row execute function public.guard_quiz_question_tenant();

-- A parent tenant move must not invalidate links that were previously valid.
create or replace function public.guard_quiz_tenant_move()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.organization_id is distinct from old.organization_id and
    (exists (select 1 from public.exams e where e.quiz_id = old.id and e.organization_id is distinct from new.organization_id)
     or exists (select 1 from public.quiz_questions qq join public.questions q on q.id = qq.question_id
                where qq.quiz_id = old.id and q.organization_id is distinct from new.organization_id)) then
    raise exception 'Cannot move a paper while it is linked to another organization.';
  end if;
  return new;
end $$;
drop trigger if exists quiz_tenant_move_guard on public.quizzes;
create trigger quiz_tenant_move_guard before update of organization_id on public.quizzes
for each row execute function public.guard_quiz_tenant_move();

create or replace function public.guard_question_tenant_move()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.organization_id is distinct from old.organization_id and
    exists (select 1 from public.quiz_questions qq join public.quizzes z on z.id = qq.quiz_id
            where qq.question_id = old.id and z.organization_id is distinct from new.organization_id) then
    raise exception 'Cannot move a question while it is linked to another organization.';
  end if;
  return new;
end $$;
drop trigger if exists question_tenant_move_guard on public.questions;
create trigger question_tenant_move_guard before update of organization_id on public.questions
for each row execute function public.guard_question_tenant_move();
