-- Revocation and agent management, authorized by an explicit actor.
--
-- WHY THIS EXISTS
--
-- `ai_revoke_agent` decided who was calling it with
--
--     if not (public.is_super_admin() or public.can_manage_org(v_org)) then
--       raise exception 'AI_PERMISSION_DENIED';
--     end if;
--
-- Both of those helpers resolve the caller from `auth.uid()`, which is the
-- session cookie's user. The dashboard does NOT call this function with a cookie
-- client — it calls it with the service-role client, where `auth.uid()` is NULL.
-- So `is_super_admin()` and `can_manage_org()` were both false on every single
-- invocation, for every user, and the function raised before it could update
-- anything.
--
-- Measured on production before this migration:
--
--     auth.uid() under service_role ........ NULL
--     is_super_admin() .................... false
--     can_manage_org(demo org) ............ false
--     select ai_revoke_agent(<test agent>)  ERROR P0001: AI_PERMISSION_DENIED
--
-- That is the reported bug. The button appeared to do nothing because the server
-- action swallowed the exception (see the matching change in actions.ts) and the
-- status never changed.
--
-- THE FIX
--
-- The actor becomes an explicit argument, checked with `_access_eval_permission`
-- — the same pure evaluator the AI permission resolver uses, and the same one
-- `access_has_permission` delegates to after its own identity guard. Identity is
-- not inferred from the request; the caller states who it is, and the server
-- action establishes that by verifying the session before it calls.
--
-- This does not weaken the gate: `_access_eval_permission` still requires an
-- active profile, an enabled permission, an ACTIVE membership in THIS
-- organization, and a role that actually grants `ai.manage_agents`. The old
-- `can_manage_org` was arguably narrower in one respect — it accepted the
-- 'owner'/'admin' role — so the new check is stated in terms of the permission
-- the dashboard already gates the page on, which is the more precise question.
--
-- The authorization decision is now testable outside a browser session, which is
-- the reason the bug survived: under service_role the old check could not be
-- observed to fail at all without attempting a real revocation.

create or replace function public.ai_agent_can_manage(p_agent_id uuid, p_actor_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select coalesce(
    public._access_eval_permission(
      p_actor_id,
      (select organization_id from public.ai_agents where id = p_agent_id),
      'ai.manage_agents'
    ),
    false
  );
$$;

comment on function public.ai_agent_can_manage(uuid, uuid) is
  'Whether p_actor_id may manage the agent p_agent_id, answered from the agent''s own organization. Safe to call under service_role, where auth.uid() is NULL.';

create or replace function public.ai_revoke_agent(
  p_agent_id uuid,
  p_reason text default null,
  p_actor_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_org uuid;
  v_actor uuid := coalesce(p_actor_id, auth.uid());
begin
  select organization_id into v_org from public.ai_agents where id = p_agent_id;
  if v_org is null then return false; end if;

  -- Refuse rather than return false: an unauthorized caller must not be able to
  -- tell a non-existent agent from one it may not touch.
  if v_actor is null then
    raise exception 'AI_PERMISSION_DENIED: no actor was supplied';
  end if;
  if not public._access_eval_permission(v_actor, v_org, 'ai.manage_agents') then
    raise exception 'AI_PERMISSION_DENIED: actor % may not manage agents in organization %', v_actor, v_org;
  end if;

  update public.ai_agents
     set status = 'revoked',
         token_digest = null,
         revoked_at = now(),
         revoked_by = v_actor,
         revoke_reason = left(coalesce(p_reason, 'Revoked by an organization administrator.'), 500),
         updated_at = now()
   where id = p_agent_id;

  -- The agent row is kept: revoking a credential is not deleting a registration,
  -- and the audit trail has to survive the revocation it records.
  update public.ai_approvals
     set status = 'cancelled', decided_at = now()
   where agent_id = p_agent_id and status = 'pending';

  return true;
end;
$$;

comment on function public.ai_revoke_agent(uuid, text, uuid) is
  'Revokes an agent credential. p_actor_id is the HUMAN performing the revocation; it defaults to auth.uid() so the function still works from a session, but the dashboard passes it explicitly because it runs on the service-role client where auth.uid() is NULL.';

-- Rotation had the identical shape: it selected with `.eq(status,'approved')`
-- on the service-role client, so RLS was not the problem, but it then had no
-- server-side record of who rotated. Keep the decision identical (the server
-- action has already authorized the actor) but make the actor explicit so the
-- audit row and the credential change name the same person.
create or replace function public.ai_rotate_agent_token(
  p_agent_id uuid,
  p_digest text,
  p_prefix text,
  p_actor_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_org uuid;
  v_actor uuid := coalesce(p_actor_id, auth.uid());
begin
  select organization_id into v_org from public.ai_agents where id = p_agent_id;
  if v_org is null then return false; end if;
  if v_actor is null then
    raise exception 'AI_PERMISSION_DENIED: no actor was supplied';
  end if;
  if not public._access_eval_permission(v_actor, v_org, 'ai.manage_agents') then
    raise exception 'AI_PERMISSION_DENIED: actor % may not rotate agents in organization %', v_actor, v_org;
  end if;

  update public.ai_agents
     set token_digest = p_digest,
         token_prefix = p_prefix,
         token_last_rotated_at = now(),
         updated_at = now()
   where id = p_agent_id
     and organization_id = v_org
     and status = 'approved';
  -- Rotation of a revoked or pending agent changes nothing and must not silently
  -- look like success.
  if not found then
    raise exception 'AI_AGENT_NOT_APPROVED: only an approved agent''s credential can be rotated';
  end if;
  return true;
end;
$$;

comment on function public.ai_rotate_agent_token(uuid, text, text, uuid) is
  'Replaces an approved agent credential, recording the human who did it. Raises rather than silently no-ops when the agent is not approved.';

revoke all on function public.ai_agent_can_manage(uuid, uuid) from public;
revoke all on function public.ai_revoke_agent(uuid, text, uuid) from public;
revoke all on function public.ai_rotate_agent_token(uuid, text, text, uuid) from public;
grant execute on function public.ai_agent_can_manage(uuid, uuid) to service_role;
grant execute on function public.ai_revoke_agent(uuid, text, uuid) to service_role;
grant execute on function public.ai_rotate_agent_token(uuid, text, text, uuid) to service_role;
