// Exercises the workspace question save action with a mocked tenant/database.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Module} from 'node:module';
import path from 'node:path';
import ts from 'typescript';
const file=path.resolve('scripts/__virtual_question_action.cjs');
let org={id:'org-a',role:'teacher'}, canEdit=true, category={id:'cat-a'}, categoryError=null, optionDeleteError=null, optionReadError=null, oldOptions=[{label:'Old',is_correct:true,position:0,content_doc:null}], writes=[];
const db={from(table){const query={filters:[],select(){return this;},eq(key,value){this.filters.push([key,value]);return this;},maybeSingle:async()=>{
 if(table==='questions') return {data:{prompt_hash:null},error:null};
 if(table==='question_categories') { assert.ok(query.filters.some(([k,v])=>k==='organization_id'&&v==='org-a')); return {data:category,error:categoryError}; }
 throw Error('unexpected query '+table);
},order(){return this;},insert(payload){writes.push({table,insert:payload});return this;},update(payload){writes.push({table,payload});return this;},delete(){writes.push({table,delete:true});this.deleting=true;return this;},then(resolve){return Promise.resolve(table==='question_options'&&!this.deleting?{data:oldOptions,error:optionReadError}:{error:table==='question_options'&&this.deleting?optionDeleteError:null}).then(resolve);}};return query;}};
const contentFile=path.resolve('scripts/__question_content.cjs'),content=new Module(contentFile);content.filename=contentFile;content.paths=Module._nodeModulePaths(path.dirname(contentFile));
const graphStub={graphSpecHasWork:()=>false,graphSpecSummary:()=>'',normaliseGraphSpec:(v)=>v};
const geometryStub={geometrySpecHasWork:()=>false,geometrySpecSummary:()=>'',normaliseGeometrySpec:(v)=>v};
const statsStub={statsSpecHasWork:()=>false,statsSpecSummary:()=>'',normaliseStatsSpec:(v)=>v};
const tableStub={dataTableHasWork:()=>false,dataTableSummary:()=>'',normaliseDataTableSpec:(v)=>v};
const assessStub={assessDiagramSummary:()=>'',normaliseAssessDiagram:(v)=>v};
const contentBefore=Module._load;Module._load=function(req,parent){if(parent?.filename===contentFile&&req==='./graphSpec')return graphStub;if(parent?.filename===contentFile&&req==='./geometrySpec')return geometryStub;if(parent?.filename===contentFile&&req==='./statsSpec')return statsStub;if(parent?.filename===contentFile&&req==='./dataTableSpec')return tableStub;if(parent?.filename===contentFile&&req==='./assessDiagram')return assessStub;return contentBefore.apply(this,arguments)};
try{content._compile(ts.transpileModule(readFileSync('src/lib/content.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,contentFile);}finally{Module._load=contentBefore;}
const helperFile=path.resolve('scripts/__question_options.cjs'),helper=new Module(helperFile);helper.filename=helperFile;helper.paths=Module._nodeModulePaths(path.dirname(helperFile));const beforeHelper=Module._load;Module._load=function(req,parent){if(parent?.filename===helperFile&&req==='./content')return content.exports;return beforeHelper.apply(this,arguments)};try{helper._compile(ts.transpileModule(readFileSync('src/lib/questionOptions.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,helperFile)}finally{Module._load=beforeHelper};
const original=Module._load;
Module._load=function(request,parent){if(parent?.filename===file){
 if(request==='@/lib/auth')return {requireUser:async()=>({user:{id:'user'}}),activeOrg:()=>org,can:()=>canEdit,CREATOR_ROLES:['owner','admin','teacher','organizer']};
 if(request==='@/lib/entitlements')return {};
 if(request==='@/lib/questionOptions')return helper.exports;
 if(request==='@/lib/questionValidation')return {questionPublishError:()=>null};
 if(request==='@/lib/questionGeneration')return {normalizePrompt:(s)=>s};
 if(request==='@/lib/supabase/server')return {createClient:async()=>db};
 if(request==='next/cache')return {revalidatePath:()=>{}};
 if(request==='next/navigation')return {redirect:()=>{throw Error('unexpected redirect');}};
}return original.apply(this,arguments);};
const mod=new Module(file);mod.filename=file;mod.paths=Module._nodeModulePaths(path.dirname(file));mod._compile(ts.transpileModule(readFileSync('src/app/dashboard/questions/actions.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);Module._load=original;
const {saveQuestion}=mod.exports;
const question={id:'q-a',type:'short_answer',prompt:'What?',points:1,difficulty:'easy',status:'draft',category_id:'cat-a',options:[]};
let checks=0;async function test(name,fn){await fn();checks++;console.log(`  ✓ ${name}`);}
await test('wrong tenant or no active workspace denied without writing',async()=>{org=null;writes=[];assert.match((await saveQuestion(question)).error,/permission/);assert.equal(writes.length,0);org={id:'org-a',role:'teacher'};});
await test('non-creator denied without writing',async()=>{canEdit=false;writes=[];assert.match((await saveQuestion(question)).error,/permission/);assert.equal(writes.length,0);canEdit=true;});
await test('foreign or missing category denied before modifying question',async()=>{category=null;writes=[];assert.match((await saveQuestion(question)).error,/category/);assert.equal(writes.length,0);});
await test('category query failure fails closed',async()=>{category={id:'cat-a'};categoryError={message:'database unavailable'};writes=[];assert.match((await saveQuestion(question)).error,/category/);assert.equal(writes.length,0);categoryError=null;});
await test('same-tenant category remains usable',async()=>{writes=[];assert.equal((await saveQuestion(question)).ok,true);assert.equal(writes[0].payload.category_id,'cat-a');});
await test('question without category remains usable',async()=>{writes=[];assert.equal((await saveQuestion({...question,category_id:null})).ok,true);assert.equal(writes[0].payload.category_id,null);});
await test('option delete failure reports partial update rather than success',async()=>{optionDeleteError={message:'write failed'};writes=[];const result=await saveQuestion(question);assert.match(result.error,/details were saved.*options could not be replaced/i);assert.equal(writes.length,2);optionDeleteError=null;});
await test('unchanged options are not deleted or reinserted for metadata edits',async()=>{writes=[];const result=await saveQuestion({...question,options:[{label:'Old',is_correct:true}]});assert.equal(result.ok,true);assert.equal(writes.filter(w=>w.table==='question_options').length,0);});
await test('legacy text options keep IDs after form creates equivalent rich documents',async()=>{writes=[];const result=await saveQuestion({...question,options:[{label:'Old',is_correct:true,content_doc:content.exports.textToDoc('Old')}]});assert.equal(result.ok,true);assert.equal(writes.filter(w=>w.table==='question_options').length,0);});
await test('option load failure occurs before detail updates',async()=>{writes=[];optionReadError={message:'read failed'};assert.match((await saveQuestion(question)).error,/options could not be loaded/i);assert.equal(writes.length,0);optionReadError=null;});
console.log(`\n${checks} question metadata permission checks passed (mocked auth/database).`);
