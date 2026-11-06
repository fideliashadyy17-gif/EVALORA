// Execute the actual 0030 migration against isolated PostgreSQL-compatible PGlite.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();let n=0;
const test=async(name,fn)=>{await fn();n++;console.log('  ✓ '+name)};
const user='00000000-0000-4000-8000-000000000001', other='00000000-0000-4000-8000-000000000002', superId='00000000-0000-4000-8000-000000000003', org='00000000-0000-4000-8000-000000000010', otherOrg='00000000-0000-4000-8000-000000000011';
try {
 await db.exec(`create schema auth; create role authenticated; create role service_role bypassrls; create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create table profiles(id uuid primary key,status text,platform_role text);
 create table organization_members(user_id uuid,organization_id uuid,role text,status text);
 create table exams(id uuid primary key,organization_id uuid,title text);
 create function public.is_super_admin() returns boolean language sql stable security definer set search_path=public as $$select exists(select 1 from profiles where id=auth.uid() and platform_role='super_admin' and status='active')$$;
 create function public.org_role(p_org uuid) returns text language sql stable security definer set search_path=public as $$select case when is_super_admin() then 'owner' else (select role from organization_members where organization_id=p_org and user_id=auth.uid() and status='active' limit 1) end$$;
 create function public.is_org_member(p_org uuid) returns boolean language sql stable security definer set search_path=public as $$select org_role(p_org) is not null$$;
 create function public.can_create_content(p_org uuid) returns boolean language sql stable security definer set search_path=public as $$select coalesce(org_role(p_org) in ('owner','admin','teacher','organizer'), false)$$;
 alter table exams enable row level security;
 create policy exam_select on exams for select to authenticated using(is_super_admin() or coalesce(org_role(organization_id) in ('owner','admin','teacher','organizer','supervisor','corrector'),false));
 create policy exam_write on exams for all to authenticated using(is_super_admin() or can_create_content(organization_id)) with check(is_super_admin() or can_create_content(organization_id));
 grant usage on schema public,auth to authenticated,service_role; grant select,insert,update,delete on exams to authenticated,service_role;
 insert into profiles values ('${user}','active','user'),('${other}','active','user'),('${superId}','active','super_admin');
 insert into organization_members values ('${user}','${org}','teacher','active'),('${other}','${otherOrg}','teacher','active'),('${superId}','${org}','owner','active');
 insert into exams values ('00000000-0000-4000-8000-000000000020','${org}','Tenant A'),('00000000-0000-4000-8000-000000000021','${otherOrg}','Tenant B');`);
 await db.exec(readFileSync('supabase/migrations/0030_require_active_profile_for_org_role.sql','utf8'));
 await db.exec(`set role authenticated; select set_config('test.uid','${user}',false);`);
 await test('active teacher sees and writes only the authorized tenant',async()=>{assert.equal((await db.query('select title from exams')).rows.length,1);assert.equal((await db.query("update exams set title='A updated' returning id")).rows.length,1);assert.equal((await db.query(`select public.org_role('${org}') role, public.org_role('${otherOrg}') other_role`)).rows[0].other_role,null)});
 await db.exec(`reset role; update profiles set status='suspended' where id='${user}'; set role authenticated;`);
 await test('suspended teacher no longer resolves membership or creator privilege',async()=>{const r=await db.query(`select public.org_role('${org}') role, public.is_org_member('${org}') member, public.can_create_content('${org}') creator`);assert.deepEqual(r.rows[0],{role:null,member:false,creator:false})});
 await test('suspended teacher cannot select, update or insert protected tenant records',async()=>{assert.equal((await db.query('select * from exams')).rows.length,0);assert.equal((await db.query("update exams set title='denied' returning id")).rows.length,0);await assert.rejects(()=>db.exec(`insert into exams values ('00000000-0000-4000-8000-000000000022','${org}','No')`),/row-level security/)});
 await db.exec(`reset role; update profiles set status='active' where id='${user}'; update organization_members set status='suspended' where user_id='${user}'; set role authenticated;`);
 await test('inactive membership remains denied even with an active profile',async()=>{assert.equal((await db.query(`select org_role('${org}') role`)).rows[0].role,null);assert.equal((await db.query('select * from exams')).rows.length,0)});
 await db.exec(`select set_config('test.uid','${superId}',false);`);
 await test('active Super Admin retains cross-tenant administrative access',async()=>{assert.equal((await db.query('select * from exams')).rows.length,2);assert.equal((await db.query(`select org_role('${otherOrg}') role`)).rows[0].role,'owner')});
 await db.exec(`reset role; update profiles set status='suspended' where id='${superId}'; set role authenticated;`);
 await test('suspended Super Admin with membership cannot fall back to tenant privileges',async()=>{assert.equal((await db.query(`select org_role('${org}') role`)).rows[0].role,null);assert.equal((await db.query('select * from exams')).rows.length,0)});
 await db.exec('reset role; set role service_role');
 await test('service role retains RLS-bypassing operational access',async()=>{assert.equal((await db.query('select * from exams')).rows.length,2)});
 console.log(`\n${n} active-profile RLS checks passed (isolated PGlite; actual migration).`);
}finally{await db.close()}
