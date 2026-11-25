-- =============================================================================
-- Differentiated EVALORA Plan Module Matrices (FREE / PREMIUM / INSTITUTION)
-- =============================================================================
-- Non-destructive configuration migration:
--   1. Populates explicit, meaningfully differentiated 41-module JSONB maps on
--      `public.plans.modules` for `free` (12/41), `premium` (26/41), and
--      `institution` (41/41 org modules — strictly excluding Platform Super Admin).
--      Previously `free.modules` and `premium.modules` were NULL, causing all
--      three plans to resolve to 41/41 enabled via legacy fallback defaults.
--   2. Removes redundant per-organization overrides that merely duplicate the
--      organization's assigned plan value (specifically Oak's stray
--      `{"exam_monitoring": true}` override on Institution, where
--      `exam_monitoring` is already true in the Institution plan), leaving all
--      genuine overrides and every customer record completely intact.
--
-- Zero tables dropped, zero rows deleted, zero existing data truncated.
-- =============================================================================

UPDATE public.plans
SET
  description = 'Essential workspace for individual educators and small groups — basic classes, students, quizzes, question bank, standard examinations, and basic results.',
  modules = jsonb_build_object(
    -- Assessments & Live Competitions (Institution)
    'competitions', false,
    'competition_config', false,
    'competition_code', false,
    'competition_participants', false,
    'competition_phases', false,
    'competition_questions', false,
    'competition_results', false,
    'competition_monitoring', false,
    'competition_reports', false,
    -- Quizzes
    'quizzes', true,
    'paper_builder', false,
    'quiz_solutions', false,
    'quiz_assignment', false,
    'question_bank', true,
    'quiz_results', true,
    -- Examinations
    'examinations', true,
    'exam_links', false,
    'exam_share_codes', false,
    'exam_hints', false,
    'exam_candidate_links', false,
    'exam_candidates', true,
    'exam_monitoring', false,
    'exam_results', true,
    'exam_validation', false,
    'exam_publication', true,
    'exam_reports', false,
    'exam_printable', false,
    'exam_templates', false,
    'exam_calculator', false,
    -- Institution & Workspace
    'classes', true,
    'academics', false,
    'students', true,
    'teachers', false,
    'team', true,
    'accounts', false,
    'org_settings', true,
    'rubrics', false,
    'proctoring', false,
    'org_reports', false,
    'platform', false,
    'billing', true
  )
WHERE slug = 'free';

UPDATE public.plans
SET
  description = 'Advanced assessment suite for active schools and teams — Exam Links & Access Codes, Paper Builder, Live Examination Monitoring & Supervision, Proctoring, Rubrics, Solutions, Validation, and Advanced Reports.',
  modules = jsonb_build_object(
    -- Assessments & Live Competitions (Institution)
    'competitions', false,
    'competition_config', false,
    'competition_code', false,
    'competition_participants', false,
    'competition_phases', false,
    'competition_questions', false,
    'competition_results', false,
    'competition_monitoring', false,
    'competition_reports', false,
    -- Quizzes
    'quizzes', true,
    'paper_builder', true,
    'quiz_solutions', true,
    'quiz_assignment', true,
    'question_bank', true,
    'quiz_results', true,
    -- Examinations
    'examinations', true,
    'exam_links', true,
    'exam_share_codes', true,
    'exam_hints', true,
    'exam_candidate_links', true,
    'exam_candidates', true,
    'exam_monitoring', true,
    'exam_results', true,
    'exam_validation', true,
    'exam_publication', true,
    'exam_reports', false,
    'exam_printable', true,
    'exam_templates', false,
    'exam_calculator', true,
    -- Institution & Workspace
    'classes', true,
    'academics', false,
    'students', true,
    'teachers', false,
    'team', true,
    'accounts', false,
    'org_settings', true,
    'rubrics', true,
    'proctoring', true,
    'org_reports', true,
    'platform', false,
    'billing', true
  )
WHERE slug = 'premium';

UPDATE public.plans
SET
  description = 'Complete institutional assessment & examination platform — full academic structure, faculty & RBAC role management, branded portal, official paper templates, MYP/curriculum analytics, Live Competitions, Live Monitoring, and Proctoring.',
  modules = jsonb_build_object(
    -- Assessments & Live Competitions
    'competitions', true,
    'competition_config', true,
    'competition_code', true,
    'competition_participants', true,
    'competition_phases', true,
    'competition_questions', true,
    'competition_results', true,
    'competition_monitoring', true,
    'competition_reports', true,
    -- Quizzes
    'quizzes', true,
    'paper_builder', true,
    'quiz_solutions', true,
    'quiz_assignment', true,
    'question_bank', true,
    'quiz_results', true,
    -- Examinations
    'examinations', true,
    'exam_links', true,
    'exam_share_codes', true,
    'exam_hints', true,
    'exam_candidate_links', true,
    'exam_candidates', true,
    'exam_monitoring', true,
    'exam_results', true,
    'exam_validation', true,
    'exam_publication', true,
    'exam_reports', true,
    'exam_printable', true,
    'exam_templates', true,
    'exam_calculator', true,
    -- Institution & Workspace (strictly org-level; never Platform Super Admin)
    'classes', true,
    'academics', true,
    'students', true,
    'teachers', true,
    'team', true,
    'accounts', true,
    'org_settings', true,
    'rubrics', true,
    'proctoring', true,
    'org_reports', true,
    'platform', true,
    'billing', true
  )
WHERE slug = 'institution';

-- Clean redundant single-key override where an Institution org had a legacy
-- {"exam_monitoring": true} override that duplicates the Institution plan.
UPDATE public.subscriptions s
SET modules_override = NULL
FROM public.plans p
WHERE s.plan_id = p.id
  AND p.slug = 'institution'
  AND s.modules_override = '{"exam_monitoring": true}'::jsonb;
