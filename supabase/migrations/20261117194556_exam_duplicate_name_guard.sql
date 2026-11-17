-- Duplicate-examination participation guard.
--
-- A candidate identity (printed full name, case/whitespace-normalised) may
-- create only ONE self-service shared-link candidate record for a given
-- examination. Existing duplicate rows are intentionally preserved: this is a
-- forward-only guard, not a data cleanup, so no attempt, answer, result,
-- candidate, class or examination is deleted or rewritten.
--
-- The generated name_key column and index also make the admission route's
-- pre-insert lookup cheap and deterministic. The trigger is the race-safe
-- authority: an advisory transaction lock serialises simultaneous joins for
-- the same exam + name, so two tabs/devices cannot both pass a check and then
-- both insert.
--
-- Scope: only self-service shared-link rows (source = 'shared_link' and a
-- browser guest key). Organizer-created rosters, personal candidate codes,
-- approved retakes, read-only re-entry and every other examination workflow are
-- unchanged.

begin;

alter table public.exam_candidates
  add column if not exists name_key text
  generated always as (
    lower(regexp_replace(btrim(coalesce(full_name, '')), '[[:space:]]+', ' ', 'g'))
  ) stored;

create index if not exists idx_exam_candidates_name_key
  on public.exam_candidates (exam_id, name_key);

comment on column public.exam_candidates.name_key is
  'Canonical printed name (NFKC-equivalent lower-case, whitespace-collapsed) used by the duplicate-participation guard. Generated; never written directly.';

create or replace function public.evalora_guard_exam_candidate_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
  v_duplicate uuid;
begin
  -- Only the self-service shared-link path. Personal candidate codes,
  -- organizer rosters, retakes and imported historical rows keep working.
  if new.source is distinct from 'shared_link' or new.guest_key_hash is null then
    return new;
  end if;

  v_key := lower(regexp_replace(btrim(coalesce(new.full_name, '')), '[[:space:]]+', ' ', 'g'));
  if v_key = '' then
    return new;
  end if;

  -- Serialise concurrent admissions for the same exam + name. Names that hash
  -- to the same bucket only wait for one another; they are never merged.
  perform pg_advisory_xact_lock(
    hashtext('exam-candidate:' || new.exam_id::text || ':' || v_key)::bigint
  );

  -- Organizer identification fields (student number / matricule / email)
  -- disambiguate genuine homonyms. A same-name row is only a duplicate when
  -- the new identity is empty, matches an existing identity, or an existing
  -- row has no identity at all. Two fully-identified, different students may
  -- therefore coexist. A repeat join by the SAME identity is still refused.
  select c.id into v_duplicate
  from public.exam_candidates c
  where c.exam_id = new.exam_id
    and c.id <> new.id
    and c.name_key = v_key
    and (
      coalesce(new.identity_data, '{}'::jsonb) = '{}'::jsonb
      or coalesce(c.identity_data, '{}'::jsonb) = '{}'::jsonb
      or c.identity_data = new.identity_data
    )
  limit 1;

  if v_duplicate is not null then
    raise exception using
      errcode = '23505',
      message = 'EXAM_CANDIDATE_DUPLICATE_NAME',
      detail = 'This candidate name has already been used for this examination.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_exam_candidate_name on public.exam_candidates;
create trigger trg_guard_exam_candidate_name
  before insert or update of full_name, source, guest_key_hash
  on public.exam_candidates
  for each row
  execute function public.evalora_guard_exam_candidate_name();

comment on function public.evalora_guard_exam_candidate_name() is
  'Forward-only duplicate-participation guard for self-service shared-link examination candidates. Existing duplicate rows are preserved.';

commit;
