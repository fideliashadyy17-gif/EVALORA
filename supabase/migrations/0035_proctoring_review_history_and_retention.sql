-- ═══════════════════════════════════════════════════════════════════════
-- EVALORA — migration 0035: proctoring review history, room lifecycle
-- evidence and configurable retention.
--
-- Additive and backward compatible. Existing observations, exams, attempts,
-- candidates and audit records are preserved untouched.
--
-- Why the history is generated in the DATABASE:
--   Status used to be overwritten in place, so a reviewer decision erased the
--   previous state and left no record of who decided what, when, or why. The
--   history table below is written by a trigger, which means every write path
--   (workspace server action, platform console, service role, direct SQL)
--   produces the same immutable record. It cannot be skipped by forgetting to
--   call a helper in application code.
--
-- Retention semantics (deliberately not a legal opinion):
--   A NULL retention period means "no automatic action — retain indefinitely".
--   Nothing is ever purged until an administrator of the owning organization
--   explicitly configures a period. Decisions (decision + reviewer + time) are
--   always preserved; only free-text narrative and media telemetry are subject
--   to the configured period. `legal_hold` suspends every automatic action.
-- ═══════════════════════════════════════════════════════════════════════

-- ─── 1. Observation attribution, review stamp and retention state ──────
alter table public.proctoring_incidents
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade,
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_note text,
  add column if not exists retention_state text not null default 'active',
  add column if not exists retention_applied_at timestamptz;

-- Backfill organization attribution from the owning examination.
update public.proctoring_incidents i
   set organization_id = e.organization_id
  from public.exams e
 where e.id = i.exam_id and i.organization_id is null;

-- Backfill review timestamps where a reviewer is already recorded.
update public.proctoring_incidents
   set reviewed_at = created_at
 where reviewed_by is not null and reviewed_at is null;

alter table public.proctoring_incidents alter column organization_id set not null;

alter table public.proctoring_incidents drop constraint if exists proctoring_incidents_retention_state_check;
alter table public.proctoring_incidents
  add constraint proctoring_incidents_retention_state_check
  check (retention_state in ('active','anonymized'));

alter table public.proctoring_incidents drop constraint if exists proctoring_incidents_review_note_len;
alter table public.proctoring_incidents
  add constraint proctoring_incidents_review_note_len
  check (review_note is null or char_length(review_note) <= 2000);

create index if not exists idx_proctoring_incidents_org_created
  on public.proctoring_incidents(organization_id, created_at desc);
create index if not exists idx_proctoring_incidents_status
  on public.proctoring_incidents(organization_id, status);

-- Organization is always derived from the examination, never trusted from the
-- client. The review timestamp is stamped by the server, not by the caller.
create or replace function public.guard_incident_organization()
returns trigger language plpgsql security definer set search_path=public as $$
declare exam_org uuid;
begin
  select organization_id into exam_org from public.exams where id = new.exam_id for share;
  if not found then
    raise exception 'Observation examination not found.';
  end if;
  if tg_op = 'UPDATE' and new.organization_id is distinct from old.organization_id then
    raise exception 'Observation organization cannot be reassigned.';
  end if;
  new.organization_id := exam_org;
  if tg_op = 'UPDATE' and new.reviewed_by is distinct from old.reviewed_by then
    new.reviewed_at := now();
  end if;
  return new;
end $$;

drop trigger if exists incident_organization_guard on public.proctoring_incidents;
create trigger incident_organization_guard
  before insert or update of exam_id, reviewed_by, organization_id
  on public.proctoring_incidents
  for each row execute function public.guard_incident_organization();

-- ─── 2. Immutable, append-only review history ──────────────────────────
create table if not exists public.proctoring_incident_reviews (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.proctoring_incidents(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  exam_id uuid not null references public.exams(id) on delete cascade,
  candidate_id uuid references public.exam_candidates(id) on delete set null,
  decision text not null check (decision in ('reported','confirmed','dismissed','investigating','reopened')),
  previous_status text,
  new_status text not null check (new_status in ('open','valid','invalid','investigating')),
  note text check (note is null or char_length(note) <= 2000),
  reviewer_id uuid references public.profiles(id) on delete set null,
  reviewer_email text,
  reviewer_role text,
  source text not null default 'workspace' check (source in ('workspace','platform','service','retention')),
  created_at timestamptz not null default now()
);

create index if not exists idx_pir_incident on public.proctoring_incident_reviews(incident_id, created_at);
create index if not exists idx_pir_org_created on public.proctoring_incident_reviews(organization_id, created_at desc);
create index if not exists idx_pir_exam on public.proctoring_incident_reviews(exam_id, created_at desc);
create index if not exists idx_pir_candidate on public.proctoring_incident_reviews(candidate_id) where candidate_id is not null;
create index if not exists idx_pir_reviewer on public.proctoring_incident_reviews(reviewer_id) where reviewer_id is not null;

alter table public.proctoring_incident_reviews enable row level security;

-- History is immutable: it can only grow. Rows are removed solely by the
-- cascade that removes their parent examination/incident.
create or replace function public.proctoring_review_append_only()
returns trigger language plpgsql set search_path=public as $$
begin
  if tg_op = 'DELETE' and not exists (
    select 1 from public.proctoring_incidents where id = old.incident_id
  ) then
    return old; -- parent already removed by its own cascade
  end if;
  if tg_op = 'UPDATE' and new.note is null and old.note is not null
     and new.decision = old.decision and new.reviewer_id is not distinct from old.reviewer_id then
    return new; -- approved retention redaction of free-text narrative only
  end if;
  raise exception 'Proctoring review history is append-only and cannot be rewritten or deleted.';
end $$;

drop trigger if exists proctoring_review_immutable on public.proctoring_incident_reviews;
create trigger proctoring_review_immutable
  before update or delete on public.proctoring_incident_reviews
  for each row execute function public.proctoring_review_append_only();

-- Single source of truth for the decision vocabulary.
create or replace function public.proctoring_decision_for_status(p_status text)
returns text language sql immutable as $$
  select case p_status
    when 'valid' then 'confirmed'
    when 'invalid' then 'dismissed'
    when 'investigating' then 'investigating'
    else 'reopened'
  end
$$;

-- Every status transition and every report is recorded, whatever wrote it.
create or replace function public.record_proctoring_incident_history()
returns trigger language plpgsql security definer set search_path=public as $$
declare actor uuid := auth.uid(); actor_email text; actor_role text; decision text;
begin
  if tg_op = 'INSERT' then
    select email into actor_email from public.profiles where id = new.reported_by;
    insert into public.proctoring_incident_reviews
      (incident_id, organization_id, exam_id, candidate_id, decision, previous_status, new_status,
       note, reviewer_id, reviewer_email, reviewer_role, source)
    values
      (new.id, new.organization_id, new.exam_id, new.candidate_id, 'reported', null, 'open',
       new.note, new.reported_by, actor_email, 'reporter',
       case when public.is_super_admin() then 'platform' else 'workspace' end);
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
    (incident_id, organization_id, exam_id, candidate_id, decision, previous_status, new_status,
     note, reviewer_id, reviewer_email, reviewer_role, source)
  values
    (new.id, new.organization_id, new.exam_id, new.candidate_id, decision, old.status, new.status,
     new.review_note,
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

-- Backfill history for observations that already carry a decision so the
-- review timeline is complete for pre-existing data. Nothing is invented:
-- the original created_at/reviewer are preserved, the exact decision time was
-- never recorded and is marked as reconstructed.
insert into public.proctoring_incident_reviews
  (incident_id, organization_id, exam_id, candidate_id, decision, previous_status, new_status,
   note, reviewer_id, reviewer_email, reviewer_role, source, created_at)
select i.id, i.organization_id, i.exam_id, i.candidate_id,
       case when i.status = 'open' then 'reported' else public.proctoring_decision_for_status(i.status) end,
       null, i.status,
       i.review_note, i.reviewed_by, p.email, 'backfilled', 'service',
       coalesce(i.reviewed_at, i.created_at)
  from public.proctoring_incidents i
  left join public.profiles p on p.id = i.reviewed_by
 where not exists (select 1 from public.proctoring_incident_reviews r where r.incident_id = i.id);

-- ─── 3. Persisted proctoring rooms and join/leave evidence ─────────────
alter table public.proctoring_rooms
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade,
  add column if not exists created_by uuid references public.profiles(id) on delete set null,
  add column if not exists started_at timestamptz,
  add column if not exists ended_at timestamptz,
  add column if not exists last_event_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

update public.proctoring_rooms r
   set organization_id = e.organization_id
  from public.exams e
 where e.id = r.exam_id and r.organization_id is null;

update public.proctoring_rooms set started_at = created_at where started_at is null;

alter table public.proctoring_rooms drop constraint if exists proctoring_rooms_status_check;
alter table public.proctoring_rooms
  add constraint proctoring_rooms_status_check check (status in ('active','ended'));

create index if not exists idx_proctoring_rooms_org on public.proctoring_rooms(organization_id, created_at desc);
create index if not exists idx_proctoring_rooms_exam on public.proctoring_rooms(exam_id);

create table if not exists public.proctoring_room_events (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.proctoring_rooms(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  exam_id uuid not null references public.exams(id) on delete cascade,
  participant_identity text not null,
  candidate_id uuid references public.exam_candidates(id) on delete set null,
  event text not null check (event in
    ('joined','left','connection_lost','reconnected','track_published','track_unpublished','room_started','room_finished')),
  detail jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists idx_pre_room on public.proctoring_room_events(room_id, occurred_at);
create index if not exists idx_pre_org_occurred on public.proctoring_room_events(organization_id, occurred_at desc);

alter table public.proctoring_room_events enable row level security;

create or replace function public.guard_room_event_identity()
returns trigger language plpgsql security definer set search_path=public as $$
declare room_org uuid; room_exam uuid;
begin
  select organization_id, exam_id into room_org, room_exam
    from public.proctoring_rooms where id = new.room_id;
  if not found then raise exception 'Proctoring room not found.'; end if;
  if new.organization_id is distinct from room_org or new.exam_id is distinct from room_exam then
    raise exception 'Room event must belong to its room organization and examination.';
  end if;
  return new;
end $$;

drop trigger if exists room_event_identity_guard on public.proctoring_room_events;
create trigger room_event_identity_guard
  before insert on public.proctoring_room_events
  for each row execute function public.guard_room_event_identity();

-- ─── 4. Configurable retention policy ─────────────────────────────────
create table if not exists public.proctoring_retention_policies (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  -- NULL = retain indefinitely (no automatic action). Periods are set by the
  -- organization's administrator; EVALORA does not impose a legal duration.
  evidence_retention_days integer check (evidence_retention_days is null or evidence_retention_days between 1 and 3650),
  observation_retention_days integer check (observation_retention_days is null or observation_retention_days between 1 and 3650),
  review_note_retention_days integer check (review_note_retention_days is null or review_note_retention_days between 1 and 3650),
  legal_hold boolean not null default false,
  allow_evidence_export boolean not null default false,
  note text check (note is null or char_length(note) <= 1000),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.proctoring_retention_policies enable row level security;

create table if not exists public.proctoring_retention_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  mode text not null check (mode in ('dry_run','apply','held')),
  policy jsonb not null default '{}'::jsonb,
  observations_anonymized integer not null default 0,
  review_notes_redacted integer not null default 0,
  room_events_purged integer not null default 0,
  recordings_expired integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_prr_org_created on public.proctoring_retention_runs(organization_id, created_at desc);

alter table public.proctoring_retention_runs enable row level security;

-- ─── 5. Retention application (never deletes decisions) ───────────────
create or replace function public.proctoring_apply_retention(
  p_organization uuid,
  p_dry_run boolean default true
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  pol public.proctoring_retention_policies%rowtype;
  obs_cutoff timestamptz; note_cutoff timestamptz; ev_cutoff timestamptz;
  obs int := 0; notes int := 0; events int := 0; recs int := 0; mode text; payload jsonb;
begin
  select * into pol from public.proctoring_retention_policies where organization_id = p_organization;
  if not found then
    return jsonb_build_object('applied', false, 'reason', 'no_policy_configured',
      'message', 'No retention policy is configured. All proctoring evidence is retained indefinitely.');
  end if;
  if pol.legal_hold then
    insert into public.proctoring_retention_runs(organization_id, mode, policy)
    values (p_organization, 'held', to_jsonb(pol) - 'organization_id');
    return jsonb_build_object('applied', false, 'reason', 'legal_hold');
  end if;

  mode := case when p_dry_run then 'dry_run' else 'apply' end;
  obs_cutoff  := case when pol.observation_retention_days is null then null
                      else now() - make_interval(days => pol.observation_retention_days) end;
  note_cutoff := case when pol.review_note_retention_days is null then null
                      else now() - make_interval(days => pol.review_note_retention_days) end;
  ev_cutoff   := case when pol.evidence_retention_days is null then null
                      else now() - make_interval(days => pol.evidence_retention_days) end;

  -- Count first so a dry run reports exactly what an apply would change.
  select count(*) into obs from public.proctoring_incidents
   where organization_id = p_organization and retention_state = 'active'
     and obs_cutoff is not null and created_at < obs_cutoff;
  select count(*) into notes from public.proctoring_incident_reviews
   where organization_id = p_organization and note is not null
     and note_cutoff is not null and created_at < note_cutoff;
  select count(*) into events from public.proctoring_room_events
   where organization_id = p_organization
     and ev_cutoff is not null and occurred_at < ev_cutoff;
  select count(*) into recs from public.proctoring_recordings
   where organization_id = p_organization and status <> 'expired'
     and ev_cutoff is not null and created_at < ev_cutoff;

  if not p_dry_run then
    -- Free-text narrative is redacted; the observation, its reviewer, its
    -- decision and its timestamps remain for accountability.
    update public.proctoring_incidents
       set note = null, retention_state = 'anonymized', retention_applied_at = now()
     where organization_id = p_organization and retention_state = 'active'
       and obs_cutoff is not null and created_at < obs_cutoff;
    update public.proctoring_incident_reviews
       set note = null
     where organization_id = p_organization and note is not null
       and note_cutoff is not null and created_at < note_cutoff;
    delete from public.proctoring_room_events
     where organization_id = p_organization
       and ev_cutoff is not null and occurred_at < ev_cutoff;
    update public.proctoring_recordings
       set status = 'expired', file_url = null, retention_until = coalesce(retention_until, now())
     where organization_id = p_organization and status <> 'expired'
       and ev_cutoff is not null and created_at < ev_cutoff;
  end if;

  payload := jsonb_build_object(
    'applied', not p_dry_run, 'observations_anonymized', obs,
    'review_notes_redacted', notes, 'room_events_purged', events, 'recordings_expired', recs);

  insert into public.proctoring_retention_runs
    (organization_id, mode, policy, observations_anonymized, review_notes_redacted,
     room_events_purged, recordings_expired)
  values (p_organization, mode, to_jsonb(pol) - 'organization_id', obs, notes, events, recs);

  return payload;
end $$;

revoke all on function public.proctoring_apply_retention(uuid, boolean) from public, anon, authenticated;
grant execute on function public.proctoring_apply_retention(uuid, boolean) to service_role;

-- ─── 6. Recordings attribution ────────────────────────────────────────
alter table public.proctoring_recordings
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

update public.proctoring_recordings r
   set organization_id = e.organization_id
  from public.exams e
 where e.id = r.exam_id and r.organization_id is null;

create index if not exists idx_proctoring_recordings_org
  on public.proctoring_recordings(organization_id, created_at desc);

-- ─── 7. RLS and grants ────────────────────────────────────────────────
-- Review history: readable by the owning organization's proctor roles and the
-- platform owner; writable only by the recorder trigger / service role.
drop policy if exists pir_select on public.proctoring_incident_reviews;
create policy pir_select on public.proctoring_incident_reviews for select to authenticated
  using (public.is_super_admin() or coalesce(
    public.org_role(organization_id) in ('owner','admin','teacher','supervisor','corrector'), false));

revoke insert, update, delete, truncate on public.proctoring_incident_reviews from authenticated;
revoke all on public.proctoring_incident_reviews from anon;

drop policy if exists pre_select on public.proctoring_room_events;
create policy pre_select on public.proctoring_room_events for select to authenticated
  using (public.is_super_admin() or coalesce(
    public.org_role(organization_id) in ('owner','admin','teacher','supervisor','corrector'), false));
revoke insert, update, delete, truncate on public.proctoring_room_events from authenticated;
revoke all on public.proctoring_room_events from anon;

drop policy if exists prp_select on public.proctoring_retention_policies;
create policy prp_select on public.proctoring_retention_policies for select to authenticated
  using (public.is_super_admin() or public.can_manage_org(organization_id));

drop policy if exists prp_write on public.proctoring_retention_policies;
create policy prp_write on public.proctoring_retention_policies for all to authenticated
  using (public.is_super_admin() or public.can_manage_org(organization_id))
  with check (public.is_super_admin() or public.can_manage_org(organization_id));

drop policy if exists prr_select on public.proctoring_retention_runs;
create policy prr_select on public.proctoring_retention_runs for select to authenticated
  using (public.is_super_admin() or public.can_manage_org(organization_id));
revoke insert, update, delete, truncate on public.proctoring_retention_runs from authenticated;

-- Reviewer narrative joins the existing review columns so the history trigger
-- can capture it in the same statement.
grant update (status, reviewed_by, review_note) on public.proctoring_incidents to authenticated;
