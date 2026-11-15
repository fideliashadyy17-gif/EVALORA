-- Per-participant extra time in a live session.
--
-- A shared countdown is the right default: everyone in the room answers the
-- same question in the same window. But a participant can be disadvantaged by
-- something that has nothing to do with the competition — a dropped
-- connection, a slow device, an accessibility need — and the only remedy
-- today was to give the whole room more time, which changes the round for
-- everyone and distorts the speed scoring.
--
-- This adds a personal allowance, in milliseconds, on the participant's own
-- row. It never changes the session's `question_deadline_at`, so the
-- projected screen, the room's phase and every other participant's countdown
-- are untouched; it only extends the point at which THIS participant's answer
-- stops being accepted.
--
-- Granting is host-only: `sp_host_update` already restricts UPDATE on
-- session_participants to the session host (or a Super Admin), so a
-- participant cannot award themselves time. No policy is added or weakened.
--
-- Strictly additive: one nullable-free column with DEFAULT 0, so every
-- existing row reads as "no extra time" and nothing is rewritten.
begin;

alter table public.session_participants
  add column if not exists extra_time_ms bigint not null default 0;

-- 30 minutes: enough to cover a reconnect without letting one participant
-- outlast the round. The same bound is enforced in src/lib/live.ts so the
-- client-facing error is readable before a write is attempted.
alter table public.session_participants
  drop constraint if exists session_participants_extra_time_ms_check;

alter table public.session_participants
  add constraint session_participants_extra_time_ms_check
  check (extra_time_ms >= 0 and extra_time_ms <= 1800000);

comment on column public.session_participants.extra_time_ms is
  'Personal extra time granted by the host, in milliseconds. Extends when this participant may still answer; it never changes the session deadline or the projected countdown.';

commit;
