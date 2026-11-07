-- ═══════════════════════════════════════════════════════════════════════
-- EVALORA — migration 0053: shared examination and live-quiz integrity
--
-- Additive for existing examination observations. An incident now points to
-- exactly one assessment participation scope:
--   * exam_id + candidate_id + attempt_id, or
--   * quiz_id + session_id + participant_id.
-- No existing exam, attempt, answer, participant or incident is rewritten.
-- Organization attribution remains database-derived and immutable.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.proctoring_incidents
  add column if not exists quiz_id uuid references public.quizzes(id) on delete cascade,
  add column if not exists session_id uuid references public.quiz_sessions(id) on delete cascade,
  add column if not exists participant_id uuid references public.session_participants(id) on delete cascade;

alter table public.proctoring_incidents alter column exam_id drop not null;

alter table public.proctoring_incidents drop constraint if exists proctoring_incidents_assessment_scope;
alter table public.proctoring_incidents add constraint proctoring_incidents_assessment_scope check (
  (
    exam_id is not null and
    quiz_id is null and session_id is null and participant_id is null
  ) or (
    exam_id is null and candidate_id is null and attempt_id is null and
    quiz_id is not null and session_id is not null and participant_id is not null
  )
);

create index if not exists idx_proctoring_incidents_session_created
  on public.proctoring_incidents(session_id, created_at desc) where session_id is not null;
create index if not exists idx_proctoring_incidents_participant_created
  on public.proctoring_incidents(participant_id, created_at desc) where participant_id is not null;
create index if not exists idx_proctoring_incidents_quiz
  on public.proctoring_incidents(quiz_id) where quiz_id is not null;

-- Extend the existing exam-link guard rather than replacing it. Live links
-- must form one real participant -> session -> quiz chain.
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
    new.exam_id is distinct from old.exam_id or
    new.candidate_id is distinct from old.candidate_id or
    new.attempt_id is distinct from old.attempt_id or
    new.quiz_id is distinct from old.quiz_id or
    new.session_id is distinct from old.session_id or
    new.participant_id is distinct from old.participant_id
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
  on public.proctoring_incidents
  for each row execute function public.guard_incident_exam_links();

-- Organization is derived from the owning examination OR live session. The
-- caller's organization_id is never authoritative, including for service APIs.
create or replace function public.guard_incident_organization()
returns trigger language plpgsql security definer set search_path=public as $$
declare assessment_org uuid;
begin
  if new.exam_id is not null then
    select organization_id into assessment_org from public.exams where id = new.exam_id for share;
  else
    select organization_id into assessment_org from public.quiz_sessions where id = new.session_id for share;
  end if;
  if not found then
    raise exception 'Observation assessment not found.';
  end if;
  if tg_op = 'UPDATE' and new.organization_id is distinct from old.organization_id then
    raise exception 'Observation organization cannot be reassigned.';
  end if;
  new.organization_id := assessment_org;
  if tg_op = 'UPDATE' and new.reviewed_by is distinct from old.reviewed_by then
    new.reviewed_at := now();
  end if;
  return new;
end $$;

drop trigger if exists incident_organization_guard on public.proctoring_incidents;
create trigger incident_organization_guard
  before insert or update of exam_id,session_id,reviewed_by,organization_id
  on public.proctoring_incidents
  for each row execute function public.guard_incident_organization();

-- Review history carries the same live attribution. Existing examination
-- history remains valid and unchanged; only the exam column becomes nullable
-- so a live row does not need a fabricated examination.
alter table public.proctoring_incident_reviews
  add column if not exists quiz_id uuid references public.quizzes(id) on delete cascade,
  add column if not exists session_id uuid references public.quiz_sessions(id) on delete cascade,
  add column if not exists participant_id uuid references public.session_participants(id) on delete cascade;
alter table public.proctoring_incident_reviews alter column exam_id drop not null;

alter table public.proctoring_incident_reviews drop constraint if exists proctoring_incident_reviews_assessment_scope;
alter table public.proctoring_incident_reviews add constraint proctoring_incident_reviews_assessment_scope check (
  (exam_id is not null and quiz_id is null and session_id is null and participant_id is null)
  or
  (exam_id is null and candidate_id is null and quiz_id is not null and session_id is not null and participant_id is not null)
);

create index if not exists idx_pir_session_created
  on public.proctoring_incident_reviews(session_id, created_at desc) where session_id is not null;
create index if not exists idx_pir_participant
  on public.proctoring_incident_reviews(participant_id) where participant_id is not null;

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

  if new.status is not distinct from old.status and new.reviewed_by is not distinct from old.reviewed_by then
    return new;
  end if;

  decision := public.proctoring_decision_for_status(new.status);
  select email into actor_email from public.profiles where id = coalesce(new.reviewed_by, actor);
  select role into actor_role from public.organization_members
   where organization_id = new.organization_id and user_id = coalesce(new.reviewed_by, actor)
     and status = 'active' limit 1;

  insert into public.proctoring_incident_reviews
    (incident_id, organization_id, exam_id, candidate_id, quiz_id, session_id, participant_id,
     decision, previous_status, new_status, note, reviewer_id, reviewer_email, reviewer_role, source)
  values
    (new.id, new.organization_id, new.exam_id, new.candidate_id, new.quiz_id, new.session_id, new.participant_id,
     decision, old.status, new.status, new.review_note,
     coalesce(new.reviewed_by, actor), actor_email, coalesce(actor_role, 'platform_super_admin'),
     case when public.is_super_admin() then 'platform'
          when actor is null then 'service'
          else 'workspace' end);
  return new;
end $$;

drop trigger if exists incident_history_recorder on public.proctoring_incidents;
create trigger incident_history_recorder
  after insert or update of status, reviewed_by on public.proctoring_incidents
  for each row execute function public.record_proctoring_incident_history();

-- RLS: examination proctor roles keep their existing access. Live organizers
-- and the actual host can additionally review only live-session observations.
-- Participants/candidates receive no INSERT, UPDATE or DELETE privileges.
drop policy if exists pi_all on public.proctoring_incidents;
drop policy if exists pi_select on public.proctoring_incidents;
drop policy if exists pi_insert on public.proctoring_incidents;
drop policy if exists pi_update on public.proctoring_incidents;

create policy pi_select on public.proctoring_incidents for select to authenticated
  using (
    public.is_super_admin()
    or coalesce(public.org_role(organization_id) in ('owner','admin','teacher','supervisor','corrector'),false)
    or (session_id is not null and (
      coalesce(public.org_role(organization_id) = 'organizer',false)
      or exists (select 1 from public.quiz_sessions s where s.id=session_id and s.host_id=auth.uid())
    ))
  );

create policy pi_insert on public.proctoring_incidents for insert to authenticated
  with check (
    reported_by=auth.uid() and status='open' and reviewed_by is null and
    (
      public.is_super_admin()
      or coalesce(public.org_role(organization_id) in ('owner','admin','teacher','supervisor','corrector'),false)
      or (session_id is not null and (
        coalesce(public.org_role(organization_id) = 'organizer',false)
        or exists (select 1 from public.quiz_sessions s where s.id=session_id and s.host_id=auth.uid())
      ))
    )
  );

create policy pi_update on public.proctoring_incidents for update to authenticated
  using (
    public.is_super_admin()
    or coalesce(public.org_role(organization_id) in ('owner','admin','teacher','supervisor','corrector'),false)
    or (session_id is not null and (
      coalesce(public.org_role(organization_id) = 'organizer',false)
      or exists (select 1 from public.quiz_sessions s where s.id=session_id and s.host_id=auth.uid())
    ))
  )
  with check (
    reviewed_by=auth.uid() and
    (
      public.is_super_admin()
      or coalesce(public.org_role(organization_id) in ('owner','admin','teacher','supervisor','corrector'),false)
      or (session_id is not null and (
        coalesce(public.org_role(organization_id) = 'organizer',false)
        or exists (select 1 from public.quiz_sessions s where s.id=session_id and s.host_id=auth.uid())
      ))
    )
  );

revoke insert,update,delete,truncate on public.proctoring_incidents from authenticated;
revoke all on public.proctoring_incidents from anon;
grant select on public.proctoring_incidents to authenticated;
grant insert (exam_id,candidate_id,attempt_id,quiz_id,session_id,participant_id,type,severity,note,reported_by)
  on public.proctoring_incidents to authenticated;
grant update (status,reviewed_by,review_note) on public.proctoring_incidents to authenticated;

-- History remains append-only and organization-scoped. Live organizers/hosts
-- can read live history; examination-only history permissions are unchanged.
drop policy if exists pir_select on public.proctoring_incident_reviews;
create policy pir_select on public.proctoring_incident_reviews for select to authenticated
  using (
    public.is_super_admin()
    or coalesce(public.org_role(organization_id) in ('owner','admin','teacher','supervisor','corrector'),false)
    or (session_id is not null and (
      coalesce(public.org_role(organization_id) = 'organizer',false)
      or exists (select 1 from public.quiz_sessions s where s.id=session_id and s.host_id=auth.uid())
    ))
  );
revoke insert, update, delete, truncate on public.proctoring_incident_reviews from authenticated;
revoke all on public.proctoring_incident_reviews from anon;

comment on column public.proctoring_incidents.session_id is
  'Live quiz session for participant browser integrity observations; mutually exclusive with exam_id.';
comment on column public.proctoring_incidents.participant_id is
  'Token-authenticated live participant resolved by the server, never supplied as an attribution payload.';
