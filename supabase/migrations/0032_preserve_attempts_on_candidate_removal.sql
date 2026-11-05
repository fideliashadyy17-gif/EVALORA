-- Deleting a candidate used to cascade-delete their examination attempts and
-- answers, including by accident through an exam deletion. Preserve historical
-- assessment data: a candidate with attempts must not be removed until an
-- explicit, separately authorized retention/deletion workflow exists.
-- FK enforcement also closes the race between an app-level attempt check and
-- a concurrent attempt insert. This migration does not delete or update rows.
alter table public.exam_attempts drop constraint if exists exam_attempts_candidate_id_fkey;
alter table public.exam_attempts add constraint exam_attempts_candidate_id_fkey
  foreign key (candidate_id) references public.exam_candidates(id) on delete restrict;
