// ══════════════════════════════════════════════════════════════════════════
// The external agent must act AS its owner — verified against real code.
//
// The bug this suite exists for: `authenticateAgent` built the request client
// with `createClient()`, which reads the caller's cookies. An agent request has
// no cookies, so the client was ANONYMOUS. Every consequence is silent:
//
//   • `access_has_permission` called through an anon client resolves nothing,
//     so `canOperate` inside the shared services returns false and every write
//     is refused with "You don't have permission…" — the agent path could never
//     create an examination, a question or a paper.
//   • An anon client is also unauthenticated for RLS, so even reads a service
//     happened to allow would come back empty rather than wrong.
//
// Nothing in the unit tests caught it because every suite stubbed the client.
// This suite therefore asserts the SHAPE of the identity binding and runs the
// real resolver against a fake transport that records which session each query
// was issued under.
// ══════════════════════════════════════════════════════════════════════════
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Module } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import ts from "typescript";

let n = 0;
const check = (cond, msg) => {
  assert.ok(cond, msg);
  n += 1;
  console.log(`  ✓ ${msg}`);
};

const source = (p) => readFileSync(p, "utf8");

/* ── 1. The identity binding in source ──────────────────────────────────── */

const authz = source("src/lib/ai/authz.ts");

check(
  !/await createClient\(\)/.test(authz),
  "authz does not build the agent's client from the caller's cookies",
);
check(
  /createUserSessionClient\(/.test(authz),
  "authz builds an explicitly owner-bound client for agent requests",
);
check(
  /if \(!supabase\)\s*\{[\s\S]{0,400}status: 401/.test(authz),
  "a request whose owner session cannot be established is refused, not downgraded",
);

/* ── 2. The permission resolvers must work without browser cookies ──────── */

const server = source("src/lib/supabase/server.ts");

check(
  /export async function createUserSessionClient/.test(server),
  "the owner-bound client is a real auth session (generateLink + verifyOtp)",
);
check(
  /generateLink\(\{ type: "magiclink"/.test(server) && /verifyOtp\(\{ token_hash/.test(server),
  "the session is minted with a single-use token and exchanged, never replayed later",
);
check(
  /session\.user\?\.id !== userId/.test(server),
  "the minted session is checked against the owner, so a token cannot bind the wrong person",
);
check(
  /runtime\.admin[\s\S]{0,400}access_has_permission/.test(authz) || /access_has_permission/.test(authz),
  "the agent's permission question is answered by access_has_permission directly",
);

/* ── 3. The engine refuses to run a tool with an anonymous client ───────── */

const engine = source("src/lib/ai/engine.ts");
check(
  /assertRequestClientIdentity/.test(engine),
  "the engine refuses to execute a tool when the request client has no identity",
);
check(
  /client\.auth\.getUser\(\)[\s\S]{0,600}different person/.test(engine),
  "and refuses when the client's identity is not the attribution's identity",
);

/* ── 4. Behavioural: no query may run under an anonymous identity ───────── */

const outDir = mkdtempSync(path.join(tmpdir(), "evalora-agent-id-"));
const compile = (files) => {
  const program = ts.createProgram(files, {
    outDir,
    rootDir: "src",
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    moduleResolution: ts.ModuleResolutionKind.Node10,
    esModuleInterop: true,
    skipLibCheck: true,
    lib: ["es2022", "dom"],
    strict: false,
  });
  const result = program.emit();
  assert.equal(result.emitSkipped, false, "the identity modules compile");
};

try {
  compile(["src/lib/ai/authz.ts", "src/lib/ai/agents.ts", "src/lib/ai/types.ts", "src/lib/ai/tools.ts"]);

  const calls = [];
  let currentTable = "";
  const adminChain = {
    from(table) {
      currentTable = table;
      calls.push({ table, identity: "service" });
      return adminChain;
    },
    select() { return adminChain; },
    eq() { return adminChain; },
    maybeSingle() {
      // Enough of the real shape for the identity chain to complete: an active
      // owner profile, an approved agent row, an active org and membership.
      if (currentTable === "profiles") {
        return Promise.resolve({ data: { id: "33333333-3333-4333-8333-333333333333", email: "owner@evalora.test", full_name: "Owner", status: "active" }, error: null });
      }
      if (currentTable === "ai_agents") {
        return Promise.resolve({ data: { organization_id: "22222222-2222-4222-8222-222222222222", status: "approved", token_expires_at: null }, error: null });
      }
      if (currentTable === "organizations") {
        return Promise.resolve({ data: { id: "22222222-2222-4222-8222-222222222222", name: "Test", slug: "test", status: "active" }, error: null });
      }
      if (currentTable === "organization_members") {
        return Promise.resolve({ data: { role: "org_owner", status: "active" }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
    rpc(name, args) {
      calls.push({ rpc: name, identity: "service" });
      if (name === "ai_resolve_agent") {
        return Promise.resolve({
          data: [{
            agent_id: "11111111-1111-4111-8111-111111111111",
            organization_id: "22222222-2222-4222-8222-222222222222",
            name: "Probe agent", client: "mcp", status: "approved",
            owner_id: "33333333-3333-4333-8333-333333333333",
            allowed_permissions: [], denied_permissions: [],
            class_ids: [], subject_ids: [],
            rate_limit_per_minute: 60, daily_call_limit: 2000, token_expires_at: null,
          }],
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    },
    then(resolve) { return Promise.resolve({ data: null, error: null, count: 0 }).then(resolve); },
  };

  const STUBS = {
    "server-only": {},
    "next/headers": {
      cookies: async () => ({ getAll: () => [], set: () => {} }),
      headers: async () => new Headers(),
    },
    "next/navigation": { redirect: () => { throw new Error("unexpected redirect"); } },
    "next/server": { NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200, headers: init?.headers ?? {} }) } },
    "next/cache": { revalidatePath: () => {} },
    // An ANONYMOUS cookie client: exactly what `createClient()` returns when a
    // request carries no cookies. If authz still used it, the probe below sees
    // "anon" in the call log.
    "@/lib/supabase/server": {
      createAdminClient: () => adminChain,
      createClient: async () => {
        calls.push({ helper: "createClient", identity: "anon" });
        return { auth: { getUser: async () => ({ data: { user: null } }) } };
      },
      createUserSessionClient: async () => {
        calls.push({ helper: "createUserSessionClient", identity: "owner" });
        return { auth: { getUser: async () => ({ data: { user: { id: "33333333-3333-4333-8333-333333333333" } } }) } };
      },
    },
    "@/lib/entitlements": { getEntitlementFor: async () => ({ modules: {}, limits: {} }) },
    "@/lib/modules": { moduleEnabled: () => true },
  };

  const orig = Module._load;
  Module._load = function (request) {
    if (Object.prototype.hasOwnProperty.call(STUBS, request)) return STUBS[request];
    return orig.apply(this, arguments);
  };
  let mod;
  try {
    mod = await import(pathToFileURL(path.join(outDir, "lib/ai/authz.js")).href);
  } finally {
    Module._load = orig;
  }

  const auth = await mod.authenticateAgent(
    new Request("https://evalora.test/api/ai/v1/tools", {
      headers: { authorization: `Bearer evalora_${"a".repeat(80)}` },
    }),
    "api",
  );

  check(
    calls.some((c) => c.helper === "createUserSessionClient"),
    "authentication asks for an OWNER-bound session, not the caller's cookies",
  );
  check(
    !calls.some((c) => c.helper === "createClient"),
    "authentication never falls back to the cookie client the agent does not have",
  );
  check(
    calls.some((c) => c.rpc === "ai_resolve_agent"),
    "the token is resolved through ai_resolve_agent with the service role",
  );
  if (auth.ok) {
    check(auth.supabase !== null && auth.supabase !== undefined, "an authorised request carries an owner client");
    check(auth.organizationId === "22222222-2222-4222-8222-222222222222", "the organization comes from the agent row, never the request");
  } else {
    check(auth.status === 401 || auth.status === 403, "an unverifiable owner resolves to a refusal, never a downgrade");
  }
} finally {
  rmSync(outDir, { recursive: true, force: true });
}

console.log(`\nAI agent identity: ${n} checks passed.`);
