// Actual profile trigger migration in isolated PGlite, exercising a non-postgres session_user.
import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {PGlite} from '@electric-sql/pglite';
const db=new PGlite(),sql=readFileSync('supabase/migrations/0029_protect_profile_status.sql','utf8');let n=0;async function test(name,fn){await fn();n++;console.log('  ✓ '+name)}
try{
 await db.exec(`create role authenticator; create role authenticated; create role service_role bypassrls; grant authenticated,service_role to authenticator;
 create table public.profiles(id uuid primary key,full_name text,platform_role text,status text,is_primary boolean not null default false);
 alter table public.profiles enable row level security;
 create policy prof_select on profiles for select to authenticated using (id=current_setting('test.uid',true)::uuid);
 create policy prof_update on profiles for update to authenticated using (id=current_setting('test.uid',true)::uuid) with check(id=current_setting('test.uid',true)::uuid);
 grant select,update,delete on profiles to authenticated,service_role;
 insert into profiles values ('00000000-0000-4000-8000-000000000001','Suspended user','user','suspended',false),('00000000-0000-4000-8000-000000000002','Primary','super_admin','active',true);`);
 await db.exec(sql);await db.exec('create trigger profiles_protect_privileges before update or delete on profiles for each row execute function public.protect_profile_privileges();');
 await db.exec(`set session authorization authenticator; set role authenticated; select set_config('test.uid','00000000-0000-4000-8000-000000000001',false);`);
 await test('authenticated session can still change ordinary profile details',async()=>{await db.exec("update profiles set full_name='New Name' where id='00000000-0000-4000-8000-000000000001'");assert.equal((await db.query('select full_name from profiles')).rows[0].full_name,'New Name');});
 await test('suspended account cannot reactivate itself',async()=>{await assert.rejects(()=>db.exec("update profiles set status='active' where id='00000000-0000-4000-8000-000000000001'"),/Account status/);});
 await test('ordinary account cannot grant itself platform role or primary status',async()=>{await assert.rejects(()=>db.exec("update profiles set platform_role='super_admin' where id='00000000-0000-4000-8000-000000000001'"),/Platform privileges/);await assert.rejects(()=>db.exec("update profiles set is_primary=true where id='00000000-0000-4000-8000-000000000001'"),/Platform privileges/);});
 await test('RLS prevents updates to a different profile',async()=>{const result=await db.query("update profiles set full_name='Modified' where id='00000000-0000-4000-8000-000000000002' returning id");assert.equal(result.rows.length,0);});
 await test('primary account remains protected from ordinary deletion',async()=>{await db.exec("select set_config('test.uid','00000000-0000-4000-8000-000000000002',false); create policy temp_delete on profiles for delete to authenticated using (id=current_setting('test.uid',true)::uuid)").catch(()=>{}); /* policy creation is not allowed by this role */
 // Isolated fixture policy is created as owner for this test.
 await db.exec('reset session authorization');await db.exec("create policy fixture_delete on profiles for delete to authenticated using (id=current_setting('test.uid',true)::uuid)");await db.exec("set session authorization authenticator; set role authenticated; select set_config('test.uid','00000000-0000-4000-8000-000000000002',false)");await assert.rejects(()=>db.exec("delete from profiles where id='00000000-0000-4000-8000-000000000002'"),/Primary Super Admin/);});
 await test('authorized service role retains role and status management',async()=>{await db.exec('set role service_role');await db.exec("update profiles set status='active',platform_role='super_admin' where id='00000000-0000-4000-8000-000000000001'");const r=await db.query("select status,platform_role from profiles where id='00000000-0000-4000-8000-000000000001'");assert.equal(r.rows[0].status,'active');assert.equal(r.rows[0].platform_role,'super_admin');});
 console.log(`\n${n} profile privilege trigger checks passed (isolated PGlite; non-postgres session_user).`);
}finally{await db.close();}
