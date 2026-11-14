// Migration 0099 in an isolated PGlite database, layered on the real 0098.
//
// Proves the database-level guarantees of the CONNECTION_LOST pause — the
// permanent fix for the 2026-11-12 incident, where a mass client outage was
// turned into auto-submissions at the deadline:
//   * purely additive — no exam, attempt, answer or history row changes;
//   * the audit ledger accepts reason 'connection' and still rejects
//     everything unknown;
//   * exam_attempt_set_pause keeps its three-argument call signature
//     (backward compatible) and gains the evidence anchor p_paused_at, which
//     is honoured for 'connection' ONLY and clamped to [started_at, now];
//   * resume credits the anchored window into extension_minutes, so the
//     candidate's remaining time continues from the moment of disconnection;
//   * reasons stay independent: a reconnection clears ONLY 'connection' and
//     can never cancel an organizer pause; credit happens when the LAST
//     reason clears, exactly once for the union window;
//   * manual pauses ignore the anchor (effective from now, as before);
//   * EXECUTE stays service-role-only (public/anon/authenticated revoked);
//   * the migration is idempotent (safe re-run).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
let checks = 0;
const check = async (name, fn) => { await fn(); checks += 1; console.log(`✓ ${name}`); };
const one = async (sql, params) => (await db.query(sql, params)).rows[0];
const rpc = async (fn, params) => (await db.query(`select public.${fn} as r`, params)).rows[0].r;
const arr = (v) => {
  if (Array.isArray(v)) return v;
  if (typeof v !== "string") return v;
  const t = v.trim();
  if (t === "{}") return [];
  if (t.startsWith("{") && t.endsWith("}")) return t.slice(1, -1).split(",").map((x) => x.replace(/^"|"$/g, ""));
  return v;
};

const ORG = "0a400000-0000-4000-8000-000000000001";
const EXAM = "c4000000-0000-4000-8000-000000000002";
const A = "aaaaaaaa-1111-4111-8111-111111111111"; // live attempt, started 11:00
const B = "aaaaaaaa-2222-4222-8222-222222222222"; // second live attempt
const SUBMITTED = "aaaaaaaa-3333-4333-8333-333333333333";

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

    create table public.profiles (id uuid primary key, email text);

    create table public.exams (
      id uuid primary key,
      organization_id uuid not null references public.organizations(id),
      title text not null,
      status text not null default 'open' constraint exams_status_check check (status in ('draft','scheduled','open','closed')),
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
    insert into public.exam_attempts (id, exam_id, status, started_at, extension_minutes)
    values ('${A}', '${EXAM}', 'in_progress', '2026-11-12 11:00:00+00', 4),
           ('${B}', '${EXAM}', 'in_progress', '2026-11-12 11:05:00+00', 0),
           ('${SUBMITTED}', '${EXAM}', 'submitted', '2026-11-12 10:00:00+00', 0);
  `);

  await db.exec(readFileSync("supabase/migrations/20261112131249_exam_manual_pause.sql", "utf8"));
  const examsBefore = await db.query("select id, status, duration_minutes, ends_at from public.exams order by id");
  const attemptsBefore = await db.query("select id, status, started_at, submitted_at, extension_minutes, pause_reasons, paused_at from public.exam_attempts order by id");

  const migration = readFileSync("supabase/migrations/20261112145804_exam_connection_lost_pause.sql", "utf8");
  await db.exec(migration);

  await check("0099 applies cleanly on top of 0098 and is purely additive", async () => {
    const examsAfter = await db.query("select id, status, duration_minutes, ends_at from public.exams order by id");
    assert.deepEqual(examsAfter.rows, examsBefore.rows, "no exam changed");
    const attemptsAfter = await db.query("select id, status, started_at, submitted_at, extension_minutes, pause_reasons, paused_at from public.exam_attempts order by id");
    assert.deepEqual(attemptsAfter.rows, attemptsBefore.rows, "no attempt changed");
  });

  await check("the ledger accepts reason 'connection' (with a null actor — the server acts) and still rejects unknowns", async () => {
    await db.query(
      `insert into public.exam_pause_events (organization_id, exam_id, attempt_id, actor_id, scope, action, reason)
       values ('${ORG}', '${EXAM}', '${A}', null, 'attempt', 'pause', 'connection')`,
    );
    const evt = await one("select reason, actor_id from public.exam_pause_events");
    assert.equal(evt.reason, "connection");
    assert.equal(evt.actor_id, null);
    await db.query("delete from public.exam_pause_events");
    await assert.rejects(
      db.query(`insert into public.exam_pause_events (organization_id, exam_id, scope, action, reason) values ('${ORG}', '${EXAM}', 'attempt', 'pause', 'wifi')`),
      "unknown reasons stay rejected",
    );
  });

  await check("backward compatibility: the three-argument call signature still works", async () => {
    const p = await rpc("exam_attempt_set_pause($1::uuid, $2, $3)", [A, "student", true]);
    assert.equal(p.paused, true);
    const r = await rpc("exam_attempt_set_pause($1::uuid, $2, $3)", [A, "student", false]);
    assert.equal(r.paused, false);
    assert.ok(Number(r.credited_minutes) >= 0);
    const attempt = await one("select extension_minutes, pause_reasons, paused_at from public.exam_attempts where id=$1", [A]);
    assert.deepEqual(arr(attempt.pause_reasons), []);
    assert.equal(attempt.paused_at, null);
  });

  await check("unknown reasons are still refused; non-in_progress attempts are untouchable", async () => {
    await assert.rejects(rpc("exam_attempt_set_pause($1::uuid, $2, $3, $4::timestamptz)", [A, "wifi", true, null]));
    assert.equal(await rpc("exam_attempt_set_pause($1::uuid, $2, $3, $4::timestamptz)", [SUBMITTED, "connection", true, null]), null);
    assert.equal(await rpc("exam_attempt_set_pause($1::uuid, $2, $3, $4::timestamptz)", ["aaaaaaaa-9999-4999-8999-999999999999", "connection", true, null]), null);
  });

  await check("a connection pause anchors at the evidence instant and resume credits exactly that window", async () => {
    // The device went silent 5 minutes ago (the incident shape): the server
    // anchors the pause at that last confirmed heartbeat, not at the moment
    // the sweep happened to notice.
    const anchor = await one("select now() - interval '5 minutes' as t");
    const p = await rpc("exam_attempt_set_pause($1::uuid, $2, $3, $4::timestamptz)", [A, "connection", true, anchor.t]);
    assert.equal(p.paused, true);
    assert.deepEqual(arr(p.reasons), ["connection"]);
    const paused = await one("select paused_at, extension_minutes from public.exam_attempts where id=$1", [A]);
    const extBefore = Number(paused.extension_minutes);
    assert.ok(Math.abs(paused.paused_at.getTime() - anchor.t.getTime()) < 1500, "paused_at is the evidence anchor");

    const r = await rpc("exam_attempt_set_pause($1::uuid, $2, $3, $4::timestamptz)", [A, "connection", false, null]);
    assert.equal(r.paused, false, "the candidate is back: the pause clears");
    const credited = Number(r.credited_minutes);
    assert.ok(credited >= 5 && credited <= 6, `the outage itself is credited (got ${credited})`);
    assert.equal(Number(r.extension_minutes), extBefore + credited);
    const after = await one("select paused_at, pause_reasons, pause_credited_ms from public.exam_attempts where id=$1", [A]);
    assert.equal(after.paused_at, null);
    assert.deepEqual(arr(after.pause_reasons), []);
    assert.ok(Number(after.pause_credited_ms) >= 5 * 60_000, "the credited window is recorded");
  });

  await check("the anchor is clamped: never in the future, never before the start", async () => {
    const future = await rpc("exam_attempt_set_pause($1::uuid, $2, $3, $4::timestamptz)", [A, "connection", true, new Date(Date.now() + 3600_000).toISOString()]);
    assert.equal(future.paused, true);
    const rowF = await one("select paused_at from public.exam_attempts where id=$1", [A]);
    assert.ok(rowF.paused_at.getTime() <= Date.now() + 1500, "a future anchor collapses to now (no negative windows)");
    await rpc("exam_attempt_set_pause($1::uuid, $2, $3, $4::timestamptz)", [A, "connection", false, null]);

    await rpc("exam_attempt_set_pause($1::uuid, $2, $3, $4::timestamptz)", [A, "connection", true, "2020-01-01T00:00:00Z"]);
    const rowA = await one("select paused_at, started_at from public.exam_attempts where id=$1", [A]);
    assert.equal(rowA.paused_at.getTime(), rowA.started_at.getTime(), "an anchor before the start collapses to started_at (no invented time)");
    await rpc("exam_attempt_set_pause($1::uuid, $2, $3, $4::timestamptz)", [A, "connection", false, null]);
  });

  await check("manual reasons ignore the anchor: organizer pauses stay effective from now", async () => {
    await rpc("exam_attempt_set_pause($1::uuid, $2, $3, $4::timestamptz)", [B, "student", true, "2026-11-12 09:00:00+00"]);
    const row = await one("select paused_at from public.exam_attempts where id=$1", [B]);
    assert.ok(row.paused_at.getTime() > Date.now() - 60_000, "a backdated anchor is ignored for manual reasons");
    await rpc("exam_attempt_set_pause($1::uuid, $2, $3, $4::timestamptz)", [B, "student", false, null]);
  });

  await check("reasons are independent: a reconnection never cancels an organizer pause", async () => {
    // Organizer pauses the student, THEN the device goes silent: both reasons
    // open, one shared window (0098's union rule, anchored at the FIRST).
    const extBefore = Number((await one("select extension_minutes from public.exam_attempts where id=$1", [B])).extension_minutes);
    await rpc("exam_attempt_set_pause($1::uuid, $2, $3, $4::timestamptz)", [B, "student", true, null]);
    const anchor = await one("select now() - interval '3 minutes' as t");
    await rpc("exam_attempt_set_pause($1::uuid, $2, $3, $4::timestamptz)", [B, "connection", true, anchor.t]);
    const both = await one("select pause_reasons, paused_at from public.exam_attempts where id=$1", [B]);
    assert.deepEqual(arr(both.pause_reasons).sort(), ["connection", "student"]);

    // The candidate returns: ONLY 'connection' clears; the attempt stays
    // paused and no credit is taken while the organizer reason is open.
    const r1 = await rpc("exam_attempt_set_pause($1::uuid, $2, $3, $4::timestamptz)", [B, "connection", false, null]);
    assert.equal(r1.paused, true, "still paused by the organizer");
    assert.deepEqual(arr(r1.reasons), ["student"]);
    assert.equal(Number(r1.credited_minutes), 0, "no credit until the LAST reason clears");
    const mid = await one("select paused_at, extension_minutes from public.exam_attempts where id=$1", [B]);
    assert.equal(Number(mid.extension_minutes), extBefore, "the extension is untouched while a reason stays open");

    // The organizer resumes: now the shared window credits exactly once.
    const r2 = await rpc("exam_attempt_set_pause($1::uuid, $2, $3, $4::timestamptz)", [B, "student", false, null]);
    assert.equal(r2.paused, false);
    assert.ok(Number(r2.credited_minutes) >= 0 && Number(r2.credited_minutes) <= 2,
      `the shared window is credited once, from its FIRST opening (got ${r2.credited_minutes})`);
    assert.equal(Number(r2.extension_minutes), extBefore + Number(r2.credited_minutes));
  });

  await check("the connection reason alone also survives an organizer resume attempt", async () => {
    // Reverse order: connection first, organizer pause layered on top. An
    // organizer resume of 'student' must leave the connection pause — and
    // therefore the freeze — intact.
    const anchor = await one("select now() - interval '2 minutes' as t");
    await rpc("exam_attempt_set_pause($1::uuid, $2, $3, $4::timestamptz)", [A, "connection", true, anchor.t]);
    await rpc("exam_attempt_set_pause($1::uuid, $2, $3, $4::timestamptz)", [A, "assessment", true, null]);
    const r = await rpc("exam_attempt_set_pause($1::uuid, $2, $3, $4::timestamptz)", [A, "assessment", false, null]);
    assert.equal(r.paused, true, "the attempt stays paused");
    assert.deepEqual(arr(r.reasons), ["connection"]);
    assert.equal(Number(r.credited_minutes), 0);
    // Cleanup: candidate returns.
    const r2 = await rpc("exam_attempt_set_pause($1::uuid, $2, $3, $4::timestamptz)", [A, "connection", false, null]);
    assert.equal(r2.paused, false);
  });

  await check("duplicate transitions are idempotent no-ops", async () => {
    const anchor = await one("select now() - interval '4 minutes' as t");
    const p1 = await rpc("exam_attempt_set_pause($1::uuid, $2, $3, $4::timestamptz)", [A, "connection", true, anchor.t]);
    assert.equal(p1.duplicate, undefined);
    const p2 = await rpc("exam_attempt_set_pause($1::uuid, $2, $3, $4::timestamptz)", [A, "connection", true, anchor.t]);
    assert.equal(p2.duplicate, true, "a repeated pause changes nothing");
    const row = await one("select paused_at from public.exam_attempts where id=$1", [A]);
    assert.ok(Math.abs(row.paused_at.getTime() - anchor.t.getTime()) < 1500, "the anchor is not moved by the duplicate");
    const r1 = await rpc("exam_attempt_set_pause($1::uuid, $2, $3, $4::timestamptz)", [A, "connection", false, null]);
    assert.equal(r1.duplicate, undefined);
    const r2 = await rpc("exam_attempt_set_pause($1::uuid, $2, $3, $4::timestamptz)", [A, "connection", false, null]);
    assert.equal(r2.duplicate, true, "a repeated resume changes nothing");
    assert.equal(Number(r2.credited_minutes), 0, "and credits nothing twice");
  });

  await check("EXECUTE is service-role-only: public, anon and authenticated are all revoked", async () => {
    const fn = await one(`
      select p.proacl::text as acl
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname='public' and p.proname='exam_attempt_set_pause'`);
    assert.ok(fn, "the function exists");
    assert.ok(fn.acl.includes("service_role=X"), "service_role keeps EXECUTE");
    assert.ok(!fn.acl.includes("anon=X"), "anon has no EXECUTE");
    assert.ok(!fn.acl.includes("authenticated=X"), "authenticated has no EXECUTE");
    assert.ok(!fn.acl.includes("public=X"), "public has no EXECUTE");
    const count = await one(`
      select count(*)::int as n from pg_proc p join pg_namespace nn on nn.oid=p.pronamespace
       where nn.nspname='public' and p.proname='exam_attempt_set_pause'`);
    assert.equal(count.n, 1, "the old three-argument definition is gone — one function, one rule");
  });

  await check("exam_set_pause (0098) is untouched by 0099", async () => {
    const p = await rpc("exam_set_pause($1::uuid, $2)", [EXAM, true]);
    assert.equal(p.paused, true);
    assert.ok(Number(p.attempts_updated) >= 1);
    const r = await rpc("exam_set_pause($1::uuid, $2)", [EXAM, false]);
    assert.equal(r.paused, false);
    // Cleanup any 'assessment' reasons left on A/B so later runs stay clean.
    await rpc("exam_attempt_set_pause($1::uuid, $2, $3, $4::timestamptz)", [A, "assessment", false, null]);
    await rpc("exam_attempt_set_pause($1::uuid, $2, $3, $4::timestamptz)", [B, "assessment", false, null]);
  });

  await check("the migration is idempotent (safe re-run)", async () => {
    await db.exec(migration);
    const fn = await one(`
      select count(*)::int as n from pg_proc p join pg_namespace nn on nn.oid=p.pronamespace
       where nn.nspname='public' and p.proname='exam_attempt_set_pause'`);
    assert.equal(fn.n, 1);
    const p = await rpc("exam_attempt_set_pause($1::uuid, $2, $3, $4::timestamptz)", [A, "connection", true, null]);
    assert.equal(p.paused, true);
    await rpc("exam_attempt_set_pause($1::uuid, $2, $3, $4::timestamptz)", [A, "connection", false, null]);
  });

  console.log(`\n${checks} checks passed (migration 0099, CONNECTION_LOST pause, PGlite)`);
  process.exit(0);
} catch (err) {
  console.error(err);
  process.exit(1);
}
