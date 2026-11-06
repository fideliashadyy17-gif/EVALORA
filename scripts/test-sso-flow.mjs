// Exercises the real SSO sign-in action and the real OAuth callback handler
// against a stubbed Supabase client. The interesting assertions are about what
// must NOT happen: no provider attempt when SSO is off, no session left behind
// for an uninvited identity, and no provisioning check on the email flows that
// share the same callback route.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { Module, createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';

const outDir = path.join(os.tmpdir(), `evalora-sso-flow-${process.pid}`);
mkdirSync(path.join(outDir, 'supabase'), { recursive: true });
const compile = (source, target, jsx = false) => {
  const { outputText } = ts.transpileModule(readFileSync(source, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      ...(jsx ? { jsx: ts.JsxEmit.ReactJSX } : {}),
    },
  });
  writeFileSync(path.join(outDir, target), outputText);
};

compile('src/lib/sso.ts', 'sso.js');
compile('src/lib/roleRouting.ts', 'roleRouting.js');
compile('src/lib/ssoSession.ts', 'ssoSession.js');
compile('src/app/login/actions.ts', 'actions.js');
compile('src/app/auth/callback/route.ts', 'callback.js');

// ssoSession imports its Supabase client relatively, so the stub lives beside
// the compiled module and delegates to whatever the current test installed.
writeFileSync(
  path.join(outDir, 'supabase', 'server.js'),
  'module.exports = { createClient: async () => globalThis.__ssoSession(), createAdminClient: () => globalThis.__ssoAdmin() };\n',
);
writeFileSync(path.join(outDir, 'package.json'), '{"type":"commonjs"}');

const ACTIONS = path.join(outDir, 'actions.js');
const CALLBACK = path.join(outDir, 'callback.js');
const require = createRequire(import.meta.url);

const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

class FakeResponse {
  constructor(url, init) {
    this.url = String(url);
    this.status = init?.status ?? 307;
    this.headers = init?.headers ?? {};
  }
  static redirect(url, init) {
    // Record how much session cleanup had happened by the time the response
    // was built: a denial must never be issued before the sign-out.
    if (state) state.signedOutBeforeRedirect = state.signOuts;
    return new FakeResponse(url, init);
  }
}

let state;
let headers;

function setup() {
  state = {
    user: { id: USER, email: 'ada.lovelace@school.edu' },
    profile: { id: USER, status: 'active' },
    profileReads: 0,
    signOuts: 0,
    inserts: [],
    oauth: [],
    exchangeError: null,
    oauthError: null,
    oauthUrl: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=stub',
    auditFails: false,
    signedOutBeforeRedirect: null,
  };
  headers = { host: 'evalora-six.vercel.app' };
  process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'evalora.com';
  process.env.NEXT_PUBLIC_APP_URL = 'https://evalora-six.vercel.app';
  delete process.env.NEXT_PUBLIC_GOOGLE_SSO_ENABLED;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test';
}

function db() {
  return {
    auth: {
      getUser: async () => ({ data: { user: state.user } }),
      signOut: async () => {
        state.signOuts++;
        state.user = null;
        return { error: null };
      },
      exchangeCodeForSession: async () => ({ data: {}, error: state.exchangeError }),
      signInWithOAuth: async (args) => {
        state.oauth.push(args);
        if (state.oauthError) return { data: null, error: state.oauthError };
        return { data: { url: state.oauthUrl }, error: null };
      },
    },
    from(table) {
      const query = {
        select() {
          return query;
        },
        eq() {
          return query;
        },
        async maybeSingle() {
          if (table === 'profiles') {
            state.profileReads++;
            return { data: state.profile, error: null };
          }
          return { data: null, error: null };
        },
        async insert(payload) {
          if (state.auditFails) throw new Error('audit unavailable');
          state.inserts.push({ table, payload });
          return { data: null, error: null };
        },
      };
      return query;
    },
  };
}

globalThis.__ssoSession = () => db();
globalThis.__ssoAdmin = () => db();

const originalLoad = Module._load;
Module._load = function (request, parent) {
  if (request === 'next/headers') {
    return { headers: async () => new Map(Object.entries(headers)) };
  }
  if (request === 'next/navigation') {
    return {
      redirect: (url) => {
        state.signedOutBeforeRedirect = state.signOuts;
        const error = new Error(String(url));
        error.url = String(url);
        throw error;
      },
    };
  }
  if (parent?.filename === ACTIONS || parent?.filename === CALLBACK) {
    if (request === '@/lib/supabase/server') return { createClient: async () => db(), createAdminClient: () => db() };
    if (request === '@/lib/roleRouting') return require(path.join(outDir, 'roleRouting.js'));
    if (request === '@/lib/sso') return require(path.join(outDir, 'sso.js'));
    if (request === '@/lib/ssoSession') return require(path.join(outDir, 'ssoSession.js'));
    if (request === 'next/server') return { NextResponse: FakeResponse };
  }
  return originalLoad.apply(this, arguments);
};

function load(file) {
  const mod = new Module(file);
  mod.filename = file;
  mod.paths = Module._nodeModulePaths(path.dirname(file));
  mod._compile(readFileSync(file, 'utf8'), file);
  return mod.exports;
}
const actions = load(ACTIONS);
const callback = load(CALLBACK);
Module._load = originalLoad;

function form(fields) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, String(value));
  return data;
}

async function runAction(fields) {
  try {
    await actions.startSsoSignIn(form(fields));
    throw new Error('expected a redirect');
  } catch (error) {
    if (!error.url) throw error;
    return error.url;
  }
}

async function runCallback(query) {
  const response = await callback.GET(new Request(`https://evalora-six.vercel.app/auth/callback${query}`));
  return response;
}

let n = 0;
async function test(name, fn) {
  setup();
  await fn();
  n++;
  console.log('  ✓ ' + name);
}

/* ─── sign-in action ─── */

await test('with SSO unconfigured the action refuses and never contacts the provider', async () => {
  const url = await runAction({ provider: 'google' });
  assert.match(url, /error=sso_unavailable/);
  assert.equal(state.oauth.length, 0, 'no OAuth attempt is made');
});

await test('an unknown provider in the hidden field is refused', async () => {
  process.env.NEXT_PUBLIC_GOOGLE_SSO_ENABLED = 'true';
  const url = await runAction({ provider: 'azure' });
  assert.match(url, /error=sso_unavailable/);
  assert.equal(state.oauth.length, 0);
});

await test('a configured Google sign-in returns to the host the user started on', async () => {
  process.env.NEXT_PUBLIC_GOOGLE_SSO_ENABLED = 'true';
  headers = { host: 'oak.evalora.com' };
  const url = await runAction({ provider: 'google' });
  assert.equal(url, state.oauthUrl, 'the browser is sent to the provider URL');
  const args = state.oauth[0];
  assert.equal(args.provider, 'google');
  const target = new URL(args.options.redirectTo);
  assert.equal(target.origin, 'https://oak.evalora.com');
  assert.equal(target.pathname, '/auth/callback');
  assert.equal(target.searchParams.get('sso'), 'google');
});

await test('a local destination survives, an off-site one is dropped', async () => {
  process.env.NEXT_PUBLIC_GOOGLE_SSO_ENABLED = 'true';
  await runAction({ provider: 'google', next: '/dashboard?tab=exams' });
  assert.equal(new URL(state.oauth[0].options.redirectTo).searchParams.get('next'), '/dashboard?tab=exams');

  for (const hostile of ['https://evil.example.com', '//evil.example.com', '/\\evil.com', 'javascript:alert(1)']) {
    setup();
    process.env.NEXT_PUBLIC_GOOGLE_SSO_ENABLED = 'true';
    await runAction({ provider: 'google', next: hostile });
    assert.equal(new URL(state.oauth[0].options.redirectTo).searchParams.has('next'), false, hostile);
  }
});

await test('a provider error sends the user back to the form, not onward', async () => {
  process.env.NEXT_PUBLIC_GOOGLE_SSO_ENABLED = 'true';
  state.oauthError = { message: 'provider rejected' };
  const url = await runAction({ provider: 'google' });
  assert.match(url, /^\/login\?error=sso$/);
});

await test('no trustworthy origin means no OAuth attempt', async () => {
  process.env.NEXT_PUBLIC_GOOGLE_SSO_ENABLED = 'true';
  delete process.env.NEXT_PUBLIC_APP_URL;
  headers = { host: 'evil.example.com' };
  const url = await runAction({ provider: 'google' });
  assert.match(url, /error=sso/);
  assert.equal(state.oauth.length, 0);
});

/* ─── OAuth callback guard ─── */

await test('a provisioned identity continues to role resolution', async () => {
  const response = await runCallback('?code=abc&sso=google');
  assert.match(response.url, /\/auth\/resolve$/);
  assert.equal(state.signOuts, 0);
  assert.equal(state.inserts.length, 1);
  const audit = state.inserts[0];
  assert.equal(audit.table, 'audit_logs');
  assert.equal(audit.payload.action, 'auth.sso_signin');
  assert.equal(audit.payload.actor_id, USER);
  assert.equal(audit.payload.metadata.outcome, 'provisioned');
  assert.equal(audit.payload.metadata.provider, 'google');
  assert.equal(audit.payload.metadata.email, 'a***@school.edu', 'the audit log masks the address');
});

await test('an identity with no profile is signed out and told to ask an administrator', async () => {
  state.profile = null;
  const response = await runCallback('?code=abc&sso=google');
  assert.match(response.url, /\/login\?error=sso_unprovisioned$/);
  assert.equal(state.signOuts, 1, 'the freshly established session is destroyed');
  assert.equal(state.signedOutBeforeRedirect, 1, 'sign-out happens before the redirect is issued');
  assert.equal(response.headers['Cache-Control'], 'private, no-store');
  const audit = state.inserts[0];
  assert.equal(audit.payload.metadata.outcome, 'denied_no_profile');
  assert.equal(audit.payload.actor_id, null, 'no profile means no FK-valid actor');
});

await test('an inactive profile is treated as suspended', async () => {
  state.profile = { id: USER, status: 'suspended' };
  const response = await runCallback('?code=abc&sso=google');
  assert.match(response.url, /\/login\?error=suspended$/);
  assert.equal(state.signOuts, 1);
  assert.equal(state.inserts[0].payload.metadata.outcome, 'denied_inactive');
  assert.equal(state.inserts[0].payload.actor_id, USER);
});

await test('the email-confirmation leg keeps its old behaviour', async () => {
  state.profile = null;
  const response = await runCallback('?code=abc');
  assert.match(response.url, /\/auth\/resolve$/);
  assert.equal(state.signOuts, 0, 'an email link is never treated as an SSO denial');
  assert.equal(state.profileReads, 0, 'no provisioning lookup happens without the sso marker');
  assert.equal(state.inserts.length, 0);
});

await test('password recovery still reaches the reset form', async () => {
  const response = await runCallback('?code=abc&next=%2Freset-password');
  assert.match(response.url, /\/reset-password$/);
});

await test('a failed code exchange returns to sign-in', async () => {
  state.exchangeError = { message: 'invalid code' };
  const response = await runCallback('?code=abc&sso=google');
  assert.match(response.url, /\/login\?error=auth$/);
  assert.equal(state.inserts.length, 0);
  assert.equal(state.profileReads, 0);
});

await test('an audit outage never blocks a legitimate sign-in', async () => {
  state.auditFails = true;
  const response = await runCallback('?code=abc&sso=google');
  assert.match(response.url, /\/auth\/resolve$/);
  assert.equal(state.signOuts, 0);
});

await test('a user id absent from the session cannot pass the guard', async () => {
  state.user = null;
  const response = await runCallback('?code=abc&sso=google');
  assert.match(response.url, /\/login\?error=sso_unprovisioned$/);
  assert.equal(state.signOuts, 1);
});

console.log(`\n${n} SSO flow checks passed (action + callback; mocked Supabase).`);
