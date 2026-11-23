// End-to-end integration & PGlite database regression suite for sequential
// multi-student examinations on a SINGLE shared browser/device.
//
// Exercises the REAL production route handlers (`link-access`, `access`,
// `state`, `save`, `submit`) against a real PGlite PostgreSQL schema (including
// `uq_exam_candidate_shared_identity`, `uq_exam_attempts_one_active`,
// `uq_exam_attempts_number`, and shared-link check constraints) together with
// ONE persistent browser `localStorage` + `sessionStorage` + `guest_key`.
//
// Covers Scenarios A, B, C, D, and E from the shared-browser specification.

import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Module } from "node:module";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import ts from "typescript";

const sha256 = (v) => createHash("sha256").update(v, "utf8").digest("hex");

function makeWebStorage() {
  const map = new Map();
  return {
    map,
    getItem(k) { return map.has(k) ? map.get(k) : null; },
    setItem(k, v) { map.set(String(k), String(v)); },
    removeItem(k) { map.delete(String(k)); },
  };
}

/* ── Minimal Supabase-JS adapter backed by real PGlite SQL ──────────────── */
function createPgliteSupabase(db) {
  async function exec(table, st) {
    const whereParts = [];
    const params = [];
    for (const f of st.filters) {
      if (f.kind === "eq") {
        params.push(f.val);
        whereParts.push(`"${f.col}"::text = $${params.length}::text`);
      } else if (f.kind === "in") {
        if (!f.vals.length) {
          whereParts.push("false");
        } else {
          const placeholders = f.vals.map((v) => {
            params.push(v);
            return `$${params.length}::text`;
          });
          whereParts.push(`"${f.col}"::text in (${placeholders.join(", ")})`);
        }
      } else if (f.kind === "is") {
        if (f.val === null) whereParts.push(`"${f.col}" is null`);
        else {
          params.push(f.val);
          whereParts.push(`"${f.col}" is not distinct from $${params.length}`);
        }
      } else if (f.kind === "not_null") {
        whereParts.push(`"${f.col}" is not null`);
      }
    }
    const whereSql = whereParts.length ? ` where ${whereParts.join(" and ")}` : "";

    try {
      if (st.op === "insert") {
        const rowsToInsert = Array.isArray(st.payload) ? st.payload : [st.payload];
        const inserted = [];
        for (const row of rowsToInsert) {
          const entries = Object.entries(row).filter(([, v]) => v !== undefined);
          const cols = entries.map(([c]) => `"${c}"`).join(", ");
          const vals = entries.map(([, v]) => {
            if (v !== null && typeof v === "object") {
              params.push(JSON.stringify(v));
              return `$${params.length}::jsonb`;
            }
            params.push(v);
            return `$${params.length}`;
          });
          const sql = cols
            ? `insert into public."${table}" (${cols}) values (${vals.join(", ")}) returning *`
            : `insert into public."${table}" default values returning *`;
          const res = await db.query(sql, params.splice(0, params.length));
          inserted.push(...res.rows);
        }
        if (st.single === "one" || st.single === "maybe") {
          return { data: inserted[0] ?? null, error: inserted[0] ? null : { message: "no row" } };
        }
        return { data: inserted, error: null };
      }

      if (st.op === "upsert") {
        const row = st.payload;
        const entries = Object.entries(row).filter(([, v]) => v !== undefined);
        const cols = entries.map(([c]) => `"${c}"`);
        const vals = entries.map(([, v]) => {
          if (v !== null && typeof v === "object") {
            params.push(JSON.stringify(v));
            return `$${params.length}::jsonb`;
          }
          params.push(v);
          return `$${params.length}`;
        });
        const conflictCols = (st.onConflict || "id")
          .split(",")
          .map((c) => `"${c.trim()}"`)
          .join(", ");
        const updates = entries
          .map(([c]) => `"${c}" = excluded."${c}"`)
          .join(", ");
        const sql = `insert into public."${table}" (${cols.join(", ")}) values (${vals.join(", ")}) on conflict (${conflictCols}) do update set ${updates} returning *`;
        const res = await db.query(sql, params);
        if (st.single === "one" || st.single === "maybe") {
          return { data: res.rows[0] ?? null, error: null };
        }
        return { data: res.rows, error: null };
      }

      if (st.op === "update") {
        const setEntries = Object.entries(st.payload).filter(([, v]) => v !== undefined);
        const setParams = [];
        const setClauses = setEntries.map(([c, v]) => {
          if (c === "pause_reasons" && Array.isArray(v)) {
            setParams.push(v);
            return `"${c}" = $${setParams.length}::text[]`;
          }
          if (v !== null && typeof v === "object") {
            setParams.push(JSON.stringify(v));
            return `"${c}" = $${setParams.length}::jsonb`;
          }
          setParams.push(v);
          return `"${c}" = $${setParams.length}`;
        });
        // Re-index WHERE placeholders after SET params
        const offset = setParams.length;
        const shiftedWhere = whereSql.replace(/\$(\d+)/g, (_, n) => `$${Number(n) + offset}`);
        const sql = `update public."${table}" set ${setClauses.join(", ")}${shiftedWhere} returning *`;
        const res = await db.query(sql, [...setParams, ...params]);
        if (st.single === "maybe") {
          if (res.rows.length > 1) return { data: null, error: { code: "PGRST116", message: "Multiple rows" } };
          return { data: res.rows[0] ?? null, error: null };
        }
        if (st.single === "one") {
          if (res.rows.length !== 1) return { data: null, error: { message: "Expected 1 row" } };
          return { data: res.rows[0], error: null };
        }
        return { data: res.rows, error: null };
      }

      const orderSql = st.orders.length
        ? ` order by ${st.orders.map((o) => `"${o.col}" ${o.asc ? "asc" : "desc"}`).join(", ")}`
        : "";
      const limitSql = st.limitCount ? ` limit ${st.limitCount}` : "";
      const sql = `select * from public."${table}"${whereSql}${orderSql}${limitSql}`;
      const res = await db.query(sql, params);
      if (st.single === "maybe") {
        if (res.rows.length > 1) return { data: null, error: { code: "PGRST116", message: "Multiple rows returned" } };
        return { data: res.rows[0] ?? null, error: null };
      }
      if (st.single === "one") {
        if (res.rows.length !== 1) return { data: null, error: { message: "Expected single row" } };
        return { data: res.rows[0], error: null };
      }
      return { data: res.rows, error: null };
    } catch (err) {
      if (process.env.DEBUG_SQL) console.error("SQL ERR:", table, st.op, err);
      return { data: null, error: { message: err instanceof Error ? err.message : String(err) } };
    }
  }

  return {
    rpc: async () => ({ data: true, error: null }),
    from(table) {
      const st = { op: "select", filters: [], orders: [], limitCount: null, single: null, payload: null, onConflict: null };
      const chain = {
        select() { return chain; },
        insert(payload) { st.op = "insert"; st.payload = payload; return chain; },
        update(payload) { st.op = "update"; st.payload = payload; return chain; },
        upsert(payload, opts) { st.op = "upsert"; st.payload = payload; st.onConflict = opts?.onConflict ?? "id"; return chain; },
        eq(col, val) { st.filters.push({ kind: "eq", col, val }); return chain; },
        in(col, vals) { st.filters.push({ kind: "in", col, vals }); return chain; },
        is(col, val) { st.filters.push({ kind: "is", col, val }); return chain; },
        not(col, op, val) { if (op === "is" && val === null) st.filters.push({ kind: "not_null", col }); return chain; },
        order(col, opts) { st.orders.push({ col, asc: opts?.ascending !== false }); return chain; },
        limit(n) { st.limitCount = n; return chain; },
        maybeSingle() { st.single = "maybe"; return exec(table, st); },
        single() { st.single = "one"; return exec(table, st); },
        then(onFulfilled, onRejected) { return exec(table, st).then(onFulfilled, onRejected); },
      };
      return chain;
    },
  };
}

/* ── TypeScript source loader for real Next.js routes & libs ────────────── */
function createLoader(overrides) {
  const cache = new Map();
  function loadTs(sourcePath) {
    const fullPath = path.resolve(sourcePath);
    if (cache.has(fullPath)) return cache.get(fullPath).exports;
    const mod = new Module(fullPath);
    mod.filename = fullPath;
    mod.paths = Module._nodeModulePaths(path.dirname(fullPath));
    cache.set(fullPath, mod);

    const prevLoad = Module._load;
    Module._load = function (request, parent) {
      if (overrides[request]) return overrides[request];
      if ((request.startsWith("./") || request.startsWith("../")) && parent?.filename) {
        const relCandidate = path.resolve(path.dirname(parent.filename), request);
        const srcRoot = path.resolve("src");
        if (relCandidate.startsWith(srcRoot + path.sep)) {
          const aliasKey = `@/${ path.relative(srcRoot, relCandidate).replace(/\\/g, "/") }`;
          if (overrides[aliasKey]) return overrides[aliasKey];
        }
      }
      if (request === "next/server") {
        return {
          NextResponse: {
            json: (body, init) =>
              new Response(JSON.stringify(body), {
                status: init?.status ?? 200,
                headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
              }),
          },
        };
      }
      if (request.startsWith("@/")) {
        return loadTs(path.resolve("src", `${request.slice(2)}.ts`));
      }
      if (request.startsWith("./") || request.startsWith("../")) {
        const candidateTs = path.resolve(path.dirname(parent.filename), `${request}.ts`);
        try {
          readFileSync(candidateTs, "utf8");
          return loadTs(candidateTs);
        } catch {
          // Fall through to native loader.
        }
      }
      return prevLoad.apply(this, arguments);
    };

    try {
      const code = ts.transpileModule(readFileSync(fullPath, "utf8"), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      }).outputText;
      mod._compile(code, fullPath);
      return mod.exports;
    } finally {
      Module._load = prevLoad;
    }
  }
  return loadTs;
}

const db = new PGlite();
let checks = 0;
async function check(name, fn) {
  await fn();
  checks += 1;
  console.log(`  ✓ ${name}`);
}

const ORG_ID = "0a400000-0000-4000-8000-000000000001";
const CLASS_A = "0a400000-0000-4000-8000-000000000101";
const CLASS_B = "0a400000-0000-4000-8000-000000000102";
const EXAM_SHARED_ID = "11111111-1111-4111-8111-111111111111";
const INVITE_SHARED = "22222222-2222-4222-8222-222222222222";
const EXAM_HOMONYM_ID = "33333333-3333-4333-8333-333333333333";
const INVITE_HOMONYM = "44444444-4444-4444-8444-444444444444";
const EXAM_ROSTER_ID = "55555555-5555-4555-8555-555555555555";
const INVITE_ROSTER = "66666666-6666-4666-8666-666666666666";
const QUIZ_ID = "77777777-7777-4777-8777-777777777777";
const Q1_ID = "88888888-8888-4888-8888-888888888801";
const Q2_ID = "88888888-8888-4888-8888-888888888802";
const QQ1_ID = "99999999-9999-4999-8999-999999999901";
const QQ2_ID = "99999999-9999-4999-8999-999999999902";
const OPT_Q1_CORRECT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01";
const OPT_Q1_WRONG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02";
const OPT_Q2_CORRECT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01";
const OPT_Q2_WRONG = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02";

const MOCK_QUESTIONS = [
  {
    id: QQ1_ID,
    position: 1,
    points: 5,
    questions: {
      id: Q1_ID,
      type: "single_choice",
      prompt: "What is 6 × 7?",
      points: 5,
      config: {},
      explanation: "6 × 7 = 42.",
      explanation_doc: null,
      media_url: null,
      media_type: null,
      question_options: [
        { id: OPT_Q1_CORRECT, text: "42", is_correct: true, position: 1 },
        { id: OPT_Q1_WRONG, text: "36", is_correct: false, position: 2 },
      ],
    },
  },
  {
    id: QQ2_ID,
    position: 2,
    points: 5,
    questions: {
      id: Q2_ID,
      type: "single_choice",
      prompt: "What is 9 + 8?",
      points: 5,
      config: {},
      explanation: "9 + 8 = 17.",
      explanation_doc: null,
      media_url: null,
      media_type: null,
      question_options: [
        { id: OPT_Q2_CORRECT, text: "17", is_correct: true, position: 1 },
        { id: OPT_Q2_WRONG, text: "15", is_correct: false, position: 2 },
      ],
    },
  },
];

try {
  await db.exec(`
    create table public.organizations (id uuid primary key, name text not null);
    insert into public.organizations values ('${ORG_ID}', 'Cotonou International School');

    create table public.classes (
      id uuid primary key,
      organization_id uuid not null references public.organizations(id),
      name text not null,
      curriculum_track text
    );
    insert into public.classes values
      ('${CLASS_A}', '${ORG_ID}', 'MYP 3A', null),
      ('${CLASS_B}', '${ORG_ID}', 'MYP 3B', null);

    create table public.students (
      id uuid primary key default gen_random_uuid(),
      organization_id uuid not null references public.organizations(id),
      user_id uuid not null,
      full_name text not null
    );
    create table public.student_enrollments (
      id uuid primary key default gen_random_uuid(),
      student_id uuid not null references public.students(id),
      class_id uuid not null references public.classes(id),
      status text not null default 'active'
    );

    create table public.quiz_questions (
      id uuid primary key,
      quiz_id uuid not null,
      question_id uuid not null,
      position integer not null default 1,
      points numeric not null default 5,
      questions jsonb not null default '{"type":"single_choice"}'::jsonb
    );
    insert into public.quiz_questions (id, quiz_id, question_id, position, points, questions)
    values
      ('${QQ1_ID}', '${QUIZ_ID}', '${Q1_ID}', 1, 5, '{"type":"single_choice"}'::jsonb),
      ('${QQ2_ID}', '${QUIZ_ID}', '${Q2_ID}', 2, 5, '{"type":"single_choice"}'::jsonb);
    create table public.competition_event_phases (id uuid primary key, event_id uuid, phase_key text);
    create table public.competition_phase_classes (id uuid primary key default gen_random_uuid(), phase_id uuid, class_id uuid, exam_id uuid);

    create table public.exams (
      id uuid primary key,
      organization_id uuid not null references public.organizations(id),
      quiz_id uuid,
      class_id uuid references public.classes(id),
      event_id uuid,
      title text not null,
      description text,
      instructions text,
      status text not null default 'open',
      duration_minutes integer not null default 60,
      access_code text not null,
      access_code_hash text not null,
      shared_link_enabled boolean not null default true,
      invite_token uuid not null unique,
      invite_expires_at timestamptz,
      invite_activates_at timestamptz,
      invite_no_expiry boolean not null default true,
      starts_at timestamptz,
      ends_at timestamptz,
      settings jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );

    create table public.exam_candidates (
      id uuid primary key default gen_random_uuid(),
      exam_id uuid not null references public.exams(id) on delete cascade,
      full_name text not null,
      first_name text,
      last_name text,
      candidate_ref text,
      email text,
      class_id uuid references public.classes(id),
      student_id uuid references public.students(id),
      access_code text not null,
      status text not null default 'registered',
      guest_key_hash text,
      invite_token uuid,
      source text not null default 'admin' check (source in ('admin','import','shared_link')),
      identity_data jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      unique (exam_id, access_code),
      constraint exam_candidates_shared_link_identity_check check (
        source <> 'shared_link' or (
          first_name is not null and length(btrim(first_name)) > 0 and
          last_name is not null and length(btrim(last_name)) > 0 and
          class_id is not null and
          guest_key_hash is not null
        )
      )
    );

    create unique index uq_exam_candidate_shared_identity
      on public.exam_candidates (
        exam_id,
        guest_key_hash,
        lower(btrim(coalesce(first_name, ''))),
        lower(btrim(coalesce(last_name, ''))),
        class_id
      )
      where guest_key_hash is not null;

    create table public.exam_attempts (
      id uuid primary key default gen_random_uuid(),
      exam_id uuid not null references public.exams(id) on delete cascade,
      candidate_id uuid not null references public.exam_candidates(id) on delete restrict,
      access_token uuid not null default gen_random_uuid(),
      attempt_number integer not null default 1,
      previous_attempt_id uuid,
      retake_request_id uuid,
      status text not null default 'in_progress' check (status in ('in_progress','submitted','auto_submitted','marked')),
      submission_reason text,
      grading_status text not null default 'not_started',
      grading_error text,
      auto_score numeric,
      auto_max_score numeric,
      pending_manual_count integer not null default 0,
      started_at timestamptz not null default now(),
      submitted_at timestamptz,
      published_at timestamptz,
      extension_minutes integer not null default 0,
      paused_at timestamptz,
      pause_reasons text[] not null default '{}',
      question_order jsonb not null default '[]'::jsonb,
      flagged jsonb not null default '[]'::jsonb,
      score numeric,
      max_score numeric,
      track text,
      first_name text,
      last_name text,
      class_id uuid references public.classes(id),
      student_id uuid references public.students(id),
      guest_key_hash text,
      invite_token uuid,
      identity_data jsonb not null default '{}'::jsonb,
      constraint exam_attempts_shared_link_identity_check check (
        guest_key_hash is null or (
          first_name is not null and length(btrim(first_name)) > 0 and
          last_name is not null and length(btrim(last_name)) > 0 and
          class_id is not null
        )
      )
    );

    create unique index uq_exam_attempts_one_active
      on public.exam_attempts (exam_id, candidate_id)
      where (status = 'in_progress');
    create unique index uq_exam_attempts_number
      on public.exam_attempts (candidate_id, attempt_number);

    create table public.exam_answers (
      id uuid primary key default gen_random_uuid(),
      attempt_id uuid not null references public.exam_attempts(id) on delete cascade,
      question_id uuid not null,
      quiz_question_id uuid,
      answer jsonb not null default '{}'::jsonb,
      is_correct boolean,
      points_awarded numeric,
      marked_by uuid,
      grading_status text not null default 'not_graded',
      grading_note text,
      part_scores jsonb not null default '{}'::jsonb,
      updated_at timestamptz not null default now(),
      unique (attempt_id, question_id)
    );

    create table public.exam_presence (
      attempt_id uuid primary key references public.exam_attempts(id) on delete cascade,
      exam_id uuid not null,
      last_seen_at timestamptz not null default now(),
      online boolean not null default true,
      pending_saves integer not null default 0
    );

    create table public.exam_hint_usage (
      id uuid primary key default gen_random_uuid(),
      attempt_id uuid not null,
      question_id uuid not null,
      part_id text not null default '',
      level integer not null default 1,
      times_opened integer not null default 1
    );

    create table public.exam_result_events (
      id uuid primary key default gen_random_uuid(),
      attempt_id uuid not null,
      exam_id uuid not null,
      event_type text not null,
      payload jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );
  `);

  await db.query(
    `insert into public.exams (id, organization_id, quiz_id, class_id, title, status, duration_minutes, access_code, access_code_hash, invite_token, invite_no_expiry, settings)
     values
      ($1, $2, $3, $4, 'Mathematics Summative', 'open', 60, 'MATH-2026', $5, $6, true, $7::jsonb),
      ($8, $2, $3, $4, 'Homonym Identity Exam', 'open', 60, 'IDEX-2026', $9, $10, true, $11::jsonb),
      ($12, $2, $3, $4, 'Roster Personal Code Exam', 'open', 60, 'ROST-2026', $13, $14, true, $15::jsonb)`,
    [
      EXAM_SHARED_ID, ORG_ID, QUIZ_ID, CLASS_A, sha256("MATH-2026"), INVITE_SHARED,
      JSON.stringify({ access_mode: "shared_link", linked_class_ids: [CLASS_A, CLASS_B], eligible_class_ids: [CLASS_A, CLASS_B], attempt_policy: "single_resume", results_published: true }),
      EXAM_HOMONYM_ID, sha256("IDEX-2026"), INVITE_HOMONYM,
      JSON.stringify({
        access_mode: "shared_link",
        eligible_class_ids: [CLASS_A],
        attempt_policy: "single_resume",
        identity_fields: [{ key: "student_number", label: "Student Number", type: "text", required: true }],
      }),
      EXAM_ROSTER_ID, sha256("ROST-2026"), INVITE_ROSTER,
      JSON.stringify({ access_mode: "shared_link", eligible_class_ids: [CLASS_A], attempt_policy: "single_resume", results_published: true }),
    ],
  );

  // Pre-register 3 roster candidates with personal candidate codes on EXAM_ROSTER_ID
  await db.query(
    `insert into public.exam_candidates (exam_id, full_name, first_name, last_name, class_id, access_code, source)
     values
      ($1, 'Nadia Hounkpatin', 'Nadia', 'Hounkpatin', $2, 'CAND-NADIA1', 'admin'),
      ($1, 'Serge Akpovi', 'Serge', 'Akpovi', $2, 'CAND-SERGE2', 'admin'),
      ($1, 'Ines Zinsou', 'Ines', 'Zinsou', $2, 'CAND-INES03', 'admin')`,
    [EXAM_ROSTER_ID, CLASS_A],
  );

  const admin = createPgliteSupabase(db);
  let currentAuthUser = null;
  const usableGrants = new Map();

  const loadTs = createLoader({
    "@/lib/supabase/server": {
      createAdminClient: () => admin,
      createClient: async () => ({
        auth: { getUser: async () => ({ data: { user: currentAuthUser } }) },
      }),
    },
    "@/lib/live": {
      loadQuizQuestions: async () => structuredClone(MOCK_QUESTIONS),
      seededShuffle: (rows) => rows,
      publicQuestion: (row) => ({
        question_id: row.questions.id,
        quiz_question_id: row.id,
        type: row.questions.type,
        prompt: row.questions.prompt,
        points: row.points,
        options: row.questions.question_options.map((o) => ({ id: o.id, text: o.text })),
      }),
      answerReveal: (row) => ({
        correct_option_ids: row.questions.question_options.filter((o) => o.is_correct).map((o) => o.id),
        summary: [],
      }),
      releasedFeedback: () => null,
    },
    "@/lib/examHintsServer": {
      loadPublishedHints: async () => new Map(),
    },
    "@/lib/examRetakeServer": {
      findUsableGrant: async (_admin, examId, candidateId) => usableGrants.get(`${examId}:${candidateId}`) ?? null,
      startRetakeAttempt: async (_admin, { exam, candidate }) => {
        const res = await db.query(
          `insert into public.exam_attempts (exam_id, candidate_id, attempt_number, first_name, last_name, class_id, guest_key_hash, invite_token)
           values ($1, $2, 2, $3, $4, $5, $6, $7) returning *`,
          [exam.id, candidate.id, candidate.first_name, candidate.last_name, candidate.class_id, candidate.guest_key_hash, candidate.invite_token],
        );
        return { ok: true, attempt: res.rows[0], attemptNumber: 2 };
      },
    },
  });

  const linkAccessRoute = loadTs("src/app/api/exam/link-access/route.ts");
  const accessRoute = loadTs("src/app/api/exam/access/route.ts");
  const stateRoute = loadTs("src/app/api/exam/state/route.ts");
  const saveRoute = loadTs("src/app/api/exam/save/route.ts");
  const submitRoute = loadTs("src/app/api/exam/submit/route.ts");
  const sessionLib = loadTs("src/lib/examCandidateSession.ts");

  // ONE persistent shared browser across ALL sequential students!
  const browserLocal = makeWebStorage();
  const browserSession = makeWebStorage();
  // Seed unrelated app state on this browser to verify cleanup never wipes it.
  browserLocal.setItem("evalora-admin-collapsed", "1");
  browserLocal.setItem("evalora-audio-preferences", JSON.stringify({ muted: true }));

  const callJson = async (fn, req) => {
    const res = await fn(req);
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  const postJson = (fn, body) =>
    callJson(fn, new Request("https://evalora.test/api", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  const getState = (attemptId, token, extraHeaders = {}) =>
    callJson(
      stateRoute.GET,
      new Request(`https://evalora.test/api/exam/state?attempt_id=${encodeURIComponent(attemptId)}`, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extraHeaders },
      }),
    );

  console.log("Scenario A & B — Sequential students on ONE shared browser (link-access)");
  const sharedGuestKey = sessionLib.ensureBrowserGuestKey(browserLocal, INVITE_SHARED);
  assert.ok(sharedGuestKey.length >= 16);

  const sequentialStudents = [
    { first: "Ama", last: "Kouadio", q1: OPT_Q1_CORRECT, q2: OPT_Q2_CORRECT, expectedScore: 10 },
    { first: "Bruno", last: "Mensah", q1: OPT_Q1_CORRECT, q2: OPT_Q2_WRONG, expectedScore: 5 },
    { first: "Chloé", last: "Dossou", q1: OPT_Q1_WRONG, q2: OPT_Q2_WRONG, expectedScore: 0 },
  ];
  const recordedAttempts = [];

  for (let idx = 0; idx < sequentialStudents.length; idx += 1) {
    const stu = sequentialStudents[idx];
    await check(`Student ${idx + 1} (${stu.first} ${stu.last}) enters cleanly on the SAME browser, completes, submits, and closes session`, async () => {
      // Before Student enters, verify no active pointer from a previous submitted student exists.
      const priorPointer = sessionLib.readActiveCandidatePointer(browserLocal, { inviteToken: INVITE_SHARED });
      assert.equal(priorPointer, null, "previous submitted student's active session pointer must be cleared");
      assert.equal(
        sessionLib.ensureBrowserGuestKey(browserLocal, INVITE_SHARED),
        sharedGuestKey,
        "same physical browser keeps its stable device guest key",
      );

      const join = await postJson(linkAccessRoute.POST, {
        invite_token: INVITE_SHARED,
        access_code: "MATH-2026",
        first_name: stu.first,
        last_name: stu.last,
        class_id: CLASS_A,
        guest_key: sharedGuestKey,
        identity: {},
        consent: true,
      });
      assert.equal(join.status, 200, `expected 200 admission for ${stu.first}, got ${join.status}: ${JSON.stringify(join.body)}`);
      assert.equal(join.body.entry_href, `/exam/join/${INVITE_SHARED}`);

      // Verify unique attempt ID and unique bearer token across all prior students.
      for (const prev of recordedAttempts) {
        assert.notEqual(join.body.attempt_id, prev.attemptId, "must not reuse previous student's attempt_id");
        assert.notEqual(join.body.access_token, prev.token, "must not reuse previous student's access_token");
      }

      const saved = sessionLib.saveCandidateAttemptSession(browserLocal, browserSession, {
        attempt_id: join.body.attempt_id,
        token: join.body.access_token,
        exam_id: join.body.exam_id,
        entry_href: join.body.entry_href,
        invite_token: INVITE_SHARED,
        candidate_name: join.body.candidate_name,
        status: join.body.status,
      });
      assert.equal(saved, true);

      // Load paper state: verify candidate name matches THIS student and zero answers are inherited.
      const initial = await getState(join.body.attempt_id, join.body.access_token);
      assert.equal(initial.status, 200);
      assert.equal(initial.body.candidate.first_name, stu.first);
      assert.equal(initial.body.candidate.last_name, stu.last);
      assert.equal(initial.body.attempt.status, "in_progress");
      for (const q of initial.body.questions) {
        assert.equal(q.saved_answer, null, "fresh student attempt must never inherit previous student's answers");
      }

      // Save answers for Q1 & Q2
      const s1 = await postJson(saveRoute.POST, {
        attempt_id: join.body.attempt_id,
        token: join.body.access_token,
        question_id: Q1_ID,
        quiz_question_id: QQ1_ID,
        answer: { option_id: stu.q1 },
        flagged: [],
      });
      assert.equal(s1.status, 200, `s1 failed: ${JSON.stringify(s1.body)}`);
      const s2 = await postJson(saveRoute.POST, {
        attempt_id: join.body.attempt_id,
        token: join.body.access_token,
        question_id: Q2_ID,
        quiz_question_id: QQ2_ID,
        answer: { option_id: stu.q2 },
        flagged: [],
      });
      assert.equal(s2.status, 200, `s2 failed: ${JSON.stringify(s2.body)}`);

      // Submit paper
      const sub = await postJson(submitRoute.POST, {
        attempt_id: join.body.attempt_id,
        token: join.body.access_token,
        idempotency_key: `submit-${join.body.attempt_id}`,
      });
      assert.equal(sub.status, 200, `sub failed: ${JSON.stringify(sub.body)}`);
      assert.equal(sub.body.status, "submitted");

      // Reload state to confirm score & trigger browser session finalization
      const after = await getState(join.body.attempt_id, join.body.access_token);
      assert.equal(after.status, 200);
      assert.equal(after.body.attempt.status, "submitted");
      assert.equal(after.body.attempt.score, stu.expectedScore);

      const exitHref = sessionLib.finalizeSubmittedAttemptSession(browserLocal, browserSession, join.body.attempt_id, {
        entryHref: after.body.exam.entry_href,
      });
      assert.equal(exitHref, `/exam/join/${INVITE_SHARED}`);

      // Verify candidate token & active pointer were purged while unrelated app keys remain intact!
      assert.equal(sessionLib.readCandidateAttemptSession(browserLocal, join.body.attempt_id), null);
      assert.equal(sessionLib.readActiveCandidatePointer(browserLocal), null);
      assert.ok(sessionLib.readClosedAttemptMarker(browserSession, join.body.attempt_id));
      assert.equal(browserLocal.getItem("evalora-admin-collapsed"), "1");
      assert.equal(browserLocal.getItem("evalora-audio-preferences"), JSON.stringify({ muted: true }));

      recordedAttempts.push({
        first: stu.first,
        last: stu.last,
        attemptId: join.body.attempt_id,
        token: join.body.access_token,
        expectedScore: stu.expectedScore,
      });
    });
  }

  await check("all 3 sequential attempts and scores remain intact and distinct in PostgreSQL", async () => {
    const rows = (await db.query(
      `select id, first_name, last_name, status, score::float as score from public.exam_attempts where exam_id = $1 order by started_at asc`,
      [EXAM_SHARED_ID],
    )).rows;
    assert.equal(rows.length, 3);
    assert.deepEqual(
      rows.map((r) => ({ first: r.first_name, status: r.status, score: r.score })),
      [
        { first: "Ama", status: "submitted", score: 10 },
        { first: "Bruno", status: "submitted", score: 5 },
        { first: "Chloé", status: "submitted", score: 0 },
      ],
    );
  });

  await check("homonym students with distinct custom identityFields (student_number) succeed sequentially on the SAME browser without 409 browser conflict", async () => {
    const homonymGuestKey = sessionLib.ensureBrowserGuestKey(browserLocal, INVITE_HOMONYM);
    const j1 = await postJson(linkAccessRoute.POST, {
      invite_token: INVITE_HOMONYM,
      access_code: "IDEX-2026",
      first_name: "Jean",
      last_name: "Kouassi",
      class_id: CLASS_A,
      guest_key: homonymGuestKey,
      identity: { student_number: "MAT-1001" },
      consent: true,
    });
    assert.equal(j1.status, 200);
    await postJson(submitRoute.POST, { attempt_id: j1.body.attempt_id, token: j1.body.access_token });
    sessionLib.finalizeSubmittedAttemptSession(browserLocal, browserSession, j1.body.attempt_id);

    // Second student ALSO named Jean Kouassi in CLASS_A, with their own student_number MAT-1002, on the SAME browser!
    const j2 = await postJson(linkAccessRoute.POST, {
      invite_token: INVITE_HOMONYM,
      access_code: "IDEX-2026",
      first_name: "Jean",
      last_name: "Kouassi",
      class_id: CLASS_A,
      guest_key: homonymGuestKey,
      identity: { student_number: "MAT-1002" },
      consent: true,
    });
    assert.equal(j2.status, 200, `expected 200 for second Jean Kouassi with MAT-1002, got ${j2.status}: ${JSON.stringify(j2.body)}`);
    assert.notEqual(j2.body.attempt_id, j1.body.attempt_id);

    // Meanwhile, MAT-1001 trying again after submitting is STILL blocked from a duplicate attempt!
    const replay = await postJson(linkAccessRoute.POST, {
      invite_token: INVITE_HOMONYM,
      access_code: "IDEX-2026",
      first_name: "Jean",
      last_name: "Kouassi",
      class_id: CLASS_A,
      guest_key: homonymGuestKey,
      identity: { student_number: "MAT-1001" },
      consent: true,
    });
    assert.equal(replay.status, 409);
    sessionLib.finalizeSubmittedAttemptSession(browserLocal, browserSession, j2.body.attempt_id);
  });

  await check("sequential students with personal roster candidate codes succeed on BOTH /api/exam/access and /api/exam/link-access on the SAME browser", async () => {
    const rosterKey = sessionLib.ensureBrowserGuestKey(browserLocal, INVITE_ROSTER);
    // Student 1 via /api/exam/link-access using personal candidate code CAND-NADIA1
    const r1 = await postJson(linkAccessRoute.POST, {
      invite_token: INVITE_ROSTER,
      access_code: "CAND-NADIA1",
      first_name: "Nadia",
      last_name: "Hounkpatin",
      class_id: CLASS_A,
      guest_key: rosterKey,
      consent: true,
    });
    assert.equal(r1.status, 200);
    await postJson(submitRoute.POST, { attempt_id: r1.body.attempt_id, token: r1.body.access_token });
    sessionLib.finalizeSubmittedAttemptSession(browserLocal, browserSession, r1.body.attempt_id);

    // Student 2 tries to use Nadia's personal code with Serge's name -> rejected 403!
    const wrongPerson = await postJson(linkAccessRoute.POST, {
      invite_token: INVITE_ROSTER,
      access_code: "CAND-NADIA1",
      first_name: "Serge",
      last_name: "Akpovi",
      class_id: CLASS_A,
      guest_key: rosterKey,
      consent: true,
    });
    assert.equal(wrongPerson.status, 403);

    // Student 2 enters with their own personal candidate code CAND-SERGE2 via /api/exam/link-access -> 200!
    const r2 = await postJson(linkAccessRoute.POST, {
      invite_token: INVITE_ROSTER,
      access_code: "CAND-SERGE2",
      first_name: "Serge",
      last_name: "Akpovi",
      class_id: CLASS_A,
      guest_key: rosterKey,
      consent: true,
    });
    assert.equal(r2.status, 200);
    assert.notEqual(r2.body.attempt_id, r1.body.attempt_id);
    await postJson(submitRoute.POST, { attempt_id: r2.body.attempt_id, token: r2.body.access_token });
    sessionLib.finalizeSubmittedAttemptSession(browserLocal, browserSession, r2.body.attempt_id);

    // Student 3 enters via /api/exam/access (exam_code + personal candidate_code) on the SAME browser -> 200!
    const r3 = await postJson(accessRoute.POST, {
      exam_code: "ROST-2026",
      candidate_code: "CAND-INES03",
    });
    assert.equal(r3.status, 200);
    assert.equal(r3.body.entry_href, "/exam-access");
    await postJson(submitRoute.POST, { attempt_id: r3.body.attempt_id, token: r3.body.access_token });
    sessionLib.finalizeSubmittedAttemptSession(browserLocal, browserSession, r3.body.attempt_id);
  });

  await check("lingering authenticated student cookie from Student A never blocks Student B in another class or leaks student_id on shared_link", async () => {
    const authUserId = randomUUID();
    const stuRow = (await db.query(
      `insert into public.students (organization_id, user_id, full_name) values ($1, $2, 'SignedIn Alice') returning id`,
      [ORG_ID, authUserId],
    )).rows[0];
    await db.query(
      `insert into public.student_enrollments (student_id, class_id, status) values ($1, $2, 'active')`,
      [stuRow.id, CLASS_A],
    );
    currentAuthUser = { id: authUserId };
    try {
      // Student B ("Kossi Agbodjan") is in CLASS_B (different from SignedIn Alice's CLASS_A!)
      const res = await postJson(linkAccessRoute.POST, {
        invite_token: INVITE_SHARED,
        access_code: "MATH-2026",
        first_name: "Kossi",
        last_name: "Agbodjan",
        class_id: CLASS_B,
        guest_key: sharedGuestKey,
        consent: true,
      });
      assert.equal(res.status, 200, `expected 200 for Kossi in CLASS_B despite lingering auth cookie, got ${res.status}: ${JSON.stringify(res.body)}`);
      const attemptRow = (await db.query(`select student_id, class_id from public.exam_attempts where id = $1`, [res.body.attempt_id])).rows[0];
      assert.equal(attemptRow.student_id, null, "must NOT attach SignedIn Alice's student_id to Kossi's attempt");
      assert.equal(attemptRow.class_id, CLASS_B);
      await postJson(submitRoute.POST, { attempt_id: res.body.attempt_id, token: res.body.access_token });
      sessionLib.finalizeSubmittedAttemptSession(browserLocal, browserSession, res.body.attempt_id);
    } finally {
      currentAuthUser = null;
    }
  });

  await check("expired-link retake grant works on a shared browser even after 4+ students share the same guest_key_hash", async () => {
    // Temporarily expire INVITE_SHARED and grant Bruno Mensah an authorized retake.
    await db.query(`update public.exams set invite_no_expiry = false, invite_expires_at = now() - interval '1 hour' where id = $1`, [EXAM_SHARED_ID]);
    try {
      const brunoCand = (await db.query(
        `select id from public.exam_candidates where exam_id = $1 and first_name = 'Bruno' and last_name = 'Mensah'`,
        [EXAM_SHARED_ID],
      )).rows[0];
      usableGrants.set(`${EXAM_SHARED_ID}:${brunoCand.id}`, { id: randomUUID() });
      const retakeJoin = await postJson(linkAccessRoute.POST, {
        invite_token: INVITE_SHARED,
        access_code: "MATH-2026",
        first_name: "Bruno",
        last_name: "Mensah",
        class_id: CLASS_A,
        guest_key: sharedGuestKey,
        consent: true,
      });
      assert.equal(retakeJoin.status, 200, `expected 200 retake admission on shared browser, got ${retakeJoin.status}: ${JSON.stringify(retakeJoin.body)}`);
      assert.equal(retakeJoin.body.attempt_number, 2);
      await postJson(submitRoute.POST, { attempt_id: retakeJoin.body.attempt_id, token: retakeJoin.body.access_token });
      sessionLib.finalizeSubmittedAttemptSession(browserLocal, browserSession, retakeJoin.body.attempt_id);
      usableGrants.clear();
    } finally {
      await db.query(`update public.exams set invite_no_expiry = true, invite_expires_at = null where id = $1`, [EXAM_SHARED_ID]);
    }
  });

  console.log("Scenario C — Incomplete attempt refresh recovery & protection against silent takeover");
  await check("Student A refreshes mid-exam and recovers saved answers; Student B does NOT take over Student A's active attempt", async () => {
    const joinA = await postJson(linkAccessRoute.POST, {
      invite_token: INVITE_SHARED,
      access_code: "MATH-2026",
      first_name: "Fifamè",
      last_name: "Soglo",
      class_id: CLASS_A,
      guest_key: sharedGuestKey,
      consent: true,
    });
    assert.equal(joinA.status, 200);
    sessionLib.saveCandidateAttemptSession(browserLocal, browserSession, {
      attempt_id: joinA.body.attempt_id,
      token: joinA.body.access_token,
      exam_id: joinA.body.exam_id,
      entry_href: joinA.body.entry_href,
      invite_token: INVITE_SHARED,
      candidate_name: joinA.body.candidate_name,
      status: "in_progress",
    });

    // Student A saves Q1 answer, then refreshes browser BEFORE submitting
    await postJson(saveRoute.POST, {
      attempt_id: joinA.body.attempt_id,
      token: joinA.body.access_token,
      question_id: Q1_ID,
      quiz_question_id: QQ1_ID,
      answer: { option_id: OPT_Q1_CORRECT },
      flagged: [Q1_ID],
    });

    // Simulate page refresh: active session & token are intact
    const activePtr = sessionLib.readActiveCandidatePointer(browserLocal, { inviteToken: INVITE_SHARED });
    assert.ok(activePtr);
    assert.equal(activePtr.attempt_id, joinA.body.attempt_id);
    assert.equal(activePtr.candidate_name, "Fifamè Soglo");

    const recovered = await getState(joinA.body.attempt_id, sessionLib.readCandidateAttemptSession(browserLocal, joinA.body.attempt_id).token);
    assert.equal(recovered.status, 200);
    assert.deepEqual(recovered.body.questions[0].saved_answer, { option_id: OPT_Q1_CORRECT });

    // Also verify re-entering Fifamè's details on link-access resumes the SAME active attempt
    const resumedViaLink = await postJson(linkAccessRoute.POST, {
      invite_token: INVITE_SHARED,
      access_code: "MATH-2026",
      first_name: "Fifamè",
      last_name: "Soglo",
      class_id: CLASS_A,
      guest_key: sharedGuestKey,
      consent: true,
    });
    assert.equal(resumedViaLink.body.attempt_id, joinA.body.attempt_id);

    // Now Student B ("Ulrich Talon") enters on the SAME browser while Fifamè's attempt is still in_progress!
    const joinB = await postJson(linkAccessRoute.POST, {
      invite_token: INVITE_SHARED,
      access_code: "MATH-2026",
      first_name: "Ulrich",
      last_name: "Talon",
      class_id: CLASS_A,
      guest_key: sharedGuestKey,
      consent: true,
    });
    assert.equal(joinB.status, 200);
    assert.notEqual(joinB.body.attempt_id, joinA.body.attempt_id, "Student B must NEVER take over Student A's active attempt");
    const stateB = await getState(joinB.body.attempt_id, joinB.body.access_token);
    assert.equal(stateB.body.candidate.first_name, "Ulrich");
    assert.equal(stateB.body.questions[0].saved_answer, null, "Student B must have a blank paper");

    // Verify Fifamè's attempt and saved answer were NOT overwritten or corrupted!
    const fifameStillIntact = await getState(joinA.body.attempt_id, joinA.body.access_token);
    assert.equal(fifameStillIntact.status, 200);
    assert.equal(fifameStillIntact.body.attempt.status, "in_progress");
    assert.deepEqual(fifameStillIntact.body.questions[0].saved_answer, { option_id: OPT_Q1_CORRECT });
  });

  console.log("Scenario D — Temporary network interruption during active attempt");
  await check("network outage preserves queued answers without submitting or clearing candidate session, then flushes cleanly on reconnect", async () => {
    const queueMod = loadTs("src/lib/examSaveQueue.ts");
    const join = await postJson(linkAccessRoute.POST, {
      invite_token: INVITE_SHARED,
      access_code: "MATH-2026",
      first_name: "Sèna",
      last_name: "Gbedji",
      class_id: CLASS_A,
      guest_key: sharedGuestKey,
      consent: true,
    });
    assert.equal(join.status, 200);
    sessionLib.saveCandidateAttemptSession(browserLocal, browserSession, {
      attempt_id: join.body.attempt_id,
      token: join.body.access_token,
      exam_id: join.body.exam_id,
      entry_href: join.body.entry_href,
      invite_token: INVITE_SHARED,
      candidate_name: join.body.candidate_name,
      status: "in_progress",
    });

    let online = false;
    const durableStore = queueMod.createDurableExamQueueStorage(browserSession, browserLocal);
    const saveQueue = new queueMod.ExamSaveQueue(
      durableStore,
      sessionLib.pendingQueueKey(join.body.attempt_id),
      async (entry) => {
        if (!online) throw new Error("Network offline");
        const res = await postJson(saveRoute.POST, {
          attempt_id: join.body.attempt_id,
          token: join.body.access_token,
          question_id: entry.questionId,
          quiz_question_id: entry.quizQuestionId,
          answer: entry.answer,
          flagged: entry.flagged,
          idempotency_key: entry.idempotencyKey,
          client_queued_at: entry.queuedAt,
          recovery: true,
        });
        if (res.status !== 200) throw new Error("Save rejected");
      },
      () => {},
      () => {},
    );

    // Offline answer save: queued locally, attempt stays in_progress, session stays active
    saveQueue.enqueue(Q1_ID, QQ1_ID, { option_id: OPT_Q1_CORRECT }, []);
    const offlineFlush = await saveQueue.flush();
    assert.equal(offlineFlush, false);
    assert.equal(saveQueue.state().pending, 1);
    assert.ok(sessionLib.readCandidateAttemptSession(browserLocal, join.body.attempt_id), "token must NOT be cleared during network drop");

    const midState = await getState(join.body.attempt_id, join.body.access_token, { "X-Exam-Pending-Saves": "1" });
    assert.equal(midState.body.attempt.status, "in_progress", "network drop must NEVER auto-submit");

    // Reconnect and flush
    online = true;
    const onlineFlush = await saveQueue.flush();
    assert.equal(onlineFlush, true);
    assert.equal(saveQueue.state().pending, 0);

    // Now candidate explicitly submits
    const sub = await postJson(submitRoute.POST, { attempt_id: join.body.attempt_id, token: join.body.access_token });
    assert.equal(sub.status, 200);
    assert.equal(sub.body.status, "submitted");
    sessionLib.finalizeSubmittedAttemptSession(browserLocal, browserSession, join.body.attempt_id);
    assert.equal(sessionLib.readCandidateAttemptSession(browserLocal, join.body.attempt_id), null);
  });

  console.log("Scenario E — Security, Back-button protection, and cross-student request isolation");
  await check("completed attempt cannot be reopened as editable, replayed for a second attempt, or accessed/modified with another student's token", async () => {
    const [ama, bruno] = recordedAttempts;

    // 1. Stale/Back-button check: Ama's token is purged from localStorage and closed marker contains zero token/PII
    assert.equal(browserLocal.getItem(sessionLib.attemptStorageKey(ama.attemptId)), null);
    const closedRaw = browserSession.getItem(sessionLib.closedAttemptKey(ama.attemptId));
    assert.ok(closedRaw);
    assert.equal(closedRaw.includes(ama.token), false, "closed marker must never contain attempt token");
    assert.equal(closedRaw.includes("Ama"), false, "closed marker must never contain student PII");

    // 2. Duplicate attempt replay: Ama re-entering credentials on the same browser is refused with 409
    const duplicate = await postJson(linkAccessRoute.POST, {
      invite_token: INVITE_SHARED,
      access_code: "MATH-2026",
      first_name: "Ama",
      last_name: "Kouadio",
      class_id: CLASS_A,
      guest_key: sharedGuestKey,
      consent: true,
    });
    assert.equal(duplicate.status, 409);

    // 3. Even if an attacker replays Ama's captured token against POST /api/exam/save after submission, the server refuses with 409 and preserves Ama's graded answers
    const postSubmitSave = await postJson(saveRoute.POST, {
      attempt_id: ama.attemptId,
      token: ama.token,
      question_id: Q1_ID,
      quiz_question_id: QQ1_ID,
      answer: { option_ids: [OPT_Q1_WRONG] },
      flagged: [],
    });
    assert.equal(postSubmitSave.status, 409);
    const amaAfterAttack = await getState(ama.attemptId, ama.token);
    assert.equal(amaAfterAttack.body.attempt.score, 10, "submitted score must remain immutable");

    // 4. Cross-student token tampering: Bruno's token with Ama's attempt_id is rejected on state, save, and submit
    const crossState = await getState(ama.attemptId, bruno.token);
    assert.equal(crossState.status, 404);
    const crossSave = await postJson(saveRoute.POST, {
      attempt_id: ama.attemptId,
      token: bruno.token,
      question_id: Q1_ID,
      quiz_question_id: QQ1_ID,
      answer: { option_ids: [OPT_Q1_WRONG] },
    });
    assert.equal(crossSave.status, 404);
    const crossSubmit = await postJson(submitRoute.POST, {
      attempt_id: ama.attemptId,
      token: bruno.token,
    });
    assert.equal(crossSubmit.status, 404);
  });

  console.log(`\n${checks} shared-browser sequential examination checks passed (PGlite + real routes + browser session lifecycle).`);
} finally {
  await db.close();
}
