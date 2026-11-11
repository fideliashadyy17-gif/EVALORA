-- 0079 — Presence rails, original audio and hint attention.
--
-- Additive only. Nothing here rewrites an examination, a live session, a
-- question, an answer or a published result: every existing exam and quiz gains
-- the new participant rail the moment this migration lands, with no need to
-- recreate or republish anything.
--
-- What this migration actually does:
--   1. indexes the two presence reads used by the rails (roster by session, by
--      exam), so a 200-student room costs one small index scan instead of a
--      table scan on every poll;
--   2. documents the presence contract (heartbeat, staleness, ownership) on the
--      tables themselves, for operators reading the schema;
--   3. enables realtime for `exam_presence` defensively (older projects already
--      have it; the block is idempotent).
--
-- Audio preferences and hint-attention timers are client-side and intentionally
-- need no columns: the host switches live in `quiz_sessions.settings->audio`
-- (JSON), and a 30-second attention timer must never be persisted, because a
-- persisted timer could be mistaken for part of the assessment.

-- ─── Presence indexes ───────────────────────────────────────────────────
create index if not exists session_participants_session_joined
  on public.session_participants (session_id, joined_at);

create index if not exists session_participants_session_seen
  on public.session_participants (session_id, last_seen_at desc);

create index if not exists exam_presence_exam_seen
  on public.exam_presence (exam_id, last_seen_at desc);

-- ─── Presence contract ──────────────────────────────────────────────────
comment on table public.exam_presence is
  'One heartbeat row per attempt. last_seen_at drives the candidate rail and the invigilator monitor: <=45s online, <=120s reconnecting, then offline. Never written by RLS clients, only by the server. A missed heartbeat never means submitted.';

comment on column public.exam_presence.last_seen_at is
  'Last authenticated heartbeat. Server-written only; a stale value means "connection lost", never "finished".';

comment on table public.session_participants is
  'Live room membership. display_name and avatar_key are public in the room (projector and participant rail); score is never exposed through the rail.';

-- ─── Realtime (idempotent) ──────────────────────────────────────────────
do $$
begin
  begin
    alter publication supabase_realtime add table public.exam_presence;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.session_participants;
  exception when duplicate_object then null;
  end;
end $$;

-- ─── Verification helpers ───────────────────────────────────────────────
-- Cheap operator sanity check: how many devices are currently online per exam.
create or replace view public.exam_presence_summary as
select
  p.exam_id,
  p.organization_id,
  count(*) as devices,
  count(*) filter (where p.last_seen_at > now() - interval '45 seconds') as online,
  max(p.last_seen_at) as last_seen_at
from public.exam_presence p
group by p.exam_id, p.organization_id;

comment on view public.exam_presence_summary is
  'Staff-facing aggregate. Exposes counts only — no names, no answers, no scores.';

-- The summary view is for operators and server-side checks only: it must never
-- become a cross-institution counter for signed-in users.
revoke all on public.exam_presence_summary from anon, authenticated;
grant select on public.exam_presence_summary to service_role;
