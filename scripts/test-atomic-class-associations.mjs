// Isolated PostgreSQL-compatible PGlite fixture. No production data or network.
// Optional dependency: npm install --no-save --package-lock=false @electric-sql/pglite@0.5.15
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const db=new PGlite();
const id={org:'00000000-0000-4000-8000-000000000001',other:'00000000-0000-4000-8000-000000000002',cls:'00000000-0000-4000-8000-000000000003',s1:'00000000-0000-4000-8000-000000000004',s2:'00000000-0000-4000-8000-000000000005',sForeign:'00000000-0000-4000-8000-000000000006',p1:'00000000-0000-4000-8000-000000000007',p2:'00000000-0000-4000-8000-000000000008',pForeign:'00000000-0000-4000-8000-000000000009'};
await db.exec(`create role anon; create role authenticated; create role service_role;
create table public.classes(id uuid primary key,organization_id uuid not null);
create table public.subjects(id uuid primary key,organization_id uuid not null);
create table public.curriculum_programmes(id uuid primary key,organization_id uuid not null);
create table public.class_subjects(class_id uuid references public.classes(id),subject_id uuid references public.subjects(id),primary key(class_id,subject_id));
create table public.class_curricula(class_id uuid references public.classes(id),programme_id uuid references public.curriculum_programmes(id),course_label text,needs_review boolean not null default false,primary key(class_id,programme_id));
grant select,insert,update,delete on all tables in schema public to service_role;`);
await db.exec(readFileSync('supabase/migrations/0023_atomic_class_associations.sql','utf8'));
await db.query('insert into classes values ($1,$2)',[id.cls,id.org]);
for(const [value,org] of [[id.s1,id.org],[id.s2,id.org],[id.sForeign,id.other]])await db.query('insert into subjects values($1,$2)',[value,org]);
for(const [value,org] of [[id.p1,id.org],[id.p2,id.org],[id.pForeign,id.other]])await db.query('insert into curriculum_programmes values($1,$2)',[value,org]);
async function replace(subjects,programmes,org=id.org){return db.query('select public.replace_class_associations($1,$2,$3::uuid[],$4::jsonb)',[id.cls,org,subjects,JSON.stringify(programmes)])}
const prog=(v,label='course')=>({id:v,course_label:label,needs_review:true});
async function snapshot(){return {subjects:(await db.query('select subject_id::text from class_subjects order by subject_id')).rows,curricula:(await db.query('select programme_id::text,course_label,needs_review from class_curricula order by programme_id')).rows}}
let count=0;async function test(name,fn){await fn();count++;console.log(`  ✓ ${name}`)}
try {
 await test('existing links are created and then replaced together',async()=>{await replace([id.s1],[prog(id.p1)]);await replace([id.s2],[prog(id.p2,' new ')]);assert.deepEqual(await snapshot(),{subjects:[{subject_id:id.s2}],curricula:[{programme_id:id.p2,course_label:'new',needs_review:true}]})});
 await test('invalid organization cannot alter links',async()=>{const before=await snapshot();await assert.rejects(()=>replace([id.s1],[prog(id.p1)],id.other));assert.deepEqual(await snapshot(),before)});
 await test('foreign or duplicated subject is rejected without changes',async()=>{const before=await snapshot();await assert.rejects(()=>replace([id.sForeign],[prog(id.p1)]));await assert.rejects(()=>replace([id.s1,id.s1],[prog(id.p1)]));assert.deepEqual(await snapshot(),before)});
 await test('foreign, duplicated and invalid programme rejected without changes',async()=>{const before=await snapshot();await assert.rejects(()=>replace([id.s1],[prog(id.pForeign)]));await assert.rejects(()=>replace([id.s1],[prog(id.p1),prog(id.p1)]));await assert.rejects(()=>replace([id.s1],[{id:id.p1,needs_review:null}]));assert.deepEqual(await snapshot(),before)});
 await test('failure after subject writes rolls back both sets',async()=>{await db.exec(`create function pg_temp.reject_curriculum() returns trigger language plpgsql as $$ begin raise exception 'simulated failure'; end $$; create trigger reject_curriculum before insert or update on class_curricula for each row execute function pg_temp.reject_curriculum();`);const before=await snapshot();await assert.rejects(()=>replace([id.s1],[prog(id.p1)]),/simulated failure/);assert.deepEqual(await snapshot(),before);await db.exec('drop trigger reject_curriculum on class_curricula')});
 await test('empty selections intentionally clear links',async()=>{await replace([],[]);assert.deepEqual(await snapshot(),{subjects:[],curricula:[]})});
 await test('ordinary authenticated role cannot call service-only function',async()=>{await db.exec('set role authenticated');await assert.rejects(()=>replace([],[]),/permission denied/);await db.exec('reset role')});
 await test('service role can invoke function',async()=>{await db.exec('set role service_role');await replace([id.s1],[prog(id.p1)]);await db.exec('reset role');assert.equal((await snapshot()).subjects.length,1)});
 console.log(`\n${count} atomic class association checks passed (isolated PostgreSQL-compatible PGlite fixture).`);
} finally {await db.close()}
