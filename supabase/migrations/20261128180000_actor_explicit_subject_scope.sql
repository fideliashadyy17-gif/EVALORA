-- Subject scope that can be asked from a service-role client.
--
-- THE BUG THIS FIXES, FOUND IN THIS MIGRATION'S OWN PREDECESSOR
--
-- `can_author_subject(p_org, p_subject)` reads the caller from `auth.uid()`:
--
--   when public.org_role(p_org) = 'teacher' then
--     exists (select 1 from teaching_assignments ta
--              where ta.teacher_id = (select auth.uid()) ...)
--
-- The AI Core, the MCP server and the native assistant all run on the service-role
-- client, where `auth.uid()` is NULL. So for every teacher the predicate returned
-- FALSE — not just for subjects they do not teach, but for the ones they do:
--
--   under service_role: Maths (assigned)  -> false
--   under service_role: Literature        -> false
--   under service_role: NULL subject      -> false
--
-- Wiring that into the engine as a gate would have denied every content write by
-- every teacher through the AI Core, the assistant and every MCP agent. It is the
-- same shape as D12 and D13: an identity guard evaluated where no session exists.
-- Found because the gate was exercised against production before it shipped, not
-- after.
--
-- THE FIX
--
-- Identity becomes an explicit argument for callers that already know who they
-- are acting for — which is exactly the case here: `authenticateAgent` resolved
-- the actor from the agent's own row, and the native assistant resolved it from
-- the session. Neither is guessing.
--
-- The two-argument version is kept and unchanged so every existing policy keeps
-- working for browser sessions, where `auth.uid()` is correct and is the right
-- thing to trust. The three-argument version is what service-role callers use.
-- They must not be merged: a policy that trusted a client-supplied actor id would
-- let any authenticated user name a colleague.

create or replace function public.can_author_subject_for(
  p_actor uuid,
  p_org uuid,
  p_subject uuid
) returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select case
    -- No actor means no answer. Returning true would turn a missing identity into
    -- a licence, and returning false is the same wrong answer this migration
    -- exists to remove.
    when p_actor is null then false
    -- The actor must be an active member of the organization they are acting in.
    -- This is the tenant check, and it is why the agent path cannot reach another
    -- school's subjects even though it holds a service-role connection.
    when not exists (
      select 1 from public.organization_members m
      join public.profiles p on p.id = m.user_id and p.status = 'active'
      where m.user_id = p_actor
        and m.organization_id = p_org
        and m.status = 'active'
    ) then false
    -- Leadership keeps organization-wide authorship.
    when exists (
      select 1 from public.organization_members m
      where m.user_id = p_actor and m.organization_id = p_org
        and m.status = 'active' and m.role in ('owner', 'admin', 'organizer')
    ) then true
    -- A subject nobody has been assigned is not scoped by assignments; the paper
    -- being edited may not name a subject yet. Unrestricted, exactly as the
    -- two-argument version treats it, so editing a draft is never blocked.
    when p_subject is null then true
    -- A teacher with no subject assignment at all remains unrestricted. This is
    -- the transition mechanism from 20261128160000 and must stay until every
    -- teacher has assignments, or the day this runs it locks out the school.
    when not exists (
      select 1 from public.teaching_assignments ta
      where ta.teacher_id = p_actor and ta.organization_id = p_org
        and ta.role = 'subject_teacher'
    ) then true
    -- Otherwise: only the subjects actually assigned.
    else exists (
      select 1 from public.teaching_assignments ta
      where ta.teacher_id = p_actor and ta.organization_id = p_org
        and ta.role = 'subject_teacher'
        and ta.subject_id = p_subject
    )
  end;
$$;

comment on function public.can_author_subject_for(uuid, uuid, uuid) is
  'Subject scope for an explicitly named actor. Safe on the service-role client, where auth.uid() is NULL and can_author_subject(org, subject) cannot see the caller. Never pass a client-supplied actor id: the agent and assistant paths resolve it server-side first.';

revoke all on function public.can_author_subject_for(uuid, uuid, uuid) from public;
grant execute on function public.can_author_subject_for(uuid, uuid, uuid) to authenticated, service_role;

-- The two-argument version is re-stated so it delegates rather than duplicating
-- the rules. One place to change, one thing to test.
create or replace function public.can_author_subject(p_org uuid, p_subject uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select public.can_author_subject_for((select auth.uid()), p_org, p_subject);
$$;

comment on function public.can_author_subject(uuid, uuid) is
  'Subject scope for the session caller. Delegates to can_author_subject_for. Returns false under service_role because auth.uid() is NULL — service-role callers must use the explicit-actor form.';
