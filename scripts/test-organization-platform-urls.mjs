// Organization platform URL contracts: identifier validation, addressing mode,
// canonical URL generation and access-status derivation. Pure module — no
// network, no database, no browser.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Module } from 'node:module';
import path from 'node:path';
import ts from 'typescript';

function compile(src, dest, deps = {}) {
  const f = path.resolve(dest), m = new Module(f), old = Module._load;
  m.filename = f;
  m.paths = Module._nodeModulePaths(path.dirname(f));
  Module._load = function (req, parent) {
    if (parent?.filename === f && req in deps) return deps[req];
    return old.apply(this, arguments);
  };
  try {
    m._compile(
      ts.transpileModule(readFileSync(src, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      }).outputText,
      f,
    );
    return m.exports;
  } finally {
    Module._load = old;
  }
}

// Same implementation as src/lib/utils.ts slugify (injected so the tenant
// module can be exercised without pulling the whole app).
const slugify = (s) =>
  String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 48);

const tenant = compile('src/lib/tenant.ts', 'scripts/__tenant_platform.cjs', { './utils': { slugify } });

let count = 0;
async function test(name, fn) {
  await fn();
  count++;
  console.log('  ✓ ' + name);
}

const withoutOrigin = () => {
  delete process.env.NEXT_PUBLIC_ROOT_DOMAIN;
  delete process.env.NEXT_PUBLIC_APP_URL;
};
const pathMode = (origin = 'https://evalora-six.vercel.app') => {
  process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'evalora-six.vercel.app';
  process.env.NEXT_PUBLIC_APP_URL = origin;
};
const subdomainMode = (root = 'evalora.com') => {
  process.env.NEXT_PUBLIC_ROOT_DOMAIN = root;
  delete process.env.NEXT_PUBLIC_APP_URL;
};

await test('identifiers are normalized to a subdomain-safe label', () => {
  assert.equal(tenant.validateSubdomain('Oak International School').slug, 'oak-international-school');
  assert.equal(tenant.validateSubdomain('  ÉCOLE  Nord-Ouest  ').slug, 'ecole-nord-ouest');
  assert.equal(tenant.validateSubdomain('abc123').ok, true);
  assert.equal(tenant.validateSubdomain('abc123').error, undefined);
});

await test('short, empty and reserved identifiers are rejected', () => {
  for (const bad of ['ab', '', '   ', '---', '!!']) {
    assert.equal(tenant.validateSubdomain(bad).ok, false, JSON.stringify(bad));
  }
  for (const reserved of ['admin', 'portal', 'login', 'dashboard', 'evalora', 'www', 'api', 'school']) {
    assert.equal(tenant.validateSubdomain(reserved).ok, false, reserved);
    assert.match(tenant.validateSubdomain(reserved).error ?? '', /reserved/i);
  }
});

await test('hyphens, underscores and dots are normalized into a legal label', () => {
  assert.equal(tenant.validateSubdomain('-oak-').slug, 'oak');
  assert.equal(tenant.validateSubdomain('oak_int').slug, 'oak-int');
  assert.equal(tenant.validateSubdomain('oak.evalora').slug, 'oak-evalora');
  assert.equal(tenant.validateSubdomain('a'.repeat(80)).slug.length, 48);
});

await test('suggestions are always valid alternatives, never the rejected name', () => {
  const suggestions = tenant.subdomainSuggestions('admin');
  assert.ok(suggestions.length > 0);
  for (const suggestion of suggestions) {
    assert.equal(tenant.validateSubdomain(suggestion).ok, true, suggestion);
    assert.notEqual(suggestion, 'admin');
  }
});

await test('addressing mode follows the deployment, not a database flag', () => {
  subdomainMode('evalora.com');
  assert.equal(tenant.platformUrlMode(), 'subdomain');
  pathMode();
  assert.equal(tenant.platformUrlMode(), 'path');
  withoutOrigin();
  assert.equal(tenant.platformUrlMode(), 'path');
  process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost';
  assert.equal(tenant.platformUrlMode(), 'subdomain');
  process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'demo.localhost';
  assert.equal(tenant.platformUrlMode(), 'subdomain');
  process.env.NEXT_PUBLIC_ROOT_DOMAIN = '192.168.0.10';
  assert.equal(tenant.platformUrlMode(), 'path');
  withoutOrigin();
});

await test('subdomain-capable hosts are distinguished from preview hosts', () => {
  assert.equal(tenant.isSubdomainCapableHost('evalora.com'), true);
  assert.equal(tenant.isSubdomainCapableHost('localhost'), true);
  assert.equal(tenant.isSubdomainCapableHost('evalora-six.vercel.app'), false);
  assert.equal(tenant.isSubdomainCapableHost('evalora-abc.e2b.app'), false);
  assert.equal(tenant.isSubdomainCapableHost('10.0.0.4'), false);
  assert.equal(tenant.isSubdomainCapableHost(''), false);
  assert.equal(tenant.isSubdomainCapableHost(null), false);
});

await test('a working canonical URL is produced in path mode (today\'s deployment)', () => {
  pathMode('https://evalora-six.vercel.app/');
  assert.equal(tenant.organizationPlatformUrl('oak-international-school'), 'https://evalora-six.vercel.app/portal/oak-international-school');
  assert.equal(tenant.tenantPortalUrl('demo'), 'https://evalora-six.vercel.app/portal/demo');
  assert.equal(tenant.tenantPortalLabel('demo'), '/portal/demo');
  assert.equal(tenant.organizationSubdomainUrl('demo'), 'https://demo.evalora-six.vercel.app');
});

await test('the same identifier yields the subdomain URL once a real domain is configured', () => {
  subdomainMode('evalora.com');
  assert.equal(tenant.organizationPlatformUrl('oak-international-school'), 'https://oak-international-school.evalora.com');
  assert.equal(tenant.tenantPortalLabel('oak-international-school'), 'oak-international-school.evalora.com');
  assert.equal(tenant.organizationPlatformUrl('DEMO'), 'https://demo.evalora.com');
  assert.equal(tenant.organizationPlatformUrl('demo', { root: null, appUrl: 'https://app.test', mode: 'path' }), 'https://app.test/portal/demo');
});

await test('an unconfigured deployment still returns a usable relative address', () => {
  withoutOrigin();
  assert.equal(tenant.organizationPlatformUrl('oak'), '/portal/oak');
  assert.equal(tenant.organizationSubdomainUrl('oak'), null);
  assert.equal(tenant.platformInfrastructure().mode, 'path');
});

await test('a retired identifier maps to the redirect address of the current one', () => {
  pathMode('https://evalora-six.vercel.app');
  assert.equal(tenant.organizationPlatformUrl('old-oak'), 'https://evalora-six.vercel.app/portal/old-oak');
  assert.notEqual(tenant.organizationPlatformUrl('old-oak'), tenant.organizationPlatformUrl('oak-international-school'));
});

await test('path-mode access reports Active with a real HTTPS URL', () => {
  pathMode('https://evalora-six.vercel.app');
  const access = tenant.organizationPlatformAccess({ slug: 'oak-international-school', status: 'active', portal_enabled: true });
  assert.equal(access.state, 'active');
  assert.equal(access.label, 'Active');
  assert.equal(access.tone, 'green');
  assert.equal(access.url, 'https://evalora-six.vercel.app/portal/oak-international-school');
  assert.match(access.detail, /HTTPS/);
});

await test('subdomain mode is Pending until the platform domain is verified', () => {
  subdomainMode('evalora.com');
  const pending = tenant.organizationPlatformAccess({ slug: 'oak', status: 'active', portal_enabled: true, platform_domain_status: 'pending' });
  assert.equal(pending.state, 'pending');
  assert.equal(pending.url, 'https://oak.evalora.com');
  assert.equal(pending.tone, 'amber');
  const verified = tenant.organizationPlatformAccess({ slug: 'oak', status: 'active', portal_enabled: true, platform_domain_status: 'active' });
  assert.equal(verified.state, 'active');
  assert.equal(verified.url, 'https://oak.evalora.com');
});

await test('a verified custom domain becomes the canonical URL', () => {
  subdomainMode('evalora.com');
  const access = tenant.organizationPlatformAccess({
    slug: 'oak', status: 'active', portal_enabled: true, platform_domain_status: 'active', custom_domain: 'https://Oak.Example.org/',
  });
  assert.equal(access.state, 'active');
  assert.equal(access.url, 'https://oak.example.org');
  assert.equal(access.customDomainUrl, 'https://oak.example.org');
  const unverified = tenant.organizationPlatformAccess({ slug: 'oak', status: 'active', portal_enabled: true, platform_domain_status: 'pending', custom_domain: 'oak.example.org' });
  assert.equal(unverified.url, 'https://oak.evalora.com');
  assert.equal(unverified.customDomainUrl, null);
});

await test('suspended, portal-disabled and identifier-less organizations are never reported Active', () => {
  pathMode('https://evalora-six.vercel.app');
  const suspended = tenant.organizationPlatformAccess({ slug: 'oak', status: 'suspended', portal_enabled: true });
  assert.equal(suspended.state, 'disabled');
  assert.equal(suspended.tone, 'red');
  assert.match(suspended.detail, /suspended/);

  const portalOff = tenant.organizationPlatformAccess({ slug: 'oak', status: 'active', portal_enabled: false });
  assert.equal(portalOff.state, 'disabled');
  assert.equal(portalOff.url, '');

  const noSlug = tenant.organizationPlatformAccess({ slug: '', status: 'active', portal_enabled: true });
  assert.equal(noSlug.state, 'unavailable');
  assert.equal(noSlug.url, '');
  assert.equal(noSlug.tone, 'gray');
});

await test('archived organizations keep a URL but block access', () => {
  pathMode('https://evalora-six.vercel.app');
  const archived = tenant.organizationPlatformAccess({ slug: 'oak', status: 'archived', portal_enabled: true });
  assert.equal(archived.state, 'disabled');
  assert.equal(archived.url, 'https://evalora-six.vercel.app/portal/oak');
});

await test('infrastructure reports exactly what is missing for subdomain URLs', () => {
  pathMode('https://evalora-six.vercel.app');
  const infra = tenant.platformInfrastructure();
  assert.equal(infra.mode, 'path');
  assert.equal(infra.root, 'evalora-six.vercel.app');
  assert.match(infra.requirement ?? '', /wildcard DNS/i);
  assert.match(infra.note, /\/portal\//);

  subdomainMode('evalora.com');
  const live = tenant.platformInfrastructure();
  assert.equal(live.mode, 'subdomain');
  assert.equal(live.requirement, null);
  assert.match(live.note, /https:\/\/<identifier>\.evalora\.com/);
  withoutOrigin();
});

await test('organization slugs already in production stay valid and stable', () => {
  for (const slug of ['demo', 'oak-international-school', 'evalora-platform']) {
    const check = tenant.validateSubdomain(slug);
    assert.equal(check.ok, true, slug);
    assert.equal(check.slug, slug, slug);
  }
});

await test('the host resolver and the URL builder agree on the same tenant', () => {
  assert.equal(tenant.getTenantSlugFromHost('oak.evalora.com', 'evalora.com'), 'oak');
  assert.equal(tenant.getTenantSlugFromHost('oak-international-school.evalora.com', 'evalora.com'), 'oak-international-school');
  assert.equal(tenant.getTenantSlugFromHost('admin.evalora.com', 'evalora.com'), null);
  assert.equal(tenant.getTenantSlugFromHost('evalora-six.vercel.app'), null);
  assert.equal(tenant.getTenantSlugFromHost('unknown.other.test', 'evalora.com'), null);
});

console.log(`\n${count} checks passed — organization platform URLs (pure module, no network).`);
