-- One-time, examination- and candidate-bound proofs from the installed desktop client.
-- No legacy HMAC secrets or public/browser-accessible table policies are used.
CREATE TABLE IF NOT EXISTS public.exam_lockdown_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  exam_code text NOT NULL,
  candidate_binding text NOT NULL CHECK (candidate_binding ~ '^[0-9a-f]{64}$'),
  session_id_hash text NOT NULL CHECK (session_id_hash ~ '^[0-9a-f]{64}$'),
  nonce text NOT NULL UNIQUE,
  public_key_pem text NOT NULL,
  platform text NOT NULL CHECK (platform IN ('win32', 'darwin', 'linux')),
  app_version text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS exam_lockdown_challenges_expiry_idx
  ON public.exam_lockdown_challenges (expires_at);
CREATE INDEX IF NOT EXISTS exam_lockdown_challenges_exam_idx
  ON public.exam_lockdown_challenges (exam_id, created_at DESC);
ALTER TABLE public.exam_lockdown_challenges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.exam_lockdown_challenges FROM anon, authenticated;
GRANT ALL ON public.exam_lockdown_challenges TO service_role;

COMMENT ON TABLE public.exam_lockdown_challenges IS
  'Short-lived one-use native attestation challenges. Public keys are per-installation keys protected at rest by the host OS, not publisher identity certificates.';
