-- ═══════════════════════════════════════════════════════════════════════
-- Question-level assessment mapping (Paper Builder → Examination → Marking)
-- ═══════════════════════════════════════════════════════════════════════
-- ADDITIVE ONLY. No existing column, row, constraint, policy or trigger is
-- modified, and no data is written or removed here.
--
-- Why: the Paper Builder must let a teacher associate grading framework,
-- MYP criteria and individual strands (or framework-appropriate elements)
-- with EACH question of a paper, and that mapping must survive into the
-- examination and marking workflows.
--
-- Where: `quiz_questions` is the paper↔question association row (unique per
-- paper+question, ordered by position, read by exam runtime via
-- exams.quiz_id). Storing the mapping here keeps it per-paper (the same
-- bank question may map to different criteria in different papers) and
-- avoids duplicating data in quiz settings.
--
-- Shape (jsonb, nullable — existing rows stay NULL = "no mapping", fully
-- valid): see src/lib/questionAssessment.ts
--   { version: 1, curriculum, grading_system_id, reference, saved_at,
--     myp?: <same snapshot shape as exams.settings.myp_grading>,
--     elements?: [{code,label,description}] }
-- Titles/descriptions are COPIED into the row at save time (assessment
-- snapshot), so later reference-library edits never rewrite a historical
-- paper's mapping.
--
-- Integrity: the existing quiz_questions_assessment_source_guard already
-- freezes every quiz_questions mutation (including this column) once a
-- candidate attempt or live session uses the paper — historical mappings
-- cannot be silently modified after use. quiz_question_tenant_guard only
-- fires "before insert or update of quiz_id, question_id" and is untouched.

alter table public.quiz_questions
  add column if not exists assessment jsonb;

comment on column public.quiz_questions.assessment is
  'Per-question assessment mapping snapshot (framework, MYP criteria/strands or generic elements). NULL = unmapped, valid.';
