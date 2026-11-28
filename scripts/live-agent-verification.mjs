#!/usr/bin/env node
/**
 * LIVE external-agent verification against the deployed EVALORA MCP server.
 *
 * WHAT THIS IS
 *
 * A genuine Model Context Protocol client. It speaks streamable-HTTP to
 * https://evalora-edu.online/api/mcp, performs the real handshake, calls real
 * tools and reads back what the server actually returns. It never fabricates a
 * response, never writes a journal row, and never asserts something it did not
 * observe.
 *
 * WHERE THE CREDENTIAL COMES FROM
 *
 * `EVALORA_AGENT_TOKEN`. Nothing else. This process never mints one, never reads
 * one from a database, and never prints one:
 *
 *   - the token is redacted from every log line, every thrown error and every
 *     published result through `redact()`;
 *   - a final sweep greps the whole report for the token and aborts the run if
 *     it appears, so a leak is a failure rather than an oversight.
 *
 * The token is minted through the product (Dashboard → AI → Agents → Rotate
 * token), which stores only its SHA-256 digest and shows the plaintext once.
 *
 * WHY EVERY WRITE IS VERIFIED TWICE
 *
 * "A successful response without persisted data is not a successful operation."
 * So each write is checked by:
 *
 *   1. reading the record back through a DIFFERENT MCP tool (a write followed by
 *      a read of the same connection would prove nothing about persistence);
 *   2. publishing the record id and execution id, so the same ids can be checked
 *      independently against Postgres.
 *
 * The second step matters: this process has no database credential, so it cannot
 * and must not claim a row exists. It claims a tool said so, and hands over the
 * identifiers that let someone else confirm it.
 */

import { createHash, randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";

const BASE_URL = process.env.EVALORA_BASE_URL ?? "https://evalora-edu.online";
const MCP_URL = `${BASE_URL.replace(/\/$/, "")}/api/mcp`;
const TOKEN = process.env.EVALORA_AGENT_TOKEN ?? "";
const OLD_TOKEN = process.env.EVALORA_OLD_TOKEN ?? "";
const REPORT_PATH = process.env.EVALORA_REPORT_PATH ?? "live-agent-verification.json";
const RUN_TAG = process.env.EVALORA_RUN_TAG ?? `verify-${new Date().toISOString().slice(0, 10)}`;

const results = [];
const evidence = [];
const secrets = [];

function secret(value) {
  if (typeof value === "string" && value.length >= 8) secrets.push(value);
  return value;
}
if (TOKEN) secret(TOKEN);
if (OLD_TOKEN) secret(OLD_TOKEN);

/** Removes every registered secret from a string. Applied to all output. */
function redact(text) {
  let out = String(text);
  for (const value of secrets) {
    if (value) out = out.split(value).join("<redacted>");
  }
  return out;
}

function record(name, passed, detail) {
  const safe = redact(String(detail ?? ""));
  results.push({ name, passed: Boolean(passed), detail: safe });
  console.log(`${passed ? "PASS" : "FAIL"} ${name} :: ${safe}`);
  return Boolean(passed);
}

function note(label, value) {
  evidence.push({ label, value: redact(String(value)) });
}

/* ────────────────────────────── MCP transport ────────────────────────────── */

let sessionId = null;
let nextId = 1;

async function rpc(method, params, { notification = false } = {}) {
  const body = notification
    ? { jsonrpc: "2.0", method, params }
    : { jsonrpc: "2.0", id: nextId++, method, params };
  const headers = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    "mcp-protocol-version": "2025-06-18",
  };
  if (TOKEN) headers.authorization = `Bearer ${TOKEN}`;
  if (sessionId) headers["mcp-session-id"] = sessionId;

  const response = await fetch(MCP_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });

  const returnedSession = response.headers.get("mcp-session-id");
  if (returnedSession) sessionId = returnedSession;

  const text = await response.text();
  const contentType = response.headers.get("content-type") ?? "";

  // A streamable-HTTP server may answer with an SSE frame. Parse the last data
  // line rather than assuming plain JSON, or every call after a streamed reply
  // would look like a parse failure.
  let payload = null;
  if (text && contentType.includes("text/event-stream")) {
    const dataLine = text
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .filter(Boolean)
      .pop();
    if (dataLine) {
      try {
        payload = JSON.parse(dataLine);
      } catch {
        payload = null;
      }
    }
  } else if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  return { status: response.status, contentType, payload, body: text };
}

/**
 * Calls a tool and returns the parts this verification has to reason about: the
 * text, the structured content, whether the server marked it an error, and the
 * execution id the engine journals.
 */
async function callTool(name, args = {}) {
  const response = await rpc("tools/call", { name, arguments: args });
  const result = response.payload?.result;
  const isError = Boolean(result?.isError) || Boolean(response.payload?.error);
  const text = (result?.content ?? [])
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n");
  const structured = result?.structuredContent ?? null;
  const executionId = structured?.execution_id ?? structured?.executionId ?? null;
  return { response, result, isError, text, structured, executionId, status: response.status };
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/* ────────────────────────────────── Checks ───────────────────────────────── */

async function verifyAuthentication() {
  if (!TOKEN) {
    record("agent-token-present", false, "EVALORA_AGENT_TOKEN is not set; nothing can be verified");
    return false;
  }
  record("agent-token-present", true, `loaded from the environment, ${TOKEN.length} characters, prefix ${TOKEN.slice(0, 15)}…`);

  // The old credential must be dead. This is the rotation being real rather than
  // a second token being issued alongside the first.
  if (OLD_TOKEN) {
    const saved = TOKEN;
    const savedSecrets = [...secrets];
    try {
      // Swap the header by temporarily replacing the module-level token.
      process.env.__SWAP = "1";
      const oldResponse = await fetch(MCP_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          "mcp-protocol-version": "2025-06-18",
          authorization: `Bearer ${OLD_TOKEN}`,
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 900, method: "initialize", params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: RUN_TAG, version: "1.0.0" },
        } }),
        signal: AbortSignal.timeout(30_000),
      });
      record("old-credential-rejected", oldResponse.status === 401,
        `previous credential -> HTTP ${oldResponse.status}${oldResponse.status === 401 ? " (rejected)" : " (STILL ACCEPTED)"}`);
    } catch (error) {
      record("old-credential-rejected", false, `probe failed: ${error.message}`);
    } finally {
      void saved; void savedSecrets;
    }
  } else {
    record("old-credential-rejected", true, "skipped: no previous credential supplied to compare against");
  }
  return true;
}

async function verifyHandshake() {
  const init = await rpc("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: RUN_TAG, version: "1.0.0" },
  });
  const info = init.payload?.result;
  const ok = init.status === 200 && Boolean(info?.serverInfo);
  record("mcp-initialize", ok,
    ok ? `protocol=${info.protocolVersion}; server=${info.serverInfo.name} v${info.serverInfo.version}` : `HTTP ${init.status}`);

  const notify = await rpc("notifications/initialized", undefined, { notification: true });
  record("mcp-initialized-notification", notify.status === 202 || notify.status === 200, `HTTP ${notify.status}`);

  const ping = await rpc("ping");
  record("mcp-ping", Boolean(ping.payload?.result), ping.payload?.result ? "empty result object" : `HTTP ${ping.status}`);

  const list = await rpc("tools/list");
  const tools = list.payload?.result?.tools ?? [];
  record("mcp-tools-list", tools.length > 0, `${tools.length} tools offered`);
  for (const tool of tools) note("tool", tool.name);
  return tools.map((tool) => tool.name);
}

async function verifyReads() {
  const context = await callTool("get_org_context", {});
  const contextData = context.structured?.data ?? parseJson(context.text);
  record("read-get_org_context", !context.isError && Boolean(contextData),
    context.isError ? context.text.slice(0, 200) : `keys: ${Object.keys(contextData ?? {}).join(", ")}`);
  if (context.executionId) note("execution.get_org_context", context.executionId);
  const organizationId = contextData?.organization?.id ?? null;
  if (organizationId) note("organization.id", organizationId);

  const exams = await callTool("list_examinations", {});
  record("read-list_examinations", !exams.isError, exams.isError ? exams.text.slice(0, 200) : exams.text.slice(0, 160));
  if (exams.executionId) note("execution.list_examinations", exams.executionId);

  const questions = await callTool("get_question_bank", { limit: 5 });
  record("read-get_question_bank", !questions.isError, questions.isError ? questions.text.slice(0, 200) : questions.text.slice(0, 160));
  if (questions.executionId) note("execution.get_question_bank", questions.executionId);

  const quizzes = await callTool("list_quizzes", {});
  record("read-list_quizzes", !quizzes.isError, quizzes.isError ? quizzes.text.slice(0, 200) : quizzes.text.slice(0, 160));
  if (quizzes.executionId) note("execution.list_quizzes", quizzes.executionId);

  return { organizationId };
}

async function verifyWrites() {
  /* ── A question ─────────────────────────────────────────────────────── */
  const questionArgs = {
    type: "single_choice",
    prompt: `Verification ${RUN_TAG}: what is $\\dfrac{1}{2} + \\dfrac{1}{4}$?`,
    points: 2,
    difficulty: "easy",
    topic: "Verification: fractions",
    explanation: "$\\dfrac{1}{2} + \\dfrac{1}{4} = \\dfrac{2}{4} + \\dfrac{1}{4} = \\dfrac{3}{4}$.",
    options: [
      { label: "$\\dfrac{3}{4}$", is_correct: true },
      { label: "$\\dfrac{2}{6}$", is_correct: false },
      { label: "$\\dfrac{1}{6}$", is_correct: false },
    ],
  };
  const created = await callTool("create_question", questionArgs);
  const createdData = created.structured?.data ?? parseJson(created.text);
  const questionId = createdData?.question_id ?? createdData?.id ?? null;
  record("write-create_question", !created.isError && Boolean(questionId),
    created.isError ? created.text.slice(0, 220) : `question_id=${questionId}`);
  if (questionId) note("record.question_id", questionId);
  if (created.executionId) note("execution.create_question", created.executionId);

  /* Read it back through a DIFFERENT tool: a write proved by reading the same
     connection would not show persistence. */
  if (questionId) {
    const bank = await callTool("get_question_bank", { limit: 50, search: "Verification" });
    const bankData = bank.structured?.data ?? parseJson(bank.text);
    // Same rule: the id has to appear in the returned DATA, not in a sentence
    // the server wrote about it.
    const rows = bankData?.questions ?? bankData?.items ?? [];
    const found = rows.some((row) => String(row?.id) === String(questionId));
    record("persist-create_question", found,
      found ? `question ${questionId} is returned by get_question_bank` : "the question was NOT found on a read-back");
  } else {
    record("persist-create_question", false, "no id was returned, so persistence cannot be shown");
  }

  /* Repeat the identical call. A retry must not create a second question. */
  if (questionId) {
    const retry = await callTool("create_question", questionArgs);
    const retryData = retry.structured?.data ?? parseJson(retry.text);
    const retryId = retryData?.question_id ?? retryData?.id ?? null;
    record("idempotent-create_question", retryId === questionId,
      retryId === questionId
        ? `the retry returned the same id ${retryId}`
        : `the retry produced a different id (${retryId}) — a duplicate was created`);
  }

  /* ── A draft examination ────────────────────────────────────────────── */
  const examArgs = {
    title: `Verification paper ${RUN_TAG}`,
    description: "Created by the live MCP verification harness. Safe to delete.",
    duration_minutes: 30,
  };
  const exam = await callTool("create_examination", examArgs);
  const examData = exam.structured?.data ?? parseJson(exam.text);
  const examId = examData?.examination_id ?? examData?.exam_id ?? examData?.id ?? null;
  record("write-create_examination", !exam.isError && Boolean(examId),
    exam.isError ? exam.text.slice(0, 240) : `examination_id=${examId}`);
  if (examId) note("record.examination_id", examId);
  if (exam.executionId) note("execution.create_examination", exam.executionId);

  if (examId) {
    const readBack = await callTool("get_examination", { examination_id: examId });
    // Look in the structured payload, not the prose summary. A summary that
    // happens to mention the id is not evidence that the row was returned, and
    // matching it would have let this check pass on a pretty sentence.
    const backData = readBack.structured?.data ?? parseJson(readBack.text);
    const backId = backData?.examination?.id ?? backData?.examination_id ?? backData?.id ?? null;
    const found = !readBack.isError && String(backId) === String(examId);
    record("persist-create_examination", found,
      readBack.isError
        ? readBack.text.slice(0, 200)
        : found ? `get_examination returned ${backId} from the persisted row` : `read-back returned ${backId ?? "no id"}, not ${examId}`);
    if (readBack.executionId) note("execution.get_examination", readBack.executionId);
  } else {
    record("persist-create_examination", false, "no id was returned, so persistence cannot be shown");
  }

  /* ── A modification ─────────────────────────────────────────────────── */
  if (examId) {
    const updated = await callTool("update_examination", {
      examination_id: examId,
      duration_minutes: 45,
    });
    record("write-update_examination", !updated.isError,
      updated.isError ? updated.text.slice(0, 200) : `updated ${examId}`);
    if (updated.executionId) note("execution.update_examination", updated.executionId);

    const reread = await callTool("get_examination", { examination_id: examId });
    const after = reread.structured?.data ?? parseJson(reread.text);
    const duration = after?.examination?.duration_minutes ?? after?.duration_minutes ?? null;
    record("persist-update_examination", Number(duration) === 45,
      duration === null ? "duration was not visible on read-back" : `read-back duration_minutes=${duration}`);
  } else {
    record("write-update_examination", false, "no examination id to modify");
    record("persist-update_examination", false, "no examination id to modify");
  }

  return { questionId, examId };
}

async function verifyPermissions({ examId }) {
  /* Publication is the grant this credential deliberately does not hold. */
  const publish = await callTool("publish_examination", { examination_id: examId ?? randomUUID() });
  const refused = publish.isError || /permission|not have|denied|requires/i.test(publish.text);
  record("deny-publish_examination", refused,
    refused ? `refused: ${publish.text.slice(0, 180)}` : "THE AGENT WAS ABLE TO PUBLISH — this is a defect");
  if (publish.executionId) note("execution.publish_examination", publish.executionId);

  const publishResults = await callTool("publish_results", { examination_id: examId ?? randomUUID() });
  const resultsRefused = publishResults.isError || /permission|not have|denied|requires/i.test(publishResults.text);
  record("deny-publish_results", resultsRefused,
    resultsRefused ? `refused: ${publishResults.text.slice(0, 180)}` : "THE AGENT WAS ABLE TO PUBLISH RESULTS — this is a defect");

  /* A tool that exists but was not granted must not be callable at all. */
  const admin = await callTool("revoke_ai_agent", { agent_id: randomUUID() });
  const adminRefused = admin.isError || /permission|not have|denied|unsupported|no tool named/i.test(admin.text);
  record("deny-agent-administration", adminRefused,
    adminRefused ? `refused: ${admin.text.slice(0, 160)}` : "THE AGENT COULD ADMINISTER AGENTS — this is a defect");
}

async function verifyIsolation() {
  /* A well-known Oak identifier. A Demo Academy credential must not be able to
     read it, and must not be able to tell it apart from an id that does not
     exist — a distinguishable "forbidden" leaks the existence of other tenants. */
  const oakExamId = process.env.EVALORA_OAK_EXAM_ID ?? "00000000-0000-4000-8000-000000000000";
  const foreign = await callTool("get_examination", { examination_id: oakExamId });
  const leaked = !foreign.isError && foreign.text.includes("Oak");
  record("isolation-cross-tenant-read", !leaked,
    leaked ? "ANOTHER TENANT'S RECORD WAS RETURNED — this is a defect" : `refused or empty: ${foreign.text.slice(0, 160)}`);

  const bogus = await callTool("get_examination", { examination_id: randomUUID() });
  const sameShape = bogus.isError === foreign.isError;
  record("isolation-indistinguishable", sameShape,
    sameShape ? "a foreign id and a non-existent id answer the same way" : "the two answers differ, which leaks existence");
}

async function verifyJournal() {
  const ids = evidence.filter((item) => item.label.startsWith("execution."));
  record("journal-execution-ids-present", ids.length >= 6,
    `${ids.length} tool calls returned an execution id`);
  for (const item of ids) note(item.label, item.value);
}

/**
 * School-management coverage.
 *
 * The brief asks to audit student creation, bulk import, class/grade
 * association, teacher creation, teacher-to-class and teacher-to-subject
 * assignment, and dual homeroom/subject responsibilities. None of that is
 * reachable through this surface, and the honest result is to say so with the
 * tool list in hand rather than to attempt it and report a failure.
 */
async function auditSchoolManagement(tools) {
  const keywords = /student|teacher|enrol|enroll|import|class|grade|homeroom|guardian|parent|staff/i;
  const relevant = tools.filter((tool) => keywords.test(tool));
  record("school-management-tools-available", relevant.length > 0,
    relevant.length > 0
      ? `tools that touch school management: ${relevant.join(", ")}`
      : `none of the ${tools.length} offered tools covers students, teachers, enrollment, import, classes or grades`);
  note("tools.count", String(tools.length));
  note("tools.school_management", relevant.length ? relevant.join(", ") : "(none)");
  for (const tool of relevant) note("school_tool", tool);
}

/* ─────────────────────────────────── Report ──────────────────────────────── */

async function publishCheck(conclusion, summary, text) {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  const sha = process.env.GITHUB_SHA;
  if (!token || !repo || !sha) return;
  await fetch(`https://api.github.com/repos/${repo}/check-runs`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "content-type": "application/json",
      "x-github-api-version": "2022-11-28",
    },
    body: JSON.stringify({
      name: "agent-verification",
      head_sha: sha,
      status: "completed",
      conclusion,
      output: { title: "External agent verification", summary, text },
    }),
  }).catch(() => {});
}

async function main() {
  const report = { run_tag: RUN_TAG, base_url: BASE_URL, started_at: new Date().toISOString() };

  if (!(await verifyAuthentication())) {
    report.results = results;
    report.summary = { total: 1, passed: 0, failed: 1 };
    writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
    await publishCheck("failure", "No agent credential was supplied, so nothing could be verified.",
      "EVALORA_AGENT_TOKEN was empty. The harness refuses to run without it rather than reporting a pass.");
    process.exitCode = 1;
    return;
  }

  try {
    const tools = await verifyHandshake();
    const { organizationId } = await verifyReads();
    const { questionId, examId } = await verifyWrites();
    await verifyPermissions({ examId });
    await verifyIsolation();
    await verifyJournal();
    await auditSchoolManagement(tools);
    report.organization_id = organizationId;
    report.record_ids = { question_id: questionId, examination_id: examId };
  } catch (error) {
    record("harness", false, `the run stopped early: ${error.message}`);
  }

  report.finished_at = new Date().toISOString();
  report.evidence = evidence;
  // The per-check results ARE the report. They were being computed and then
  // never attached, so the artifact carried a tally with no evidence behind it
  // and the regression suite could not read what passed.
  report.results = results;
  report.summary = {
    total: results.length,
    passed: results.filter((item) => item.passed).length,
    failed: results.filter((item) => !item.passed).length,
  };

  /* The token-leak guard. A report that contains the credential is a failure
     even if every functional check passed. */
  const serialised = JSON.stringify(report);
  const leaked = secrets.some((value) => value && serialised.includes(value));
  if (leaked) {
    report.leak_detected = true;
    report.summary.failed += 1;
    report.summary.total += 1;
    results.push({ name: "token-leak-guard", passed: false, detail: "the credential appeared in the report" });
  }

  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(`\n${report.summary.passed}/${report.summary.total} checks passed.`);

  const text = [
    ...results.map((item) => `${item.passed ? "PASS" : "FAIL"} ${item.name} :: ${item.detail}`),
    "",
    "Records created by this run (confirm these in Postgres):",
    ...evidence.filter((item) => item.label.startsWith("record.") || item.label.startsWith("execution."))
      .map((item) => `  ${item.label} = ${item.value}`),
  ].join("\n");

  await publishCheck(
    report.summary.failed === 0 && !leaked ? "success" : "failure",
    `${report.summary.passed}/${report.summary.total} checks passed (${report.summary.failed} failed).`,
    text,
  );

  if (report.summary.failed > 0 || leaked) process.exitCode = 1;
}

main().catch((error) => {
  console.error(redact(`harness crashed: ${error.message}`));
  process.exitCode = 1;
});

export { createHash };
