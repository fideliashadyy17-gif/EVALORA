-- Examination Disk I/O, WAL Write-Amplification, and RLS Hot-Path Hardening
-- Strictly non-destructive: zero table/column drops, zero data deletions or mutations.
--
-- Targets the exact production bottlenecks observed under Supabase Micro compute:
--   1. Enable PostgreSQL HOT updates on public.exam_presence (fillfactor=70 + drop redundant
--      mutable-column index exam_presence_exam_seen; exam_presence_exam (exam_id) covers all
--      exam lookups) and remove exam_presence from supabase_realtime publication so 20s student
--      heartbeats stop driving wal2json decoding & per-teacher Realtime RLS storms.
--   2. Harden save_exam_answer_fast to skip no-op exam_answers rewrites and skip unchanged
--      exam_attempts.flagged updates (~98% of answer saves never change flags).
--   3. Guard record_exam_heartbeat against rapid (<8s) identical duplicate writes while
--      preserving normal 20s heartbeat freshness and offline detection.
--   4. Collapse POST /api/exam/integrity from 7 sequential queries into 1 atomic RPC
--      (record_exam_integrity_event).
--   5. Add RLS-preserving SQL aggregation RPC exam_monitor_incident_counts so teacher monitor
--      refreshes transfer grouped counts instead of up to 10,000 raw incident rows.
--   6. Convert per-row RLS functions (org_has_feature, founder_can_read, org_role) on the 9
--      hottest exam/monitoring/bank tables into statement-level InitPlan set-returning helpers
--      while preserving 100% identical RBAC, entitlement, and founder privacy semantics.

-- ============================================================================
-- 1. exam_presence HOT updates & Realtime WAL-decoding relief
-- ============================================================================
ALTER TABLE public.exam_presence SET (fillfactor = 70);

-- exam_presence_exam (exam_id) already serves all WHERE exam_id = $1 lookups.
-- Indexing the constantly mutated last_seen_at column blocked ~88% of HOT updates.
DROP INDEX IF EXISTS public.exam_presence_exam_seen;

-- ExamMonitor reconciles presence every 15s and keeps Realtime on exam_pause_events
-- and exam_messages; removing exam_presence stops wal2json decoding on every heartbeat.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'exam_presence'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.exam_presence;
  END IF;
END $$;

-- ============================================================================
-- 2. Harden save_exam_answer_fast against no-op writes & redundant flagged WAL
-- ============================================================================
CREATE OR REPLACE FUNCTION public.save_exam_answer_fast(
  p_attempt_id uuid,
  p_access_token uuid,
  p_question_id uuid,
  p_quiz_question_id uuid,
  p_answer jsonb,
  p_flagged jsonb DEFAULT NULL,
  p_now timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempt record;
  v_exam record;
  v_qq record;
  v_ext_mins integer;
  v_by_duration timestamptz;
  v_by_window timestamptz;
  v_deadline timestamptz;
  v_saved_at timestamptz;
BEGIN
  SELECT
    a.id,
    a.exam_id,
    a.status,
    a.started_at,
    a.extension_minutes,
    a.question_order,
    a.track,
    a.pause_reasons,
    a.paused_at,
    a.flagged
  INTO v_attempt
  FROM public.exam_attempts a
  WHERE a.id = p_attempt_id
    AND a.access_token = p_access_token;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;

  SELECT
    e.id,
    e.quiz_id,
    e.duration_minutes,
    e.ends_at
  INTO v_exam
  FROM public.exams e
  WHERE e.id = v_attempt.exam_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;

  -- Any non-in_progress status or open pause falls back to full TS pause/recovery handler.
  IF v_attempt.status <> 'in_progress'
     OR v_attempt.paused_at IS NOT NULL
     OR COALESCE(array_length(v_attempt.pause_reasons, 1), 0) > 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'fallback_needed');
  END IF;

  -- Exact mirror of src/lib/examDeadline.ts attemptDeadlineInstant
  v_ext_mins := LEAST(1440, GREATEST(0, COALESCE(v_attempt.extension_minutes, 0)));
  v_by_duration := CASE
    WHEN v_attempt.started_at IS NOT NULL AND v_exam.duration_minutes IS NOT NULL AND v_exam.duration_minutes > 0
      THEN v_attempt.started_at + make_interval(mins => v_exam.duration_minutes + v_ext_mins)
    ELSE NULL
  END;
  v_by_window := CASE
    WHEN v_exam.ends_at IS NOT NULL
      THEN v_exam.ends_at + make_interval(mins => v_ext_mins)
    ELSE NULL
  END;
  v_deadline := CASE
    WHEN v_by_duration IS NOT NULL AND v_by_window IS NOT NULL THEN LEAST(v_by_duration, v_by_window)
    ELSE COALESCE(v_by_duration, v_by_window)
  END;

  IF v_deadline IS NOT NULL AND p_now > v_deadline THEN
    RETURN jsonb_build_object('ok', false, 'code', 'fallback_needed');
  END IF;

  SELECT qq.id, q.type AS question_type
  INTO v_qq
  FROM public.quiz_questions qq
  JOIN public.questions q ON q.id = qq.question_id
  WHERE qq.quiz_id = v_exam.quiz_id
    AND qq.question_id = p_question_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'question_not_in_paper');
  END IF;

  IF p_quiz_question_id IS NOT NULL AND p_quiz_question_id <> v_qq.id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'quiz_question_mismatch');
  END IF;

  IF (
    (v_attempt.track IN ('AB', 'BC'))
    OR (
      v_attempt.question_order IS NOT NULL
      AND jsonb_typeof(v_attempt.question_order) = 'array'
      AND jsonb_array_length(v_attempt.question_order) > 0
    )
  ) AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(
      CASE
        WHEN v_attempt.question_order IS NOT NULL AND jsonb_typeof(v_attempt.question_order) = 'array'
          THEN v_attempt.question_order
        ELSE '[]'::jsonb
      END
    ) AS elem(val)
    WHERE elem.val = v_qq.id::text
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'question_not_in_candidate_paper');
  END IF;

  -- Skip no-op heap updates when the exact same answer payload is re-sent.
  INSERT INTO public.exam_answers (
    attempt_id,
    question_id,
    quiz_question_id,
    answer,
    updated_at
  )
  VALUES (
    v_attempt.id,
    p_question_id,
    v_qq.id,
    p_answer,
    p_now
  )
  ON CONFLICT (attempt_id, question_id)
  DO UPDATE SET
    quiz_question_id = EXCLUDED.quiz_question_id,
    answer = EXCLUDED.answer,
    updated_at = EXCLUDED.updated_at
  WHERE public.exam_answers.answer IS DISTINCT FROM EXCLUDED.answer
     OR public.exam_answers.quiz_question_id IS DISTINCT FROM EXCLUDED.quiz_question_id
  RETURNING updated_at INTO v_saved_at;

  IF v_saved_at IS NULL THEN
    SELECT ea.updated_at
    INTO v_saved_at
    FROM public.exam_answers ea
    WHERE ea.attempt_id = v_attempt.id
      AND ea.question_id = p_question_id;
    v_saved_at := COALESCE(v_saved_at, p_now);
  END IF;

  -- Only update exam_attempts when flagged actually changed (eliminates ~98% of flagged WAL).
  IF p_flagged IS NOT NULL AND v_attempt.flagged IS DISTINCT FROM p_flagged THEN
    UPDATE public.exam_attempts
    SET flagged = p_flagged
    WHERE id = v_attempt.id
      AND status = 'in_progress'
      AND flagged IS DISTINCT FROM p_flagged;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'saved_at', v_saved_at,
    'quiz_question_id', v_qq.id,
    'question_type', v_qq.question_type
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_exam_answer_fast(uuid, uuid, uuid, uuid, jsonb, jsonb, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_exam_answer_fast(uuid, uuid, uuid, uuid, jsonb, jsonb, timestamptz) TO service_role;

-- ============================================================================
-- 3. Guard record_exam_heartbeat against duplicate rapid (<8s) writes
-- ============================================================================
CREATE OR REPLACE FUNCTION public.record_exam_heartbeat(
  p_attempt_id uuid,
  p_access_token uuid,
  p_event text DEFAULT 'heartbeat',
  p_current_question integer DEFAULT NULL,
  p_total_questions integer DEFAULT NULL,
  p_saved_count integer DEFAULT NULL,
  p_pending_saves integer DEFAULT NULL,
  p_now timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempt record;
  v_exam record;
  v_ext_mins integer;
  v_pause_ms bigint := 0;
  v_by_duration timestamptz;
  v_by_window timestamptz;
  v_deadline timestamptz;
  v_has_connection_pause boolean;
  v_is_manually_paused boolean;
  v_seen_at timestamptz;
BEGIN
  IF p_event = 'restored' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'fallback_needed');
  END IF;

  SELECT
    a.id,
    a.exam_id,
    a.status,
    a.started_at,
    a.extension_minutes,
    a.pause_reasons,
    a.paused_at
  INTO v_attempt
  FROM public.exam_attempts a
  WHERE a.id = p_attempt_id
    AND a.access_token = p_access_token;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;

  SELECT
    e.id,
    e.organization_id,
    e.duration_minutes,
    e.ends_at
  INTO v_exam
  FROM public.exams e
  WHERE e.id = v_attempt.exam_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;

  v_has_connection_pause := (v_attempt.pause_reasons IS NOT NULL AND 'connection' = ANY(v_attempt.pause_reasons));
  v_is_manually_paused := (
    v_attempt.pause_reasons IS NOT NULL
    AND ('assessment' = ANY(v_attempt.pause_reasons) OR 'student' = ANY(v_attempt.pause_reasons))
  );

  IF v_attempt.status <> 'in_progress' OR v_has_connection_pause THEN
    RETURN jsonb_build_object('ok', false, 'code', 'fallback_needed');
  END IF;

  IF v_is_manually_paused AND v_attempt.paused_at IS NOT NULL THEN
    v_pause_ms := GREATEST(0, floor(extract(epoch FROM (p_now - v_attempt.paused_at)) * 1000)::bigint);
  END IF;

  v_ext_mins := LEAST(1440, GREATEST(0, COALESCE(v_attempt.extension_minutes, 0)));
  v_by_duration := CASE
    WHEN v_attempt.started_at IS NOT NULL AND v_exam.duration_minutes IS NOT NULL AND v_exam.duration_minutes > 0
      THEN v_attempt.started_at + make_interval(mins => v_exam.duration_minutes + v_ext_mins) + (v_pause_ms * interval '1 millisecond')
    ELSE NULL
  END;
  v_by_window := CASE
    WHEN v_exam.ends_at IS NOT NULL
      THEN v_exam.ends_at + make_interval(mins => v_ext_mins) + (v_pause_ms * interval '1 millisecond')
    ELSE NULL
  END;
  v_deadline := CASE
    WHEN v_by_duration IS NOT NULL AND v_by_window IS NOT NULL THEN LEAST(v_by_duration, v_by_window)
    ELSE COALESCE(v_by_duration, v_by_window)
  END;

  IF v_deadline IS NOT NULL AND p_now > v_deadline THEN
    RETURN jsonb_build_object('ok', false, 'code', 'fallback_needed');
  END IF;

  v_seen_at := CASE
    WHEN p_event = 'leave' THEN p_now - interval '60 seconds'
    ELSE p_now
  END;

  -- Skip duplicate rapid (<8s) identical heartbeats to avoid unnecessary WAL writes;
  -- normal 20s heartbeats and all state/progress changes always persist.
  INSERT INTO public.exam_presence (
    attempt_id,
    exam_id,
    organization_id,
    last_seen_at,
    current_question,
    total_questions,
    saved_count,
    pending_saves,
    unconfirmed_lost_at,
    updated_at
  )
  VALUES (
    v_attempt.id,
    v_attempt.exam_id,
    v_exam.organization_id,
    v_seen_at,
    p_current_question,
    p_total_questions,
    COALESCE(p_saved_count, 0),
    COALESCE(p_pending_saves, 0),
    NULL,
    p_now
  )
  ON CONFLICT (attempt_id)
  DO UPDATE SET
    exam_id = EXCLUDED.exam_id,
    organization_id = EXCLUDED.organization_id,
    last_seen_at = EXCLUDED.last_seen_at,
    current_question = COALESCE(p_current_question, public.exam_presence.current_question),
    total_questions = COALESCE(p_total_questions, public.exam_presence.total_questions),
    saved_count = COALESCE(p_saved_count, public.exam_presence.saved_count),
    pending_saves = COALESCE(p_pending_saves, public.exam_presence.pending_saves),
    unconfirmed_lost_at = CASE
      WHEN p_event = 'leave' THEN public.exam_presence.unconfirmed_lost_at
      ELSE NULL
    END,
    updated_at = EXCLUDED.updated_at
  WHERE p_event = 'leave'
     OR public.exam_presence.unconfirmed_lost_at IS NOT NULL
     OR public.exam_presence.last_seen_at <= (p_now - interval '8 seconds')
     OR public.exam_presence.current_question IS DISTINCT FROM COALESCE(p_current_question, public.exam_presence.current_question)
     OR public.exam_presence.total_questions IS DISTINCT FROM COALESCE(p_total_questions, public.exam_presence.total_questions)
     OR public.exam_presence.saved_count IS DISTINCT FROM COALESCE(p_saved_count, public.exam_presence.saved_count)
     OR public.exam_presence.pending_saves IS DISTINCT FROM COALESCE(p_pending_saves, public.exam_presence.pending_saves);

  RETURN jsonb_build_object(
    'ok', true,
    'server_now', p_now,
    'deadline', v_deadline,
    'paused', v_is_manually_paused,
    'pause_reasons', COALESCE(v_attempt.pause_reasons, ARRAY[]::text[]),
    'paused_at', v_attempt.paused_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_exam_heartbeat(uuid, uuid, text, integer, integer, integer, integer, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_exam_heartbeat(uuid, uuid, text, integer, integer, integer, integer, timestamptz) TO service_role;

-- ============================================================================
-- 4. Single-RPC integrity event recorder (7 sequential queries -> 1 call)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.record_exam_integrity_event(
  p_attempt_id uuid,
  p_access_token uuid,
  p_event text,
  p_type text,
  p_severity text,
  p_note text DEFAULT NULL,
  p_is_violation boolean DEFAULT true,
  p_dedupe_ms integer DEFAULT 2000,
  p_max_events integer DEFAULT 300,
  p_now timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ctx record;
  v_integrity jsonb;
  v_enabled boolean := true;
  v_event_enabled boolean := true;
  v_total_count integer := 0;
  v_violation_count integer := 0;
  v_last_same_at timestamptz;
BEGIN
  SELECT
    a.id AS attempt_id,
    a.status AS attempt_status,
    e.id AS exam_id,
    e.organization_id AS organization_id,
    e.settings AS exam_settings,
    c.id AS candidate_id
  INTO v_ctx
  FROM public.exam_attempts a
  LEFT JOIN public.exams e ON e.id = a.exam_id
  LEFT JOIN public.exam_candidates c ON c.id = a.candidate_id
  WHERE a.id = p_attempt_id
    AND a.access_token = p_access_token;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;

  IF v_ctx.exam_id IS NULL OR v_ctx.candidate_id IS NULL OR v_ctx.organization_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'unavailable');
  END IF;

  v_integrity := CASE
    WHEN v_ctx.exam_settings IS NOT NULL
         AND jsonb_typeof(v_ctx.exam_settings -> 'integrity') = 'object'
      THEN v_ctx.exam_settings -> 'integrity'
    ELSE '{}'::jsonb
  END;

  v_enabled := CASE
    WHEN jsonb_typeof(v_integrity -> 'enabled') = 'boolean'
      THEN (v_integrity ->> 'enabled')::boolean
    ELSE true
  END;

  IF NOT v_enabled THEN
    RETURN jsonb_build_object(
      'ok', true,
      'recorded', false,
      'count', 0,
      'reason', 'integrity_disabled',
      'integrity_settings', v_integrity
    );
  END IF;

  v_event_enabled := CASE p_event
    WHEN 'tab_hidden' THEN CASE WHEN jsonb_typeof(v_integrity -> 'tabSwitch') = 'boolean' THEN (v_integrity ->> 'tabSwitch')::boolean ELSE true END
    WHEN 'focus_lost' THEN CASE WHEN jsonb_typeof(v_integrity -> 'focusLoss') = 'boolean' THEN (v_integrity ->> 'focusLoss')::boolean ELSE true END
    WHEN 'fullscreen_exit' THEN CASE WHEN jsonb_typeof(v_integrity -> 'fullscreen') = 'boolean' THEN (v_integrity ->> 'fullscreen')::boolean ELSE true END
    WHEN 'copy' THEN CASE WHEN jsonb_typeof(v_integrity -> 'clipboard') = 'boolean' THEN (v_integrity ->> 'clipboard')::boolean ELSE true END
    WHEN 'paste' THEN CASE WHEN jsonb_typeof(v_integrity -> 'clipboard') = 'boolean' THEN (v_integrity ->> 'clipboard')::boolean ELSE true END
    WHEN 'cut' THEN CASE WHEN jsonb_typeof(v_integrity -> 'clipboard') = 'boolean' THEN (v_integrity ->> 'clipboard')::boolean ELSE true END
    WHEN 'context_menu' THEN CASE WHEN jsonb_typeof(v_integrity -> 'clipboard') = 'boolean' THEN (v_integrity ->> 'clipboard')::boolean ELSE true END
    ELSE true
  END;

  IF NOT v_event_enabled THEN
    RETURN jsonb_build_object(
      'ok', true,
      'recorded', false,
      'count', 0,
      'reason', 'event_disabled',
      'integrity_settings', v_integrity
    );
  END IF;

  IF v_ctx.attempt_status <> 'in_progress' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'already_submitted');
  END IF;

  -- Single index scan on idx_proctoring_incidents_attempt_id replaces 3 separate queries.
  SELECT
    COUNT(*) FILTER (WHERE pi.type LIKE 'integrity_%')::integer,
    COUNT(*) FILTER (
      WHERE pi.type LIKE 'integrity_%'
        AND pi.type NOT IN ('integrity_tab_visible', 'integrity_focus_back', 'integrity_online')
    )::integer,
    MAX(pi.created_at) FILTER (WHERE pi.type = p_type)
  INTO v_total_count, v_violation_count, v_last_same_at
  FROM public.proctoring_incidents pi
  WHERE pi.attempt_id = v_ctx.attempt_id;

  IF v_last_same_at IS NOT NULL
     AND (extract(epoch FROM (p_now - v_last_same_at)) * 1000.0) < p_dedupe_ms THEN
    RETURN jsonb_build_object(
      'ok', true,
      'recorded', false,
      'count', v_violation_count,
      'reason', 'duplicate',
      'integrity_settings', v_integrity
    );
  END IF;

  IF v_total_count >= p_max_events THEN
    RETURN jsonb_build_object(
      'ok', true,
      'recorded', false,
      'count', v_violation_count,
      'reason', 'capped',
      'integrity_settings', v_integrity
    );
  END IF;

  INSERT INTO public.proctoring_incidents (
    organization_id,
    exam_id,
    candidate_id,
    attempt_id,
    type,
    severity,
    note,
    status
  ) VALUES (
    v_ctx.organization_id,
    v_ctx.exam_id,
    v_ctx.candidate_id,
    v_ctx.attempt_id,
    p_type,
    p_severity,
    p_note,
    'open'
  );

  IF p_is_violation THEN
    v_violation_count := v_violation_count + 1;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'recorded', true,
    'count', v_violation_count,
    'integrity_settings', v_integrity
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_exam_integrity_event(uuid, uuid, text, text, text, text, boolean, integer, integer, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_exam_integrity_event(uuid, uuid, text, text, text, text, boolean, integer, integer, timestamptz) TO service_role;

-- ============================================================================
-- 5. RLS-preserving SQL aggregation for monitor incident counts
-- ============================================================================
CREATE OR REPLACE FUNCTION public.exam_monitor_incident_counts(p_exam_id uuid)
RETURNS TABLE(attempt_id uuid, incident_count integer)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    pi.attempt_id,
    COUNT(*)::integer AS incident_count
  FROM public.proctoring_incidents pi
  WHERE pi.exam_id = p_exam_id
    AND pi.attempt_id IS NOT NULL
  GROUP BY pi.attempt_id;
$$;

REVOKE ALL ON FUNCTION public.exam_monitor_incident_counts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.exam_monitor_incident_counts(uuid) TO authenticated, service_role;

-- ============================================================================
-- 6. Statement-level InitPlan RLS helpers (100% identical RBAC/entitlement rules)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.entitled_org_ids(p_feature text)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id
  FROM public.organizations o
  WHERE o.status = 'active'
    AND public.org_has_feature(o.id, p_feature);
$$;

CREATE OR REPLACE FUNCTION public.founder_readable_org_ids(p_permission text)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT o.id
  FROM public.organizations o
  WHERE public.access_is_founder()
    AND public.access_has_permission(auth.uid(), o.id, p_permission);
$$;

CREATE OR REPLACE FUNCTION public.org_ids_with_roles(p_roles text[])
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.organization_id
  FROM public.organization_members m
  JOIN public.profiles p
    ON p.id = m.user_id
   AND p.status = 'active'
  WHERE m.user_id = (SELECT auth.uid())
    AND m.status = 'active'
    AND m.role = ANY(p_roles);
$$;

GRANT EXECUTE ON FUNCTION public.entitled_org_ids(text) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.founder_readable_org_ids(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.org_ids_with_roles(text[]) TO authenticated, service_role;

-- Apply InitPlan expressions to the 9 hottest exam/monitoring/bank tables.
-- Every expression preserves exact permissive/restrictive RBAC & entitlement semantics.
DO $$
BEGIN
  -- exam_answers
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exam_answers' AND policyname='entitlement_exam_answers') THEN
    ALTER POLICY entitlement_exam_answers ON public.exam_answers
      USING (
        (SELECT public.is_super_admin())
        OR EXISTS (
          SELECT 1 FROM public.exam_attempts a
          JOIN public.exams e ON e.id = a.exam_id
          WHERE a.id = exam_answers.attempt_id
            AND e.organization_id IN (SELECT public.entitled_org_ids('examinations'))
        )
      )
      WITH CHECK (
        (SELECT public.is_super_admin())
        OR EXISTS (
          SELECT 1 FROM public.exam_attempts a
          JOIN public.exams e ON e.id = a.exam_id
          WHERE a.id = exam_answers.attempt_id
            AND e.organization_id IN (SELECT public.entitled_org_ids('examinations'))
        )
      );
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exam_answers' AND policyname='access_founder_read') THEN
    ALTER POLICY access_founder_read ON public.exam_answers
      USING (
        (SELECT public.access_is_founder())
        AND EXISTS (
          SELECT 1 FROM public.exam_attempts a
          JOIN public.exams e ON e.id = a.exam_id
          WHERE a.id = exam_answers.attempt_id
            AND e.organization_id IN (SELECT public.founder_readable_org_ids('grading.view'))
        )
      );
  END IF;

  -- exam_attempts
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exam_attempts' AND policyname='entitlement_exam_attempts') THEN
    ALTER POLICY entitlement_exam_attempts ON public.exam_attempts
      USING (
        (SELECT public.is_super_admin())
        OR EXISTS (
          SELECT 1 FROM public.exams e
          WHERE e.id = exam_attempts.exam_id
            AND e.organization_id IN (SELECT public.entitled_org_ids('examinations'))
        )
      )
      WITH CHECK (
        (SELECT public.is_super_admin())
        OR EXISTS (
          SELECT 1 FROM public.exams e
          WHERE e.id = exam_attempts.exam_id
            AND e.organization_id IN (SELECT public.entitled_org_ids('examinations'))
        )
      );
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exam_attempts' AND policyname='access_founder_read') THEN
    ALTER POLICY access_founder_read ON public.exam_attempts
      USING (
        (SELECT public.access_is_founder())
        AND EXISTS (
          SELECT 1 FROM public.exams e
          WHERE e.id = exam_attempts.exam_id
            AND e.organization_id IN (SELECT public.founder_readable_org_ids('results.view'))
        )
      );
  END IF;

  -- exam_candidates
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exam_candidates' AND policyname='entitlement_exam_candidates') THEN
    ALTER POLICY entitlement_exam_candidates ON public.exam_candidates
      USING (
        (SELECT public.is_super_admin())
        OR EXISTS (
          SELECT 1 FROM public.exams e
          WHERE e.id = exam_candidates.exam_id
            AND e.organization_id IN (SELECT public.entitled_org_ids('examinations'))
        )
      )
      WITH CHECK (
        (SELECT public.is_super_admin())
        OR EXISTS (
          SELECT 1 FROM public.exams e
          WHERE e.id = exam_candidates.exam_id
            AND e.organization_id IN (SELECT public.entitled_org_ids('examinations'))
        )
      );
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exam_candidates' AND policyname='access_founder_read') THEN
    ALTER POLICY access_founder_read ON public.exam_candidates
      USING (
        (SELECT public.access_is_founder())
        AND EXISTS (
          SELECT 1 FROM public.exams e
          WHERE e.id = exam_candidates.exam_id
            AND e.organization_id IN (SELECT public.founder_readable_org_ids('candidate_links.view'))
        )
      );
  END IF;

  -- exam_messages
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exam_messages' AND policyname='entitlement_exam_messages') THEN
    ALTER POLICY entitlement_exam_messages ON public.exam_messages
      USING (
        (SELECT public.is_super_admin())
        OR organization_id IN (SELECT public.entitled_org_ids('examinations'))
      )
      WITH CHECK (
        (SELECT public.is_super_admin())
        OR organization_id IN (SELECT public.entitled_org_ids('examinations'))
      );
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exam_messages' AND policyname='access_founder_read') THEN
    ALTER POLICY access_founder_read ON public.exam_messages
      USING (
        (SELECT public.access_is_founder())
        AND organization_id IN (SELECT public.founder_readable_org_ids('exams.monitor'))
      );
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exam_messages' AND policyname='exam_messages_staff_select') THEN
    ALTER POLICY exam_messages_staff_select ON public.exam_messages
      USING (
        (SELECT public.is_super_admin())
        OR organization_id IN (SELECT public.org_ids_with_roles(ARRAY['owner','admin','teacher','organizer','corrector','supervisor']))
      );
  END IF;

  -- exam_presence
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exam_presence' AND policyname='entitlement_exam_presence') THEN
    ALTER POLICY entitlement_exam_presence ON public.exam_presence
      USING (
        (SELECT public.is_super_admin())
        OR organization_id IN (SELECT public.entitled_org_ids('examinations'))
      )
      WITH CHECK (
        (SELECT public.is_super_admin())
        OR organization_id IN (SELECT public.entitled_org_ids('examinations'))
      );
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exam_presence' AND policyname='access_founder_read') THEN
    ALTER POLICY access_founder_read ON public.exam_presence
      USING (
        (SELECT public.access_is_founder())
        AND organization_id IN (SELECT public.founder_readable_org_ids('exams.monitor'))
      );
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exam_presence' AND policyname='exam_presence_staff_select') THEN
    ALTER POLICY exam_presence_staff_select ON public.exam_presence
      USING (
        (SELECT public.is_super_admin())
        OR organization_id IN (SELECT public.org_ids_with_roles(ARRAY['owner','admin','teacher','organizer','corrector','supervisor']))
      );
  END IF;

  -- proctoring_incidents
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='proctoring_incidents' AND policyname='entitlement_proctoring_incidents') THEN
    ALTER POLICY entitlement_proctoring_incidents ON public.proctoring_incidents
      USING (
        (SELECT public.is_super_admin())
        OR organization_id IN (SELECT public.entitled_org_ids('proctoring'))
      )
      WITH CHECK (
        (SELECT public.is_super_admin())
        OR organization_id IN (SELECT public.entitled_org_ids('proctoring'))
      );
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='proctoring_incidents' AND policyname='access_founder_read') THEN
    ALTER POLICY access_founder_read ON public.proctoring_incidents
      USING (
        (SELECT public.access_is_founder())
        AND organization_id IN (SELECT public.founder_readable_org_ids('proctoring.view'))
      );
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='proctoring_incidents' AND policyname='pi_select') THEN
    ALTER POLICY pi_select ON public.proctoring_incidents
      USING (
        (SELECT public.is_super_admin())
        OR organization_id IN (SELECT public.org_ids_with_roles(ARRAY['owner','admin','teacher','supervisor','corrector']))
        OR (
          session_id IS NOT NULL
          AND (
            organization_id IN (SELECT public.org_ids_with_roles(ARRAY['organizer']))
            OR EXISTS (
              SELECT 1 FROM public.quiz_sessions s
              WHERE s.id = proctoring_incidents.session_id
                AND s.host_id = (SELECT auth.uid())
            )
          )
        )
      );
  END IF;

  -- questions
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='questions' AND policyname='entitlement_questions_select') THEN
    ALTER POLICY entitlement_questions_select ON public.questions
      USING (
        (SELECT public.is_super_admin())
        OR organization_id IN (SELECT public.entitled_org_ids('question_bank'))
      );
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='questions' AND policyname='entitlement_questions_write') THEN
    ALTER POLICY entitlement_questions_write ON public.questions
      USING (
        (SELECT public.is_super_admin())
        OR organization_id IN (SELECT public.entitled_org_ids('question_bank'))
      )
      WITH CHECK (
        (SELECT public.is_super_admin())
        OR organization_id IN (SELECT public.entitled_org_ids('question_bank'))
      );
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='questions' AND policyname='access_founder_read') THEN
    ALTER POLICY access_founder_read ON public.questions
      USING (
        (SELECT public.access_is_founder())
        AND organization_id IN (SELECT public.founder_readable_org_ids('questions.view'))
      );
  END IF;

  -- quiz_questions
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='quiz_questions' AND policyname='entitlement_quiz_questions') THEN
    ALTER POLICY entitlement_quiz_questions ON public.quiz_questions
      USING (
        (SELECT public.is_super_admin())
        OR EXISTS (
          SELECT 1 FROM public.quizzes q
          WHERE q.id = quiz_questions.quiz_id
            AND q.organization_id IN (SELECT public.entitled_org_ids('quiz_management'))
        )
      )
      WITH CHECK (
        (SELECT public.is_super_admin())
        OR EXISTS (
          SELECT 1 FROM public.quizzes q
          WHERE q.id = quiz_questions.quiz_id
            AND q.organization_id IN (SELECT public.entitled_org_ids('quiz_management'))
        )
      );
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='quiz_questions' AND policyname='access_founder_read') THEN
    ALTER POLICY access_founder_read ON public.quiz_questions
      USING (
        (SELECT public.access_is_founder())
        AND EXISTS (
          SELECT 1 FROM public.quizzes q
          WHERE q.id = quiz_questions.quiz_id
            AND q.organization_id IN (SELECT public.founder_readable_org_ids('quizzes.view'))
        )
      );
  END IF;

  -- quizzes
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='quizzes' AND policyname='entitlement_quizzes') THEN
    ALTER POLICY entitlement_quizzes ON public.quizzes
      USING (
        (SELECT public.is_super_admin())
        OR organization_id IN (SELECT public.entitled_org_ids('quiz_management'))
      )
      WITH CHECK (
        (SELECT public.is_super_admin())
        OR organization_id IN (SELECT public.entitled_org_ids('quiz_management'))
      );
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='quizzes' AND policyname='access_founder_read') THEN
    ALTER POLICY access_founder_read ON public.quizzes
      USING (
        (SELECT public.access_is_founder())
        AND organization_id IN (SELECT public.founder_readable_org_ids('quizzes.view'))
      );
  END IF;
END $$;
