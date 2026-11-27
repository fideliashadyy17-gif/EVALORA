-- ─────────────────────────────────────────────────────────────────────────────
-- TEST FIXTURE ONLY — synthetic stand-in for the production EVALORA schema.
--
-- `scripts/test-assessment-contributions.mjs` and
-- `scripts/test-grade-adjustment-ledger.mjs` load this into an in-memory PGlite
-- database and then execute the REAL production migration
-- `supabase/migrations/20261127120000_assessment_contributions_and_grade_consolidation.sql`
-- verbatim, so the shipped SQL (constraints, guards, triggers, RLS, grants) is
-- what actually runs. Nothing here is applied to a real database.
-- ─────────────────────────────────────────────────────────────────────────────
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
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active'
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

CREATE TABLE public.subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  name text NOT NULL
);

CREATE TABLE public.classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  name text NOT NULL,
  teacher_id uuid REFERENCES public.profiles(id)
);

CREATE TABLE public.teacher_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  profile_id uuid NOT NULL REFERENCES public.profiles(id),
  subject_id uuid NOT NULL REFERENCES public.subjects(id)
);

CREATE TABLE public.academic_years (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  name text NOT NULL
);

CREATE TABLE public.students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  full_name text NOT NULL,
  status text NOT NULL DEFAULT 'active'
);

CREATE TABLE public.exams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  title text NOT NULL,
  status text NOT NULL DEFAULT 'closed',
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  grades_published_at timestamptz,
  deleted_at timestamptz
);

CREATE TABLE public.exam_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid NOT NULL REFERENCES public.exams(id),
  full_name text
);

CREATE TABLE public.exam_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid NOT NULL REFERENCES public.exams(id),
  candidate_id uuid REFERENCES public.exam_candidates(id),
  student_id uuid REFERENCES public.students(id),
  status text NOT NULL DEFAULT 'submitted',
  score numeric,
  max_score numeric
);

CREATE TABLE public.exam_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES public.exam_attempts(id),
  question_id uuid NOT NULL DEFAULT gen_random_uuid(),
  points_awarded numeric,
  is_correct boolean
);

CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  organization_id uuid,
  action text NOT NULL,
  entity text,
  entity_id text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Mirrors the production RBAC resolver closely enough to exercise the RLS
-- policies: super admin always, learners never, founder only on read scopes.
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

  IF lower(v_role) IN ('student','candidate','parent','participant') THEN RETURN false; END IF;
  IF v_role = 'school_founder' THEN
    RETURN p_permission_key IN ('grading.view', 'results.view');
  END IF;
  IF p_permission_key IN ('grading.edit','grading.view','results.view','results.publish','results.validate') THEN
    RETURN v_role IN ('owner','admin','teacher','corrector');
  END IF;
  RETURN false;
END $$;

GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
