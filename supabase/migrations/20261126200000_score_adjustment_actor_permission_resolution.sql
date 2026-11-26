-- Score-adjustment authorization was evaluated through public.access_has_permission(),
-- which opens with a caller-identity guard:
--
--   if auth.uid() is distinct from p_user_id and not public.is_super_admin() then
--     return false;
--   end if;
--
-- applyScoreAdjustmentServer() invokes public.apply_exam_score_adjustment() with the
-- service-role client, where auth.uid() is NULL. The guard therefore answered false
-- for EVERY staff member, so an organization administrator who genuinely holds
-- grading.edit in the target organization was refused with
--
--   unauthorized: grading.edit permission in target organization required
--
-- which the API surfaced as "You are not authorized to apply score adjustments to
-- this examination." Super Admins were unaffected because the RPC's super-admin
-- branch reads public.profiles instead of the permission resolver.
--
-- The guard is correct for its purpose: it stops one authenticated user from asking
-- about another user's rights. But that judgement belongs at the trust boundary, and
-- here the boundary is already explicit and narrow:
--   * apply_exam_score_adjustment takes p_actor_id and records it in the ledger/audit;
--   * the function is executable by service_role ONLY (no `authenticated` grant), so
--     the application has already authenticated the actor before the call.
-- Re-evaluating "may this session read someone else's rights" inside the RPC is
-- redundant and, for a service-role call with no session identity, always false.
--
-- This adds a resolver that evaluates the role graph for an explicitly-named actor
-- and keeps every other rule of access_has_permission byte-for-byte identical
-- (active profile, permission enabled, organization scope, founder ceiling, active
-- organization, active membership, explicit overrides, explicit denies, grants).
--
-- SECURITY: the resolver is deliberately NOT granted to authenticated/anon. It
-- accepts an arbitrary actor id, so exposing it to end users would reintroduce the
-- very escalation the original guard prevents. Only service_role and postgres may
-- execute it.

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

-- Repoint the RPC at the actor-scoped resolver. Done against the live definition so
-- the rest of the (long) function is preserved verbatim rather than retyped.
do $$
declare ddl text;
begin
  select pg_get_functiondef(p.oid) into ddl
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'apply_exam_score_adjustment';
  if ddl is null then
    raise exception 'apply_exam_score_adjustment not found';
  end if;
  if position('access_actor_has_permission' in ddl) > 0 then
    raise notice 'already repointed to access_actor_has_permission';
    return;
  end if;
  ddl := replace(
    ddl,
    'public.access_has_permission(p_actor_id, v_exam.organization_id, ''grading.edit'')',
    'public.access_actor_has_permission(p_actor_id, v_exam.organization_id, ''grading.edit'')'
  );
  if position('access_actor_has_permission' in ddl) = 0 then
    raise exception 'grading.edit resolver call not found; refusing to guess';
  end if;
  execute ddl;
  raise notice 'apply_exam_score_adjustment repointed to access_actor_has_permission';
end $$;
