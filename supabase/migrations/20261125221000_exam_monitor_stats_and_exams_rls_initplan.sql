-- Complete InitPlan RLS optimization on public.exams and optimize exam_monitor_answer_stats
-- so authorization is evaluated once per distinct exam instead of per exam_answers row.
-- Strictly non-destructive: zero data or schema drops, 100% identical RBAC/entitlement rules.

-- 1. InitPlan RLS policies on public.exams
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exams' AND policyname='entitlement_exams') THEN
    ALTER POLICY entitlement_exams ON public.exams
      USING (
        (SELECT public.is_super_admin())
        OR organization_id IN (SELECT public.entitled_org_ids('examinations'))
      )
      WITH CHECK (
        (SELECT public.is_super_admin())
        OR organization_id IN (SELECT public.entitled_org_ids('examinations'))
      );
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exams' AND policyname='access_founder_read') THEN
    ALTER POLICY access_founder_read ON public.exams
      USING (
        (SELECT public.access_is_founder())
        AND organization_id IN (SELECT public.founder_readable_org_ids('exams.view'))
      );
  END IF;
END $$;

-- 2. Optimize exam_monitor_answer_stats to authorize once per exam instead of nested
--    per-row RLS across exam_answers -> exam_attempts -> exams.
--    Enforces the exact intersection of exams, exam_attempts, and exam_answers RLS:
--      - service_role: allowed (mirrors BYPASSRLS)
--      - super_admin: allowed
--      - active org staff (staff_org_ids()) with active 'examinations' entitlement: allowed
--      - school_founder with 'examinations' entitlement AND exams.view + results.view + grading.view: allowed
--      - all others (anon, learners, unauthorized orgs): 0 rows returned.
CREATE OR REPLACE FUNCTION public.exam_monitor_answer_stats(
  p_attempt_ids uuid[],
  p_paper_quiz_question_ids uuid[] DEFAULT NULL
)
RETURNS TABLE(
  attempt_id uuid,
  answered integer,
  correct integer,
  incorrect integer,
  awaiting_grading integer,
  marked integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH caller_access AS (
    SELECT
      (auth.role() = 'service_role') AS is_service,
      (SELECT public.is_super_admin()) AS is_sa,
      (SELECT public.access_is_founder()) AS is_founder
  ),
  authorized_attempts AS (
    SELECT
      ea.id,
      ea.question_order
    FROM public.exam_attempts ea
    JOIN public.exams e ON e.id = ea.exam_id
    CROSS JOIN caller_access ca
    WHERE ea.id = ANY(p_attempt_ids)
      AND (
        ca.is_service
        OR ca.is_sa
        OR (
          e.organization_id IN (SELECT public.entitled_org_ids('examinations'))
          AND (
            e.organization_id IN (SELECT public.staff_org_ids())
            OR (
              ca.is_founder
              AND e.organization_id IN (SELECT public.founder_readable_org_ids('exams.view'))
              AND e.organization_id IN (SELECT public.founder_readable_org_ids('results.view'))
              AND e.organization_id IN (SELECT public.founder_readable_org_ids('grading.view'))
            )
          )
        )
      )
  )
  SELECT
    ans.attempt_id,
    COUNT(*) FILTER (WHERE has_content)::integer AS answered,
    COUNT(*) FILTER (WHERE has_content AND ans.is_correct IS TRUE)::integer AS correct,
    COUNT(*) FILTER (WHERE has_content AND ans.is_correct IS FALSE)::integer AS incorrect,
    COUNT(*) FILTER (
      WHERE has_content
        AND ans.is_correct IS NULL
        AND ans.points_awarded IS NULL
    )::integer AS awaiting_grading,
    COUNT(*) FILTER (
      WHERE has_content
        AND ans.is_correct IS NULL
        AND ans.points_awarded IS NOT NULL
    )::integer AS marked
  FROM (
    SELECT
      a.attempt_id,
      a.is_correct,
      a.points_awarded,
      public.exam_jsonb_has_content(a.answer) AS has_content
    FROM public.exam_answers a
    JOIN authorized_attempts aa ON aa.id = a.attempt_id
    WHERE a.quiz_question_id IS NOT NULL
      AND (
        CASE
          WHEN aa.question_order IS NOT NULL
               AND jsonb_typeof(aa.question_order) = 'array'
               AND jsonb_array_length(aa.question_order) > 0
            THEN EXISTS (
              SELECT 1
              FROM jsonb_array_elements_text(aa.question_order) elem(val)
              WHERE elem.val = a.quiz_question_id::text
            )
          WHEN p_paper_quiz_question_ids IS NOT NULL
            THEN a.quiz_question_id = ANY(p_paper_quiz_question_ids)
          ELSE true
        END
      )
  ) ans
  GROUP BY ans.attempt_id;
$$;

REVOKE ALL ON FUNCTION public.exam_monitor_answer_stats(uuid[], uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.exam_monitor_answer_stats(uuid[], uuid[]) TO authenticated, service_role;
