// The MCP JSON-RPC handler, executed for real against a fake registry.
//
// The handler is compiled from source rather than mocked, so this suite fails if
// the protocol semantics drift: initialize must negotiate, tools/list must come
// from the injected registry, tools/call must pass arguments through unchanged,
// and an unknown method must be a protocol error rather than a thrown crash.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const outDir = mkdtempSync(path.join(tmpdir(), 'evalora-mcp-'));
execFileSync(
  'npx',
  [
    'tsc', 'src/lib/ai/mcp.ts',
    '--outDir', outDir, '--rootDir', 'src', '--module', 'commonjs', '--target', 'es2022',
    '--esModuleInterop', '--skipLibCheck', '--moduleResolution', 'node', '--lib', 'es2022,dom',
  ],
  { stdio: 'pipe' },
);
// `server-only` is a bundler marker with no runtime implementation (production
// resolves it to an empty module). The compiled copy is loaded with the same
// resolution the Next build applies, without adding a dependency on the package.
const mcpPath = path.join(outDir, 'lib/ai/mcp.js');
writeFileSync(mcpPath, readFileSync(mcpPath, 'utf8').replace('require("server-only");', ''));
writeFileSync(
  path.join(outDir, 'node_modules-stub.js'),
  'module.exports = {};',
);
const { handleRpc, SERVER_NAME, SUPPORTED_PROTOCOL } = await import(pathToFileURL(mcpPath).href);

let n = 0;
const test = async (name, fn) => { await fn(); n++; console.log('  ✓ ' + name); };

const calls = [];
const handlers = {
  listTools: async () => [
    { name: 'list_examinations', title: 'List examinations', description: 'Lists examinations.', inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true } },
    { name: 'publish_examination', title: 'Publish an examination', description: 'Publishes.', inputSchema: { type: 'object', properties: { examination_id: { type: 'string' } } }, annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false } },
  ],
  callTool: async (name, args) => {
    calls.push({ name, args });
    return { content: [{ type: 'text', text: `ran ${name}` }], structuredContent: { ok: true, received: args } };
  },
};

await test('initialize negotiates the protocol and advertises only tools', async () => {
  const result = await handleRpc('initialize', { protocolVersion: SUPPORTED_PROTOCOL, capabilities: {} }, handlers);
  assert.equal(result.protocolVersion, SUPPORTED_PROTOCOL);
  assert.deepEqual(result.capabilities, { tools: { listChanged: false } });
  assert.equal(result.serverInfo.name, SERVER_NAME);
  assert.match(result.instructions, /approval/i);
});

await test('ping is answered', async () => {
  assert.deepEqual(await handleRpc('ping', null, handlers), {});
});

await test('tools/list returns the injected registry verbatim', async () => {
  const result = await handleRpc('tools/list', {}, handlers);
  assert.equal(result.tools.length, 2);
  assert.equal(result.tools[0].name, 'list_examinations');
  assert.equal(result.tools[1].annotations.destructiveHint, true);
});

await test('tools/call forwards the exact arguments', async () => {
  const result = await handleRpc(
    'tools/call',
    { name: 'publish_examination', arguments: { examination_id: '11111111-1111-4111-8111-111111111111', confirm: true } },
    handlers,
  );
  assert.equal(result.content[0].text, 'ran publish_examination');
  assert.deepEqual(calls.at(-1).args, { examination_id: '11111111-1111-4111-8111-111111111111', confirm: true });
});

await test('tools/call without arguments passes an empty object, not undefined', async () => {
  await handleRpc('tools/call', { name: 'list_examinations' }, handlers);
  assert.deepEqual(calls.at(-1).args, {});
});

await test('tools/call needs a name', async () => {
  await assert.rejects(() => handleRpc('tools/call', { arguments: {} }, handlers), /requires a tool name/);
});

await test('an unknown method is a JSON-RPC method-not-found', async () => {
  await assert.rejects(
    () => handleRpc('resources/read', {}, handlers),
    (error) => error.rpcCode === -32601,
  );
});

await test('resources and prompts list empty rather than failing', async () => {
  assert.deepEqual(await handleRpc('resources/list', {}, handlers), { resources: [] });
  assert.deepEqual(await handleRpc('prompts/list', {}, handlers), { prompts: [] });
});

await test('notifications resolve without a result body', async () => {
  assert.deepEqual(await handleRpc('notifications/initialized', {}, handlers), {});
});

/* ── The shared-core claim, checked against the real sources ─────────── */

await test('the MCP route maps a tool error to an MCP result, not a crash', async () => {
  const route = readFileSync(new URL('../src/app/api/mcp/route.ts', import.meta.url), 'utf8');
  assert.match(route, /if \(!outcome\.ok\)/);
  assert.match(route, /isError: true/);
  assert.match(route, /approval_required/);
});

await test('the MCP route never imports a handler directly (one executor)', async () => {
  const route = readFileSync(new URL('../src/app/api/mcp/route.ts', import.meta.url), 'utf8');
  assert.ok(!/from "@\/lib\/ai\/handlers"/.test(route));
  assert.ok(!/supabase\.from\(/.test(route), 'the MCP route must not touch tables itself');
});

await test('no surface invents a second tool name list', async () => {
  for (const file of ['src/app/api/mcp/route.ts', 'src/app/api/ai/v1/tools/route.ts', 'src/app/api/ai/v1/tools/[name]/route.ts']) {
    const text = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.ok(!/'list_examinations'|"list_examinations"/.test(text), `${file} hard-codes a tool name`);
  }
});

rmSync(outDir, { recursive: true, force: true });
console.log(`\nMCP server: ${n} checks passed.`);
