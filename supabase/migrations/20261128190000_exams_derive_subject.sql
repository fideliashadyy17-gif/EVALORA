-- Give every examination a subject, so the subject policies can actually bind.
--
-- WHAT WAS STILL BROKEN AFTER 20261128170000
--
-- That migration added `exams.subject_id` and put `can_author_subject` in the
-- exam policies. Measured in production afterwards:
--
--   organization                exams  with_subject_id  name in settings
--   EVALORA DEMO ACADEMY            2                0                 1
--   Oak International School       50                0                12
--
-- Zero of fifty-two. The dashboard examination form records the subject as a
-- NAME inside `settings`, and the AI paper builder does the same, because
-- `subjects` is an optional catalogue most schools have not filled in. So the
-- column the policy reads was NULL on every row, and `can_author_subject` treats
-- NULL as unrestricted — deliberately, so the corpus stays editable. The result
-- is a policy that is present, correct in form, and never consulted in practice.
-- A migration existing is not the same as a rule holding.
--
-- WHAT THIS DOES
--
-- A trigger on INSERT and UPDATE derives `subject_id` from the subject name
-- already being stored, matching case-insensitively within the same
-- organization. It runs server-side, which matters because the writes come from
-- three places that must not each need to remember: the dashboard form, the AI
-- examination builder (`createExaminationFromForm`) and any future caller. The
-- application paths are also updated to set the id directly; the trigger is what
-- makes that true for paths nobody has written yet.
--
-- Deliberate behaviour:
--
--   * It never overwrites an `subject_id` a caller set explicitly.
--   * It only fills the column when the name matches exactly one subject in the
--     same tenant. No match, or an ambiguous match, leaves NULL — the same
--     unrestricted case as before. Guessing here would scope a paper to a
--     subject the school never chose, which is worse than not scoping it.
--   * It is not `security definer`: it reads `subjects` as the caller. Under a
--     browser session the row must be visible to that member anyway, and a
--     definer trigger would let a member of one tenant resolve a name against
--     another tenant's catalogue.
--
-- EXISTING ROWS
--
-- Backfilled in the same statement shape, for rows whose stored name resolves
-- unambiguously. 12 of 50 Oak papers and 1 of 2 Demo papers qualify today; the
-- rest stay NULL and behave exactly as before. Nothing is renamed, no status
-- changes, no examination content is touched.

/* ── derivation ─────────────────────────────────────────────────────────── */

create or replace function public.exams_derive_subject()
returns trigger
language plpgsql
as $$
declare
  v_name text;
  v_id   uuid;
  v_hits int;
begin
  -- An explicitly chosen id always wins.
  if new.subject_id is not null then
    return new;
  end if;

  v_name := nullif(btrim(coalesce(new.settings ->> 'subject', '')), '');
  if v_name is null then
    return new;
  end if;

  -- `min(uuid)` does not exist, so the id is taken with a scalar subquery and
  -- the count is what guards it: exactly one row, or no change.
  select count(*)
    into v_hits
    from public.subjects s
   where s.organization_id = new.organization_id
     and lower(btrim(s.name)) = lower(v_name);

  if v_hits = 1 then
    select s.id
      into v_id
      from public.subjects s
     where s.organization_id = new.organization_id
       and lower(btrim(s.name)) = lower(v_name);
    new.subject_id := v_id;
  end if;

  return new;
end;
$$;

comment on function public.exams_derive_subject() is
  'Fills exams.subject_id from the subject name stored in settings when exactly one subject in the same organization matches. Leaves NULL rather than guessing.';

drop trigger if exists exams_derive_subject on public.exams;
create trigger exams_derive_subject
  before insert or update of settings, subject_id on public.exams
  for each row execute function public.exams_derive_subject();

/* ── backfill the rows that resolve unambiguously ───────────────────────── */

update public.exams e
   set subject_id = m.id
  from (
        select x.id as exam_id, (array_agg(s.id))[1] as id
          from public.exams x
          join public.subjects s
            on s.organization_id = x.organization_id
           and lower(btrim(s.name)) = lower(btrim(coalesce(x.settings ->> 'subject', '')))
         where x.subject_id is null
           and nullif(btrim(coalesce(x.settings ->> 'subject', '')), '') is not null
         group by x.id
        having count(*) = 1
       ) m
 where e.id = m.exam_id
   and e.subject_id is null;

/* ── questions: same reasoning, smaller gap ─────────────────────────────── */

-- 558 of 2,492 questions have no subject, and the question editor does capture
-- one (`subject_id`), so the gap is content authored before the field existed
-- rather than a missing write path. Nothing is inferred there: a question's
-- subject is not recoverable from its text, and inventing one would move a row
-- out of the grandfathered branch on a guess.
