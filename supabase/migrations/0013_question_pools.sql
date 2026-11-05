-- 0013 — Generic question-pool assembly, approval/class/curriculum guards,
-- usage tracking and shortfall reporting. Additive; no existing table is
-- replaced and no published examination is modified.

create table if not exists public.question_pools (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid references public.competition_events(id) on delete cascade,
  phase_id uuid references public.competition_event_phases(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  subject_id uuid references public.subjects(id) on delete set null,
  curriculum text,
  title text not null,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  target_count integer not null default 20 check (target_count between 1 and 100),
  filters jsonb not null default '{}'::jsonb,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_qpools_scope on public.question_pools(organization_id, event_id, phase_id, class_id);
create unique index if not exists uq_qpool_active
  on public.question_pools(organization_id, coalesce(event_id::text,''), coalesce(phase_id::text,''), class_id, coalesce(curriculum,''))
  where status <> 'archived';

create table if not exists public.question_pool_items (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references public.question_pools(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  position integer not null default 0,
  added_by uuid references public.profiles(id) on delete set null,
  added_at timestamptz not null default now(),
  source text not null default 'manual' check (source in ('manual','automatic','replacement')),
  unique (pool_id, question_id)
);
create index if not exists idx_qpool_items_order on public.question_pool_items(pool_id, position);

create table if not exists public.question_usage (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid references public.competition_events(id) on delete cascade,
  phase_id uuid references public.competition_event_phases(id) on delete cascade,
  class_id uuid references public.classes(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  participant_id uuid references public.session_participants(id) on delete set null,
  student_id uuid references public.students(id) on delete set null,
  candidate_id uuid references public.exam_candidates(id) on delete set null,
  source text not null default 'pool' check (source in ('pool','exam','live')),
  used_at timestamptz not null default now()
);
create index if not exists idx_qusage_scope on public.question_usage(organization_id, event_id, phase_id, class_id, question_id);
create unique index if not exists uq_qusage_identity
  on public.question_usage(organization_id, coalesce(event_id::text,''), coalesce(phase_id::text,''),
    coalesce(class_id::text,''), question_id, coalesce(participant_id::text,''),
    coalesce(student_id::text,''), coalesce(candidate_id::text,''), source);

alter table public.competition_phase_classes
  add column if not exists question_pool_id uuid references public.question_pools(id) on delete set null;

-- Eligible approved questions for a pool. used_before is computed from the
-- question_usage ledger; callers may include or exclude prior usage.
create or replace function public.question_pool_eligible(p_pool_id uuid, p_exclude_used boolean default true)
returns table(question_id uuid, curriculum text, topic text, subtopic text, difficulty text,
              question_type text, used_before boolean, source_reference text, creation_method text)
language sql stable security definer set search_path = public as $$
  with pool as (select * from public.question_pools where id = p_pool_id),
  prior as (
    select distinct u.question_id
    from public.question_usage u, pool p
    where u.organization_id = p.organization_id
      and u.event_id is not distinct from p.event_id
      and u.class_id is not distinct from p.class_id
      and (u.phase_id is null or u.phase_id is distinct from p.phase_id)
  )
  select q.id, q.curriculum, q.topic, q.subtopic, q.difficulty, q.type,
    exists (
      select 1 from public.question_usage u, pool p
      where u.question_id = q.id
        and u.organization_id = p.organization_id
        and u.event_id is not distinct from p.event_id
        and u.class_id is not distinct from p.class_id
        and (u.phase_id is null or u.phase_id is distinct from p.phase_id)
    ) as used_before,
    q.source_reference, q.creation_method
  from public.questions q, pool p
  where q.organization_id = p.organization_id
    and q.class_id = p.class_id
    and q.review_status = 'approved'
    and q.status = 'published'
    and (p.subject_id is null or q.subject_id = p.subject_id)
    and (p.curriculum is null or q.curriculum = p.curriculum)
    and (coalesce(p.filters->>'topic','') = '' or q.topic = p.filters->>'topic')
    and (coalesce(p.filters->>'subtopic','') = '' or q.subtopic = p.filters->>'subtopic')
    and (coalesce(p.filters->>'difficulty','') = '' or q.difficulty = p.filters->>'difficulty')
    and (coalesce(p.filters->>'question_type','') = '' or q.type = p.filters->>'question_type')
    and (coalesce(p.filters->>'creation_method','') = '' or q.creation_method = p.filters->>'creation_method')
    and (not p_exclude_used or not exists (select 1 from prior pr where pr.question_id = q.id));
$$;

-- One report used by the UI, by publish guards and by integration tests.
create or replace function public.question_pool_validate(p_pool_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  pool record;
  v_errors text[] := '{}'::text[];
  v_selected int := 0;
  v_eligible int := 0;
  v_shortfall int := 0;
  v_bad int := 0;
  v_quota jsonb;
  v_counts jsonb := '{}'::jsonb;
  v_key text;
  v_min int;
  v_have int;
begin
  select * into pool from public.question_pools where id = p_pool_id;
  if not found then
    return jsonb_build_object('valid', false, 'selected', 0, 'shortfall', 0,
      'errors', to_jsonb(array['Question pool not found.']::text[]));
  end if;

  select count(*) into v_selected from public.question_pool_items where pool_id = p_pool_id;
  select count(*) into v_eligible from public.question_pool_eligible(p_pool_id, true);
  v_shortfall := greatest(0, pool.target_count - v_selected);

  select count(*) into v_bad
  from public.question_pool_items i join public.questions q on q.id = i.question_id
  where i.pool_id = p_pool_id and (q.review_status <> 'approved' or q.status <> 'published');
  if v_bad > 0 then
    v_errors := array_append(v_errors, format('%s selected question(s) are not approved/published.', v_bad));
  end if;

  select count(*) into v_bad
  from public.question_pool_items i join public.questions q on q.id = i.question_id
  where i.pool_id = p_pool_id
    and (q.organization_id <> pool.organization_id or q.class_id is distinct from pool.class_id);
  if v_bad > 0 then
    v_errors := array_append(v_errors, format('%s selected question(s) belong to another organization or class.', v_bad));
  end if;

  select count(*) into v_bad
  from public.question_pool_items i join public.questions q on q.id = i.question_id
  where i.pool_id = p_pool_id
    and (
      (pool.curriculum is not null and q.curriculum is distinct from pool.curriculum)
      or (pool.curriculum is null and not exists (
        select 1 from public.class_curricula cc
        join public.curriculum_programmes cp on cp.id = cc.programme_id
        where cc.class_id = pool.class_id and cp.key = q.curriculum
      ))
    );
  if v_bad > 0 then
    v_errors := array_append(v_errors, format('%s selected question(s) do not match the class curriculum.', v_bad));
  end if;

  v_quota := coalesce(pool.filters->'curriculum_quota', '{}'::jsonb);
  for v_key, v_min in select key, greatest(0, value::int) from jsonb_each_text(v_quota) loop
    select count(*) into v_have
    from public.question_pool_items i join public.questions q on q.id = i.question_id
    where i.pool_id = p_pool_id and q.curriculum = v_key;
    if v_have < least(v_min, pool.target_count) then
      v_errors := array_append(v_errors,
        format('Curriculum %s needs at least %s question(s); %s selected.', v_key, v_min, v_have));
    end if;
  end loop;

  if v_shortfall > 0 then
    v_errors := array_append(v_errors,
      format('Pool has %s of %s required questions. Shortfall: %s.', v_selected, pool.target_count, v_shortfall));
  end if;

  select coalesce(jsonb_object_agg(coalesce(c.curriculum, '—'), c.n), '{}'::jsonb) into v_counts
  from (
    select q.curriculum, count(*) n
    from public.question_pool_items i join public.questions q on q.id = i.question_id
    where i.pool_id = p_pool_id group by 1
  ) c;

  return jsonb_build_object(
    'valid', cardinality(v_errors) = 0,
    'pool_id', p_pool_id,
    'selected', v_selected,
    'eligible', v_eligible,
    'target_count', pool.target_count,
    'shortfall', v_shortfall,
    'insufficient', v_shortfall > 0,
    'curriculum_counts', v_counts,
    'errors', to_jsonb(v_errors)
  );
end $$;

-- Hard guard: an unapproved question or a question from another class can
-- never enter a pool, even through a direct REST call.
create or replace function public.question_pool_item_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare p record; q record; v_ok boolean;
begin
  select * into p from public.question_pools where id = new.pool_id;
  if not found then raise exception 'Question pool not found.'; end if;
  select * into q from public.questions where id = new.question_id;
  if not found then raise exception 'Question not found.'; end if;
  if q.review_status <> 'approved' or q.status <> 'published' then
    raise exception 'Only approved, published questions may enter a competition pool.';
  end if;
  if q.organization_id <> p.organization_id or q.class_id is distinct from p.class_id then
    raise exception 'Questions from another organization or class cannot be mixed in one pool.';
  end if;
  if p.curriculum is not null and q.curriculum is distinct from p.curriculum then
    raise exception 'Question curriculum does not match this pool.';
  end if;
  if p.curriculum is null then
    select exists (
      select 1 from public.class_curricula cc
      join public.curriculum_programmes cp on cp.id = cc.programme_id
      where cc.class_id = p.class_id and cp.key = q.curriculum
    ) into v_ok;
    if not v_ok then raise exception 'Question curriculum is not associated with this class.'; end if;
  end if;
  if p.status <> 'draft'
     and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
     and current_user not in ('postgres','supabase_admin') then
    raise exception 'Reopen the pool as a draft before changing its questions.';
  end if;
  return new;
end $$;
drop trigger if exists trg_qpool_item_guard on public.question_pool_items;
create trigger trg_qpool_item_guard before insert or update on public.question_pool_items
for each row execute function public.question_pool_item_guard();

-- Publishing requires a complete, approved, single-class, quota-valid pool.
-- It also enforces the owner decision before any Elimination pool is published.
create or replace function public.question_pool_publish_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v jsonb; v_phase text; v_flag text;
begin
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    v := public.question_pool_validate(new.id);
    if not coalesce((v->>'valid')::boolean, false) then
      raise exception 'Cannot publish an incomplete or invalid pool: %', v->'errors';
    end if;
    select p.phase_key into v_phase
    from public.competition_event_phases p where p.id = new.phase_id;
    if v_phase = 'elimination' then
      select e.settings->>'elimination_question_count_status' into v_flag
      from public.competition_events e where e.id = new.event_id;
      if coalesce(v_flag, 'pending_owner_confirmation') <> 'confirmed' then
        raise exception 'The Elimination question count is unresolved. Owner confirmation is required before publishing.';
      end if;
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists trg_qpool_publish_guard on public.question_pools;
create trigger trg_qpool_publish_guard before insert or update on public.question_pools
for each row execute function public.question_pool_publish_guard();

create or replace function public.shuffle_question_pool_items(p_pool_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_status text; v_count int;
begin
  select status into v_status from public.question_pools where id = p_pool_id;
  if v_status is null then raise exception 'Question pool not found.'; end if;
  if v_status <> 'draft' then raise exception 'Only a draft pool can be shuffled. Reopen it first.'; end if;
  with ordered as (
    select id, row_number() over (order by md5(id::text || clock_timestamp()::text)) - 1 as pos
    from public.question_pool_items where pool_id = p_pool_id
  )
  update public.question_pool_items i set position = o.pos
  from ordered o where i.id = o.id;
  select count(*) into v_count from public.question_pool_items where pool_id = p_pool_id;
  return jsonb_build_object('pool_id', p_pool_id, 'shuffled', v_count);
end $$;

-- Automatic assembly: approved questions only, one class only, quota-aware,
-- prior-usage-aware. A shortfall is reported; no unapproved question and no
-- quiet downgrade of quality is ever used to fill it.
create or replace function public.generate_question_pool_items(p_pool_id uuid, p_shuffle boolean default true)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  pool record;
  v_exclude boolean := true;
  v_key text;
  v_min int;
  v_have int;
  v_needed int;
  v_selected int;
  v_eligible int;
  v_report jsonb;
begin
  select * into pool from public.question_pools where id = p_pool_id;
  if not found then raise exception 'Question pool not found.'; end if;
  if pool.status <> 'draft' then raise exception 'Only a draft pool can be generated. Reopen it first.'; end if;
  if coalesce(pool.filters->>'previous_usage', 'exclude') = 'include' then v_exclude := false; end if;

  drop table if exists pg_temp.evalora_pool_candidates;
  create temp table evalora_pool_candidates on commit drop as
    select * from public.question_pool_eligible(p_pool_id, v_exclude);
  select count(*) into v_eligible from pg_temp.evalora_pool_candidates;

  delete from public.question_pool_items where pool_id = p_pool_id;

  for v_key, v_min in
    select key, greatest(0, least(value::int, pool.target_count))
    from jsonb_each_text(coalesce(pool.filters->'curriculum_quota', '{}'::jsonb))
  loop
    select count(*) into v_have
    from public.question_pool_items i join public.questions q on q.id = i.question_id
    where i.pool_id = p_pool_id and q.curriculum = v_key;
    insert into public.question_pool_items(pool_id, question_id, position, source)
    select p_pool_id, c.question_id, 0, 'automatic'
    from pg_temp.evalora_pool_candidates c
    where c.curriculum = v_key
      and not exists (select 1 from public.question_pool_items i where i.pool_id = p_pool_id and i.question_id = c.question_id)
    order by case when p_shuffle then md5(c.question_id::text || clock_timestamp()::text)
                  else concat_ws('|', c.curriculum, c.difficulty, c.topic, c.question_id::text) end
    limit greatest(0, v_min - v_have);
  end loop;

  v_needed := pool.target_count - (select count(*) from public.question_pool_items where pool_id = p_pool_id);
  if v_needed > 0 then
    insert into public.question_pool_items(pool_id, question_id, position, source)
    select p_pool_id, c.question_id, 0, 'automatic'
    from pg_temp.evalora_pool_candidates c
    where not exists (select 1 from public.question_pool_items i where i.pool_id = p_pool_id and i.question_id = c.question_id)
    order by case when p_shuffle then md5(c.question_id::text || clock_timestamp()::text)
                  else concat_ws('|', c.curriculum, c.difficulty, c.topic, c.question_id::text) end
    limit v_needed;
  end if;

  if p_shuffle then
    perform public.shuffle_question_pool_items(p_pool_id);
  else
    with ordered as (
      select id, row_number() over (
        order by position, question_id
      ) - 1 as pos from public.question_pool_items where pool_id = p_pool_id
    )
    update public.question_pool_items i set position = o.pos from ordered o where i.id = o.id;
  end if;

  v_report := public.question_pool_validate(p_pool_id);
  return v_report || jsonb_build_object('eligible_unused', v_eligible,
    'excluded_prior_usage', v_exclude,
    'workflow', case when (v_report->>'shortfall')::int > 0
      then 'Generate additional questions in the Question Bank, review and approve them, then regenerate this draft pool.'
      else 'Draft pool is complete and ready for preview.' end);
end $$;

-- Replace one unsuitable approved question with another approved, same-class,
-- curriculum-compatible question. Reuses the same hard guard.
create or replace function public.replace_question_pool_item(p_pool_id uuid, p_old uuid, p_new uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_status text; v_pos int; v_used boolean;
begin
  select status into v_status from public.question_pools where id = p_pool_id;
  if v_status is null then raise exception 'Question pool not found.'; end if;
  if v_status <> 'draft' then raise exception 'Reopen the pool as a draft before replacing a question.'; end if;
  select position into v_pos from public.question_pool_items where pool_id = p_pool_id and question_id = p_old;
  if v_pos is null then raise exception 'The question to replace is not in this pool.'; end if;
  select used_before into v_used from public.question_pool_eligible(p_pool_id, false) where question_id = p_new;
  if v_used then raise exception 'That replacement question was already encountered in an earlier phase.'; end if;
  delete from public.question_pool_items where pool_id = p_pool_id and question_id = p_old;
  insert into public.question_pool_items(pool_id, question_id, position, source)
  values (p_pool_id, p_new, v_pos, 'replacement');
  return public.question_pool_validate(p_pool_id);
end $$;

-- Participant-level usage is recorded when an answer is saved, and pool-level
-- usage is recorded when a pool is published. Both feed prior-usage filters.
create or replace function public.track_exam_question_usage()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.question_usage(organization_id, event_id, phase_id, class_id, question_id, candidate_id, source)
  select e.organization_id, e.event_id, p.id, coalesce(cpc.class_id, e.class_id),
         new.question_id, a.candidate_id, 'exam'
  from public.exam_attempts a
  join public.exams e on e.id = a.exam_id
  left join public.competition_phase_classes cpc on cpc.exam_id = e.id
  left join public.competition_event_phases p
    on p.id = cpc.phase_id or (e.event_id is not null and p.event_id = e.event_id and p.phase_key = coalesce(e.settings->>'stage',''))
  where a.id = new.attempt_id and e.event_id is not null
  on conflict do nothing;
  return new;
end $$;
drop trigger if exists trg_exam_answer_usage on public.exam_answers;
create trigger trg_exam_answer_usage after insert on public.exam_answers
for each row execute function public.track_exam_question_usage();

create or replace function public.track_live_question_usage()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.question_usage(organization_id, event_id, phase_id, class_id, question_id, participant_id, source)
  select s.organization_id, c.event_id, cpc.phase_id, cpc.class_id,
         new.question_id, new.participant_id, 'live'
  from public.quiz_sessions s
  join public.competition_phase_classes cpc on cpc.session_id = s.id
  join public.competitions c on c.id = cpc.competition_id
  where s.id = new.session_id and c.event_id is not null
  on conflict do nothing;
  return new;
end $$;
drop trigger if exists trg_live_answer_usage on public.participant_answers;
create trigger trg_live_answer_usage after insert on public.participant_answers
for each row execute function public.track_live_question_usage();

-- Organizer-only RLS; anonymous/guest flows use the token-scoped server routes.
alter table public.question_pools enable row level security;
alter table public.question_pool_items enable row level security;
alter table public.question_usage enable row level security;

drop policy if exists qpool_select on public.question_pools;
create policy qpool_select on public.question_pools for select to authenticated
  using (public.is_super_admin() or public.can_create_content(organization_id));
drop policy if exists qpool_write on public.question_pools;
create policy qpool_write on public.question_pools for all to authenticated
  using (public.is_super_admin() or public.can_manage_org(organization_id))
  with check (public.is_super_admin() or public.can_manage_org(organization_id));

drop policy if exists qpool_item_select on public.question_pool_items;
create policy qpool_item_select on public.question_pool_items for select to authenticated
  using (exists (
    select 1 from public.question_pools p
    where p.id = pool_id and (public.is_super_admin() or public.can_create_content(p.organization_id))
  ));
drop policy if exists qpool_item_write on public.question_pool_items;
create policy qpool_item_write on public.question_pool_items for all to authenticated
  using (exists (
    select 1 from public.question_pools p
    where p.id = pool_id and (public.is_super_admin() or public.can_manage_org(p.organization_id))
  ))
  with check (exists (
    select 1 from public.question_pools p
    where p.id = pool_id and (public.is_super_admin() or public.can_manage_org(p.organization_id))
  ));

drop policy if exists qusage_select on public.question_usage;
create policy qusage_select on public.question_usage for select to authenticated
  using (public.is_super_admin() or public.can_create_content(organization_id));
drop policy if exists qusage_write on public.question_usage;
create policy qusage_write on public.question_usage for all to authenticated
  using (public.is_super_admin() or public.can_manage_org(organization_id))
  with check (public.is_super_admin() or public.can_manage_org(organization_id));
