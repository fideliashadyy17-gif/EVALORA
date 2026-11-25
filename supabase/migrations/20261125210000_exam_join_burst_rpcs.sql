-- Start-burst optimization RPCs for high-concurrency examination joins (500-1,000+ simultaneous starts).
-- Additive only — zero destructive schema changes.

-- 1. Single-round-trip lockdown challenge issuance (rate-limit check + optional prune + insert)
CREATE OR REPLACE FUNCTION public.issue_exam_lockdown_challenge(
  p_id uuid,
  p_exam_id uuid,
  p_exam_code text,
  p_candidate_binding text,
  p_session_id_hash text,
  p_nonce text,
  p_public_key_pem text,
  p_platform text,
  p_app_version text,
  p_expires_at timestamptz,
  p_prune boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_recent_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.exam_lockdown_challenges
    WHERE exam_id = p_exam_id
      AND session_id_hash = p_session_id_hash
      AND created_at > (v_now - interval '10 seconds')
  ) INTO v_recent_exists;

  IF v_recent_exists THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'rate_limited');
  END IF;

  IF p_prune THEN
    DELETE FROM public.exam_lockdown_challenges
    WHERE expires_at < (v_now - interval '24 hours');
  END IF;

  INSERT INTO public.exam_lockdown_challenges (
    id,
    exam_id,
    exam_code,
    candidate_binding,
    session_id_hash,
    nonce,
    public_key_pem,
    platform,
    app_version,
    expires_at
  ) VALUES (
    p_id,
    p_exam_id,
    p_exam_code,
    p_candidate_binding,
    p_session_id_hash,
    p_nonce,
    p_public_key_pem,
    p_platform,
    p_app_version,
    p_expires_at
  );

  RETURN jsonb_build_object(
    'ok', true,
    'id', p_id,
    'nonce', p_nonce,
    'expires_at', p_expires_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.issue_exam_lockdown_challenge(uuid, uuid, text, text, text, text, text, text, text, timestamptz, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_exam_lockdown_challenge(uuid, uuid, text, text, text, text, text, text, text, timestamptz, boolean) TO service_role;

-- 2. Combined indexed candidate lookup (browser guest_key_hashes + canonical name_key + student_id)
-- Consolidates two serial exam_candidates queries during shared-link join into one indexed bitmap OR scan.
CREATE OR REPLACE FUNCTION public.find_exam_candidates_for_join_v2(
  p_exam_id uuid,
  p_name_key text,
  p_student_id uuid DEFAULT NULL,
  p_guest_key_hashes text[] DEFAULT NULL
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
      (p_guest_key_hashes IS NOT NULL AND array_length(p_guest_key_hashes, 1) > 0 AND c.guest_key_hash = ANY(p_guest_key_hashes))
      OR (p_name_key IS NOT NULL AND p_name_key <> '' AND c.name_key = p_name_key)
      OR (p_student_id IS NOT NULL AND c.student_id = p_student_id)
    );
$$;

REVOKE ALL ON FUNCTION public.find_exam_candidates_for_join_v2(uuid, text, uuid, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_exam_candidates_for_join_v2(uuid, text, uuid, text[]) TO service_role;
