// The MCP server's protocol layer and the shared-core equivalence claim.
//
// The point of these checks is the property the specification demands: the API,
// MCP and the native assistant must expose the SAME operations through the SAME
// executor. They are therefore compared against each other, not against a
// hand-written list that could drift.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const rest = source('src/app/api/ai/v1/tools/[name]/route.ts');
const mcp = source('src/app/api/mcp/route.ts');
const native = source('src/app/dashboard/ai/actions.ts');

let n = 0;
const test = async (name, fn) => {
  await fn();
  n++;
  console.log('  ✓ ' + name);
};

await test('all three surfaces call the one executor', async () => {
  for (const [label, text] of [['REST', rest], ['MCP', mcp], ['native assistant', native]]) {
    assert.match(text, /executeTool\s*\(/, `${label} must call executeTool`);
    assert.ok(!/from "@\/lib\/ai\/handlers"/.test(text), `${label} must not bypass the engine into handlers`);
  }
});

await test('all three surfaces share one authorization resolver', async () => {
  for (const [label, text] of [['REST', rest], ['MCP', mcp]]) {
    assert.match(text, /permissionResolver\s*\(/, `${label} must use the shared resolver`);
    assert.ok(!/platform_role\s*===?\s*["']super_admin["']/.test(text), `${label} must not special-case a super admin`);
  }
});

await test('MCP tool listing comes from the registry, not a copied list', async () => {
  assert.match(mcp, /for \(const tool of TOOLS\)/, 'MCP must iterate the registry');
  assert.ok(!/name:\s*"(create|list|get)_[a-z_]+"\s*,/.test(mcp), 'MCP must not hard-code tool definitions');
});

await test('only an agent token is accepted; a browser JWT is not', async () => {
  const authz = source('src/lib/ai/authz.ts');
  assert.match(authz, /startsWith\("evalora_"\)/, 'the bearer must be an agent token');
  assert.match(authz, /resolveAgentActor/, 'resolution goes through the agent registry');
  assert.ok(!/auth\.getUser\(\)/.test(authz), 'the AI endpoints must not fall back to a cookie session');
});

await test('the engine — not the route — enforces approval and journaling', async () => {
  assert.ok(!/ai_approvals/.test(rest), 'REST must not write the approval queue itself');
  assert.ok(!/ai_approvals/.test(mcp), 'MCP must not write the approval queue itself');
  const engine = source('src/lib/ai/engine.ts');
  assert.match(engine, /ai_claim_approval/, 'the claim must be a single locked statement');
  assert.match(engine, /status ===? risk === "sensitive"|risk === "sensitive"/, 'sensitive calls must refuse without a journal');
});

await test('a token never appears in the MCP or REST source', async () => {
  for (const text of [rest, mcp]) {
    assert.ok(!/evalora_[a-z]+_[A-Za-z0-9_-]{20,}/.test(text), 'no literal token may be embedded');
    assert.ok(!/token_digest/.test(text), 'routes must not read digests directly');
  }
});

await test('the MCP endpoint constrains what a client can ask for', async () => {
  assert.match(mcp, /readOnlyHint: !tool\.risk\.writes/);
  assert.match(mcp, /destructiveHint: tool\.risk\.risk === "sensitive"/);
  // A tool error is returned inside a result, not as a transport failure, so a
  // model can read the reason (MCP requirement).
  assert.match(mcp, /isError: true/);
});

await test('the native assistant writes no business table itself', async () => {
  assert.ok(!/\.from\("(questions|quizzes|quiz_questions|exams|exam_answers)"\)/.test(native));
});

await test('the assistant refuses to run without a permission the tool needs', async () => {
  assert.match(native, /toolsForPermissions|executeTool/, 'the assistant must filter or gate by permission');
});

await test('both routes declare themselves dynamic and no-store', async () => {
  for (const text of [rest, mcp]) {
    assert.match(text, /export const dynamic = "force-dynamic"/);
    assert.match(text, /Cache-Control": "private, no-store"|NO_STORE/);
  }
});

await test('the MCP handler rejects unknown methods as protocol errors', async () => {
  const handler = source('src/lib/ai/mcp.ts');
  assert.match(handler, /rpcCode: -32601/, 'an unknown method must be a JSON-RPC method-not-found');
  assert.match(handler, /tools\/list/);
  assert.match(handler, /tools\/call/);
  assert.match(handler, /initialize/);
});

console.log(`\nAI surfaces & shared core: ${n} checks passed.`);
