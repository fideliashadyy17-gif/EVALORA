// Migration 20261127180000_ai_core.sql in isolated PGlite.
//
// Validates the properties that matter, by running the real SQL:
//   1. a token is never stored in plaintext and resolves only while approved,
//   2. an agent credential is bound to a human owner and cannot widen rights,
//   3. approval claims are single-use and cannot be revived,
//   4. cross-tenant rows are impossible (FK + resolver),
//   5. the migration is additive: nothing existing is altered or dropped.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();

const ORG = '00000000-0000-4000-8000-000000000001';
const OTHER_ORG = '00000000-0000-4000-8000-000000000002';
const OWNER = '00000000-0000-4000-8000-000000000003';
const MANAGER = '00000000-0000-4000-8000-000000000004';
const AGENT = '00000000-0000-4000-8000-000000000010';
const OTHER_AGENT = '00000000-0000-4000-8000-000000000011';

let n = 0;
const test = async (name, fn) => {
  await fn();
  n++;
  console.log('  ✓ ' + name);
};
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
const rejects = async (sql, params, pattern) => {
  let error = null;
  try {
    // A thunk is awaited directly, so a rejection can be asserted on a call
    // whose parameters are built inside the closure.
    if (typeof sql === 'function') await sql();
    else await db.query(sql, params);
  } catch (e) {
    error = e;
  }
  assert.ok(error, `expected a rejection: ${sql}`);
  if (pattern) assert.match(error.message, pattern);
  return error;
};
const asUser = async (uid) => db.exec(`select set_config('test.uid', ${uid ? `'${uid}'` : "''"}, false);`);
const asService = async () => asUser(null);

const migration = readFileSync(
  new URL('../supabase/migrations/20261127180000_ai_core.sql', import.meta.url),
  'utf8',
);

try {
  // ── Minimal host schema the migration depends on ─────────────────────
  // Only what the new SQL references: organizations, profiles, the RBAC
  // catalog and the permission resolver. Everything else it creates itself.
  await db.exec(`
    create schema auth;
    create role authenticated;
    create role anon;
    create role service_role;
    create function auth.uid() returns uuid language sql stable as $f$
      select nullif(current_setting('test.uid', true), '')::uuid $f$;

    create table public.organizations(
      id uuid primary key default gen_random_uuid(),
      name text not null,
      status text not null default 'active'
    );

    create table public.profiles(id uuid primary key, email text, platform_role text not null default 'user');

    create table public.organization_members(
      organization_id uuid not null references public.organizations(id) on delete cascade,
      user_id uuid not null references public.profiles(id) on delete cascade,
      role text not null default 'owner',
      status text not null default 'active',
      primary key (organization_id, user_id)
    );

    create table public.platform_settings(key text primary key, value jsonb not null, updated_at timestamptz not null default now());

    create table public.access_permissions(
      id uuid primary key default gen_random_uuid(),
      key text unique not null,
      name text not null,
      description text,
      category text not null,
      scope text not null default 'organization' check (scope in ('system','organization')),
      is_system boolean not null default false,
      enabled boolean not null default true,
      created_at timestamptz not null default now()
    );

    create table public.access_roles(
      id uuid primary key default gen_random_uuid(),
      name text not null,
      slug text not null,
      description text,
      type text not null default 'custom' check (type in ('system','custom')),
      is_system boolean not null default false,
      is_active boolean not null default true,
      organization_id uuid,
      created_at timestamptz not null default now()
    );

    create table public.access_role_permissions(
      id uuid primary key default gen_random_uuid(),
      role_id uuid not null references public.access_roles(id) on delete cascade,
      permission_id uuid not null references public.access_permissions(id) on delete cascade,
      granted boolean not null default true,
      created_at timestamptz not null default now(),
      unique (role_id, permission_id)
    );

    create or replace function public.is_super_admin() returns boolean
    language sql stable security definer set search_path = public, pg_temp as $f$
      select exists (select 1 from public.profiles p where p.id = auth.uid() and p.platform_role = 'super_admin') $f$;

    create or replace function public.is_org_member(p_org uuid) returns boolean
    language sql stable as $f$
      select exists (
        select 1 from public.organization_members m
         where m.organization_id = p_org and m.user_id = auth.uid() and m.status = 'active'
      ) $f$;

    create or replace function public.can_manage_org(p_org uuid) returns boolean
    language sql stable as $f$
      select exists (
        select 1 from public.organization_members m
         where m.organization_id = p_org and m.user_id = auth.uid()
           and m.status = 'active' and m.role in ('owner','admin')
      ) $f$;
  `);

  // Pre-existing objects the migration must not disturb.
  await db.exec(`
    insert into public.organizations(id, name) values ('${ORG}', 'Oakridge'), ('${OTHER_ORG}', 'Elsewhere');
    insert into public.profiles(id, email) values
      ('${OWNER}', 'owner@oak.test'),
      ('${MANAGER}', 'manager@oak.test');
    insert into public.organization_members(organization_id, user_id, role) values
      ('${ORG}', '${OWNER}', 'owner'),
      ('${ORG}', '${MANAGER}', 'admin');
    insert into public.access_roles(name, slug, type, is_system) values
      ('Organization Owner', 'org_owner', 'system', true),
      ('Organization Admin', 'org_admin', 'system', true),
      ('Teacher', 'teacher', 'system', true),
      ('Candidate', 'candidate', 'system', true);
    insert into public.access_permissions(key, name, category) values
      ('exams.view', 'View examinations', 'Examinations'),
      ('exams.publish', 'Publish examinations', 'Examinations');
  `);

  await test('migration applies to a host schema without errors', async () => {
    await db.exec(migration);
  });

  await test('it is additive: no pre-existing table is dropped or altered', async () => {
    const statements = migration.toLowerCase();
    assert.ok(!/drop\s+table/.test(statements), 'migration must not drop a table');
    assert.ok(!/drop\s+column/.test(statements), 'migration must not drop a column');
    assert.ok(!/alter\s+table\s+public\.(organizations|profiles|organization_members|access_|platform_settings)/.test(statements),
      'migration must not alter an existing table');
    // The only drops are idempotent policy/trigger recreations.
    const drops = statements.match(/drop (table|column|policy|trigger|function|index)/g) ?? [];
    assert.deepEqual([...new Set(drops)], ['drop policy', 'drop trigger']);
  });

  await test('agent rows require an organization and can be bound to an owner', async () => {
    await rejects(
      `insert into public.ai_agents(organization_id, name) values ('00000000-0000-4000-8000-000000000099', 'ghost')`,
      [],
      /foreign key/i,
    );
    await db.query(
      `insert into public.ai_agents(id, organization_id, name, client, owner_id, status, allowed_permissions, denied_permissions)
       values ($1, $2, 'Claude desktop', 'claude', $3, 'approved', '{exams.view,exams.create}', '{exams.publish}')`,
      [AGENT, ORG, OWNER],
    );
    const row = await one(`select id, status, owner_id, allowed_permissions, denied_permissions from public.ai_agents where id = $1`, [AGENT]);
    assert.equal(row.status, 'approved');
    assert.equal(row.owner_id, OWNER);
    // Narrowing lists are declarative restrictions, never grants of their own.
    assert.deepEqual(row.allowed_permissions, ['exams.view', 'exams.create']);
    assert.deepEqual(row.denied_permissions, ['exams.publish']);
  });

  await test('one token digest can only identify one agent', async () => {
    const digest = 'a'.repeat(64);
    await db.query(
      `update public.ai_agents set token_digest = $1, token_prefix = 'sk-ai1', status = 'approved' where id = $2`,
      [digest, AGENT],
    );
    await rejects(
      `insert into public.ai_agents(organization_id, name, token_digest) values ($1, 'second', $2)`,
      [OTHER_ORG, digest],
      /duplicate key|unique/i,
    );
  });

  await test('a token resolves only while its agent is approved and unexpired', async () => {
    // The application hashes the credential; the database only ever sees the
    // digest. `createHash` here stands in for the route's own hashing.
    const raw = 'sk-ai-live-token-0123456789';
    const { createHash } = await import('node:crypto');
    const digest = createHash('sha256').update(raw).digest('hex');
    await db.query(`update public.ai_agents set token_digest = $1 where id = $2`, [digest, AGENT]);

    const found = await one(`select * from public.ai_resolve_agent($1)`, [digest]);
    assert.equal(found.agent_id, AGENT);
    assert.equal(found.organization_id, ORG, 'the resolver returns the tenant the agent belongs to');
    assert.equal(found.owner_id, OWNER);

    // Plaintext is nowhere.
    const stored = await one(`select token_digest, token_prefix from public.ai_agents where id = $1`, [AGENT]);
    assert.equal(stored.token_digest, digest);
    assert.notEqual(stored.token_digest, raw);
    // A malformed "digest" never matches anything.
    const bogus = (await one(`select * from public.ai_resolve_agent($1)`, ["not-a-digest"])) ?? {};
    assert.equal(bogus.agent_id ?? null, null);

    // Revocation clears the digest, so the same value can never resolve again.
    await asUser(MANAGER);
    const revoked = await one(`select public.ai_revoke_agent($1, 'lost laptop') as ok`, [AGENT]);
    assert.equal(revoked.ok, true);
    await asService();
    const after = await one(`select * from public.ai_resolve_agent($1)`, [digest]) ?? {};
    assert.equal(after.agent_id ?? null, null);
    const cleared = await one(`select token_digest, status, revoke_reason from public.ai_agents where id = $1`, [AGENT]);
    assert.equal(cleared.token_digest, null);
    assert.equal(cleared.status, 'revoked');
    assert.equal(cleared.revoke_reason, 'lost laptop');
  });

  await test('a non-manager cannot revoke an agent', async () => {
    await db.query(
      `insert into public.ai_agents(id, organization_id, name, status, owner_id) values ($1, $2, 'Gemini', 'approved', $3)`,
      [OTHER_AGENT, ORG, OWNER],
    );
    // A teacher-level member (no manage rights on the org).
    await db.query(`insert into public.profiles(id) values ('00000000-0000-4000-8000-000000000005')`);
    await db.query(
      `insert into public.organization_members(organization_id, user_id, role) values ($1, '00000000-0000-4000-8000-000000000005', 'teacher')`,
      [ORG],
    );
    await asUser('00000000-0000-4000-8000-000000000005');
    await rejects(`select public.ai_revoke_agent('${OTHER_AGENT}', 'nope')`, [], /AI_PERMISSION_DENIED/);
    const still = await one(`select status from public.ai_agents where id = $1`, [OTHER_AGENT]);
    assert.equal(still.status, 'approved');
    await asUser(OWNER);
    await db.query(`select public.ai_revoke_agent($1, 'test cleanup')`, [OTHER_AGENT]);
    await asService();
  });

  await test('an approval is single-use and cannot be revived', async () => {
    const approval = await one(
      `insert into public.ai_approvals(organization_id, surface, tool_name, payload_summary, status, decided_by, decided_at)
       values ($1, 'api', 'publish_examination', 'Publish MYP4 Version C', 'approved', $2, now())
       returning id`,
      [ORG, OWNER],
    );
    const execution = await one(
      `insert into public.ai_executions(organization_id, actor_kind, actor_user_id, surface, tool_name, risk, status, approval_id)
       values ($1, 'human', $2, 'api', 'publish_examination', 'sensitive', 'started', $3) returning id`,
      [ORG, OWNER, approval.id],
    );
    const first = await one(`select * from public.ai_claim_approval($1, $2)`, [approval.id, execution.id]);
    assert.deepEqual({ approved: first.approved, reason: first.reason }, { approved: true, reason: 'claimed' });
    const second = await one(`select * from public.ai_claim_approval($1, $2)`, [approval.id, execution.id]);
    assert.deepEqual({ approved: second.approved, reason: second.reason }, { approved: false, reason: 'already_used' });

    await rejects(`update public.ai_approvals set status = 'pending' where id = '${approval.id}'`, [], /AI_APPROVAL_ALREADY_CONSUMED/);

    const dead = await one(
      `insert into public.ai_approvals(organization_id, surface, tool_name, payload_summary, status)
       values ($1, 'native', 'apply_grade_adjustment', 'x', 'rejected') returning id`,
      [ORG],
    );
    await rejects(`update public.ai_approvals set status = 'approved' where id = '${dead.id}'`, [], /AI_APPROVAL_NOT_REVIVABLE/);
  });

  await test('the same approval cannot back two successful executions', async () => {
    const approval = await one(
      `insert into public.ai_approvals(organization_id, surface, tool_name, payload_summary, status) values ($1,'api','publish_results','x','approved') returning id`,
      [ORG],
    );
    const makeExecution = async (status) =>
      db.query(
        `insert into public.ai_executions(organization_id, actor_kind, actor_user_id, surface, tool_name, risk, status, approval_id)
         values ($1, 'agent', $2, 'api', 'publish_results', 'sensitive', $3, $4)`,
        [ORG, OWNER, status, approval.id],
      );
    await makeExecution('succeeded');
    // Calling the thunk performs the insert, so the rejection proves the
    // duplicate was refused rather than silently accepted.
    await rejects(() => makeExecution('succeeded'), [], /duplicate key|unique/i);
    // A failed attempt does not consume the slot for the unique index.
    await makeExecution('failed');
  });

  await test('the expiry sweep closes stale approvals only', async () => {
    const stale = await one(
      `insert into public.ai_approvals(organization_id, surface, tool_name, target_id, payload_summary, expires_at)
       values ($1,'mcp','publish_examination',$2,'stale', now() - interval '1 minute') returning id`,
      [ORG, '00000000-0000-4000-8000-0000000000b1'],
    );
    const live = await one(
      `insert into public.ai_approvals(organization_id, surface, tool_name, target_id, payload_summary)
       values ($1,'mcp','publish_examination',$2,'live') returning id`,
      [ORG, '00000000-0000-4000-8000-0000000000b2'],
    );
    const swept = await one(`select public.ai_expire_approvals() as n`);
    assert.ok(Number(swept.n) >= 1);
    const staleRow = await one(`select status from public.ai_approvals where id = $1`, [stale.id]);
    const liveRow = await one(`select status from public.ai_approvals where id = $1`, [live.id]);
    assert.equal(staleRow.status, 'expired');
    assert.equal(liveRow.status, 'pending');
  });

  await test('one pending approval request per agent, tool and target', async () => {
    const insert = `insert into public.ai_approvals(organization_id, agent_id, surface, tool_name, target_id, payload_summary)
                    values ($1, $2, 'api', 'publish_examination', $3, 'same target')`;
    const target = '00000000-0000-4000-8000-0000000000aa';
    await db.query(insert, [ORG, null, target]);
    await rejects(insert, [ORG, null, target], /duplicate key|unique/i);
  });

  await test('the resolver grants no permissions of its own', async () => {
    // The columns are declared narrowing lists, not grants: an empty allow-list
    // means "whatever the owner may do", and the core ANDs them with RBAC.
    const cols = (
      await db.query(
        `select column_name from information_schema.columns
          where table_schema = 'public' and table_name = 'ai_agents'
            and column_name in ('allowed_permissions','denied_permissions','scopes')
          order by column_name`,
      )
    ).rows.map((r) => r.column_name);
    assert.deepEqual(cols, ['allowed_permissions', 'denied_permissions', 'scopes']);
    const noRoleColumn = (
      await db.query(
        `select column_name from information_schema.columns
          where table_schema = 'public' and table_name = 'ai_agents' and column_name in ('role','platform_role','role_id')`,
      )
    ).rows;
    assert.deepEqual(noRoleColumn, [], 'an agent has no role of its own: it acts as its owner');
  });

  await test('RLS is enabled on all four new tables', async () => {
    const rows = (
      await db.query(
        `select relname, relrowsecurity from pg_class
          where relname in ('ai_agents','ai_executions','ai_approvals','ai_org_settings') and relkind = 'r'
          order by relname`,
      )
    ).rows;
    assert.equal(rows.length, 4);
    for (const row of rows) assert.equal(row.relrowsecurity, true, `${row.relname} must have RLS`);
  });

  await test('the AI permission keys are seeded and granted only to managers and teachers', async () => {
    const keys = (
      await db.query(`select key from public.access_permissions where key like 'ai.%' order by key`)
    ).rows.map((r) => r.key);
    assert.deepEqual(keys, ['ai.manage_agents', 'ai.use']);

    const grants = (
      await db.query(
        `select r.slug, p.key from public.access_role_permissions x
           join public.access_roles r on r.id = x.role_id
           join public.access_permissions p on p.id = x.permission_id
          where p.key like 'ai.%' order by r.slug, p.key`,
      )
    ).rows.map((r) => `${r.slug}:${r.key}`);
    assert.deepEqual(grants, [
      'org_admin:ai.manage_agents',
      'org_admin:ai.use',
      'org_owner:ai.manage_agents',
      'org_owner:ai.use',
      'teacher:ai.use',
    ]);
    // A candidate never gains the assistant.
    assert.ok(!grants.some((g) => g.startsWith('candidate:')));
  });

  await test('the execution journal does not require raw arguments', async () => {
    // A digest plus a bounded summary is enough to audit, and keeps candidate
    // answers out of the journal.
    const cols = (
      await db.query(
        `select column_name from information_schema.columns
          where table_schema='public' and table_name='ai_executions' and column_name in ('arguments','result','arguments_digest','result_digest')`,
      )
    ).rows.map((r) => r.column_name);
    assert.deepEqual(cols.sort(), ['arguments_digest', 'result_digest']);
  });

  console.log(`\nAI core migration: ${n} checks passed.`);
} finally {
  await db.close();
}
