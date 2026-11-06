-- A suspended authenticated account can still hold a Supabase session.
-- Do not allow the self-profile UPDATE policy to restore that account's
-- status (or change privileges). Retain the existing service/operator path
-- used by the Super Admin console and ordinary profile-name edits.
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
    if new.status is distinct from old.status then
      raise exception 'Account status can only be changed by the platform operator.';
    end if;
  end if;
  return new;
end $$;
