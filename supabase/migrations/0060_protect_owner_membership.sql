-- Tenant managers may manage ordinary members, but ownership assignment,
-- transfer and removal are reserved for the audited Super Admin/service-role
-- workflows. Keep initial self-claim only for the organization's owner_id.
drop policy if exists mem_insert on public.organization_members;
create policy mem_insert on public.organization_members
  for insert to authenticated
  with check (
    public.is_super_admin()
    or (public.can_manage_org(organization_id) and role <> 'owner')
    or (
      user_id = auth.uid()
      and role = 'owner'
      and exists (
        select 1 from public.organizations o
        where o.id = organization_members.organization_id
          and o.owner_id = auth.uid()
      )
    )
  );

drop policy if exists mem_update on public.organization_members;
create policy mem_update on public.organization_members
  for update to authenticated
  using (
    public.is_super_admin()
    or (public.can_manage_org(organization_id) and role <> 'owner')
  )
  with check (
    public.is_super_admin()
    or (public.can_manage_org(organization_id) and role <> 'owner')
  );

drop policy if exists mem_delete on public.organization_members;
create policy mem_delete on public.organization_members
  for delete to authenticated
  using (
    public.is_super_admin()
    or (public.can_manage_org(organization_id) and role <> 'owner')
  );
