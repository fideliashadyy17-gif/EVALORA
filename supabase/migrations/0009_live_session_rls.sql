-- EVALORA — organizer-only direct reads for live session rows.
--
-- A quiz_sessions row contains organizer presentation/audio settings
-- and the display-token version. Organization membership alone must
-- not expose it through PostgREST. Direct reads are limited to the
-- session host, creator/organizer roles (including Super Admin via
-- org_role), or an authenticated user linked to their own participant
-- row in that session. Guests/public screens use scoped server APIs.

drop policy if exists ses_select on public.quiz_sessions;
create policy ses_select on public.quiz_sessions for select to authenticated
  using (
    host_id = auth.uid()
    or public.can_host_live_session(organization_id)
    or exists (
      select 1 from public.session_participants p
      where p.session_id = id and p.user_id = auth.uid()
    )
  );
