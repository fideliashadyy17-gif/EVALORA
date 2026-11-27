-- ═══════════════════════════════════════════════════════════════════════════
-- Regression repair: score-adjustment authorization must use the actor-scoped
-- permission resolver, never the session-scoped wrapper.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- WHAT BROKE
--   `apply_exam_score_adjustment()` is invoked by `applyScoreAdjustmentServer()`
--   through the service-role client. In that context `auth.uid()` is NULL, and
--   `public.access_has_permission()` opens with a caller-identity guard:
--
--       if auth.uid() is distinct from p_user_id
--          and not public.is_super_admin() then return false; end if;
--
--   With no session identity that guard answers false for EVERY staff member, so
--   the RPC raised
--
--       unauthorized: grading.edit permission in target organization required
--
--   for any organization administrator or teacher who genuinely holds
--   grading.edit. Preview never calls the RPC, so it kept working — which is
--   exactly the reported symptom: Preview correct, Confirm & Apply refuses.
--   Super Admins were unaffected, because the RPC's super-admin branch reads
--   `public.profiles` directly instead of the permission resolver.
--
--   Migration 20261126200000_score_adjustment_actor_permission_resolution.sql
--   had already fixed this by introducing `access_actor_has_permission()` — a
--   resolver that takes an explicitly named actor and keeps every other rule
--   byte-for-byte identical — and repointing the live function at it. That
--   repoint patched the deployed definition only; the canonical
--   20261125230000_score_adjustments.sql text still called the wrapper.
--   20261127150000_repeated_score_adjustments.sql then recreated the function
--   from that stale text and silently reverted the fix.
--
-- WHAT THIS DOES
--   Restores the actor-scoped resolver call, and makes the resolver itself
--   part of this migration so the chain is correct even on a database that
--   never received 20261126200000.
--
-- SECURITY — unchanged and deliberate
--   * `access_actor_has_permission` accepts an arbitrary actor id, so it is
--     granted to service_role ONLY. It is never reachable by anon or
--     authenticated, which is what prevents one signed-in user from asking
--     about another user's rights.
--   * `apply_exam_score_adjustment` is likewise service_role only. The
--     application authenticates the actor and passes the verified id; the RPC
--     records it in the ledger and the audit log.
--   * The Founder ceiling, active-profile, active-organization,
--     active-membership, explicit-deny and explicit-grant rules are all
--     evaluated exactly as before. School Founder stays read-only.
--
-- IDEMPOTENT: safe to re-run. No data is touched.

-- ─── 1. The actor-scoped resolver ────────────────────────────────────────────
create or replace function public.access_actor_has_permission(
  p_actor_id uuid, p_organization_id uuid, p_permission_key text
) returns boolean language plpgsql security definer
set search_path = public, pg_temp stable as $$
declare v_permission public.access_permissions; v_override boolean;
begin
  if p_actor_id is null then return false; end if;
  if not exists(select 1 from public.profiles where id=p_actor_id and status='active') then return false; end if;
  select * into v_permission from public.access_permissions where key=p_permission_key;
  if not found or not v_permission.enabled then return false; end if;
  if exists(select 1 from public.profiles where id=p_actor_id and platform_role='super_admin' and status='active') then return true; end if;
  if v_permission.scope <> 'organization' then return false; end if;
  -- Founder is a ceiling as well as a role: extra roles/overrides cannot
  -- turn a supervision-only account into an academic operator.
  if (exists(select 1 from public.organization_members where user_id=p_actor_id and role='school_founder') or exists(select 1 from public.access_user_roles ur join public.access_roles r on r.id=ur.role_id
      where ur.user_id=p_actor_id and ur.status='active' and r.slug='school_founder'
      and (ur.expires_at is null or ur.expires_at>now()))) and
    (p_permission_key !~ '\.(view|analytics|monitor)$' or p_permission_key ~ '^(users|students|roles|permissions|proctoring)\.') then return false; end if;
  if not exists(select 1 from public.organizations where id=p_organization_id and status='active') then return false; end if;
  if not exists(select 1 from public.organization_members where user_id=p_actor_id and organization_id=p_organization_id and status='active') then return false; end if;
  select granted into v_override from public.access_permission_overrides
    where user_id=p_actor_id and organization_id=p_organization_id and permission_id=v_permission.id;
  if v_override = false then return false; end if;
  if exists (
    select 1 from public.access_subject_roles(p_actor_id,p_organization_id) ur join public.access_roles r on r.id=ur.role_id
    join public.access_role_permissions rp on rp.role_id=r.id
    where ur.user_id=p_actor_id and ur.organization_id=p_organization_id and ur.status='active'
      and (ur.expires_at is null or ur.expires_at>now()) and r.is_active
      and (r.organization_id is null or r.organization_id=p_organization_id)
      and rp.permission_id=v_permission.id and not rp.granted
  ) then return false; end if;
  return coalesce(v_override,false) or exists (
    select 1 from public.access_subject_roles(p_actor_id,p_organization_id) ur join public.access_roles r on r.id=ur.role_id
    join public.access_role_permissions rp on rp.role_id=r.id
    where ur.user_id=p_actor_id and ur.organization_id=p_organization_id and ur.status='active'
      and (ur.expires_at is null or ur.expires_at>now()) and r.is_active
      and (r.organization_id is null or r.organization_id=p_organization_id)
      and rp.permission_id=v_permission.id and rp.granted
  );
end $$;

revoke all on function public.access_actor_has_permission(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.access_actor_has_permission(uuid,uuid,text) to service_role;

-- ─── 2. Repoint the RPC at the actor-scoped resolver ─────────────────────────
-- Patched in place against the live definition so the rest of the (long)
-- function is preserved verbatim. Raises rather than guessing if the expected
-- call site is absent, and is a no-op when already correct.
do $$
declare
  ddl  text;
  sig  text := 'public.apply_exam_score_adjustment(uuid,text,text,text,numeric,text,text,text,uuid,text,text,text,jsonb)';
begin
  select pg_get_functiondef(p.oid) into ddl
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'apply_exam_score_adjustment';

  if ddl is null then
    raise exception 'apply_exam_score_adjustment not found; cannot repair its permission resolver';
  end if;

  if position('access_actor_has_permission' in ddl) > 0
     and position('public.access_has_permission(p_actor_id' in ddl) = 0 then
    raise notice 'apply_exam_score_adjustment already uses access_actor_has_permission';
    return;
  end if;

  ddl := replace(
    ddl,
    'public.access_has_permission(p_actor_id, v_exam.organization_id, ''grading.edit'')',
    'public.access_actor_has_permission(p_actor_id, v_exam.organization_id, ''grading.edit'')'
  );

  if position('access_actor_has_permission' in ddl) = 0 then
    raise exception 'grading.edit resolver call not found in apply_exam_score_adjustment; refusing to guess';
  end if;
  if position('public.access_has_permission(p_actor_id' in ddl) > 0 then
    raise exception 'a session-scoped access_has_permission(p_actor_id, ...) call remains after the rewrite';
  end if;

  execute ddl;
  raise notice 'apply_exam_score_adjustment repointed to access_actor_has_permission';
end $$;

-- ─── 3. Assert the repaired wiring ───────────────────────────────────────────
do $$
declare ddl text;
begin
  select pg_get_functiondef('public.apply_exam_score_adjustment(uuid,text,text,text,numeric,text,text,text,uuid,text,text,text,jsonb)'::regprocedure)
    into ddl;
  if position('access_actor_has_permission' in ddl) = 0 then
    raise exception 'repair failed: apply_exam_score_adjustment does not call access_actor_has_permission';
  end if;
  if position('public.access_has_permission(p_actor_id' in ddl) > 0 then
    raise exception 'repair failed: apply_exam_score_adjustment still calls the session-scoped wrapper';
  end if;
end $$;
