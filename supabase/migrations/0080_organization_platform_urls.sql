-- 0080_organization_platform_urls.sql
--
-- Organization platform identity: every organization keeps ONE permanent,
-- unique platform identifier (`organizations.slug`) that addresses its
-- platform. This migration adds the bookkeeping needed to publish, verify and
-- safely change that address — it never renames existing organizations, never
-- rewrites slugs, and never touches tenants, members, content or results.
--
-- Additive only:
--   previous_slugs          retired identifiers, used for permanent redirects
--   slug_updated_at         when the platform address last changed
--   custom_domain           optional organization-owned domain (verified)
--   platform_domain_status  "active" only once DNS/TLS are confirmed
--
-- Format + uniqueness of `slug` already existed (organizations_slug_format,
-- organizations_slug_key). This migration adds the 3-character minimum, the
-- reserved-name guard, and makes an identifier change a platform-owner action
-- (an organization administrator can never re-point a tenant from the browser).

begin;

alter table public.organizations
  add column if not exists previous_slugs text[] not null default '{}'::text[],
  add column if not exists slug_updated_at timestamptz,
  add column if not exists custom_domain text,
  add column if not exists platform_domain_status text not null default 'pending';

comment on column public.organizations.slug is
  'Permanent platform identifier (subdomain label). Changing it retires the old label into previous_slugs for redirects.';
comment on column public.organizations.previous_slugs is
  'Retired platform identifiers; /portal/<old> permanently redirects to the current platform URL.';
comment on column public.organizations.custom_domain is
  'Optional organization-owned domain. Only used as the canonical URL when platform_domain_status is active.';
comment on column public.organizations.platform_domain_status is
  'Verification state of subdomain/custom-domain serving: active | pending | unavailable | disabled.';

alter table public.organizations drop constraint if exists organizations_platform_domain_status_check;
alter table public.organizations
  add constraint organizations_platform_domain_status_check
  check (platform_domain_status in ('active', 'pending', 'unavailable', 'disabled'));

-- Platform identifiers are subdomain labels: 3–63 characters.
alter table public.organizations drop constraint if exists organizations_slug_length_check;
alter table public.organizations
  add constraint organizations_slug_length_check
  check (char_length(slug) between 3 and 63);

create index if not exists organizations_previous_slugs_idx
  on public.organizations using gin (previous_slugs);

create unique index if not exists organizations_custom_domain_key
  on public.organizations (lower(custom_domain))
  where custom_domain is not null;

-- Same reserved list as src/lib/tenant.ts (RESERVED_SUBDOMAINS).
create or replace function public.evalora_reserved_slugs()
returns text[]
language sql
immutable
as $$
  select array[
    'www','app','admin','api','mail','smtp','imap','pop','ftp',
    'support','help','blog','docs','status','cdn','assets','static',
    'evalora','portal','login','register','dashboard','billing',
    'payments','auth','oauth','sso','dev','staging','test','preview',
    'public','private','system','root','superadmin','owner','platform',
    'school','schools','student','students','teacher','teachers'
  ]::text[];
$$;

create or replace function public.organizations_platform_slug_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  reserved text[] := public.evalora_reserved_slugs();
begin
  new.slug := lower(btrim(new.slug));

  if char_length(new.slug) < 3 then
    raise exception 'organization identifier "%" is too short (minimum 3 characters)', new.slug;
  end if;
  if new.slug = any (reserved) then
    raise exception 'organization identifier "%" is reserved by EVALORA', new.slug;
  end if;

  if tg_op = 'INSERT' then
    new.slug_updated_at := coalesce(new.slug_updated_at, now());
    new.previous_slugs := coalesce(new.previous_slugs, '{}'::text[]);
    return new;
  end if;

  if new.slug is not distinct from old.slug then
    return new;
  end if;

  if old.is_demo then
    raise exception 'the EVALORA DEMO organization identifier is protected';
  end if;

  -- An organization administrator owns the organization row (RLS allows
  -- owner/admin updates) but must never be able to re-point the tenant URL
  -- from a browser session. Only a verified platform owner (or trusted
  -- server-side/service-role code) may change the identifier.
  if auth.uid() is not null and not public.is_super_admin() then
    raise exception 'only the EVALORA platform owner can change an organization platform identifier';
  end if;

  new.previous_slugs := (
    select coalesce(array_agg(distinct s order by s), '{}'::text[])
    from unnest(coalesce(old.previous_slugs, '{}'::text[]) || old.slug) as s
    where s is not null and s <> new.slug
  );
  new.slug_updated_at := now();
  return new;
end;
$$;

drop trigger if exists organizations_platform_slug_guard on public.organizations;
create trigger organizations_platform_slug_guard
  before insert or update of slug on public.organizations
  for each row execute function public.organizations_platform_slug_guard();

-- Backfill: no organization is renamed or re-slugged. Existing identifiers are
-- preserved exactly; only bookkeeping defaults are filled in.
update public.organizations
set previous_slugs = coalesce(previous_slugs, '{}'::text[]),
    slug_updated_at = coalesce(slug_updated_at, created_at),
    platform_domain_status = coalesce(platform_domain_status, 'pending')
where slug_updated_at is null
   or previous_slugs is null
   or platform_domain_status is null;

commit;
