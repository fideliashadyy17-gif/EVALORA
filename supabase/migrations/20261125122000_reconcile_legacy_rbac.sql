-- Forward-only bridge for the schema inspected on 2026-11-25.
-- Apply ONLY after the two access_* migrations, in the same reviewed release.
-- No users, memberships, academic data or existing audit rows are modified.
-- Legacy tables remain intact as read-only archives. Unknown permission keys
-- abort the transaction; no fuzzy translation or silent loss of a DENY.
create table public.access_legacy_role_map (
 legacy_key text primary key,
 role_id uuid not null references public.access_roles(id),
 original_definition jsonb not null,
 reconciled_at timestamptz not null default now()
);
alter table public.access_legacy_role_map enable row level security;
create policy access_legacy_map_read on public.access_legacy_role_map for select to authenticated using(public.is_super_admin());
revoke all on public.access_legacy_role_map from public,anon,authenticated;
grant select on public.access_legacy_role_map to authenticated;

do $$ declare r record; mapped text; target uuid; begin
 if to_regclass('public.rbac_roles') is null then return; end if;
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='rbac_roles' and column_name='key') then
   raise exception 'Unrecognized legacy RBAC schema: reconciliation requires review'; end if;
 for r in select * from public.rbac_roles order by key loop
   mapped:=case r.key when 'owner' then 'org_owner' when 'admin' then 'org_admin' else r.key end;
   select id into target from public.access_roles where slug=mapped;
   if target is null then
     insert into public.access_roles(name,slug,description,type,is_system,is_active)
     values(r.name,mapped,r.description,r.type,r.type='system',r.status='active') returning id into target;
   elsif r.status<>'active' then
     -- Identity stays protected; preserve an explicitly inactive legacy role.
     update public.access_roles set is_active=false where id=target;
   end if;
   insert into public.access_legacy_role_map(legacy_key,role_id,original_definition)
     values(r.key,target,to_jsonb(r));
 end loop;
 if to_regclass('public.rbac_role_permissions') is not null then
   if exists(select 1 from public.rbac_role_permissions old left join public.access_permissions p on p.key=old.permission_key where p.id is null) then
     raise exception 'Unknown legacy role permission: supply an explicitly reviewed mapping before reconciliation'; end if;
   insert into public.access_role_permissions(role_id,permission_id,granted)
     select m.role_id,p.id,old.enabled from public.rbac_role_permissions old
       join public.access_legacy_role_map m on m.legacy_key=old.role_key
       join public.access_permissions p on p.key=old.permission_key
   on conflict(role_id,permission_id) do update set granted=excluded.granted;
 end if;
 if to_regclass('public.rbac_user_overrides') is not null then
   if exists(select 1 from public.rbac_user_overrides old left join public.access_permissions p on p.key=old.permission_key where p.id is null) then
     raise exception 'Unknown legacy user override: supply an explicitly reviewed mapping before reconciliation'; end if;
   -- Resolve conflicting existing/new overrides conservatively: DENY wins.
   insert into public.access_permission_overrides(user_id,organization_id,permission_id,granted,assigned_by)
     select old.user_id,old.organization_id,p.id,old.enabled,old.created_by
     from public.rbac_user_overrides old join public.access_permissions p on p.key=old.permission_key
   on conflict(user_id,organization_id,permission_id) do update
     set granted=public.access_permission_overrides.granted and excluded.granted;
 end if;
end $$;

-- The old tables must not become a second writable authority. Existing rows
-- and foreign keys stay in place, including any external references/history.
create function public.access_legacy_rbac_read_only() returns trigger language plpgsql
set search_path=public,pg_temp as $$ begin
 raise exception 'Legacy RBAC is archived; use the centralized permission center' using errcode='42501';
end $$;
do $$ declare t text; begin
 foreach t in array array['rbac_roles','rbac_role_permissions','rbac_user_overrides'] loop
   if to_regclass('public.'||t) is not null then
     execute format('create trigger access_legacy_read_only before insert or update or delete on public.%I for each row execute function public.access_legacy_rbac_read_only()',t);
   end if;
 end loop;
end $$;
