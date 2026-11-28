// LIVE AI VERIFICATION — runs inside a GitHub Actions runner.
//
// Why a runner and not the development sandbox: the sandbox has no egress to
// `evalora-edu.online` or to Supabase (`curl` returns 000), so nothing it says
// about production would be evidence. A runner has real connectivity, and it
// already holds SUPABASE_SERVICE_ROLE_KEY as a repository secret.
//
// What this proves, and how:
//   • the MCP endpoint speaks the real protocol — initialize, notifications/
//     initialized, tools/list, tools/call, over HTTPS, against the deployed app;
//   • the agent credential authenticates against the LIVE token resolver;
//   • reads and writes land in the LIVE database with the right actor recorded;
//   • permission enforcement refuses what the agent may not do;
//   • a rotation really invalidates the previous credential.
//
// Credential handling. The rotated token is generated in memory, hashed here,
// and only the digest is written to Postgres. Its SHA-256 is what this process
// keeps. It is never printed, never written to a file, and never placed in the
// artifact — a leak of the artifact would leak a working credential, which is
// exactly the mistake this run exists to correct.

import { createHash, randomBytes, randomUUID } from "node:crypto";

const SERVICE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const BASE_URL = (process.env.BASE_URL ?? "https://evalora-edu.online").replace(/\/+$/, "");
const ORG_ID = process.env.DEMO_ORG_ID ?? "de000000-0000-4000-8000-000000000001";
const AGENT_ID = process.env.AGENT_ID ?? "9a415c16-eb6e-4486-bc34-8bc0a1e52e5d";
const OAK_ORG_ID = "0a400000-0000-4000-8000-000000000001";
const REPORT_PATH = process.env.REPORT_PATH ?? "ai-live-verification.json";

// Everything below this line reports before it acts, so a job that fails still
// leaves a report explaining WHICH precondition was missing. An early
// `process.exit` would have thrown that evidence away and left only "step failed".
const PREFLIGHT = {
  has_supabase_url: Boolean(SERVICE_URL),
  has_service_role_key: Boolean(SERVICE_KEY),
  // Never the value — only whether it is present and how long it is, which is
  // enough to tell "unset" from "truncated" in a CI secret.
  service_key_length: SERVICE_KEY.length,
  supabase_host: SERVICE_URL.replace(/^https?:\/\//, ""),
  base_url: BASE_URL,
};

/* ── tiny admin client (PostgREST) ─────────────────────────────────────── */

const admin = async (path, init = {}) => {
  const response = await fetch(`${SERVICE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
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
  return { status: response.status, ok: response.ok, body };
};

const rpc = async (fn, args) => {
  const response = await fetch(`${SERVICE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: response.status, ok: response.ok, body };
};

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

/* ── results ────────────────────────────────────────────────────────────── */

const checks = [];
const record = (area, name, passed, detail = "") => {
  checks.push({ area, name, passed, detail });
  console.log(`${passed ? "  PASS" : "  FAIL"}  [${area}] ${name}${detail ? ` — ${detail}` : ""}`);
};

/* ── a real MCP client (streamable HTTP, JSON-RPC 2.0) ─────────────────── */

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
        "MCP-Protocol-Version": this.protocolVersion ?? "2025-06-18",
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

  async initialize() {
    const result = await this.rpc("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: { roots: { listChanged: false } },
      clientInfo: { name: "evalora-live-verification", version: "1.0.0" },
    });
    if (result.body?.result?.protocolVersion) this.protocolVersion = result.body.result.protocolVersion;
    return result;
  }

  listTools() {
    return this.rpc("tools/list", {});
  }

  callTool(name, args = {}) {
    return this.rpc("tools/call", { name, arguments: args });
  }
}

/* ── helpers ────────────────────────────────────────────────────────────── */

const toolResult = (body) => {
  const result = body?.result;
  if (!result) return { ok: false, error: body?.error ?? null, structured: null, text: "" };
  const structured = result.structuredContent ?? null;
  const text = (result.content ?? []).map((c) => c.text ?? "").join("\n");
  return {
    ok: result.isError !== true && structured?.ok !== false,
    errorCode: structured?.code ?? body?.error?.data?.code ?? null,
    structured,
    text,
    executionId: structured?.execution_id ?? null,
  };
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** The journal row the engine wrote for a given execution id. Read directly. */
const readExecution = async (executionId) => {
  if (!executionId) return null;
  const { body } = await admin(
    `ai_executions?id=eq.${executionId}&select=id,organization_id,actor_kind,actor_user_id,actor_email,agent_id,agent_name,surface,tool_name,risk,status,execution_created_at:created_at,request_id`,
  );
  return Array.isArray(body) ? (body[0] ?? null) : null;
};

/** Counts that must not move, captured at the start and compared at the end. */
const census = async () => {
  const [{ body: demoQ }, { body: demoE }, { body: demoZ }, { body: oakE }, { body: oakQ }] = await Promise.all([
    admin(`questions?organization_id=eq.${ORG_ID}&select=id`),
    admin(`exams?organization_id=eq.${ORG_ID}&select=id`),
    admin(`quizzes?organization_id=eq.${ORG_ID}&select=id`),
    admin(`exams?organization_id=eq.${OAK_ORG_ID}&select=id`),
    admin(`questions?organization_id=eq.${OAK_ORG_ID}&select=id`),
  ]);
  return {
    demoQuestions: Array.isArray(demoQ) ? demoQ.length : -1,
    demoExams: Array.isArray(demoE) ? demoE.length : -1,
    demoQuizzes: Array.isArray(demoZ) ? demoZ.length : -1,
    oakExams: Array.isArray(oakE) ? oakE.length : -1,
    oakQuestions: Array.isArray(oakQ) ? oakQ.length : -1,
  };
};

/* ── run ────────────────────────────────────────────────────────────────── */

const started = new Date().toISOString();
const out = { started_at: started, base_url: BASE_URL, organization_id: ORG_ID, agent_id: AGENT_ID, checks, evidence: {} };

try {
  out.evidence.preflight = PREFLIGHT;
  console.log(`Preflight: ${JSON.stringify(PREFLIGHT)}`);

  /* 0a. Can this runner actually reach production? Recorded as evidence either
        way: a verification that could not connect must say so, not quietly
        report a pass. */
  const probe = async (url) => {
    try {
      const started = Date.now();
      const response = await fetch(url, { method: "GET", redirect: "manual" });
      return { url, reachable: true, status: response.status, ms: Date.now() - started };
    } catch (error) {
      return { url, reachable: false, error: String(error?.cause?.code ?? error?.message ?? error).slice(0, 160) };
    }
  };
  const appProbe = await probe(`${BASE_URL}/api/mcp`);
  const apiProbe = await probe(`${SERVICE_URL}/rest/v1/`);
  out.evidence.connectivity = { app: appProbe, supabase: apiProbe };
  record("connectivity", "the runner can reach the deployed application", appProbe.reachable, `${appProbe.status ?? appProbe.error} (${appProbe.ms ?? "-"}ms)`);
  record("connectivity", "the runner can reach the production database API", apiProbe.reachable, `${apiProbe.status ?? apiProbe.error}`);

  if (!SERVICE_URL || !SERVICE_KEY) {
    record("preflight", "the Supabase credentials are present in the job", false,
      `url=${PREFLIGHT.has_supabase_url} key=${PREFLIGHT.has_service_role_key} len=${PREFLIGHT.service_key_length}`);
    throw new Error("Supabase credentials are not available to the runner, so no database assertion can be made.");
  }
  record("preflight", "the Supabase credentials are present in the job", true, `key length ${PREFLIGHT.service_key_length}`);

  /* 0. Baseline census, so every count later is a delta against a measurement
        rather than against a number copied into a document. */
  const before = await census();
  out.evidence.census_before = before;
  if (before.demoQuestions < 0) throw new Error("The census could not be read; stopping before any write.");
  console.log(`Baseline: ${JSON.stringify(before)}`);

  /* 1. THE DEPLOYED APP IS ALIVE AND IS THE RIGHT BUILD ------------------- */
  const health = await fetch(`${BASE_URL}/api/mcp`, { method: "GET" });
  const healthBody = await health.json().catch(() => null);
  record(
    "deployment",
    "the deployed MCP endpoint answers and identifies itself",
    healthBody?.server === "evalora" && healthBody?.protocolVersion === "2025-06-18",
    `${health.status} ${healthBody?.server ?? "?"} protocol ${healthBody?.protocolVersion ?? "?"}`,
  );

  /* 2. ROTATE THE CREDENTIAL ------------------------------------------- */
  const { body: agentRows } = await admin(`ai_agents?id=eq.${AGENT_ID}&select=*`);
  const agent = Array.isArray(agentRows) ? agentRows[0] : null;
  if (!agent) throw new Error("The agent row could not be read; cannot rotate.");
  const oldDigest = agent.token_digest;
  const oldPrefix = agent.token_prefix;
  record("credential", "the previous credential is identified", Boolean(oldDigest && oldPrefix), `prefix ${oldPrefix}`);

  // A new secret and a new client-appropriate prefix. `api` because the agent row
  // is an API client and the same bearer works on every surface.
  const secret = randomBytes(32).toString("base64url");
  const NEW_TOKEN = `evalora_api_${secret}`;
  const newDigest = sha256(NEW_TOKEN);
  const newPrefix = NEW_TOKEN.slice(0, 16);

  const { status: rotateStatus } = await admin(`ai_agents?id=eq.${AGENT_ID}`, {
    method: "PATCH",
    body: JSON.stringify({
      token_digest: newDigest,
      token_prefix: newPrefix,
      token_last_rotated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
  });
  record("credential", "the credential is rotated in place (same agent, new secret)", rotateStatus === 200 || rotateStatus === 204, `HTTP ${rotateStatus}`);

  const { body: rotatedRows } = await admin(`ai_agents?id=eq.${AGENT_ID}&select=id,status,client,token_prefix,token_digest,organization_id,owner_id,allowed_permissions`);
  const rotated = Array.isArray(rotatedRows) ? rotatedRows[0] : null;
  record(
    "credential",
    "the stored digest is the new one and the old one is gone",
    rotated?.token_digest === newDigest && rotated?.token_digest !== oldDigest,
    rotated ? `prefix ${rotated.token_prefix}` : "row unreadable",
  );
  record("credential", "the agent identity, client and status are unchanged by the rotation",
    rotated?.id === AGENT_ID && rotated?.status === "approved" && rotated?.client === "api" && rotated?.organization_id === ORG_ID);

  // The resolver is the authority, not the column: ask it about both digests.
  const { body: oldResolve } = await rpc("ai_resolve_agent", { p_token_digest: oldDigest });
  const { body: newResolve } = await rpc("ai_resolve_agent", { p_token_digest: newDigest });
  const oldRows = Array.isArray(oldResolve) ? oldResolve : [];
  const newRows = Array.isArray(newResolve) ? newResolve : [];
  record("credential", "the previous digest no longer resolves to any agent", oldRows.length === 0, `${oldRows.length} row(s)`);
  record("credential", "the new digest resolves to this agent", newRows.length === 1 && newRows[0]?.agent_id === AGENT_ID);
  out.evidence.resolver = {
    old_digest_resolves: oldRows.length,
    new_digest_resolves: newRows.length,
    new_agent_id: newRows[0]?.agent_id ?? null,
  };

  /* 3. MCP HANDSHAKE WITH THE NEW CREDENTIAL ---------------------------- */
  const mcp = new McpClient(BASE_URL, NEW_TOKEN);
  const init = await mcp.initialize();
  const initResult = init.body?.result;
  record(
    "mcp",
    "initialize completes against the deployed server",
    init.status === 200 && initResult?.serverInfo?.name === "evalora" && typeof initResult?.protocolVersion === "string",
    `${init.status} ${initResult?.serverInfo?.name ?? "?"} v${initResult?.serverInfo?.version ?? "?"} protocol ${initResult?.protocolVersion ?? "?"}`,
  );
  record("mcp", "the server advertises the tools capability", Boolean(initResult?.capabilities?.tools), JSON.stringify(initResult?.capabilities ?? null));
  out.evidence.initialize = {
    protocolVersion: initResult?.protocolVersion ?? null,
    serverInfo: initResult?.serverInfo ?? null,
    capabilities: initResult?.capabilities ?? null,
  };

  const ack = await mcp.rpc("notifications/initialized", undefined, { notify: true });
  record("mcp", "the initialized notification is accepted (202, no body)", ack.status === 202, `HTTP ${ack.status}`);

  const ping = await mcp.rpc("ping", {});
  record("mcp", "ping answers with an empty result", ping.body?.result !== undefined && Object.keys(ping.body.result).length === 0);

  const listed = await mcp.listTools();
  const tools = listed.body?.result?.tools ?? [];
  const toolNames = tools.map((t) => t.name);
  out.evidence.tools = toolNames;
  record("mcp", "tools/list returns the shared registry", tools.length > 10, `${tools.length} tools`);
  record("mcp", "each tool carries a JSON Schema and MCP annotations",
    tools.every((t) => t.inputSchema && t.annotations && typeof t.annotations.readOnlyHint === "boolean"));
  record("mcp", "a tool the agent may not use is absent from discovery",
    !toolNames.includes("publish_examination") && !toolNames.includes("publish_results") && !toolNames.includes("mark_responses"),
    `publish_examination=${toolNames.includes("publish_examination")}`);
  record("mcp", "a read the agent may use is present", toolNames.includes("get_org_context") && toolNames.includes("list_examinations"));

  // An unauthenticated and a wrong-token call must both be refused.
  const anonymous = await fetch(`${BASE_URL}/api/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
  record("mcp", "an unauthenticated call is refused", anonymous.status === 401, `HTTP ${anonymous.status}`);

  const bogus = new McpClient(BASE_URL, `evalora_api_${randomBytes(32).toString("base64url")}`);
  const bogusInit = await bogus.initialize();
  record("mcp", "a syntactically valid but unknown token is refused", bogusInit.status === 401, `HTTP ${bogusInit.status}`);

  /* 4. A REAL READ THROUGH MCP ----------------------------------------- */
  const context = await mcp.callTool("get_org_context", {});
  const contextResult = toolResult(context.body);
  const contextData = contextResult.structured?.data ?? {};
  record("mcp", "get_org_context runs through the engine and returns live data",
    contextResult.ok && Boolean(contextData), `ok=${contextResult.ok}`);
  record("mcp", "the response is from this organization, not another tenant",
    JSON.stringify(contextData).length > 0 && !JSON.stringify(contextData).includes(OAK_ORG_ID),
    `keys: ${Object.keys(contextData).slice(0, 8).join(", ")}`);
  out.evidence.org_context = {
    keys: Object.keys(contextData),
    question_types: contextData.question_types ?? null,
    modules: contextData.modules ?? null,
    totals: contextData.totals ?? null,
    plan_limits: contextData.plan_limits ?? null,
  };

  // The journal row is written by the engine, during the call above.
  const readExecutionRow = await readExecution(contextResult.executionId);
  await sleep(500);
  const { body: journalRows } = await admin(
    `ai_executions?agent_id=eq.${AGENT_ID}&tool_name=eq.get_org_context&order=created_at.desc&limit=1&select=*`,
  );
  const journal = Array.isArray(journalRows) ? journalRows[0] : null;
  out.evidence.journal_get_org_context = journal
    ? {
        id: journal.id,
        actor_kind: journal.actor_kind,
        agent_id: journal.agent_id,
        agent_name: journal.agent_name,
        attributed_user_id: journal.attributed_user_id,
        organization_id: journal.organization_id,
        surface: journal.surface,
        tool_name: journal.tool_name,
        status: journal.status,
        created_at: journal.created_at,
        has_arguments_digest: Boolean(journal.arguments_digest),
      }
    : null;

  record("journal", "the call is recorded by the application, not inserted by hand",
    Boolean(journal) && journal.surface === "mcp",
    journal ? `surface=${journal.surface} status=${journal.status}` : "no row");
  record("journal", "the actor is the agent, attributed to the human who owns it",
    journal?.actor_kind === "agent" && journal?.agent_id === AGENT_ID && journal?.attributed_user_id === agent.owner_id);
  record("journal", "the organization and tool on the row are the ones exercised",
    journal?.organization_id === ORG_ID && journal?.tool_name === "get_org_context");
  record("journal", "the row holds a digest of the arguments, never raw content",
    Boolean(journal?.arguments_digest) && journal.arguments_digest.length === 64);
  record("journal", "the execution id returned to the client is the row it wrote",
    Boolean(contextResult.executionId) && readExecutionRow?.id === contextResult.executionId,
    `client=${contextResult.executionId ?? "none"} row=${readExecutionRow?.id ?? "none"}`);

  /* 5. PERMISSION ENFORCEMENT: a sensitive tool must not run ------------ */
  const publishAttempt = await mcp.callTool("publish_examination", {
    examination_id: "00000000-0000-4000-8000-000000000000",
    status: "open",
    confirm: true,
  });
  const publishResult = toolResult(publishAttempt.body);
  record("permission", "a tool outside the agent's narrowing is refused through MCP",
    !publishResult.ok, `code=${publishResult.errorCode ?? publishAttempt.body?.error?.code ?? "none"}`);
  out.evidence.publish_attempt = {
    ok: publishResult.ok,
    code: publishResult.errorCode ?? publishAttempt.body?.error?.code ?? null,
    text: publishResult.text.slice(0, 300),
  };

  /* 6. READ PATH: list_examinations over MCP --------------------------- */
  const exams = await mcp.callTool("list_examinations", {});
  const examsResult = toolResult(exams.body);
  record("mcp", "list_examinations returns this organization's examinations", examsResult.ok);

  /* 7. NATIVE ASSISTANT SURFACE (REST, same engine, human session) ------ */
  // The REST surface authenticates the same bearer but establishes the OWNER's
  // session, which is the path the browser assistant also uses.
  const restRead = await fetch(`${BASE_URL}/api/ai/v1/tools/get_org_context`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${NEW_TOKEN}` },
    body: JSON.stringify({}),
  });
  const restReadBody = await restRead.json().catch(() => null);
  record("rest", "the REST surface runs the same tool with the same credential",
    restRead.status === 200 && restReadBody?.ok === true && typeof restReadBody?.execution_id === "string",
    `HTTP ${restRead.status} tool=${restReadBody?.tool ?? "?"}`);
  // The REST call is its own execution; it must be journaled with surface "api".
  const restJournal = await readExecution(restReadBody?.execution_id ?? null);
  record("rest", "the REST call is journaled with the api surface and the same agent",
    restJournal?.surface === "api" && restJournal?.agent_id === AGENT_ID,
    `surface=${restJournal?.surface ?? "none"}`);
  out.evidence.rest_get_org_context = {
    status: restRead.status,
    ok: restReadBody?.ok ?? null,
    tool: restReadBody?.tool ?? null,
    execution_id: restReadBody?.execution_id ?? null,
  };

  /* 8. WRITE THROUGH THE SAME PIPELINE: a real question ---------------- */
  // Exercised through MCP so the journal, the actor and the service all come from
  // the production code path.
  const marker = `LV-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "")}`;
  const createQ = await mcp.callTool("generate_question", {
    topic: "fractions_percentages",
    difficulty: "medium",
    grade_label: "Grade 8",
    count: 2,
    save: true,
  });
  const createQResult = toolResult(createQ.body);
  record("write", "generate_question authors and saves questions through MCP", createQResult.ok, createQResult.text.slice(0, 160));
  out.evidence.generate_question = { ok: createQResult.ok, code: createQResult.errorCode ?? null, text: createQResult.text.slice(0, 400), structured: createQResult.structured };

  const afterQuestions = await census();
  record("write", "the questions really are in the database",
    afterQuestions.demoQuestions === before.demoQuestions + 2,
    `${before.demoQuestions} -> ${afterQuestions.demoQuestions}`);
  const createdQuestionRows = await (async () => {
    const { body } = await admin(
      `questions?organization_id=eq.${ORG_ID}&creation_method=eq.ai_generated&order=created_at.desc&limit=2&select=id,prompt,type,difficulty,topic,points,status,creation_method,explanation,config`,
    );
    return Array.isArray(body) ? body : [];
  })();
  const createdIds = createdQuestionRows.map((q) => q.id);
  const { body: createdOptionRows } = createdIds.length
    ? await admin(`question_options?question_id=in.(${createdIds.join(",")})&select=question_id,label,is_correct,position&order=position`)
    : { body: [] };
  out.evidence.created_questions = createdQuestionRows.map((q) => ({
    ...q,
    options: (Array.isArray(createdOptionRows) ? createdOptionRows : []).filter((o) => o.question_id === q.id),
  }));
  record(
    "write",
    "the saved questions carry valid metadata in the real table",
    createdQuestionRows.length === 2 &&
      createdQuestionRows.every(
        (q) =>
          q.creation_method === "ai_generated" &&
          typeof q.prompt === "string" &&
          q.prompt.length > 5 &&
          Number(q.points) >= 1 &&
          ["easy", "medium", "hard"].includes(String(q.difficulty)),
      ),
    `${createdQuestionRows.length} row(s); method=${createdQuestionRows.map((q) => q.creation_method).join(",")}; points=${createdQuestionRows.map((q) => q.points).join(",")}`,
  );

  /* 9. IDEMPOTENCY: the same request id must not author a second batch - */
  const requestId = randomUUID();
  const idempotentArgs = { topic: "algebraic_expressions", difficulty: "easy", grade_label: "Grade 9", count: 1, save: true };
  const callWithId = () =>
    fetch(`${BASE_URL}/api/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${NEW_TOKEN}`,
        "x-request-id": requestId,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 99, method: "tools/call", params: { name: "generate_question", arguments: idempotentArgs } }),
    }).then((r) => r.json()).catch(() => null);

  const firstCall = await callWithId();
  const firstStructured = firstCall?.result?.structuredContent ?? null;
  const secondCall = await callWithId();
  const secondStructured = secondCall?.result?.structuredContent ?? null;
  await sleep(500);
  const afterIdempotency = await census();
  out.evidence.idempotency = {
    first: { execution_id: firstStructured?.execution_id ?? null, ok: firstStructured?.ok ?? null },
    second: { execution_id: secondStructured?.execution_id ?? null, ok: secondStructured?.ok ?? null },
    questions_delta: afterIdempotency.demoQuestions - afterQuestions.demoQuestions,
  };
  record("idempotency", "a retried request with the same request id does not author a second batch",
    afterIdempotency.demoQuestions === afterQuestions.demoQuestions + 1,
    `${afterQuestions.demoQuestions} -> ${afterIdempotency.demoQuestions} (expected +1)`);

  /* 10. QUIZ THROUGH THE SAME PIPELINE -------------------------------- */
  const quizTitle = `LV Fractions Quiz ${marker}`;
  const createZ = await mcp.callTool("create_quiz", {
    title: quizTitle,
    grade_label: "Grade 8",
    duration_minutes: 20,
    options_per_question: 4,
    generate: { question_count: 6, topics: ["fractions_percentages"] },
  });
  const createZResult = toolResult(createZ.body);
  out.evidence.create_quiz = { ok: createZResult.ok, code: createZResult.errorCode ?? null, text: createZResult.text.slice(0, 300), structured: createZResult.structured };
  record("quiz", "create_quiz builds and saves a quiz through the same pipeline", createZResult.ok, createZResult.text.slice(0, 160));

  const quizId = createZResult.structured?.data?.quiz_id ?? null;
  if (quizId) {
    const { body: quizRows } = await admin(
      `quizzes?id=eq.${quizId}&select=id,title,status,settings,organization_id`,
    );
    const quiz = Array.isArray(quizRows) ? quizRows[0] : null;
    const { body: quizQs } = await admin(`quiz_questions?quiz_id=eq.${quizId}&select=question_id,position&order=position`);
    const links = Array.isArray(quizQs) ? quizQs : [];
    const ids = links.map((l) => l.question_id);
    const { body: questionRows } = ids.length
      ? await admin(`questions?id=in.(${ids.join(",")})&select=id,type,prompt,explanation,topic`)
      : { body: [] };
    const { body: optionRows } = ids.length
      ? await admin(`question_options?question_id=in.(${ids.join(",")})&select=question_id,label,is_correct,position&order=position`)
      : { body: [] };
    // Options live in their own table; a question row has no `options` column.
    const byQuestion = new Map();
    for (const option of Array.isArray(optionRows) ? optionRows : []) {
      const list = byQuestion.get(option.question_id) ?? [];
      list.push(option);
      byQuestion.set(option.question_id, list);
    }
    const questions = (Array.isArray(questionRows) ? questionRows : []).map((q) => ({
      ...q,
      options: byQuestion.get(q.id) ?? [],
    }));
    const withFour = questions.filter((q) => q.options.length === 4).length;
    const withOneKey = questions.filter((q) => q.options.filter((o) => o.is_correct).length === 1).length;
    const perQuestion = quiz?.settings?.time_per_question_seconds ?? null;
    out.evidence.quiz = {
      id: quizId,
      title: quiz?.title ?? null,
      status: quiz?.status ?? null,
      organization_id: quiz?.organization_id ?? null,
      question_count: questions.length,
      settings: quiz?.settings ?? null,
      four_option_items: withFour,
      single_key_items: withOneKey,
      prompts: questions.map((q) => q.prompt).slice(0, 3),
    };
    record("quiz", "the quiz is persisted in this organization as a draft",
      quiz?.organization_id === ORG_ID && quiz?.status === "draft");
    record("quiz", "it holds the number of questions requested", questions.length === 6, `${questions.length}/6`);
    record("quiz", "every item has four options and exactly one key",
      withFour === questions.length && withOneKey === questions.length,
      `${withFour} four-option, ${withOneKey} single-key of ${questions.length}`);
    record("quiz", "the duration is the one asked for (20 minutes over 6 questions = 200 s each)",
      perQuestion === 200, `time_per_question_seconds=${perQuestion}`);
    record("quiz", "the questions are about fractions, not the grade default",
      questions.every((q) => /fraction|simplest|\\dfrac/i.test(q.prompt)),
      questions.map((q) => q.prompt.slice(0, 40)).join(" | ").slice(0, 200));
  } else {
    record("quiz", "the quiz id was returned so the object could be inspected", false, "no quiz_id");
  }

  /* 11. MODIFICATION: update an existing examination, no duplicate ----- */
  const { body: draftExams } = await admin(
    `exams?organization_id=eq.${ORG_ID}&status=eq.draft&order=created_at.asc&select=id,title,status,duration_minutes`,
  );
  const target = Array.isArray(draftExams) ? draftExams[0] : null;
  if (!target) {
    record("modify", "a draft examination exists to modify", false, "none in this organization");
  } else {
    const newDuration = target.duration_minutes === 35 ? 40 : 35;
    const examsBefore = afterIdempotency.demoExams;
    const update = await mcp.callTool("update_examination", { examination_id: target.id, duration_minutes: newDuration });
    const updateResult = toolResult(update.body);
    const afterUpdate = await census();
    const { body: updatedRows } = await admin(`exams?id=eq.${target.id}&select=id,title,duration_minutes,status`);
    const updated = Array.isArray(updatedRows) ? updatedRows[0] : null;
    out.evidence.modify = {
      examination_id: target.id,
      before: { duration_minutes: target.duration_minutes, exams: examsBefore },
      after: { duration_minutes: updated?.duration_minutes ?? null, exams: afterUpdate.demoExams },
      call: { ok: updateResult.ok, code: updateResult.errorCode ?? null, text: updateResult.text.slice(0, 200) },
    };
    record("modify", "the described examination is identified and updated", updateResult.ok, updateResult.text.slice(0, 140));
    record("modify", "the change persists in the database", updated?.duration_minutes === newDuration,
      `${target.duration_minutes} -> ${updated?.duration_minutes}`);
    record("modify", "no duplicate examination is created", afterUpdate.demoExams === examsBefore,
      `${examsBefore} -> ${afterUpdate.demoExams}`);
  }

  /* 12. FINAL: Oak untouched ------------------------------------------- */
  const after = await census();
  out.evidence.census_after = after;
  record("isolation", "Oak examinations are unchanged", after.oakExams === before.oakExams, `${before.oakExams} -> ${after.oakExams}`);
  record("isolation", "Oak questions are unchanged", after.oakQuestions === before.oakQuestions, `${before.oakQuestions} -> ${after.oakQuestions}`);

  /* 13. Credentials were never written anywhere ------------------------ */
  const dump = JSON.stringify(out);
  record("credential", "no raw token appears anywhere in this report", !dump.includes(NEW_TOKEN) && !dump.includes(secret));

  out.finished_at = new Date().toISOString();
  out.summary = {
    total: checks.length,
    passed: checks.filter((c) => c.passed).length,
    failed: checks.filter((c) => !c.passed).length,
    by_area: checks.reduce((acc, c) => {
      acc[c.area] = acc[c.area] ?? { passed: 0, failed: 0 };
      acc[c.area][c.passed ? "passed" : "failed"] += 1;
      return acc;
    }, {}),
  };
} catch (error) {
  out.fatal = String(error?.stack ?? error).slice(0, 2000);
  console.error("FATAL:", out.fatal);
  out.finished_at = new Date().toISOString();
  out.summary = {
    total: checks.length,
    passed: checks.filter((c) => c.passed).length,
    failed: checks.filter((c) => !c.passed).length,
  };
}

await import("node:fs").then((fs) => fs.writeFileSync(REPORT_PATH, JSON.stringify(out, null, 2)));
const failed = checks.filter((c) => !c.passed);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed.`);
if (out.fatal) console.log(`Fatal: ${out.fatal.split("\n")[0]}`);
process.exit(out.fatal || failed.length ? 1 : 0);
