-- Strengthen Profile Privilege Escalation Guard
--
-- Ensures that when an authenticated user attempts to change their own platform_role,
-- is_primary, or status (or another account's fields), the database trigger strictly
-- rejects the change unless the acting caller is confirmed to already be an active super_admin.

create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_caller_super_admin boolean := public.is_super_admin();
begin
  if tg_op = 'DELETE' then
    if old.is_primary and not is_caller_super_admin then
      raise exception 'The Primary Super Admin account cannot be removed.';
    end if;
    return old;
  end if;

  -- If the caller is an authenticated non-super-admin user, protect platform fields
  if auth.uid() is not null and not is_caller_super_admin then
    if new.platform_role is distinct from old.platform_role
       or new.is_primary is distinct from old.is_primary then
      raise exception 'Platform privileges can only be changed by the platform operator.';
    end if;
    if new.status is distinct from old.status then
      raise exception 'Account status can only be changed by the platform operator.';
    end if;
  end if;

  return new;
end;
$$;
