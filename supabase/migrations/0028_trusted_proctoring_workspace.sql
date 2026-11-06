-- An organization owner can edit organization.settings; it is not an
-- authority for granting paid features. Establish an administrative setting
-- whose write policy already requires an active platform Super Admin.
-- Only the pre-existing, primary-owner EVALORA workspace is selected. If it
-- is missing or not owned by the active primary Super Admin, leave the setting
-- absent and fail closed. Never overwrite an existing administrator decision.
insert into public.platform_settings (key, value)
select 'proctoring_owner_workspace', jsonb_build_object('organization_id', o.id::text)
from public.organizations o
join public.profiles p on p.id = o.owner_id
where o.slug = 'evalora-platform'
  and o.settings @> '{"platform_owned": true}'::jsonb
  and p.is_primary is true
  and p.platform_role = 'super_admin'
  and p.status = 'active'
on conflict (key) do nothing;
