-- Subject-level authorization in the database policies.
--
-- WHAT WAS WRONG
--
-- Every write policy on questions and examinations called the same predicate:
--
--   questions.q_insert   WITH CHECK  can_create_content(organization_id)
--   questions.q_update   USING       can_create_content(organization_id)
--                        WITH CHECK  can_create_content(organization_id)
--   questions.q_delete   USING       can_create_content(organization_id)
--   exams.exam_*         same shape
--
-- and `can_create_content(p_org)` is
--
--   select coalesce(public.org_role(p_org) in ('owner','admin','teacher','organizer'), false)
--
-- It takes an ORGANIZATION ID and nothing else. There is no class, no subject and
-- no academic year in the question it asks, so the answer cannot depend on any of
-- them. Any member whose role is `teacher` may UPDATE any question and any
-- examination in the school. A Physics teacher holds write access to the
-- Literature examination; the homeroom teacher of JSS 1A holds write access to
-- every subject taught in JSS 1A and in every other class.
--
-- `teaching_assignments` (20261128160000) supplies the missing dimensions and
-- `can_author_subject(org, subject)` answers the narrower question. This
-- migration puts that predicate where it belongs — in the policies, so the
-- restriction survives a caller that forgets to check, including the service-role
-- path the AI Core uses.
--
-- WHAT EACH CLAUSE BECOMES
--
--   INSERT  (WITH CHECK only)  the NEW row's subject must be authorable
--   UPDATE  USING              the OLD row's subject must be authorable
--           WITH CHECK         the NEW row's subject must be authorable
--   DELETE  (USING only)       the OLD row's subject must be authorable
--
-- The two UPDATE clauses are not redundant. USING alone would let a teacher take
-- a question they may edit and MOVE it into a subject they may not touch: the old
-- row passes the check, the new row is never examined. WITH CHECK closes that.
--
-- HOMEROOM IS NOT CONSULTED. A teacher whose only responsibility is
-- `class_teacher` gains nothing here, which is the point: pastoral authority is
-- not subject authority.
--
-- EXISTING DATA AND EXISTING BEHAVIOUR
--
-- `can_author_subject` treats a teacher with no teaching assignment at all as
-- unrestricted, and a NULL subject as unrestricted. Both matter:
--
--   * there are zero teaching assignments in production today, so without the
--     first rule this migration would lock every teacher out of every question
--     the moment it ran;
--   * 558 of 2,492 questions have no subject and 5 of 52 examinations have no
--     class, so without the second rule those rows could no longer be edited by
--     anyone below admin.
--
-- In other words this migration changes nothing observable until an administrator
-- records assignments — and then, and only then, does it start enforcing. That is
-- deliberate: it is the difference between a fix and an outage.

/* ── questions ─────────────────────────────────────────────────────────── */

drop policy if exists q_insert on public.questions;
create policy q_insert on public.questions
  for insert to authenticated
  with check (
    public.is_super_admin()
    or public.can_author_subject(organization_id, subject_id)
  );

drop policy if exists q_update on public.questions;
create policy q_update on public.questions
  for update to authenticated
  using (
    public.is_super_admin()
    or public.can_author_subject(organization_id, subject_id)
  )
  with check (
    public.is_super_admin()
    or public.can_author_subject(organization_id, subject_id)
  );

drop policy if exists q_delete on public.questions;
create policy q_delete on public.questions
  for delete to authenticated
  using (
    public.is_super_admin()
    or public.can_author_subject(organization_id, subject_id)
  );

/* ── examinations ──────────────────────────────────────────────────────── */

-- `exams` had no subject column at all, so there was nothing to scope an
-- examination to and no way to say "this paper is Mathematics". Added nullable
-- and without a default: existing rows keep NULL, which `can_author_subject`
-- treats as unrestricted, so the five examinations with no class and the whole
-- existing corpus stay editable exactly as before.
alter table public.exams
  add column if not exists subject_id uuid references public.subjects (id) on delete set null;

create index if not exists exams_subject_idx on public.exams (subject_id);

comment on column public.exams.subject_id is
  'The subject this paper examines. NULL on papers created before teaching assignments existed; can_author_subject treats NULL as unrestricted so those remain editable by their authors.';

drop policy if exists exam_insert on public.exams;
create policy exam_insert on public.exams
  for insert to authenticated
  with check (
    public.is_super_admin()
    or public.can_author_subject(organization_id, subject_id)
  );

drop policy if exists exam_update on public.exams;
create policy exam_update on public.exams
  for update to authenticated
  using (
    public.is_super_admin()
    or public.can_author_subject(organization_id, subject_id)
  )
  with check (
    public.is_super_admin()
    or public.can_author_subject(organization_id, subject_id)
  );

drop policy if exists exam_delete on public.exams;
create policy exam_delete on public.exams
  for delete to authenticated
  using (
    public.is_super_admin()
    or public.can_author_subject(organization_id, subject_id)
  );

/* ── SELECT: reviewed, deliberately unchanged ──────────────────────────── */

-- The write policies above are the security boundary the brief describes: the
-- defect was unauthorised MODIFICATION. Read access stays organization-wide, and
-- that is a considered decision rather than an omission:
--
--   * `questions.q_select` / `exams.exam_select` use `staff_org_ids()`, which is
--     already tenant-scoped — a teacher in Demo Academy cannot read Oak's bank.
--   * Teachers legitimately reference material outside their own subjects when
--     assembling a paper, moderating a colleague's work, or reading a shared
--     curriculum, and the question bank page has no subject filter that would
--     survive narrowing.
--   * Several dashboard surfaces (consolidation, grade adjustments, hints, all
--     under src/app/dashboard/exams/[id]/) read through the service-role client,
--     which bypasses RLS entirely. Narrowing SELECT would therefore not bind
--     those pages even if it were added here, and would give a false sense of a
--     boundary that does not hold.
--
-- Read scope is enforced in the application layer where it is actually needed —
-- marking, results and reports already resolve through `canOperate` — and that is
-- stated in the report rather than implied by a policy that does not do the job.
