-- ═══════════════════════════════════════════════════════════════════════
-- EVALORA — migration 0096
-- Link-expiry policy enforcement + shared-device candidate access repair.
--
-- WHY
--   1. Migration 0076 backfilled `exams.invite_expires_at` ONCE. Every
--      examination created afterwards — through the admin console, the
--      dashboard, or content migrations (0082–0095) — was born with
--      `invite_expires_at = NULL` and `invite_no_expiry = false`. The shared
--      display rule (src/lib/examLink.ts `examLinkLifecycle`) treats that
--      combination as EXPIRED, so brand-new published links (including the
--      six Formative Assessments seeded on 2026-11-12) were shown as
--      "Expired" immediately after creation, while the admission rule
--      (src/lib/exam-access.ts `examAccessAvailability`) still admitted
--      candidates — the exact inconsistency reported in production.
--   2. `uq_exam_candidate_guest` bound ONE candidate record per
--      (examination, browser). A second student entering the SAME valid
--      link and code on a shared device (computer lab) was rejected with
--      409 even though the assessment is intended for a whole class.
--
-- WHAT (all additive; no attempt, answer, timer, token or code is touched)
--   1. Backfills a policy-default expiry for links that have none and no
--      explicit exemption, using the documented 0076 formula:
--      greatest(window/creation + policy default_days, now() + 7 days).
--      Links that are open today therefore never lose access; they gain an
--      honest, displayed expiration.
--   2. Adds a BEFORE INSERT OR UPDATE trigger that guarantees the platform
--      policy ("links expire unless expressly exempted") for every FUTURE
--      creation path, so a null-expiry link can never be born again.
--   3. Replaces the per-browser candidate uniqueness index with a
--      per-browser-PERSON index (exam, browser key, normalized first name,
--      normalized last name, class). The same student on the same browser
--      still maps to exactly one candidate (no duplicate attempts from
--      repeated clicks / concurrent retries); a DIFFERENT authorized
--      student on a shared device now gets their own candidate and their
--      own independent attempt.
--   4. Adds an index for matching an authenticated student's own candidate
--      record across devices.
--
-- DEPLOYMENT SAFETY
--   * `lock_timeout` makes the migration fail (retryable, changes nothing)
--     instead of queueing behind a candidate who is autosaving.
--   * The backfill only writes rows whose expiry is NULL — rows that are
--     currently ADMITTING candidates — and gives them a FUTURE expiry, so
--     no student is locked out and nothing in progress is altered.
--   * Dropping/recreating candidate indexes is a metadata operation on a
--     tiny table; attempt rows reference candidate ids, not indexes.
-- ═══════════════════════════════════════════════════════════════════════

set lock_timeout = '5s';

-- ─── 1. Backfill policy-default expirations ───────────────────────────
do $$
declare
  v_days integer;
begin
  select coalesce(
           min(case when value->>'default_days' ~ '^[0-9]+$'
                    then least(365, greatest(1, (value->>'default_days')::integer))
               end),
           30)
    into v_days
    from public.platform_settings
   where key = 'exam_link_policy';

  update public.exams e
     set invite_expires_at = greatest(
           coalesce(e.ends_at, e.starts_at, e.created_at, now())
             + make_interval(days => v_days),
           now() + interval '7 days'
         ),
         invite_expiry_policy = coalesce(e.invite_expiry_policy, 'backfilled_30_days')
   where e.invite_expires_at is null
     and e.invite_no_expiry = false;
end $$;

-- ─── 2. Guarantee the policy for every future write ───────────────────
-- SECURITY DEFINER: platform_settings is RLS-restricted, and examinations
-- are also inserted by tenant-scoped roles (dashboard). The function only
-- reads the link policy and fills NEW.invite_expires_at; it never widens
-- any other access.
create or replace function public.exam_link_expiry_default()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days integer;
begin
  -- An explicit, policy-permitted exemption may legitimately be permanent.
  if new.invite_no_expiry then
    return new;
  end if;
  if new.invite_expires_at is not null then
    return new;
  end if;

  select coalesce(
           min(case when value->>'default_days' ~ '^[0-9]+$'
                    then least(365, greatest(1, (value->>'default_days')::integer))
               end),
           30)
    into v_days
    from public.platform_settings
   where key = 'exam_link_policy';

  new.invite_expires_at := greatest(
    coalesce(new.ends_at, new.starts_at, new.created_at, now())
      + make_interval(days => v_days),
    now() + interval '7 days'
  );
  if new.invite_expiry_policy is null then
    new.invite_expiry_policy := 'backfilled_30_days';
  end if;
  return new;
end $$;

drop trigger if exists trg_exam_link_expiry_default on public.exams;
create trigger trg_exam_link_expiry_default
  before insert or update of invite_expires_at, invite_no_expiry on public.exams
  for each row execute function public.exam_link_expiry_default();

comment on trigger trg_exam_link_expiry_default on public.exams is
  'Platform policy: an examination link always carries an explicit expiration unless invite_no_expiry exempts it. A missing expiry is filled from platform_settings.exam_link_policy default_days (fallback 30), floored at now() + 7 days.';

-- ─── 3. Shared-device candidate identity ──────────────────────────────
-- The browser key still scopes a candidate to the device that created it
-- (so a returning student resumes their own attempt), but it no longer
-- blocks a DIFFERENT authorized student who uses the same shared link and
-- access code on the same device. Uniqueness is now per person per
-- browser: same exam + same browser + same normalized name + same class.
drop index if exists public.uq_exam_candidate_guest;

create unique index if not exists uq_exam_candidate_shared_identity
  on public.exam_candidates (
    exam_id,
    guest_key_hash,
    lower(btrim(coalesce(first_name, ''))),
    lower(btrim(coalesce(last_name, ''))),
    class_id
  )
  where guest_key_hash is not null;

comment on index public.uq_exam_candidate_shared_identity is
  'One shared-link candidate per person per browser: repeated clicks and concurrent retries converge on one candidate row, while different students on a shared device each get their own candidate and attempt.';

-- ─── 4. Cross-device matching for authenticated students ──────────────
create index if not exists idx_exam_candidates_student
  on public.exam_candidates (exam_id, student_id)
  where student_id is not null;
