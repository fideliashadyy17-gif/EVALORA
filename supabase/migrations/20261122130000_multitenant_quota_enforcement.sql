-- Multitenant Quota & Capacity Enforcement for Educational Organizations
--
-- Extends the database-authoritative quota triggers from migration 0037 to:
-- 1. Students roster ('students', 'max_students', 'students')
-- 2. Classes structure ('classes', 'max_classes', 'classes')
--
-- As in 0037, when max_students or max_classes is -1 (unlimited),
-- public.org_limit() returns -1 and the trigger returns NEW immediately.
-- When a quota is set or overridden by the Super Admin, PostgREST direct writes
-- and simultaneous concurrent requests are authoritatively bounded.

drop trigger if exists plan_quota_students on public.students;
create trigger plan_quota_students
  before insert on public.students
  for each row execute function public.enforce_plan_quota('students', 'max_students', 'students');

drop trigger if exists plan_quota_classes on public.classes;
create trigger plan_quota_classes
  before insert on public.classes
  for each row execute function public.enforce_plan_quota('classes', 'max_classes', 'classes');
