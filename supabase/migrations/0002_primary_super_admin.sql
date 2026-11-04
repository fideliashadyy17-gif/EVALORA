-- ═══════════════════════════════════════════════════════════════════
-- EVALORA 0002 — Primary Super Admin & privilege hardening
--
-- 1. profiles.is_primary designates THE Primary Super Admin (max one).
-- 2. Public registration NEVER grants platform privileges anymore:
--    handle_new_user() always creates a plain 'user' profile. Super
--    Admin is granted explicitly at database/operator level only.
-- 3. protect_profile_privileges(): platform_role / is_primary can only
--    change via service_role or a database operator — closing the
--    PostgREST self-promotion path. The Primary account additionally
--    cannot be suspended or deleted through ordinary app traffic.
-- 4. admin_platform_stats() + admin_broadcast_notification() RPCs for
--    the Super Admin console (both self-guarded by is_super_admin()).
-- 5. Feature flags seed ('features' platform setting), enforced
--    server-side at the live-session / exam-creation / proctoring
--    token choke points.
-- ═══════════════════════════════════════════════════════════════════

alter table public.profiles
  add column if not exists is_primary boolean not null default false;

create unique index if not exists profiles_one_primary
  on public.profiles ((true)) where is_primary;

comment on column public.profiles.is_primary is
  'True for the single Primary Super Admin (platform owner) account.';

-- ─── Registration no longer auto-promotes ────────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, platform_role, is_primary)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    'user',
    false
  )
  on conflict (id) do nothing;
  return new;
end $$;

-- ─── Privilege immutability ──────────────────────────────────────────
-- SECURITY INVOKER on purpose: current_user must reflect the real
-- PostgREST role ('authenticated' vs 'service_role').
create or replace function public.protect_profile_privileges()
returns trigger language plpgsql set search_path = public as $$
declare
  privileged boolean := current_user in ('service_role', 'postgres')
    or session_user in ('postgres', 'supabase_admin');
begin
  if tg_op = 'DELETE' then
    if old.is_primary and not privileged then
      raise exception 'The Primary Super Admin account cannot be removed.';
    end if;
    return old;
  end if;
  if not privileged then
    if new.platform_role is distinct from old.platform_role
       or new.is_primary is distinct from old.is_primary then
      raise exception 'Platform privileges can only be changed by the platform operator.';
    end if;
    if old.is_primary and new.status is distinct from old.status then
      raise exception 'The Primary Super Admin account cannot be suspended.';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists profiles_protect_privileges on public.profiles;
create trigger profiles_protect_privileges
  before update or delete on public.profiles
  for each row execute function public.protect_profile_privileges();

-- ─── Feature flags (enforced server-side) ────────────────────────────
insert into public.platform_settings (key, value)
values ('features', '{"live_quizzes":true,"examinations":true,"proctoring":true}'::jsonb)
on conflict (key) do nothing;

-- ─── Super Admin: platform statistics ────────────────────────────────
create or replace function public.admin_platform_stats()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r record;
  c bigint;
  tables jsonb := '[]'::jsonb;
begin
  if not public.is_super_admin() then
    raise exception 'Super Admin only';
  end if;
  for r in
    select tablename from pg_tables where schemaname = 'public' order by tablename
  loop
    execute format('select count(*) from public.%I', r.tablename) into c;
    tables := tables || jsonb_build_object('table', r.tablename, 'rows', c);
  end loop;
  return jsonb_build_object(
    'database_bytes', pg_database_size(current_database()),
    'auth_users', (select count(*) from auth.users where deleted_at is null),
    'storage_objects', (select count(*) from storage.objects),
    'storage_bytes', (select coalesce(sum((metadata->>'size')::bigint), 0) from storage.objects),
    'tables', tables,
    'generated_at', now()
  );
end $$;

grant execute on function public.admin_platform_stats() to authenticated;

-- ─── Super Admin: broadcast a notification to every active user ─────
create or replace function public.admin_broadcast_notification(p_title text, p_body text, p_link text)
returns int language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  if not public.is_super_admin() then
    raise exception 'Super Admin only';
  end if;
  insert into public.notifications (user_id, type, title, body, link)
  select id, 'system', p_title, p_body, p_link
  from public.profiles
  where status = 'active';
  get diagnostics n = row_count;
  return n;
end $$;

grant execute on function public.admin_broadcast_notification(text, text, text) to authenticated;
