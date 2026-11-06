-- Plan limits were advisory: `withinLimit()` ran in four server actions only, so
-- anything speaking to PostgREST directly — or a race between two requests —
-- could exceed a plan freely. The database is the only trust boundary, so the
-- limits are enforced here, in the same place the rows are written.
--
-- This mirrors the resolution in `src/lib/entitlements.ts` exactly:
--   hard-coded free defaults  <  free plan row  <  active/trialing plan
--   <  subscription limits_override
-- A lapsed trial or period falls back to the free plan, as the TypeScript does.

-- The metered subset of FREE_LIMITS. Booleans (proctoring, reports) are feature
-- gates, not counters, and are not enforced here.
create or replace function public.free_plan_defaults()
returns jsonb language sql immutable set search_path = public as $$
  select '{"max_quizzes":5,"max_participants_per_session":30,"max_exams":2,"max_members":3,"max_questions":100,"storage_mb":100,"max_classes":-1,"max_students":-1}'::jsonb
$$;

create or replace function public.org_entitlement_limits(p_org uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_limits jsonb := public.free_plan_defaults();
  v_free jsonb;
  v_status text;
  v_period_end timestamptz;
  v_trial_end timestamptz;
  v_plan jsonb;
  v_override jsonb;
  v_end timestamptz;
begin
  select jsonb_strip_nulls(limits) into v_free
    from public.plans where slug = 'free' limit 1;
  if v_free is not null then
    v_limits := v_limits || v_free;
  end if;

  select s.status,
         s.current_period_end,
         s.trial_ends_at,
         jsonb_strip_nulls(p.limits),
         jsonb_strip_nulls(coalesce(s.limits_override, '{}'::jsonb))
    into v_status, v_period_end, v_trial_end, v_plan, v_override
    from public.subscriptions s
    join public.plans p on p.id = s.plan_id
   where s.organization_id = p_org
     and s.status in ('active', 'trialing')
   order by s.created_at desc
   limit 1;

  if v_status is not null then
    v_end := case when v_status = 'trialing' then v_trial_end else v_period_end end;
    -- No end date means no expiry; a past end date means the plan no longer applies.
    if v_end is null or v_end > now() then
      if v_plan is not null then
        v_limits := v_limits || v_plan;
      end if;
      v_limits := v_limits || coalesce(v_override, '{}'::jsonb);
    end if;
  end if;

  return v_limits;
end $$;

-- Returns the numeric limit for one key, or -1 for unlimited / unspecified.
create or replace function public.org_limit(p_org uuid, p_key text)
returns integer
language sql stable security definer set search_path = public as $$
  select case
           when jsonb_typeof(public.org_entitlement_limits(p_org) -> p_key) = 'number'
             then (public.org_entitlement_limits(p_org) ->> p_key)::int
           else -1
         end
$$;

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

  -- Unattributable writes (service role, migrations, scheduled jobs) and the
  -- platform owner are not metered. Ordinary authenticated writes are, which is
  -- what closes the PostgREST hole. Note the deliberate consequence: a service
  -- role can still exceed a plan, because it is root by definition.
  if auth.uid() is null or public.is_super_admin() then
    return new;
  end if;

  v_limit := public.org_limit(v_org, v_key);
  if v_limit < 0 then
    return new;
  end if;

  execute format('select count(*) from public.%I where organization_id = $1', v_table)
    into v_count using v_org;

  if v_count >= v_limit then
    -- The message is what a person reads; the code lives in DETAIL so server
    -- actions can map it to their own upgrade prompt without parsing prose.
    raise exception 'This workspace has reached its plan limit for % (%). Upgrade the plan to add more.', v_label, v_limit
      using detail = 'PLAN_LIMIT:' || v_key || ':' || v_limit,
            hint = 'Ask an owner or administrator to upgrade the plan in Billing.';
  end if;

  return new;
end $$;

drop trigger if exists plan_quota_exams on public.exams;
create trigger plan_quota_exams
  before insert on public.exams
  for each row execute function public.enforce_plan_quota('exams', 'max_exams', 'examinations');

drop trigger if exists plan_quota_quizzes on public.quizzes;
create trigger plan_quota_quizzes
  before insert on public.quizzes
  for each row execute function public.enforce_plan_quota('quizzes', 'max_quizzes', 'quizzes');

drop trigger if exists plan_quota_questions on public.questions;
create trigger plan_quota_questions
  before insert on public.questions
  for each row execute function public.enforce_plan_quota('questions', 'max_questions', 'questions');

drop trigger if exists plan_quota_members on public.organization_members;
create trigger plan_quota_members
  before insert on public.organization_members
  for each row execute function public.enforce_plan_quota('organization_members', 'max_members', 'team members');

-- Invitation acceptance previously wrote organization_members with the service
-- role, so it skipped metering entirely: a workspace could invite past its plan
-- and every acceptance would succeed. This does the check and the insert in one
-- transaction, taking an organisation lock first so two simultaneous accepts
-- cannot both pass the count.
create or replace function public.accept_invitation(p_token text, p_user uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_inv record;
  v_limit integer;
  v_count integer;
begin
  select * into v_inv
    from public.invitations
   where token = p_token and status = 'pending'
   for update;
  if not found then
    return 'invalid';
  end if;
  if v_inv.expires_at is not null and v_inv.expires_at < now() then
    return 'expired';
  end if;

  -- Serialise membership changes for this organisation.
  perform 1 from public.organizations where id = v_inv.organization_id for update;

  if exists (
    select 1 from public.organization_members
     where organization_id = v_inv.organization_id and user_id = p_user
  ) then
    update public.invitations set status = 'accepted' where id = v_inv.id;
    return 'ok';
  end if;

  v_limit := public.org_limit(v_inv.organization_id, 'max_members');
  if v_limit >= 0 then
    select count(*) into v_count
      from public.organization_members
     where organization_id = v_inv.organization_id;
    if v_count >= v_limit then
      return 'limit';
    end if;
  end if;

  insert into public.organization_members(organization_id, user_id, role, status)
  values (v_inv.organization_id, p_user, v_inv.role, 'active');
  update public.invitations set status = 'accepted' where id = v_inv.id;
  return 'ok';
end $$;

-- Server-only: the app verifies the invitation email against the session before
-- calling this, so it must not be exposed to clients.
revoke all on function public.accept_invitation(text, uuid) from anon, authenticated;

-- Deliberately NOT enforced here yet, and not claimed anywhere:
--   * max_participants_per_session — a live-session admission rule, not a row
--     count; it belongs with the join path.
--   * max_classes / max_students — both default to unlimited, so a trigger
--     would be dead code today; wire them with the institutional rollout.
--   * storage_mb — needs a file-size ledger that does not exist yet.
-- The trigger function is invoked by the system, not by clients; it is left at
-- default EXECUTE so firing is never gated on a grant.
revoke all on function public.org_entitlement_limits(uuid) from anon;
grant execute on function public.org_entitlement_limits(uuid) to authenticated;
grant execute on function public.org_limit(uuid, text) to authenticated;
