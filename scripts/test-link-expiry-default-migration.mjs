// Migration 0096 in an isolated PGlite database.
//
// Proves the database-level guarantees of the access repair:
//   * links that exist without an expiry and without an exemption are
//     backfilled to the platform-policy default (>= now + 7 days, window +
//     default_days) and marked `backfilled_30_days`;
//   * links that already carry an expiry are NEVER modified;
//   * an explicit no-expiry exemption is preserved;
//   * every FUTURE insert — whatever creation path — is born with a
//     policy-compliant expiry, so a new link can never display as expired;
//   * an update that clears an expiry without an exemption is repaired by
//     the trigger instead of producing a policy-violating row;
//   * candidate uniqueness is per person per browser: the same student on
//     the same browser can never create a duplicate candidate (even with
//     case/whitespace variations of their name), while a DIFFERENT student
//     on the same shared device gets their own candidate row.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
let checks = 0;
const check = async (name, fn) => { await fn(); checks += 1; console.log(`✓ ${name}`); };
const query = (sql, params) => db.query(sql, params);
const one = async (sql, params) => (await query(sql, params)).rows[0];

try {
  await db.exec(`
    create table public.platform_settings (
      key text primary key,
      value jsonb not null,
      updated_at timestamptz not null default now()
    );
    insert into public.platform_settings (key, value)
    values ('exam_link_policy', '{"allow_no_expiry": false, "default_days": 30, "link_requires_expiry": true}'::jsonb);

    create table public.organizations (id uuid primary key, name text not null);
    insert into public.organizations values ('0a400000-0000-4000-8000-000000000001', 'Oak Academy');

    create table public.classes (
      id uuid primary key,
      organization_id uuid not null references public.organizations(id),
      name text not null
    );
    insert into public.classes values
      ('0a400000-0000-4000-8000-000000000107', '0a400000-0000-4000-8000-000000000001', 'Grade 7 — MYP 2');

    create table public.exams (
      id uuid primary key,
      organization_id uuid not null references public.organizations(id),
      title text not null,
      status text not null default 'draft',
      access_code text not null,
      access_code_hash text not null default '',
      settings jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      starts_at timestamptz,
      ends_at timestamptz,
      invite_token uuid not null default gen_random_uuid(),
      invite_expires_at timestamptz,
      invite_activates_at timestamptz,
      invite_disabled_at timestamptz,
      invite_expiry_policy text,
      invite_no_expiry boolean not null default false,
      shared_link_enabled boolean not null default true
    );

    create table public.exam_candidates (
      id uuid primary key default gen_random_uuid(),
      exam_id uuid not null references public.exams(id),
      full_name text,
      access_code text,
      status text not null default 'registered',
      created_at timestamptz not null default now(),
      student_id uuid,
      class_id uuid references public.classes(id),
      first_name text,
      last_name text,
      guest_key_hash text,
      invite_token uuid,
      source text not null default 'admin',
      identity_data jsonb not null default '{}'::jsonb
    );

    -- Pre-migration state, mirroring production 2026-11-12:
    -- six formative assessments born without an expiry after 0076 ran.
    insert into public.exams (id, organization_id, title, status, access_code, created_at, shared_link_enabled)
    values
      ('c2000000-0000-4000-8000-000000000002', '0a400000-0000-4000-8000-000000000001', 'Formative A', 'open', 'MYP2-FORM2-2026', now() - interval '3 hours', true),
      ('c4000000-0000-4000-8000-000000000002', '0a400000-0000-4000-8000-000000000001', 'Formative B', 'open', 'MYP4-FORM2-2026', now() - interval '3 hours', true),
      ('c5000000-0000-4000-8000-000000000002', '0a400000-0000-4000-8000-000000000001', 'Formative C', 'open', 'MYP5-FORM2-2026', now() - interval '2 hours', true);

    -- a windowed exam without expiry: backfill must measure from ends_at;
    insert into public.exams (id, organization_id, title, status, access_code, created_at, starts_at, ends_at)
    values ('d1000000-0000-4000-8000-000000000001', '0a400000-0000-4000-8000-000000000001', 'Windowed', 'open', 'WIN-1',
            now() - interval '10 days', now() - interval '1 day', now() + interval '2 days');

    -- an explicitly exempt permanent link: must stay untouched;
    insert into public.exams (id, organization_id, title, status, access_code, invite_no_expiry, invite_expiry_policy)
    values ('d2000000-0000-4000-8000-000000000001', '0a400000-0000-4000-8000-000000000001', 'Permanent exempt', 'open', 'PERM-1', true, 'no_expiry_exempt');

    -- a link with a genuine, stored expiry: must NOT be extended;
    insert into public.exams (id, organization_id, title, status, access_code, invite_expires_at, invite_expiry_policy)
    values ('d3000000-0000-4000-8000-000000000001', '0a400000-0000-4000-8000-000000000001', 'Configured', 'open', 'CFG-1', now() + interval '3 days', 'custom');

    -- a genuinely expired link: must stay expired (never silently reopened);
    insert into public.exams (id, organization_id, title, status, access_code, invite_expires_at, invite_expiry_policy)
    values ('d4000000-0000-4000-8000-000000000001', '0a400000-0000-4000-8000-000000000001', 'Really expired', 'open', 'EXP-1', now() - interval '1 day', '7d');
  `);

  const migration = readFileSync("supabase/migrations/0096_link_expiry_defaults_and_shared_device_access.sql", "utf8");
  await db.exec(migration);

  await check("null-expiry open links are backfilled to a FUTURE policy expiry", async () => {
    const rows = (await query(
      `select id, invite_expires_at, invite_expiry_policy from public.exams
        where id in ('c2000000-0000-4000-8000-000000000002','c4000000-0000-4000-8000-000000000002','c5000000-0000-4000-8000-000000000002')`,
    )).rows;
    assert.equal(rows.length, 3);
    for (const row of rows) {
      assert.ok(row.invite_expires_at, "expiry must be set");
      const expiry = new Date(row.invite_expires_at).getTime();
      assert.ok(expiry > Date.now() + 6 * 24 * 3600 * 1000, "expiry is at least ~7 days out");
      assert.ok(expiry <= Date.now() + 31 * 24 * 3600 * 1000, "expiry respects the 30-day policy default");
      assert.equal(row.invite_expiry_policy, "backfilled_30_days");
    }
  });

  await check("windowed exam expiry is measured from the window end", async () => {
    const row = await one(`select invite_expires_at, ends_at from public.exams where id = 'd1000000-0000-4000-8000-000000000001'`);
    const expiry = new Date(row.invite_expires_at).getTime();
    const endsAt = new Date(row.ends_at).getTime();
    assert.ok(Math.abs(expiry - (endsAt + 30 * 24 * 3600 * 1000)) < 60_000, "ends_at + 30 days");
  });

  await check("explicit no-expiry exemption is preserved", async () => {
    const row = await one(`select invite_expires_at, invite_no_expiry from public.exams where id = 'd2000000-0000-4000-8000-000000000001'`);
    assert.equal(row.invite_expires_at, null);
    assert.equal(row.invite_no_expiry, true);
  });

  await check("configured expiries are never modified", async () => {
    const row = await one(`select invite_expires_at, invite_expiry_policy from public.exams where id = 'd3000000-0000-4000-8000-000000000001'`);
    const expiry = new Date(row.invite_expires_at).getTime();
    assert.ok(Math.abs(expiry - (Date.now() + 3 * 24 * 3600 * 1000)) < 120_000);
    assert.equal(row.invite_expiry_policy, "custom");
  });

  await check("a genuinely expired link stays expired (never silently reopened)", async () => {
    const row = await one(`select invite_expires_at from public.exams where id = 'd4000000-0000-4000-8000-000000000001'`);
    assert.ok(new Date(row.invite_expires_at).getTime() < Date.now());
  });

  await check("a NEW exam inserted without an expiry is born policy-compliant", async () => {
    await query(
      `insert into public.exams (id, organization_id, title, status, access_code)
       values ('e1000000-0000-4000-8000-000000000001', '0a400000-0000-4000-8000-000000000001', 'Seeded later', 'open', 'SEED-1')`,
    );
    const row = await one(`select invite_expires_at, invite_expiry_policy, invite_no_expiry from public.exams where id = 'e1000000-0000-4000-8000-000000000001'`);
    assert.ok(row.invite_expires_at, "trigger must fill the expiry");
    assert.ok(new Date(row.invite_expires_at).getTime() > Date.now() + 29 * 24 * 3600 * 1000);
    assert.equal(row.invite_expiry_policy, "backfilled_30_days");
    assert.equal(row.invite_no_expiry, false);
  });

  await check("an explicit expiry supplied at insert is kept exactly", async () => {
    await query(
      `insert into public.exams (id, organization_id, title, status, access_code, invite_expires_at, invite_expiry_policy)
       values ('e2000000-0000-4000-8000-000000000001', '0a400000-0000-4000-8000-000000000001', 'Chosen expiry', 'draft', 'SEED-2', now() + interval '24 hours', '24h')`,
    );
    const row = await one(`select invite_expires_at, invite_expiry_policy from public.exams where id = 'e2000000-0000-4000-8000-000000000001'`);
    assert.ok(Math.abs(new Date(row.invite_expires_at).getTime() - (Date.now() + 24 * 3600 * 1000)) < 120_000);
    assert.equal(row.invite_expiry_policy, "24h");
  });

  await check("clearing an expiry without an exemption is repaired by the trigger", async () => {
    await query(`update public.exams set invite_expires_at = null where id = 'e2000000-0000-4000-8000-000000000001'`);
    const row = await one(`select invite_expires_at from public.exams where id = 'e2000000-0000-4000-8000-000000000001'`);
    assert.ok(row.invite_expires_at, "trigger must refill a cleared expiry");
    assert.ok(new Date(row.invite_expires_at).getTime() > Date.now());
  });

  await check("setting the exemption together with a null expiry is allowed", async () => {
    await query(`update public.exams set invite_no_expiry = true, invite_expires_at = null where id = 'e1000000-0000-4000-8000-000000000001'`);
    const row = await one(`select invite_expires_at, invite_no_expiry from public.exams where id = 'e1000000-0000-4000-8000-000000000001'`);
    assert.equal(row.invite_expires_at, null);
    assert.equal(row.invite_no_expiry, true);
  });

  await check("policy default_days is honoured when the platform changes it", async () => {
    await query(`update public.platform_settings set value = '{"allow_no_expiry": false, "default_days": 7, "link_requires_expiry": true}'::jsonb where key = 'exam_link_policy'`);
    await query(
      `insert into public.exams (id, organization_id, title, status, access_code)
       values ('e3000000-0000-4000-8000-000000000001', '0a400000-0000-4000-8000-000000000001', 'Seven day policy', 'open', 'SEED-3')`,
    );
    const row = await one(`select invite_expires_at from public.exams where id = 'e3000000-0000-4000-8000-000000000001'`);
    const expiry = new Date(row.invite_expires_at).getTime();
    assert.ok(expiry >= Date.now() + 6.9 * 24 * 3600 * 1000, "at least the 7-day floor");
    assert.ok(expiry <= Date.now() + 8 * 24 * 3600 * 1000, "not the 30-day default");
    await query(`update public.platform_settings set value = '{"allow_no_expiry": false, "default_days": 30, "link_requires_expiry": true}'::jsonb where key = 'exam_link_policy'`);
  });

  const EXAM = "c2000000-0000-4000-8000-000000000002";
  const CLASS = "0a400000-0000-4000-8000-000000000107";
  const BROWSER = "hash-of-shared-lab-browser-key";

  await check("two DIFFERENT students may share one browser (shared device)", async () => {
    await query(
      `insert into public.exam_candidates (exam_id, first_name, last_name, class_id, guest_key_hash, source, access_code)
       values ($1, 'Isaac', 'AHOUANVOEKE', $2, $3, 'shared_link', 'CAND-1')`,
      [EXAM, CLASS, BROWSER],
    );
    await query(
      `insert into public.exam_candidates (exam_id, first_name, last_name, class_id, guest_key_hash, source, access_code)
       values ($1, 'Naledi', 'AMOUSSOUKPEVI', $2, $3, 'shared_link', 'CAND-2')`,
      [EXAM, CLASS, BROWSER],
    );
    const { count } = await one(
      `select count(*)::int as count from public.exam_candidates where exam_id = $1 and guest_key_hash = $2`,
      [EXAM, BROWSER],
    );
    assert.equal(count, 2);
  });

  await check("the SAME student on the same browser can never duplicate (even with case/space variants)", async () => {
    let failed = false;
    try {
      await query(
        `insert into public.exam_candidates (exam_id, first_name, last_name, class_id, guest_key_hash, source, access_code)
         values ($1, '  isaac ', 'ahouanvoeke', $2, $3, 'shared_link', 'CAND-3')`,
        [EXAM, CLASS, BROWSER],
      );
    } catch (error) {
      failed = /uq_exam_candidate_shared_identity/.test(String(error.message));
    }
    assert.ok(failed, "duplicate person on the same browser must hit the unique index");
  });

  await check("the same person on a DIFFERENT browser is a separate device identity", async () => {
    await query(
      `insert into public.exam_candidates (exam_id, first_name, last_name, class_id, guest_key_hash, source, access_code)
       values ($1, 'Isaac', 'AHOUANVOEKE', $2, $3, 'shared_link', 'CAND-4')`,
      [EXAM, CLASS, "hash-of-home-browser"],
    );
    const { count } = await one(
      `select count(*)::int as count from public.exam_candidates where exam_id = $1 and lower(btrim(first_name)) = 'isaac'`,
      [EXAM],
    );
    assert.equal(count, 2, "one per browser — the admission route resumes by identity, never duplicating attempts");
  });

  await check("candidates without a browser key (admin/import) are unconstrained by the identity index", async () => {
    await query(
      `insert into public.exam_candidates (exam_id, full_name, class_id, guest_key_hash, source, access_code)
       values ($1, 'Imported Student', $2, null, 'import', 'CAND-5')`,
      [EXAM, CLASS],
    );
    await query(
      `insert into public.exam_candidates (exam_id, full_name, class_id, guest_key_hash, source, access_code)
       values ($1, 'Imported Student', $2, null, 'import', 'CAND-6')`,
      [EXAM, CLASS],
    );
    const { count } = await one(
      `select count(*)::int as count from public.exam_candidates where exam_id = $1 and guest_key_hash is null`,
      [EXAM],
    );
    assert.equal(count, 2);
  });

  console.log(`${checks} migration checks passed`);
} finally {
  await db.close();
}
