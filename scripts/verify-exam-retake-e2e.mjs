// Opt-in end-to-end verification against a REAL deployment and database.
//
//   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//   EVALORA_BASE_URL=https://your-deployment \
//   node scripts/verify-exam-retake-e2e.mjs
//
// It creates one clearly-named temporary examination in a temporary
// organization (reusing an existing quiz paper), drives the real HTTP routes,
// and removes every row it created in a `finally` block. It never touches an
// existing examination, attempt or student record.
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const base = (process.env.EVALORA_BASE_URL ?? "http://127.0.0.1:3101").replace(/\/$/, "");
if (!url || !serviceKey) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to run this verification.");
  process.exit(2);
}

const db = createClient(url, serviceKey, { auth: { persistSession: false } });
let checks = 0;
const pass = (name) => { checks += 1; console.log(`✓ ${name}`); };
const fail = (name, detail) => { console.error(`✗ ${name}: ${detail}`); process.exitCode = 1; };
const expect = (name, condition, detail = "") => condition ? pass(name) : fail(name, detail);

async function api(path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers ?? {}) },
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* HTML page */ }
  return { status: response.status, json, text };
}

const created = { orgId: null, classId: null, examId: null };
const tag = randomUUID().slice(0, 8);

async function cleanup() {
  if (!created.examId) return;
  const { data: attempts } = await db.from("exam_attempts").select("id").eq("exam_id", created.examId);
  const attemptIds = (attempts ?? []).map((a) => a.id);
  if (attemptIds.length) {
    await db.from("exam_answers").delete().in("attempt_id", attemptIds);
    await db.from("proctoring_incidents").delete().in("attempt_id", attemptIds);
  }
  await db.from("exam_retake_requests").delete().eq("exam_id", created.examId);
  await db.from("exam_attempts").delete().eq("exam_id", created.examId);
  await db.from("exam_candidates").delete().eq("exam_id", created.examId);
  await db.from("exams").delete().eq("id", created.examId);
  if (created.classId) await db.from("classes").delete().eq("id", created.classId);
  if (created.orgId) await db.from("organizations").delete().eq("id", created.orgId);
  console.log("· temporary test rows removed");
}

try {
  const { data: owner } = await db.from("profiles").select("id").eq("platform_role", "super_admin").limit(1).maybeSingle();
  const { data: paper } = await db.from("exams").select("quiz_id").not("quiz_id", "is", null).limit(1).maybeSingle();
  if (!owner || !paper?.quiz_id) throw new Error("Need a super admin profile and an existing quiz paper.");

  const { data: org, error: orgError } = await db
    .from("organizations")
    .insert({ name: `EVALORA E2E ${tag}`, slug: `evalora-e2e-${tag}`, type: "independent", owner_id: owner.id })
    .select("id")
    .single();
  if (orgError) throw orgError;
  created.orgId = org.id;

  const { data: klass, error: classError } = await db
    .from("classes")
    .insert({ organization_id: org.id, name: `E2E Class ${tag}` })
    .select("id")
    .single();
  if (classError) throw classError;
  created.classId = klass.id;

  const examCode = `E2E${tag.slice(0, 4).toUpperCase()}`;
  const { data: exam, error: examError } = await db
    .from("exams")
    .insert({
      organization_id: org.id,
      quiz_id: paper.quiz_id,
      title: `E2E Retake & Expiration ${tag}`,
      status: "open",
      access_code: examCode,
      class_id: klass.id,
      duration_minutes: 30,
      settings: {
        proctoring: false,
        require_screen_share: false,
        randomize_questions: false,
        randomize_options: false,
        pass_mark_percent: 50,
        results_published: false,
        access_mode: "shared_link",
        identity_fields: [],
        eligible_class_ids: [klass.id],
        attempt_policy: "single_resume",
      },
      invite_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      invite_expiry_policy: "24h",
    })
    .select("id,invite_token,access_code")
    .single();
  if (examError) throw examError;
  created.examId = exam.id;
  console.log(`· temporary examination ${exam.id} (${exam.access_code})`);

  // ── Join page + first attempt ──────────────────────────────────────────
  const joinPage = await api(`/exam/join/${exam.invite_token}`);
  expect("join page renders for an active link", joinPage.status === 200 && joinPage.text.includes(`E2E Retake`), `status ${joinPage.status}`);

  async function admit(guestKey, first, last) {
    return api("/api/exam/link-access", {
      method: "POST",
      body: JSON.stringify({
        invite_token: exam.invite_token,
        access_code: exam.access_code,
        first_name: first,
        last_name: last,
        class_id: klass.id,
        guest_key: guestKey,
        identity: {},
        consent: true,
      }),
    });
  }

  const studentA = randomUUID();
  const first = await admit(studentA, "Test", "Alpha");
  expect("a new candidate starts the first attempt", first.status === 200 && first.json?.attempt_id, `status ${first.status} ${first.text.slice(0, 120)}`);
  const attempt1 = first.json.attempt_id;
  const token1 = first.json.access_token;

  const submit1 = await api("/api/exam/submit", {
    method: "POST",
    body: JSON.stringify({ attempt_id: attempt1, token: token1 }),
  });
  expect("the first attempt is submitted", submit1.status === 200 && submit1.json?.ok, `status ${submit1.status}`);

  const reopen = await api("/api/exam/save", {
    method: "POST",
    body: JSON.stringify({ attempt_id: attempt1, token: token1, question_id: randomUUID(), answer: {} }),
  });
  expect("a submitted attempt cannot be modified", reopen.status === 409, `status ${reopen.status}`);

  const secondAdmit = await admit(studentA, "Test", "Alpha");
  expect("the same candidate cannot start another attempt without authorization", secondAdmit.status === 409, `status ${secondAdmit.status}`);

  // ── Retake request ────────────────────────────────────────────────────
  const stateBefore = await api(`/api/exam/retake?attempt_id=${attempt1}&token=${token1}`);
  expect("the student sees that a retake can be requested", stateBefore.json?.can_request === true, JSON.stringify(stateBefore.json).slice(0, 200));

  const requested = await api("/api/exam/retake", {
    method: "POST",
    body: JSON.stringify({ action: "request", attempt_id: attempt1, token: token1, reason: "E2E: lost connection" }),
  });
  expect("the retake request is accepted", requested.status === 200 && requested.json?.pending, `status ${requested.status} ${requested.text.slice(0, 160)}`);
  const requestId = requested.json.pending.id;

  const duplicate = await api("/api/exam/retake", {
    method: "POST",
    body: JSON.stringify({ action: "request", attempt_id: attempt1, token: token1 }),
  });
  expect("a duplicate pending request is idempotent", duplicate.json?.duplicate === true, JSON.stringify(duplicate.json).slice(0, 160));

  const startTooEarly = await api("/api/exam/retake", {
    method: "POST",
    body: JSON.stringify({ action: "start", attempt_id: attempt1, token: token1 }),
  });
  expect("a pending request alone never starts an attempt", startTooEarly.status === 403, `status ${startTooEarly.status}`);

  // ── Approval (same fields the Super Admin action writes) ──────────────
  const accessExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { error: approveError } = await db
    .from("exam_retake_requests")
    .update({
      status: "approved",
      decided_by: owner.id,
      decided_at: new Date().toISOString(),
      decision_note: "E2E approval",
      granted_attempts: 1,
      access_expires_at: accessExpires,
    })
    .eq("id", requestId)
    .eq("status", "pending");
  expect("the approval is recorded", !approveError, approveError?.message ?? "");

  const approvedState = await api(`/api/exam/retake?attempt_id=${attempt1}&token=${token1}`);
  expect("the student sees the approval", approvedState.json?.can_start === true, JSON.stringify(approvedState.json).slice(0, 200));

  // ── Expired link must not erase the approval ─────────────────────────
  await db.from("exams").update({ invite_expires_at: new Date(Date.now() - 60_000).toISOString() }).eq("id", exam.id);
  const joinExpired = await api(`/exam/join/${exam.invite_token}`);
  expect("an expired link is refused on the join page", joinExpired.status === 200 && /expired/i.test(joinExpired.text), `status ${joinExpired.status}`);
  const expiredAdmit = await admit(randomUUID(), "Blocked", "Student");
  expect("an expired link cannot start a new candidate", expiredAdmit.status === 403 && /expired/i.test(expiredAdmit.json?.error ?? ""), `status ${expiredAdmit.status}`);

  const start = await api("/api/exam/retake", {
    method: "POST",
    body: JSON.stringify({ action: "start", attempt_id: attempt1, token: token1 }),
  });
  expect("the approved retake still starts while the public link is expired", start.status === 200 && start.json?.attempt_id, `status ${start.status} ${start.text.slice(0, 160)}`);
  const attempt2 = start.json?.attempt_id;
  const token2 = start.json?.access_token;
  expect("the retake is a separate, numbered attempt", Boolean(attempt2) && attempt2 !== attempt1 && start.json?.attempt_number === 2, JSON.stringify(start.json).slice(0, 200));

  const { data: originalAfter } = await db
    .from("exam_attempts")
    .select("status,submitted_at,attempt_number")
    .eq("id", attempt1)
    .single();
  expect("the original attempt is preserved", originalAfter?.status === "submitted" && originalAfter?.attempt_number === 1, JSON.stringify(originalAfter));

  // ── submit retake, then lock again ───────────────────────────────────
  const submit2 = await api("/api/exam/submit", { method: "POST", body: JSON.stringify({ attempt_id: attempt2, token: token2 }) });
  expect("the authorized attempt can be submitted", submit2.status === 200, `status ${submit2.status}`);
  const thirdStart = await api("/api/exam/retake", { method: "POST", body: JSON.stringify({ action: "start", attempt_id: attempt2, token: token2 }) });
  expect("after using the approval the student is locked again", thirdStart.status === 403, `status ${thirdStart.status}`);

  const thirdRequest = await api("/api/exam/retake", { method: "POST", body: JSON.stringify({ action: "request", attempt_id: attempt2, token: token2 }) });
  expect("a new request (not an attempt) is possible after the approval is used", thirdRequest.status === 200 && thirdRequest.json?.pending, `status ${thirdRequest.status}`);

  // ── Active attempts survive link expiry ──────────────────────────────
  await db.from("exams").update({ invite_expires_at: new Date(Date.now() + 60_000).toISOString(), shared_link_enabled: true }).eq("id", exam.id);
  const studentC = randomUUID();
  const third = await admit(studentC, "Test", "Gamma");
  expect("another candidate can start while the link is active", third.status === 200, `status ${third.status}`);
  await db.from("exams").update({ invite_expires_at: new Date(Date.now() - 60_000).toISOString() }).eq("id", exam.id);

  const activeState = await api(`/api/exam/state?attempt_id=${third.json.attempt_id}`, { headers: { Authorization: `Bearer ${third.json.access_token}` } });
  expect("an active attempt survives link expiration", activeState.status === 200 && activeState.json?.attempt?.status === "in_progress", `status ${activeState.status}`);
  const activeSubmit = await api("/api/exam/submit", { method: "POST", body: JSON.stringify({ attempt_id: third.json.attempt_id, token: third.json.access_token }) });
  expect("an active attempt can still submit after link expiration", activeSubmit.status === 200, `status ${activeSubmit.status}`);

  // ── Disable / reactivate ─────────────────────────────────────────────
  await db.from("exams").update({ shared_link_enabled: true, invite_expires_at: new Date(Date.now() + 86_400_000).toISOString() }).eq("id", exam.id);
  await db.from("exams").update({ shared_link_enabled: false, invite_disabled_at: new Date().toISOString() }).eq("id", exam.id);
  const disabledAdmit = await admit(randomUUID(), "Blocked", "Student");
  expect("a disabled link cannot start an attempt", disabledAdmit.status === 403, `status ${disabledAdmit.status}`);
  await db.from("exams").update({ shared_link_enabled: true, invite_disabled_at: null, invite_expires_at: new Date(Date.now() + 86_400_000).toISOString() }).eq("id", exam.id);
  const reactivatedAdmit = await admit(randomUUID(), "Allowed", "Student");
  expect("a reactivated link starts attempts again", reactivatedAdmit.status === 200, `status ${reactivatedAdmit.status}`);

  // ── Audit trail exists ───────────────────────────────────────────────
  const { data: auditRows } = await db
    .from("audit_logs")
    .select("action")
    .eq("entity_id", requestId);
  const actions = (auditRows ?? []).map((r) => r.action);
  expect("request and start are audited", actions.includes("exam.retake_requested") && actions.includes("exam.retake_attempt_started"), actions.join(","));

  console.log(`\n${checks} checks passed`);
} catch (error) {
  console.error("E2E verification failed:", error?.message ?? error);
  process.exitCode = 1;
} finally {
  await cleanup();
}
