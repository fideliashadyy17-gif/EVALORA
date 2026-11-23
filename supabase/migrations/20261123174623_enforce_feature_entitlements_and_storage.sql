-- Central database entitlement predicates and enforcement for direct PostgREST
-- access. Server-role writes remain trusted application operations and must use
-- the corresponding server-side capability check; no service key is exposed to
-- browsers. Existing content, attempts and results are not modified.

create or replace function public.org_has_feature(p_org uuid, p_feature text)
returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  v_limits jsonb;
  v_flags jsonb := '{}'::jsonb;
  v_status text;
  v_feature_flag text;
begin
  if p_org is null then return false; end if;
  if auth.uid() is not null and public.is_super_admin() then return true; end if;

  select status into v_status from public.organizations where id = p_org;
  if not found or v_status <> 'active' then return false; end if;

  select coalesce(value, '{}'::jsonb) into v_flags
    from public.platform_settings where key = 'features' limit 1;
  v_flags := coalesce(v_flags, '{}'::jsonb);
  v_limits := public.org_entitlement_limits(p_org);

  case p_feature
    when 'question_bank' then
      return coalesce((v_limits ->> 'max_questions')::integer, -1) <> 0;
    when 'quiz_management' then
      return coalesce((v_limits ->> 'max_quizzes')::integer, -1) <> 0;
    when 'live_competitions' then
      return coalesce((v_flags ->> 'live_quizzes')::boolean, true)
        and coalesce((v_limits ->> 'max_quizzes')::integer, -1) <> 0
        and coalesce((v_limits ->> 'max_participants_per_session')::integer, -1) <> 0;
    when 'examinations' then
      return coalesce((v_flags ->> 'examinations')::boolean, true)
        and coalesce((v_limits ->> 'max_exams')::integer, -1) <> 0;
    when 'proctoring' then
      return coalesce((v_flags ->> 'proctoring')::boolean, true)
        and coalesce((v_limits ->> 'proctoring')::boolean, false);
    when 'reports_analytics' then
      return coalesce((v_limits ->> 'advanced_reports')::boolean, false);
    when 'institutional_administration' then
      return coalesce((v_limits ->> 'institutional')::boolean, false);
    when 'imports_exports' then
      return coalesce((v_limits ->> 'institutional')::boolean, false)
        or coalesce((v_limits ->> 'advanced_reports')::boolean, false);
    when 'central_asset_management' then
      return coalesce((v_limits ->> 'institutional')::boolean, false)
        or coalesce((v_limits ->> 'central_asset_management')::boolean, false);
    when 'multi_class_operations' then
      return coalesce((v_limits ->> 'institutional')::boolean, false)
        or coalesce((v_limits ->> 'multi_class_operations')::boolean, false);
    when 'premium_exam_experience' then
      return coalesce((v_limits ->> 'premium_exam_experience')::boolean, false)
        or coalesce((v_limits ->> 'exam_duplicate_protection')::boolean, false)
        or coalesce((v_limits ->> 'exam_language_lock')::boolean, false)
        or coalesce((v_limits ->> 'floating_calculator')::boolean, false)
        or coalesce((v_limits ->> 'interactive_math_tools')::boolean, false)
        or coalesce((v_limits ->> 'premium_math_interface')::boolean, false);
    else
      return false;
  end case;
end $$;

create or replace function public.org_has_storage(p_org uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.organizations where id = p_org and status = 'active')
     and public.org_limit(p_org, 'storage_mb') <> 0
$$;

revoke all on function public.org_has_feature(uuid, text) from public;
revoke all on function public.org_has_storage(uuid) from public;
grant execute on function public.org_has_feature(uuid, text) to authenticated, anon;
grant execute on function public.org_has_storage(uuid) to authenticated;

-- Keep existing tenant/role policies as the permissive layer; these restrictive
-- policies add an entitlement condition that direct PostgREST requests cannot
-- bypass by calling a server action with forged form values.
drop policy if exists entitlement_questions_select on public.questions;
create policy entitlement_questions_select on public.questions as restrictive
  for select to authenticated
  using (public.is_super_admin() or public.org_has_feature(organization_id, 'question_bank'));

drop policy if exists entitlement_questions_write on public.questions;
create policy entitlement_questions_write on public.questions as restrictive
  for all to authenticated
  using (public.is_super_admin() or public.org_has_feature(organization_id, 'question_bank'))
  with check (public.is_super_admin() or public.org_has_feature(organization_id, 'question_bank'));

drop policy if exists entitlement_question_options on public.question_options;
create policy entitlement_question_options on public.question_options as restrictive
  for all to authenticated
  using (public.is_super_admin() or exists (
    select 1 from public.questions q
    where q.id = question_options.question_id
      and public.org_has_feature(q.organization_id, 'question_bank')
  ))
  with check (public.is_super_admin() or exists (
    select 1 from public.questions q
    where q.id = question_options.question_id
      and public.org_has_feature(q.organization_id, 'question_bank')
  ));

drop policy if exists entitlement_question_categories on public.question_categories;
create policy entitlement_question_categories on public.question_categories as restrictive
  for all to authenticated
  using (public.is_super_admin() or public.org_has_feature(organization_id, 'question_bank'))
  with check (public.is_super_admin() or public.org_has_feature(organization_id, 'question_bank'));

drop policy if exists entitlement_question_pools on public.question_pools;
create policy entitlement_question_pools on public.question_pools as restrictive
  for all to authenticated
  using (public.is_super_admin() or public.org_has_feature(organization_id, 'question_bank'))
  with check (public.is_super_admin() or public.org_has_feature(organization_id, 'question_bank'));

drop policy if exists entitlement_question_pool_items on public.question_pool_items;
create policy entitlement_question_pool_items on public.question_pool_items as restrictive
  for all to authenticated
  using (public.is_super_admin() or exists (
    select 1 from public.question_pools p
    where p.id = question_pool_items.pool_id
      and public.org_has_feature(p.organization_id, 'question_bank')
  ))
  with check (public.is_super_admin() or exists (
    select 1 from public.question_pools p
    where p.id = question_pool_items.pool_id
      and public.org_has_feature(p.organization_id, 'question_bank')
  ));

drop policy if exists entitlement_question_usage on public.question_usage;
create policy entitlement_question_usage on public.question_usage as restrictive
  for all to authenticated
  using (public.is_super_admin() or public.org_has_feature(organization_id, 'question_bank'))
  with check (public.is_super_admin() or public.org_has_feature(organization_id, 'question_bank'));

drop policy if exists entitlement_question_hints on public.question_hints;
create policy entitlement_question_hints on public.question_hints as restrictive
  for all to authenticated
  using (public.is_super_admin() or public.org_has_feature(organization_id, 'examinations'))
  with check (public.is_super_admin() or public.org_has_feature(organization_id, 'examinations'));

drop policy if exists entitlement_quizzes on public.quizzes;
create policy entitlement_quizzes on public.quizzes as restrictive
  for all to authenticated
  using (public.is_super_admin() or public.org_has_feature(organization_id, 'quiz_management'))
  with check (public.is_super_admin() or public.org_has_feature(organization_id, 'quiz_management'));

drop policy if exists entitlement_quiz_questions on public.quiz_questions;
create policy entitlement_quiz_questions on public.quiz_questions as restrictive
  for all to authenticated
  using (public.is_super_admin() or exists (
    select 1 from public.quizzes q
    where q.id = quiz_questions.quiz_id
      and public.org_has_feature(q.organization_id, 'quiz_management')
  ))
  with check (public.is_super_admin() or exists (
    select 1 from public.quizzes q
    where q.id = quiz_questions.quiz_id
      and public.org_has_feature(q.organization_id, 'quiz_management')
  ));

drop policy if exists entitlement_exams on public.exams;
create policy entitlement_exams on public.exams as restrictive
  for all to authenticated
  using (public.is_super_admin() or public.org_has_feature(organization_id, 'examinations'))
  with check (public.is_super_admin() or public.org_has_feature(organization_id, 'examinations'));

drop policy if exists entitlement_exam_candidates on public.exam_candidates;
create policy entitlement_exam_candidates on public.exam_candidates as restrictive
  for all to authenticated
  using (public.is_super_admin() or exists (
    select 1 from public.exams e
    where e.id = exam_candidates.exam_id
      and public.org_has_feature(e.organization_id, 'examinations')
  ))
  with check (public.is_super_admin() or exists (
    select 1 from public.exams e
    where e.id = exam_candidates.exam_id
      and public.org_has_feature(e.organization_id, 'examinations')
  ));

drop policy if exists entitlement_exam_attempts on public.exam_attempts;
create policy entitlement_exam_attempts on public.exam_attempts as restrictive
  for all to authenticated
  using (public.is_super_admin() or exists (
    select 1 from public.exams e
    where e.id = exam_attempts.exam_id
      and public.org_has_feature(e.organization_id, 'examinations')
  ))
  with check (public.is_super_admin() or exists (
    select 1 from public.exams e
    where e.id = exam_attempts.exam_id
      and public.org_has_feature(e.organization_id, 'examinations')
  ));

drop policy if exists entitlement_exam_answers on public.exam_answers;
create policy entitlement_exam_answers on public.exam_answers as restrictive
  for all to authenticated
  using (public.is_super_admin() or exists (
    select 1 from public.exam_attempts a join public.exams e on e.id = a.exam_id
    where a.id = exam_answers.attempt_id
      and public.org_has_feature(e.organization_id, 'examinations')
  ))
  with check (public.is_super_admin() or exists (
    select 1 from public.exam_attempts a join public.exams e on e.id = a.exam_id
    where a.id = exam_answers.attempt_id
      and public.org_has_feature(e.organization_id, 'examinations')
  ));

drop policy if exists entitlement_exam_messages on public.exam_messages;
create policy entitlement_exam_messages on public.exam_messages as restrictive
  for all to authenticated
  using (public.is_super_admin() or public.org_has_feature(organization_id, 'examinations'))
  with check (public.is_super_admin() or public.org_has_feature(organization_id, 'examinations'));

drop policy if exists entitlement_exam_presence on public.exam_presence;
create policy entitlement_exam_presence on public.exam_presence as restrictive
  for all to authenticated
  using (public.is_super_admin() or public.org_has_feature(organization_id, 'examinations'))
  with check (public.is_super_admin() or public.org_has_feature(organization_id, 'examinations'));

drop policy if exists entitlement_competitions on public.competitions;
create policy entitlement_competitions on public.competitions as restrictive
  for all to anon, authenticated
  using (public.is_super_admin() or public.org_has_feature(organization_id, 'live_competitions'))
  with check (public.is_super_admin() or public.org_has_feature(organization_id, 'live_competitions'));

drop policy if exists entitlement_competition_codes on public.competition_access_codes;
create policy entitlement_competition_codes on public.competition_access_codes as restrictive
  for all to authenticated
  using (public.is_super_admin() or exists (
    select 1 from public.competitions c
    where c.id = competition_access_codes.competition_id
      and public.org_has_feature(c.organization_id, 'live_competitions')
  ))
  with check (public.is_super_admin() or exists (
    select 1 from public.competitions c
    where c.id = competition_access_codes.competition_id
      and public.org_has_feature(c.organization_id, 'live_competitions')
  ));

drop policy if exists entitlement_competition_registrations on public.competition_registrations;
create policy entitlement_competition_registrations on public.competition_registrations as restrictive
  for all to authenticated
  using (public.is_super_admin() or exists (
    select 1 from public.competitions c
    where c.id = competition_registrations.competition_id
      and public.org_has_feature(c.organization_id, 'live_competitions')
  ))
  with check (public.is_super_admin() or exists (
    select 1 from public.competitions c
    where c.id = competition_registrations.competition_id
      and public.org_has_feature(c.organization_id, 'live_competitions')
  ));

drop policy if exists entitlement_quiz_sessions on public.quiz_sessions;
create policy entitlement_quiz_sessions on public.quiz_sessions as restrictive
  for all to authenticated
  using (public.is_super_admin() or public.org_has_feature(organization_id, 'live_competitions'))
  with check (public.is_super_admin() or public.org_has_feature(organization_id, 'live_competitions'));

drop policy if exists entitlement_session_participants on public.session_participants;
create policy entitlement_session_participants on public.session_participants as restrictive
  for all to authenticated
  using (public.is_super_admin() or exists (
    select 1 from public.quiz_sessions s
    where s.id = session_participants.session_id
      and public.org_has_feature(s.organization_id, 'live_competitions')
  ))
  with check (public.is_super_admin() or exists (
    select 1 from public.quiz_sessions s
    where s.id = session_participants.session_id
      and public.org_has_feature(s.organization_id, 'live_competitions')
  ));

drop policy if exists entitlement_participant_answers on public.participant_answers;
create policy entitlement_participant_answers on public.participant_answers as restrictive
  for all to authenticated
  using (public.is_super_admin() or exists (
    select 1 from public.quiz_sessions s
    where s.id = participant_answers.session_id
      and public.org_has_feature(s.organization_id, 'live_competitions')
  ))
  with check (public.is_super_admin() or exists (
    select 1 from public.quiz_sessions s
    where s.id = participant_answers.session_id
      and public.org_has_feature(s.organization_id, 'live_competitions')
  ));

drop policy if exists entitlement_proctoring_incidents on public.proctoring_incidents;
create policy entitlement_proctoring_incidents on public.proctoring_incidents as restrictive
  for all to authenticated
  using (public.is_super_admin() or public.org_has_feature(organization_id, 'proctoring'))
  with check (public.is_super_admin() or public.org_has_feature(organization_id, 'proctoring'));

drop policy if exists entitlement_proctoring_rooms on public.proctoring_rooms;
create policy entitlement_proctoring_rooms on public.proctoring_rooms as restrictive
  for all to authenticated
  using (public.is_super_admin() or exists (
    select 1 from public.exams e
    where e.id = proctoring_rooms.exam_id
      and public.org_has_feature(e.organization_id, 'proctoring')
  ))
  with check (public.is_super_admin() or exists (
    select 1 from public.exams e
    where e.id = proctoring_rooms.exam_id
      and public.org_has_feature(e.organization_id, 'proctoring')
  ));

drop policy if exists entitlement_proctoring_recordings on public.proctoring_recordings;
create policy entitlement_proctoring_recordings on public.proctoring_recordings as restrictive
  for all to authenticated
  using (public.is_super_admin() or public.org_has_feature(organization_id, 'proctoring'))
  with check (public.is_super_admin() or public.org_has_feature(organization_id, 'proctoring'));

drop policy if exists entitlement_proctoring_room_events on public.proctoring_room_events;
create policy entitlement_proctoring_room_events on public.proctoring_room_events as restrictive
  for all to authenticated
  using (public.is_super_admin() or public.org_has_feature(organization_id, 'proctoring'))
  with check (public.is_super_admin() or public.org_has_feature(organization_id, 'proctoring'));

-- Existing Supabase objects already carry canonical organization_id in the
-- first path segment for the two tenant storage buckets.
create or replace function public.enforce_org_storage_quota()
returns trigger
language plpgsql security definer set search_path = public, storage as $$
declare
  v_org uuid;
  v_limit integer;
  v_used bigint;
  v_new_size bigint;
begin
  if new.bucket_id not in ('question-media', 'student-imports') then return new; end if;
  begin
    v_org := nullif(split_part(new.name, '/', 1), '')::uuid;
  exception when invalid_text_representation then
    raise exception 'Tenant storage path must begin with a valid organization ID.';
  end;

  if v_org is null then
    raise exception 'Tenant storage path must begin with a valid organization ID.';
  end if;

  perform 1 from public.organizations where id = v_org for update;
  if not found then raise exception 'Storage organization does not exist.'; end if;
  if not public.org_has_storage(v_org) then
    raise exception 'Storage is unavailable for this workspace or its plan does not include storage.'
      using detail = 'FEATURE_DISABLED:storage';
  end if;

  v_limit := public.org_limit(v_org, 'storage_mb');
  if v_limit < 0 then return new; end if;

  if coalesce(new.metadata ->> 'size', '') !~ '^\d+$' then
    raise exception 'Uploaded object size is missing or invalid.';
  end if;
  v_new_size := (new.metadata ->> 'size')::bigint;

  select coalesce(sum(case when coalesce(o.metadata ->> 'size', '') ~ '^\d+$'
                           then (o.metadata ->> 'size')::bigint else 0 end), 0)
    into v_used
    from storage.objects o
   where o.bucket_id in ('question-media', 'student-imports')
     and split_part(o.name, '/', 1) = v_org::text
     and o.id <> new.id;

  if v_used + v_new_size > v_limit::bigint * 1048576 then
    raise exception 'This workspace has reached its plan storage limit (% MB). Upgrade the plan to upload more.', v_limit
      using detail = 'PLAN_LIMIT:storage_mb:' || v_limit,
            hint = 'Remove unused files or ask an owner to upgrade the plan.';
  end if;
  return new;
end $$;

drop trigger if exists plan_quota_tenant_storage on storage.objects;
create trigger plan_quota_tenant_storage
  before insert or update on storage.objects
  for each row execute function public.enforce_org_storage_quota();

drop policy if exists entitlement_tenant_storage_insert on storage.objects;
create policy entitlement_tenant_storage_insert on storage.objects as restrictive
  for insert to authenticated
  with check (
    bucket_id not in ('question-media', 'student-imports')
    or public.org_has_storage(nullif(split_part(name, '/', 1), '')::uuid)
  );

drop policy if exists entitlement_tenant_storage_update on storage.objects;
create policy entitlement_tenant_storage_update on storage.objects as restrictive
  for update to authenticated
  using (
    bucket_id not in ('question-media', 'student-imports')
    or public.org_has_storage(nullif(split_part(name, '/', 1), '')::uuid)
  )
  with check (
    bucket_id not in ('question-media', 'student-imports')
    or public.org_has_storage(nullif(split_part(name, '/', 1), '')::uuid)
  );

-- Live admission uses service-role writes by design, so enforce both the plan
-- participant quota and the session-configured maximum atomically in the DB.
create or replace function public.admit_live_participant(
  p_session_id uuid,
  p_display_name text,
  p_participant_ref text default null,
  p_user_id uuid default null,
  p_qualification_token_hash text default null,
  p_avatar_key text default null,
  p_status text default 'admitted',
  p_actor_user_id uuid default null
)
returns setof public.session_participants
language plpgsql security definer set search_path = public as $$
declare
  v_session public.quiz_sessions%rowtype;
  v_org_limit integer;
  v_session_limit integer;
  v_limit integer;
  v_count integer;
  v_owner_bypass boolean := false;
begin
  if p_status not in ('pending', 'admitted') then
    raise exception 'Invalid participant status.';
  end if;

  if p_actor_user_id is not null then
    select exists (
      select 1 from public.profiles
       where id = p_actor_user_id and platform_role = 'super_admin' and status = 'active'
    ) into v_owner_bypass;
  end if;

  select * into v_session
    from public.quiz_sessions
   where id = p_session_id
   for update;
  if not found then raise exception 'Live session not found.'; end if;
  if v_session.status = 'ended' or v_session.admission_open is false then
    raise exception 'Admission is closed for this live session.';
  end if;

  if not v_owner_bypass and not public.org_has_feature(v_session.organization_id, 'live_competitions') then
    raise exception 'Live features are not included in this workspace plan or are disabled.'
      using detail = 'FEATURE_DISABLED:live_competitions';
  end if;

  v_org_limit := case when v_owner_bypass then -1 else public.org_limit(v_session.organization_id, 'max_participants_per_session') end;
  begin
    v_session_limit := coalesce(nullif(v_session.settings ->> 'max_participants', '')::integer, 200);
  exception when invalid_text_representation then
    v_session_limit := 200;
  end;
  if v_session_limit < 1 then v_session_limit := 200; end if;
  v_limit := case
    when v_org_limit < 0 then v_session_limit
    else least(v_org_limit, v_session_limit)
  end;

  select count(*)::integer into v_count
    from public.session_participants
   where session_id = p_session_id and status not in ('rejected', 'blocked');
  if v_count >= v_limit then
    if v_org_limit >= 0 and v_count >= v_org_limit then
      raise exception 'This workspace has reached its plan limit for live participants per session (%). Upgrade the plan to admit more.', v_org_limit
        using detail = 'PLAN_LIMIT:max_participants_per_session:' || v_org_limit;
    end if;
    raise exception 'This live session is full.' using detail = 'SESSION_FULL';
  end if;

  return query
    insert into public.session_participants (
      session_id, display_name, participant_ref, user_id,
      qualification_token_hash, avatar_key, status
    ) values (
      p_session_id, left(trim(p_display_name), 160), nullif(trim(p_participant_ref), ''),
      p_user_id, p_qualification_token_hash, p_avatar_key, p_status
    ) returning *;
end $$;

revoke all on function public.admit_live_participant(uuid, text, text, uuid, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.admit_live_participant(uuid, text, text, uuid, text, text, text, uuid) to service_role;
