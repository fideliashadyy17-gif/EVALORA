-- High-concurrency examination performance hardening (additive only — zero destructive changes).
-- Supports 500-1,000+ concurrent candidates on pooled Postgres by adding missing composite/partial
-- indexes and consolidating multi-round-trip hot paths into single-call atomic SQL RPCs.

-- 1. Missing composite & partial indexes on hot exam tables
CREATE INDEX IF NOT EXISTS idx_exam_lockdown_challenges_exam_session_created
  ON public.exam_lockdown_challenges (exam_id, session_id_hash, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_exam_attempts_exam_status_started
  ON public.exam_attempts (exam_id, status, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_exam_messages_attempt_unread_staff
  ON public.exam_messages (attempt_id)
  WHERE (sender_kind = 'staff' AND read_at IS NULL);

CREATE INDEX IF NOT EXISTS idx_proctoring_incidents_exam_attempt
  ON public.proctoring_incidents (exam_id, attempt_id);

-- 2. Indexed candidate lookup for shared-link join duplicate protection
-- Replaces full exam_candidates scans per exam during concurrent join bursts.
CREATE OR REPLACE FUNCTION public.find_exam_candidates_for_join(
  p_exam_id uuid,
  p_name_key text,
  p_student_id uuid DEFAULT NULL
)
RETURNS SETOF public.exam_candidates
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.*
  FROM public.exam_candidates c
  WHERE c.exam_id = p_exam_id
    AND (
      (p_name_key IS NOT NULL AND p_name_key <> '' AND c.name_key = p_name_key)
      OR (p_student_id IS NOT NULL AND c.student_id = p_student_id)
    );
$$;

REVOKE ALL ON FUNCTION public.find_exam_candidates_for_join(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_exam_candidates_for_join(uuid, text, uuid) TO service_role;

-- 3. Single-round-trip atomic answer save RPC (fast path for normal in_progress saves).
-- Consolidates attempt lookup, exam lookup, deadline check, quiz_question validation,
-- exam_answers upsert, and optional flagged update from 5-6 serial queries into 1 call.
-- Pause/recovery/expired paths signal 'fallback_needed' so the route executes full recovery logic.
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

  -- Enforce per-attempt question_order membership (exact mirror of attemptAllowsQuizRow).
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
  RETURNING updated_at INTO v_saved_at;

  IF p_flagged IS NOT NULL THEN
    UPDATE public.exam_attempts
    SET flagged = p_flagged
    WHERE id = v_attempt.id
      AND status = 'in_progress';
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

-- 4. Atomic batch grading update RPC (replaces up to 34 serial UPDATEs per submission).
CREATE OR REPLACE FUNCTION public.apply_graded_exam_answers(p_updates jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expected integer;
  v_updated integer;
BEGIN
  IF p_updates IS NULL OR jsonb_typeof(p_updates) <> 'array' THEN
    RETURN 0;
  END IF;

  v_expected := jsonb_array_length(p_updates);
  IF v_expected = 0 THEN
    RETURN 0;
  END IF;

  UPDATE public.exam_answers a
  SET
    is_correct = u.is_correct,
    points_awarded = u.points_awarded,
    grading_status = u.grading_status,
    grading_note = u.grading_note
  FROM jsonb_to_recordset(p_updates) AS u(
    id uuid,
    is_correct boolean,
    points_awarded numeric,
    grading_status text,
    grading_note text
  )
  WHERE a.id = u.id
    AND a.marked_by IS NULL;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated <> v_expected THEN
    RAISE EXCEPTION 'Could not persist examination grading (% of % rows updated).', v_updated, v_expected;
  END IF;

  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_graded_exam_answers(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_graded_exam_answers(jsonb) TO service_role;

-- 5. Single-round-trip heartbeat / leave RPC for POST /api/exam/presence.
-- Consolidates attempt lookup, exam lookup, deadline check, and exam_presence upsert
-- into 1 call. Connection-pause recovery and `restored` credit events fall back to TS.
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
    updated_at = EXCLUDED.updated_at;

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

-- 6. SQL-side JSONB answer content check + RLS-preserving monitor aggregation RPC.
-- Replaces transferring up to 34,000 raw JSONB answer payloads during teacher live monitoring.
CREATE OR REPLACE FUNCTION public.exam_jsonb_has_content(val jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN val IS NULL THEN false
    WHEN jsonb_typeof(val) = 'null' THEN false
    WHEN jsonb_typeof(val) = 'string' THEN btrim(val #>> '{}') <> ''
    WHEN jsonb_typeof(val) IN ('number', 'boolean') THEN true
    WHEN jsonb_typeof(val) = 'array' THEN EXISTS (
      SELECT 1 FROM jsonb_array_elements(val) elem WHERE public.exam_jsonb_has_content(elem)
    )
    WHEN jsonb_typeof(val) = 'object' THEN EXISTS (
      SELECT 1 FROM jsonb_each(val) kv WHERE public.exam_jsonb_has_content(kv.value)
    )
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.exam_monitor_answer_stats(
  p_attempt_ids uuid[],
  p_paper_quiz_question_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  attempt_id uuid,
  answered integer,
  correct integer,
  incorrect integer,
  awaiting_grading integer,
  marked integer
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
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
    JOIN public.exam_attempts ea ON ea.id = a.attempt_id
    WHERE a.attempt_id = ANY(p_attempt_ids)
      AND a.quiz_question_id IS NOT NULL
      AND (
        CASE
          WHEN ea.question_order IS NOT NULL
               AND jsonb_typeof(ea.question_order) = 'array'
               AND jsonb_array_length(ea.question_order) > 0
            THEN EXISTS (
              SELECT 1
              FROM jsonb_array_elements_text(ea.question_order) elem(val)
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

GRANT EXECUTE ON FUNCTION public.exam_jsonb_has_content(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.exam_monitor_answer_stats(uuid[], uuid[]) TO authenticated, service_role;
