// Actual state handler, with mocked DB and exam helpers. No live DB or browser.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Module} from 'node:module';
import path from 'node:path';
import ts from 'typescript';
const file=path.resolve('scripts/__virtual_exam_state.cjs');
let observed=[];
const attemptWindow=(exam,attempt)=>({deadlineMs:Date.now()+600000,deadline:new Date(Date.now()+600000).toISOString(),reached:false,remainingMs:600000,boundBy:'duration',nowMs:Date.now()});
const context={attempt:{id:'a',status:'in_progress',started_at:new Date().toISOString(),extension_minutes:0,flagged:[],score:null,max_score:null},exam:{id:'e',title:'Exam',settings:{}},candidate:{id:'c',full_name:'Candidate'}};
const admin={from:()=>({select:()=>({eq:async()=>({data:[]})})})};
const original=Module._load;
Module._load=function(request,parent){
 if(parent?.filename===file){
  if(request==='@/lib/exam') return {loadAttemptContext:async(_db,id,token)=>{observed.push({id,token});return token==='right'?structuredClone(context):null;},attemptDeadline:()=>new Date(Date.now()+600000),attemptRows:async()=>[],gradeAttempt:async()=>({score:0,max:0})};
  if(request==='@/lib/live') return {publicQuestion:()=>({})};
  if(request==='@/lib/examResults') return {buildExamResult:()=>({})};
  if(request==='@/lib/integrity') return {parseIntegrityPolicy:()=>({enabled:true,tabSwitch:true,focusLoss:true,fullscreen:true,clipboard:true,sound:true,warnAfter:3,reviewAfter:5})};
  // The deadline and submission rules live in their own modules so that no route
  // can hold a private copy of them; this suite only exercises credentials, so it
  // supplies a deadline that is always in the future.
  if(request==='@/lib/examPause') return {isManuallyPaused:()=>false,manualPauseMs:()=>0,pauseNoticeKind:()=>null,parsePauseReasons:()=>[]};
  if(request==='@/lib/examDeadline') return {submissionWindow:(exam,attempt)=>attemptWindow(exam,attempt),attemptDeadlineInstant:()=>Date.now()+600000,deadlineReached:()=>false};
  if(request==='@/lib/examSubmission') return {applyDeadlineSubmission:async()=>({outcome:'already_closed',status:'in_progress',submittedAt:null,deadline:new Date(Date.now()+600000).toISOString(),autoSubmitted:false,score:null,max:null,window:attemptWindow(context.exam,context.attempt)})};
  if(request==='@/lib/examHintsServer') return {loadPublishedHints:async()=>new Map()};
  if(request==='@/lib/supabase/server') return {createAdminClient:()=>admin};
  if(request==='next/server') return {NextResponse:{json:(body,options)=>({body,status:options?.status??200,headers:options?.headers??{}})}};
 }
 return original.apply(this,arguments);
};
const mod=new Module(file);mod.filename=file;mod.paths=Module._nodeModulePaths(path.dirname(file));mod._compile(ts.transpileModule(readFileSync('src/app/api/exam/state/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);Module._load=original;
const {GET}=mod.exports;
function req(query,auth){return new Request('https://example.test/api/exam/state?'+query,{headers:auth?{Authorization:auth}:{}});}
let checks=0;
async function test(name,fn){await fn();checks++;console.log(`  ✓ ${name}`);}
await test('bearer header authenticates and response cannot be cached',async()=>{const r=await GET(req('attempt_id=a','Bearer right'));assert.equal(r.status,200);assert.equal(r.headers['Cache-Control'],'private, no-store');assert.deepEqual(observed.at(-1),{id:'a',token:'right'});});
await test('legacy query token remains supported',async()=>{assert.equal((await GET(req('attempt_id=a&token=right'))).status,200);});
await test('header takes precedence over query token',async()=>{const r=await GET(req('attempt_id=a&token=right','Bearer wrong'));assert.equal(r.status,404);assert.equal(r.headers['Cache-Control'],'private, no-store');assert.equal(observed.at(-1).token,'wrong');});
await test('invalid authorization does not fall back to query token',async()=>{const before=observed.length;const r=await GET(req('attempt_id=a&token=right','Basic right'));assert.equal(r.status,400);assert.equal(observed.length,before);assert.equal(r.headers['Cache-Control'],'private, no-store');});
await test('missing credentials fail without querying attempt',async()=>{const before=observed.length;assert.equal((await GET(req('attempt_id=a'))).status,400);assert.equal(observed.length,before);});
console.log(`\n${checks} examination state credential checks passed (mocked DB).`);
