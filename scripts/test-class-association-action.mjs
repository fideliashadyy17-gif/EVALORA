// Real Super Admin class action with mocked database/authorization boundaries.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Module} from 'node:module';
import path from 'node:path';
import ts from 'typescript';
const file=path.resolve('scripts/__virtual_class_action.cjs');let allow,rpcError,rpcCalls,writes,audits;
function setup(){allow=true;rpcError=false;rpcCalls=[];writes=[];audits=[]}
const admin={from(table){const q={select(){return q},eq(){return q},neq(){return q},is(){return q},ilike(){return q},limit(){return q},update(payload){writes.push({table,payload});return q},insert(payload){writes.push({table,payload});return q},async single(){return {data:{id:'class'},error:null}},async maybeSingle(){return {data:null,error:null}}};return q},async rpc(name,args){rpcCalls.push({name,args});return {error:rpcError?{message:'failure'}:null}}};
const original=Module._load;Module._load=function(id,parent){if(parent?.filename===file){if(id==='@/lib/admin')return {requireSuperAdmin:async()=>{if(!allow)throw Error('denied');return {user:{id:'admin'}}},audit:async(...x)=>audits.push(x),fstr:(f,k,max)=>String(f.get(k)??'').trim().slice(0,max)||null,fint:(f,k)=>{const n=parseInt(String(f.get(k)??''),10);return Number.isFinite(n)?n:null}};if(id==='@/lib/supabase/server')return {createAdminClient:()=>admin};if(id==='next/cache')return {revalidatePath:()=>{}};if(id==='next/navigation')return {redirect:(url)=>{const e=Error(url);e.url=url;throw e}}}return original.apply(this,arguments)};
const m=new Module(file);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));m._compile(ts.transpileModule(readFileSync('src/app/admin/classes/actions.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);Module._load=original;
function form(){const f=new FormData();f.set('organization_id','org');f.set('id','class');f.set('name','Class');f.set('associations_present','1');f.append('subject_ids','subject1');f.append('programme_ids','prog1');f.set('course_prog1','Course');f.set('review_prog1','1');return f}
async function run(f=form()){try{await m.exports.saveGlobalClass(f);throw Error('expected redirect')}catch(e){if(!e.url)throw e;return e.url}}
let n=0;async function test(name,fn){setup();await fn();n++;console.log(`  ✓ ${name}`)}
await test('requires Super Admin before writes',async()=>{allow=false;await assert.rejects(()=>run(),/denied/);assert.equal(writes.length,0)});
await test('passes linked selections to single RPC and audits on success',async()=>{assert.match(await run(),/ok=saved/);assert.equal(rpcCalls.length,1);assert.equal(rpcCalls[0].name,'replace_class_associations');assert.deepEqual(rpcCalls[0].args,{p_class_id:'class',p_organization_id:'org',p_subject_ids:['subject1'],p_programmes:[{id:'prog1',course_label:'Course',needs_review:true}]});assert.equal(audits.length,1)});
await test('RPC failure reports partial class save without claiming association success',async()=>{rpcError=true;assert.match(await run(),/e=associations_failed/);assert.equal(writes.length,1);assert.equal(audits.length,0)});
await test('missing association form does not modify links',async()=>{const f=form();f.delete('associations_present');assert.match(await run(f),/ok=saved/);assert.equal(rpcCalls.length,0)});
console.log(`\n${n} class association action checks passed (mocked DB/auth).`);
