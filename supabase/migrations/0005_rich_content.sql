-- EVALORA 0005: structured rich content for questions + exam extensions.
--
-- The unified mathematical editor stores a structured document (Tiptap JSON:
-- paragraphs, marks, lists, tables, images, and math nodes carrying LaTeX
-- source) alongside the legacy plain-text columns. prompt / explanation /
-- label remain the derived plain-text rendering (math as $…$ / $$…$$) so
-- every pre-existing renderer keeps working; new renderers prefer *_doc.
-- Existing rows have NULL docs and render from text exactly as before.

alter table public.questions
  add column if not exists prompt_doc jsonb,
  add column if not exists explanation_doc jsonb;

alter table public.question_options
  add column if not exists content_doc jsonb;

comment on column public.questions.prompt_doc is
  'Structured editor document (Tiptap JSON) for the question prompt; math nodes carry LaTeX source.';
comment on column public.question_options.content_doc is
  'Structured editor document (Tiptap JSON) for this answer option; each option is independent.';

-- Per-candidate authorized extensions (Part 1.6): the server deadline becomes
-- min(started_at + duration + extension, exam ends_at) — enforced by the
-- exam APIs, not by a frontend countdown.
alter table public.exam_attempts
  add column if not exists extension_minutes int not null default 0
    check (extension_minutes >= 0 and extension_minutes <= 1440);

comment on column public.exam_attempts.extension_minutes is
  'Authorized extra minutes granted to this candidate by an administrator; included in the server-side deadline.';
