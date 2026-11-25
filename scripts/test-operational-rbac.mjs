// Execute the real operational-access helper with isolated service boundaries.
import {readFileSync} from 'node:fs';
import {Module} from 'node:module';
import path from 'node:path';
import ts from 'typescript';
import assert from 'node:assert/strict';
const file=path.resolve('scripts/__operational_rbac.cjs');
let grant=true,moduleOn=true,unavailable=false,reads=0;
const ctx={profile:{id:'synthetic-user',status:'active',platform_role:'user'}};
const original=Module._load;
Module._load=function(request,parent){
 if(parent?.filename===file){
  if(request==='server-only')return {};
  if(request==='./rbac')return {hasPermission:async(c,o,k)=>{assert.equal(c,ctx);assert.equal(o,'synthetic-org');assert.equal(k,'competitions.edit');if(unavailable)throw Error('offline');return grant;}};
  if(request==='./supabase/server')return {createClient:async()=>({})};
  if(request==='./entitlements')return {getEntitlementFor:async()=>{reads++;return {modules:{competitions:moduleOn}};}};
  if(request==='./modules')return {moduleEnabled:(m,k)=>m[k]!==false};
 }
 return original.apply(this,arguments);
};
let helper;
try{const m=new Module(file);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));m._compile(ts.transpileModule(readFileSync('src/lib/operationalAccess.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);helper=m.exports;}finally{Module._load=original;}
const allowed=()=>helper.canOperate(ctx,'synthetic-org','competitions.edit','competitions');
let checks=0;
assert.equal(await allowed(),true);checks++;
moduleOn=false;assert.equal(await allowed(),false);checks++;
moduleOn=true;grant=false;reads=0;assert.equal(await allowed(),false);assert.equal(reads,0);checks++;
grant=true;unavailable=true;assert.equal(await allowed(),false);checks++;
unavailable=false;assert.equal(await allowed(),true);checks++;
ctx.profile.platform_role='super_admin';grant=false;assert.equal(await allowed(),false);checks++;
console.log(`${checks} checks passed (operational RBAC permission/module intersection, mocked services).`);
