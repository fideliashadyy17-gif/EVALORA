-- 0081_organization_admin_provisioning.sql
--
-- A one-time, expiring setup code lets an institution create its own first
-- Organization Owner account through the public portal — without the platform
-- operator entering the global Super Admin console, and without any password
-- ever being written to a table.
--
-- The code lives in its own table with RLS enabled and NO policies, so it is
-- readable only by the service role (server actions). Organization members,
-- including administrators, cannot read or enumerate setup codes.

begin;

create table if not exists public.organization_admin_setup (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.organization_admin_setup is
  'Single-use organization owner setup codes (sha256 hashes only). Service-role access only.';
comment on column public.organization_admin_setup.code_hash is
  'SHA-256 hex digest of the setup code shown once to the platform operator.';

create index if not exists organization_admin_setup_org_idx
  on public.organization_admin_setup (organization_id, created_at desc);

alter table public.organization_admin_setup enable row level security;
-- Intentionally no policies: only the service role (server actions) may touch it.

commit;
