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

    -- ── Simulated RBAC graph ────────────────────────────────────────────────
    -- Mirrors production's role/permission tables so the REAL permission
    -- resolver can run under test. Without this the fixture could not
    -- distinguish the session-scoped wrapper from the actor-scoped resolver,
    -- which is precisely how a service-role authorization regression once
    -- shipped unnoticed.
    CREATE TABLE public.access_permissions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      key text NOT NULL UNIQUE,
      scope text NOT NULL DEFAULT 'organization',
      enabled boolean NOT NULL DEFAULT true
    );
    CREATE TABLE public.access_roles (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      slug text NOT NULL,
      is_active boolean NOT NULL DEFAULT true,
      organization_id uuid
    );
    CREATE TABLE public.access_role_permissions (
      role_id uuid NOT NULL REFERENCES public.access_roles(id),
      permission_id uuid NOT NULL REFERENCES public.access_permissions(id),
      granted boolean NOT NULL DEFAULT true,
      PRIMARY KEY (role_id, permission_id)
    );
    CREATE TABLE public.access_permission_overrides (
      user_id uuid NOT NULL REFERENCES public.profiles(id),
      organization_id uuid NOT NULL REFERENCES public.organizations(id),
      permission_id uuid NOT NULL REFERENCES public.access_permissions(id),
      granted boolean NOT NULL,
      PRIMARY KEY (user_id, organization_id, permission_id)
    );
    CREATE TABLE public.access_user_roles (
      user_id uuid NOT NULL REFERENCES public.profiles(id),
      role_id uuid NOT NULL REFERENCES public.access_roles(id),
      status text NOT NULL DEFAULT 'active',
      expires_at timestamptz
    );

    -- Resolves a user's active roles within one organization.
    CREATE OR REPLACE FUNCTION public.access_subject_roles(
      p_user_id uuid, p_organization_id uuid
    ) RETURNS TABLE (
      user_id uuid, organization_id uuid, role_id uuid,
      status text, expires_at timestamptz
    ) LANGUAGE sql STABLE AS $$
      SELECT m.user_id, m.organization_id, r.id, m.status, null::timestamptz
        FROM public.organization_members m
        JOIN public.access_roles r ON r.slug = m.role
        WHERE m.user_id = p_user_id
          AND m.organization_id = p_organization_id
          AND m.status = 'active';
    $$;

    INSERT INTO public.access_permissions (key, scope, enabled) VALUES
      ('grading.edit', 'organization', true),
      ('grading.view', 'organization', true),
      ('results.view', 'organization', true);

    INSERT INTO public.access_roles (slug) VALUES
      ('owner'), ('admin'), ('teacher'), ('corrector'), ('school_founder');

    INSERT INTO public.access_role_permissions (role_id, permission_id, granted)
      SELECT r.id, p.id,
             (p.key IN ('grading.view', 'results.view')
              OR (p.key = 'grading.edit'
                  AND r.slug IN ('owner', 'admin', 'teacher', 'corrector')))
        FROM public.access_roles r CROSS JOIN public.access_permissions p;

    -- ── The evaluator: pure role-graph lookup, no caller-identity guard ─────
    -- Production equivalent: public.access_actor_has_permission /
    -- public._access_eval_permission. Safe to call for an explicitly named
    -- actor, which is what a SECURITY DEFINER RPC needs.
    CREATE OR REPLACE FUNCTION public.access_actor_has_permission(
      p_actor_id uuid, p_organization_id uuid, p_permission_key text
    ) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path = public, pg_temp AS $$
    DECLARE
      v_permission public.access_permissions;
      v_override boolean;
    BEGIN
      IF p_actor_id IS NULL THEN RETURN false; END IF;
      IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_actor_id AND status = 'active') THEN
        RETURN false;
      END IF;
      SELECT * INTO v_permission FROM public.access_permissions WHERE key = p_permission_key;
      IF NOT FOUND OR NOT v_permission.enabled THEN RETURN false; END IF;
      IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_actor_id AND platform_role = 'super_admin' AND status = 'active') THEN
        RETURN true;
      END IF;
      IF v_permission.scope <> 'organization' THEN RETURN false; END IF;
      -- Founder ceiling: a supervision-only account can never become an
      -- academic operator, whatever else is granted.
      IF EXISTS (SELECT 1 FROM public.organization_members WHERE user_id = p_actor_id AND role = 'school_founder')
         AND p_permission_key !~ '\.(view|analytics|monitor)$' THEN
        RETURN false;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = p_organization_id) THEN
        RETURN false;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM public.organization_members
         WHERE user_id = p_actor_id AND organization_id = p_organization_id AND status = 'active'
      ) THEN RETURN false; END IF;

      SELECT granted INTO v_override FROM public.access_permission_overrides
       WHERE user_id = p_actor_id AND organization_id = p_organization_id
         AND permission_id = v_permission.id;
      IF v_override = false THEN RETURN false; END IF;

      IF EXISTS (
        SELECT 1 FROM public.access_subject_roles(p_actor_id, p_organization_id) ur
          JOIN public.access_roles r ON r.id = ur.role_id
          JOIN public.access_role_permissions rp ON rp.role_id = r.id
         WHERE ur.user_id = p_actor_id AND ur.organization_id = p_organization_id
           AND ur.status = 'active' AND r.is_active
           AND rp.permission_id = v_permission.id AND NOT rp.granted
      ) THEN RETURN false; END IF;

      RETURN coalesce(v_override, false) OR EXISTS (
        SELECT 1 FROM public.access_subject_roles(p_actor_id, p_organization_id) ur
          JOIN public.access_roles r ON r.id = ur.role_id
          JOIN public.access_role_permissions rp ON rp.role_id = r.id
         WHERE ur.user_id = p_actor_id AND ur.organization_id = p_organization_id
           AND ur.status = 'active' AND r.is_active
           AND rp.permission_id = v_permission.id AND rp.granted
      );
    END $$;

    -- ── The session-scoped wrapper, WITH production's identity guard ────────
    -- This is the function that must never be used to authorize an explicitly
    -- named actor from a service-role call: with no JWT, auth.uid() is NULL
    -- and it answers false for everyone but a Super Admin.
    CREATE OR REPLACE FUNCTION public.access_has_permission(
      p_user_id uuid, p_organization_id uuid, p_permission_key text
    ) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path = public, pg_temp AS $$
    BEGIN
      IF auth.uid() IS DISTINCT FROM p_user_id
         AND NOT EXISTS (SELECT 1 FROM public.profiles
                          WHERE id = auth.uid() AND platform_role = 'super_admin' AND status = 'active')
      THEN RETURN false; END IF;
      RETURN public.access_actor_has_permission(p_user_id, p_organization_id, p_permission_key);
    END $$;

    -- The wrapper is callable by signed-in users; the actor resolver is not.
    REVOKE ALL ON FUNCTION public.access_actor_has_permission(uuid,uuid,text) FROM public, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.access_actor_has_permission(uuid,uuid,text) TO service_role;
    GRANT EXECUTE ON FUNCTION public.access_has_permission(uuid,uuid,text) TO authenticated, service_role;

    GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
    GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
