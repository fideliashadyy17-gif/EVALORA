-- EVALORA 0007 — harmonize academic-structure fields used by the new
-- school Academic Management module with the existing 0003 model.
-- (classes.teacher_id remains the class-teacher column from 0003.)
alter table public.classes
  add column if not exists department_id uuid references public.departments(id) on delete set null;
alter table public.education_levels
  add column if not exists code text;
alter table public.departments
  add column if not exists code text,
  add column if not exists sort int not null default 0;
alter table public.subjects
  add column if not exists level_id uuid references public.education_levels(id) on delete set null,
  add column if not exists sort int not null default 0;
create index if not exists classes_department_idx on public.classes (department_id);
create index if not exists subjects_level_idx on public.subjects (level_id);
alter table public.student_enrollments drop constraint if exists student_enrollments_status_check;
alter table public.student_enrollments add constraint student_enrollments_status_check
  check (status in ('active','completed','withdrawn','transferred'));
