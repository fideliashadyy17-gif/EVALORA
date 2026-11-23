-- Enforce class/student plan quotas at the database trust boundary. The earlier
-- quota trigger covered exams, quizzes, questions, and memberships, but left
-- these school-management rows unmetered.
--
-- A per-organization row lock is acquired before counting. Every quota trigger
-- uses this function, so concurrent inserts across quota-controlled tables for
-- the same tenant cannot both observe the same remaining slot and overrun it.
-- Updates are intentionally not metered: they do not add a tenant resource.

create or replace function public.enforce_plan_quota()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_table text := tg_argv[0];
  v_key text := tg_argv[1];
  v_label text := tg_argv[2];
  v_org uuid;
  v_limit integer;
  v_count integer;
begin
  v_org := nullif(to_jsonb(new) ->> 'organization_id', '')::uuid;
  if v_org is null then
    return new;
  end if;

  -- Service-role work and Platform Owner actions are explicitly unmetered.
  -- Tenant-authenticated writes are serialized before checking their quota.
  if auth.uid() is null or public.is_super_admin() then
    return new;
  end if;

  perform 1 from public.organizations where id = v_org for update;
  if not found then
    return new;
  end if;

  v_limit := public.org_limit(v_org, v_key);
  if v_limit < 0 then
    return new;
  end if;

  execute format('select count(*) from public.%I where organization_id = $1', v_table)
    into v_count using v_org;

  if v_count >= v_limit then
    raise exception 'This workspace has reached its plan limit for % (%). Upgrade the plan to add more.', v_label, v_limit
      using detail = 'PLAN_LIMIT:' || v_key || ':' || v_limit,
            hint = 'Ask an owner or administrator to upgrade the plan in Billing.';
  end if;

  return new;
end $$;

-- The table names are fixed trigger arguments, never caller-controlled input.
drop trigger if exists plan_quota_classes on public.classes;
create trigger plan_quota_classes
  before insert on public.classes
  for each row execute function public.enforce_plan_quota('classes', 'max_classes', 'classes');

drop trigger if exists plan_quota_students on public.students;
create trigger plan_quota_students
  before insert on public.students
  for each row execute function public.enforce_plan_quota('students', 'max_students', 'students');
