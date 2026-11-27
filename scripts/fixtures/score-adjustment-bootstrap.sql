-- Synthetic PGlite bootstrap for score-adjustment verification.
-- Creates only the minimal tables/roles the real migration
-- (20261125230000_score_adjustments.sql) depends on, plus an RBAC helper that
-- mirrors production `access_has_permission`. No production data is touched:
-- this file is executed against an in-memory PGlite instance in tests only.
DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
    END $$;

    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;

    CREATE TABLE public.organizations (
      id uuid PRIMARY KEY,
      name text NOT NULL
    );
    CREATE TABLE public.plans (
      id uuid PRIMARY KEY,
      slug text NOT NULL,
      name text NOT NULL,
      limits jsonb NOT NULL DEFAULT '{}'::jsonb
    );
    CREATE TABLE public.subscriptions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id uuid NOT NULL REFERENCES public.organizations(id),
      plan_id uuid NOT NULL REFERENCES public.plans(id),
      status text NOT NULL,
      current_period_end timestamptz,
      trial_ends_at timestamptz,
      limits_override jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE public.profiles (
      id uuid PRIMARY KEY,
      email text NOT NULL,
      platform_role text NOT NULL DEFAULT 'user',
      status text NOT NULL DEFAULT 'active'
    );
    CREATE TABLE public.organization_members (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id uuid NOT NULL REFERENCES public.organizations(id),
      user_id uuid NOT NULL REFERENCES public.profiles(id),
      role text NOT NULL,
      status text NOT NULL DEFAULT 'active'
    );
    CREATE TABLE public.students (
      id uuid PRIMARY KEY
    );
    CREATE TABLE public.exams (
      id uuid PRIMARY KEY,
      organization_id uuid NOT NULL REFERENCES public.organizations(id),
      title text NOT NULL,
      status text NOT NULL DEFAULT 'closed',
      settings jsonb NOT NULL DEFAULT '{}'::jsonb,
      grades_published_at timestamptz,
      deleted_at timestamptz
    );
    CREATE TABLE public.exam_candidates (
      id uuid PRIMARY KEY,
      exam_id uuid NOT NULL REFERENCES public.exams(id)
    );
    CREATE TABLE public.exam_attempts (
      id uuid PRIMARY KEY,
      exam_id uuid NOT NULL REFERENCES public.exams(id),
      candidate_id uuid REFERENCES public.exam_candidates(id),
      student_id uuid REFERENCES public.students(id),
      status text NOT NULL,
      score numeric,
      max_score numeric,
      grading_status text DEFAULT 'graded',
      pending_manual_count integer DEFAULT 0
    );
    CREATE TABLE public.exam_answers (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      attempt_id uuid NOT NULL REFERENCES public.exam_attempts(id),
      points_awarded numeric
    );
    CREATE TABLE public.audit_logs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      actor_id uuid,
      organization_id uuid,
      action text NOT NULL,
      entity text NOT NULL,
      entity_id text,
      metadata jsonb DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    -- Simulated RBAC helper mirroring production access_has_permission
    CREATE OR REPLACE FUNCTION public.access_has_permission(
      p_user_id uuid, p_organization_id uuid, p_permission_key text
    ) RETURNS boolean LANGUAGE plpgsql STABLE AS $$
    DECLARE
      v_role text;
      v_super boolean;
    BEGIN
      SELECT (platform_role = 'super_admin' AND status = 'active') INTO v_super
      FROM public.profiles WHERE id = p_user_id;
      IF COALESCE(v_super, false) THEN RETURN true; END IF;

      SELECT m.role INTO v_role
      FROM public.organization_members m
      JOIN public.profiles p ON p.id = m.user_id
      WHERE m.user_id = p_user_id AND m.organization_id = p_organization_id
        AND m.status = 'active' AND p.status = 'active'
      LIMIT 1;
      IF v_role IS NULL THEN RETURN false; END IF;

      IF p_permission_key = 'grading.edit' THEN
        RETURN v_role IN ('owner', 'admin', 'teacher', 'corrector');
      END IF;
      IF p_permission_key IN ('grading.view', 'results.view') THEN
        RETURN v_role IN ('owner', 'admin', 'teacher', 'corrector', 'school_founder');
      END IF;
      RETURN false;
    END $$;

    GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
    GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
