-- Compatibility is a role source, NOT a permission bypass. Existing membership
-- rows are never rewritten or mass-assigned. Explicit denies/global OFF are
-- evaluated by the same authoritative resolver for implicit and custom roles.
create function public.access_subject_roles(p_user uuid,p_org uuid)
returns table(role_id uuid,user_id uuid,organization_id uuid,status text,expires_at timestamptz)
language sql security definer stable set search_path=public,pg_temp as $$
 select ur.role_id,ur.user_id,ur.organization_id,ur.status,ur.expires_at
 from public.access_user_roles ur where ur.user_id=p_user and ur.organization_id=p_org
 union all
 select m.role_id,om.user_id,om.organization_id,'active'::text,null::timestamptz
 from public.organization_members om join public.access_legacy_role_map m on m.legacy_key=om.role
 where om.user_id=p_user and om.organization_id=p_org and om.status='active'
   and om.role not in ('school_founder','director_demo')
$$;
revoke all on function public.access_subject_roles(uuid,uuid) from public,anon,authenticated;

create or replace function public.access_has_permission(
  p_user_id uuid, p_organization_id uuid, p_permission_key text
) returns boolean language plpgsql security definer
set search_path = public, pg_temp stable as $$
declare v_permission public.access_permissions; v_override boolean;
begin
  if auth.uid() is distinct from p_user_id and not public.is_super_admin() then return false; end if;
  if not exists(select 1 from public.profiles where id=p_user_id and status='active') then return false; end if;
  select * into v_permission from public.access_permissions where key=p_permission_key;
  if not found or not v_permission.enabled then return false; end if;
  if exists(select 1 from public.profiles where id=p_user_id and platform_role='super_admin' and status='active') then return true; end if;
  if v_permission.scope <> 'organization' then return false; end if;
  -- Founder is a ceiling as well as a role: extra roles/overrides cannot
  -- turn a supervision-only account into an academic operator.
  if (exists(select 1 from public.organization_members where user_id=p_user_id and role='school_founder') or exists(select 1 from public.access_user_roles ur join public.access_roles r on r.id=ur.role_id
      where ur.user_id=p_user_id and ur.status='active' and r.slug='school_founder'
      and (ur.expires_at is null or ur.expires_at>now()))) and
    (p_permission_key !~ '\.(view|analytics|monitor)$' or p_permission_key ~ '^(users|students|roles|permissions|proctoring)\.') then return false; end if;
  if not exists(select 1 from public.organizations where id=p_organization_id and status='active') then return false; end if;
  if not exists(select 1 from public.organization_members where user_id=p_user_id and organization_id=p_organization_id and status='active') then return false; end if;
  select granted into v_override from public.access_permission_overrides
    where user_id=p_user_id and organization_id=p_organization_id and permission_id=v_permission.id;
  if v_override = false then return false; end if;
  if exists (
    select 1 from public.access_subject_roles(p_user_id,p_organization_id) ur join public.access_roles r on r.id=ur.role_id
    join public.access_role_permissions rp on rp.role_id=r.id
    where ur.user_id=p_user_id and ur.organization_id=p_organization_id and ur.status='active'
      and (ur.expires_at is null or ur.expires_at>now()) and r.is_active
      and (r.organization_id is null or r.organization_id=p_organization_id)
      and rp.permission_id=v_permission.id and not rp.granted
  ) then return false; end if;
  return coalesce(v_override,false) or exists (
    select 1 from public.access_subject_roles(p_user_id,p_organization_id) ur join public.access_roles r on r.id=ur.role_id
    join public.access_role_permissions rp on rp.role_id=r.id
    where ur.user_id=p_user_id and ur.organization_id=p_organization_id and ur.status='active'
      and (ur.expires_at is null or ur.expires_at>now()) and r.is_active
      and (r.organization_id is null or r.organization_id=p_organization_id)
      and rp.permission_id=v_permission.id and rp.granted
  );
end $$;
