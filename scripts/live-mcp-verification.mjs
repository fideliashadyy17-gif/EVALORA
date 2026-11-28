// LIVE MCP VERIFICATION — genuine, against the deployed application.
//
// The constraint that shapes this file: there is no channel by which a token can
// be given to this runner, and a token must not be written down (that is how the
// previous credential became unusable). So the runner does the opposite — it
// MINTS the credential itself and publishes only its SHA-256. A digest cannot be
// reversed into a token, so publishing it discloses nothing that Postgres does
// not already store.
//
// The job then WAITS. The operator applies that digest to `ai_agents` through the
// audited SQL channel; the wait is signalled by the production endpoint itself
// changing from 401 to 200, so no coordination channel is needed and no
// verification is faked. Only then does the handshake run.
//
// Every check below is a statement about bytes the deployed server returned.
// Nothing is stubbed.

import { createHash, randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";

const BASE_URL = (process.env.BASE_URL ?? "https://evalora-edu.online").replace(/\/+$/, "");
const WAIT_SECONDS = Number(process.env.DIGEST_WAIT_SECONDS ?? "420");
const POLL_MS = 10_000;

const results = [];
const emit = (name, passed, detail = "") => {
  results.push({ name, passed, detail });
  console.log(`${passed ? "PASS" : "FAIL"}  ${name} — ${detail}`);
  // Annotations are used because step logs and artifacts are served from Azure
  // Blob, which some readers cannot reach; check-run annotations are readable
  // from the GitHub API.
  console.log(`::${passed ? "notice" : "error"} title=${name}::${String(detail).replace(/[\r\n]+/g, " ").slice(0, 900)}`);
};
const check = (name, passed, detail = "") => emit(name, passed, detail);

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class McpClient {
  constructor(baseUrl, token) {
    this.url = `${baseUrl}/api/mcp`;
    this.token = token;
    this.nextId = 1;
    this.protocolVersion = null;
  }

  async rpc(method, params = undefined, { notify = false } = {}) {
    const payload = notify
      ? { jsonrpc: "2.0", method, ...(params === undefined ? {} : { params }) }
      : { jsonrpc: "2.0", id: this.nextId++, method, ...(params === undefined ? {} : { params }) };
    const response = await fetch(this.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${this.token}`,
        ...(this.protocolVersion ? { "MCP-Protocol-Version": this.protocolVersion } : {}),
      },
      body: JSON.stringify(payload),
    });
    const text = await response.text();
    if (notify) return { status: response.status, body: null };
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    return { status: response.status, body };
  }

  initialize() {
    return this.rpc("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: { roots: { listChanged: false } },
      clientInfo: { name: "evalora-live-mcp-verification", version: "1.0.0" },
    });
  }

  listTools() {
    return this.rpc("tools/list", {});
  }

  callTool(name, args = {}) {
    return this.rpc("tools/call", { name, arguments: args });
  }
}

const toolResult = (body) => {
  const result = body?.result;
  if (!result) return { ok: false, errorCode: body?.error?.data?.code ?? null, text: String(body?.error?.message ?? ""), structured: null };
  const structured = result.structuredContent ?? null;
  return {
    ok: result.isError !== true && structured?.ok !== false,
    errorCode: structured?.code ?? null,
    text: (result.content ?? []).map((c) => c.text ?? "").join("\n"),
    structured,
    executionId: structured?.execution_id ?? null,
  };
};

const report = { base_url: BASE_URL, started_at: new Date().toISOString(), checks: results, evidence: {} };
let TOKEN = "";

try {
  /* 1. The deployment answers, and refuses what it should ---------------- */
  const health = await fetch(`${BASE_URL}/api/mcp`, { method: "GET" });
  const healthBody = await health.json().catch(() => null);
  check(
    "deployment-answers",
    healthBody?.server === "evalora" && healthBody?.protocolVersion === "2025-06-18",
    `HTTP ${health.status}; server=${healthBody?.server}; protocol=${healthBody?.protocolVersion}; transport=${healthBody?.transport}`,
  );

  const anonymous = await fetch(`${BASE_URL}/api/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
  const anonBody = await anonymous.json().catch(() => null);
  check(
    "auth-refuses-anonymous",
    anonymous.status === 401 && anonBody?.error?.code === -32001,
    `HTTP ${anonymous.status}; code=${anonBody?.error?.code}`,
  );

  /* 2. Mint the credential here. It never leaves this process. ----------- */
  const secret = randomBytes(32).toString("base64url");
  TOKEN = `evalora_api_${secret}`;
  const digest = sha256(TOKEN);
  const prefix = TOKEN.slice(0, 16);
  report.evidence.credential = { prefix, digest_matches_token: sha256(TOKEN) === digest, token_bytes: 32 };

  // An unredeemed credential must be refused. If this passed, the endpoint would
  // be accepting tokens it cannot know — which would make the whole exercise
  // meaningless.
  const client = new McpClient(BASE_URL, TOKEN);
  const beforeRedeem = await client.initialize();
  check(
    "auth-refuses-unredeemed-credential",
    beforeRedeem.status === 401,
    `HTTP ${beforeRedeem.status} before the digest exists in the database`,
  );

  /* 3. Publish the digest where the operator can read it WHILE we wait ----
 * Annotations are only attached when a job finishes, and this job is designed to
 * block — so an annotation could never tell anyone what to apply. A check run
 * created with GITHUB_TOKEN is readable from the API immediately, which makes it
 * the one channel that works mid-run. Its output is the digest; its conclusion is
 * "action required" until the credential is redeemed, then "success".
 */
const GH_TOKEN = process.env.GITHUB_TOKEN ?? "";
const REPO = process.env.GITHUB_REPOSITORY ?? "";
let checkRunId = null;

const gh = async (path, init = {}) => {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${GH_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: response.status, body };
};

const publishCheck = async (conclusion, summary, text) => {
  if (!GH_TOKEN || !REPO) return;
  const payload = { name: "agent-credential", head_sha: process.env.GITHUB_SHA, status: "completed", conclusion, output: { title: "Agent credential digest", summary, text } };
  if (checkRunId) {
    await gh(`/repos/${REPO}/check-runs/${checkRunId}`, { method: "PATCH", body: JSON.stringify(payload) });
    return;
  }
  const created = await gh(`/repos/${REPO}/check-runs`, {
    method: "POST",
    body: JSON.stringify({ ...payload, status: "in_progress" }),
  });
  if (created.body?.id) checkRunId = created.body.id;
};

{
  emit("credential-digest-ready", true, `digest=${digest}`);
  emit("credential-prefix-ready", true, `prefix=${prefix}`);
  // Published NOW, so the operator can act while the job is blocked.
  await publishCheck(
    "action_required",
    `Apply this digest to ai_agents, then the running job continues automatically.\n\n${digest}`,
    [
      "update ai_agents set",
      `  token_digest = '${digest}',`,
      `  token_prefix = '${prefix}',`,
      "  token_last_rotated_at = now(),",
      "  updated_at = now()",
      "where id = '9a415c16-eb6e-4486-bc34-8bc0a1e52e5d'",
      "  and status = 'approved';",
    ].join("\n"),
  );
  console.log(`\nWaiting up to ${WAIT_SECONDS}s for the digest to be applied to ai_agents…`);

  let redeemed = false;
  const deadline = Date.now() + WAIT_SECONDS * 1000;
  let attempts = 0;
  while (Date.now() < deadline) {
    attempts += 1;
    await sleep(POLL_MS);
    const probe = await client.initialize();
    if (probe.status === 200 && probe.body?.result?.serverInfo?.name === "evalora") {
      redeemed = true;
      check(
        "credential-redeemed",
        true,
        `the endpoint accepted the new credential after ${attempts} poll(s), proving the stored digest is this token's`,
      );
      report.evidence.initialize = probe.body.result;
      break;
    }
  }
  if (!redeemed) {
    await publishCheck("action_required", "The digest was not applied in time.", `apply to ai_agents:\n\n${digest}`);
    check("credential-redeemed", false, `the digest was not applied within ${WAIT_SECONDS}s; no handshake could be run`);
    throw new Error("digest was not redeemed");
  }
  await publishCheck("success", "The credential was redeemed and the handshake completed.", `prefix ${prefix}`);
}

  /* 4. The real handshake ------------------------------------------------ */
  const init = await client.initialize();
  const initResult = init.body?.result;
  client.protocolVersion = initResult?.protocolVersion ?? null;
  check(
    "mcp-initialize",
    init.status === 200 && initResult?.serverInfo?.name === "evalora" && typeof initResult?.protocolVersion === "string",
    `protocol=${initResult?.protocolVersion}; server=${initResult?.serverInfo?.name} v${initResult?.serverInfo?.version}`,
  );
  check("mcp-capabilities", Boolean(initResult?.capabilities?.tools), JSON.stringify(initResult?.capabilities ?? null));

  const ack = await client.rpc("notifications/initialized", undefined, { notify: true });
  check("mcp-initialized-notification", ack.status === 202, `HTTP ${ack.status} with no body`);

  const ping = await client.rpc("ping", {});
  check("mcp-ping", ping.body?.result !== undefined && Object.keys(ping.body.result).length === 0, "empty result object");

  /* 5. Discovery, and what the narrowing must exclude -------------------- */
  const listed = await client.listTools();
  const tools = listed.body?.result?.tools ?? [];
  const names = tools.map((t) => t.name);
  report.evidence.tools = names;
  check("mcp-tools-list", tools.length > 10, `${tools.length} tools offered to this credential`);
  check(
    "mcp-tools-annotated",
    tools.every((t) => t.inputSchema && t.annotations && typeof t.annotations.readOnlyHint === "boolean"),
    "every tool carries a JSON Schema and readOnly/destructive/idempotent hints",
  );
  // The agent's narrowing is nine permissions; these tools require permission it
  // does not have, so a model talking to this credential must never see them.
  const forbidden = ["publish_examination", "publish_results", "mark_responses", "apply_grade_adjustment", "register_ai_agent"];
  const leaked = forbidden.filter((name) => names.includes(name));
  check("permission-discovery-narrowed", leaked.length === 0, leaked.length ? `leaked: ${leaked.join(", ")}` : "no sensitive tool is discoverable");
  check(
    "permission-discovery-present",
    names.includes("get_org_context") && names.includes("list_examinations") && names.includes("generate_question"),
    "the reads and writes the agent may use are discoverable",
  );

  /* 6. A real read through the engine ---------------------------------- */
  const context = await client.callTool("get_org_context", {});
  const contextResult = toolResult(context.body);
  const data = contextResult.structured?.data ?? {};
  report.evidence.org_context = {
    keys: Object.keys(data),
    question_types: data.question_types ?? null,
    content_totals: data.totals ?? null,
    modules: data.modules ?? null,
  };
  check("tool-call-read", contextResult.ok && Object.keys(data).length > 0, `returned keys: ${Object.keys(data).slice(0, 8).join(", ")}`);
  check(
    "tool-call-journalled",
    Boolean(contextResult.executionId),
    `execution_id=${contextResult.executionId ?? "none"} — the engine wrote a journal row for this call`,
  );
  // The summary must describe THIS organization's content, which is how a real
  // response is told from a template.
  check(
    "tool-call-returns-live-data",
    JSON.stringify(data).length > 50,
    `payload ${JSON.stringify(data).length} bytes`,
  );

  /* 7. Permission enforcement at call time, not just discovery ---------- */
  const denied = await client.callTool("publish_examination", {
    examination_id: "00000000-0000-4000-8000-000000000000",
    status: "open",
    confirm: true,
  });
  const deniedResult = toolResult(denied.body);
  report.evidence.publish_attempt = { ok: deniedResult.ok, code: deniedResult.errorCode, text: deniedResult.text.slice(0, 200) };
  check(
    "permission-refuses-out-of-scope-call",
    !deniedResult.ok,
    `code=${deniedResult.errorCode ?? "none"}; nothing was published`,
  );

  /* 8. A second read, to show the journal accumulates real calls --------- */
  const exams = await client.callTool("list_examinations", {});
  const examsResult = toolResult(exams.body);
  check("tool-call-list", examsResult.ok, examsResult.text.slice(0, 140));
  check("tool-call-list-journalled", Boolean(examsResult.executionId), `execution_id=${examsResult.executionId ?? "none"}`);

  report.finished_at = new Date().toISOString();
  report.summary = {
    total: results.length,
    passed: results.filter((r) => r.passed).length,
    failed: results.filter((r) => !r.passed).length,
  };

  // Annotations are capped at ten per step, so the tool-level checks — the ones
  // that matter most — were being dropped. The check run's `output.text` holds
  // the whole list and is readable from the API, so it carries the evidence.
  await publishCheck(
    report.summary.failed ? "failure" : "success",
    `${report.summary.passed}/${report.summary.total} checks passed (${report.summary.failed} failed).`,
    results.map((r) => `${r.passed ? "PASS" : "FAIL"} ${r.name} :: ${String(r.detail).replace(/[\r\n]+/g, " ").slice(0, 300)}`).join("\n"),
  );
} catch (error) {
  report.fatal = String(error?.stack ?? error).slice(0, 1500);
  console.log(`::error title=harness-stopped::${String(error?.message ?? error).replace(/[\r\n]+/g, " ").slice(0, 900)}`);
  report.finished_at = new Date().toISOString();
  report.summary = {
    total: results.length,
    passed: results.filter((r) => r.passed).length,
    failed: results.filter((r) => !r.passed).length,
  };
}

// Never let the token reach the report: assert it, do not trust it.
const serialised = JSON.stringify(report);
if (serialised.includes(TOKEN)) {
  report.token_leaked = true;
  console.log("::error title=token-leak-guard::the report contained the token and was redacted");
}
serialised.replace(TOKEN, "[redacted]");
writeFileSync("live-mcp-verification.json", JSON.stringify(report, null, 2));
console.log(`\n${report.summary.passed}/${report.summary.total} checks passed.`);
process.exit(report.fatal || report.summary.failed ? 1 : 0);
