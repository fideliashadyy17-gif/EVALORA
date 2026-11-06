-- Ensure an attempt belongs to the same exam as its candidate, and an
-- observation points only to the same exam/candidate/attempt. Existing records
-- are not changed. The locks coordinate with parent-identity changes.
create or replace function public.guard_attempt_candidate_exam()
returns trigger language plpgsql security definer set search_path=public as $$
declare candidate_exam uuid;
begin
  select exam_id into candidate_exam from public.exam_candidates where id=new.candidate_id for share;
  if not found or candidate_exam is distinct from new.exam_id then
    raise exception 'Attempt candidate must belong to the same examination.';
  end if;
  if tg_op='UPDATE' and (new.exam_id is distinct from old.exam_id or new.candidate_id is distinct from old.candidate_id) and
     exists (select 1 from public.proctoring_incidents i where i.attempt_id=old.id and
       (i.exam_id is distinct from new.exam_id or (i.candidate_id is not null and i.candidate_id is distinct from new.candidate_id))) then
    raise exception 'Cannot move an attempt linked to an observation.';
  end if;
  return new;
end $$;
drop trigger if exists attempt_candidate_exam_guard on public.exam_attempts;
create trigger attempt_candidate_exam_guard before insert or update of exam_id,candidate_id on public.exam_attempts
for each row execute function public.guard_attempt_candidate_exam();

create or replace function public.guard_incident_exam_links()
returns trigger language plpgsql security definer set search_path=public as $$
declare candidate_exam uuid; attempt_exam uuid; attempt_candidate uuid;
begin
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
  return new;
end $$;
drop trigger if exists incident_exam_links_guard on public.proctoring_incidents;
create trigger incident_exam_links_guard before insert or update of exam_id,candidate_id,attempt_id on public.proctoring_incidents
for each row execute function public.guard_incident_exam_links();

create or replace function public.guard_candidate_exam_move()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.exam_id is distinct from old.exam_id and
     (exists (select 1 from public.exam_attempts a where a.candidate_id=old.id and a.exam_id is distinct from new.exam_id)
      or exists (select 1 from public.proctoring_incidents i where i.candidate_id=old.id and i.exam_id is distinct from new.exam_id)) then
    raise exception 'Cannot move a candidate linked to an attempt or observation.';
  end if;
  return new;
end $$;
drop trigger if exists candidate_exam_move_guard on public.exam_candidates;
create trigger candidate_exam_move_guard before update of exam_id on public.exam_candidates
for each row execute function public.guard_candidate_exam_move();

-- Keep reports attributable and preserve them for human review. Staff may
-- create observations and review status but not erase or rewrite evidence.
-- Global admin service-role workflows retain their existing access.
drop policy if exists pi_all on public.proctoring_incidents;
drop policy if exists pi_select on public.proctoring_incidents;
drop policy if exists pi_insert on public.proctoring_incidents;
drop policy if exists pi_update on public.proctoring_incidents;
create policy pi_select on public.proctoring_incidents for select to authenticated
  using (public.is_super_admin() or exists (select 1 from public.exams e where e.id=exam_id and
    coalesce(public.org_role(e.organization_id) in ('owner','admin','teacher','supervisor','corrector'),false)));
create policy pi_insert on public.proctoring_incidents for insert to authenticated
  with check (reported_by=auth.uid() and status='open' and reviewed_by is null and
    (public.is_super_admin() or exists (select 1 from public.exams e where e.id=exam_id and
      coalesce(public.org_role(e.organization_id) in ('owner','admin','teacher','supervisor','corrector'),false))));
create policy pi_update on public.proctoring_incidents for update to authenticated
  using (public.is_super_admin() or exists (select 1 from public.exams e where e.id=exam_id and
    coalesce(public.org_role(e.organization_id) in ('owner','admin','teacher','supervisor','corrector'),false)))
  with check (reviewed_by=auth.uid() and (public.is_super_admin() or exists (select 1 from public.exams e where e.id=exam_id and
    coalesce(public.org_role(e.organization_id) in ('owner','admin','teacher','supervisor','corrector'),false))));

revoke insert,update,delete,truncate on public.proctoring_incidents from authenticated;
revoke truncate on public.proctoring_incidents from anon;
grant insert (exam_id,candidate_id,attempt_id,type,severity,note,reported_by) on public.proctoring_incidents to authenticated;
grant update (status,reviewed_by) on public.proctoring_incidents to authenticated;
