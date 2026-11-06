-- Support the referential guards and FK retention checks as data grows.
-- Partial indexes omit null observation links; existing data is unchanged.
create index if not exists idx_exam_attempts_candidate_id on public.exam_attempts(candidate_id);
create index if not exists idx_proctoring_incidents_exam_id on public.proctoring_incidents(exam_id);
create index if not exists idx_proctoring_incidents_candidate_id on public.proctoring_incidents(candidate_id) where candidate_id is not null;
create index if not exists idx_proctoring_incidents_attempt_id on public.proctoring_incidents(attempt_id) where attempt_id is not null;
