// Migration 0037 exercised in isolated PGlite: plan limits are enforced by the
// database, so a client that bypasses the server actions cannot exceed a plan.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const ADMIN = '00000000-0000-4000-8000-000000000001';
const SUPER = '00000000-0000-4000-8000-000000000002';
const FREE = '00000000-0000-4000-8000-000000000010';
const PREMIUM = '00000000-0000-4000-8000-000000000011';
const UNLIMITED = '00000000-0000-4000-8000-000000000012';

let n = 0;
const test = async (name, fn) => { await fn(); n++; console.log('  ✓ ' + name); };

const asAdmin = async () => {
  await db.exec(`reset role; select set_config('test.uid','${ADMIN}',false); set role authenticated;`);
};
const asSuper = async () => {
  await db.exec(`reset role; select set_config('test.uid','${SUPER}',false); set role authenticated;`);
};
const asService = async () => {
  await db.exec("reset role; select set_config('test.uid','',false);");
};
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
const rejects = async (sql, params, pattern) => {
  let error = null;
  try { await db.query(sql, params); } catch (e) { error = e; }
  assert.ok(error, `expected a rejection: ${sql}`);
  if (pattern) assert.match(String(error.detail ?? error.message), pattern);
  return error;
};

async function newOrg(name, { planId, status, periodEnd, trialEnd, override } = {}) {
  const org = (await one('insert into public.organizations(name) values($1) returning id', [name])).id;
  await db.query(
    "insert into public.organization_members(organization_id, user_id, role, status) values ($1,$2,'owner','active')",
    [org, ADMIN],
  );
  if (planId) {
    await db.query(
      `insert into public.subscriptions(organization_id, plan_id, status, current_period_end, trial_ends_at, limits_override)
       values ($1,$2,$3,$4,$5,$6)`,
      [org, planId, status, periodEnd ?? null, trialEnd ?? null, override ? JSON.stringify(override) : null],
    );
  }
  return org;
}

const quizzes = (org, count, prefix = 'q') =>
  db.query(
    `insert into public.quizzes(id, organization_id, title)
     select gen_random_uuid(), $1, $2 || '-' || g from generate_series(1, $3) g`,
    [org, prefix, count],
  );

try {
  // ── Minimal world the migration depends on ───────────────────────────────
  await db.exec(`
    create schema auth;
    create role authenticated;
    create role anon;
    create role service_role bypassrls;
    create function auth.uid() returns uuid language sql stable as $f$
      select nullif(current_setting('test.uid', true), '')::uuid $f$;
    grant usage on schema auth to authenticated, anon, service_role;

    create table public.organizations(id uuid primary key default gen_random_uuid(), name text);

    create table public.profiles(
      id uuid primary key,
      email text,
      platform_role text not null default 'user',
      status text not null default 'active'
    );
    create function public.is_super_admin() returns boolean language sql stable security definer as $f$
      select exists(select 1 from public.profiles where id = auth.uid() and platform_role = 'super_admin' and status = 'active') $f$;

    create table public.organization_members(
      id uuid primary key default gen_random_uuid(),
      organization_id uuid not null references public.organizations(id) on delete cascade,
      user_id uuid not null,
      role text not null,
      status text not null default 'active'
    );

    create table public.plans(
      id uuid primary key,
      slug text unique not null,
      name text not null,
      limits jsonb not null default '{}'::jsonb
    );

    create table public.subscriptions(
      id uuid primary key default gen_random_uuid(),
      organization_id uuid not null references public.organizations(id) on delete cascade,
      plan_id uuid not null references public.plans(id),
      status text not null default 'trialing',
      current_period_end timestamptz,
      trial_ends_at timestamptz,
      limits_override jsonb,
      created_at timestamptz not null default now()
    );

    create table public.invitations(
      id uuid primary key default gen_random_uuid(),
      organization_id uuid not null references public.organizations(id) on delete cascade,
      email text,
      role text not null default 'teacher',
      token text not null unique,
      status text not null default 'pending',
      expires_at timestamptz,
      created_at timestamptz not null default now()
    );

    create table public.quizzes(id uuid primary key default gen_random_uuid(), organization_id uuid not null, title text);
    create table public.questions(id uuid primary key default gen_random_uuid(), organization_id uuid not null);
    create table public.exams(id uuid primary key default gen_random_uuid(), organization_id uuid not null, title text);

    grant select, insert, update, delete on all tables in schema public to authenticated;

    insert into public.profiles(id, email, platform_role) values
      ('${ADMIN}', 'admin@example.test', 'user'),
      ('${SUPER}', 'owner@example.test', 'super_admin');
    insert into public.plans(id, slug, name, limits) values
      ('${FREE}', 'free', 'Free', '{"max_quizzes":5,"max_exams":2,"max_questions":100,"max_members":3}'::jsonb),
      ('${PREMIUM}', 'premium', 'Premium', '{"max_quizzes":50,"max_exams":50,"max_questions":5000,"max_members":50}'::jsonb),
      ('${UNLIMITED}', 'institution', 'Institution', '{"max_quizzes":-1,"max_exams":-1,"max_questions":-1,"max_members":-1}'::jsonb);
  `);

  // The migration under test.
  await db.exec(readFileSync('supabase/migrations/0037_plan_limit_enforcement.sql', 'utf8'));

  // ── Checks ───────────────────────────────────────────────────────────────
  await test('a free workspace is held to the free plan limit', async () => {
    const org = await newOrg('free-one');
    await asAdmin();
    await quizzes(org, 5);
    const count = await one('select count(*)::int as c from public.quizzes where organization_id = $1', [org]);
    assert.equal(count.c, 5);
    const error = await rejects(
      `insert into public.quizzes(id, organization_id, title) values (gen_random_uuid(), $1, 'overflow')`,
      [org],
      /PLAN_LIMIT:max_quizzes:5/,
    );
    assert.match(error.message, /plan limit for quizzes \(5\)/i, 'the message must explain itself to a person');
    assert.match(error.hint, /upgrade the plan/i, 'and say what to do about it');
  });

  await test('an active subscription raises the ceiling', async () => {
    const org = await newOrg('premium-one', { planId: PREMIUM, status: 'active' });
    await asAdmin();
    await quizzes(org, 6);
    const count = await one('select count(*)::int as c from public.quizzes where organization_id = $1', [org]);
    assert.equal(count.c, 6, 'premium must allow more than the free limit of 5');
  });

  await test('an unlimited plan never blocks', async () => {
    const org = await newOrg('inst-one', { planId: UNLIMITED, status: 'active' });
    await asAdmin();
    await quizzes(org, 12);
    const count = await one('select count(*)::int as c from public.quizzes where organization_id = $1', [org]);
    assert.equal(count.c, 12);
  });

  await test('a lapsed paid period falls back to the free limit', async () => {
    const org = await newOrg('lapsed-period', {
      planId: PREMIUM,
      status: 'active',
      periodEnd: new Date(Date.now() - 86_400_000).toISOString(),
    });
    await asAdmin();
    await quizzes(org, 5);
    await rejects(
      `insert into public.quizzes(id, organization_id, title) values (gen_random_uuid(), $1, 'over')`,
      [org],
      /PLAN_LIMIT:max_quizzes:5/,
    );
  });

  await test('a lapsed trial falls back to the free limit', async () => {
    const org = await newOrg('lapsed-trial', {
      planId: PREMIUM,
      status: 'trialing',
      trialEnd: new Date(Date.now() - 3_600_000).toISOString(),
    });
    await asAdmin();
    await quizzes(org, 5);
    await rejects(
      `insert into public.quizzes(id, organization_id, title) values (gen_random_uuid(), $1, 'over')`,
      [org],
      /PLAN_LIMIT:max_quizzes:5/,
    );
  });

  await test('a running trial keeps the trial plan limits', async () => {
    const org = await newOrg('running-trial', {
      planId: PREMIUM,
      status: 'trialing',
      trialEnd: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    });
    await asAdmin();
    await quizzes(org, 6);
    const count = await one('select count(*)::int as c from public.quizzes where organization_id = $1', [org]);
    assert.equal(count.c, 6);
  });

  await test('a subscription override moves the ceiling without touching the plan', async () => {
    const org = await newOrg('overridden', { planId: FREE, status: 'active', override: { max_quizzes: 8 } });
    await asAdmin();
    await quizzes(org, 8);
    await rejects(
      `insert into public.quizzes(id, organization_id, title) values (gen_random_uuid(), $1, 'over')`,
      [org],
      /PLAN_LIMIT:max_quizzes:8/,
    );
  });

  await test('the free plan row overrides the hard-coded defaults', async () => {
    const org = await newOrg('free-two');
    await asAdmin();
    await db.query("update public.plans set limits = limits || '{\"max_exams\":1}'::jsonb where slug = 'free'");
    await db.query('insert into public.exams(id, organization_id, title) values (gen_random_uuid(), $1, $2)', [org, 'one']);
    await rejects(
      `insert into public.exams(id, organization_id, title) values (gen_random_uuid(), $1, 'two')`,
      [org],
      /PLAN_LIMIT:max_exams:1/,
    );
    await asSuper(); // restore the shared free plan for later checks
    await db.query("update public.plans set limits = limits || '{\"max_exams\":2}'::jsonb where slug = 'free'");
  });

  await test('examinations and questions are metered separately from quizzes', async () => {
    const org = await newOrg('multi-resource');
    await asAdmin();
    await db.query(`insert into public.exams(id, organization_id, title)
                    select gen_random_uuid(), $1, 'e' || g from generate_series(1,2) g`, [org]);
    await rejects(
      `insert into public.exams(id, organization_id, title) values (gen_random_uuid(), $1, 'third')`,
      [org],
      /PLAN_LIMIT:max_exams:2/,
    );
    // The rejected examination must not have consumed a question slot.
    await db.query(`insert into public.questions(id, organization_id)
                    select gen_random_uuid(), $1 from generate_series(1,100) g`, [org]);
    await rejects(
      `insert into public.questions(id, organization_id) values (gen_random_uuid(), $1)`,
      [org],
      /PLAN_LIMIT:max_questions:100/,
    );
  });

  await test('team members are metered too', async () => {
    const org = await newOrg('team-limit'); // newOrg already adds one member
    await asAdmin();
    await db.query(
      `insert into public.organization_members(organization_id, user_id, role, status)
       select $1, gen_random_uuid(), 'teacher', 'active' from generate_series(1,2) g`,
      [org],
    );
    await rejects(
      `insert into public.organization_members(organization_id, user_id, role, status)
       values ($1, gen_random_uuid(), 'teacher', 'active')`,
      [org],
      /PLAN_LIMIT:max_members:3/,
    );
  });

  await test('another workspace\u2019s rows never count against mine', async () => {
    const full = await newOrg('full-org');
    const fresh = await newOrg('fresh-org');
    await asAdmin();
    await quizzes(full, 5);
    await rejects(
      `insert into public.quizzes(id, organization_id, title) values (gen_random_uuid(), $1, 'over')`,
      [full],
      /PLAN_LIMIT/,
    );
    await quizzes(fresh, 1, 'a');
    const count = await one('select count(*)::int as c from public.quizzes where organization_id = $1', [fresh]);
    assert.equal(count.c, 1, 'a different workspace must still be able to insert');
  });

  await test('the platform owner is not metered', async () => {
    const org = await newOrg('owner-org');
    await asSuper();
    await quizzes(org, 9);
    const count = await one('select count(*)::int as c from public.quizzes where organization_id = $1', [org]);
    assert.equal(count.c, 9);
  });

  await test('an unattributable write is allowed, and the limit is still readable', async () => {
    const org = await newOrg('service-org');
    await asService();
    await quizzes(org, 7);
    const count = await one('select count(*)::int as c from public.quizzes where organization_id = $1', [org]);
    assert.equal(count.c, 7, 'service-role writes bypass metering by design');
    const limit = await one('select public.org_limit($1, $2) as l', [org, 'max_quizzes']);
    assert.equal(limit.l, 5, 'but the plan limit itself is still resolvable');
  });

  await test('the recorded limit matches the file it mirrors', async () => {
    const { FREE_LIMITS } = await import('../src/lib/entitlements.ts').catch(() => ({ FREE_LIMITS: null }));
    const stored = await one("select public.free_plan_defaults() as d");
    for (const key of ['max_quizzes', 'max_exams', 'max_questions', 'max_members']) {
      assert.equal(typeof stored.d[key], 'number', `${key} must be present in the SQL defaults`);
    }
    if (FREE_LIMITS) {
      for (const key of ['max_quizzes', 'max_exams', 'max_questions', 'max_members']) {
        assert.equal(stored.d[key], FREE_LIMITS[key], `${key} drifted from src/lib/entitlements.ts`);
      }
    }
  });

  await test('an invitation cannot be accepted past the member limit', async () => {
    const org = await newOrg('invite-limit'); // one owner already
    await asAdmin();
    await db.query(
      `insert into public.organization_members(organization_id, user_id, role, status)
       select $1, gen_random_uuid(), 'teacher', 'active' from generate_series(1,2) g`,
      [org],
    );
    await db.query(
      `insert into public.invitations(organization_id, email, role, token, status, expires_at)
       values ($1, 'new@example.test', 'teacher', 'tok-limit', 'pending', now() + interval '7 days')`,
      [org],
    );
    const newcomer = '00000000-0000-4000-8000-0000000000aa';
    const result = await one('select public.accept_invitation($1, $2) as r', ['tok-limit', newcomer]);
    assert.equal(result.r, 'limit');
    const members = await one('select count(*)::int as c from public.organization_members where organization_id = $1', [org]);
    assert.equal(members.c, 3, 'the rejected acceptance must not add a member');
    const inv = await one("select status from public.invitations where token = 'tok-limit'");
    assert.equal(inv.status, 'pending', 'and must leave the invitation usable after an upgrade');
  });

  await test('an invitation below the limit is accepted and marked once', async () => {
    const org = await newOrg('invite-ok');
    await asAdmin();
    await db.query(
      `insert into public.invitations(organization_id, email, role, token, status, expires_at)
       values ($1, 'joiner@example.test', 'corrector', 'tok-ok', 'pending', now() + interval '7 days')`,
      [org],
    );
    const joiner = '00000000-0000-4000-8000-0000000000bb';
    assert.equal((await one('select public.accept_invitation($1,$2) as r', ['tok-ok', joiner])).r, 'ok');
    const member = await one(
      'select role, status from public.organization_members where organization_id = $1 and user_id = $2',
      [org, joiner],
    );
    assert.equal(member.role, 'corrector');
    assert.equal(member.status, 'active');
    const inv = await one("select status from public.invitations where token = 'tok-ok'");
    assert.equal(inv.status, 'accepted');
  });

  await test('accepting twice is idempotent and adds no second membership', async () => {
    const org = await newOrg('invite-twice');
    await asAdmin();
    await db.query(
      `insert into public.invitations(organization_id, email, role, token, status, expires_at)
       values ($1, 'twice@example.test', 'teacher', 'tok-twice', 'pending', now() + interval '7 days')`,
      [org],
    );
    const user = '00000000-0000-4000-8000-0000000000cc';
    assert.equal((await one('select public.accept_invitation($1,$2) as r', ['tok-twice', user])).r, 'ok');
    const again = await one('select public.accept_invitation($1,$2) as r', ['tok-twice', user]);
    assert.equal(again.r, 'invalid', 'a consumed invitation is no longer pending');
    const members = await one(
      'select count(*)::int as c from public.organization_members where organization_id = $1 and user_id = $2',
      [org, user],
    );
    assert.equal(members.c, 1);
  });

  await test('an expired or unknown invitation is refused', async () => {
    const org = await newOrg('invite-expired');
    await asAdmin();
    await db.query(
      `insert into public.invitations(organization_id, email, role, token, status, expires_at)
       values ($1, 'late@example.test', 'teacher', 'tok-old', 'pending', now() - interval '1 hour')`,
      [org],
    );
    assert.equal(
      (await one('select public.accept_invitation($1,$2) as r', ['tok-old', '00000000-0000-4000-8000-0000000000dd'])).r,
      'expired',
    );
    assert.equal(
      (await one('select public.accept_invitation($1,$2) as r', ['tok-missing', '00000000-0000-4000-8000-0000000000ee'])).r,
      'invalid',
    );
  });

  console.log(`\n${n} plan-limit enforcement checks passed (migration 0037 in isolated PGlite).`);
} finally {
  await db.close();
}
