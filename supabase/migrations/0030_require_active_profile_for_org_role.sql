-- Existing sessions are not automatically revoked on suspension. Every RLS
-- policy relying on org_role / is_org_member / can_create_content must treat a
-- non-active profile as having no tenant membership. The Super Admin branch
-- already requires an active profile in is_super_admin(). This does not alter
-- self-service policies that do not call org_role, nor service_role access.
create or replace function public.org_role(p_org uuid)
returns text language sql stable security definer set search_path = public as $$
  select case
    when public.is_super_admin() then 'owner'
    else (
      select m.role
      from public.organization_members m
      join public.profiles p on p.id = m.user_id and p.status = 'active'
      where m.organization_id = p_org and m.user_id = auth.uid() and m.status = 'active'
      limit 1
    )
  end;
$$;
