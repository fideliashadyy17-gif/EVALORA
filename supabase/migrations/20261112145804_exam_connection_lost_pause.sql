-- 0099: CONNECTION_LOST pause — a disconnected candidate is an INTERRUPTED
-- attempt, never a completed one.
--
-- Why: on 2026-11-12 every candidate of one formative assessment lost their
-- connection at once (mass client outage at ~11:01 UTC). Nothing in the
-- platform marked those attempts as interrupted, so when the official deadline
-- passed at ~11:47 UTC the scheduled sweep auto-submitted the disconnected
-- candidates with whatever few answers had synced. A missed heartbeat must
-- never be able to reach a submission: heartbeat expiry means CONNECTION LOST,
-- which pauses the attempt (reason 'connection'), freezes its deadline and
-- preserves its remaining time until the candidate is back.
--
-- This migration extends the existing multi-reason pause machinery (0098) with
-- the third, AUTOMATIC reason:
--
--   assessment — organizer paused the whole examination   (manual)
--   student    — organizer paused one candidate           (manual)
--   connection — server confirmed the candidate's device went silent (automatic)
--
-- The reasons stay independent: a reconnection clears ONLY 'connection' and
-- can never cancel an organizer pause; the attempt resumes composition only
-- when EVERY reason has cleared (0098's union-credit rule, unchanged).
--
-- exam_attempt_set_pause gains one optional parameter, p_paused_at: the
-- server-recorded instant the connection was last confirmed (presence
-- last_seen_at). Anchoring the pause window at that evidence — instead of at
-- the moment a sweep happened to notice — is what makes the credited time
-- equal the real outage: on resume the candidate's remaining time continues
-- from the moment of disconnection, never from zero and never reduced.
-- The anchor is clamped to [started_at, now()] and is honoured for the
-- 'connection' reason only; manual pauses remain effective from now().
--
-- Additive and backward-compatible: existing callers pass three arguments and
-- keep their exact behaviour (the fourth has a default). No attempt, answer,
-- submission or history row is touched by this migration.

-- ─── Ledger: allow the automatic reason ───────────────────────────────────
alter table public.exam_pause_events
  drop constraint if exists exam_pause_events_reason_check;
alter table public.exam_pause_events
  add constraint exam_pause_events_reason_check
  check (reason in ('assessment','student','connection'));

-- ─── Atomic per-attempt pause transition (replaces the 0098 definition) ───
-- The signature gains a defaulted parameter, so the old one must be dropped
-- first (Postgres cannot create-or-replace into a different argument list).
-- Every rule of 0098 is preserved verbatim: row-level serialization, the
-- idempotent duplicate no-ops, credit only when the LAST reason clears, and
-- the union window that makes overlapping reasons credit exactly once.
drop function if exists public.exam_attempt_set_pause(uuid, text, boolean);

create or replace function public.exam_attempt_set_pause(
  p_attempt_id uuid,
  p_reason text,
  p_paused boolean,
  p_paused_at timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt public.exam_attempts%rowtype;
  v_reasons text[];
  v_now timestamptz := now();
  v_now_ms bigint := (extract(epoch from now()) * 1000)::bigint;
  v_anchor timestamptz;
  v_intervals jsonb;
  v_total_ms bigint;
  v_credit_ms bigint;
  v_credit_min integer;
  v_extension integer;
begin
  if p_reason is null or p_reason not in ('assessment','student','connection') then
    raise exception 'unknown pause reason';
  end if;

  select * into v_attempt from public.exam_attempts where id = p_attempt_id for update;
  if not found or v_attempt.status <> 'in_progress' then
    return null;
  end if;

  -- Evidence anchor for the automatic reason only. Clamped both ways: it can
  -- never postdate the clock (no negative windows) and never predate the
  -- start (no invented time before the candidate began).
  v_anchor := v_now;
  if p_reason = 'connection' and p_paused_at is not null then
    v_anchor := greatest(coalesce(v_attempt.started_at, v_now), least(p_paused_at, v_now));
  end if;

  v_reasons := coalesce(v_attempt.pause_reasons, '{}');
  if p_paused then
    if p_reason = any (v_reasons) then
      return jsonb_build_object('paused', true, 'reasons', v_reasons, 'credited_minutes', 0, 'duplicate', true);
    end if;
    v_reasons := array_append(v_reasons, p_reason);
    update public.exam_attempts
       set pause_reasons = v_reasons,
           paused_at = case when array_length(v_reasons, 1) = 1 then v_anchor else paused_at end
     where id = p_attempt_id;
    return jsonb_build_object('paused', true, 'reasons', v_reasons, 'credited_minutes', 0, 'paused_at', v_anchor);
  end if;

  if not (p_reason = any (v_reasons)) then
    return jsonb_build_object(
      'paused', coalesce(array_length(v_reasons, 1), 0) > 0,
      'reasons', v_reasons,
      'credited_minutes', 0,
      'duplicate', true);
  end if;
  v_reasons := array_remove(v_reasons, p_reason);

  if array_length(v_reasons, 1) > 0 then
    -- Another reason is still open: the attempt stays paused, no credit yet.
    -- A reconnection can never cancel an organizer pause.
    update public.exam_attempts set pause_reasons = v_reasons where id = p_attempt_id;
    return jsonb_build_object('paused', true, 'reasons', v_reasons, 'credited_minutes', 0);
  end if;

  -- Last reason cleared: close the window and credit the union. For a
  -- connection pause anchored at the last confirmed heartbeat, this returns
  -- exactly the time the candidate spent disconnected — their countdown
  -- continues from the moment of disconnection.
  v_intervals := coalesce(v_attempt.pause_intervals, '[]'::jsonb);
  if v_attempt.paused_at is not null then
    v_intervals := v_intervals
      || jsonb_build_array(jsonb_build_array(
           (extract(epoch from v_attempt.paused_at) * 1000)::bigint, v_now_ms));
  end if;
  v_intervals := public.exam_pause_union_intervals(v_intervals);
  v_total_ms := 0;
  select coalesce(sum(least((value->>1)::bigint, v_now_ms) - greatest((value->>0)::bigint, 0)), 0)::bigint
    into v_total_ms
    from jsonb_array_elements(v_intervals) as value;
  v_total_ms := greatest(0, v_total_ms);
  v_credit_ms := greatest(0, v_total_ms - coalesce(v_attempt.pause_credited_ms, 0));
  v_credit_min := least(1440 - coalesce(v_attempt.extension_minutes, 0), (v_credit_ms + 59999) / 60000);
  v_credit_min := greatest(0, v_credit_min);
  v_extension := coalesce(v_attempt.extension_minutes, 0) + v_credit_min;

  update public.exam_attempts
     set pause_reasons = '{}',
         paused_at = null,
         pause_intervals = v_intervals,
         pause_credited_ms = v_total_ms,
         extension_minutes = v_extension
   where id = p_attempt_id;

  return jsonb_build_object('paused', false, 'reasons', '{}', 'credited_minutes', v_credit_min, 'extension_minutes', v_extension);
end;
$$;

-- Supabase's default privileges grant EXECUTE to anon/authenticated on new
-- functions: revoke from every non-server role explicitly, or a signed-in
-- student could call the pause RPC directly through PostgREST.
revoke all on function public.exam_attempt_set_pause(uuid, text, boolean, timestamptz) from public, anon, authenticated;
grant execute on function public.exam_attempt_set_pause(uuid, text, boolean, timestamptz) to service_role;
