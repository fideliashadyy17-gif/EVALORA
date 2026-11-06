-- ═══════════════════════════════════════════════════════════════════════
-- EVALORA 0006 — Tenant portals, class lifecycle, import & migration ops
--  • organizations.slug is the tenant subdomain slug (already unique)
--  • DEMO organization protection flags + delete/rename guard
--  • classes: code, description, lifecycle status, timestamps
--  • students: own phone field
--  • import_batches: auditable, idempotent student-import history
--  • migration_runs / migration_mappings: external question migration
--    bookkeeping (source id -> destination id, content hashes)
--  • private `student-imports` storage bucket (org-scoped paths)
-- Tenant isolation stays in the existing RLS helpers; nothing here trusts
-- a client-supplied organization id.
-- ═══════════════════════════════════════════════════════════════════════

-- ─── Organizations: tenant portal + demo protection ───────────────────
alter table public.organizations
  add column if not exists is_demo boolean not null default false,
  add column if not exists portal_enabled boolean not null default true;

-- Slug doubles as the school subdomain: enforce DNS-label shape.
alter table public.organizations drop constraint if exists organizations_slug_format;
alter table public.organizations add constraint organizations_slug_format
  check (slug ~ '^[a-z0-9]([a-z0-9-]{0,60}[a-z0-9])?$');

-- There is exactly one demonstration organization.
create unique index if not exists organizations_single_demo_idx
  on public.organizations (is_demo) where is_demo;

create or replace function public.protect_demo_organization()
returns trigger language plpgsql set search_path = public as $$
begin
  if coalesce(current_setting('evalora.allow_demo_admin', true), '') = 'on' then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' and old.is_demo then
    raise exception 'The EVALORA demonstration organization cannot be deleted.';
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

drop trigger if exists trg_protect_demo_organization on public.organizations;
create trigger trg_protect_demo_organization
  before update or delete on public.organizations
  for each row execute function public.protect_demo_organization();

-- ─── Classes: code, description, lifecycle status ─────────────────────
alter table public.classes
  add column if not exists code text,
  add column if not exists description text,
  add column if not exists status text not null default 'active'
    check (status in ('active','archived')),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists classes_org_year_code_key
  on public.classes (organization_id, academic_year_id, lower(code))
  where code is not null and academic_year_id is not null;
create index if not exists classes_org_status_idx
  on public.classes (organization_id, status, name);

-- ─── Students: own phone ──────────────────────────────────────────────
alter table public.students add column if not exists phone text;

-- ─── Student-import batches (log + idempotency) ───────────────────────
create table if not exists public.import_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  kind text not null default 'students',
  file_name text,
  file_type text,
  file_hash text,
  storage_path text,
  status text not null default 'processing'
    check (status in ('processing','completed','failed','duplicate')),
  total_rows int not null default 0,
  imported_count int not null default 0,
  updated_count int not null default 0,
  skipped_count int not null default 0,
  failed_count int not null default 0,
  report jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists import_batches_org_idx
  on public.import_batches (organization_id, created_at desc);
-- A file (by SHA-256) can complete only once per organization.
create unique index if not exists import_batches_org_hash_done_idx
  on public.import_batches (organization_id, file_hash)
  where status = 'completed' and file_hash is not null;

alter table public.import_batches enable row level security;
drop policy if exists imp_select on public.import_batches;
create policy imp_select on public.import_batches for select to authenticated
  using (public.is_org_member(organization_id) or public.is_super_admin());
drop policy if exists imp_write on public.import_batches;
create policy imp_write on public.import_batches for all to authenticated
  using (public.can_create_content(organization_id) or public.is_super_admin())
  with check (public.can_create_content(organization_id) or public.is_super_admin());

-- ─── External migration bookkeeping (Super Admin only) ────────────────
create table if not exists public.migration_runs (
  id uuid primary key default gen_random_uuid(),
  source_project_ref text not null,
  source_name text,
  destination_organization_id uuid references public.organizations(id) on delete set null,
  status text not null default 'running'
    check (status in ('running','completed','failed','partial')),
  started_by uuid references public.profiles(id) on delete set null,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.migration_mappings (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.migration_runs(id) on delete set null,
  source_project_ref text not null,
  source_table text not null,
  source_id text not null,
  destination_table text not null,
  destination_id uuid,
  destination_organization_id uuid references public.organizations(id) on delete set null,
  content_hash text,
  status text not null default 'migrated'
    check (status in ('migrated','skipped_duplicate','failed','needs_review')),
  error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (source_project_ref, source_table, source_id, destination_table, destination_organization_id)
);
create index if not exists migration_mappings_dest_idx
  on public.migration_mappings (destination_table, destination_id);
create index if not exists migration_mappings_hash_idx
  on public.migration_mappings (destination_organization_id, content_hash);

alter table public.migration_runs enable row level security;
alter table public.migration_mappings enable row level security;
drop policy if exists migr_admin on public.migration_runs;
create policy migr_admin on public.migration_runs for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
drop policy if exists migm_admin on public.migration_mappings;
create policy migm_admin on public.migration_mappings for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- ─── Storage: private originals for student imports ───────────────────
-- Path convention: "<organization_id>/<batch_id>/<filename>".
insert into storage.buckets (id, name, public) values ('student-imports', 'student-imports', false)
on conflict (id) do nothing;

drop policy if exists simp_read on storage.objects;
create policy simp_read on storage.objects for select to authenticated
  using (
    bucket_id = 'student-imports'
    and (public.is_super_admin()
         or public.is_org_member(((storage.foldername(name))[1])::uuid))
  );
drop policy if exists simp_insert on storage.objects;
create policy simp_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'student-imports'
    and (public.is_super_admin()
         or public.can_create_content(((storage.foldername(name))[1])::uuid))
  );
drop policy if exists simp_delete on storage.objects;
create policy simp_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'student-imports'
    and (public.is_super_admin()
         or public.can_manage_org(((storage.foldername(name))[1])::uuid))
  );
