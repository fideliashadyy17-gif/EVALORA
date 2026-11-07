// Regression tests for tenant-owner promotion/removal through direct PostgREST writes.
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";

const db = new PGlite();
await db.exec(`
  create role authenticated;
  create role service_role bypassrls;
  create schema auth;
  create function auth.uid() returns text language sql stable as $$
    select current_setting('test.user', true)
  $$;
  create table public.organizations(id text primary key, owner_id text not null);
  create table public.tenant_data(
    id text primary key,
    organization_id text not null references public.organizations(id) on delete cascade
  );
  create table public.organization_members(
    id text primary key,
    organization_id text not null references public.organizations(id) on delete cascade,
    user_id text not null,
    role text not null,
    status text not null default 'active',
    unique(organization_id, user_id)
  );
  create function public.is_super_admin() returns boolean
    language sql security definer stable as $$ select auth.uid() = 'platform-admin' $$;
  create function public.org_role(p_org text) returns text
    language sql security definer stable as $$
      select role from public.organization_members
      where organization_id = p_org and user_id = auth.uid() and status = 'active'
      limit 1
    $$;
  create function public.can_manage_org(p_org text) returns boolean
    language sql security definer stable as $$
      select coalesce(public.org_role(p_org) in ('owner', 'admin'), false)
    $$;
  insert into public.organizations values
    ('org-a','tenant-owner-a'),('org-b','tenant-owner-b'),('org-exploit','tenant-owner-exploit');
  insert into public.tenant_data values ('tenant-data-a','org-a'),('tenant-data-exploit','org-exploit');
  insert into public.organization_members(id,organization_id,user_id,role) values
    ('owner-a','org-a','tenant-owner-a','owner'),
    ('admin-a','org-a','tenant-admin-a','admin'),
    ('teacher-a','org-a','teacher-a','teacher'),
    ('owner-b','org-b','tenant-owner-b','owner'),
    ('owner-exploit','org-exploit','tenant-owner-exploit','owner'),
    ('admin-exploit','org-exploit','tenant-admin-exploit','admin');
  alter table public.organizations enable row level security;
  alter table public.organization_members enable row level security;
  grant usage on schema public, auth to authenticated, service_role;
  grant select, delete on public.organizations to authenticated, service_role;
  grant select on public.tenant_data to authenticated, service_role;
  grant select, insert, update, delete on public.organization_members to authenticated, service_role;
  create policy org_select on public.organizations for select to authenticated
    using (public.org_role(id) is not null or public.is_super_admin());
  create policy org_delete on public.organizations for delete to authenticated
    using (public.org_role(id) = 'owner' or public.is_super_admin());
  create policy mem_select on public.organization_members for select to authenticated
    using (public.org_role(organization_id) is not null or user_id = auth.uid() or public.is_super_admin());
  create policy mem_insert on public.organization_members for insert to authenticated with check (
    public.can_manage_org(organization_id) or public.is_super_admin() or
    (user_id = auth.uid() and role = 'owner' and exists (
      select 1 from public.organizations o where o.id = organization_id and o.owner_id = auth.uid()
    ))
  );
  create policy mem_update on public.organization_members for update to authenticated
    using (public.can_manage_org(organization_id) or public.is_super_admin())
    with check (public.can_manage_org(organization_id) or public.is_super_admin());
  create policy mem_delete on public.organization_members for delete to authenticated
    using (public.can_manage_org(organization_id) or public.is_super_admin());
`);
let checks = 0;
async function test(name, fn) {
  await fn();
  checks++;
  console.log(`  ✓ ${name}`);
}
async function setUser(id) {
  await db.query("select set_config('test.user', $1, false)", [id]);
}

await db.exec("set role authenticated");
await setUser("tenant-admin-exploit");
await test("legacy escalation path: tenant admin promotes self to owner and cascades tenant-data deletion", async () => {
  const promoted = await db.query("update public.organization_members set role='owner' where id='admin-exploit' returning id");
  assert.deepEqual(promoted.rows, [{ id: "admin-exploit" }]);

  const deleted = await db.query("delete from public.organizations where id='org-exploit' returning id");
  assert.deepEqual(deleted.rows, [{ id: "org-exploit" }]);
  assert.deepEqual((await db.query("select id from public.tenant_data where organization_id='org-exploit'")).rows, []);
  await db.exec("reset role; set role service_role");
  assert.deepEqual((await db.query("select id from public.organizations where id='org-a'")).rows, [{ id: "org-a" }]);
  await db.exec("reset role; set role authenticated");
});
await db.exec("reset role");
await db.exec(await readFile("supabase/migrations/0060_protect_owner_membership.sql", "utf8"));

await db.exec("set role authenticated");
await setUser("tenant-admin-a");
await test("tenant admin cannot add another owner via direct insert", async () => {
  await assert.rejects(
    () => db.query("insert into public.organization_members(id,organization_id,user_id,role) values ('rogue-owner','org-a','attacker','owner')"),
    /row-level security/i,
  );
});
await test("tenant admin cannot promote a member to owner", async () => {
  await assert.rejects(
    () => db.query("update public.organization_members set role='owner' where id='teacher-a' returning id"),
    /row-level security/i,
  );
});
await test("tenant admin cannot alter or remove the existing owner", async () => {
  assert.deepEqual((await db.query("update public.organization_members set status='suspended' where id='owner-a' returning id")).rows, []);
  assert.deepEqual((await db.query("delete from public.organization_members where id='owner-a' returning id")).rows, []);
});
await test("tenant admin retains ordinary member-management permissions", async () => {
  assert.deepEqual((await db.query("update public.organization_members set role='corrector' where id='teacher-a' returning role")).rows, [{ role: "corrector" }]);
  assert.deepEqual((await db.query("delete from public.organization_members where id='teacher-a' returning id")).rows, [{ id: "teacher-a" }]);
});
await test("tenant admin cannot change members in another organization", async () => {
  assert.deepEqual((await db.query("update public.organization_members set role='teacher' where id='owner-b' returning id")).rows, []);
});

await setUser("platform-admin");
await test("Super Admin retains explicit owner-migration permissions", async () => {
  await db.query("insert into public.organization_members(id,organization_id,user_id,role) values ('owner-new','org-a','new-owner','owner')");
  assert.equal((await db.query("select count(*)::int as count from public.organization_members where role='owner' and organization_id='org-a'")).rows[0].count, 2);
});

await db.exec("reset role; set role service_role");
await test("service-role ownership transfer path remains available", async () => {
  await db.query("update public.organization_members set role='admin' where id='owner-a'");
  await db.query("update public.organization_members set role='owner' where id='owner-new'");
  assert.equal((await db.query("select role from public.organization_members where id='owner-new'")).rows[0].role, "owner");
});

console.log(`\n${checks} checks passed (owner-membership RLS; isolated PGlite fixture).`);
await db.close();
