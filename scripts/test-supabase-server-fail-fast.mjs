/**
 * Server-side Supabase reads must fail fast when the database is unreachable.
 *
 * The defect this locks down, measured rather than assumed: postgrest-js retries
 * an idempotent request up to three times with exponential backoff (1s, 2s, 4s)
 * whenever the fetch rejects. With the database port closed, ONE query therefore
 * cost ~7 s, and a public page — which reads branding, announcements, formatting
 * and the locale in sequence — took ~21 s to render its own fallbacks with the
 * CPU idle and no socket open. It was not waiting for the database; it was
 * waiting out the backoff before reaching the fallback it was always going to
 * use. In CI, where the Supabase secrets are placeholders, the same behaviour
 * made every landing check crawl.
 *
 * `src/lib/supabase/server.ts` now passes `db: { retry: false }` to both server
 * clients. Every server-side read in this codebase has a documented fallback, so
 * an unreachable database must cost milliseconds, not seconds. The browser client
 * keeps retrying: a flaky connection on a candidate's own device is exactly what
 * the backoff is for, and the candidate's queue — not a page render — owns the
 * wait.
 *
 *   node scripts/test-supabase-server-fail-fast.mjs
 *
 * Needs nothing but the installed dependencies: it points the real client
 * factories at a closed local port and times what they do.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { Module } from "node:module";
import path from "node:path";
import { performance } from "node:perf_hooks";
import ts from "typescript";

const ROOT = process.cwd();
const CLOSED_PORT = Number(process.env.FAIL_FAST_PORT ?? 54399);
const CLOSED_URL = `http://127.0.0.1:${CLOSED_PORT}`;

/** A page render may not spend seconds discovering the database is down. */
const FAST_MS = 1_500;

let checks = 0;
const failures = [];
async function check(label, fn) {
  try {
    await fn();
    checks += 1;
    console.log(`  ✓ ${label}`);
  } catch (error) {
    failures.push(`${label}: ${error.message}`);
    console.log(`  ✗ ${label}\n      ${String(error.message).split("\n").slice(0, 4).join("\n      ")}`);
  }
}
const read = (file) => readFileSync(path.join(ROOT, file), "utf8");

/* ── load the REAL client factories ────────────────────────────────────────
 * Only `next/headers` is faked: there is no request context in a bare Node
 * process. `@supabase/ssr` and `@supabase/supabase-js` are the installed
 * packages, so the retry policy under test is the real one.
 */
process.env.NEXT_PUBLIC_SUPABASE_URL = CLOSED_URL;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "mock-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = "mock-service-key";

const cookieStore = { getAll: () => [], get: () => null, set: () => {} };
const fakes = new Map([
  ["next/headers", { cookies: async () => cookieStore }],
  ["server-only", {}],
]);

const loaded = new Map();
function resolveFile(absolute) {
  for (const candidate of [absolute, `${absolute}.ts`, `${absolute}.tsx`]) {
    try {
      if (readFileSync(candidate, "utf8") !== undefined) return candidate;
    } catch { /* try the next shape */ }
  }
  return null;
}
function load(file) {
  const absolute = resolveFile(path.resolve(ROOT, file));
  assert.ok(absolute, `cannot resolve ${file}`);
  if (loaded.has(absolute)) return loaded.get(absolute).exports;
  const mod = new Module(absolute, null);
  mod.filename = absolute;
  mod.paths = Module._nodeModulePaths(path.dirname(absolute));
  loaded.set(absolute, mod);
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (fakes.has(request)) return fakes.get(request);
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    const { outputText } = ts.transpileModule(readFileSync(absolute, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
      fileName: absolute,
    });
    mod._compile(outputText, absolute);
    return mod.exports;
  } finally {
    Module._load = originalLoad;
  }
}

/** Time one PostgREST read against the closed port; returns [ms, errorText]. */
async function timedRead(runner) {
  const started = performance.now();
  let errorText = "";
  try {
    const result = await runner();
    errorText = result?.error ? String(result.error.message ?? result.error) : "";
  } catch (error) {
    errorText = String(error?.message ?? error);
  }
  return [Math.round(performance.now() - started), errorText];
}

console.log("\nserver-side Supabase reads fail fast when the database is unreachable");

/* ── 0. the port really is closed, so the timings mean something ─────────── */
await check(`nothing is listening on ${CLOSED_URL} (a raw fetch is refused at once)`, async () => {
  const [ms, errorText] = await timedRead(() => fetch(`${CLOSED_URL}/rest/v1/platform_config_values?select=*`));
  assert.ok(errorText, "the raw fetch must fail — if something answers on this port, set FAIL_FAST_PORT");
  assert.ok(ms < FAST_MS, `a refused connection should be immediate, took ${ms}ms`);
});

const server = load("src/lib/supabase/server.ts");

/* ── 1. the service-role client used by grading, webhooks and cron ───────── */
await check(`createAdminClient() gives up in under ${FAST_MS}ms`, async () => {
  const admin = server.createAdminClient();
  const [ms, errorText] = await timedRead(() => admin.from("platform_config_values").select("*").limit(1));
  assert.ok(errorText, "an unreachable database must surface an error, not empty rows");
  assert.ok(ms < FAST_MS, `the read took ${ms}ms; postgrest-js's 1s+2s+4s backoff is running again`);
});

/* ── 2. the request-scoped client every page and server action uses ──────── */
await check(`createClient() gives up in under ${FAST_MS}ms`, async () => {
  const supabase = await server.createClient();
  const [ms, errorText] = await timedRead(() => supabase.from("platform_config_values").select("*").limit(1));
  assert.ok(errorText, "an unreachable database must surface an error, not empty rows");
  assert.ok(ms < FAST_MS, `the read took ${ms}ms; postgrest-js's 1s+2s+4s backoff is running again`);
});

/* ── 3. the ceiling is real: the same query WITH retries is seconds slower ── */
await check("a client left on the library default really does spend seconds in backoff", async () => {
  const { createClient: createPlain } = await import("@supabase/supabase-js");
  const plain = createPlain(CLOSED_URL, "mock-anon-key", { auth: { persistSession: false, autoRefreshToken: false } });
  const [ms] = await timedRead(() => plain.from("platform_config_values").select("*").limit(1));
  // Not an exact figure: the point is that the two clients differ by orders of
  // magnitude, so check 1 and 2 cannot pass by accident on a fast machine.
  assert.ok(ms >= 2_000, `expected the retrying client to take seconds, it took ${ms}ms — the library default may have changed, re-measure before relaxing checks 1-2`);
});

/* ── 4. and the source says why ──────────────────────────────────────────── */
await check("both server client factories disable the retry policy explicitly", () => {
  const source = read("src/lib/supabase/server.ts");
  assert.match(source, /const SERVER_DB_OPTIONS = \{ retry: false \} as const;/, "the fail-fast option is declared once, with its reason above it");
  const factories = source.split(/^export (?:async )?function /m).slice(1);
  assert.ok(factories.length >= 2, "expected the request-scoped and the service-role factories");
  for (const factory of factories) {
    const name = factory.slice(0, factory.indexOf("("));
    assert.match(factory, /db: SERVER_DB_OPTIONS/, `${name}() must pass the fail-fast option`);
  }
  assert.match(source, /backoff/i, "the comment must still explain what the option is for");
});

await check("the edge client in src/middleware.ts opts out too", () => {
  const source = read("src/middleware.ts");
  assert.match(source, /db: \{ retry: false \}/, "middleware bounds its own calls at 2.5s and 3.5s; a 7s retry stack contradicts that");
});

await check("no other module builds its own Supabase client", () => {
  // Every other module imports the TYPE and is handed a client, so it cannot
  // configure a retry policy. A fourth construction site must decide deliberately.
  const builders = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else if (/\.tsx?$/.test(entry.name)) {
        const source = readFileSync(absolute, "utf8");
        const valueImport = source
          .split("\n")
          .some((line) => /^import\s+(?!type\b)/.test(line) && /@supabase\/(ssr|supabase-js)/.test(line));
        if (valueImport) builders.push(path.relative(ROOT, absolute).split(path.sep).join("/"));
      }
    }
  };
  walk(path.join(ROOT, "src"));
  assert.deepEqual(builders.sort(), [
    "src/lib/supabase/client.ts",
    "src/lib/supabase/server.ts",
    "src/middleware.ts",
  ], "a new client construction site must choose its retry policy on purpose");
});

await check("the browser client deliberately keeps retrying", () => {
  const source = read("src/lib/supabase/client.ts");
  assert.ok(!/retry:\s*false/.test(source), "a candidate on a flaky connection is exactly what the backoff is for");
});

console.log(
  failures.length === 0
    ? `\n✓ server-side fail-fast — ${checks} checks passed\n`
    : `\n✗ ${failures.length} of ${checks + failures.length} checks failed\n${failures.map((f) => `  - ${f}`).join("\n")}\n`,
);
process.exit(failures.length === 0 ? 0 : 1);
