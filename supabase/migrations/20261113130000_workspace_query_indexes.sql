-- Additive performance indexes only. No data, RLS, privileges or exam state changes.
-- Small live tables were inspected before applying. Fail fast rather than waiting
-- behind active examination writes. For much larger installations, build these
-- indexes CONCURRENTLY outside a transaction during a controlled rollout.
set local lock_timeout = '2s';
set local statement_timeout = '30s';

create index if not exists exams_org_created_idx on public.exams (organization_id, created_at desc);
create index if not exists exams_quiz_idx on public.exams (quiz_id);
create index if not exists exam_attempts_exam_started_idx on public.exam_attempts (exam_id, started_at desc);
create index if not exists quizzes_org_updated_idx on public.quizzes (organization_id, updated_at desc);
create index if not exists quiz_sessions_org_created_idx on public.quiz_sessions (organization_id, created_at desc);
create index if not exists quiz_sessions_host_idx on public.quiz_sessions (host_id);
create index if not exists notifications_user_created_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_user_unread_idx on public.notifications (user_id) where read_at is null;
create index if not exists exam_answers_question_idx on public.exam_answers (question_id);
create index if not exists student_enrollments_org_status_class_idx on public.student_enrollments (organization_id, status, class_id);
