// Performance regression guards for the responsiveness work.
//
// These are static checks on the shipped source because the latency-critical
// decisions (RLS shape, middleware verification path, route boundaries,
// dashboard aggregation) must not silently regress in a later edit.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
let checks = 0;
const ok = (condition, message) => {
  checks += 1;
  assert.ok(condition, message);
};

const middleware = read("src/middleware.ts");
ok(/auth\.getClaims\(\)/.test(middleware), "middleware verifies the session with getClaims()");
ok(!/auth\.getUser\(\)/.test(middleware), "middleware no longer calls GoTrue getUser() on every navigation");
ok(/MIDDLEWARE_AUTH_BUDGET_MS/.test(middleware), "middleware keeps its bounded auth budget");

for (const route of ["dashboard", "admin", "student"]) {
  const file = `src/app/${route}/loading.tsx`;
  ok(existsSync(file), `${route} has a route-level loading boundary`);
}

const chrome = read("src/components/dashboard/DashboardChrome.tsx");
ok(/useLinkStatus/.test(chrome), "navigation shows pending feedback from useLinkStatus");
ok(/optimisticHref/.test(chrome), "clicked navigation item highlights before the server responds");

const dashboard = read("src/app/dashboard/page.tsx");
ok(/rpc\("workspace_overview"/.test(dashboard), "dashboard uses the single-round-trip overview RPC");
ok(/degradedMetrics/.test(dashboard), "dashboard keeps a fallback when the RPC is unavailable");

const entitlements = read("src/lib/entitlements.ts");
ok(/Promise\.all\(\[\s*supabase[\s\S]*?from\("subscriptions"\)[\s\S]*?from\("plans"\)/.test(entitlements), "entitlement subscription + free plan resolve in parallel");

const auth = read("src/lib/auth.ts");
ok(/select\("id, email, full_name, platform_role, is_primary, status"\)/.test(auth), "session profile selects only used columns");

const questions = read("src/app/dashboard/questions/page.tsx");
ok(/questionTotal[\s\S]*?classList[\s\S]*?Promise\.all/.test(questions), "question bank loads filters and counts concurrently");

const students = read("src/app/dashboard/students/page.tsx");
ok(/rosterPromise/.test(students), "student register starts roster work without serialising independent reads");

const migration = read("supabase/migrations/20261118090000_performance_rls_and_workspace_overview.sql");
ok(/create or replace function public\.workspace_overview/.test(migration), "overview RPC migration is present");
ok(/drop policy if exists q_write on public\.questions/.test(migration), "questions write policy is split from SELECT");
ok(/create policy q_insert on public\.questions/.test(migration), "questions INSERT policy exists");
ok(!/for all to authenticated/.test(migration), "no new FOR ALL policy re-contaminates SELECT");
ok(/revoke all on function public\.workspace_overview\(uuid\) from public, anon/.test(migration), "overview RPC is not callable by anonymous users");

console.log(`PASS: ${checks} performance regression guards (static + migration invariants).`);
