-- Keep assessment submission provenance separate from security incidents, and
-- make the existing proctoring review stream support live quiz/competition
-- participants as well as exam candidates. This migration is additive; it does
-- not create or alter any assessment, candidate, participant or answer data.

alter table public.exam_attempts
  add column if not exists submission_reason text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.exam_attempts'::regclass
      and conname = 'exam_attempts_submission_reason_check'
  ) then
    alter table public.exam_attempts
      add constraint exam_attempts_submission_reason_check
      check (
        submission_reason is null
        or (submission_reason = 'candidate_confirmed' and status in ('submitted', 'marked'))
        or (submission_reason = 'deadline' and status in ('auto_submitted', 'marked'))
      );
  end if;
end $$;

alter table public.proctoring_incidents
  add column if not exists quiz_id uuid references public.quizzes(id) on delete cascade,
  add column if not exists session_id uuid references public.quiz_sessions(id) on delete cascade,
  add column if not exists participant_id uuid references public.session_participants(id) on delete cascade,
  alter column exam_id drop not null;

alter table public.proctoring_incident_reviews
  add column if not exists quiz_id uuid references public.quizzes(id) on delete cascade,
  add column if not exists session_id uuid references public.quiz_sessions(id) on delete cascade,
  add column if not exists participant_id uuid references public.session_participants(id) on delete cascade,
  alter column exam_id drop not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid='public.proctoring_incidents'::regclass and conname='proctoring_incidents_assessment_scope') then
    alter table public.proctoring_incidents add constraint proctoring_incidents_assessment_scope check (
      (exam_id is not null and quiz_id is null and session_id is null and participant_id is null)
      or
      (exam_id is null and candidate_id is null and attempt_id is null and quiz_id is not null and session_id is not null and participant_id is not null)
    );
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.proctoring_incident_reviews'::regclass and conname='proctoring_incident_reviews_assessment_scope') then
    alter table public.proctoring_incident_reviews add constraint proctoring_incident_reviews_assessment_scope check (
      (exam_id is not null and quiz_id is null and session_id is null and participant_id is null)
      or
      (exam_id is null and candidate_id is null and quiz_id is not null and session_id is not null and participant_id is not null)
    );
  end if;
end $$;

create index if not exists idx_proctoring_incidents_session_created
  on public.proctoring_incidents(session_id, created_at desc) where session_id is not null;
create index if not exists idx_proctoring_incidents_participant_created
  on public.proctoring_incidents(participant_id, created_at desc) where participant_id is not null;
create index if not exists idx_proctoring_incident_reviews_session_created
  on public.proctoring_incident_reviews(session_id, created_at desc) where session_id is not null;

-- Lock and verify all assessment/participant links. An incident can describe
-- exactly one exam attempt or exactly one live quiz participant.
create or replace function public.guard_incident_exam_links()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  candidate_exam uuid;
  attempt_exam uuid;
  attempt_candidate uuid;
  session_quiz uuid;
  participant_session uuid;
begin
  if tg_op = 'UPDATE' and (
    new.exam_id is distinct from old.exam_id or new.candidate_id is distinct from old.candidate_id or
    new.attempt_id is distinct from old.attempt_id or new.quiz_id is distinct from old.quiz_id or
    new.session_id is distinct from old.session_id or new.participant_id is distinct from old.participant_id
  ) then
    raise exception 'Observation assessment and participant links cannot be reassigned.';
  end if;

  if new.exam_id is not null then
    if new.candidate_id is not null then
      select exam_id into candidate_exam from public.exam_candidates where id=new.candidate_id for share;
      if not found or candidate_exam is distinct from new.exam_id then
        raise exception 'Observation candidate must belong to the same examination.';
      end if;
    end if;
    if new.attempt_id is not null then
      select exam_id,candidate_id into attempt_exam,attempt_candidate from public.exam_attempts where id=new.attempt_id for share;
      if not found or attempt_exam is distinct from new.exam_id or
         (new.candidate_id is not null and attempt_candidate is distinct from new.candidate_id) then
        raise exception 'Observation attempt must match the examination and candidate.';
      end if;
    end if;
  else
    select quiz_id into session_quiz from public.quiz_sessions where id=new.session_id for share;
    if not found or session_quiz is distinct from new.quiz_id then
      raise exception 'Observation session must belong to the same quiz.';
    end if;
    select session_id into participant_session from public.session_participants where id=new.participant_id for share;
    if not found or participant_session is distinct from new.session_id then
      raise exception 'Observation participant must belong to the same live session.';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists incident_exam_links_guard on public.proctoring_incidents;
create trigger incident_exam_links_guard
  before insert or update of exam_id,candidate_id,attempt_id,quiz_id,session_id,participant_id
  on public.proctoring_incidents for each row execute function public.guard_incident_exam_links();

create or replace function public.guard_incident_organization()
returns trigger language plpgsql security definer set search_path=public as $$
declare assessment_org uuid;
begin
  if new.exam_id is not null then
    select organization_id into assessment_org from public.exams where id=new.exam_id for share;
  else
    select organization_id into assessment_org from public.quiz_sessions where id=new.session_id for share;
  end if;
  if not found then raise exception 'Observation assessment not found.'; end if;
  if tg_op = 'UPDATE' and new.organization_id is distinct from old.organization_id then
    raise exception 'Observation organization cannot be reassigned.';
  end if;
  new.organization_id := assessment_org;
  if tg_op = 'UPDATE' and new.reviewed_by is distinct from old.reviewed_by then new.reviewed_at := now(); end if;
  return new;
end $$;

drop trigger if exists incident_organization_guard on public.proctoring_incidents;
create trigger incident_organization_guard
  before insert or update of exam_id,session_id,reviewed_by,organization_id
  on public.proctoring_incidents for each row execute function public.guard_incident_organization();

-- Append-only history records live activity scope, browser reporters, and
-- reviewer decisions. Existing exam histories remain unchanged.
create or replace function public.record_proctoring_incident_history()
returns trigger language plpgsql security definer set search_path=public as $$
declare actor uuid := auth.uid(); actor_email text; actor_role text; decision text;
begin
  if tg_op = 'INSERT' then
    select email into actor_email from public.profiles where id = new.reported_by;
    insert into public.proctoring_incident_reviews
      (incident_id, organization_id, exam_id, candidate_id, quiz_id, session_id, participant_id,
       decision, previous_status, new_status, note, reviewer_id, reviewer_email, reviewer_role, source)
    values
      (new.id, new.organization_id, new.exam_id, new.candidate_id, new.quiz_id, new.session_id, new.participant_id,
       'reported', null, 'open', new.note, new.reported_by, actor_email,
       case when new.reported_by is null then 'participant_browser' else 'reporter' end,
       case when public.is_super_admin() then 'platform' when actor is null then 'service' else 'workspace' end);
    return new;
  end if;

  if new.status is not distinct from old.status and new.reviewed_by is not distinct from old.reviewed_by then return new; end if;
  decision := public.proctoring_decision_for_status(new.status);
  select email into actor_email from public.profiles where id = coalesce(new.reviewed_by, actor);
  select role into actor_role from public.organization_members
   where organization_id = new.organization_id and user_id = coalesce(new.reviewed_by, actor) and status = 'active' limit 1;
  insert into public.proctoring_incident_reviews
    (incident_id, organization_id, exam_id, candidate_id, quiz_id, session_id, participant_id,
     decision, previous_status, new_status, note, reviewer_id, reviewer_email, reviewer_role, source)
  values
    (new.id, new.organization_id, new.exam_id, new.candidate_id, new.quiz_id, new.session_id, new.participant_id,
     decision, old.status, new.status, new.review_note, coalesce(new.reviewed_by, actor), actor_email,
     coalesce(actor_role, 'platform_super_admin'),
     case when public.is_super_admin() then 'platform' when actor is null then 'service' else 'workspace' end);
  return new;
end $$;

-- Review access remains tenant-scoped; live organizers and the actual session
-- host gain visibility only for incidents attached to that session.
drop policy if exists pi_select on public.proctoring_incidents;
drop policy if exists pi_insert on public.proctoring_incidents;
drop policy if exists pi_update on public.proctoring_incidents;
create policy pi_select on public.proctoring_incidents for select to authenticated
  using (
    public.is_super_admin() or
    coalesce(public.org_role(organization_id) in ('owner','admin','teacher','supervisor','corrector'), false) or
    (session_id is not null and (
      coalesce(public.org_role(organization_id) = 'organizer', false) or
      exists (select 1 from public.quiz_sessions s where s.id=session_id and s.host_id=auth.uid())
    ))
  );
create policy pi_insert on public.proctoring_incidents for insert to authenticated
  with check (
    reported_by=auth.uid() and status='open' and reviewed_by is null and (
      public.is_super_admin() or
      coalesce(public.org_role(organization_id) in ('owner','admin','teacher','supervisor','corrector'), false) or
      (session_id is not null and (
        coalesce(public.org_role(organization_id) = 'organizer', false) or
        exists (select 1 from public.quiz_sessions s where s.id=session_id and s.host_id=auth.uid())
      ))
    )
  );
create policy pi_update on public.proctoring_incidents for update to authenticated
  using (
    public.is_super_admin() or
    coalesce(public.org_role(organization_id) in ('owner','admin','teacher','supervisor','corrector'), false) or
    (session_id is not null and (
      coalesce(public.org_role(organization_id) = 'organizer', false) or
      exists (select 1 from public.quiz_sessions s where s.id=session_id and s.host_id=auth.uid())
    ))
  )
  with check (
    reviewed_by=auth.uid() and (
      public.is_super_admin() or
      coalesce(public.org_role(organization_id) in ('owner','admin','teacher','supervisor','corrector'), false) or
      (session_id is not null and (
        coalesce(public.org_role(organization_id) = 'organizer', false) or
        exists (select 1 from public.quiz_sessions s where s.id=session_id and s.host_id=auth.uid())
      ))
    )
  );

drop policy if exists pir_select on public.proctoring_incident_reviews;
create policy pir_select on public.proctoring_incident_reviews for select to authenticated
  using (
    public.is_super_admin() or
    coalesce(public.org_role(organization_id) in ('owner','admin','teacher','supervisor','corrector'), false) or
    (session_id is not null and (
      coalesce(public.org_role(organization_id) = 'organizer', false) or
      exists (select 1 from public.quiz_sessions s where s.id=session_id and s.host_id=auth.uid())
    ))
  );

revoke insert,update,delete,truncate on public.proctoring_incidents from authenticated;
revoke truncate on public.proctoring_incidents from anon;
grant insert (exam_id,candidate_id,attempt_id,quiz_id,session_id,participant_id,type,severity,note,reported_by) on public.proctoring_incidents to authenticated;
grant update (status,reviewed_by,review_note) on public.proctoring_incidents to authenticated;
