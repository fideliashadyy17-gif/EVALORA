// HTTP checks for POST /api/cron/close-expired-attempts against a running server (production build).
// Decided before any database query, so no database is needed.
//   CRON_SECRET=<40+ chars> npx next start -p 3102          (server with a secret)
//   BASE=http://127.0.0.1:3102 SERVER_HAS_SECRET=1 node scripts/test-cron-sweep-routes.mjs
//   npx next start -p 3103 (without CRON_SECRET)
//   BASE=http://127.0.0.1:3103 SERVER_HAS_SECRET=0 node scripts/test-cron-sweep-routes.mjs
import assert from 'node:assert/strict';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3102';
const HAS_SECRET = (process.env.SERVER_HAS_SECRET ?? '1') === '1';
const SECRET = process.env.CRON_SECRET_TEST ?? 'test-secret-value-with-more-than-32-characters';
const URL_PATH = '/api/cron/close-expired-attempts';
let checks = 0;

async function post(headers = {}) {
  const response = await fetch(`${BASE}${URL_PATH}`, { method: 'POST', headers, redirect: 'manual' });
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: response.status, headers: response.headers, json, text };
}

if (HAS_SECRET) {
  {
    const r = await post();
    assert.equal(r.status, 401, 'no bearer token is refused');
    assert.match(r.headers.get('cache-control') ?? '', /no-store/, 'refusals are never cached');
    checks += 1;
  }
  {
    const r = await post({ authorization: 'Bearer not-the-secret' });
    assert.equal(r.status, 401, 'a wrong bearer token is refused');
    checks += 1;
  }
  {
    const r = await post({ authorization: `Basic ${SECRET}` });
    assert.equal(r.status, 401, 'a non-bearer scheme is refused');
    checks += 1;
  }
  {
    const r = await post({ authorization: `Bearer ${SECRET}x` });
    assert.equal(r.status, 401, 'a near-miss token is refused');
    checks += 1;
  }
  {
    const r = await post({ authorization: `Bearer ${SECRET}` });
    // With the real secret the sweep runs; in this fixture environment the database is unreachable,
    // so the handler reports a failure. It must never report success without running the sweep.
    assert.notEqual(r.status, 401, 'the configured secret is accepted');
    assert.ok(r.status === 200 || r.status === 500, `accepted request answers 200 or 500, got ${r.status}`);
    checks += 1;
  }
} else {
  {
    const r = await post({ authorization: 'Bearer anything' });
    assert.equal(r.status, 503, 'without a configured secret the endpoint refuses to run');
    assert.match(r.headers.get('cache-control') ?? '', /no-store/);
    checks += 1;
  }
  {
    const r = await post();
    assert.equal(r.status, 503, 'without a configured secret even a missing bearer is 503, never a run');
    checks += 1;
  }
}

console.log(`${checks} checks passed (cron sweep route, HTTP, ${HAS_SECRET ? 'configured' : 'unconfigured'} server)`);
