// Renders the real server sign-in page and the real client form. The promise
// being checked is the fail-closed one: an unconfigured deployment must look
// exactly like it did before SSO existed — no divider, no button, no dead end —
// and the denial copy must name the next step rather than say "error".
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { Module } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const outDir = path.join(os.tmpdir(), `evalora-sso-page-${process.pid}`);
mkdirSync(outDir, { recursive: true });
const compile = (source, target) => {
  const { outputText } = ts.transpileModule(readFileSync(source, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
    },
  });
  writeFileSync(path.join(outDir, target), outputText);
};
compile('src/app/login/page.tsx', 'page.js');
compile('src/components/LoginForm.tsx', 'LoginForm.js');
compile('src/lib/sso.ts', 'sso.js');
compile('src/lib/roleRouting.ts', 'roleRouting.js');
writeFileSync(path.join(outDir, 'package.json'), '{"type":"commonjs"}');

const PAGE = path.join(outDir, 'page.js');
const FORM = path.join(outDir, 'LoginForm.js');

const originalLoad = Module._load;
Module._load = function (request, parent) {
  const fromOurCode = parent?.filename === PAGE || parent?.filename === FORM;
  if (fromOurCode && request === '@/components/AuthShell') {
    return {
      AuthShell: ({ title, subtitle, children, footer }) =>
        React.createElement(
          'main',
          null,
          React.createElement('h1', null, title),
          subtitle ? React.createElement('p', null, subtitle) : null,
          children,
          footer ?? null,
        ),
      AuthError: ({ message }) => (message ? React.createElement('p', { className: 'error' }, message) : null),
      AuthNotice: ({ message }) => (message ? React.createElement('p', { className: 'notice' }, message) : null),
    };
  }
  if (fromOurCode && request === '@/components/ui') {
    // Drop UI-only props so React does not warn about unknown DOM attributes.
    const strip = (props) => {
      const copy = { ...props };
      delete copy.variant;
      return copy;
    };
    return {
      Button: ({ children, ...props }) => React.createElement('button', strip(props), children),
      Field: ({ label, children }) => React.createElement('label', null, label, children),
      Input: (props) => React.createElement('input', strip(props)),
    };
  }
  if (fromOurCode && request === '@/lib/supabase/server') {
    // The sign-in page reads the public identity of an institution portal and,
    // when switching accounts, the current browser session. Both are stubbed.
    const builder = () => {
      const state = { slug: null };
      const b = {
        select: () => b,
        eq: (column, value) => {
          if (column === 'slug') state.slug = value;
          return b;
        },
        maybeSingle: async () => ({
          data:
            state.slug === 'oak-international-school'
              ? { name: 'Oak International School', slug: 'oak-international-school', status: 'active', portal_enabled: true }
              : null,
        }),
      };
      return b;
    };
    return {
      createAdminClient: () => ({ from: builder }),
      createClient: async () => ({
        auth: { getUser: async () => ({ data: { user: { email: 'current.person@example.org' } } }) },
      }),
    };
  }
  if (fromOurCode && request === '@/lib/supabase/client') {
    return { createClient: () => ({ auth: { signInWithPassword: async () => ({ error: null }) } }) };
  }
  if (fromOurCode && request === '@/components/LoginForm') {
    return getModule(path.join(outDir, 'LoginForm.js'));
  }
  if (fromOurCode && request === '@/lib/roleRouting') {
    return getModule(path.join(outDir, 'roleRouting.js'));
  }
  if (fromOurCode && request === '@/lib/sso') {
    return getModule(path.join(outDir, 'sso.js'));
  }
  if (fromOurCode && request === '@/app/login/actions') {
    return { startSsoSignIn: 'stub-sso-action' };
  }
  if (fromOurCode && request === 'next/link') {
    return { __esModule: true, default: ({ href, children }) => React.createElement('a', { href }, children) };
  }
  return originalLoad.apply(this, arguments);
};

const loaded = new Map();
function getModule(file) {
  if (!loaded.has(file)) loaded.set(file, load(file));
  return loaded.get(file);
}

function load(file) {
  const mod = new Module(file);
  mod.filename = file;
  // Resolve react/jsx-runtime and friends from the repository, not /tmp.
  mod.paths = [path.resolve('node_modules'), ...Module._nodeModulePaths(path.dirname(file))];
  mod._compile(readFileSync(file, 'utf8'), file);
  return mod.exports;
}
const page = load(PAGE);
Module._load = originalLoad;

async function render({ query = {}, sso = false } = {}) {
  if (sso) process.env.NEXT_PUBLIC_GOOGLE_SSO_ENABLED = 'true';
  else delete process.env.NEXT_PUBLIC_GOOGLE_SSO_ENABLED;
  return renderToStaticMarkup(await page.default({ searchParams: Promise.resolve(query) }));
}

let n = 0;
async function test(name, fn) {
  await fn();
  n++;
  console.log('  ✓ ' + name);
}

await test('an unconfigured deployment offers no third-party sign-in at all', async () => {
  const html = await render();
  assert.match(html, /Welcome back/);
  assert.match(html, /Email address/);
  assert.match(html, /Sign in/);
  assert.doesNotMatch(html, /Continue with/);
  assert.doesNotMatch(html, /or continue with/);
  assert.doesNotMatch(html, /Google/);
});

await test('a configured deployment offers Continue with Google', async () => {
  const html = await render({ sso: true });
  assert.match(html, /or continue with/);
  assert.match(html, /Continue with Google/);
  assert.match(html, /name="provider" value="google"/, 'the provider travels as a hidden field');
  assert.match(html, /action="stub-sso-action"/, 'the button posts to the SSO action');
});

await test('the deny message tells the user to ask for an invitation', async () => {
  const html = await render({ query: { error: 'sso_unprovisioned' }, sso: true });
  assert.match(html, /ask your school administrator to invite you/i);
  assert.doesNotMatch(html, /Invalid email or password/);
});

await test('an unavailable provider explains itself instead of failing silently', async () => {
  const html = await render({ query: { error: 'sso_unavailable' } });
  assert.match(html, /Single sign-on isn&#x27;t available in this deployment/i);
});

await test('non-SSO errors keep their own copy', async () => {
  const suspended = await render({ query: { error: 'suspended' } });
  assert.match(suspended, /This account has been suspended/);
  const profile = await render({ query: { error: 'profile' } });
  assert.match(profile, /membership details could not be loaded/);
});

await test('an unknown error code renders no banner', async () => {
  const html = await render({ query: { error: 'nonsense' } });
  assert.doesNotMatch(html, /className="error"/);
});

await test('a local destination is carried into the SSO form, a hostile one is not', async () => {
  const local = await render({ query: { next: '/dashboard/exams' }, sso: true });
  assert.match(local, /name="next" value="\/dashboard\/exams"/);
  const hostile = await render({ query: { next: 'https://evil.example.com' }, sso: true });
  assert.doesNotMatch(hostile, /evil\.example\.com/);
});

await test('password sign-in notices survive the move to the server page', async () => {
  const registered = await render({ query: { registered: '1' } });
  assert.match(registered, /Account created/);
  const reset = await render({ query: { reset: '1' } });
  assert.match(reset, /Password updated/);
});

await test('an institution portal opens its own named sign-in page, not the candidate screens', async () => {
  const html = await render({ query: { org: 'oak-international-school' } });
  assert.match(html, /Sign in to Oak International School/);
  assert.match(html, /Staff and students sign in here/);
  assert.match(html, /Back to the Oak International School portal/);
  assert.match(html, /name="email"/);
  assert.match(html, /Forgot password\?/);
  assert.match(html, /Show/);
  assert.doesNotMatch(html, /access code/i);
  assert.doesNotMatch(html, /avatar/i);
});

await test('an unknown institution falls back to the generic sign-in page', async () => {
  const html = await render({ query: { org: 'no-such-school' } });
  assert.match(html, /Welcome back/);
  assert.doesNotMatch(html, /Sign in to No Such School/i);
});

await test('switching accounts names the signed-in person and offers a way out', async () => {
  const html = await render({ query: { switch: '1', org: 'oak-international-school' } });
  assert.match(html, /current\.person@example\.org/);
  assert.match(html, /Sign out/i);
  assert.doesNotMatch(html, /Sign in as someone else/);
});

await test('the ordinary sign-in page offers a shared-computer escape hatch', async () => {
  const html = await render({ query: { org: 'oak-international-school' } });
  assert.match(html, /Sign in as someone else/);
});

console.log(`\n${n} sign-in page checks passed (server render; stubbed UI + action).`);
