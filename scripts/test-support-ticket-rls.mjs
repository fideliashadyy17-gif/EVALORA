// Regression test: public contact uses a service-role server action, not public table INSERT.
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
    language sql security definer stable as $$ select auth.uid() = 'platform-admin' $$;
  create table public.support_tickets (
    id text primary key,
    user_id text,
    name text,
    email text,
    subject text not null,
    message text not null,
    status text not null default 'open'
  );
  alter table public.support_tickets enable row level security;
  grant usage on schema public, auth to anon, authenticated, service_role;
  grant select, insert, update, delete on public.support_tickets to anon, authenticated, service_role;
  create policy sup_insert on public.support_tickets
    for insert to anon, authenticated with check (true);
  create policy sup_admin on public.support_tickets
    for select to authenticated using (public.is_super_admin() or user_id = auth.uid());
  create policy sup_update on public.support_tickets
    for update to authenticated using (public.is_super_admin())
    with check (public.is_super_admin());
`);
await db.exec(await readFile("supabase/migrations/0059_restrict_support_ticket_insert.sql", "utf8"));
let checks = 0;
async function test(name, fn) {
  await fn();
  checks++;
  console.log(`  ✓ ${name}`);
}
const insertSql = `insert into public.support_tickets(id,user_id,name,email,subject,message,status)
  values ('ticket-1','victim','Injected','attacker@example.invalid','Fake','Forged ticket','closed')`;

await db.exec("set role anon");
await test("anonymous REST clients cannot create arbitrary tickets", async () => {
  await assert.rejects(() => db.exec(insertSql), /row-level security/i);
});
await db.exec("reset role; set role authenticated");
await db.query("select set_config('test.user', $1, false)", ["ordinary-user"]);
await test("authenticated clients cannot spoof another user's ticket", async () => {
  await assert.rejects(() => db.exec(insertSql), /row-level security/i);
});
await db.exec("reset role; set role service_role");
await test("validated server-side service-role submissions still work", async () => {
  await db.exec(insertSql);
  assert.equal((await db.query("select count(*)::int as count from public.support_tickets")).rows[0].count, 1);
});
await db.exec("reset role; set role authenticated");
await db.query("select set_config('test.user', $1, false)", ["platform-admin"]);
await test("Super Admin ticket review permissions remain intact", async () => {
  assert.equal((await db.query("select count(*)::int as count from public.support_tickets")).rows[0].count, 1);
  const result = await db.query("update public.support_tickets set status='open' where id='ticket-1' returning id");
  assert.deepEqual(result.rows, [{ id: "ticket-1" }]);
});

console.log(`\n${checks} checks passed (support-ticket RLS; isolated PGlite fixture).`);
await db.close();
