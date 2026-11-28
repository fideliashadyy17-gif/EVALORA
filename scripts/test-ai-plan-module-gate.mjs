/**
 * The `ai_assistant` module must gate EVERY surface, not just the dashboard.
 *
 * Institution-tier module: a plan that excludes it must refuse the AI dashboard
 * AND `/api/ai/v1` AND `/api/mcp`. The failure this guards against is a second,
 * weaker door — the plan gate applied to the page while the API silently served
 * tools to an organization that does not have the module.
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => readFileSync(path.join(root, p), "utf8");
let checks = 0;
const check = (ok, label) => {
  checks += 1;
  assert.ok(ok, label);
  console.log(`  ✓ ${label}`);
};

const authz = read("src/lib/ai/authz.ts");
const restTools = read("src/app/api/ai/v1/tools/[name]/route.ts");
const restToolsList = read("src/app/api/ai/v1/tools/route.ts");
const mcp = read("src/app/api/mcp/route.ts");
const dashboard = read("src/app/dashboard/ai/page.tsx");

/* 1. The gate exists and asks the platform the same question the page asks. */
check(/export async function aiModuleRefusal/.test(authz), "authz exposes a plan-module refusal");
check(
  /moduleEnabled\(entitlement\.modules, "ai_assistant"\)/.test(authz),
  "the refusal tests the same `ai_assistant` key the dashboard does",
);
check(
  /status: 403/.test(authz) && /module_unavailable/.test(authz),
  "an excluded plan receives a 403 naming the missing module, not a generic error",
);
check(
  /catch \{\s*enabled = false;\s*\}/.test(authz.replace(/\n\s*/g, " ")) ||
    /catch \{[\s\S]{0,80}enabled = false;[\s\S]{0,40}\}/.test(authz),
  "an entitlement lookup that fails denies rather than allows",
);

/* 2. Every executable surface consults it. */
check(/aiModuleRefusal\(auth\)/.test(restTools), "/api/ai/v1/tools/<name> is gated");
check(/aiModuleRefusal\(auth\)/.test(mcp), "/api/mcp is gated");

/* 3. The gate runs BEFORE the tool executes on both surfaces. */
const gateBeforeEngine = (src) => {
  const gate = src.indexOf("aiModuleRefusal(auth)");
  const exec = src.indexOf("executeTool(");
  return gate !== -1 && exec !== -1 && gate < exec;
};
check(gateBeforeEngine(restTools), "REST refuses before the executor is reached");
check(gateBeforeEngine(mcp), "MCP refuses before the executor is reached");

/* 4. The dashboard keeps its own gate, so the two cannot drift apart. */
check(/requireModule\(entitlement, "ai_assistant"/.test(dashboard), "the dashboard still redirects without the module");

/* 5. Tool discovery is gated too: listing tools is a capability, not a public
 *    index. (`/api/ai/v1/tools` resolves the credential and then filters by it.) */
check(
  /authenticateAgent\(/.test(restToolsList) && !/export async function GET\(\)[^}]{0,200}TOOLS/.test(restToolsList),
  "tool discovery requires a credential",
);
check(existsSync(path.join(root, "src/app/api/mcp/route.ts")), "the MCP endpoint exists and is gated above");

console.log(`\nAI plan-module gate: ${checks} checks passed.`);
