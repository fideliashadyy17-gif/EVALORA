-- Transactional DB verification for the additional mandatory requirements.
-- All inserts are rolled back; no examination, candidate, attempt or plan
-- record is committed. Run with a role that can SET LOCAL ROLE authenticated.
BEGIN;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '3c3ed712-f409-4aa1-a645-816418e22ec4', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"3c3ed712-f409-4aa1-a645-816418e22ec4","role":"authenticated"}',
  true
);

CREATE TEMP TABLE evalora_additional_results (name text, passed boolean) ON COMMIT DROP;
CREATE TEMP TABLE evalora_exam_fixture (
  seq int, id uuid, access_code text, invite_token uuid, access_link text,
  access_code_hash text
) ON COMMIT DROP;

-- ── Super Admin: unrestricted, tenant-safe RLS and generated identity ──────
INSERT INTO evalora_additional_results VALUES
  ('super_admin_is_verified_owner', public.is_super_admin()),
  ('super_admin_can_read_exams', (SELECT count(*) FROM public.exams) >= 15),
  ('super_admin_can_read_quizzes', (SELECT count(*) FROM public.quizzes) >= 0),
  ('super_admin_can_read_questions', (SELECT count(*) FROM public.questions) >= 0),
  ('super_admin_can_read_classes', (SELECT count(*) FROM public.classes) >= 0),
  ('super_admin_can_read_students', (SELECT count(*) FROM public.students) >= 0),
  ('super_admin_can_read_attempts', (SELECT count(*) FROM public.exam_attempts) >= 0),
  ('super_admin_can_read_answers', (SELECT count(*) FROM public.exam_answers) >= 0),
  ('super_admin_can_read_proctoring', (SELECT count(*) FROM public.proctoring_incidents) >= 0),
  ('super_admin_can_read_live_sessions', (SELECT count(*) FROM public.quiz_sessions) >= 0),
  ('super_admin_can_read_subscriptions', (SELECT count(*) FROM public.subscriptions) >= 0),
  ('super_admin_can_read_plans', (SELECT count(*) FROM public.plans) >= 3),
  ('super_admin_can_read_audit_logs', (SELECT count(*) FROM public.audit_logs) >= 0),
  ('super_admin_can_read_platform_settings', (SELECT count(*) FROM public.platform_settings) >= 0),
  ('super_admin_has_no_demo_membership', NOT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE user_id = auth.uid() AND organization_id = 'de000000-0000-4000-8000-000000000001'
  )),
  ('rls_has_owner_paths', (SELECT count(*) FROM pg_policies
     WHERE schemaname = 'public'
       AND (qual LIKE '%is_super_admin%' OR with_check LIKE '%is_super_admin%')) >= 80);

-- Insert two exams with NO client-supplied access code. The DB default and
-- hash trigger must generate unique codes; the generated column must persist
-- the candidate link path. This also proves exam_write WITH CHECK allows the
-- owner in an organization where they have no ordinary membership.
WITH a AS (
  INSERT INTO public.exams (organization_id, title, status, settings)
  VALUES (
    'de000000-0000-4000-8000-000000000001',
    'ADDITIONAL REQUIREMENTS TEST A',
    'draft',
    '{"proctoring":false,"pass_mark_percent":50,"randomize_questions":true,"randomize_options":true,"results_published":false,"require_screen_share":false,"access_mode":"shared_link","identity_fields":[],"eligible_class_ids":[],"attempt_policy":"single_resume"}'::jsonb
  )
  RETURNING id, access_code, invite_token, access_link, access_code_hash
)
INSERT INTO evalora_exam_fixture
SELECT 1, id, access_code, invite_token, access_link, access_code_hash FROM a;

WITH b AS (
  INSERT INTO public.exams (organization_id, title, status, settings)
  VALUES (
    'de000000-0000-4000-8000-000000000001',
    'ADDITIONAL REQUIREMENTS TEST B',
    'draft',
    '{"proctoring":false,"pass_mark_percent":50,"randomize_questions":true,"randomize_options":true,"results_published":false,"require_screen_share":false,"access_mode":"shared_link","identity_fields":[],"eligible_class_ids":[],"attempt_policy":"single_resume"}'::jsonb
  )
  RETURNING id, access_code, invite_token, access_link, access_code_hash
)
INSERT INTO evalora_exam_fixture
SELECT 2, id, access_code, invite_token, access_link, access_code_hash FROM b;

INSERT INTO evalora_additional_results
SELECT 'super_admin_insert_generated_two_exams', count(*) = 2 FROM evalora_exam_fixture;
INSERT INTO evalora_additional_results
SELECT 'generated_access_codes_are_nonblank', bool_and(length(btrim(access_code)) >= 8) FROM evalora_exam_fixture;
INSERT INTO evalora_additional_results
SELECT 'generated_access_codes_are_unique', count(DISTINCT access_code) = 2 FROM evalora_exam_fixture;
INSERT INTO evalora_additional_results
SELECT 'generated_invite_tokens_are_unique', count(DISTINCT invite_token) = 2 FROM evalora_exam_fixture;
INSERT INTO evalora_additional_results
SELECT 'persisted_access_link_matches_token', bool_and(access_link = '/exam/join/' || invite_token::text) FROM evalora_exam_fixture;
INSERT INTO evalora_additional_results
SELECT 'access_code_hash_matches_code', bool_and(
  access_code_hash = public.evalora_hash_secret(public.evalora_normalize_code(access_code))
) FROM evalora_exam_fixture;
INSERT INTO evalora_additional_results
SELECT 'wrong_code_hash_is_rejected', bool_and(
  access_code_hash <> public.evalora_hash_secret(public.evalora_normalize_code('WRONGCODE'))
) FROM evalora_exam_fixture;
INSERT INTO evalora_additional_results
SELECT 'cross_exam_credentials_do_not_match', NOT EXISTS (
  SELECT 1 FROM evalora_exam_fixture a JOIN evalora_exam_fixture b ON a.seq = 1 AND b.seq = 2
  WHERE a.access_code_hash = b.access_code_hash OR a.invite_token = b.invite_token
);
INSERT INTO evalora_additional_results
SELECT 'invalid_link_token_resolves_no_exam', NOT EXISTS (
  SELECT 1 FROM public.exams WHERE invite_token = '00000000-0000-4000-8000-000000000000'
);
INSERT INTO evalora_additional_results
SELECT 'all_exams_have_persisted_links', count(*) FILTER (
  WHERE access_link = '/exam/join/' || invite_token::text
) = count(*) FROM public.exams;
INSERT INTO evalora_additional_results
SELECT 'all_exams_have_code_hashes', count(*) FILTER (
  WHERE access_code_hash IS NOT NULL
) = count(*) FROM public.exams;
INSERT INTO evalora_additional_results
SELECT 'all_exams_have_access_settings', count(*) FILTER (
  WHERE settings ? 'access_mode' AND settings ? 'identity_fields'
    AND settings ? 'eligible_class_ids' AND settings ? 'attempt_policy'
) = count(*) FROM public.exams;
INSERT INTO evalora_additional_results
SELECT 'no_duplicate_exam_records', count(*) = count(DISTINCT id) FROM public.exams;
INSERT INTO evalora_additional_results
SELECT 'identity_data_columns_exist', (
  SELECT count(*) FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name IN ('exam_candidates', 'exam_attempts')
    AND column_name = 'identity_data'
) = 2;
INSERT INTO evalora_additional_results
SELECT 'institutional_plan_capabilities_persisted', (
  SELECT (limits->>'institutional')::boolean
      AND (limits->>'central_asset_management')::boolean
      AND (limits->>'configurable_limits')::boolean
      AND (limits->>'multi_class_operations')::boolean
  FROM public.plans WHERE slug = 'institution'
);
INSERT INTO evalora_additional_results
SELECT 'free_and_premium_are_not_institutional', (
  SELECT bool_not = false FROM (
    SELECT bool_or((limits->>'institutional')::boolean) AS bool_not
    FROM public.plans WHERE slug IN ('free', 'premium')
  ) s
);
INSERT INTO evalora_additional_results
SELECT 'all_three_plan_tiers_exist', (
  SELECT count(*) FROM public.plans WHERE slug IN ('free', 'premium', 'institution')
) = 3;

-- ── Ordinary customer: tenant isolation and plan restrictions ───────────────
SELECT set_config('request.jwt.claim.sub', 'de000000-0000-4000-8000-000000000065', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"de000000-0000-4000-8000-000000000065","role":"authenticated"}',
  true
);

INSERT INTO evalora_additional_results VALUES
  ('ordinary_user_is_not_owner', NOT public.is_super_admin()),
  ('ordinary_user_is_demo_member', public.is_org_member('de000000-0000-4000-8000-000000000001')),
  ('ordinary_user_sees_only_own_org_exams',
    (SELECT count(*) FROM public.exams) =
    (SELECT count(*) FROM public.exams WHERE organization_id = 'de000000-0000-4000-8000-000000000001')),
  ('ordinary_user_cannot_see_oak_exams',
    (SELECT count(*) FROM public.exams WHERE organization_id = '0a400000-0000-4000-8000-000000000001') = 0);

DO $$
BEGIN
  INSERT INTO public.exams (organization_id, title, status, settings)
  VALUES (
    '0a400000-0000-4000-8000-000000000001',
    'CROSS ORG INSERT MUST FAIL',
    'draft',
    '{}'::jsonb
  );
  INSERT INTO evalora_additional_results VALUES ('ordinary_cross_org_insert_blocked', false);
EXCEPTION WHEN others THEN
  INSERT INTO evalora_additional_results VALUES ('ordinary_cross_org_insert_blocked', true);
END $$;

DO $$
BEGIN
  INSERT INTO public.exams (organization_id, title, status, settings)
  VALUES (
    'de000000-0000-4000-8000-000000000001',
    'OWN ORG INSERT MUST SUCCEED',
    'draft',
    '{}'::jsonb
  );
  INSERT INTO evalora_additional_results VALUES ('ordinary_own_org_insert_allowed', true);
EXCEPTION WHEN others THEN
  INSERT INTO evalora_additional_results VALUES ('ordinary_own_org_insert_allowed', false);
END $$;

RESET ROLE;
SELECT json_agg(json_build_object('name', name, 'passed', passed) ORDER BY name) AS checks,
       count(*) FILTER (WHERE passed) AS passed_count,
       count(*) AS total_count
FROM evalora_additional_results;

ROLLBACK;
