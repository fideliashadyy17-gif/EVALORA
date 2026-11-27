-- ============================================================================
-- Platform Control Center — proctoring configuration reaches the RPC fast path
-- ============================================================================
--
-- WHY THIS MIGRATION EXISTS
-- -------------------------
-- `POST /api/exam/integrity` has two implementations of the same rule:
--
--   1. a fast path that delegates everything to the SECURITY DEFINER function
--      `public.record_exam_integrity_event` in ONE round trip, and
--   2. a multi-query fallback used when that function is unavailable.
--
-- The Platform Control Center made the escalation thresholds configurable
-- (`proctoring.max_tab_switch_warnings`, `proctoring.incident_alert_threshold`)
-- per organization, and the fallback path honours them through
-- `integrityPolicyWithConfiguredDefaults(settings.integrity, cfg)`.
--
-- The fast path could not: the function returned the examination's authored
-- `integrity_settings` but never said WHICH ORGANIZATION the attempt belongs
-- to, so the route had no key to resolve that organization's configuration
-- with. In production the fast path is the one that runs, which would have
-- left a saved proctoring setting visible in the dashboard while the code kept
-- using the compiled-in defaults — exactly the failure this programme forbids.
--
-- WHAT CHANGES
-- ------------
-- `record_exam_integrity_event` now also returns `organization_id` on every
-- JSON payload it produces. The route resolves that organization's proctoring
-- configuration (cached in-process for 15 s, so no extra round trip in the
-- common case) and derives the policy with the SAME helper the fallback uses,
-- so both paths now answer identically.
--
-- SAFETY
-- ------
--   • Additive only. Same function name, same ten parameters in the same order
--     and types, same `RETURNS jsonb`, so `CREATE OR REPLACE` applies in place:
--     no DROP, no dependent-object cascade, no re-grant churn, and existing
--     grants are preserved by PostgreSQL.
--   • One extra key in a JSON object cannot break an existing reader; a caller
--     that ignores it behaves exactly as before.
--   • No table, column, index, policy, trigger, role or row is touched. No
--     examination, attempt, candidate, incident or result is read for effect or
--     written here — the body below is the deployed body verbatim plus the new
--     key, so the recorded data is byte-identical.
--   • Behaviour-preserving for every branch: `not_found`, `unavailable`,
--     `already_submitted`, `integrity_disabled`, `event_disabled`, `duplicate`,
--     `capped` and the successful insert all keep their exact semantics.
--   • Deploy order: apply this migration BEFORE the matching API deploy. If the
--     code ships first, `organization_id` is simply absent and the route falls
--     back to platform-level defaults — degraded, never wrong, never fatal.
--
-- The compiled-in defaults inside the function (`v_enabled`, `v_event_enabled`
-- defaulting to true) are deliberately untouched: they mirror
-- `DEFAULT_INTEGRITY_POLICY.enabled` in `src/lib/integrity.ts`, which is NOT a
-- configurable key. Only the two thresholds an administrator can change are
-- configurable, and they are applied in TypeScript where the single source of
-- truth for configuration resolution lives.
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
      'integrity_settings', v_integrity,
      'organization_id', v_ctx.organization_id
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
      'integrity_settings', v_integrity,
      'organization_id', v_ctx.organization_id
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
      'integrity_settings', v_integrity,
      'organization_id', v_ctx.organization_id
    );
  END IF;

  IF v_total_count >= p_max_events THEN
    RETURN jsonb_build_object(
      'ok', true,
      'recorded', false,
      'count', v_violation_count,
      'reason', 'capped',
      'integrity_settings', v_integrity,
      'organization_id', v_ctx.organization_id
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
    'integrity_settings', v_integrity,
    'organization_id', v_ctx.organization_id
  );
END;
$$;

-- Service-role only, exactly as deployed: a candidate reaches this through the
-- API route, never with their own key. Re-asserted because a replaced function
-- keeps its grants and this makes the intended state explicit.
REVOKE ALL ON FUNCTION public.record_exam_integrity_event(uuid, uuid, text, text, text, text, boolean, integer, integer, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_exam_integrity_event(uuid, uuid, text, text, text, text, boolean, integer, integer, timestamptz) TO service_role;

COMMENT ON FUNCTION public.record_exam_integrity_event(uuid, uuid, text, text, text, text, boolean, integer, integer, timestamptz) IS
  'Records one browser-observed integrity event for an attempt in a single call. Returns ok/recorded/count plus the examination''s authored integrity_settings and, since 20261126230000, the attempt''s organization_id so the API can apply that organization''s configured proctoring thresholds. Escalation thresholds are decided in TypeScript (src/lib/proctoringConfig.ts), never here.';
