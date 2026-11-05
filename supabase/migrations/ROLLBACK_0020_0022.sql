-- ROLLBACK_0020_0022 — emergency schema rollback for the three additive
-- additional-requirements migrations. NOT intended for production data:
-- it removes generated link/identity columns and restores pre-migration
-- RLS policies / plan capability keys. It does not attempt to restore
-- per-exam settings values that organizers may have edited after 0022.
-- Do not run on live production data without an explicit recovery plan.

BEGIN;

-- ── Reverse 0022: persisted exam link + identity fields ────────────────────
ALTER TABLE public.exams ALTER COLUMN access_code DROP DEFAULT;
DROP FUNCTION IF EXISTS public.evalora_unique_exam_code();
DROP INDEX IF EXISTS public.uq_exams_access_link;
ALTER TABLE public.exams DROP COLUMN IF EXISTS access_link;

ALTER TABLE public.exam_candidates DROP CONSTRAINT IF EXISTS exam_candidates_identity_data_object;
ALTER TABLE public.exam_attempts DROP CONSTRAINT IF EXISTS exam_attempts_identity_data_object;
ALTER TABLE public.exam_candidates DROP COLUMN IF EXISTS identity_data;
ALTER TABLE public.exam_attempts DROP COLUMN IF EXISTS identity_data;

UPDATE public.exams
SET settings = settings - 'access_mode' - 'identity_fields' - 'eligible_class_ids' - 'attempt_policy';

-- ── Reverse 0020: Institutional plan capability keys ──────────────────────
UPDATE public.plans
SET limits = limits
    - 'institutional' - 'multi_class_operations' - 'central_asset_management'
    - 'configurable_limits' - 'max_classes' - 'max_students'
WHERE slug IN ('free', 'premium');

UPDATE public.plans
SET limits = '{
  "max_exams": -1,
  "proctoring": true,
  "storage_mb": 51200,
  "max_members": -1,
  "max_quizzes": -1,
  "max_questions": -1,
  "advanced_reports": true,
  "max_participants_per_session": 1000
}'::jsonb,
    features = '[
      "Everything in Premium",
      "1,000 participants per live session",
      "Unlimited team members",
      "Priority support",
      "Dedicated onboarding"
    ]'::jsonb
WHERE slug = 'institution';

-- ── Reverse 0021: restore pre-migration RLS policies ──────────────────────
DROP POLICY IF EXISTS org_insert ON public.organizations;
CREATE POLICY org_insert ON public.organizations FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS pay_insert ON public.payment_requests;
CREATE POLICY pay_insert ON public.payment_requests FOR INSERT TO authenticated
  WITH CHECK (can_manage_org(organization_id));

DROP POLICY IF EXISTS exam_select ON public.exams;
CREATE POLICY exam_select ON public.exams FOR SELECT TO authenticated
  USING (is_org_member(organization_id));

DROP POLICY IF EXISTS exam_write ON public.exams;
CREATE POLICY exam_write ON public.exams FOR ALL TO authenticated
  USING (can_create_content(organization_id))
  WITH CHECK (can_create_content(organization_id));

DROP POLICY IF EXISTS q_select ON public.questions;
CREATE POLICY q_select ON public.questions FOR SELECT TO authenticated
  USING (is_org_member(organization_id));

DROP POLICY IF EXISTS q_write ON public.questions;
CREATE POLICY q_write ON public.questions FOR ALL TO authenticated
  USING (can_create_content(organization_id))
  WITH CHECK (can_create_content(organization_id));

DROP POLICY IF EXISTS qc_all ON public.question_categories;
CREATE POLICY qc_all ON public.question_categories FOR ALL TO authenticated
  USING (is_org_member(organization_id))
  WITH CHECK (can_create_content(organization_id));

DROP POLICY IF EXISTS qopt_all ON public.question_options;
CREATE POLICY qopt_all ON public.question_options FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM questions q WHERE q.id = question_id AND is_org_member(q.organization_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM questions q WHERE q.id = question_id AND can_create_content(q.organization_id)));

DROP POLICY IF EXISTS qq_all ON public.quiz_questions;
CREATE POLICY qq_all ON public.quiz_questions FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM quizzes z WHERE z.id = quiz_id AND is_org_member(z.organization_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM quizzes z WHERE z.id = quiz_id AND can_create_content(z.organization_id)));

DROP POLICY IF EXISTS quiz_select ON public.quizzes;
CREATE POLICY quiz_select ON public.quizzes FOR SELECT TO authenticated
  USING (is_org_member(organization_id));

DROP POLICY IF EXISTS quiz_write ON public.quizzes;
CREATE POLICY quiz_write ON public.quizzes FOR ALL TO authenticated
  USING (can_create_content(organization_id))
  WITH CHECK (can_create_content(organization_id));

DROP POLICY IF EXISTS ses_select ON public.quiz_sessions;
CREATE POLICY ses_select ON public.quiz_sessions FOR SELECT TO authenticated
  USING (host_id = auth.uid() OR can_host_live_session(organization_id) OR is_linked_live_participant(id));

DROP POLICY IF EXISTS ses_write ON public.quiz_sessions;
CREATE POLICY ses_write ON public.quiz_sessions FOR ALL TO authenticated
  USING (can_create_content(organization_id))
  WITH CHECK (can_create_content(organization_id));

DROP POLICY IF EXISTS sp_select ON public.session_participants;
CREATE POLICY sp_select ON public.session_participants FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR EXISTS (
    SELECT 1 FROM quiz_sessions s
    WHERE s.id = session_id AND (s.host_id = auth.uid() OR can_host_live_session(s.organization_id))));

DROP POLICY IF EXISTS sp_host_update ON public.session_participants;
CREATE POLICY sp_host_update ON public.session_participants FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM quiz_sessions s
    WHERE s.id = session_id AND (s.host_id = auth.uid() OR can_host_live_session(s.organization_id))))
  WITH CHECK (EXISTS (
    SELECT 1 FROM quiz_sessions s
    WHERE s.id = session_id AND (s.host_id = auth.uid() OR can_host_live_session(s.organization_id))));

DROP POLICY IF EXISTS pa_select ON public.participant_answers;
CREATE POLICY pa_select ON public.participant_answers FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM session_participants p
    WHERE p.id = participant_id AND p.user_id = auth.uid()) OR EXISTS (
    SELECT 1 FROM quiz_sessions s
    WHERE s.id = session_id AND (s.host_id = auth.uid() OR can_host_live_session(s.organization_id))));

DROP POLICY IF EXISTS ea_update ON public.exam_attempts;
CREATE POLICY ea_update ON public.exam_attempts FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM exams e WHERE e.id = exam_id
      AND coalesce(org_role(e.organization_id) = ANY (ARRAY['owner','admin','teacher','corrector']::text[]), false)))
  WITH CHECK (EXISTS (
    SELECT 1 FROM exams e WHERE e.id = exam_id
      AND coalesce(org_role(e.organization_id) = ANY (ARRAY['owner','admin','teacher','corrector']::text[]), false)));

DROP POLICY IF EXISTS eans_update ON public.exam_answers;
CREATE POLICY eans_update ON public.exam_answers FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM exam_attempts a JOIN exams e ON e.id = a.exam_id
    WHERE a.id = attempt_id AND coalesce(org_role(e.organization_id) = ANY (ARRAY['owner','admin','teacher','corrector']::text[]), false)))
  WITH CHECK (EXISTS (
    SELECT 1 FROM exam_attempts a JOIN exams e ON e.id = a.exam_id
    WHERE a.id = attempt_id AND coalesce(org_role(e.organization_id) = ANY (ARRAY['owner','admin','teacher','corrector']::text[]), false)));

DROP POLICY IF EXISTS pi_all ON public.proctoring_incidents;
CREATE POLICY pi_all ON public.proctoring_incidents FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM exams e WHERE e.id = exam_id
      AND coalesce(org_role(e.organization_id) = ANY (ARRAY['owner','admin','teacher','supervisor','corrector']::text[]), false)))
  WITH CHECK (EXISTS (
    SELECT 1 FROM exams e WHERE e.id = exam_id
      AND coalesce(org_role(e.organization_id) = ANY (ARRAY['owner','admin','teacher','supervisor','corrector']::text[]), false)));

DROP POLICY IF EXISTS pr_select ON public.proctoring_rooms;
CREATE POLICY pr_select ON public.proctoring_rooms FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM exams e WHERE e.id = exam_id AND is_org_member(e.organization_id)));

DROP POLICY IF EXISTS pr_super_write ON public.proctoring_rooms;

COMMIT;
