// Isolated PGlite fixture; install @electric-sql/pglite temporarily to run.
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const db=new PGlite();
await db.exec(`
create role authenticated; create role service_role bypassrls;
create schema auth;
create function auth.uid() returns text language sql stable as $$ select current_setting('test.user',true) $$;
create table public.memberships(user_id text, organization_id text, role text);
insert into public.memberships values ('teacher','a','teacher'),('student','a','student'),('corrector','a','corrector'),('supervisor','a','supervisor'),('other','b','teacher');
create function public.org_role(p_org text) returns text language sql security definer stable as $$ select role from public.memberships where user_id=auth.uid() and organization_id=p_org limit 1 $$;
create function public.is_super_admin() returns boolean language sql security definer stable as $$ select auth.uid()='super' $$;
create function public.is_org_member(p_org text) returns boolean language sql security definer stable as $$ select public.org_role(p_org) is not null $$;
create function public.can_create_content(p_org text) returns boolean language sql security definer stable as $$ select coalesce(public.org_role(p_org) in ('owner','admin','teacher','organizer'),false) $$;
create table public.questions(id text primary key, organization_id text);
create table public.question_options(id text primary key, question_id text);
create table public.quizzes(id text primary key, organization_id text);
create table public.quiz_questions(id text primary key, quiz_id text);
create table public.question_categories(id text primary key, organization_id text);
insert into public.questions values ('qa','a'),('qb','b'); insert into public.question_options values ('oa','qa'),('ob','qb');
insert into public.quizzes values ('za','a'),('zb','b'); insert into public.quiz_questions values ('pa','za'),('pb','zb');
insert into public.question_categories values ('ca','a'),('cb','b');
alter table public.questions enable row level security; alter table public.question_options enable row level security; alter table public.quizzes enable row level security; alter table public.quiz_questions enable row level security; alter table public.question_categories enable row level security;
grant usage on schema public,auth to authenticated,service_role; grant select,insert,update,delete on public.questions,public.question_options,public.quizzes,public.quiz_questions,public.question_categories to authenticated,service_role;
create policy q_select on public.questions for select to authenticated using (public.is_org_member(organization_id) or public.is_super_admin());
create policy q_write on public.questions for all to authenticated using (public.can_create_content(organization_id) or public.is_super_admin()) with check (public.can_create_content(organization_id) or public.is_super_admin());
create policy qopt_all on public.question_options for all to authenticated using (exists(select 1 from public.questions q where q.id=question_id and (public.is_org_member(q.organization_id) or public.is_super_admin()))) with check (exists(select 1 from public.questions q where q.id=question_id and (public.can_create_content(q.organization_id) or public.is_super_admin())));
create policy quiz_select on public.quizzes for select to authenticated using (public.is_org_member(organization_id) or public.is_super_admin());
create policy qq_all on public.quiz_questions for all to authenticated using (exists(select 1 from public.quizzes z where z.id=quiz_id and (public.is_org_member(z.organization_id) or public.is_super_admin()))) with check (exists(select 1 from public.quizzes z where z.id=quiz_id and (public.can_create_content(z.organization_id) or public.is_super_admin())));
create policy qc_all on public.question_categories for all to authenticated using (public.is_org_member(organization_id) or public.is_super_admin()) with check (public.can_create_content(organization_id) or public.is_super_admin());
`);
await db.exec(await readFile('supabase/migrations/0024_protect_assessment_content.sql','utf8'));
await db.exec('set role authenticated');let count=0;
async function set(user){await db.query("select set_config('test.user',$1,false)",[user])}
async function ids(table){return (await db.query(`select id from public.${table} order by id`)).rows.map(x=>x.id)}
async function test(name,fn){await fn();count++;console.log('  ✓ '+name)}
await test('student sees no question, answer key or paper links',async()=>{await set('student');for(const t of ['questions','question_options','quiz_questions']) assert.deepEqual(await ids(t),[]);assert.deepEqual(await ids('question_categories'),['ca'])});
await test('student cannot delete synthetic categories or paper links',async()=>{for(const t of ['question_categories','question_options','quiz_questions']) assert.equal((await db.query(`delete from public.${t} returning id`)).rows.length,0)});
for(const user of ['teacher','corrector','supervisor']) await test(`${user} can read own school paper but not another tenant`,async()=>{await set(user);assert.deepEqual(await ids('questions'),['qa']);assert.deepEqual(await ids('question_options'),['oa']);assert.deepEqual(await ids('quiz_questions'),['pa'])});
await test('corrector and supervisor cannot delete content',async()=>{for(const u of ['corrector','supervisor']){await set(u);for(const t of ['question_categories','question_options','quiz_questions'])assert.equal((await db.query(`delete from public.${t} returning id`)).rows.length,0)}});
await test('teacher retains own-school writes and cannot delete another tenant',async()=>{await set('teacher');assert.equal((await db.query("delete from public.quiz_questions where id='pb' returning id")).rows.length,0);assert.equal((await db.query("delete from public.quiz_questions where id='pa' returning id")).rows.length,1)});
await test('super admin retains cross-tenant access',async()=>{await set('super');assert.deepEqual(await ids('questions'),['qa','qb']);assert.deepEqual(await ids('question_options'),['oa','ob'])});
await db.exec('reset role; set role service_role');await test('service role can read all question records for protected endpoints',async()=>{assert.deepEqual(await ids('questions'),['qa','qb']);assert.deepEqual(await ids('question_options'),['oa','ob'])});
console.log(`\n${count} assessment-content RLS checks passed (isolated PGlite fixture).`);await db.close();
