-- =============================================================================
-- Migration: RBAC UI integration, Org-Scoped Role Management, and
--            Oak School Founder Read-Only Operational Dashboard Access
-- =============================================================================
-- Forward-only migration building on top of 20261125120000..20261125125000.
-- Preserves all existing production data, subscriptions, and Founder write blocks
-- (access_founder_no_insert/update/delete + storage restrictive policies +
-- restrictive read blocks on sensitive credential/admin/billing tables).

-- -----------------------------------------------------------------------------
-- 1. Grant org-scoped role viewing & assignment permissions to org_owner/org_admin
--    (Global RBAC creation/editing/deletion and permissions.manage remain
--     exclusively Super Admin with scope = 'system'.)
-- -----------------------------------------------------------------------------
update public.access_permissions
set scope = 'organization'
where key in ('roles.view', 'roles.assign');

insert into public.access_role_permissions (role_id, permission_id, granted)
select r.id, p.id, true
from public.access_roles r
join public.access_permissions p on p.key in ('roles.view', 'roles.assign')
where r.slug in ('org_owner', 'org_admin')
on conflict (role_id, permission_id) do update set granted = true;

-- -----------------------------------------------------------------------------
-- 2. Update Founder read-only ceiling to authorize students.view and
--    proctoring.view (strictly read-only), while continuing to block all
--    mutations and all administrative/security/user/role/billing domains.
-- -----------------------------------------------------------------------------
create or replace function public.access_founder_permission_allowed(p_permission_key text)
returns boolean
language sql
immutable
as $$
  select p_permission_key is not null
    and p_permission_key ~ '\.(view|analytics|monitor)$'
    and p_permission_key !~ '^(users|roles|permissions|system|security|billing)\.';
$$;

create or replace function public.access_guard_founder_permissions()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_slug text;
  v_key text;
begin
  if tg_table_name = 'access_role_permissions' and new.granted then
    select slug into v_slug from public.access_roles where id = new.role_id;
    select key into v_key from public.access_permissions where id = new.permission_id;
    if v_slug = 'school_founder' and not public.access_founder_permission_allowed(v_key) then
      raise exception 'School Founder is strictly read-only operational supervision; cannot grant %', v_key;
    end if;
  elsif tg_table_name = 'access_permission_overrides' and new.granted then
    select key into v_key from public.access_permissions where id = new.permission_id;
    if (
      exists (select 1 from public.organization_members where user_id = new.user_id and role = 'school_founder')
      or exists (
        select 1
        from public.access_user_roles ur
        join public.access_roles r on r.id = ur.role_id
        where ur.user_id = new.user_id
          and r.slug = 'school_founder'
          and ur.status = 'active'
      )
    ) and not public.access_founder_permission_allowed(v_key) then
      raise exception 'Cannot grant non-read-only permission % to School Founder', v_key;
    end if;
  end if;
  return new;
end;
$$;

-- Internal evaluator (not callable directly by clients); called by
-- access_has_permission and access_org_inspect_permissions after caller auth.
create or replace function public._access_eval_permission(
  p_user_id uuid, p_organization_id uuid, p_permission_key text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
  v_permission public.access_permissions;
  v_override boolean;
begin
  if p_user_id is null or p_permission_key is null then return false; end if;
  if not exists(select 1 from public.profiles where id = p_user_id and status = 'active') then return false; end if;
  select * into v_permission from public.access_permissions where key = p_permission_key;
  if not found or not v_permission.enabled then return false; end if;
  if exists(select 1 from public.profiles where id = p_user_id and platform_role = 'super_admin' and status = 'active') then return true; end if;
  if v_permission.scope <> 'organization' then return false; end if;

  -- Founder is a ceiling as well as a role: extra roles/overrides cannot turn
  -- a supervision-only account into an academic operator or administrator.
  if (
    exists(select 1 from public.organization_members where user_id = p_user_id and role = 'school_founder')
    or exists(
      select 1
      from public.access_user_roles ur
      join public.access_roles r on r.id = ur.role_id
      where ur.user_id = p_user_id
        and ur.status = 'active'
        and r.slug = 'school_founder'
        and (ur.expires_at is null or ur.expires_at > now())
    )
  ) and not public.access_founder_permission_allowed(p_permission_key) then
    return false;
  end if;

  if not exists(select 1 from public.organizations where id = p_organization_id and status = 'active') then return false; end if;
  if not exists(select 1 from public.organization_members where user_id = p_user_id and organization_id = p_organization_id and status = 'active') then return false; end if;

  select granted into v_override
  from public.access_permission_overrides
  where user_id = p_user_id
    and organization_id = p_organization_id
    and permission_id = v_permission.id;
  if v_override = false then return false; end if;

  if exists (
    select 1
    from public.access_subject_roles(p_user_id, p_organization_id) ur
    join public.access_roles r on r.id = ur.role_id
    join public.access_role_permissions rp on rp.role_id = r.id
    where ur.user_id = p_user_id
      and ur.organization_id = p_organization_id
      and ur.status = 'active'
      and (ur.expires_at is null or ur.expires_at > now())
      and r.is_active
      and (r.organization_id is null or r.organization_id = p_organization_id)
      and rp.permission_id = v_permission.id
      and not rp.granted
  ) then return false; end if;

  return coalesce(v_override, false) or exists (
    select 1
    from public.access_subject_roles(p_user_id, p_organization_id) ur
    join public.access_roles r on r.id = ur.role_id
    join public.access_role_permissions rp on rp.role_id = r.id
    where ur.user_id = p_user_id
      and ur.organization_id = p_organization_id
      and ur.status = 'active'
      and (ur.expires_at is null or ur.expires_at > now())
      and r.is_active
      and (r.organization_id is null or r.organization_id = p_organization_id)
      and rp.permission_id = v_permission.id
      and rp.granted
  );
end;
$$;

revoke all on function public._access_eval_permission(uuid, uuid, text) from public, anon, authenticated;

-- Preserve exact signature and semantics from 20261125123000, updating only the
-- Founder read-only ceiling to permit read-only students.view & proctoring.view.
create or replace function public.access_has_permission(
  p_user_id uuid, p_organization_id uuid, p_permission_key text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
begin
  if auth.uid() is distinct from p_user_id and not public.is_super_admin() then return false; end if;
  return public._access_eval_permission(p_user_id, p_organization_id, p_permission_key);
end;
$$;

-- Preserve exact parameter names & behavior of access_save_role from 20261125120000.
create or replace function public.access_save_role(
  p_slug text, p_name text, p_description text, p_organization_id uuid,
  p_active boolean, p_permission_keys text[], p_create boolean
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r public.access_roles;
  v_role_id uuid;
begin
  if not public.is_super_admin() then
    raise exception 'Active Super Admin required' using errcode = '42501';
  end if;
  if p_slug !~ '^[a-z][a-z0-9_-]{1,79}$' then
    raise exception 'Invalid role identifier';
  end if;
  if p_permission_keys is not null and exists (
    select 1 from unnest(p_permission_keys) k
    where not exists (select 1 from public.access_permissions p where p.key = k)
  ) then
    raise exception 'Unknown permission identifier';
  end if;

  if p_create then
    if length(trim(p_name)) not between 2 and 120 then
      raise exception 'Role name must have 2 to 120 characters';
    end if;
    insert into public.access_roles (name, slug, description, organization_id)
    values (trim(p_name), p_slug, p_description, p_organization_id)
    returning id into v_role_id;
  else
    select * into strict r from public.access_roles where slug = p_slug for update;
    v_role_id := r.id;
    if r.is_system and r.slug <> 'school_founder' then
      raise exception 'Protected system role';
    end if;
    if not r.is_system then
      update public.access_roles
      set name = coalesce(nullif(trim(p_name), ''), name),
          description = p_description,
          is_active = coalesce(p_active, is_active),
          updated_at = now()
      where id = v_role_id;
    end if;
  end if;

  if p_slug = 'school_founder' and p_permission_keys is not null and exists (
    select 1 from unnest(p_permission_keys) k
    where not public.access_founder_permission_allowed(k)
  ) then
    raise exception 'Founder permissions must remain read-only operational supervision';
  end if;

  if p_permission_keys is not null then
    delete from public.access_role_permissions where access_role_permissions.role_id = v_role_id;
    insert into public.access_role_permissions (role_id, permission_id, granted)
    select v_role_id, id, true from public.access_permissions where key = any(p_permission_keys);
  end if;

  return v_role_id;
end;
$$;

-- Grant read-only students.view and proctoring.view to school_founder and remove
-- billing.view so role permissions match the enforced Founder read-only ceiling.
delete from public.access_role_permissions rp
using public.access_roles r, public.access_permissions p
where rp.role_id = r.id
  and rp.permission_id = p.id
  and r.slug = 'school_founder'
  and p.key = 'billing.view';

insert into public.access_role_permissions (role_id, permission_id, granted)
select r.id, p.id, true
from public.access_roles r
join public.access_permissions p on p.key in ('students.view', 'proctoring.view')
where r.slug = 'school_founder'
on conflict (role_id, permission_id) do update set granted = true;

-- -----------------------------------------------------------------------------
-- 3. Founder read-only operational RLS policies
--    - Keeps access_founder_no_insert / _update / _delete on EVERY table.
--    - Keeps storage.objects restrictive policies intact.
--    - Keeps access_founder_private_reads on ALL sensitive tables:
--        competition_access_codes, exam_lockdown_challenges, invitations,
--        organization_admin_setup, payment_requests, audit_logs, import_batches,
--        proctoring_recordings, proctoring_retention_policies,
--        proctoring_retention_runs, grading_assignments, migration_mappings,
--        migration_runs, rbac_roles, rbac_role_permissions,
--        rbac_user_overrides, support_tickets.
--    - Drops access_founder_private_reads ONLY on authorized operational read
--      tables and adds explicit org-scoped, RBAC-checked SELECT policies.
-- -----------------------------------------------------------------------------
create or replace function public.founder_can_read(p_org uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_org is not null
    and public.access_is_founder()
    and public.access_has_permission(auth.uid(), p_org, p_permission);
$$;

revoke all on function public.founder_can_read(uuid, text) from public, anon;
grant execute on function public.founder_can_read(uuid, text) to authenticated;

do $$
declare
  v_tbl text;
  v_read_allowed_tables text[] := array[
    -- Academic structure & classes
    'academic_years', 'education_levels', 'departments', 'subjects',
    'curriculum_programmes', 'classes', 'class_curricula', 'class_subjects',
    'teacher_subjects', 'grading_systems',
    -- Students & enrollments
    'students', 'student_enrollments',
    -- Question bank, formulas, quizzes & paper builder
    'questions', 'question_options', 'question_categories', 'question_hints',
    'question_pools', 'question_pool_items', 'question_usage',
    'formula_library', 'quizzes', 'quiz_questions', 'exam_paper_templates',
    -- Examinations, candidates, marking, rubrics, MYP & results
    'exams', 'exam_candidates', 'exam_attempts', 'exam_answers',
    'exam_hint_usage', 'exam_result_events', 'exam_retake_requests',
    'exam_pause_events', 'exam_presence', 'exam_connection_events',
    'exam_messages', 'grade_change_log', 'grading_rubrics',
    'grading_rubric_criteria', 'exam_rubric_links', 'answer_rubric_scores',
    'grading_moderation', 'ai_marking_proposals',
    'myp_criteria', 'myp_framework_config', 'myp_grade_boundaries',
    'myp_level_boundaries', 'myp_result_history',
    -- Competitions & live sessions (NOTE: competition_access_codes stays BLOCKED!)
    'competitions', 'competition_events', 'competition_event_phases',
    'competition_phase_classes', 'competition_registrations',
    'quiz_sessions', 'session_participants', 'participant_answers',
    'live_ranking_snapshots', 'live_result_events',
    'qualification_records', 'qualification_overrides',
    -- Institutional proctoring summary (NOTE: proctoring_recordings stays BLOCKED!)
    'proctoring_rooms', 'proctoring_room_events',
    'proctoring_incidents', 'proctoring_incident_reviews',
    -- Own notifications only (enforced by notif_own: user_id = auth.uid())
    'notifications'
  ];
begin
  foreach v_tbl in array v_read_allowed_tables loop
    if to_regclass(format('public.%I', v_tbl)) is not null then
      execute format('drop policy if exists access_founder_private_reads on public.%I', v_tbl);
    end if;
  end loop;
end $$;

-- Explicit org-scoped, RBAC-permission-checked SELECT policies for tables whose
-- existing SELECT policies restricted reads to staff_org_ids() / staff roles.
do $$
declare
  v_rec record;
begin
  for v_rec in
    select * from (values
      -- Academic structure & classes
      ('academic_years',             'public.founder_can_read(organization_id, ''classes.view'')'),
      ('education_levels',           'public.founder_can_read(organization_id, ''classes.view'')'),
      ('departments',                'public.founder_can_read(organization_id, ''classes.view'')'),
      ('subjects',                   'public.founder_can_read(organization_id, ''classes.view'')'),
      ('curriculum_programmes',      'public.founder_can_read(organization_id, ''classes.view'')'),
      ('classes',                    'public.founder_can_read(organization_id, ''classes.view'')'),
      ('grading_systems',            'public.founder_can_read(organization_id, ''grading.view'')'),
      -- Students
      ('students',                   'public.founder_can_read(organization_id, ''students.view'')'),
      ('student_enrollments',        'public.founder_can_read(organization_id, ''students.view'')'),
      -- Question bank, quizzes & Paper Builder
      ('questions',                  'public.founder_can_read(organization_id, ''questions.view'')'),
      ('question_categories',        'public.founder_can_read(organization_id, ''questions.view'')'),
      ('question_hints',             'public.founder_can_read(organization_id, ''questions.view'')'),
      ('question_pools',             'public.founder_can_read(organization_id, ''questions.view'')'),
      ('question_usage',             'public.founder_can_read(organization_id, ''questions.view'')'),
      ('formula_library',            'public.founder_can_read(organization_id, ''exams.view'')'),
      ('quizzes',                    'public.founder_can_read(organization_id, ''quizzes.view'')'),
      ('exam_paper_templates',       'public.founder_can_read(organization_id, ''paper_builder.view'')'),
      -- Examinations, marking, MYP & results
      ('exams',                      'public.founder_can_read(organization_id, ''exams.view'')'),
      ('exam_hint_usage',            'public.founder_can_read(organization_id, ''exams.view'')'),
      ('exam_result_events',         'public.founder_can_read(organization_id, ''results.view'')'),
      ('exam_retake_requests',       'public.founder_can_read(organization_id, ''exams.view'')'),
      ('exam_pause_events',          'public.founder_can_read(organization_id, ''exams.monitor'')'),
      ('exam_presence',              'public.founder_can_read(organization_id, ''exams.monitor'')'),
      ('exam_connection_events',     'public.founder_can_read(organization_id, ''exams.monitor'')'),
      ('exam_messages',              'public.founder_can_read(organization_id, ''exams.monitor'')'),
      ('grade_change_log',           'public.founder_can_read(organization_id, ''results.view'')'),
      ('grading_rubrics',            'public.founder_can_read(organization_id, ''grading.view'')'),
      ('grading_rubric_criteria',    'public.founder_can_read(organization_id, ''grading.view'')'),
      ('exam_rubric_links',          'public.founder_can_read(organization_id, ''grading.view'')'),
      ('answer_rubric_scores',       'public.founder_can_read(organization_id, ''grading.view'')'),
      ('grading_moderation',         'public.founder_can_read(organization_id, ''grading.view'')'),
      ('ai_marking_proposals',       'public.founder_can_read(organization_id, ''grading.view'')'),
      ('myp_criteria',               'public.founder_can_read(organization_id, ''results.view'')'),
      ('myp_framework_config',       'public.founder_can_read(organization_id, ''results.view'')'),
      ('myp_grade_boundaries',       'public.founder_can_read(organization_id, ''results.view'')'),
      ('myp_level_boundaries',       'public.founder_can_read(organization_id, ''results.view'')'),
      ('myp_result_history',         'public.founder_can_read(organization_id, ''results.view'')'),
      -- Competitions & live sessions
      ('competitions',               'public.founder_can_read(organization_id, ''competitions.view'')'),
      ('competition_events',         'public.founder_can_read(organization_id, ''competitions.view'')'),
      ('competition_registrations',  'public.founder_can_read(organization_id, ''competitions.view'')'),
      ('quiz_sessions',              'public.founder_can_read(organization_id, ''competitions.view'')'),
      ('live_ranking_snapshots',     'public.founder_can_read(organization_id, ''competitions.view'')'),
      ('live_result_events',         'public.founder_can_read(organization_id, ''competitions.view'')'),
      ('qualification_records',      'public.founder_can_read(organization_id, ''competitions.view'')'),
      ('qualification_overrides',    'public.founder_can_read(organization_id, ''competitions.view'')'),
      -- Proctoring summary (recordings remain strictly blocked)
      ('proctoring_rooms',           'public.founder_can_read(organization_id, ''proctoring.view'')'),
      ('proctoring_incidents',       'public.founder_can_read(organization_id, ''proctoring.view'')'),
      ('proctoring_incident_reviews','public.founder_can_read(organization_id, ''proctoring.view'')'),
      ('proctoring_room_events',     'public.founder_can_read(organization_id, ''proctoring.view'')')
    ) as t(tbl, expr)
  loop
    if to_regclass(format('public.%I', v_rec.tbl)) is not null then
      execute format('drop policy if exists access_founder_read on public.%I', v_rec.tbl);
      execute format(
        'create policy access_founder_read on public.%I for select to authenticated using (%s)',
        v_rec.tbl, v_rec.expr
      );
    end if;
  end loop;

  -- Child tables scoped through their parent FK
  if to_regclass('public.exam_candidates') is not null and to_regclass('public.exams') is not null then
    drop policy if exists access_founder_read on public.exam_candidates;
    create policy access_founder_read on public.exam_candidates
      for select to authenticated
      using (exists (
        select 1 from public.exams e
        where e.id = exam_candidates.exam_id
          and public.founder_can_read(e.organization_id, 'candidate_links.view')
      ));
  end if;

  if to_regclass('public.exam_attempts') is not null and to_regclass('public.exams') is not null then
    drop policy if exists access_founder_read on public.exam_attempts;
    create policy access_founder_read on public.exam_attempts
      for select to authenticated
      using (exists (
        select 1 from public.exams e
        where e.id = exam_attempts.exam_id
          and public.founder_can_read(e.organization_id, 'results.view')
      ));
  end if;

  if to_regclass('public.exam_answers') is not null
     and to_regclass('public.exam_attempts') is not null
     and to_regclass('public.exams') is not null then
    drop policy if exists access_founder_read on public.exam_answers;
    create policy access_founder_read on public.exam_answers
      for select to authenticated
      using (exists (
        select 1
        from public.exam_attempts a
        join public.exams e on e.id = a.exam_id
        where a.id = exam_answers.attempt_id
          and public.founder_can_read(e.organization_id, 'grading.view')
      ));
  end if;

  if to_regclass('public.question_options') is not null and to_regclass('public.questions') is not null then
    drop policy if exists access_founder_read on public.question_options;
    create policy access_founder_read on public.question_options
      for select to authenticated
      using (exists (
        select 1 from public.questions q
        where q.id = question_options.question_id
          and public.founder_can_read(q.organization_id, 'questions.view')
      ));
  end if;

  if to_regclass('public.question_pool_items') is not null and to_regclass('public.question_pools') is not null then
    drop policy if exists access_founder_read on public.question_pool_items;
    create policy access_founder_read on public.question_pool_items
      for select to authenticated
      using (exists (
        select 1 from public.question_pools p
        where p.id = question_pool_items.pool_id
          and public.founder_can_read(p.organization_id, 'questions.view')
      ));
  end if;

  if to_regclass('public.quiz_questions') is not null and to_regclass('public.quizzes') is not null then
    drop policy if exists access_founder_read on public.quiz_questions;
    create policy access_founder_read on public.quiz_questions
      for select to authenticated
      using (exists (
        select 1 from public.quizzes q
        where q.id = quiz_questions.quiz_id
          and public.founder_can_read(q.organization_id, 'quizzes.view')
      ));
  end if;

  if to_regclass('public.session_participants') is not null and to_regclass('public.quiz_sessions') is not null then
    drop policy if exists access_founder_read on public.session_participants;
    create policy access_founder_read on public.session_participants
      for select to authenticated
      using (exists (
        select 1 from public.quiz_sessions s
        where s.id = session_participants.session_id
          and public.founder_can_read(s.organization_id, 'competitions.view')
      ));
  end if;

  if to_regclass('public.participant_answers') is not null and to_regclass('public.quiz_sessions') is not null then
    drop policy if exists access_founder_read on public.participant_answers;
    create policy access_founder_read on public.participant_answers
      for select to authenticated
      using (exists (
        select 1 from public.quiz_sessions s
        where s.id = participant_answers.session_id
          and public.founder_can_read(s.organization_id, 'competitions.view')
      ));
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 4. Redact sensitive access credentials inside public.workspace_overview(p_org)
--    for users who do not have credential-editing permissions (incl. Founder),
--    preserving the exact JSONB shape expected by /dashboard.
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.questions') is not null
     and to_regclass('public.quizzes') is not null
     and to_regclass('public.exams') is not null
     and to_regclass('public.quiz_sessions') is not null
     and to_regclass('public.organizations') is not null then
    execute $fn$
      create or replace function public.workspace_overview(p_org uuid)
      returns jsonb
      language plpgsql
      stable
      security definer
      set search_path = public, pg_temp
      as $body$
      declare
        v_uid uuid := auth.uid();
        v_can_view_exam_codes boolean;
        v_can_view_session_codes boolean;
      begin
        if v_uid is null then
          raise exception 'not authenticated' using errcode = '28000';
        end if;

        if not (public.is_org_member(p_org) or public.is_super_admin()) then
          raise exception 'not a member of this workspace' using errcode = '42501';
        end if;

        v_can_view_exam_codes := public.is_super_admin()
          or public.access_has_permission(v_uid, p_org, 'candidate_links.edit');
        v_can_view_session_codes := public.is_super_admin()
          or public.access_has_permission(v_uid, p_org, 'competitions.edit');

        return jsonb_build_object(
          'counts', jsonb_build_object(
            'quizzes',   (select count(*) from public.quizzes q where q.organization_id = p_org),
            'questions', (select count(*) from public.questions q where q.organization_id = p_org),
            'exams',     (select count(*) from public.exams e where e.organization_id = p_org),
            'members',   (select count(*) from public.organization_members m where m.organization_id = p_org),
            'sessions',  (select count(*) from public.quiz_sessions s
                          where s.organization_id = p_org and s.status in ('lobby', 'live'))
          ),
          'recentSessions', (
            select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb)
            from (
              select s.id,
                     s.title,
                     case when v_can_view_session_codes then s.join_code else null end as join_code,
                     s.created_at,
                     s.status,
                     (select to_jsonb(z) from (select qz.title) z) as quizzes
              from public.quiz_sessions s
              left join public.quizzes qz on qz.id = s.quiz_id
              where s.organization_id = p_org
              order by s.created_at desc
              limit 5
            ) x
          ),
          'recentExams', (
            select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb)
            from (
              select e.id,
                     e.title,
                     e.duration_minutes,
                     case when v_can_view_exam_codes then e.access_code else null end as access_code,
                     e.status,
                     e.created_at
              from public.exams e
              where e.organization_id = p_org
              order by e.created_at desc
              limit 5
            ) x
          ),
          'platform', (
            select jsonb_build_object(
              'slug', o.slug,
              'name', o.name,
              'status', o.status,
              'portal_enabled', o.portal_enabled,
              'custom_domain', o.custom_domain,
              'platform_domain_status', o.platform_domain_status
            )
            from public.organizations o
            where o.id = p_org
          )
        );
      end;
      $body$;
    $fn$;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 5. Organization-scoped RBAC read visibility + strictly bounded org-admin
--    assignment/revocation/audit/inspection RPCs (reuses access_* tables).
--    Security guarantees enforced at DB level:
--      - Caller must have roles.assign in p_organization_id (or be Super Admin)
--      - Cannot assign super_admin or school_founder (Super Admin only)
--      - Cannot access or mutate another organization
--      - Cannot grant a role containing ANY permission the caller lacks in p_org
--      - Cannot demote/alter super_admin, school_founder, or owner (unless owner/SA)
--      - Cannot modify global RBAC definitions (access_roles / access_permissions)
-- -----------------------------------------------------------------------------
drop policy if exists access_user_roles_org_admin_read on public.access_user_roles;
create policy access_user_roles_org_admin_read on public.access_user_roles
  for select to authenticated
  using (
    organization_id is not null
    and public.access_has_permission(auth.uid(), organization_id, 'roles.view')
  );

create or replace function public.access_org_assign_role(
  p_organization_id uuid,
  p_user_id uuid,
  p_role_slug text,
  p_expires_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller_id uuid := auth.uid();
  v_is_sa boolean := public.is_super_admin();
  v_caller_member_role text;
  v_target_platform_role text;
  v_target_member_role text;
  v_role record;
  v_missing_perm text;
  v_assignment_id uuid;
  v_legacy_role text;
begin
  if v_caller_id is null then
    raise exception 'Authentication required';
  end if;
  if p_organization_id is null or p_user_id is null or nullif(trim(p_role_slug), '') is null then
    raise exception 'Organization, user, and role are required';
  end if;

  if not v_is_sa and not public.access_has_permission(v_caller_id, p_organization_id, 'roles.assign') then
    raise exception 'Not authorized to assign roles in this organization' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.organizations where id = p_organization_id and status = 'active'
  ) then
    raise exception 'Organization not found or inactive';
  end if;

  select role into v_caller_member_role
  from public.organization_members
  where organization_id = p_organization_id and user_id = v_caller_id and status = 'active';

  -- Target must already belong to THIS organization (no cross-org user pulls).
  select p.platform_role, m.role
  into v_target_platform_role, v_target_member_role
  from public.organization_members m
  join public.profiles p on p.id = m.user_id
  where m.organization_id = p_organization_id
    and m.user_id = p_user_id
    and m.status = 'active';

  if v_target_member_role is null then
    raise exception 'Target user is not an active member of this organization';
  end if;

  if not v_is_sa then
    if v_target_platform_role = 'super_admin' then
      raise exception 'Cannot modify a platform Super Admin account' using errcode = '42501';
    end if;
    if v_target_member_role = 'school_founder' or exists (
      select 1
      from public.access_user_roles ur
      join public.access_roles r on r.id = ur.role_id
      where ur.user_id = p_user_id
        and ur.organization_id = p_organization_id
        and ur.status = 'active'
        and r.slug = 'school_founder'
    ) then
      raise exception 'School Founder assignments are managed exclusively by Platform Super Admin' using errcode = '42501';
    end if;
    if v_target_member_role = 'owner' and coalesce(v_caller_member_role, '') <> 'owner' then
      raise exception 'Only an organization owner or Super Admin may change an owner role' using errcode = '42501';
    end if;
    if p_user_id = v_caller_id then
      raise exception 'You cannot alter your own organization role assignment' using errcode = '42501';
    end if;
  end if;

  -- Load target role and enforce org-scope & protected-role rules.
  select id, slug, name, organization_id, is_active
  into v_role
  from public.access_roles
  where slug = p_role_slug;

  if v_role.id is null or not v_role.is_active then
    raise exception 'Role not found or inactive: %', p_role_slug;
  end if;

  if v_role.organization_id is not null and v_role.organization_id <> p_organization_id then
    raise exception 'Cannot assign a custom role belonging to another organization' using errcode = '42501';
  end if;

  if not v_is_sa then
    if v_role.slug in ('super_admin', 'school_founder', 'org_owner') then
      raise exception 'Role % can only be assigned by a Platform Super Admin', v_role.slug using errcode = '42501';
    end if;
    if v_role.slug = 'org_admin' and coalesce(v_caller_member_role, '') <> 'owner' then
      raise exception 'Only an organization owner or Super Admin may assign Organization Admin' using errcode = '42501';
    end if;

    -- Anti-escalation: caller MUST hold every permission granted by the target role.
    select p.key into v_missing_perm
    from public.access_role_permissions rp
    join public.access_permissions p on p.id = rp.permission_id
    where rp.role_id = v_role.id
      and rp.granted = true
      and p.enabled = true
      and not public.access_has_permission(v_caller_id, p_organization_id, p.key)
    limit 1;

    if v_missing_perm is not null then
      raise exception 'Cannot assign role % because it grants permission % beyond your authority', v_role.slug, v_missing_perm using errcode = '42501';
    end if;
  end if;

  insert into public.access_user_roles (
    user_id, role_id, organization_id, status, expires_at, assigned_by
  )
  values (
    p_user_id, v_role.id, p_organization_id, 'active', p_expires_at, v_caller_id
  )
  on conflict (user_id, role_id, organization_id) do update
    set status = 'active',
        expires_at = excluded.expires_at,
        assigned_by = excluded.assigned_by,
        assigned_at = now()
  returning id into v_assignment_id;

  -- Keep legacy organization_members.role aligned for standard operational roles.
  select m.legacy_key into v_legacy_role
  from public.access_legacy_role_map m
  where m.role_id = v_role.id
    and m.legacy_key in ('owner', 'admin', 'teacher', 'organizer', 'supervisor', 'corrector', 'student', 'candidate', 'parent')
  order by case m.legacy_key
    when 'owner' then 1 when 'admin' then 2 when 'teacher' then 3
    when 'organizer' then 4 when 'supervisor' then 5 when 'corrector' then 6
    when 'student' then 7 when 'candidate' then 8 else 9 end
  limit 1;

  if v_legacy_role is not null and v_target_member_role <> 'owner' then
    update public.organization_members
    set role = v_legacy_role
    where organization_id = p_organization_id and user_id = p_user_id;
  end if;

  return v_assignment_id;
end;
$$;

revoke all on function public.access_org_assign_role(uuid, uuid, text, timestamptz) from public, anon;
grant execute on function public.access_org_assign_role(uuid, uuid, text, timestamptz) to authenticated;

create or replace function public.access_org_revoke_role(
  p_organization_id uuid,
  p_assignment_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller_id uuid := auth.uid();
  v_is_sa boolean := public.is_super_admin();
  v_caller_member_role text;
  v_rec record;
begin
  if v_caller_id is null then
    raise exception 'Authentication required';
  end if;
  if not v_is_sa and not public.access_has_permission(v_caller_id, p_organization_id, 'roles.assign') then
    raise exception 'Not authorized to revoke roles in this organization' using errcode = '42501';
  end if;

  select ur.id, ur.user_id, ur.organization_id, ur.status, r.slug as role_slug, r.name as role_name,
         p.platform_role as target_platform_role, m.role as target_member_role
  into v_rec
  from public.access_user_roles ur
  join public.access_roles r on r.id = ur.role_id
  join public.profiles p on p.id = ur.user_id
  left join public.organization_members m
    on m.user_id = ur.user_id and m.organization_id = ur.organization_id
  where ur.id = p_assignment_id
    and ur.organization_id = p_organization_id;

  if v_rec.id is null then
    raise exception 'Role assignment not found in this organization';
  end if;

  select role into v_caller_member_role
  from public.organization_members
  where organization_id = p_organization_id and user_id = v_caller_id and status = 'active';

  if not v_is_sa then
    if v_rec.target_platform_role = 'super_admin' then
      raise exception 'Cannot revoke roles from a Platform Super Admin' using errcode = '42501';
    end if;
    if v_rec.role_slug in ('super_admin', 'school_founder', 'org_owner') then
      raise exception 'Protected role % can only be revoked by Platform Super Admin', v_rec.role_slug using errcode = '42501';
    end if;
    if v_rec.role_slug = 'org_admin' and coalesce(v_caller_member_role, '') <> 'owner' then
      raise exception 'Only an organization owner or Super Admin may revoke Organization Admin' using errcode = '42501';
    end if;
    if v_rec.user_id = v_caller_id then
      raise exception 'You cannot revoke your own role assignment' using errcode = '42501';
    end if;
  end if;

  update public.access_user_roles
  set status = 'revoked'
  where id = v_rec.id;

  return true;
end;
$$;

revoke all on function public.access_org_revoke_role(uuid, uuid) from public, anon;
grant execute on function public.access_org_revoke_role(uuid, uuid) to authenticated;

create or replace function public.access_org_get_audit_events(
  p_organization_id uuid,
  p_limit int default 50
)
returns table (
  id uuid,
  actor_id uuid,
  organization_id uuid,
  action text,
  entity text,
  previous_state jsonb,
  new_state jsonb,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if not public.is_super_admin()
     and not public.access_has_permission(auth.uid(), p_organization_id, 'roles.view') then
    raise exception 'Not authorized to inspect access history for this organization' using errcode = '42501';
  end if;

  return query
  select e.id, e.actor_id, e.organization_id, e.action, e.entity, e.previous_state, e.new_state, e.created_at
  from public.access_audit_events e
  where e.organization_id = p_organization_id
  order by e.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
end;
$$;

revoke all on function public.access_org_get_audit_events(uuid, int) from public, anon;
grant execute on function public.access_org_get_audit_events(uuid, int) to authenticated;

create or replace function public.access_org_inspect_permissions(
  p_organization_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if not public.is_super_admin()
     and not public.access_has_permission(auth.uid(), p_organization_id, 'roles.view') then
    raise exception 'Not authorized to inspect permissions in this organization' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.organization_members
    where organization_id = p_organization_id and user_id = p_user_id
  ) then
    raise exception 'User is not a member of this organization';
  end if;

  select jsonb_object_agg(
    p.key,
    public._access_eval_permission(p_user_id, p_organization_id, p.key)
  )
  into v_result
  from public.access_permissions p
  where p.scope = 'organization';

  return coalesce(v_result, '{}'::jsonb);
end;
$$;

revoke all on function public.access_org_inspect_permissions(uuid, uuid) from public, anon;
grant execute on function public.access_org_inspect_permissions(uuid, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 6. Upgrade accept_invitation(p_token, p_user) preserving its exact production
--    returns text ('ok' | 'invalid' | 'expired' | 'limit') contract and plan
--    member-limit check, while atomically creating BOTH the active
--    organization_members row AND the active access_user_roles row for
--    school_founder invitations (with exclusivity + email check + audit logging).
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.invitations') is not null then
    execute $fn$
      create or replace function public.accept_invitation(p_token text, p_user uuid)
      returns text
      language plpgsql
      security definer
      set search_path = public, pg_temp
      as $body$
      declare
        v_inv record;
        v_limit integer;
        v_count integer;
        v_founder_role_id uuid;
        v_platform_role text;
        v_user_email text;
      begin
        select * into v_inv
          from public.invitations
         where token = p_token and status = 'pending'
         for update;
        if not found then
          return 'invalid';
        end if;
        if v_inv.expires_at is not null and v_inv.expires_at < now() then
          return 'expired';
        end if;

        select platform_role, email into v_platform_role, v_user_email
          from public.profiles
         where id = p_user;

        if v_user_email is not null and lower(btrim(v_user_email)) <> lower(btrim(v_inv.email)) then
          raise exception 'Invitation email does not match authenticated user';
        end if;

        perform 1 from public.organizations where id = v_inv.organization_id for update;

        if v_inv.role = 'school_founder' then
          if v_platform_role = 'super_admin' then
            raise exception 'A Super Admin account cannot accept a School Founder invitation';
          end if;

          if exists (
            select 1 from public.organization_members
            where user_id = p_user
              and (organization_id <> v_inv.organization_id or role <> 'school_founder')
          ) then
            raise exception 'School Founder account cannot combine with another role or organization';
          end if;

          select id into v_founder_role_id
          from public.access_roles
          where slug = 'school_founder' and is_active = true;

          if v_founder_role_id is null then
            raise exception 'School Founder role is unavailable';
          end if;

          if to_regprocedure('public.org_limit(uuid,text)') is not null
             and not exists (
               select 1 from public.organization_members
                where organization_id = v_inv.organization_id and user_id = p_user
             ) then
            v_limit := public.org_limit(v_inv.organization_id, 'max_members');
            if v_limit >= 0 then
              select count(*) into v_count
                from public.organization_members
               where organization_id = v_inv.organization_id;
              if v_count >= v_limit then
                return 'limit';
              end if;
            end if;
          end if;

          insert into public.organization_members (organization_id, user_id, role, status)
          values (v_inv.organization_id, p_user, 'school_founder', 'active')
          on conflict (organization_id, user_id) do update
            set role = 'school_founder', status = 'active';

          insert into public.access_user_roles (
            user_id, role_id, organization_id, status, assigned_by
          )
          values (
            p_user, v_founder_role_id, v_inv.organization_id, 'active', v_inv.invited_by
          )
          on conflict (user_id, role_id, organization_id) do update
            set status = 'active', expires_at = null, assigned_at = now();

          update public.invitations set status = 'accepted' where id = v_inv.id;
          return 'ok';
        end if;

        if exists (
          select 1 from public.organization_members
           where organization_id = v_inv.organization_id and user_id = p_user
        ) then
          update public.invitations set status = 'accepted' where id = v_inv.id;
          return 'ok';
        end if;

        if to_regprocedure('public.org_limit(uuid,text)') is not null then
          v_limit := public.org_limit(v_inv.organization_id, 'max_members');
          if v_limit >= 0 then
            select count(*) into v_count
              from public.organization_members
             where organization_id = v_inv.organization_id;
            if v_count >= v_limit then
              return 'limit';
            end if;
          end if;
        end if;

        insert into public.organization_members (organization_id, user_id, role, status)
        values (v_inv.organization_id, p_user, v_inv.role, 'active');
        update public.invitations set status = 'accepted' where id = v_inv.id;
        return 'ok';
      end;
      $body$;
    $fn$;
  end if;
end $$;
