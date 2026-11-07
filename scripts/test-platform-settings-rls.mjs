// Regression test for the production platform_settings RLS policy migration.
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";

const db = new PGlite();
await db.exec(`
  create role anon;
  create role authenticated;
  create role service_role bypassrls;
  create schema auth;
  create function auth.uid() returns text language sql stable as $$
    select current_setting('test.user', true)
  $$;
  create function public.is_super_admin() returns boolean
    language sql security definer stable set search_path = public as $$
      select auth.uid() = 'platform-admin'
    $$;
  create table public.platform_settings (
    key text primary key,
    value jsonb not null,
    updated_at timestamptz not null default now()
  );
  insert into public.platform_settings(key, value) values
    ('payment_instructions', '{"methods":["bank transfer"]}'),
    ('super_admin', '{"email":"private@example.invalid"}'),
    ('payment_config', '{"methods":["internal"]}'),
    ('proctoring_owner_workspace', '{"organization_id":"private-org-id"}'),
    ('features', '{"proctoring":false}'),
    ('trial_days', '14');
  alter table public.platform_settings enable row level security;
  grant usage on schema public, auth to anon, authenticated, service_role;
  grant select on public.platform_settings to anon;
  grant select, insert, update, delete on public.platform_settings to authenticated, service_role;
  create policy ps_select on public.platform_settings
    for select to authenticated using (true);
  create policy ps_write on public.platform_settings
    for all to authenticated
    using (public.is_super_admin()) with check (public.is_super_admin());
`);

await db.exec(await readFile("supabase/migrations/0058_restrict_platform_settings_reads.sql", "utf8"));
let checks = 0;
async function test(name, fn) {
  await fn();
  checks++;
  console.log(`  ✓ ${name}`);
}
async function setUser(id) {
  await db.query("select set_config('test.user', $1, false)", [id]);
}
async function visibleKeys() {
  return (await db.query("select key from public.platform_settings order by key")).rows.map((row) => row.key);
}

await db.exec("set role authenticated");
await setUser("organization-member");
await test("ordinary authenticated users can read only the billing instructions", async () => {
  assert.deepEqual(await visibleKeys(), ["payment_instructions"]);
});
await test("ordinary authenticated users cannot change protected settings", async () => {
  const result = await db.query(
    "update public.platform_settings set value = '{}'::jsonb where key = 'payment_instructions' returning key",
  );
  assert.deepEqual(result.rows, []);
  await assert.rejects(
    () => db.query("insert into public.platform_settings(key, value) values ('new-secret', '{}')"),
    /row-level security/i,
  );
});

await setUser("platform-admin");
await test("the platform Super Admin retains access to all settings", async () => {
  assert.equal((await visibleKeys()).length, 6);
  const result = await db.query(
    "update public.platform_settings set value = '{\"changed\":true}'::jsonb where key = 'features' returning key",
  );
  assert.deepEqual(result.rows, [{ key: "features" }]);
});

await db.exec("reset role; set role anon");
await test("anonymous users cannot read platform settings", async () => {
  assert.deepEqual(await visibleKeys(), []);
});

await db.exec("reset role; set role service_role");
await test("server-side service-role reads remain available", async () => {
  assert.equal((await visibleKeys()).length, 6);
});

console.log(`\n${checks} checks passed (platform-settings RLS; isolated PGlite fixture).`);
await db.close();
