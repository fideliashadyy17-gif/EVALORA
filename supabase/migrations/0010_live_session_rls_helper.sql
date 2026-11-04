-- Avoid mutually-recursive RLS between quiz_sessions and
-- session_participants by checking a linked participant through a
-- security-definer helper (same pattern as org_role/can_* helpers).

create or replace function public.is_linked_live_participant(p_session uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.session_participants p
    where p.session_id = p_session and p.user_id = auth.uid()
  );
$$;

drop policy if exists ses_select on public.quiz_sessions;
create policy ses_select on public.quiz_sessions for select to authenticated
  using (
    host_id = auth.uid()
    or public.can_host_live_session(organization_id)
    or public.is_linked_live_participant(id)
  );
