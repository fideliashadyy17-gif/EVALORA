// Migration 0098 in an isolated PGlite database.
//
// Proves the database-level guarantees of organizer pause/resume (Features B
// and C, §6 multi-reason rule):
//   * purely additive — existing exams/attempts keep status, extensions and
//     every prior column byte-identically; new pause columns default safely;
//   * exam_attempt_set_pause is one atomic row transition: idempotent
//     double-clicks, unknown reasons rejected, non-in_progress attempts
//     untouchable, and the §6 rule — an attempt resumes ONLY when its LAST
//     reason clears;
//   * overlapping reasons (individually paused student inside a paused
//     assessment) share ONE window and are credited exactly once;
//   * exam_set_pause freezes only in_progress attempts of the exam, restores
//     'open' on resume, refuses to pause a non-open exam, and leaves
//     individually paused students paused after the assessment resumes;
//   * the audit ledger is staff-select-only and server-write-only;
//   * the migration is idempotent (safe re-run).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
let checks = 0;
const check = async (name, fn) => { await fn(); checks += 1; console.log(`✓ ${name}`); };
const one = async (sql, params) => (await db.query(sql, params)).rows[0];
const rpc = async (fn, params) => (await db.query(`select public.${fn} as r`, params)).rows[0].r;
// PGlite hands text[] back as its literal form; normalize for assertions.
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
const EXAM_CLOSED = "c4000000-0000-4000-8000-000000000003";
const A = "aaaaaaaa-1111-4111-8111-111111111111"; // live attempt, MYP4 exam
const B = "aaaaaaaa-2222-4222-8222-222222222222"; // second live attempt
const SUBMITTED = "aaaaaaaa-3333-4333-8333-333333333333";
const CLOSED_ATTEMPT = "aaaaaaaa-4444-4444-8444-444444444444"; // in_progress on the closed exam

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
    insert into public.profiles values ('bbbbbbbb-0000-4000-8000-000000000009', 'proctor@school.org');

    create table public.exams (
      id uuid primary key,
      organization_id uuid not null references public.organizations(id),
      title text not null,
      status text not null default 'open' constraint exams_status_check check (status in ('draft','scheduled','open','closed')),
      duration_minutes integer,
      ends_at timestamptz
    );
    insert into public.exams values
      ('${EXAM}', '${ORG}', 'MYP4 (Grade 9) Formative Assessment 2', 'open', 60, null),
      ('${EXAM_CLOSED}', '${ORG}', 'Finished examination', 'closed', 45, null);

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
           ('${SUBMITTED}', '${EXAM}', 'submitted', '2026-11-12 10:00:00+00', 0),
           ('${CLOSED_ATTEMPT}', '${EXAM_CLOSED}', 'in_progress', '2026-11-12 09:00:00+00', 0);
  `);

  const examsBefore = await db.query("select id, status, duration_minutes, ends_at from public.exams order by id");
  const attemptsBefore = await db.query("select id, status, started_at, submitted_at, extension_minutes from public.exam_attempts order by id");

  const migration = readFileSync("supabase/migrations/20261112131249_exam_manual_pause.sql", "utf8");
  await db.exec(migration);

  await check("migration applies cleanly and is purely additive", async () => {
    const examsAfter = await db.query("select id, status, duration_minutes, ends_at from public.exams order by id");
    assert.deepEqual(examsAfter.rows, examsBefore.rows, "no exam changed");
    const attemptsAfter = await db.query("select id, status, started_at, submitted_at, extension_minutes from public.exam_attempts order by id");
    assert.deepEqual(attemptsAfter.rows, attemptsBefore.rows, "no attempt changed");
    for (const col of ["pause_reasons", "paused_at", "pause_intervals", "pause_credited_ms"]) {
      const c = await one("select is_nullable from information_schema.columns where table_name='exam_attempts' and column_name=$1", [col]);
      assert.ok(c, `column ${col} exists`);
    }
    const live = await one("select pause_reasons, paused_at, pause_intervals, pause_credited_ms from public.exam_attempts where id=$1", [A]);
    assert.deepEqual(arr(live.pause_reasons), []);
    assert.equal(live.paused_at, null);
    assert.deepEqual(arr(live.pause_intervals), []);
    assert.equal(Number(live.pause_credited_ms), 0);
    // The status constraint was widened, not replaced.
    await db.query(`update public.exams set status='draft' where id='${EXAM_CLOSED}'`);
    await db.query(`update public.exams set status='closed' where id='${EXAM_CLOSED}'`);
  });

  await check("the 'paused' status is now accepted and the ledger is staff-only", async () => {
    await db.query(`update public.exams set status='paused', paused_at=now() where id='${EXAM}'`);
    await db.query(`update public.exams set status='open', paused_at=null where id='${EXAM}'`);
    const rls = await one("select relrowsecurity from pg_class where relname='exam_pause_events'");
    assert.equal(rls.relrowsecurity, true);
    const pols = await db.query("select polname, polcmd from pg_policy where polrelid='public.exam_pause_events'::regclass");
    assert.equal(pols.rows.length, 1, "exactly one policy");
    assert.equal(pols.rows[0].polcmd, "r", "select-only — no staff/client writes");
    await db.query(
      `insert into public.exam_pause_events (organization_id, exam_id, attempt_id, actor_id, scope, action, reason)
       values ('${ORG}', '${EXAM}', '${A}', 'bbbbbbbb-0000-4000-8000-000000000009', 'attempt', 'pause', 'student')`,
    );
    const evt = await one("select scope, action, reason, pause_reasons_before, credited_minutes from public.exam_pause_events");
    assert.deepEqual([evt.scope, evt.action, evt.reason], ["attempt", "pause", "student"]);
    assert.deepEqual(arr(evt.pause_reasons_before), []);
    assert.equal(evt.credited_minutes, 0);
    await db.query("delete from public.exam_pause_events");
    // Bad scope/action/reason are rejected by the ledger itself.
    await assert.rejects(
      db.query(`insert into public.exam_pause_events (organization_id, exam_id, scope, action, reason) values ('${ORG}', '${EXAM}', 'attempt', 'freeze', 'student')`),
    );
  });

  await check("exam_attempt_set_pause: unknown reasons and wrong attempts are refused", async () => {
    await assert.rejects(rpc("exam_attempt_set_pause($1::uuid, $2, $3)", [A, "connection", true]));
    assert.equal(await rpc("exam_attempt_set_pause($1::uuid, $2, $3)", ["aaaaaaaa-9999-4999-8999-999999999999", "student", true]), null);
    assert.equal(await rpc("exam_attempt_set_pause($1::uuid, $2, $3)", [SUBMITTED, "student", true]), null, "a submitted attempt can never be paused");
    assert.equal(await rpc("exam_attempt_set_pause($1::uuid, $2, $3)", [SUBMITTED, "assessment", false]), null);
    const untouched = await one("select status, extension_minutes, pause_reasons from public.exam_attempts where id=$1", [SUBMITTED]);
    assert.equal(untouched.status, "submitted");
    assert.deepEqual(arr(untouched.pause_reasons), []);
  });

  await check("individual pause: one atomic row transition, credit on resume", async () => {
    const p1 = await rpc("exam_attempt_set_pause($1::uuid, $2, $3)", [A, "student", true]);
    assert.equal(p1.paused, true);
    assert.deepEqual(arr(p1.reasons), ["student"]);
    assert.equal(p1.credited_minutes, 0, "no credit while the pause is open");
    let row = await one("select pause_reasons, paused_at, extension_minutes from public.exam_attempts where id=$1", [A]);
    assert.deepEqual(arr(row.pause_reasons), ["student"]);
    assert.ok(row.paused_at, "paused_at stamped");
    assert.equal(row.extension_minutes, 4, "extension untouched while paused");

    // Idempotent double-click.
    const p2 = await rpc("exam_attempt_set_pause($1::uuid, $2, $3)", [A, "student", true]);
    assert.equal(p2.duplicate, true);
    assert.deepEqual(arr(p2.reasons), ["student"]);

    // Simulate a 2.5-minute pause, then resume: credit rounds UP to 3 minutes.
    await db.query("update public.exam_attempts set paused_at = now() - interval '150 seconds' where id=$1", [A]);
    const r1 = await rpc("exam_attempt_set_pause($1::uuid, $2, $3)", [A, "student", false]);
    assert.equal(r1.paused, false);
    assert.deepEqual(arr(r1.reasons), []);
    assert.equal(r1.credited_minutes, 3);
    assert.equal(r1.extension_minutes, 7);
    row = await one("select pause_reasons, paused_at, pause_intervals, pause_credited_ms from public.exam_attempts where id=$1", [A]);
    assert.deepEqual(arr(row.pause_reasons), []);
    assert.equal(row.paused_at, null);
    assert.equal(arr(row.pause_intervals).length, 1, "window closed into the ledger");
    assert.ok(Number(row.pause_credited_ms) >= 149_000 && Number(row.pause_credited_ms) <= 151_000);

    // Resuming again (or a reason that was never open) is a safe no-op.
    const r2 = await rpc("exam_attempt_set_pause($1::uuid, $2, $3)", [A, "student", false]);
    assert.equal(r2.duplicate, true);
    assert.equal(r2.paused, false);
    assert.equal(r2.credited_minutes, 0);
    row = await one("select extension_minutes from public.exam_attempts where id=$1", [A]);
    assert.equal(row.extension_minutes, 7, "no double credit");
  });

  await check("§6: the attempt resumes ONLY when the LAST reason clears", async () => {
    await rpc("exam_attempt_set_pause($1::uuid, $2, $3)", [B, "assessment", true]);
    await rpc("exam_attempt_set_pause($1::uuid, $2, $3)", [B, "student", true]);
    let row = await one("select pause_reasons, paused_at from public.exam_attempts where id=$1", [B]);
    assert.deepEqual([...arr(row.pause_reasons)].sort(), ["assessment", "student"]);
    const firstPausedAt = row.paused_at;

    // Clearing ONE reason keeps the attempt paused: no credit, still frozen.
    const r1 = await rpc("exam_attempt_set_pause($1::uuid, $2, $3)", [B, "assessment", false]);
    assert.equal(r1.paused, true, "student reason still open");
    assert.deepEqual(arr(r1.reasons), ["student"]);
    assert.equal(r1.credited_minutes, 0);
    row = await one("select pause_reasons, paused_at, extension_minutes, pause_intervals from public.exam_attempts where id=$1", [B]);
    assert.deepEqual(arr(row.pause_reasons), ["student"]);
    assert.deepEqual(row.paused_at, firstPausedAt, "the window keeps its original start");
    assert.equal(row.extension_minutes, 0);
    assert.deepEqual(arr(row.pause_intervals), [], "nothing credited yet");

    // A reconnecting/clearing second time while still paused changes nothing.
    const dup = await rpc("exam_attempt_set_pause($1::uuid, $2, $3)", [B, "assessment", false]);
    assert.equal(dup.duplicate, true);
    assert.equal(dup.paused, true);

    // Last reason clears → the whole overlapping window is credited ONCE.
    await db.query("update public.exam_attempts set paused_at = now() - interval '300 seconds' where id=$1", [B]);
    const r2 = await rpc("exam_attempt_set_pause($1::uuid, $2, $3)", [B, "student", false]);
    assert.equal(r2.paused, false);
    assert.deepEqual(arr(r2.reasons), []);
    assert.ok(r2.credited_minutes >= 5 && r2.credited_minutes <= 6,
      `the union window credited once, not twice (got ${r2.credited_minutes})`);
    assert.equal(r2.extension_minutes, r2.credited_minutes);
    row = await one("select pause_reasons, paused_at, pause_intervals from public.exam_attempts where id=$1", [B]);
    assert.deepEqual(arr(row.pause_reasons), []);
    assert.equal(row.paused_at, null);
    assert.equal(arr(row.pause_intervals).length, 1, "overlapping reasons merged into ONE interval");
  });

  await check("repeated pause/resume cycles accumulate without double credit", async () => {
    // Deterministic windows on a clean ledger: drive paused_at from a fixed
    // epoch offset so the rounded credit never depends on when the test runs.
    await db.query(
      `update public.exam_attempts
          set pause_intervals = '[]'::jsonb, pause_credited_ms = 0, extension_minutes = 0
        where id = $1`,
      [A],
    );
    // Anchor on the DATABASE clock — the JS wall clock and PGlite's now()
    // drift apart across the migration exec.
    const T0 = new Date((await one("select now() as n")).n).getTime();
    const setWindow = (fromMsAgo) =>
      db.query(
        "update public.exam_attempts set paused_at = to_timestamp($2 / 1000.0) where id=$1",
        [A, T0 - fromMsAgo],
      );
    await rpc("exam_attempt_set_pause($1::uuid, $2, $3)", [A, "student", true]);
    await setWindow(130_000);
    const r1 = await rpc("exam_attempt_set_pause($1::uuid, $2, $3)", [A, "student", false]);
    assert.ok(r1.credited_minutes >= 2 && r1.credited_minutes <= 3, `cycle 1 credit ${r1.credited_minutes}`);
    const ext1 = r1.extension_minutes;

    // Cycle 2 window starts strictly AFTER cycle 1 closed (a 1.2 s gap is
    // enforced so the disjoint windows are real), so the union can never
    // re-credit the first window.
    await rpc("exam_attempt_set_pause($1::uuid, $2, $3)", [A, "student", true]);
    await db.query("select pg_sleep(1.5)");
    await db.query(
      "update public.exam_attempts set paused_at = to_timestamp($2 / 1000.0) where id=$1",
      [A, T0 + 1_200], // strictly after cycle 1's window closed at ~T0
    );
    await db.query("select pg_sleep(1.5)");
    const r2 = await rpc("exam_attempt_set_pause($1::uuid, $2, $3)", [A, "student", false]);
    assert.ok(r2.credited_minutes >= 1 && r2.credited_minutes <= 3, `cycle 2 credits only the new window (${r2.credited_minutes})`);
    assert.ok(r2.credited_minutes < r1.credited_minutes + 3, "no re-credit of the first window");
    assert.equal(r2.extension_minutes, ext1 + r2.credited_minutes);
    const row = await one("select pause_intervals, pause_credited_ms from public.exam_attempts where id=$1", [A]);
    assert.equal(arr(row.pause_intervals).length, 2, "both closed windows kept in the ledger");
  });

  await check("exam_set_pause: freeze the whole examination atomically", async () => {
    const result = await rpc("exam_set_pause($1::uuid, $2)", [EXAM, true]);
    assert.equal(result.paused, true);
    assert.equal(result.attempts_updated, 2, "both in_progress attempts frozen");
    const exam = await one("select status, paused_at from public.exams where id=$1", [EXAM]);
    assert.equal(exam.status, "paused");
    assert.ok(exam.paused_at);
    for (const id of [A, B]) {
      const row = await one("select status, pause_reasons from public.exam_attempts where id=$1", [id]);
      assert.equal(row.status, "in_progress", "attempts KEEP in_progress — one state machine");
      assert.ok(row.pause_reasons.includes("assessment"));
    }
    const sub = await one("select pause_reasons from public.exam_attempts where id=$1", [SUBMITTED]);
    assert.deepEqual(arr(sub.pause_reasons), [], "submitted attempts untouched");
    const other = await one("select status, pause_reasons from public.exam_attempts where id=$1", [CLOSED_ATTEMPT]);
    assert.deepEqual(arr(other.pause_reasons), [], "other exams' attempts untouched");

    // Duplicate pause is a no-op.
    const dup = await rpc("exam_set_pause($1::uuid, $2)", [EXAM, true]);
    assert.equal(dup.duplicate, true);
    assert.equal(dup.attempts_updated, 0);

    // Backdate the assessment window (90 s) so the resume credit is
    // deterministic; both frozen attempts share it.
    await db.query("update public.exams set paused_at = now() - interval '90 seconds' where id=$1", [EXAM]);
    await db.query("update public.exam_attempts set paused_at = now() - interval '90 seconds' where exam_id=$1 and status='in_progress'", [EXAM]);
  });

  await check("exam_set_pause refuses to pause a non-open exam", async () => {
    const r = await rpc("exam_set_pause($1::uuid, $2)", [EXAM_CLOSED, true]);
    assert.deepEqual(r, { error: "not_open" });
    assert.equal(await rpc("exam_set_pause($1::uuid, $2)", ["c4000000-0000-4000-8000-000000000999", true]), null);
    const exam = await one("select status from public.exams where id=$1", [EXAM_CLOSED]);
    assert.equal(exam.status, "closed");
  });

  await check("resume: exam reopens, individually paused students STAY paused", async () => {
    const aExtBefore = Number((await one("select extension_minutes from public.exam_attempts where id=$1", [A])).extension_minutes);
    // While the assessment is paused, the organizer also pauses student B
    // (duplicate 'assessment' stays; 'student' joins; window keeps its start).
    await rpc("exam_attempt_set_pause($1::uuid, $2, $3)", [B, "student", true]);
    const bPausedAt = (await one("select paused_at from public.exam_attempts where id=$1", [B])).paused_at;
    const bExtBefore = Number((await one("select extension_minutes from public.exam_attempts where id=$1", [B])).extension_minutes);

    const result = await rpc("exam_set_pause($1::uuid, $2)", [EXAM, false]);
    assert.equal(result.paused, false);
    assert.equal(result.attempts_updated, 2, "assessment reason removed from both");
    const exam = await one("select status, paused_at from public.exams where id=$1", [EXAM]);
    assert.equal(exam.status, "open");
    assert.equal(exam.paused_at, null);

    const a = await one("select pause_reasons, extension_minutes, paused_at from public.exam_attempts where id=$1", [A]);
    assert.deepEqual(arr(a.pause_reasons), [], "A fully resumed and credited");
    // A's earlier windows share the ledger; the union adds the new ~90 s span
    // (rounded up), minus anything already credited: 1–2 minutes.
    assert.ok(a.extension_minutes >= aExtBefore + 1 && a.extension_minutes <= aExtBefore + 2,
      `the assessment window folded into A's extension (${aExtBefore} → ${a.extension_minutes})`);
    assert.equal(a.paused_at, null);

    const b = await one("select pause_reasons, paused_at, extension_minutes from public.exam_attempts where id=$1", [B]);
    assert.deepEqual(arr(b.pause_reasons), ["student"], "B stays frozen on the individual reason");
    assert.deepEqual(b.paused_at, bPausedAt, "B's window never restarted");
    assert.equal(b.extension_minutes, bExtBefore, "no credit until B's last reason clears");

    // Resuming the exam again is a safe no-op; clearing B's reason credits B once.
    const dup = await rpc("exam_set_pause($1::uuid, $2)", [EXAM, false]);
    assert.equal(dup.duplicate, true);
    const rb = await rpc("exam_attempt_set_pause($1::uuid, $2, $3)", [B, "student", false]);
    assert.equal(rb.paused, false);
    assert.equal(rb.extension_minutes, bExtBefore + rb.credited_minutes);
    assert.ok(rb.credited_minutes >= 1 && rb.credited_minutes <= 2,
      `B's overlapping window credited once, in full (${rb.credited_minutes})`);
  });

  await check("the pause RPCs are executable by service_role ONLY (§10)", async () => {
    const rows = await db.query(
      "select proname, proacl::text as acl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname in ('exam_set_pause','exam_attempt_set_pause','exam_pause_union_intervals')",
    );
    assert.equal(rows.rows.length, 3);
    for (const r of rows.rows) {
      assert.ok(!/(^|[,{])(anon|authenticated|public)=/.test(r.acl), `${r.proname} must not be callable by anon/authenticated: ${r.acl}`);
      assert.match(r.acl, /service_role=/, `${r.proname} keeps service_role execute`);
    }
  });

  await check("the migration is idempotent (safe re-run)", async () => {
    await db.exec(migration);
    const row = await one("select status, extension_minutes, pause_reasons from public.exam_attempts where id=$1", [A]);
    assert.equal(row.status, "in_progress");
    assert.deepEqual(arr(row.pause_reasons), []);
    const fns = await db.query("select count(*)::int as n from pg_proc where proname in ('exam_set_pause','exam_attempt_set_pause','exam_pause_union_intervals')");
    assert.equal(fns.rows[0].n, 3);
  });

  await check("extension credit respects the 1440-minute ceiling", async () => {
    await rpc("exam_attempt_set_pause($1::uuid, $2, $3)", [B, "student", true]);
    await db.query("update public.exam_attempts set extension_minutes = 1439, paused_at = now() - interval '3 hours' where id=$1", [B]);
    const r = await rpc("exam_attempt_set_pause($1::uuid, $2, $3)", [B, "student", false]);
    assert.equal(r.credited_minutes, 1, "capped so the total never exceeds 1440");
    assert.equal(r.extension_minutes, 1440);
  });

  console.log(`\n${checks} checks passed`);
  await db.close();
} catch (err) {
  console.error(err);
  process.exit(1);
}
