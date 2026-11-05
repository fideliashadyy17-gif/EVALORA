// Isolated PGlite fixture; install @electric-sql/pglite temporarily to run.
import {PGlite} from '@electric-sql/pglite';import {readFile} from 'node:fs/promises';import assert from 'node:assert/strict';
const db=new PGlite();await db.exec(`
create role authenticated; create role service_role bypassrls;
create schema auth; create function auth.uid() returns text language sql stable as $$ select current_setting('test.user',true) $$;
create table public.memberships(user_id text, org text, role text);
insert into public.memberships values ('student','a','student'),('teacher','a','teacher'),('other','b','teacher');
create function public.org_role(p text) returns text language sql security definer stable as $$ select role from public.memberships where user_id=auth.uid() and org=p limit 1 $$;
create function public.is_super_admin() returns boolean language sql security definer stable as $$ select auth.uid()='super' $$;
create function public.is_org_member(p text) returns boolean language sql security definer stable as $$ select public.org_role(p) is not null $$;
create function public.can_create_content(p text) returns boolean language sql security definer stable as $$ select coalesce(public.org_role(p) in ('owner','admin','teacher','organizer'),false) $$;
create function public.class_org(p text) returns text language sql stable as $$ select p $$;
create function public.event_org(p text) returns text language sql stable as $$ select p $$;
create function public.phase_org(p text) returns text language sql stable as $$ select p $$;
create table public.class_curricula(id text primary key,class_id text); create table public.class_subjects(id text primary key,class_id text); create table public.competition_event_phases(id text primary key,event_id text); create table public.competition_phase_classes(id text primary key,phase_id text);
insert into public.class_curricula values('ca','a'),('cb','b'); insert into public.class_subjects values('sa','a'),('sb','b'); insert into public.competition_event_phases values('ea','a'),('eb','b'); insert into public.competition_phase_classes values('pa','a'),('pb','b');
alter table public.class_curricula enable row level security;alter table public.class_subjects enable row level security;alter table public.competition_event_phases enable row level security;alter table public.competition_phase_classes enable row level security;
grant usage on schema public,auth to authenticated,service_role;grant select,insert,update,delete on public.class_curricula,public.class_subjects,public.competition_event_phases,public.competition_phase_classes to authenticated,service_role;
create policy ccurr_all on public.class_curricula for all to authenticated using(public.is_org_member(public.class_org(class_id))) with check(public.can_create_content(public.class_org(class_id)));
create policy csubj_all on public.class_subjects for all to authenticated using(public.is_org_member(public.class_org(class_id))) with check(public.can_create_content(public.class_org(class_id)));
create policy cphase_all on public.competition_event_phases for all to authenticated using(public.is_org_member(public.event_org(event_id))) with check(public.can_create_content(public.event_org(event_id)));
create policy cpclass_all on public.competition_phase_classes for all to authenticated using(public.is_org_member(public.phase_org(phase_id))) with check(public.can_create_content(public.phase_org(phase_id)));
`);await db.exec(await readFile('supabase/migrations/0025_protect_member_associations.sql','utf8'));await db.exec('set role authenticated');
const tables=['class_curricula','class_subjects','competition_event_phases','competition_phase_classes'];let n=0;
async function set(u){await db.query("select set_config('test.user',$1,false)",[u])}async function test(name,fn){await fn();n++;console.log('  ✓ '+name)}
await test('student retains only own-tenant reads and cannot delete links',async()=>{await set('student');for(const t of tables){let rows=(await db.query(`select id from public.${t}`)).rows;assert.equal(rows.length,1);assert.ok(rows[0].id.endsWith('a'));assert.equal((await db.query(`delete from public.${t} returning id`)).rows.length,0)}});
await test('teacher can delete only own tenant fixture links',async()=>{await set('teacher');for(const t of tables){let rows=(await db.query(`delete from public.${t} returning id`)).rows;assert.equal(rows.length,1);assert.ok(rows[0].id.endsWith('a'))}});
await test('super admin retains cross-tenant reads',async()=>{await set('super');for(const t of tables){let rows=(await db.query(`select id from public.${t}`)).rows;assert.equal(rows.length,1);assert.ok(rows[0].id.endsWith('b'))}});
await db.exec('reset role; set role service_role');await test('service role retains association access',async()=>{for(const t of tables)assert.equal((await db.query(`select id from public.${t}`)).rows.length,1)});console.log(`\n${n} association RLS checks passed (isolated PGlite fixture).`);await db.close();
