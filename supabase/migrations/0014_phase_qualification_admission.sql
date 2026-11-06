-- 0014 — Server-side qualification, organizer approval, audited manual
-- overrides and phase admission. Existing exam results are only READ, never
-- modified to make a candidate eligible.

create or replace function public.evalora_can_manage(p_org uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  return coalesce(public.is_super_admin(), false)
    or coalesce(public.can_manage_org(p_org), false)
    or coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    or current_user in ('postgres', 'supabase_admin');
end $$;

create or replace function public.evalora_hash_secret(p_secret text)
returns text language sql immutable security definer set search_path = public as $$
  select encode(sha256(convert_to(coalesce(p_secret, ''), 'UTF8')), 'hex');
$$;

create or replace function public.evalora_normalize_code(p_code text)
returns text language sql immutable as $$
  select upper(btrim(coalesce(p_code, '')));
$$;

-- Verified student/class relationship for shared-link and phase admission.
alter table public.exam_candidates add column if not exists student_id uuid references public.students(id) on delete set null;
alter table public.exam_candidates add column if not exists class_id uuid references public.classes(id) on delete set null;

alter table public.qualification_records add column if not exists organization_id uuid;
alter table public.qualification_records add column if not exists approval_status text not null default 'pending';
alter table public.qualification_records add column if not exists approved_by uuid references public.profiles(id) on delete set null;
alter table public.qualification_records add column if not exists approved_at timestamptz;
alter table public.qualification_records add column if not exists admission_token_hash text;
alter table public.qualification_records add column if not exists manual_override boolean not null default false;
alter table public.qualification_records add column if not exists updated_at timestamptz not null default now();

update public.qualification_records r
set organization_id = e.organization_id
from public.competition_events e
where e.id = r.event_id and r.organization_id is null;

alter table public.qualification_records alter column organization_id set not null;
create index if not exists idx_qual_scope on public.qualification_records(organization_id, event_id, to_phase_id, class_id);
create unique index if not exists uq_qual_identity
  on public.qualification_records(event_id, coalesce(from_phase_id::text,''), to_phase_id,
    class_id, coalesce(student_id::text,''), coalesce(candidate_id::text,''), coalesce(participant_id::text,''));

create table if not exists public.qualification_overrides (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.competition_events(id) on delete cascade,
  from_phase_id uuid references public.competition_event_phases(id) on delete set null,
  to_phase_id uuid references public.competition_event_phases(id) on delete cascade,
  class_id uuid references public.classes(id) on delete set null,
  record_id uuid references public.qualification_records(id) on delete cascade,
  administrator_id uuid references public.profiles(id) on delete set null,
  student_id uuid references public.students(id) on delete set null,
  candidate_id uuid references public.exam_candidates(id) on delete set null,
  participant_id uuid references public.session_participants(id) on delete set null,
  display_name text,
  original_status text not null,
  new_status text not null,
  original_approval_status text,
  new_approval_status text,
  reason text not null check (length(btrim(reason)) >= 3),
  created_at timestamptz not null default now()
);
create index if not exists idx_qual_override_scope on public.qualification_overrides(organization_id, event_id, to_phase_id, created_at desc);

-- Calculate source results, rank within each class, apply the configured
-- rule and create/update traceable records. Approved and manual decisions
-- are preserved on recalculation; examination answers/scores are untouched.
create or replace function public.compute_phase_qualification(
  p_from_phase_id uuid, p_to_phase_id uuid, p_actor uuid default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_from record; v_to record; v_org uuid; v_event uuid;
  v_top int; v_min numeric; v_total int; v_eligible int; v_rejected int; v_classes int;
  v_result jsonb;
begin
  select * into v_from from public.competition_event_phases where id = p_from_phase_id;
  select * into v_to from public.competition_event_phases where id = p_to_phase_id;
  if not found or v_from.event_id is null or v_to.event_id is null or v_from.event_id <> v_to.event_id then
    raise exception 'Both phases must belong to the same parent event.';
  end if;
  select organization_id into v_org from public.competition_events where id = v_from.event_id;
  v_event := v_from.event_id;
  if not public.evalora_can_manage(v_org) then raise exception 'Not authorized to calculate qualifications.'; end if;

  v_top := coalesce((v_from.qualification_rule->>'top_n')::int, 10);
  v_min := coalesce((v_from.qualification_rule->>'min_percent')::numeric, 0);

  drop table if exists pg_temp.evalora_rank;
  create temp table evalora_rank on commit drop as
  with exam_base as (
    select pc.class_id,
           c.id::uuid as candidate_id,
           c.student_id::uuid as student_id,
           null::uuid as participant_id,
           coalesce(c.class_id, pc.class_id)::uuid as effective_class_id,
           c.full_name::text as display_name,
           coalesce(a.score, 0)::numeric as score,
           coalesce(a.max_score, 0)::numeric as max_score
    from public.competition_phase_classes pc
    join public.exams e on e.id = pc.exam_id
    join public.exam_candidates c on c.exam_id = e.id
    left join public.exam_attempts a on a.candidate_id = c.id
    where pc.phase_id = p_from_phase_id and v_from.phase_type = 'examination'
  ),
  live_base as (
    select pc.class_id,
           null::uuid as candidate_id,
           st.id::uuid as student_id,
           p.id::uuid as participant_id,
           pc.class_id::uuid as effective_class_id,
           p.display_name::text as display_name,
           coalesce(p.score, 0)::numeric as score,
           coalesce((
             select sum(coalesce(qq.points, q.points))
             from public.quiz_questions qq join public.questions q on q.id = qq.question_id
             where qq.quiz_id = s.quiz_id
           ), 0)::numeric as max_score
    from public.competition_phase_classes pc
    join public.quiz_sessions s on s.id = pc.session_id
    join public.session_participants p on p.session_id = s.id
    left join public.students st on st.user_id = p.user_id and st.organization_id = v_org
    where pc.phase_id = p_from_phase_id and v_from.phase_type = 'live_competition'
      and p.status not in ('rejected','blocked')
  ),
  all_rows as (
    select *, case when max_score > 0 then round(score / max_score * 100, 2) else 0 end as pct
    from (select * from exam_base union all select * from live_base) u
  ),
  ranked as (
    select *, rank() over (
      partition by effective_class_id
      order by pct desc, score desc, display_name asc
    )::int as source_rank
    from all_rows
  )
  select * from ranked;

  insert into public.qualification_records(
    organization_id, event_id, from_phase_id, to_phase_id, class_id,
    student_id, candidate_id, participant_id, display_name,
    source_score, source_max_score, source_rank, status, approval_status,
    decided_by, decided_at, notes)
  select v_org, v_event, p_from_phase_id, p_to_phase_id, r.effective_class_id,
    r.student_id, r.candidate_id, r.participant_id, r.display_name,
    r.score, r.max_score, r.source_rank,
    case when r.source_rank <= v_top and r.pct >= v_min then 'eligible' else 'rejected' end,
    case when r.source_rank <= v_top and r.pct >= v_min then 'pending' else 'not_applicable' end,
    coalesce(p_actor, auth.uid()), now(),
    format('Auto-computed from %s results: rank %s, %s%%.', v_from.phase_key, r.source_rank, r.pct)
  from pg_temp.evalora_rank r
  where not exists (
    select 1 from public.qualification_records q
    where q.event_id = v_event and q.to_phase_id = p_to_phase_id
      and q.class_id = r.effective_class_id
      and coalesce(q.student_id, q.candidate_id, q.participant_id)
        = coalesce(r.student_id, r.candidate_id, r.participant_id)
  );

  -- Recalculation refreshes scores/ranks but never undoes an approval or a
  -- documented manual override, and never changes exam_answers/exam_attempts.
  update public.qualification_records q
  set source_score = r.score,
      source_max_score = r.max_score,
      source_rank = r.source_rank,
      status = case
        when q.status in ('approved','manual_approved','manual_rejected') then q.status
        when r.source_rank <= v_top and r.pct >= v_min then 'eligible' else 'rejected' end,
      approval_status = case
        when q.status in ('approved','manual_approved','manual_rejected') then q.approval_status
        when r.source_rank <= v_top and r.pct >= v_min then 'pending' else 'not_applicable' end,
      notes = format('Recomputed from %s results: rank %s, %s%%.', v_from.phase_key, r.source_rank, r.pct),
      updated_at = now()
  from pg_temp.evalora_rank r
  where q.event_id = v_event and q.to_phase_id = p_to_phase_id
    and q.class_id = r.effective_class_id
    and coalesce(q.student_id, q.candidate_id, q.participant_id)
      = coalesce(r.student_id, r.candidate_id, r.participant_id)
    and q.manual_override = false;

  select count(*), count(*) filter (where source_rank <= v_top and pct >= v_min),
         count(*) filter (where not (source_rank <= v_top and pct >= v_min)),
         count(distinct effective_class_id)
  into v_total, v_eligible, v_rejected, v_classes
  from pg_temp.evalora_rank;

  return jsonb_build_object(
    'from_phase_id', p_from_phase_id, 'to_phase_id', p_to_phase_id,
    'event_id', v_event, 'organization_id', v_org,
    'rule', jsonb_build_object('top_n', v_top, 'min_percent', v_min),
    'total', v_total, 'eligible', v_eligible, 'rejected', v_rejected, 'classes', v_classes
  );
end $$;

-- Approve a qualified candidate. A one-time unguessable admission token is
-- returned to the authorized organizer; only its SHA-256 hash is stored.
create or replace function public.approve_phase_qualification(
  p_record_id uuid, p_actor uuid default null, p_note text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare r record; v_token text;
begin
  select * into r from public.qualification_records where id = p_record_id;
  if not found then raise exception 'Qualification record not found.'; end if;
  if not public.evalora_can_manage(r.organization_id) then raise exception 'Not authorized to approve qualifications.'; end if;
  if r.status not in ('eligible','approved','manual_approved') then
    raise exception 'Only a qualified record can be approved.';
  end if;
  v_token := gen_random_uuid()::text;
  update public.qualification_records
  set status = 'approved', approval_status = 'approved',
      approved_by = coalesce(p_actor, auth.uid()), approved_at = now(),
      admission_token_hash = public.evalora_hash_secret(v_token),
      decided_by = coalesce(p_actor, auth.uid()), decided_at = now(),
      notes = coalesce(p_note, notes), updated_at = now()
  where id = p_record_id;
  return jsonb_build_object('record_id', p_record_id, 'admission_token', v_token,
    'status', 'approved', 'event_id', r.event_id, 'to_phase_id', r.to_phase_id,
    'class_id', r.class_id, 'display_name', r.display_name);
end $$;

-- Documented manual override. Every change records admin, candidate, original
-- and new status, reason, timestamp, event and phase. Results are never edited.
create or replace function public.override_phase_qualification(
  p_record_id uuid, p_new_status text, p_reason text, p_actor uuid default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare r record; v_token text; v_approval text;
begin
  if p_new_status not in ('approved','rejected','manual_approved','manual_rejected') then
    raise exception 'Invalid qualification override status.';
  end if;
  if length(btrim(coalesce(p_reason,''))) < 3 then raise exception 'A documented reason is required.'; end if;
  select * into r from public.qualification_records where id = p_record_id;
  if not found then raise exception 'Qualification record not found.'; end if;
  if not public.evalora_can_manage(r.organization_id) then raise exception 'Not authorized to override qualifications.'; end if;
  v_approval := case when p_new_status in ('approved','manual_approved') then 'approved' else 'rejected' end;
  if p_new_status in ('approved','manual_approved') then
    v_token := gen_random_uuid()::text;
  end if;

  insert into public.qualification_overrides(
    organization_id, event_id, from_phase_id, to_phase_id, class_id, record_id,
    administrator_id, student_id, candidate_id, participant_id, display_name,
    original_status, new_status, original_approval_status, new_approval_status, reason)
  values (
    r.organization_id, r.event_id, r.from_phase_id, r.to_phase_id, r.class_id, r.id,
    coalesce(p_actor, auth.uid()), r.student_id, r.candidate_id, r.participant_id, r.display_name,
    r.status, p_new_status, r.approval_status, v_approval, p_reason);

  update public.qualification_records
  set status = p_new_status, approval_status = v_approval,
      manual_override = true,
      admission_token_hash = case when v_token is null then null else public.evalora_hash_secret(v_token) end,
      approved_by = case when v_token is null then approved_by else coalesce(p_actor, auth.uid()) end,
      approved_at = case when v_token is null then approved_at else now() end,
      decided_by = coalesce(p_actor, auth.uid()), decided_at = now(),
      notes = p_reason, updated_at = now()
  where id = p_record_id;

  return jsonb_build_object('record_id', p_record_id, 'original_status', r.status,
    'new_status', p_new_status, 'admission_token', v_token, 'reason', p_reason,
    'administrator_id', coalesce(p_actor, auth.uid()), 'event_id', r.event_id,
    'to_phase_id', r.to_phase_id, 'timestamp', now());
end $$;

-- The single server-side admission gate. Checks identity, organization, parent
-- event, class, target phase, qualification record, approval status and
-- competition/session availability. Never returns private rosters or tokens.
create or replace function public.verify_phase_admission(
  p_competition_id uuid, p_token text default null, p_user_id uuid default null,
  p_participant_ref text default null, p_student_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  c record; s record; p record; v_phase_id uuid; v_stage text;
  v_required boolean; v_student uuid; v_token_hash text; v_ok boolean;
begin
  select * into c from public.competitions where id = p_competition_id;
  if not found then return jsonb_build_object('allowed', false, 'reason', 'Competition not found.'); end if;
  if c.status not in ('published','scheduled','live','open','registration_open') then
    return jsonb_build_object('allowed', false, 'reason', 'This competition is not open for joining.');
  end if;
  if c.registration_opens_at is not null and now() < c.registration_opens_at then
    return jsonb_build_object('allowed', false, 'reason', 'Registration has not opened yet.');
  end if;
  if c.registration_closes_at is not null and now() > c.registration_closes_at and c.status <> 'live' then
    return jsonb_build_object('allowed', false, 'reason', 'Registration has closed.');
  end if;
  if c.ends_at is not null and now() > c.ends_at then
    return jsonb_build_object('allowed', false, 'reason', 'This competition has ended.');
  end if;
  v_stage := coalesce(c.settings->>'stage', '');
  select pc.phase_id into v_phase_id
  from public.competition_phase_classes pc
  where pc.competition_id = c.id limit 1;
  if v_phase_id is null and v_stage <> '' then
    select id into v_phase_id from public.competition_event_phases
    where event_id = c.event_id and phase_key = v_stage limit 1;
  end if;
  if v_phase_id is null then
    return jsonb_build_object('allowed', false, 'reason', 'No competition phase is linked to this session.');
  end if;
  select * into p from public.competition_event_phases where id = v_phase_id;
  if p.status not in ('scheduled','open','completed') then
    return jsonb_build_object('allowed', false, 'reason', 'This phase is not open for admission.', 'phase_id', v_phase_id);
  end if;
  if c.session_id is not null then
    select * into s from public.quiz_sessions where id = c.session_id;
    if not found or s.status in ('ended','cancelled') or s.admission_open is false then
      return jsonb_build_object('allowed', false, 'reason', 'The live session is not available.', 'phase_id', v_phase_id);
    end if;
  end if;

  v_required := coalesce((c.settings->>'qualification_required')::boolean,
                         (c.settings->>'require_qualification')::boolean, false);
  if not v_required then
    return jsonb_build_object('allowed', true, 'reason', 'No qualification requirement configured.',
      'phase_id', v_phase_id, 'class_id', c.class_id);
  end if;
  if c.event_id is null then
    return jsonb_build_object('allowed', false, 'reason', 'Competition is not linked to a parent event.', 'phase_id', v_phase_id);
  end if;

  v_student := p_student_id;
  if v_student is null and p_user_id is not null then
    select st.id into v_student from public.students st
    where st.user_id = p_user_id and st.organization_id = c.organization_id limit 1;
  end if;
  v_token_hash := case when nullif(btrim(coalesce(p_token,'')), '') is null then null
                       else public.evalora_hash_secret(btrim(p_token)) end;
  if v_token_hash is null and v_student is null then
    return jsonb_build_object('allowed', false,
      'reason', 'An approved qualification token or a verified student account is required.',
      'phase_id', v_phase_id, 'class_id', c.class_id);
  end if;
  if v_student is not null and c.class_id is not null and not exists (
    select 1 from public.student_enrollments e
    where e.student_id = v_student and e.class_id = c.class_id and e.status = 'active'
  ) then
    return jsonb_build_object('allowed', false,
      'reason', 'Your verified class is not eligible for this phase.',
      'phase_id', v_phase_id, 'class_id', c.class_id);
  end if;

  select exists (
    select 1 from public.qualification_records q
    where q.organization_id = c.organization_id
      and q.event_id = c.event_id
      and q.to_phase_id = v_phase_id
      and (c.class_id is null or q.class_id = c.class_id)
      and q.status in ('approved','manual_approved')
      and coalesce(q.approval_status, 'pending') = 'approved'
      and (
        (v_token_hash is not null and q.admission_token_hash = v_token_hash)
        or (v_student is not null and q.student_id = v_student)
        or (v_student is not null and q.candidate_id in (
             select id from public.exam_candidates where student_id = v_student))
        or (p_user_id is not null and q.participant_id in (
             select id from public.session_participants where user_id = p_user_id))
      )
  ) into v_ok;
  if not v_ok then
    return jsonb_build_object('allowed', false,
      'reason', 'No approved qualification record matches this identity, class and phase.',
      'phase_id', v_phase_id, 'class_id', c.class_id);
  end if;
  return jsonb_build_object('allowed', true, 'reason', 'Approved qualification verified.',
    'phase_id', v_phase_id, 'class_id', c.class_id, 'event_id', c.event_id);
end $$;

-- Organizer-only visibility of qualification and override records.
drop policy if exists qual_all on public.qualification_records;
drop policy if exists qual_select on public.qualification_records;
drop policy if exists qual_write on public.qualification_records;
create policy qual_select on public.qualification_records for select to authenticated
  using (public.is_super_admin() or public.can_create_content(organization_id));
create policy qual_write on public.qualification_records for all to authenticated
  using (public.is_super_admin() or public.can_manage_org(organization_id))
  with check (public.is_super_admin() or public.can_manage_org(organization_id));

alter table public.qualification_overrides enable row level security;
drop policy if exists qual_override_select on public.qualification_overrides;
create policy qual_override_select on public.qualification_overrides for select to authenticated
  using (public.is_super_admin() or public.can_create_content(organization_id));
drop policy if exists qual_override_write on public.qualification_overrides;
create policy qual_override_write on public.qualification_overrides for all to authenticated
  using (public.is_super_admin() or public.can_manage_org(organization_id))
  with check (public.is_super_admin() or public.can_manage_org(organization_id));

-- Private tables are never exposed through Supabase Realtime postgres_changes.
do $$
declare r record;
begin
  for r in
    select tablename from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename in ('qualification_records','qualification_overrides','question_pools','question_pool_items','question_usage')
  loop
    execute format('alter publication supabase_realtime drop table public.%I', r.tablename);
  end loop;
end $$;
