-- ═══════════════════════════════════════════════════════════════════════════
-- EVALORA Platform Control Center — centralized configuration architecture
-- ═══════════════════════════════════════════════════════════════════════════
--
-- WHY
--   Until now global configuration lived in `platform_settings`, a flat
--   key → jsonb table with no scope layering, no schema validation, no
--   revision history and no rollback. Two settings were already demonstrably
--   disconnected from behaviour (`exam_pass_threshold` was never read by any
--   module; `support_email` was read only by the page that displayed it while
--   every customer surface used the hardcoded BRAND.supportEmail).
--
--   This migration adds the storage for one centralized, versioned,
--   scope-layered configuration service. The *schema* (which keys exist, what
--   type each is, what it validates against, which modules it affects) stays
--   in code at src/lib/config/schema.ts so the dashboard can never write an
--   arbitrary key, an arbitrary type, or executable content.
--
-- SAFETY — additive and backward compatible
--   * Creates new tables only. No existing table is altered, dropped,
--     truncated or rewritten.
--   * No UPDATE/DELETE of any organization, user, role, class, subject,
--     question, paper, examination, candidate, attempt, answer, mark, result,
--     publication state, proctoring record, subscription or audit row.
--   * `platform_settings` is left exactly as it is and keeps working; the new
--     store is layered beside it and the two confirmed-dead keys are seeded
--     into it from their current stored values so no configured intent is
--     lost.
--   * Every table has RLS enabled with an explicit policy set before any
--     grant, and no table is exposed to the `anon` role.
--   * Absent rows mean "inherit", so deploying this migration changes no
--     runtime behaviour by itself.
-- ═══════════════════════════════════════════════════════════════════════════

-- Sentinel for the global scope. The repository already uses the NIL uuid as
-- a "not applicable" marker (see 20261116120000_myp_criterion_results.sql),
-- so a NOT NULL scope_id keeps the primary key simple and indexable.
do $$ begin
  if not exists (select 1 from pg_type where typname = 'config_scope_level') then
    create type public.config_scope_level as enum ('global', 'organization');
  end if;
end $$;

-- ─────────────────────────────── values ────────────────────────────────────
create table if not exists public.platform_config_values (
  scope_level   public.config_scope_level not null,
  -- '00000000-0000-0000-0000-000000000000' for scope_level = 'global'.
  scope_id      uuid not null default '00000000-0000-0000-0000-000000000000',
  namespace     text not null,
  key           text not null,
  value         jsonb not null,
  -- Monotonic per (scope, namespace, key). Every change increments it and
  -- appends a platform_config_revisions row, which is what makes rollback
  -- exact rather than approximate.
  revision      integer not null default 1,
  updated_by    uuid references public.profiles(id) on delete set null,
  updated_at    timestamptz not null default now(),
  constraint platform_config_values_pk primary key (scope_level, scope_id, namespace, key),
  constraint platform_config_values_scope_ck check (
    (scope_level = 'global' and scope_id = '00000000-0000-0000-0000-000000000000')
    or (scope_level = 'organization' and scope_id <> '00000000-0000-0000-0000-000000000000')
  ),
  constraint platform_config_values_ns_ck check (namespace ~ '^[a-z][a-z0-9_]{1,62}$'),
  constraint platform_config_values_key_ck check (key ~ '^[a-z][a-z0-9_]{1,62}$'),
  constraint platform_config_values_revision_ck check (revision >= 1)
);

create index if not exists idx_platform_config_values_org
  on public.platform_config_values(scope_id, namespace)
  where scope_level = 'organization';

comment on table public.platform_config_values is
  'Centralized configuration store. Global defaults (scope_level=global) layered under organization overrides (scope_level=organization). Keys must exist in src/lib/config/schema.ts; an unknown key is rejected by the server action before it reaches this table.';

-- ────────────────────────────── revisions ──────────────────────────────────
create table if not exists public.platform_config_revisions (
  id               uuid primary key default gen_random_uuid(),
  scope_level      public.config_scope_level not null,
  scope_id         uuid not null default '00000000-0000-0000-0000-000000000000',
  namespace        text not null,
  key              text not null,
  revision         integer not null,
  previous_value   jsonb,          -- null on first write
  new_value        jsonb not null,
  change_note      text,
  changed_by       uuid references public.profiles(id) on delete set null,
  changed_at       timestamptz not null default now(),
  -- Set when this revision was produced by rolling back to an earlier one.
  rolled_back_from uuid references public.platform_config_revisions(id) on delete set null,
  constraint platform_config_revisions_rev_ck check (revision >= 1)
);

create index if not exists idx_platform_config_revisions_lookup
  on public.platform_config_revisions(scope_level, scope_id, namespace, key, revision desc);
create index if not exists idx_platform_config_revisions_recent
  on public.platform_config_revisions(changed_at desc);

comment on table public.platform_config_revisions is
  'Append-only version history for platform_config_values. Powers configuration history, side-by-side diff and exact rollback. Rows are never updated or deleted by the application.';

-- ─────────────────────────────── presets ───────────────────────────────────
create table if not exists public.platform_config_presets (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  description  text,
  -- null = preset spans every namespace it declares values for.
  namespace    text,
  -- { "<namespace>": { "<key>": <value> } } — validated key by key on apply.
  values       jsonb not null default '{}'::jsonb,
  is_active    boolean not null default true,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint platform_config_presets_name_ck check (char_length(trim(name)) between 2 and 120)
);

create unique index if not exists uq_platform_config_presets_name
  on public.platform_config_presets(lower(trim(name)));

comment on table public.platform_config_presets is
  'Super-Admin-authored organization configuration presets. Applying a preset writes organization-scope values through the same validated path as a manual edit, so it is audited and reversible like any other change.';

-- ─────────────────────────── question templates ────────────────────────────
create table if not exists public.question_templates (
  id               uuid primary key default gen_random_uuid(),
  -- null = platform-wide template authored by Super Admin.
  organization_id  uuid references public.organizations(id) on delete cascade,
  name             text not null,
  description      text,
  -- Must be one of the question types the renderers actually support; the
  -- server action validates against QUESTION_TYPES before insert.
  question_type    text not null,
  subject          text,
  grade_label      text,
  curriculum       text,
  topic            text,
  difficulty       text,
  -- Authoring payload: prompt_doc, explanation_doc, config skeleton, options.
  content          jsonb not null default '{}'::jsonb,
  -- Visual design tokens consumed by the question renderer and the paper/PDF
  -- path (card layout, border, radius, spacing, option layout, numbering…).
  design           jsonb not null default '{}'::jsonb,
  tags             text[] not null default '{}',
  status           text not null default 'active'
                   constraint question_templates_status_ck check (status in ('active','archived')),
  usage_count      integer not null default 0,
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint question_templates_name_ck check (char_length(trim(name)) between 2 and 160)
);

create index if not exists idx_question_templates_org
  on public.question_templates(organization_id, question_type, status);
create index if not exists idx_question_templates_global
  on public.question_templates(question_type, status)
  where organization_id is null;

comment on table public.question_templates is
  'Reusable Question Studio templates. organization_id IS NULL = platform-wide (Super Admin). A question created from a template snapshots the design tokens, so editing a template never restyles an already published examination.';

-- One template use is counted atomically. supabase-js has no increment
-- operator, and read-then-write would lose counts when two authors start from
-- the same template at the same moment. SECURITY INVOKER on purpose: it is
-- called with the service-role key (which already bypasses RLS) and must not
-- become a way for an authenticated user to write to this table.
create or replace function public.question_templates_record_use(p_template_id uuid)
returns integer
language plpgsql
as $$
declare
  v_count integer;
begin
  update public.question_templates
     set usage_count = usage_count + 1,
         updated_at  = now()
   where id = p_template_id
  returning usage_count into v_count;
  return coalesce(v_count, 0);
end;
$$;

revoke all on function public.question_templates_record_use(uuid) from public;
revoke all on function public.question_templates_record_use(uuid) from anon, authenticated;

comment on function public.question_templates_record_use(uuid) is
  'Atomically increments question_templates.usage_count and returns the new value. Service-role only; a template counter can never fail a question save.';

-- ────────────────────────── notification templates ─────────────────────────
create table if not exists public.notification_templates (
  id               uuid primary key default gen_random_uuid(),
  -- null = platform default template.
  organization_id  uuid references public.organizations(id) on delete cascade,
  -- Stable event key, e.g. 'exam_invitation', 'results_published'. The set of
  -- events is defined in code; an unknown event is rejected.
  event_key        text not null,
  channel          text not null default 'in_app'
                   constraint notification_templates_channel_ck
                     check (channel in ('in_app','email','both')),
  title            text not null,
  body             text not null,
  locale           text not null default 'en',
  -- Variables this template references, recorded at save time so the UI can
  -- show exactly which of the whitelisted variables are in use.
  variables        text[] not null default '{}',
  is_active        boolean not null default true,
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- One active template per (tenant, event, channel, locale).
create unique index if not exists uq_notification_templates_active
  on public.notification_templates(
    coalesce(organization_id, '00000000-0000-0000-0000-000000000000'),
    event_key, channel, locale
  ) where is_active;
create index if not exists idx_notification_templates_org
  on public.notification_templates(organization_id, event_key);

comment on table public.notification_templates is
  'Editable notification/email templates with a whitelisted variable set. Rendering is pure string substitution — no expression evaluation, no code execution, and no variable that could expose a password or credential is ever registered.';

-- ─────────────────────────────── workflows ─────────────────────────────────
create table if not exists public.workflow_definitions (
  id               uuid primary key default gen_random_uuid(),
  -- null = platform workflow template authored by Super Admin.
  organization_id  uuid references public.organizations(id) on delete cascade,
  name             text not null,
  description      text,
  -- Trigger key from the code-defined registry (e.g. 'exam.created').
  trigger_key      text not null,
  -- Ordered list of { condition: {...}, action: { key, params } } steps.
  -- Condition operators and action keys are both validated against the
  -- registry; arbitrary expressions are not representable.
  steps            jsonb not null default '[]'::jsonb,
  is_active        boolean not null default false,
  -- Guard: a workflow may never be activated unless every step validated.
  last_validated_at timestamptz,
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint workflow_definitions_name_ck check (char_length(trim(name)) between 2 and 160)
);

create index if not exists idx_workflow_definitions_trigger
  on public.workflow_definitions(trigger_key) where is_active;
create index if not exists idx_workflow_definitions_org
  on public.workflow_definitions(organization_id, is_active);

comment on table public.workflow_definitions is
  'No-code workflow definitions: trigger -> conditions -> predefined actions. Executes server-side through existing guarded service functions only. No SQL, no scripting, no eval. Publication actions request publication; they never publish implicitly.';

create table if not exists public.workflow_runs (
  id               uuid primary key default gen_random_uuid(),
  workflow_id      uuid not null references public.workflow_definitions(id) on delete cascade,
  organization_id  uuid references public.organizations(id) on delete cascade,
  trigger_key      text not null,
  -- Entity the trigger fired on (exam id, attempt id, incident id…).
  entity_type      text,
  entity_id        text,
  status           text not null default 'pending'
                   constraint workflow_runs_status_ck
                     check (status in ('pending','running','succeeded','failed','skipped')),
  steps_total      integer not null default 0,
  steps_completed  integer not null default 0,
  -- Per-step outcome: [{ index, action, status, detail, at }].
  result           jsonb not null default '[]'::jsonb,
  error            text,
  attempts         integer not null default 0,
  triggered_by     uuid references public.profiles(id) on delete set null,
  started_at       timestamptz not null default now(),
  finished_at      timestamptz
);

create index if not exists idx_workflow_runs_workflow
  on public.workflow_runs(workflow_id, started_at desc);
create index if not exists idx_workflow_runs_org
  on public.workflow_runs(organization_id, started_at desc);
create index if not exists idx_workflow_runs_failed
  on public.workflow_runs(status, started_at desc) where status = 'failed';

comment on table public.workflow_runs is
  'Execution history for the Workflow Builder: per-step outcome, error text, retry counter. This is the evidence that a configured automation actually ran.';

-- ───────────────────────────── report templates ────────────────────────────
create table if not exists public.report_templates (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid references public.organizations(id) on delete cascade,
  name             text not null,
  -- Report family key from the code-defined registry, which also fixes the
  -- field whitelist available to that family.
  report_key       text not null,
  -- Selected fields (subset of the family whitelist), filters, grouping,
  -- date range, sort, export format.
  definition       jsonb not null default '{}'::jsonb,
  is_shared        boolean not null default false,
  is_active        boolean not null default true,
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint report_templates_name_ck check (char_length(trim(name)) between 2 and 160)
);

create index if not exists idx_report_templates_org
  on public.report_templates(organization_id, report_key, is_active);

comment on table public.report_templates is
  'Saved report definitions. Field selection is constrained to the report family whitelist and the organization filter is always applied server-side, so a template can never widen data access.';

-- ──────────────────────────── dashboard layouts ────────────────────────────
create table if not exists public.dashboard_layouts (
  id               uuid primary key default gen_random_uuid(),
  -- Exactly one of these is set: a layout belongs to an organization (its
  -- default for a role) or to one user (personal preference).
  organization_id  uuid references public.organizations(id) on delete cascade,
  role_key         text,
  user_id          uuid references public.profiles(id) on delete cascade,
  -- Ordered widget keys. Composition is filtered through getCapabilities()
  -- AFTER reading, so a layout can never reveal an unentitled module.
  widgets          jsonb not null default '[]'::jsonb,
  default_landing  text,
  is_active        boolean not null default true,
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint dashboard_layouts_owner_ck check (
    (organization_id is not null and user_id is null)
    or (organization_id is null and user_id is not null)
  )
);

create unique index if not exists uq_dashboard_layouts_org_role
  on public.dashboard_layouts(organization_id, coalesce(role_key, '*'))
  where organization_id is not null and is_active;
create unique index if not exists uq_dashboard_layouts_user
  on public.dashboard_layouts(user_id) where user_id is not null and is_active;

comment on table public.dashboard_layouts is
  'Dashboard Builder output: ordered widget keys per organization role, plus personal per-user layouts. Never grants access — entitlements are re-checked after composition.';

-- ═══════════════════════════ ROW LEVEL SECURITY ════════════════════════════
-- Global rows: Super Admin only. Organization rows: that organization's
-- owner/admin only. Reads follow the same rule; the application's own
-- server-side reads use the service role after an explicit authorization
-- check, exactly as src/lib/platform.ts already does for feature flags.

alter table public.platform_config_values      enable row level security;
alter table public.platform_config_revisions   enable row level security;
alter table public.platform_config_presets     enable row level security;
alter table public.question_templates          enable row level security;
alter table public.notification_templates      enable row level security;
alter table public.workflow_definitions        enable row level security;
alter table public.workflow_runs               enable row level security;
alter table public.report_templates            enable row level security;
alter table public.dashboard_layouts           enable row level security;

drop policy if exists config_values_select on public.platform_config_values;
create policy config_values_select on public.platform_config_values
  for select to authenticated using (
    public.is_super_admin()
    or (scope_level = 'organization' and public.is_org_member(scope_id))
  );

drop policy if exists config_values_write on public.platform_config_values;
create policy config_values_write on public.platform_config_values
  for all to authenticated using (
    public.is_super_admin()
    or (scope_level = 'organization' and public.can_manage_org(scope_id))
  ) with check (
    public.is_super_admin()
    or (scope_level = 'organization' and public.can_manage_org(scope_id))
  );

drop policy if exists config_revisions_select on public.platform_config_revisions;
create policy config_revisions_select on public.platform_config_revisions
  for select to authenticated using (
    public.is_super_admin()
    or (scope_level = 'organization' and public.is_org_member(scope_id))
  );

-- History is append-only for tenants: they may add rows for their own scope
-- but never update or delete the audit trail.
drop policy if exists config_revisions_insert on public.platform_config_revisions;
create policy config_revisions_insert on public.platform_config_revisions
  for insert to authenticated with check (
    public.is_super_admin()
    or (scope_level = 'organization' and public.can_manage_org(scope_id))
  );

-- Narrow, deliberate public read: the maintenance notice and the global
-- announcements are content shown to every visitor by definition, and Edge
-- middleware needs the maintenance flag before any session is resolved. Only
-- those three global keys are exposed; every other setting (brand colours,
-- assessment rules, proctoring policy, organization configuration) remains
-- authenticated-only. There is no write policy for anon.
drop policy if exists config_values_public_availability on public.platform_config_values;
create policy config_values_public_availability on public.platform_config_values
  for select to anon, authenticated using (
    scope_level = 'global'
    and namespace = 'platform_behavior'
    and key in ('maintenance_mode', 'maintenance_message', 'global_announcements')
  );

drop policy if exists config_presets_sa on public.platform_config_presets;
create policy config_presets_sa on public.platform_config_presets
  for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists question_templates_select on public.question_templates;
create policy question_templates_select on public.question_templates
  for select to authenticated using (
    public.is_super_admin()
    or organization_id is null
    or public.is_org_member(organization_id)
  );

drop policy if exists question_templates_write on public.question_templates;
create policy question_templates_write on public.question_templates
  for all to authenticated using (
    public.is_super_admin()
    or (organization_id is not null and public.can_create_content(organization_id))
  ) with check (
    public.is_super_admin()
    or (organization_id is not null and public.can_create_content(organization_id))
  );

drop policy if exists notification_templates_select on public.notification_templates;
create policy notification_templates_select on public.notification_templates
  for select to authenticated using (
    public.is_super_admin()
    or organization_id is null
    or public.is_org_member(organization_id)
  );

drop policy if exists notification_templates_write on public.notification_templates;
create policy notification_templates_write on public.notification_templates
  for all to authenticated using (
    public.is_super_admin()
    or (organization_id is not null and public.can_manage_org(organization_id))
  ) with check (
    public.is_super_admin()
    or (organization_id is not null and public.can_manage_org(organization_id))
  );

drop policy if exists workflow_definitions_select on public.workflow_definitions;
create policy workflow_definitions_select on public.workflow_definitions
  for select to authenticated using (
    public.is_super_admin()
    or organization_id is null
    or public.is_org_member(organization_id)
  );

drop policy if exists workflow_definitions_write on public.workflow_definitions;
create policy workflow_definitions_write on public.workflow_definitions
  for all to authenticated using (
    public.is_super_admin()
    or (organization_id is not null and public.can_manage_org(organization_id))
  ) with check (
    public.is_super_admin()
    or (organization_id is not null and public.can_manage_org(organization_id))
  );

drop policy if exists workflow_runs_select on public.workflow_runs;
create policy workflow_runs_select on public.workflow_runs
  for select to authenticated using (
    public.is_super_admin()
    or (organization_id is not null and public.is_org_member(organization_id))
  );

drop policy if exists workflow_runs_insert on public.workflow_runs;
create policy workflow_runs_insert on public.workflow_runs
  for insert to authenticated with check (
    public.is_super_admin()
    or (organization_id is not null and public.can_manage_org(organization_id))
  );

drop policy if exists report_templates_select on public.report_templates;
create policy report_templates_select on public.report_templates
  for select to authenticated using (
    public.is_super_admin()
    or (organization_id is not null and public.is_org_member(organization_id))
  );

drop policy if exists report_templates_write on public.report_templates;
create policy report_templates_write on public.report_templates
  for all to authenticated using (
    public.is_super_admin()
    or (organization_id is not null and public.can_create_content(organization_id))
  ) with check (
    public.is_super_admin()
    or (organization_id is not null and public.can_create_content(organization_id))
  );

drop policy if exists dashboard_layouts_select on public.dashboard_layouts;
create policy dashboard_layouts_select on public.dashboard_layouts
  for select to authenticated using (
    public.is_super_admin()
    or user_id = auth.uid()
    or (organization_id is not null and public.is_org_member(organization_id))
  );

drop policy if exists dashboard_layouts_write on public.dashboard_layouts;
create policy dashboard_layouts_write on public.dashboard_layouts
  for all to authenticated using (
    public.is_super_admin()
    or user_id = auth.uid()
    or (organization_id is not null and public.can_manage_org(organization_id))
  ) with check (
    public.is_super_admin()
    or user_id = auth.uid()
    or (organization_id is not null and public.can_manage_org(organization_id))
  );

-- ══════════════════════ RBAC PERMISSIONS (additive) ════════════════════════
-- New permission keys for the Control Center, inserted into the existing
-- catalog. `on conflict do nothing` keeps this idempotent and never disturbs
-- an existing grant. No role is granted them here: assignment stays an
-- explicit Super Admin decision in RBAC & User Role Management.

insert into public.access_permissions (key, name, description, category, scope, is_system) values
  ('platform.config.view',    'View Platform Configuration',
   'Read centralized platform and organization configuration in the Platform Control Center.',
   'System configuration', 'system', true),
  ('platform.config.manage',  'Manage Platform Configuration',
   'Create, change and roll back global platform configuration. Super Admin scope only.',
   'System configuration', 'system', true),
  ('platform.config.org',     'Manage Organization Configuration',
   'Change this organization''s configuration overrides within the entitlements granted by Super Admin.',
   'System configuration', 'organization', true),
  ('question.templates.manage','Manage Question Templates',
   'Create, edit and apply reusable Question Studio templates and question design tokens.',
   'Question bank and question management', 'organization', true),
  ('notification.templates.manage','Manage Notification Templates',
   'Edit notification and email templates, preview them and send a test message.',
   'System configuration', 'organization', true),
  ('workflows.manage',        'Manage Workflows',
   'Build, activate, deactivate and re-run configured automation workflows.',
   'System configuration', 'organization', true),
  ('reports.templates.manage','Manage Report Templates',
   'Create and edit saved report definitions within the fields permitted to this role.',
   'Reports and analytics', 'organization', true),
  ('dashboard.layout.manage', 'Manage Dashboard Layout',
   'Configure dashboard widgets and default landing pages for permitted roles.',
   'Dashboard and analytics', 'organization', true)
on conflict (key) do nothing;

-- ═══════════════════════════ SEED (non-destructive) ════════════════════════
-- Carry the two settings that were stored but disconnected into the new store
-- so the intent already expressed by an administrator is preserved. Values are
-- read from the existing rows; nothing is overwritten and no default is
-- imposed where an administrator set none.

insert into public.platform_config_values (scope_level, scope_id, namespace, key, value, revision)
select 'global', '00000000-0000-0000-0000-000000000000', 'assessment', 'default_pass_percent',
       to_jsonb(coalesce((value ->> 'default_percent')::int, 50)), 1
from public.platform_settings where key = 'exam_pass_threshold'
on conflict (scope_level, scope_id, namespace, key) do nothing;

insert into public.platform_config_values (scope_level, scope_id, namespace, key, value, revision)
select 'global', '00000000-0000-0000-0000-000000000000', 'branding', 'support_email',
       to_jsonb(value #>> '{}'), 1
from public.platform_settings
where key = 'support_email' and jsonb_typeof(value) = 'string'
on conflict (scope_level, scope_id, namespace, key) do nothing;

-- Record the seeding itself so the history is complete from revision 1.
insert into public.platform_config_revisions
  (scope_level, scope_id, namespace, key, revision, previous_value, new_value, change_note)
select v.scope_level, v.scope_id, v.namespace, v.key, v.revision, null, v.value,
       'Seeded from platform_settings by the Platform Control Center migration (no behaviour change).'
from public.platform_config_values v
where v.revision = 1
  and not exists (
    select 1 from public.platform_config_revisions r
    where r.scope_level = v.scope_level and r.scope_id = v.scope_id
      and r.namespace = v.namespace and r.key = v.key
  );
