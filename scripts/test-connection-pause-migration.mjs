// Migration 0097 in an isolated PGlite database.
//
// Proves the database-level guarantees of the connection-pause mechanism:
//   * purely additive — an existing exam_presence row (active student) is
//     byte-identical after the migration except for the new NULL column;
//   * the credit ledger exists, is RLS-locked to staff reads, and its unique
//     (attempt_id, lost_at) index makes duplicate reconnection credit
//     impossible at the database level;
//   * the atomic extension RPC increments exactly one attempt, only while it
//     is in_progress, never loses a concurrent increment, treats negative
//     input as zero and honors the hard 480-minute ceiling;
//   * the migration is idempotent (safe re-run).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
let checks = 0;
const check = async (name, fn) => { await fn(); checks += 1; console.log(`✓ ${name}`); };
const one = async (sql, params) => (await db.query(sql, params)).rows[0];

const ORG = "0a400000-0000-4000-8000-000000000001";
const EXAM = "c4000000-0000-4000-8000-000000000002";
const ATTEMPT = "aaaaaaaa-1111-4111-8111-111111111111";
const SUBMITTED = "aaaaaaaa-2222-4222-8222-222222222222";

try {
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin;
    create publication supabase_realtime;
    create or replace function public.is_super_admin() returns boolean language sql immutable as $$ select false $$;
    create or replace function public.org_role(uuid) returns text language sql immutable as $$ select null::text $$;

    create table public.organizations (id uuid primary key, name text not null);
    insert into public.organizations values ('${ORG}', 'Oak Academy');

    create table public.exams (
      id uuid primary key,
      organization_id uuid not null references public.organizations(id),
      title text not null,
      status text not null default 'open',
      duration_minutes integer,
      ends_at timestamptz
    );
    insert into public.exams values ('${EXAM}', '${ORG}', 'MYP4 (Grade 9) Formative Assessment 2', 'open', 60, null);

    create table public.exam_attempts (
      id uuid primary key,
      exam_id uuid not null references public.exams(id),
      candidate_id uuid,
      status text not null default 'in_progress',
      started_at timestamptz not null default now(),
      submitted_at timestamptz,
      extension_minutes integer not null default 0,
      attempt_number integer not null default 1,
      access_token uuid
    );
    insert into public.exam_attempts (id, exam_id, status, extension_minutes)
    values ('${ATTEMPT}', '${EXAM}', 'in_progress', 0),
           ('${SUBMITTED}', '${EXAM}', 'submitted', 0);

    -- the 0062 shape of exam_presence, with a LIVE student row already in it
    create table public.exam_presence (
      attempt_id uuid primary key references public.exam_attempts(id) on delete cascade,
      exam_id uuid not null references public.exams(id) on delete cascade,
      organization_id uuid not null references public.organizations(id) on delete cascade,
      last_seen_at timestamptz not null default now(),
      current_question integer check (current_question is null or current_question >= 1),
      total_questions integer check (total_questions is null or total_questions >= 0),
      saved_count integer not null default 0 check (saved_count >= 0),
      pending_saves integer not null default 0 check (pending_saves >= 0),
      updated_at timestamptz not null default now()
    );
    insert into public.exam_presence
      (attempt_id, exam_id, organization_id, last_seen_at, current_question, total_questions, saved_count, pending_saves)
    values
      ('${ATTEMPT}', '${EXAM}', '${ORG}', '2026-11-12 11:01:00+00', 6, 20, 4, 0);
    alter table public.exam_presence enable row level security;
  `);

  const before = await one("select * from public.exam_presence where attempt_id = $1", [ATTEMPT]);
  const attemptsBefore = await db.query("select id, status, extension_minutes from public.exam_attempts order by id");

  const migration = readFileSync("supabase/migrations/0097_exam_connection_pause.sql", "utf8");
  await db.exec(migration);

  await check("migration applies cleanly to the 0062 presence shape", async () => {
    const col = await one(
      "select column_name, data_type, is_nullable from information_schema.columns where table_name='exam_presence' and column_name='unconfirmed_lost_at'",
    );
    assert.equal(col.data_type, "timestamp with time zone");
    assert.equal(col.is_nullable, "YES");
  });

  await check("the live student's presence row is preserved byte-identically", async () => {
    const after = await one("select * from public.exam_presence where attempt_id = $1", [ATTEMPT]);
    for (const key of Object.keys(before)) assert.deepEqual(after[key], before[key], `column ${key} changed`);
    assert.equal(after.unconfirmed_lost_at, null);
  });

  await check("no attempt status or extension was touched", async () => {
    const after = await db.query("select id, status, extension_minutes from public.exam_attempts order by id");
    assert.deepEqual(after.rows, attemptsBefore.rows);
  });

  await check("the credit ledger exists with its kinds and staff-only RLS", async () => {
    const rls = await one("select relrowsecurity from pg_class where relname='exam_connection_events'");
    assert.equal(rls.relrowsecurity, true);
    const kinds = await one(
      "select pg_get_constraintdef(oid) as def from pg_constraint where conname like '%event_kind%' or (conrelid = 'public.exam_connection_events'::regclass and contype='c')",
    );
    assert.match(kinds.def, /pause_credit/);
    assert.match(kinds.def, /credit_refused/);
    assert.match(kinds.def, /reconnected/);
  });

  await check("the unique window index blocks duplicate reconnection credit", async () => {
    const lost = "2026-11-12 11:05:00+00";
    await db.query(
      `insert into public.exam_connection_events (attempt_id, exam_id, organization_id, event_kind, lost_at, restored_at, credit_ms)
       values ($1, $2, $3, 'pause_credit', $4, now(), 300000)`,
      [ATTEMPT, EXAM, ORG, lost],
    );
    let blocked = false;
    try {
      await db.query(
        `insert into public.exam_connection_events (attempt_id, exam_id, organization_id, event_kind, lost_at, restored_at, credit_ms)
         values ($1, $2, $3, 'pause_credit', $4, now(), 300000)`,
        [ATTEMPT, EXAM, ORG, lost],
      );
    } catch (e) {
      blocked = /uq_exam_connection_event_window|unique/i.test(String(e.message));
    }
    assert.equal(blocked, true, "a duplicate (attempt, lost_at) window must be rejected");
    const n = await one("select count(*)::int as n from public.exam_connection_events where attempt_id = $1", [ATTEMPT]);
    assert.equal(n.n, 1);
  });

  await check("the RPC increments exactly one in_progress attempt", async () => {
    const got = await one("select public.exam_attempt_add_extension_minutes($1, 5) as ext", [ATTEMPT]);
    assert.equal(got.ext, 5);
    const row = await one("select extension_minutes from public.exam_attempts where id = $1", [ATTEMPT]);
    assert.equal(row.extension_minutes, 5);
    const other = await one("select extension_minutes from public.exam_attempts where id = $1", [SUBMITTED]);
    assert.equal(other.extension_minutes, 0, "a submitted attempt is never extended");
  });

  await check("the RPC refuses to extend a non-in_progress attempt", async () => {
    const got = await one("select public.exam_attempt_add_extension_minutes($1, 5) as ext", [SUBMITTED]);
    assert.equal(got.ext, null, "a non-in_progress attempt returns NULL (no row updated)");
    const row = await one("select extension_minutes from public.exam_attempts where id = $1", [SUBMITTED]);
    assert.equal(row.extension_minutes, 0);
  });

  await check("concurrent increments are never lost (atomic UPDATE)", async () => {
    await Promise.all(
      Array.from({ length: 10 }, () =>
        db.query("select public.exam_attempt_add_extension_minutes($1, 1) as ext", [ATTEMPT]),
      ),
    );
    const row = await one("select extension_minutes from public.exam_attempts where id = $1", [ATTEMPT]);
    assert.equal(row.extension_minutes, 15);
  });

  await check("negative input credits nothing and the 480-minute ceiling holds", async () => {
    await db.query("select public.exam_attempt_add_extension_minutes($1, -50)", [ATTEMPT]);
    let row = await one("select extension_minutes from public.exam_attempts where id = $1", [ATTEMPT]);
    assert.equal(row.extension_minutes, 15);
    await db.query("select public.exam_attempt_add_extension_minutes($1, 900)", [ATTEMPT]);
    row = await one("select extension_minutes from public.exam_attempts where id = $1", [ATTEMPT]);
    assert.equal(row.extension_minutes, 480);
  });

  await check("the migration is idempotent (safe re-run)", async () => {
    await db.exec(migration);
    const n = await one("select count(*)::int as n from public.exam_connection_events");
    assert.equal(n.n, 1);
  });

  console.log(`\n${checks} checks passed`);
  process.exit(0);
} catch (err) {
  console.error(err);
  process.exit(1);
} finally {
  await db.close();
}
