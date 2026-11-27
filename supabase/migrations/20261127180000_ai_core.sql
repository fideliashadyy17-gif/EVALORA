-- ═════════════════════════════════════════════════════════════════════════════
-- EVALORA AI CORE — shared infrastructure for the native assistant and for
-- external AI agents (REST + MCP).  Additive and backward compatible.
--
-- Nothing here modifies an existing table, policy or row. The core reuses
-- `access_has_permission` for every authorization decision, so a human and an
-- agent standing behind the same user resolve permissions through one function.
--
-- Principles encoded below:
--   * An agent is NEVER a shared administrator identity. It is a credential
--     bound to one human owner; the owner's own RBAC decides what it may do.
--   * Credentials are stored as SHA-256 digests only. The plaintext token is
--     shown once, at creation, and can never be read back.
--   * Every tool call is journaled in ai_executions with a digest of its
--     arguments, its status, its latency and its risk class.
--   * Sensitive operations (publish, grades, deletion, permissions, security)
--     additionally require a human approval row when policy asks for one.
--   * Cross-tenant access is structurally impossible: every row carries
--     organization_id and every resolver requires a matching organization.
-- ═════════════════════════════════════════════════════════════════════════════

begin;

-- ─── 1. Agent registry ──────────────────────────────────────────────────────
create table if not exists public.ai_agents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  description text check (description is null or char_length(description) <= 2000),
  -- Which external client this credential was issued for. Informational only:
  -- it never grants anything, and no client is trusted more than another.
  client text not null default 'custom' check (client in ('chatgpt','claude','gemini','mcp','custom')),
  -- Snapshot of the scope keys the agent was granted at issue time. Kept for
  -- display/rollback; the LIVE permission decision still comes from RBAC on
  -- the owner and is re-evaluated on every single call.
  scopes text[] not null default '{}',
  -- Optional narrowing beyond the owner's own rights. An empty list means
  -- "everything the owner may do"; a non-empty list restricts the agent to
  -- those permission keys. It can never widen the owner's access.
  allowed_permissions text[] not null default '{}',
  denied_permissions text[] not null default '{}',
  status text not null default 'pending' check (status in ('pending','approved','revoked','rejected')),
  -- The credential digest. 64 hex characters = SHA-256 of the bearer token.
  token_digest text check (token_digest is null or char_length(token_digest) = 64),
  token_prefix text check (token_prefix is null or char_length(token_prefix) between 6 and 16),
  token_last_rotated_at timestamptz,
  token_expires_at timestamptz,
  -- The human the agent acts for. Never null once approved: every tool call
  -- resolves permissions through this profile, not through a synthetic admin.
  owner_id uuid references public.profiles(id) on delete restrict,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  revoked_by uuid references public.profiles(id) on delete set null,
  revoked_at timestamptz,
  revoke_reason text check (revoke_reason is null or char_length(revoke_reason) <= 500),
  -- Optional narrowing by class/subject so an organization can hand an agent
  -- a single teaching context.
  class_ids uuid[] not null default '{}',
  subject_ids uuid[] not null default '{}',
  rate_limit_per_minute int not null default 60 check (rate_limit_per_minute between 1 and 600),
  daily_call_limit int not null default 2000 check (daily_call_limit between 1 and 1000000),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_ai_agents_org on public.ai_agents(organization_id, status, created_at desc);
create index if not exists idx_ai_agents_owner on public.ai_agents(owner_id, status);
-- One token digest maps to exactly one agent, so a token cannot be replayed
-- against two identities.
create unique index if not exists uq_ai_agents_token on public.ai_agents(token_digest)
  where token_digest is not null;
-- At most one pending credential per (organization, name).
create unique index if not exists uq_ai_agents_name on public.ai_agents(organization_id, lower(name))
  where status <> 'revoked';

comment on table public.ai_agents is
  'External AI agent identities. A credential is bound to one human owner and can never act with more rights than that owner. Revocation is immediate.';

-- ─── 2. Platform-level external connectivity switch ─────────────────────────
-- One row in platform_settings, defaulted on so the feature is discoverable,
-- but an organization must still register/approve an agent before anything can
-- call the API, and the organization-level row below can disable it outright.
insert into public.platform_settings (key, value)
values ('ai_core', '{"external_connectivity":true,"native_assistant":true,"max_agents_per_org":20}'::jsonb)
on conflict (key) do nothing;

-- ─── 3. Execution journal ───────────────────────────────────────────────────
create table if not exists public.ai_executions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- Who initiated the request, human or agent. Exactly one of the two acts.
  actor_kind text not null check (actor_kind in ('human','agent','system')),
  actor_user_id uuid references public.profiles(id) on delete set null,
  actor_email text,
  agent_id uuid references public.ai_agents(id) on delete set null,
  agent_name text,
  -- The human the operation is legally attributed to (the signed-in teacher,
  -- or the agent's owner).
  attributed_user_id uuid references public.profiles(id) on delete set null,
  surface text not null check (surface in ('native','api','mcp','system')),
  tool_name text not null check (char_length(tool_name) between 1 and 80),
  risk text not null default 'ordinary' check (risk in ('ordinary','sensitive')),
  status text not null default 'started'
    check (status in ('started','succeeded','failed','denied','awaiting_approval')),
  -- SHA-256 of the canonical JSON arguments: auditable without persisting
  -- candidate answers, keys or personal data in the journal.
  arguments_digest text check (arguments_digest is null or char_length(arguments_digest) = 64),
  arguments_summary jsonb not null default '{}'::jsonb,
  result_digest text check (result_digest is null or char_length(result_digest) = 64),
  result_summary jsonb not null default '{}'::jsonb,
  error_code text,
  error_message text check (error_message is null or char_length(error_message) <= 2000),
  latency_ms int,
  -- Set when the operation required a human decision; references ai_approvals.
  approval_id uuid,
  request_id text check (request_id is null or char_length(request_id) <= 80),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists idx_ai_executions_org on public.ai_executions(organization_id, created_at desc);
create index if not exists idx_ai_executions_agent on public.ai_executions(agent_id, created_at desc);
create index if not exists idx_ai_executions_tool on public.ai_executions(organization_id, tool_name, created_at desc);

comment on table public.ai_executions is
  'One row per AI tool call: who asked, through which surface, what tool, risk class, outcome, latency. Arguments and results are stored as digests plus a bounded summary, never as raw candidate data.';

-- ─── 4. Human approval queue ───────────────────────────────────────────────
create table if not exists public.ai_approvals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  execution_id uuid references public.ai_executions(id) on delete set null,
  agent_id uuid references public.ai_agents(id) on delete set null,
  requested_by uuid references public.profiles(id) on delete set null,
  requested_by_label text,
  surface text not null check (surface in ('native','api','mcp')),
  tool_name text not null,
  target_kind text check (target_kind is null or char_length(target_kind) <= 40),
  target_id uuid,
  -- The exact intent, so the approver reads what will happen rather than a
  -- paraphrase. Bounded so a large payload cannot become a storage vector.
  payload_digest text check (payload_digest is null or char_length(payload_digest) = 64),
  payload_summary text not null check (char_length(payload_summary) between 1 and 4000),
  status text not null default 'pending' check (status in ('pending','approved','rejected','expired','cancelled')),
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  decision_note text check (decision_note is null or char_length(decision_note) <= 2000),
  -- An approval authorises ONE execution. `consumed_at` is set by the core's
  -- claim function under a row lock, so two concurrent calls presenting the
  -- same approval cannot both go through and publish twice.
  consumed_at timestamptz,
  consumed_execution_id uuid,
  expires_at timestamptz not null default now() + interval '72 hours',
  created_at timestamptz not null default now()
);
create index if not exists idx_ai_approvals_org on public.ai_approvals(organization_id, status, created_at desc);
create index if not exists idx_ai_approvals_agent on public.ai_approvals(agent_id, created_at desc);
-- One live approval request per (agent, tool, target): repeated model retries
-- must not queue a stack of identical publish requests.
create unique index if not exists uq_ai_approvals_pending
  on public.ai_approvals(coalesce(agent_id, '00000000-0000-0000-0000-000000000000'::uuid),
                         tool_name, coalesce(target_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where status = 'pending';

-- ─── 5. Organization settings for the core ─────────────────────────────────
create table if not exists public.ai_org_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  enabled boolean not null default true,
  external_agents_enabled boolean not null default true,
  native_assistant_enabled boolean not null default true,
  -- When true, sensitive operations always require a human approval even if
  -- the caller holds the permission. Default true: nothing publishes itself.
  require_approval_for_sensitive boolean not null default true,
  -- Which model provider an organization prefers. Resolution still falls back
  -- to the deployment's configured provider when this one has no credential.
  preferred_provider text check (preferred_provider is null or preferred_provider in ('openai','anthropic','gemini')),
  preferred_model text check (preferred_model is null or char_length(preferred_model) <= 120),
  daily_generation_limit int not null default 200 check (daily_generation_limit between 0 and 100000),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- ─── 6. Row-level security ─────────────────────────────────────────────────
alter table public.ai_agents enable row level security;
alter table public.ai_executions enable row level security;
alter table public.ai_approvals enable row level security;
alter table public.ai_org_settings enable row level security;

drop policy if exists ai_agents_select on public.ai_agents;
drop policy if exists ai_agents_write on public.ai_agents;
drop policy if exists ai_executions_select on public.ai_executions;
drop policy if exists ai_executions_insert on public.ai_executions;
drop policy if exists ai_approvals_select on public.ai_approvals;
drop policy if exists ai_approvals_write on public.ai_approvals;
drop policy if exists ai_org_settings_select on public.ai_org_settings;
drop policy if exists ai_org_settings_write on public.ai_org_settings;

-- Agents: organization members may see that an agent exists; only managers
-- may create or change one; only the Super Admin may act outside the org.
create policy ai_agents_select on public.ai_agents for select to authenticated
  using (public.is_org_member(organization_id) or public.is_super_admin());
create policy ai_agents_write on public.ai_agents for all to authenticated
  using (public.can_manage_org(organization_id) or public.is_super_admin())
  with check (public.can_manage_org(organization_id) or public.is_super_admin());

-- Executions: readable by organization members (the audit trail is not a
-- secret from the tenant it belongs to) and by the platform owner.
create policy ai_executions_select on public.ai_executions for select to authenticated
  using (public.is_org_member(organization_id) or public.is_super_admin());
create policy ai_executions_insert on public.ai_executions for insert to authenticated
  with check (public.is_org_member(organization_id) or public.is_super_admin());

create policy ai_approvals_select on public.ai_approvals for select to authenticated
  using (public.is_org_member(organization_id) or public.is_super_admin());
create policy ai_approvals_write on public.ai_approvals for all to authenticated
  using (public.can_manage_org(organization_id) or public.is_super_admin())
  with check (public.can_manage_org(organization_id) or public.is_super_admin());

create policy ai_org_settings_select on public.ai_org_settings for select to authenticated
  using (public.is_org_member(organization_id) or public.is_super_admin());
create policy ai_org_settings_write on public.ai_org_settings for all to authenticated
  using (public.can_manage_org(organization_id) or public.is_super_admin())
  with check (public.can_manage_org(organization_id) or public.is_super_admin());

-- ─── 7. Credential resolution (server-side only) ───────────────────────────
-- The token is hashed with SHA-256 in the application BEFORE it reaches the
-- database, so a statement log, a slow-query log or a connection trace never
-- contains a usable credential. This function receives the 64-hex digest and
-- returns the agent identity plus the human it acts for.
--
-- SECURITY DEFINER so the route can resolve an identity before any RLS-scoped
-- read; EXECUTE is limited to the service role so an anonymous browser can
-- neither probe token existence nor list agents.
create or replace function public.ai_resolve_agent(p_token_digest text)
returns table (
  agent_id uuid,
  organization_id uuid,
  name text,
  client text,
  status text,
  owner_id uuid,
  allowed_permissions text[],
  denied_permissions text[],
  class_ids uuid[],
  subject_ids uuid[],
  rate_limit_per_minute int,
  daily_call_limit int,
  token_expires_at timestamptz
)
language sql security definer set search_path = public, pg_temp stable as $$
  select a.id, a.organization_id, a.name, a.client, a.status, a.owner_id,
         a.allowed_permissions, a.denied_permissions, a.class_ids, a.subject_ids,
         a.rate_limit_per_minute, a.daily_call_limit, a.token_expires_at
    from public.ai_agents a
   where a.token_digest = lower(p_token_digest)
     and a.token_digest ~ '^[0-9a-f]{64}$'
     and a.status = 'approved'
     and (a.token_expires_at is null or a.token_expires_at > now())
$$;

revoke all on function public.ai_resolve_agent(text) from public, anon, authenticated;
grant execute on function public.ai_resolve_agent(text) to service_role;

comment on function public.ai_resolve_agent(text) is
  'Resolves a SHA-256 token digest to an approved agent and its human owner. The plaintext credential never reaches the database.';

-- Revocation is immediate and idempotent: the digest is cleared so a stolen
-- value cannot be re-approved back into service by accident, and every pending
-- approval that agent had queued is cancelled.
create or replace function public.ai_revoke_agent(p_agent_id uuid, p_reason text default null)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare v_org uuid;
begin
  select organization_id into v_org from public.ai_agents where id = p_agent_id;
  if v_org is null then return false; end if;
  if not (public.is_super_admin() or public.can_manage_org(v_org)) then
    raise exception 'AI_PERMISSION_DENIED';
  end if;
  update public.ai_agents
     set status = 'revoked',
         token_digest = null,
         revoked_at = now(),
         revoked_by = auth.uid(),
         revoke_reason = left(coalesce(p_reason, 'Revoked by an organization administrator.'), 500),
         updated_at = now()
   where id = p_agent_id;
  update public.ai_approvals
     set status = 'cancelled', decided_at = now()
   where agent_id = p_agent_id and status = 'pending';
  return true;
end $$;

revoke all on function public.ai_revoke_agent(uuid, text) from public, anon;
grant execute on function public.ai_revoke_agent(uuid, text) to authenticated;

-- ─── 8. Single-use approval claims ─────────────────────────────────────────
-- Claiming an approval and reading it happen in ONE statement under a row lock,
-- so the decision the core acts on cannot change between reading and using it.
create or replace function public.ai_claim_approval(p_approval_id uuid, p_execution_id uuid)
returns table (approved boolean, reason text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_row public.ai_approvals;
begin
  select * into v_row from public.ai_approvals where id = p_approval_id for update;
  if not found then
    return query select false, 'not_found'::text;
    return;
  end if;
  if v_row.status = 'approved' and v_row.consumed_at is null then
    update public.ai_approvals
       set consumed_at = now(), consumed_execution_id = p_execution_id
     where id = p_approval_id;
    return query select true, 'claimed'::text;
    return;
  end if;
  if v_row.status = 'approved' and v_row.consumed_at is not null then
    return query select false, 'already_used'::text;
    return;
  end if;
  return query select false, v_row.status;
end $$;

revoke all on function public.ai_claim_approval(uuid, uuid) from public, anon, authenticated;
grant execute on function public.ai_claim_approval(uuid, uuid) to service_role;

-- A rejected/cancelled/expired approval can never be revived into 'approved'.
create or replace function public.ai_guard_approval_status()
returns trigger language plpgsql as $$
begin
  if old.status in ('rejected','expired','cancelled') and new.status = 'approved' then
    raise exception 'AI_APPROVAL_NOT_REVIVABLE';
  end if;
  if old.consumed_at is not null and new.status <> old.status then
    raise exception 'AI_APPROVAL_ALREADY_CONSUMED';
  end if;
  return new;
end $$;

drop trigger if exists trg_ai_approvals_guard on public.ai_approvals;
create trigger trg_ai_approvals_guard
  before update on public.ai_approvals
  for each row execute function public.ai_guard_approval_status();

-- Expiry sweep for stale approvals (called by cron or on demand by the core).
create or replace function public.ai_expire_approvals()
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare v_count int;
begin
  update public.ai_approvals
     set status = 'expired', decided_at = now()
   where status = 'pending' and expires_at < now();
  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke all on function public.ai_expire_approvals() from public, anon, authenticated;
grant execute on function public.ai_expire_approvals() to service_role;

-- The live-execution claim: a sensitive operation can only start once per
-- approval, even when two requests race each other.
create unique index if not exists uq_ai_executions_approval
  on public.ai_executions(approval_id) where approval_id is not null and status = 'succeeded';

-- ─── 9. Permissions used by the core ──────────────────────────────────────
-- The core does not invent a parallel permission vocabulary: these two keys
-- only gate the AI surfaces themselves. Every academic operation an AI issues
-- is authorized against the ordinary key (questions.create, exams.edit…).
insert into public.access_permissions (key, name, description, category, scope, is_system) values
  ('ai.use', 'Use the EVALORA AI Assistant',
   'Open the native AI assistant and run ordinary (read/draft) operations with it.',
   'AI and automation', 'organization', true),
  ('ai.manage_agents', 'Manage External AI Agents',
   'Register, approve, narrow and revoke external AI agent credentials for this organization.',
   'AI and automation', 'organization', true)
on conflict (key) do nothing;

-- Organization owners and administrators hold both by default, teachers hold
-- the assistant, and nobody else gains anything implicitly.
insert into public.access_role_permissions (role_id, permission_id, granted)
select r.id, p.id, true
from public.access_roles r
join public.access_permissions p on p.key in ('ai.use','ai.manage_agents')
where r.slug in ('org_owner','org_admin') and r.is_system
  and not exists (
    select 1 from public.access_role_permissions x where x.role_id = r.id and x.permission_id = p.id
  );

insert into public.access_role_permissions (role_id, permission_id, granted)
select r.id, p.id, true
from public.access_roles r
join public.access_permissions p on p.key = 'ai.use'
where r.slug in ('teacher','organizer','corrector') and r.is_system
  and not exists (
    select 1 from public.access_role_permissions x where x.role_id = r.id and x.permission_id = p.id
  );

comment on table public.ai_org_settings is
  'Per-organization switches for the AI core. A missing row means enabled with platform defaults; disabling here stops both the native assistant and every external agent for that organization.';

commit;
