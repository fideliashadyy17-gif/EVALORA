-- =============================================================================
-- Forward hardening for public.access_supervision_overview(uuid):
-- Live exams store nested JSONB config objects in exams.settings (for example,
-- settings->'lockdown' = {"enabled": true, "require_app": true, ...}).
-- Casting nested objects directly via ::boolean raises PostgreSQL 22P02.
-- Introduce a type-safe immutable helper public.access_jsonb_flag(jsonb) and
-- update access_supervision_overview to use it for every settings boolean flag.
-- =============================================================================

create or replace function public.access_jsonb_flag(p_val jsonb)
returns boolean language sql immutable set search_path = public, pg_temp as $$
  select case jsonb_typeof(p_val)
    when 'boolean' then (p_val #>> '{}')::boolean
    when 'object' then
      case
        when jsonb_typeof(p_val->'enabled') = 'boolean' then (p_val->>'enabled')::boolean
        when jsonb_typeof(p_val->'require_app') = 'boolean' then (p_val->>'require_app')::boolean
        else false
      end
    when 'string' then lower(btrim(p_val #>> '{}')) in ('true', 't', '1', 'yes', 'on')
    else false
  end
$$;
revoke all on function public.access_jsonb_flag(jsonb) from public, anon, authenticated;

create or replace function public.access_supervision_overview(p_org uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_out jsonb := jsonb_build_object('organization_id', p_org);
  v_org jsonb;
  v_summary jsonb := '{}'::jsonb;
  v_exams jsonb := '[]'::jsonb;
  v_exam_configs jsonb := '[]'::jsonb;
  v_results jsonb := '{}'::jsonb;
  v_published_results jsonb := '[]'::jsonb;
  v_unpublished_results jsonb := '[]'::jsonb;
  v_awaiting_validation jsonb := '[]'::jsonb;
  v_ongoing_correction jsonb := '[]'::jsonb;
  v_marking jsonb := '{}'::jsonb;
  v_admission jsonb := '{}'::jsonb;
  v_academic jsonb := '{}'::jsonb;
  v_qbank jsonb := '{}'::jsonb;
  v_paper_builder jsonb := '{}'::jsonb;
  v_quizzes jsonb := '{}'::jsonb;
  v_competitions jsonb := '[]'::jsonb;
  v_rankings jsonb := '{}'::jsonb;
  v_proctoring jsonb := '{}'::jsonb;
  v_modules jsonb := '{}'::jsonb;
  v_participation jsonb := '{}'::jsonb;
  v_tmp jsonb;
  v_cnt integer;
begin
  if v_uid is null or not public.access_has_permission(v_uid, p_org, 'dashboard.view') then
    raise exception 'supervision permission required';
  end if;

  -- Organization metadata (sanitized)
  select jsonb_build_object(
    'id', o.id,
    'name', coalesce(to_jsonb(o)->>'name', 'Institution'),
    'slug', to_jsonb(o)->>'slug',
    'status', o.status
  ) into v_org
  from public.organizations o
  where o.id = p_org;
  v_out := v_out || jsonb_build_object('organization', coalesce(v_org, jsonb_build_object('id', p_org)));

  -- Enabled modules & subscription overview (plan modules merged with subscription override)
  if public.access_has_permission(v_uid, p_org, 'dashboard.view')
     or public.access_has_permission(v_uid, p_org, 'organizations.view')
     or public.access_has_permission(v_uid, p_org, 'billing.view') then
    select jsonb_build_object(
      'plan_slug', coalesce(to_jsonb(p)->>'slug', 'free'),
      'plan_name', coalesce(to_jsonb(p)->>'name', 'Free'),
      'subscription_status', coalesce(s.status, 'free'),
      'current_period_end', to_jsonb(s)->>'current_period_end',
      'trial_ends_at', to_jsonb(s)->>'trial_ends_at',
      'plan_modules', coalesce(p.modules, '{}'::jsonb),
      'modules_override', coalesce(s.modules_override, '{}'::jsonb),
      'effective_modules', coalesce(p.modules, '{}'::jsonb) || coalesce(s.modules_override, '{}'::jsonb)
    ) into v_modules
    from public.subscriptions s
    left join public.plans p on p.id = s.plan_id
    where s.organization_id = p_org
      and s.status in ('active', 'trialing')
    order by case s.status when 'active' then 0 else 1 end
    limit 1;
    v_out := v_out || jsonb_build_object('enabled_modules', coalesce(v_modules, jsonb_build_object(
      'plan_slug', 'free',
      'plan_name', 'Free',
      'subscription_status', 'free',
      'effective_modules', '{}'::jsonb
    )));
  end if;

  -- Dashboard summary counters
  if public.access_has_permission(v_uid, p_org, 'dashboard.analytics') then
    select jsonb_build_object(
      'classes', case when public.access_has_permission(v_uid, p_org, 'classes.view') and public.access_module_enabled(p_org, 'classes')
        then (select count(*)::int from public.classes c where c.organization_id = p_org) else null end,
      'questions', case when public.access_has_permission(v_uid, p_org, 'questions.view') and public.access_module_enabled(p_org, 'question_bank')
        then (select count(*)::int from public.questions q where q.organization_id = p_org) else null end,
      'examinations', case when public.access_has_permission(v_uid, p_org, 'exams.view') and public.access_module_enabled(p_org, 'examinations')
        then (select count(*)::int from public.exams e where e.organization_id = p_org and to_jsonb(e)->>'deleted_at' is null) else null end,
      'competitions', case when public.access_has_permission(v_uid, p_org, 'competitions.view') and public.access_module_enabled(p_org, 'competitions')
        then (select count(*)::int from public.competitions cp where cp.organization_id = p_org) else null end,
      'quizzes', null
    ) into v_summary;

    if public.access_has_permission(v_uid, p_org, 'quizzes.view')
       and public.access_module_enabled(p_org, 'quizzes')
       and to_regclass('public.quizzes') is not null then
      execute 'select count(*)::int from public.quizzes where organization_id = $1' into v_cnt using p_org;
      v_summary := jsonb_set(v_summary, '{quizzes}', to_jsonb(coalesce(v_cnt, 0)));
    end if;

    v_out := v_out || jsonb_build_object('summary', v_summary);

    -- Student participation summary (aggregate counts only — zero PII)
    if public.access_module_enabled(p_org, 'examinations') then
      select jsonb_build_object(
        'total_attempts', count(*)::int,
        'in_progress', count(*) filter (where a.status = 'in_progress')::int,
        'submitted', count(*) filter (where a.status = 'submitted')::int,
        'graded', count(*) filter (where coalesce(to_jsonb(a)->>'grading_status', case when a.score is not null then 'graded' else '' end) = 'graded')::int,
        'awaiting_manual_grading', count(*) filter (where coalesce(to_jsonb(a)->>'grading_status', '') = 'awaiting_manual_grading' or coalesce((to_jsonb(a)->>'pending_manual_count')::int, 0) > 0)::int,
        'average_score_pct', round(avg(case when a.max_score > 0 and a.score is not null then (a.score / a.max_score) * 100 end), 1),
        'completion_rate_pct', case when count(*) > 0 then round((count(*) filter (where a.status = 'submitted')::numeric / count(*)::numeric) * 100, 1) else null end
      ) into v_participation
      from public.exam_attempts a
      join public.exams e on e.id = a.exam_id
      where e.organization_id = p_org
        and to_jsonb(e)->>'deleted_at' is null;

      if to_regclass('public.exam_candidates') is not null then
        execute $q$
          select count(*)::int
          from public.exam_candidates c
          join public.exams e on e.id = c.exam_id
          where e.organization_id = $1 and to_jsonb(e)->>'deleted_at' is null
        $q$ into v_cnt using p_org;
        v_participation := v_participation || jsonb_build_object('total_registered_candidates', coalesce(v_cnt, 0));
      end if;

      v_out := v_out || jsonb_build_object('participation_summary', coalesce(v_participation, '{}'::jsonb));
    end if;
  end if;

  -- Classes & academic structures (no student PII)
  if public.access_has_permission(v_uid, p_org, 'classes.view')
     and (public.access_module_enabled(p_org, 'classes') or public.access_module_enabled(p_org, 'academics')) then
    select jsonb_build_object(
      'total_classes', count(*)::int,
      'active_classes', count(*) filter (where coalesce(to_jsonb(c)->>'status', 'active') = 'active')::int,
      'classes', coalesce(jsonb_agg(jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'code', to_jsonb(c)->>'code',
        'status', coalesce(to_jsonb(c)->>'status', 'active'),
        'level_band', to_jsonb(c)->>'level_band',
        'curriculum_track', to_jsonb(c)->>'curriculum_track'
      ) order by c.name), '[]'::jsonb)
    ) into v_academic
    from public.classes c
    where c.organization_id = p_org;

    if to_regclass('public.subjects') is not null then
      execute 'select count(*)::int from public.subjects where organization_id = $1' into v_cnt using p_org;
      v_academic := v_academic || jsonb_build_object('subjects_count', coalesce(v_cnt, 0));
    end if;
    if to_regclass('public.departments') is not null then
      execute 'select count(*)::int from public.departments where organization_id = $1' into v_cnt using p_org;
      v_academic := v_academic || jsonb_build_object('departments_count', coalesce(v_cnt, 0));
    end if;
    if to_regclass('public.academic_years') is not null then
      execute 'select count(*)::int from public.academic_years where organization_id = $1' into v_cnt using p_org;
      v_academic := v_academic || jsonb_build_object('academic_years_count', coalesce(v_cnt, 0));
    end if;
    if to_regclass('public.grading_systems') is not null then
      execute 'select count(*)::int from public.grading_systems where organization_id = $1' into v_cnt using p_org;
      v_academic := v_academic || jsonb_build_object('grading_systems_count', coalesce(v_cnt, 0));
    end if;

    v_out := v_out || jsonb_build_object('academic_structures', coalesce(v_academic, '{}'::jsonb));
  end if;

  -- Question bank overview (aggregate metadata only — zero answer keys)
  if public.access_has_permission(v_uid, p_org, 'questions.view')
     and public.access_module_enabled(p_org, 'question_bank') then
    select jsonb_build_object(
      'total', count(*)::int,
      'published', count(*) filter (where q.status = 'published')::int,
      'draft', count(*) filter (where coalesce(q.status, 'draft') <> 'published')::int,
      'by_type', coalesce((
        select jsonb_object_agg(t.qtype, t.cnt)
        from (
          select coalesce(to_jsonb(q2)->>'type', 'unspecified') as qtype, count(*)::int as cnt
          from public.questions q2
          where q2.organization_id = p_org
          group by 1
        ) t
      ), '{}'::jsonb),
      'by_difficulty', coalesce((
        select jsonb_object_agg(d.diff, d.cnt)
        from (
          select coalesce(to_jsonb(q3)->>'difficulty', 'unspecified') as diff, count(*)::int as cnt
          from public.questions q3
          where q3.organization_id = p_org
          group by 1
        ) d
      ), '{}'::jsonb)
    ) into v_qbank
    from public.questions q
    where q.organization_id = p_org;

    v_out := v_out || jsonb_build_object('question_bank_overview', coalesce(v_qbank, '{}'::jsonb));
  end if;

  -- Paper Builder overview (papers & templates metadata — zero answer secrets)
  if public.access_has_permission(v_uid, p_org, 'paper_builder.view')
     and public.access_module_enabled(p_org, 'paper_builder') then
    v_paper_builder := jsonb_build_object('total_papers', 0, 'published_papers', 0, 'draft_papers', 0, 'templates_count', 0, 'recent_papers', '[]'::jsonb);
    if to_regclass('public.quizzes') is not null then
      execute $q$
        select jsonb_build_object(
          'total_papers', count(*)::int,
          'published_papers', count(*) filter (where status = 'published')::int,
          'draft_papers', count(*) filter (where status = 'draft')::int,
          'archived_papers', count(*) filter (where status = 'archived')::int,
          'recent_papers', coalesce((
            select jsonb_agg(jsonb_build_object(
              'id', p.id,
              'title', p.title,
              'status', p.status,
              'updated_at', p.updated_at
            ))
            from (
              select id, title, status, updated_at
              from public.quizzes
              where organization_id = $1
              order by updated_at desc nulls last
              limit 15
            ) p
          ), '[]'::jsonb)
        )
        from public.quizzes
        where organization_id = $1
      $q$ into v_tmp using p_org;
      v_paper_builder := v_paper_builder || coalesce(v_tmp, '{}'::jsonb);
    end if;
    if to_regclass('public.exam_paper_templates') is not null then
      execute 'select count(*)::int from public.exam_paper_templates where organization_id = $1' into v_cnt using p_org;
      v_paper_builder := v_paper_builder || jsonb_build_object('templates_count', coalesce(v_cnt, 0));
    end if;
    v_out := v_out || jsonb_build_object('paper_builder_overview', v_paper_builder);
  end if;

  -- Examinations, assessment config & per-exam correction/publication visibility
  if public.access_has_permission(v_uid, p_org, 'exams.view')
     and public.access_module_enabled(p_org, 'examinations') then
    with exam_stats as (
      select
        e.id,
        e.title,
        e.status,
        to_jsonb(e)->>'starts_at' as starts_at,
        to_jsonb(e)->>'ends_at' as ends_at,
        (to_jsonb(e)->>'duration_minutes')::int as duration_minutes,
        to_jsonb(e)->>'grades_published_at' as grades_published_at,
        coalesce(to_jsonb(e)->>'result_publication_mode', e.settings->>'result_publication_mode', 'manual') as result_publication_mode,
        public.access_jsonb_flag(to_jsonb(e)->'shared_link_enabled') as shared_link_enabled,
        (to_jsonb(e)->>'paused_at') is not null as is_paused,
        public.access_jsonb_flag(e.settings->'results_published') as results_published,
        public.access_jsonb_flag(e.settings->'results_validated') as results_validated,
        public.access_jsonb_flag(e.settings->'proctoring') as proctoring_enabled,
        (public.access_jsonb_flag(e.settings->'lockdown') or public.access_jsonb_flag(e.settings->'require_lockdown')) as lockdown_enabled,
        public.access_jsonb_flag(e.settings->'calculator') as calculator_enabled,
        public.access_jsonb_flag(e.settings->'randomize_questions') as randomize_questions,
        coalesce(e.settings->>'grading_system_name', e.settings->>'grading_system', 'percentage') as grading_system,
        count(a.id)::int as total_attempts,
        count(a.id) filter (where a.status = 'in_progress')::int as in_progress_attempts,
        count(a.id) filter (where a.status = 'submitted')::int as submitted_attempts,
        count(a.id) filter (where coalesce(to_jsonb(a)->>'grading_status', case when a.score is not null then 'graded' else '' end) = 'graded')::int as graded_attempts,
        count(a.id) filter (where coalesce(to_jsonb(a)->>'grading_status', '') = 'awaiting_manual_grading' or coalesce((to_jsonb(a)->>'pending_manual_count')::int, 0) > 0)::int as awaiting_manual_attempts,
        count(a.id) filter (where coalesce(to_jsonb(a)->>'grading_status', '') = 'grading_failed')::int as failed_grading_attempts,
        coalesce(sum(coalesce((to_jsonb(a)->>'pending_manual_count')::int, 0)), 0)::int as pending_manual_items,
        round(avg(case when a.max_score > 0 and a.score is not null then (a.score / a.max_score) * 100 end), 1) as average_score_pct,
        round(min(case when a.max_score > 0 and a.score is not null then (a.score / a.max_score) * 100 end), 1) as min_score_pct,
        round(max(case when a.max_score > 0 and a.score is not null then (a.score / a.max_score) * 100 end), 1) as max_score_pct
      from public.exams e
      left join public.exam_attempts a on a.exam_id = e.id
      where e.organization_id = p_org
        and to_jsonb(e)->>'deleted_at' is null
      group by e.id, e.title, e.status, e.settings
    )
    select
      coalesce(jsonb_agg(jsonb_build_object(
        'id', s.id,
        'title', s.title,
        'status', s.status,
        'starts_at', s.starts_at,
        'ends_at', s.ends_at,
        'duration_minutes', s.duration_minutes,
        'is_paused', s.is_paused,
        'results_published', s.results_published,
        'results_validated', s.results_validated,
        'grades_published_at', s.grades_published_at,
        'publication_state', case
          when s.results_published then 'published'
          when s.results_validated then 'validated_awaiting_publication'
          when s.awaiting_manual_attempts > 0 or s.failed_grading_attempts > 0 or s.pending_manual_items > 0 then 'ongoing_correction'
          when s.graded_attempts > 0 and not s.results_validated then 'awaiting_validation'
          when s.in_progress_attempts > 0 then 'in_progress'
          when s.submitted_attempts > 0 then 'submitted_ungraded'
          else 'no_submissions'
        end,
        'total_attempts', s.total_attempts,
        'submitted_attempts', s.submitted_attempts,
        'in_progress_attempts', s.in_progress_attempts,
        'graded_attempts', s.graded_attempts,
        'awaiting_manual_attempts', s.awaiting_manual_attempts,
        'failed_grading_attempts', s.failed_grading_attempts,
        'pending_manual_items', s.pending_manual_items,
        'average_score_pct', s.average_score_pct
      ) order by s.title), '[]'::jsonb),
      coalesce(jsonb_agg(jsonb_build_object(
        'exam_id', s.id,
        'title', s.title,
        'status', s.status,
        'duration_minutes', s.duration_minutes,
        'grading_system', s.grading_system,
        'result_publication_mode', s.result_publication_mode,
        'proctoring_enabled', s.proctoring_enabled,
        'lockdown_enabled', s.lockdown_enabled,
        'calculator_enabled', s.calculator_enabled,
        'randomize_questions', s.randomize_questions,
        'shared_link_enabled', s.shared_link_enabled
      ) order by s.title), '[]'::jsonb)
    into v_exams, v_exam_configs
    from exam_stats s;

    v_out := v_out || jsonb_build_object(
      'examinations', v_exams,
      'assessment_configuration', v_exam_configs
    );
  end if;

  -- Candidate admission overview (counts only — zero tokens/codes/emails/names)
  if public.access_has_permission(v_uid, p_org, 'candidate_links.view')
     and (public.access_module_enabled(p_org, 'exam_candidates') or public.access_module_enabled(p_org, 'examinations')) then
    select jsonb_build_object(
      'shared_link_enabled_exams', count(*) filter (where public.access_jsonb_flag(to_jsonb(e)->'shared_link_enabled'))::int,
      'total_exams_with_admission', count(*)::int
    ) into v_admission
    from public.exams e
    where e.organization_id = p_org
      and to_jsonb(e)->>'deleted_at' is null;

    if to_regclass('public.exam_candidates') is not null then
      execute $q$
        select jsonb_build_object(
          'total_candidates', count(*)::int,
          'by_status', coalesce((
            select jsonb_object_agg(st.status, st.cnt)
            from (
              select coalesce(c2.status, 'unknown') as status, count(*)::int as cnt
              from public.exam_candidates c2
              join public.exams e2 on e2.id = c2.exam_id
              where e2.organization_id = $1 and to_jsonb(e2)->>'deleted_at' is null
              group by 1
            ) st
          ), '{}'::jsonb),
          'by_source', coalesce((
            select jsonb_object_agg(sr.source, sr.cnt)
            from (
              select coalesce(to_jsonb(c3)->>'source', 'manual') as source, count(*)::int as cnt
              from public.exam_candidates c3
              join public.exams e3 on e3.id = c3.exam_id
              where e3.organization_id = $1 and to_jsonb(e3)->>'deleted_at' is null
              group by 1
            ) sr
          ), '{}'::jsonb)
        )
        from public.exam_candidates c
        join public.exams e on e.id = c.exam_id
        where e.organization_id = $1 and to_jsonb(e)->>'deleted_at' is null
      $q$ into v_tmp using p_org;
      v_admission := coalesce(v_admission, '{}'::jsonb) || coalesce(v_tmp, '{}'::jsonb);
    end if;

    v_out := v_out || jsonb_build_object('candidate_admission_overview', coalesce(v_admission, '{}'::jsonb));
  end if;

  -- Marking & grading progress (aggregate correction telemetry — zero PII)
  if public.access_has_permission(v_uid, p_org, 'grading.view')
     and public.access_module_enabled(p_org, 'exam_results') then
    select jsonb_build_object(
      'total_attempts', count(*)::int,
      'graded_attempts', count(*) filter (where coalesce(to_jsonb(a)->>'grading_status', case when a.score is not null then 'graded' else '' end) = 'graded')::int,
      'awaiting_manual_grading', count(*) filter (where coalesce(to_jsonb(a)->>'grading_status', '') = 'awaiting_manual_grading' or coalesce((to_jsonb(a)->>'pending_manual_count')::int, 0) > 0)::int,
      'in_progress_attempts', count(*) filter (where a.status = 'in_progress' or coalesce(to_jsonb(a)->>'grading_status', '') = 'in_progress')::int,
      'not_started_attempts', count(*) filter (where coalesce(to_jsonb(a)->>'grading_status', '') = 'not_started')::int,
      'grading_failed_attempts', count(*) filter (where coalesce(to_jsonb(a)->>'grading_status', '') = 'grading_failed')::int,
      'pending_manual_items', coalesce(sum(coalesce((to_jsonb(a)->>'pending_manual_count')::int, 0)), 0)::int,
      'correction_completion_pct', case
        when count(*) filter (where a.status = 'submitted') > 0 then
          round(
            (count(*) filter (where a.status = 'submitted' and coalesce(to_jsonb(a)->>'grading_status', case when a.score is not null then 'graded' else '' end) = 'graded')::numeric
             / count(*) filter (where a.status = 'submitted')::numeric) * 100, 1
          )
        else null
      end
    ) into v_marking
    from public.exam_attempts a
    join public.exams e on e.id = a.exam_id
    where e.organization_id = p_org
      and to_jsonb(e)->>'deleted_at' is null;

    if to_regclass('public.exam_answers') is not null then
      execute $q$
        select jsonb_build_object(
          'total_answers', count(*)::int,
          'graded_answers', count(*) filter (where coalesce(to_jsonb(ans)->>'grading_status', '') in ('graded', 'auto_graded', 'manually_graded') or ans.points_awarded is not null)::int,
          'pending_manual_answers', count(*) filter (where coalesce(to_jsonb(ans)->>'grading_status', '') in ('pending_manual', 'awaiting_manual_grading'))::int,
          'moderated_answers', count(*) filter (where coalesce(to_jsonb(ans)->>'moderation_status', '') in ('approved', 'adjusted', 'moderated'))::int
        )
        from public.exam_answers ans
        join public.exam_attempts a on a.id = ans.attempt_id
        join public.exams e on e.id = a.exam_id
        where e.organization_id = $1 and to_jsonb(e)->>'deleted_at' is null
      $q$ into v_tmp using p_org;
      v_marking := coalesce(v_marking, '{}'::jsonb) || coalesce(v_tmp, '{}'::jsonb);
    end if;

    v_out := v_out || jsonb_build_object('marking_progress', coalesce(v_marking, '{}'::jsonb));
  end if;

  -- Results visibility: published, unpublished, awaiting validation & ongoing correction
  if public.access_has_permission(v_uid, p_org, 'results.view')
     and public.access_module_enabled(p_org, 'exam_results') then
    with exam_result_rows as (
      select
        e.id as exam_id,
        e.title,
        e.status as exam_status,
        public.access_jsonb_flag(e.settings->'results_published') as results_published,
        public.access_jsonb_flag(e.settings->'results_validated') as results_validated,
        to_jsonb(e)->>'grades_published_at' as grades_published_at,
        count(a.id)::int as total_attempts,
        count(a.id) filter (where a.status = 'submitted')::int as submitted_attempts,
        count(a.id) filter (where a.status = 'in_progress')::int as in_progress_attempts,
        count(a.id) filter (where coalesce(to_jsonb(a)->>'grading_status', case when a.score is not null then 'graded' else '' end) = 'graded')::int as graded_attempts,
        count(a.id) filter (where coalesce(to_jsonb(a)->>'grading_status', '') = 'awaiting_manual_grading' or coalesce((to_jsonb(a)->>'pending_manual_count')::int, 0) > 0)::int as awaiting_manual_attempts,
        count(a.id) filter (where coalesce(to_jsonb(a)->>'grading_status', '') = 'grading_failed')::int as failed_grading_attempts,
        coalesce(sum(coalesce((to_jsonb(a)->>'pending_manual_count')::int, 0)), 0)::int as pending_manual_items,
        round(avg(case when a.max_score > 0 and a.score is not null then (a.score / a.max_score) * 100 end), 1) as average_score_pct,
        round(min(case when a.max_score > 0 and a.score is not null then (a.score / a.max_score) * 100 end), 1) as min_score_pct,
        round(max(case when a.max_score > 0 and a.score is not null then (a.score / a.max_score) * 100 end), 1) as max_score_pct,
        case
          when count(a.id) filter (where a.status = 'submitted') > 0 then
            round(
              (count(a.id) filter (where a.status = 'submitted' and coalesce(to_jsonb(a)->>'grading_status', case when a.score is not null then 'graded' else '' end) = 'graded')::numeric
               / count(a.id) filter (where a.status = 'submitted')::numeric) * 100, 1
            )
          else null
        end as correction_progress_pct
      from public.exams e
      left join public.exam_attempts a on a.exam_id = e.id
      where e.organization_id = p_org
        and to_jsonb(e)->>'deleted_at' is null
      group by e.id, e.title, e.status, e.settings
    )
    select
      coalesce(jsonb_agg(jsonb_build_object(
        'exam_id', r.exam_id,
        'title', r.title,
        'exam_status', r.exam_status,
        'grades_published_at', r.grades_published_at,
        'submitted_attempts', r.submitted_attempts,
        'graded_attempts', r.graded_attempts,
        'average_score_pct', r.average_score_pct,
        'min_score_pct', r.min_score_pct,
        'max_score_pct', r.max_score_pct
      ) order by r.title) filter (where r.results_published), '[]'::jsonb),
      coalesce(jsonb_agg(jsonb_build_object(
        'exam_id', r.exam_id,
        'title', r.title,
        'exam_status', r.exam_status,
        'results_validated', r.results_validated,
        'total_attempts', r.total_attempts,
        'submitted_attempts', r.submitted_attempts,
        'in_progress_attempts', r.in_progress_attempts,
        'graded_attempts', r.graded_attempts,
        'awaiting_manual_attempts', r.awaiting_manual_attempts,
        'failed_grading_attempts', r.failed_grading_attempts,
        'pending_manual_items', r.pending_manual_items,
        'correction_progress_pct', r.correction_progress_pct,
        'average_score_pct', r.average_score_pct
      ) order by r.title) filter (where not r.results_published), '[]'::jsonb),
      coalesce(jsonb_agg(jsonb_build_object(
        'exam_id', r.exam_id,
        'title', r.title,
        'exam_status', r.exam_status,
        'submitted_attempts', r.submitted_attempts,
        'graded_attempts', r.graded_attempts,
        'awaiting_manual_attempts', r.awaiting_manual_attempts,
        'correction_progress_pct', r.correction_progress_pct,
        'average_score_pct', r.average_score_pct
      ) order by r.title) filter (where not r.results_published and not r.results_validated and (r.graded_attempts > 0 or r.submitted_attempts > 0)), '[]'::jsonb),
      coalesce(jsonb_agg(jsonb_build_object(
        'exam_id', r.exam_id,
        'title', r.title,
        'exam_status', r.exam_status,
        'total_attempts', r.total_attempts,
        'submitted_attempts', r.submitted_attempts,
        'in_progress_attempts', r.in_progress_attempts,
        'graded_attempts', r.graded_attempts,
        'awaiting_manual_attempts', r.awaiting_manual_attempts,
        'failed_grading_attempts', r.failed_grading_attempts,
        'pending_manual_items', r.pending_manual_items,
        'correction_progress_pct', r.correction_progress_pct
      ) order by r.title) filter (where r.awaiting_manual_attempts > 0 or r.failed_grading_attempts > 0 or r.pending_manual_items > 0 or (r.submitted_attempts > r.graded_attempts)), '[]'::jsonb)
    into v_published_results, v_unpublished_results, v_awaiting_validation, v_ongoing_correction
    from exam_result_rows r;

    select jsonb_build_object(
      'submitted_attempts', count(*) filter (where a.status = 'submitted')::int,
      'graded_attempts', count(*) filter (where coalesce(to_jsonb(a)->>'grading_status', case when a.score is not null then 'graded' else '' end) = 'graded')::int,
      'average_score_pct', round(avg(case when a.max_score > 0 and a.score is not null then (a.score / a.max_score) * 100 end), 1),
      'published_exam_count', jsonb_array_length(v_published_results),
      'unpublished_exam_count', jsonb_array_length(v_unpublished_results),
      'awaiting_validation_exam_count', jsonb_array_length(v_awaiting_validation),
      'ongoing_correction_exam_count', jsonb_array_length(v_ongoing_correction),
      'published', v_published_results,
      'unpublished', v_unpublished_results,
      'awaiting_validation', v_awaiting_validation,
      'ongoing_correction', v_ongoing_correction
    ) into v_results
    from public.exam_attempts a
    join public.exams e on e.id = a.exam_id
    where e.organization_id = p_org
      and to_jsonb(e)->>'deleted_at' is null;

    v_out := v_out || jsonb_build_object('results', coalesce(v_results, '{}'::jsonb));
  end if;

  -- Quizzes overview (sanitized metadata — zero join codes)
  if public.access_has_permission(v_uid, p_org, 'quizzes.view')
     and public.access_module_enabled(p_org, 'quizzes')
     and to_regclass('public.quizzes') is not null then
    execute $q$
      select jsonb_build_object(
        'total', count(*)::int,
        'published', count(*) filter (where status = 'published')::int,
        'draft', count(*) filter (where status = 'draft')::int,
        'archived', count(*) filter (where status = 'archived')::int
      )
      from public.quizzes
      where organization_id = $1
    $q$ into v_quizzes using p_org;
    if to_regclass('public.quiz_sessions') is not null then
      execute $q$
        select jsonb_build_object(
          'total_sessions', count(*)::int,
          'live_sessions', count(*) filter (where status in ('lobby', 'live'))::int,
          'ended_sessions', count(*) filter (where status = 'ended')::int
        )
        from public.quiz_sessions
        where organization_id = $1
      $q$ into v_tmp using p_org;
      v_quizzes := coalesce(v_quizzes, '{}'::jsonb) || coalesce(v_tmp, '{}'::jsonb);
    end if;
    v_out := v_out || jsonb_build_object('quizzes_overview', coalesce(v_quizzes, '{}'::jsonb));
  end if;

  -- Competitions overview (preserved top-level key — zero join codes)
  if public.access_has_permission(v_uid, p_org, 'competitions.view')
     and public.access_module_enabled(p_org, 'competitions') then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id,
      'title', c.title,
      'status', c.status,
      'format', to_jsonb(c)->>'format',
      'results_published', public.access_jsonb_flag(to_jsonb(c)->'results_published')
    ) order by c.title), '[]'::jsonb) into v_competitions
    from public.competitions c
    where c.organization_id = p_org;
    v_out := v_out || jsonb_build_object('competitions', v_competitions);
  end if;

  -- Rankings & reports overview (aggregate bands only — zero student PII)
  if public.access_has_permission(v_uid, p_org, 'reports.view')
     and (
       public.access_module_enabled(p_org, 'exam_reports')
       or public.access_module_enabled(p_org, 'org_reports')
       or public.access_module_enabled(p_org, 'competition_results')
     ) then
    select jsonb_build_object(
      'exam_performance_rankings', coalesce((
        select jsonb_agg(row_obj order by (row_obj->>'average_score_pct')::numeric desc nulls last)
        from (
          select jsonb_build_object(
            'exam_id', e.id,
            'title', e.title,
            'results_published', public.access_jsonb_flag(e.settings->'results_published'),
            'graded_attempts', count(a.id) filter (where a.score is not null and a.max_score > 0)::int,
            'average_score_pct', round(avg(case when a.max_score > 0 and a.score is not null then (a.score / a.max_score) * 100 end), 1),
            'pass_rate_pct', case
              when count(a.id) filter (where a.score is not null and a.max_score > 0) > 0 then
                round((count(a.id) filter (where a.score is not null and a.max_score > 0 and (a.score / a.max_score) >= 0.5)::numeric
                  / count(a.id) filter (where a.score is not null and a.max_score > 0)::numeric) * 100, 1)
              else null
            end
          ) as row_obj
          from public.exams e
          join public.exam_attempts a on a.exam_id = e.id
          where e.organization_id = p_org
            and to_jsonb(e)->>'deleted_at' is null
          group by e.id, e.title, e.settings
          having count(a.id) filter (where a.score is not null and a.max_score > 0) > 0
        ) ranked
      ), '[]'::jsonb),
      'competitions_with_published_results', (
        select count(*)::int from public.competitions c
        where c.organization_id = p_org
          and public.access_jsonb_flag(to_jsonb(c)->'results_published')
      )
    ) into v_rankings;
    v_out := v_out || jsonb_build_object('rankings_and_reports', coalesce(v_rankings, '{}'::jsonb));
  end if;

  -- Proctoring overview (aggregate counts only — zero webcam/candidate PII)
  if public.access_has_permission(v_uid, p_org, 'exams.monitor')
     and (public.access_module_enabled(p_org, 'proctoring') or public.access_module_enabled(p_org, 'exam_monitoring')) then
    select jsonb_build_object(
      'proctored_exams', count(*) filter (where public.access_jsonb_flag(e.settings->'proctoring'))::int,
      'lockdown_exams', count(*) filter (where public.access_jsonb_flag(e.settings->'lockdown') or public.access_jsonb_flag(e.settings->'require_lockdown'))::int,
      'total_rooms', 0,
      'active_rooms', 0,
      'total_incidents', 0,
      'open_incidents', 0,
      'investigating_incidents', 0,
      'resolved_incidents', 0
    ) into v_proctoring
    from public.exams e
    where e.organization_id = p_org
      and to_jsonb(e)->>'deleted_at' is null;

    if to_regclass('public.proctoring_rooms') is not null then
      execute $q$
        select jsonb_build_object(
          'total_rooms', count(*)::int,
          'active_rooms', count(*) filter (where status in ('active', 'open', 'live'))::int
        )
        from public.proctoring_rooms
        where organization_id = $1
      $q$ into v_tmp using p_org;
      v_proctoring := v_proctoring || coalesce(v_tmp, '{}'::jsonb);
    end if;

    if to_regclass('public.proctoring_incidents') is not null then
      execute $q$
        select jsonb_build_object(
          'total_incidents', count(*)::int,
          'open_incidents', count(*) filter (where status = 'open')::int,
          'investigating_incidents', count(*) filter (where status = 'investigating')::int,
          'resolved_incidents', count(*) filter (where status in ('valid', 'invalid', 'resolved'))::int
        )
        from public.proctoring_incidents
        where organization_id = $1
      $q$ into v_tmp using p_org;
      v_proctoring := v_proctoring || coalesce(v_tmp, '{}'::jsonb);
    end if;

    v_out := v_out || jsonb_build_object('proctoring_overview', coalesce(v_proctoring, '{}'::jsonb));
  end if;

  return v_out;
end $$;
revoke all on function public.access_supervision_overview(uuid) from public, anon;
grant execute on function public.access_supervision_overview(uuid) to authenticated;
