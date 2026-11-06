// Exercises the real extraction route with mocked session and parser boundaries.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Module } from 'node:module';
import path from 'node:path';
import ts from 'typescript';
const file=path.resolve('scripts/__virtual_extract_route.cjs');
let ctx=null, parsed=0, bodies=0;
const roles=['owner','admin','teacher','organizer'];
const auth={getSessionContext:async()=>ctx,CREATOR_ROLES:roles,activeOrg:(c)=>c.tenantDenied ? null : (c.org??null),can:(c,id,allowed)=>c.profile.platform_role==='super_admin'||(c.org?.id===id&&allowed.includes(c.org.role))};
const original=Module._load;
Module._load=function(request,parent){
 if(parent?.filename===file){
  if(request==='@/lib/auth') return auth;
  if(request==='@/lib/extractServer') return {IMPORT_FILE_EXTENSIONS:['.csv','.xlsx'],extractStudentRows:async()=>{parsed++;return {rows:[['Name']],method:'csv',warnings:[],needsOcr:false};}};
  if(request==='next/server') return {NextResponse:{json:(body,opts)=>({status:opts?.status??200,body})}};
 }
 return original.apply(this,arguments);
};
const mod=new Module(file); mod.filename=file; mod.paths=Module._nodeModulePaths(path.dirname(file)); mod._compile(ts.transpileModule(readFileSync('src/app/api/students/import/extract/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file); Module._load=original;
const {POST}=mod.exports;
const session=(role='teacher',status='active')=>({profile:{platform_role:'user',status},org:role?{id:'org',role}:null});
const makeRequest=(name='students.csv',size=3)=>({formData:async()=>{bodies++;return {get:()=>({name,size,arrayBuffer:async()=>Buffer.from('abc')})};}});
let checks=0;
async function test(name,fn){await fn(); console.log(`  ✓ ${name}`);checks++;}
await test('unauthenticated caller denied before reading upload',async()=>{ctx=null;const before=bodies;assert.equal((await POST(makeRequest())).status,401);assert.equal(bodies,before);});
for(const role of ['student','supervisor','corrector',null]) await test(`${role??'no organization'} denied before parsing`,async()=>{ctx=session(role);const a=parsed,b=bodies;assert.equal((await POST(makeRequest())).status,403);assert.equal(parsed,a);assert.equal(bodies,b);});
await test('suspended and wrong-tenant callers denied',async()=>{for(const c of [session('owner','suspended'),{...session('owner'),tenantDenied:true},{profile:{platform_role:'super_admin',status:'suspended'}}]) {ctx=c;assert.equal((await POST(makeRequest())).status,403);}});
for(const role of roles) await test(`${role} allowed to extract`,async()=>{ctx=session(role);assert.equal((await POST(makeRequest())).status,200);});
await test('active super admin can extract from cross-organization wizard',async()=>{ctx={profile:{platform_role:'super_admin',status:'active'},org:null};assert.equal((await POST(makeRequest())).status,200);});
await test('oversized and unsupported files rejected before parser',async()=>{ctx=session();const before=parsed;assert.equal((await POST(makeRequest('a.xlsx',11*1024*1024))).status,413);assert.equal((await POST(makeRequest('a.exe'))).status,415);assert.equal(parsed,before);});
console.log(`\n${checks} student extraction route checks passed (mocked session/parser).`);
