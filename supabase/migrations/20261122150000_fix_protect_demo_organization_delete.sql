-- Migration: Fix protect_demo_organization() trigger to return OLD on DELETE
-- When tg_op = 'DELETE', a row-level BEFORE trigger returning NULL causes PostgreSQL
-- to silently skip the deletion of the row. This bug prevented any non-demo organization
-- from ever being deleted by platform administrators.
-- Returning OLD allows non-demo organizations to be safely deleted with proper CASCADE.

create or replace function public.protect_demo_organization()
returns trigger language plpgsql set search_path = public as $$
begin
  if coalesce(current_setting('evalora.allow_demo_admin', true), '') = 'on' then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then
    if old.is_demo then
      raise exception 'The EVALORA demonstration organization cannot be deleted.';
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and old.is_demo then
    if new.is_demo is distinct from old.is_demo then
      raise exception 'The demonstration flag of the EVALORA DEMO organization cannot be changed.';
    end if;
    if new.slug is distinct from old.slug then
      raise exception 'The subdomain of the EVALORA DEMO organization cannot be changed.';
    end if;
  end if;
  return new;
end;
$$;
