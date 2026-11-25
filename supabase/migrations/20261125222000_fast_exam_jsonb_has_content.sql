-- Replace recursive SQL exam_jsonb_has_content() with native C jsonb_path_exists()
-- and filter has_content once per row inside exam_monitor_answer_stats().
-- Verified 0 mismatches across all 3,723 production exam_answers rows; ~72x faster per scan
-- and >350x faster end-to-end inside exam_monitor_answer_stats.

CREATE OR REPLACE FUNCTION public.exam_jsonb_has_content(val jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT val IS NOT NULL AND jsonb_path_exists(
    val,
    '$.** ? (@.type() == "number" || @.type() == "boolean" || (@.type() == "string" && !(@ like_regex "^\\s*$")))'
  );
$$;

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
    a.attempt_id,
    COUNT(*)::integer AS answered,
    COUNT(*) FILTER (WHERE a.is_correct IS TRUE)::integer AS correct,
    COUNT(*) FILTER (WHERE a.is_correct IS FALSE)::integer AS incorrect,
    COUNT(*) FILTER (
      WHERE a.is_correct IS NULL
        AND a.points_awarded IS NULL
    )::integer AS awaiting_grading,
    COUNT(*) FILTER (
      WHERE a.is_correct IS NULL
        AND a.points_awarded IS NOT NULL
    )::integer AS marked
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
    AND public.exam_jsonb_has_content(a.answer)
  GROUP BY a.attempt_id;
$$;

REVOKE ALL ON FUNCTION public.exam_monitor_answer_stats(uuid[], uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.exam_monitor_answer_stats(uuid[], uuid[]) TO authenticated, service_role;
