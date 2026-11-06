-- AI-assisted marking, built as a proposal-and-review flow.
--
-- `grading_method` already allowed 'ai_assisted' and `grade_change_log` already
-- allowed a change_type of the same name, but nothing wrote either: there is no
-- model credential anywhere in this project, so any code that "generated" marks
-- would be inventing them. Instead a suggestion is stored, a human decides, and
-- only that decision touches a mark. The audit label becomes reachable exactly
-- through that human step.
--
-- Proposals are written by the server with the service role after it has
-- authorised the caller; there is deliberately no insert policy, so a client
-- cannot fabricate a suggestion and have it look like a model's.

create table if not exists public.ai_marking_proposals (
  id uuid primary key default gen_random_uuid(),
  answer_id uuid not null references public.exam_answers(id) on delete cascade,
  attempt_id uuid not null references public.exam_attempts(id) on delete cascade,
  exam_id uuid not null references public.exams(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  rubric_id uuid not null references public.grading_rubrics(id) on delete cascade,
  criterion_id uuid not null references public.grading_rubric_criteria(id) on delete cascade,
  proposed_marks numeric(10,2) not null check (proposed_marks >= 0),
  rationale text not null check (char_length(rationale) between 1 and 2000),
  provider text not null check (char_length(provider) between 1 and 40),
  model text not null check (char_length(model) between 1 and 120),
  prompt_digest text check (prompt_digest is null or char_length(prompt_digest) = 64),
  answer_digest text check (answer_digest is null or char_length(answer_digest) = 64),
  status text not null default 'proposed' check (status in ('proposed','accepted','rejected','superseded')),
  requested_by uuid references public.profiles(id) on delete set null,
  decided_by uuid references public.profiles(id) on delete set null,
  decided_marks numeric(10,2),
  decision_note text check (decision_note is null or char_length(decision_note) <= 2000),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index if not exists idx_ai_proposals_answer on public.ai_marking_proposals(answer_id, status);
create index if not exists idx_ai_proposals_org on public.ai_marking_proposals(organization_id, created_at desc);
-- One live suggestion per criterion: a newer suggestion supersedes the old one
-- rather than sitting beside it and inviting a double decision.
create unique index if not exists uq_ai_proposals_live
  on public.ai_marking_proposals(answer_id, criterion_id) where status = 'proposed';
