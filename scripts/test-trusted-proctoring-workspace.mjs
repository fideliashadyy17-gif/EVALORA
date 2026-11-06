// Test the actual additive migration and an equivalent role policy in isolated PGlite.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const sql=readFileSync('supabase/migrations/0028_trusted_proctoring_workspace.sql','utf8');
const db=new PGlite();
let n=0;async function test(name,fn){await fn();n++;console.log('  ✓ '+name);}
try {
 await db.exec(`create role authenticated; create table profiles (id uuid primary key,is_primary boolean,platform_role text,status text);
 create table organizations (id uuid primary key,slug text,owner_id uuid,settings jsonb);
 create table platform_settings (key text primary key,value jsonb not null,updated_at timestamptz default now());
 alter table platform_settings enable row level security;
 create function is_super_admin() returns boolean language sql stable as $$select current_setting('test.super',true) = 'yes'$$;
 create policy read_settings on platform_settings for select to authenticated using(true);
 create policy write_settings on platform_settings for all to authenticated using(is_super_admin()) with check(is_super_admin());
 grant select,insert,update on platform_settings to authenticated;
 insert into profiles values ('00000000-0000-4000-8000-000000000001',true,'super_admin','active'), ('00000000-0000-4000-8000-000000000002',false,'user','active');
 insert into organizations values ('00000000-0000-4000-8000-000000000003','evalora-platform','00000000-0000-4000-8000-000000000001','{"platform_owned":true}'), ('00000000-0000-4000-8000-000000000004','tenant','00000000-0000-4000-8000-000000000002','{"platform_owned":true}');`);
 await test('migration selects the true primary platform organization, not tenant-editable flags',async()=>{await db.exec(sql);let r=await db.query("select value->>'organization_id' id from platform_settings where key='proctoring_owner_workspace'");assert.equal(r.rows[0].id,'00000000-0000-4000-8000-000000000003');});
 await test('replay does not overwrite an existing owner decision',async()=>{await db.exec("update platform_settings set value='{}' where key='proctoring_owner_workspace';");await db.exec(sql);const r=await db.query("select value from platform_settings where key='proctoring_owner_workspace'");assert.deepEqual(r.rows[0].value,{});});
 await test('ordinary authenticated account cannot change trusted setting',async()=>{await db.exec("set role authenticated; select set_config('test.super','no',false);");const r=await db.query("update platform_settings set value='{}' where key='proctoring_owner_workspace' returning key");assert.equal(r.rows.length,0);await db.exec('reset role');});
 await test('Super Admin can configure setting',async()=>{await db.exec("set role authenticated; select set_config('test.super','yes',false);");const r=await db.query("update platform_settings set value='{}' where key='proctoring_owner_workspace' returning key");assert.equal(r.rows.length,1);await db.exec('reset role');});
 await test('missing or inactive primary workspace fails closed',async()=>{await db.exec("delete from platform_settings where key='proctoring_owner_workspace'; update profiles set status='suspended' where is_primary;");await db.exec(sql);const r=await db.query("select key from platform_settings where key='proctoring_owner_workspace'");assert.equal(r.rows.length,0);});
 console.log(`\n${n} trusted proctoring migration checks passed (isolated PGlite).`);
}finally{await db.close();}
