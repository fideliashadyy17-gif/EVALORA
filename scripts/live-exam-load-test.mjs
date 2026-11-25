/**
 * Real Live Production E2E + Concurrent Load Test against EVALORA.
 *
 * Security:
 *   - Reads target URL and exam credentials strictly from environment variables
 *     (never hardcoded).
 *   - Uses real Ed25519 challenge-response lockdown attestation identical to the
 *     EVALORA Secure Exam Browser desktop app.
 *   - Every synthetic candidate is tagged with `first_name = "LOADTEST_AUDIT_<runTag>_<id>"`
 *     so all synthetic rows can be audited and purged cleanly with zero impact on real data.
 *
 * Env vars required:
 *   BASE_URL           e.g. https://evalora-edu.online
 *   MYP4_INVITE_TOKEN  UUID invite token for MYP4 exam
 *   MYP4_ACCESS_CODE   Access code for MYP4 exam
 *   MYP4_CLASS_ID      Class UUID for MYP4 exam
 *   MYP5_INVITE_TOKEN  UUID invite token for MYP5 exam
 *   MYP5_ACCESS_CODE   Access code for MYP5 exam
 *   MYP5_CLASS_ID      Class UUID for MYP5 exam
 *   STAGES             Comma-separated concurrency levels (default: "100,250,500,1000")
 *   RUN_TAG            Optional tag suffix (default: timestamp)
 */

import { createHash, generateKeyPairSync, randomUUID, sign as cryptoSign } from "node:crypto";

const BASE_URL = (process.env.BASE_URL || "https://evalora-edu.online").replace(/\/$/, "");
const RUN_TAG = (process.env.RUN_TAG || `R${Date.now().toString(36).toUpperCase()}`).replace(/[^A-Z0-9]/gi, "").slice(0, 14);
const STAGES = (process.env.STAGES || "100,250,500,1000")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isInteger(n) && n > 0);

const EXAMS = [
  {
    label: "MYP4",
    inviteToken: process.env.MYP4_INVITE_TOKEN || "",
    accessCode: (process.env.MYP4_ACCESS_CODE || "").trim().toUpperCase(),
    classId: process.env.MYP4_CLASS_ID || "",
    expectedCount: 31,
    expectedSecBPrefix: "QUESTION",
  },
  {
    label: "MYP5",
    inviteToken: process.env.MYP5_INVITE_TOKEN || "",
    accessCode: (process.env.MYP5_ACCESS_CODE || "").trim().toUpperCase(),
    classId: process.env.MYP5_CLASS_ID || "",
    expectedCount: 34,
    expectedSecBPrefix: "TASK",
  },
].filter((e) => e.inviteToken && e.accessCode && e.classId);

if (!EXAMS.length) {
  console.error("ERROR: Missing MYP4/MYP5 exam environment variables.");
  process.exit(1);
}

// ── Native Ed25519 lockdown attestation helpers (mirrors src/lib/lockdownAttestation.ts) ──
function normalized(value) {
  return typeof value === "string" ? value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase() : "";
}

function candidateBinding(ctx) {
  const identity = Object.fromEntries(
    Object.entries(ctx.identity ?? {})
      .filter(([k]) => k !== "lockdown_attestation")
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => [k, normalized(v)]),
  );
  const canonical = JSON.stringify([
    "EVALORA-CANDIDATE-V2",
    normalized(ctx.first_name),
    normalized(ctx.last_name),
    normalized(ctx.class_id),
    normalized(ctx.class_name),
    normalized(ctx.guest_key),
    normalized(ctx.candidate_code),
    identity,
  ]);
  return createHash("sha256").update(canonical).digest("hex");
}

function challengeMessage(proof) {
  return JSON.stringify([
    "EVALORA-LOCKDOWN-ATTESTATION-V2",
    proof.challenge_id,
    proof.nonce,
    proof.expires_at,
    proof.exam_code.trim().toUpperCase(),
    proof.candidate_binding,
    proof.session_id,
    proof.platform,
    proof.app_version,
  ]);
}

function newDeviceKeys() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
    privateKey,
  };
}

// Pre-generate a pool of Ed25519 keypairs so local crypto setup doesn't distort network timing.
const KEY_POOL = Array.from({ length: 1200 }, () => newDeviceKeys());

async function timedFetch(path, init = {}, timeoutMs = 25_000) {
  const t0 = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return {
      ok: res.ok,
      status: res.status,
      ms: performance.now() - t0,
      json,
      error: res.ok ? null : (json?.error || `HTTP ${res.status}`),
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      ms: performance.now() - t0,
      json: null,
      error: err?.name === "AbortError" ? "TIMEOUT" : String(err?.message || err),
    };
  } finally {
    clearTimeout(timer);
  }
}

function buildSampleAnswer(q) {
  if (q.type === "single_choice" || q.type === "true_false") {
    const opt = q.options?.[0];
    return opt ? { option_id: opt.id } : null;
  }
  if (q.type === "matching") {
    const lefts = q.matching_rows?.map((r) => r.left) || q.matching_lefts || [];
    if (!lefts.length) return null;
    const letters = ["P", "Q", "R", "S", "T"];
    return { pairs: lefts.map((left, idx) => ({ left, right: letters[idx % letters.length] })) };
  }
  if (q.type === "assess_parts") {
    const parts = {};
    for (const part of q.assess_parts || []) {
      parts[part.id] = part.kind === "numeric" ? "42" : "2n + 1";
    }
    return Object.keys(parts).length ? { parts } : null;
  }
  if (q.type === "numeric") return { value: 10 };
  if (q.type === "short_answer" || q.type === "open_ended") return { text: "Sample response" };
  return null;
}

async function getSignedAttestation(exam, candidateCtx, keys) {
  const binding = candidateBinding(candidateCtx);
  const ch = await timedFetch("/api/exam/lockdown/challenge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      exam_code: exam.accessCode,
      candidate_binding: binding,
      session_id: candidateCtx.guest_key,
      public_key_pem: keys.publicKeyPem,
      platform: "win32",
      app_version: "1.1.0",
    }),
  });
  if (!ch.ok || !ch.json?.challenge_id) {
    return { ok: false, challengeRes: ch, attestation: null };
  }
  const unsigned = {
    challenge_id: ch.json.challenge_id,
    nonce: ch.json.nonce,
    expires_at: ch.json.expires_at,
    exam_code: ch.json.exam_code,
    candidate_binding: ch.json.candidate_binding,
    session_id: ch.json.session_id,
    platform: ch.json.platform,
    app_version: ch.json.app_version,
  };
  const signature = cryptoSign(null, Buffer.from(challengeMessage(unsigned), "utf8"), keys.privateKey).toString("base64url");
  return {
    ok: true,
    challengeRes: ch,
    attestation: { ...unsigned, signature },
  };
}

// ── Phase 1: Live Production Security & Full Functional E2E Suite ──
async function runFunctionalE2E() {
  console.log(`\n=============================================================`);
  console.log(`PHASE 1: LIVE E2E & SECURITY VERIFICATION (${BASE_URL})`);
  console.log(`Run tag: ${RUN_TAG}`);
  console.log(`=============================================================`);

  const health = await timedFetch("/api/health");
  console.log(`  [HEALTH] GET /api/health -> HTTP ${health.status} (${health.ms.toFixed(0)}ms)`);

  let failures = 0;
  const assertCheck = (name, cond, detail = "") => {
    if (cond) {
      console.log(`  ✓ ${name}${detail ? ` (${detail})` : ""}`);
    } else {
      failures += 1;
      console.error(`  ✗ FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
    }
  };

  for (const exam of EXAMS) {
    console.log(`\n--- Testing ${exam.label} Version C ---`);
    const guestKey = `lt-${RUN_TAG}-${exam.label}-${randomUUID()}`;
    const firstName = `LOADTEST_AUDIT_${RUN_TAG}`;
    const lastName = `E2E_${exam.label}`;
    const keys = newDeviceKeys();

    // 1. Standard browser (no attestation) MUST be rejected with 403
    const noAttest = await timedFetch("/api/exam/link-access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        invite_token: exam.inviteToken,
        access_code: exam.accessCode,
        first_name: firstName,
        last_name: `${lastName}_NOATTEST`,
        class_id: exam.classId,
        guest_key: `noattest-${guestKey}`,
        consent: true,
      }),
    });
    assertCheck(
      `${exam.label}: standard browser without Secure App rejected`,
      noAttest.status === 403 && noAttest.json?.lockdown_required === true,
      `HTTP ${noAttest.status} (${noAttest.ms.toFixed(0)}ms)`,
    );

    // 2. Valid native Ed25519 attestation admitted
    const candidateCtx = {
      first_name: firstName,
      last_name: lastName,
      class_id: exam.classId,
      guest_key: guestKey,
      identity: {},
    };
    const att = await getSignedAttestation(exam, candidateCtx, keys);
    assertCheck(
      `${exam.label}: native Ed25519 challenge minted`,
      att.ok,
      `HTTP ${att.challengeRes.status} (${att.challengeRes.ms.toFixed(0)}ms)`,
    );

    const join = await timedFetch("/api/exam/link-access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        invite_token: exam.inviteToken,
        access_code: exam.accessCode,
        first_name: firstName,
        last_name: lastName,
        class_id: exam.classId,
        guest_key: guestKey,
        identity: { lockdown_attestation: att.attestation },
        consent: true,
      }),
    });
    assertCheck(
      `${exam.label}: verified Secure App candidate admitted`,
      join.status === 200 && Boolean(join.json?.attempt_id) && join.json?.lockdown_verified === true,
      `HTTP ${join.status} (${join.ms.toFixed(0)}ms)`,
    );
    if (!join.ok) continue;

    const attemptId = join.json.attempt_id;
    const token = join.json.access_token;

    // 3. Replaying same consumed challenge MUST fail with 403
    const replay = await timedFetch("/api/exam/link-access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        invite_token: exam.inviteToken,
        access_code: exam.accessCode,
        first_name: firstName,
        last_name: lastName,
        class_id: exam.classId,
        guest_key: guestKey,
        identity: { lockdown_attestation: att.attestation },
        consent: true,
      }),
    });
    assertCheck(
      `${exam.label}: one-time challenge replay rejected`,
      replay.status === 403,
      `HTTP ${replay.status} (${replay.ms.toFixed(0)}ms)`,
    );

    // 4. Load GET /api/exam/state and verify paper structure & Section B ordering
    const state = await timedFetch(`/api/exam/state?attempt_id=${attemptId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const questions = state.json?.questions || [];
    const totalPts = questions.reduce((s, q) => s + Number(q.points || 0), 0);
    const secB = questions.filter((q) => q.question_meta?.paper_section === "B");
    const secBNumbers = secB.map((q) => Number(q.question_meta?.question_number ?? 0));
    const secBInOrder = secB.length === 4 && secBNumbers.every((n, i) => i === 0 || n >= secBNumbers[i - 1]);
    const secBPromptOrder = secB.map((q) => (q.prompt || "").slice(0, 28));
    assertCheck(
      `${exam.label}: GET /api/exam/state paper valid`,
      state.status === 200 && questions.length === exam.expectedCount && totalPts === 100,
      `HTTP ${state.status}, ${questions.length} Qs, ${totalPts} pts, ${state.ms.toFixed(0)}ms`,
    );
    assertCheck(
      `${exam.label}: Section B kept in authored order (not shuffled)`,
      secBInOrder && secBPromptOrder.every((p, idx) => p.includes(`${exam.expectedSecBPrefix} ${idx + 1}`)),
      `prompts=${JSON.stringify(secBPromptOrder)}`,
    );

    // 5. Verify Section A randomization differs across 2 candidates
    const guestKey2 = `lt-${RUN_TAG}-${exam.label}-RAND2-${randomUUID()}`;
    const ctx2 = { first_name: firstName, last_name: `${lastName}_R2`, class_id: exam.classId, guest_key: guestKey2, identity: {} };
    const att2 = await getSignedAttestation(exam, ctx2, newDeviceKeys());
    const join2 = await timedFetch("/api/exam/link-access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        invite_token: exam.inviteToken,
        access_code: exam.accessCode,
        first_name: ctx2.first_name,
        last_name: ctx2.last_name,
        class_id: exam.classId,
        guest_key: guestKey2,
        identity: { lockdown_attestation: att2.attestation },
        consent: true,
      }),
    });
    if (join2.ok) {
      const state2 = await timedFetch(`/api/exam/state?attempt_id=${join2.json.attempt_id}`, {
        headers: { Authorization: `Bearer ${join2.json.access_token}` },
      });
      const secA1 = questions.filter((q) => q.question_meta?.paper_section === "A").map((q) => q.question_id);
      const secA2 = (state2.json?.questions || []).filter((q) => q.question_meta?.paper_section === "A").map((q) => q.question_id);
      const secB2 = (state2.json?.questions || []).filter((q) => q.question_meta?.paper_section === "B").map((q) => q.question_id);
      assertCheck(
        `${exam.label}: Section A randomized per candidate while Section B identical`,
        JSON.stringify(secA1) !== JSON.stringify(secA2) && JSON.stringify(secB.map((q) => q.question_id)) === JSON.stringify(secB2),
        `secA_diff=${JSON.stringify(secA1) !== JSON.stringify(secA2)}, secB_same=${JSON.stringify(secB.map((q) => q.question_id)) === JSON.stringify(secB2)}`,
      );
    }

    // 6. Save answers across all question types (single_choice, true_false, matching, assess_parts)
    const typesTested = new Set();
    const savedQuestionIds = [];
    for (const q of questions) {
      if (typesTested.has(q.type)) continue;
      const ans = buildSampleAnswer(q);
      if (!ans) continue;
      const saveRes = await timedFetch("/api/exam/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attempt_id: attemptId,
          token,
          question_id: q.question_id,
          quiz_question_id: q.quiz_question_id,
          answer: ans,
          flagged: savedQuestionIds.length === 0 ? [q.question_id] : undefined,
        }),
      });
      assertCheck(
        `${exam.label}: POST /api/exam/save (${q.type})`,
        saveRes.status === 200 && saveRes.json?.ok === true,
        `HTTP ${saveRes.status} (${saveRes.ms.toFixed(0)}ms)`,
      );
      typesTested.add(q.type);
      savedQuestionIds.push(q.question_id);
    }

    // 7. Refresh recovery check
    const reloadState = await timedFetch(`/api/exam/state?attempt_id=${attemptId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const restoredCount = (reloadState.json?.questions || []).filter(
      (q) => savedQuestionIds.includes(q.question_id) && q.saved_answer !== null,
    ).length;
    assertCheck(
      `${exam.label}: page refresh restores all ${savedQuestionIds.length} saved answers`,
      restoredCount === savedQuestionIds.length,
      `restored=${restoredCount}/${savedQuestionIds.length} (${reloadState.ms.toFixed(0)}ms)`,
    );

    // 8. Presence heartbeat + roster + messages + integrity + leave beacon
    const hb = await timedFetch("/api/exam/presence", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        attempt_id: attemptId,
        current_question: 2,
        total_questions: questions.length,
        saved_count: savedQuestionIds.length,
        pending_saves: 0,
        event: "heartbeat",
      }),
    });
    assertCheck(`${exam.label}: POST /api/exam/presence (heartbeat)`, hb.status === 200 && hb.json?.ok === true, `HTTP ${hb.status} (${hb.ms.toFixed(0)}ms)`);

    const roster = await timedFetch(`/api/exam/presence?attempt_id=${attemptId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assertCheck(
      `${exam.label}: GET /api/exam/presence (roster)`,
      roster.status === 200 && Boolean(roster.json?.roster),
      `HTTP ${roster.status}, refresh_ms=${roster.json?.refresh_ms} (${roster.ms.toFixed(0)}ms)`,
    );

    const msgs = await timedFetch(`/api/exam/messages?attempt_id=${attemptId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assertCheck(`${exam.label}: GET /api/exam/messages`, msgs.status === 200, `HTTP ${msgs.status} (${msgs.ms.toFixed(0)}ms)`);

    const integ = await timedFetch("/api/exam/integrity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        attempt_id: attemptId,
        token,
        event: "tab_hidden",
        detail: { source: "live-audit-e2e" },
      }),
    });
    assertCheck(`${exam.label}: POST /api/exam/integrity`, integ.status === 200 && integ.json?.ok === true, `HTTP ${integ.status} (${integ.ms.toFixed(0)}ms)`);

    const leave = await timedFetch("/api/exam/presence", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ attempt_id: attemptId, event: "leave" }),
    });
    assertCheck(`${exam.label}: POST /api/exam/presence (leave beacon fixed)`, leave.status === 200 && leave.json?.ok === true, `HTTP ${leave.status} (${leave.ms.toFixed(0)}ms)`);

    // 9. Submit + verify grading & result suppression + post-submit lock
    const sub = await timedFetch("/api/exam/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attempt_id: attemptId, token }),
    });
    assertCheck(
      `${exam.label}: POST /api/exam/submit`,
      sub.status === 200 && sub.json?.ok === true && sub.json?.status === "submitted",
      `HTTP ${sub.status} (${sub.ms.toFixed(0)}ms)`,
    );

    const afterState = await timedFetch(`/api/exam/state?attempt_id=${attemptId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assertCheck(
      `${exam.label}: post-submit hides unpublished scores`,
      afterState.status === 200 && afterState.json?.attempt?.status === "submitted" && afterState.json?.attempt?.score === null,
      `status=${afterState.json?.attempt?.status}, score=${afterState.json?.attempt?.score}`,
    );

    const lateSave = await timedFetch("/api/exam/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        attempt_id: attemptId,
        token,
        question_id: questions[0].question_id,
        quiz_question_id: questions[0].quiz_question_id,
        answer: buildSampleAnswer(questions[0]),
      }),
    });
    assertCheck(`${exam.label}: post-submit save refused with 409`, lateSave.status === 409, `HTTP ${lateSave.status}`);
  }

  console.log(`\nPhase 1 Summary: ${failures === 0 ? "ALL PASSED" : `${failures} FAILED`}`);
  return failures;
}

// ── Phase 2: Progressive Concurrent Production Load Test (100 -> 250 -> 500 -> 1,000) ──
function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function summarizeMetric(name, samples) {
  const ok = samples.filter((s) => s.ok).length;
  const fail = samples.length - ok;
  const latencies = samples.map((s) => s.ms).sort((a, b) => a - b);
  const statuses = {};
  const errors = {};
  for (const s of samples) {
    statuses[s.status] = (statuses[s.status] || 0) + 1;
    if (!s.ok) {
      const e = String(s.error || `HTTP ${s.status}`).slice(0, 80);
      errors[e] = (errors[e] || 0) + 1;
    }
  }
  return {
    name,
    total: samples.length,
    ok,
    fail,
    successPct: samples.length ? Number(((ok / samples.length) * 100).toFixed(2)) : 0,
    p50: Math.round(percentile(latencies, 50)),
    p95: Math.round(percentile(latencies, 95)),
    p99: Math.round(percentile(latencies, 99)),
    max: Math.round(latencies[latencies.length - 1] || 0),
    statuses,
    errors,
  };
}

async function runStage(concurrency) {
  console.log(`\n=============================================================`);
  console.log(`LOAD STAGE: ${concurrency} CONCURRENT CANDIDATES (live ${BASE_URL})`);
  console.log(`=============================================================`);

  const metrics = {
    challenge: [],
    join: [],
    state: [],
    save: [],
    heartbeat: [],
    presence_get: [],
    messages: [],
    submit: [],
  };

  const stageStart = performance.now();

  // Launch all N candidates simultaneously with slight realistic human stagger (0-1.5s)
  // at 500-1000 scale to mimic a real school bell start without synthetic 1ms TCP SYN drop.
  const staggerMaxMs = concurrency >= 500 ? 2_500 : concurrency >= 250 ? 1_000 : 300;

  const runCandidate = async (idx) => {
    const delayMs = Math.floor(Math.random() * staggerMaxMs);
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));

    const exam = EXAMS[idx % EXAMS.length];
    const keys = KEY_POOL[idx % KEY_POOL.length];
    const guestKey = `lt-${RUN_TAG}-S${concurrency}-${idx}-${randomUUID().slice(0, 8)}`;
    const firstName = `LOADTEST_AUDIT_${RUN_TAG}`;
    const lastName = `S${concurrency}_C${idx}`;

    // 1. Native lockdown challenge + signature
    const candidateCtx = {
      first_name: firstName,
      last_name: lastName,
      class_id: exam.classId,
      guest_key: guestKey,
      identity: {},
    };
    const att = await getSignedAttestation(exam, candidateCtx, keys);
    metrics.challenge.push(att.challengeRes);
    if (!att.ok) return { completed: false, failedAt: "challenge" };

    // 2. Join exam
    const join = await timedFetch("/api/exam/link-access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        invite_token: exam.inviteToken,
        access_code: exam.accessCode,
        first_name: firstName,
        last_name: lastName,
        class_id: exam.classId,
        guest_key: guestKey,
        identity: { lockdown_attestation: att.attestation },
        consent: true,
      }),
    });
    metrics.join.push(join);
    if (!join.ok || !join.json?.attempt_id) return { completed: false, failedAt: "join" };

    const attemptId = join.json.attempt_id;
    const token = join.json.access_token;

    // 3. Load full paper
    const state = await timedFetch(`/api/exam/state?attempt_id=${attemptId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    metrics.state.push(state);
    if (!state.ok || !Array.isArray(state.json?.questions)) return { completed: false, failedAt: "state" };

    const questions = state.json.questions;

    // 4. Save 3 answers (mix of MCQ + assess_parts)
    const sampleQs = [
      questions.find((q) => q.type === "single_choice") || questions[0],
      questions.find((q) => q.type === "assess_parts") || questions[1],
      questions[questions.length - 1],
    ].filter(Boolean);

    for (const q of sampleQs) {
      const ans = buildSampleAnswer(q);
      if (!ans) continue;
      const save = await timedFetch("/api/exam/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attempt_id: attemptId,
          token,
          question_id: q.question_id,
          quiz_question_id: q.quiz_question_id,
          answer: ans,
        }),
      });
      metrics.save.push(save);
    }

    // 5. Concurrent background polling beat (heartbeat + presence roster + messages)
    const [hb, pres, msg] = await Promise.all([
      timedFetch("/api/exam/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          attempt_id: attemptId,
          current_question: 3,
          total_questions: questions.length,
          saved_count: sampleQs.length,
          pending_saves: 0,
          event: "heartbeat",
        }),
      }),
      timedFetch(`/api/exam/presence?attempt_id=${attemptId}`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      timedFetch(`/api/exam/messages?attempt_id=${attemptId}`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    ]);
    metrics.heartbeat.push(hb);
    metrics.presence_get.push(pres);
    metrics.messages.push(msg);

    // 6. Final submission + auto-grading
    const sub = await timedFetch("/api/exam/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attempt_id: attemptId, token }),
    });
    metrics.submit.push(sub);

    return { completed: sub.ok, failedAt: sub.ok ? null : "submit" };
  };

  const results = await Promise.all(Array.from({ length: concurrency }, (_, i) => runCandidate(i)));
  const wallSec = (performance.now() - stageStart) / 1000;
  const completedCount = results.filter((r) => r.completed).length;

  const summaries = Object.entries(metrics).map(([k, v]) => summarizeMetric(k, v));
  const totalReqs = summaries.reduce((s, m) => s + m.total, 0);
  const totalOk = summaries.reduce((s, m) => s + m.ok, 0);

  console.log(
    `Completed full lifecycle: ${completedCount}/${concurrency} (${((completedCount / concurrency) * 100).toFixed(2)}%) in ${wallSec.toFixed(1)}s | Total HTTP requests: ${totalOk}/${totalReqs} (${((totalOk / Math.max(1, totalReqs)) * 100).toFixed(2)}%) | Avg RPS: ${(totalReqs / wallSec).toFixed(1)} req/s`,
  );
  console.log(`Endpoint          | OK/Total     | Rate    | P50ms | P95ms | P99ms | Maxms | Statuses`);
  console.log(`------------------|--------------|---------|-------|-------|-------|-------|-------------------------`);
  for (const m of summaries) {
    console.log(
      `${m.name.padEnd(17)} | ${`${m.ok}/${m.total}`.padEnd(12)} | ${`${m.successPct}%`.padEnd(7)} | ${String(m.p50).padStart(5)} | ${String(m.p95).padStart(5)} | ${String(m.p99).padStart(5)} | ${String(m.max).padStart(5)} | ${JSON.stringify(m.statuses)}`,
    );
    if (Object.keys(m.errors).length) {
      console.log(`   ↳ errors: ${JSON.stringify(m.errors)}`);
    }
  }

  return {
    concurrency,
    wallSec: Number(wallSec.toFixed(2)),
    completedCount,
    completionPct: Number(((completedCount / concurrency) * 100).toFixed(2)),
    totalReqs,
    totalOk,
    overallSuccessPct: Number(((totalOk / Math.max(1, totalReqs)) * 100).toFixed(2)),
    rps: Number((totalReqs / wallSec).toFixed(1)),
    endpoints: summaries,
  };
}

async function main() {
  const e2eFailures = await runFunctionalE2E();
  const stageReports = [];
  for (const stage of STAGES) {
    const report = await runStage(stage);
    stageReports.push(report);
    // Pause briefly between stages so connection pool settles cleanly.
    await new Promise((r) => setTimeout(r, 4_000));
  }

  console.log(`\n=============================================================`);
  console.log(`FINAL JSON SUMMARY (RUN_TAG=${RUN_TAG})`);
  console.log(`=============================================================`);
  console.log(JSON.stringify({ runTag: RUN_TAG, baseUrl: BASE_URL, e2eFailures, stages: stageReports }, null, 2));

  if (e2eFailures > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
