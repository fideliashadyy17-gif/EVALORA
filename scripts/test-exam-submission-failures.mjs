// Exercise real exam submission and state handlers against mocked grading and DB.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Module} from 'node:module';
import path from 'node:path';
import ts from 'typescript';
let scenario;
const ids={attempt:'00000000-0000-4000-8000-000000000001',token:'00000000-0000-4000-8000-000000000002'};
function setup(){scenario={expired:false,rowsFail:false,gradeFail:false,closeFail:false,closeMissing:false,candidateFail:false,savedFail:false,status:'in_progress',closed:0,graded:0,candidateWrites:0,paused:false};}
const admin={from(table){if(table==='exam_attempts')return {select(){return {eq(){return this},async maybeSingle(){return {data:null,error:null}}}},update(){return {eq(){return this},select(){return this},async maybeSingle(){scenario.closed++;return {data:scenario.closeMissing||scenario.closeFail?null:{id:ids.attempt},error:scenario.closeFail?{}:null}}}}};if(table==='exam_candidates')return {update(){return {async eq(){scenario.candidateWrites++;return {error:scenario.candidateFail?{}:null}}}}};if(table==='exam_answers')return {select(){return {async eq(){return scenario.savedFail?{data:null,error:{}}:{data:[],error:null}}}}};if(table==='exam_presence')return {select(){return {eq(){return this},async maybeSingle(){return {data:{attempt_id:ids.attempt,last_seen_at:new Date().toISOString()},error:null}}}}};throw Error('Unexpected table '+table)}};
// The routes no longer compute a deadline themselves: they read this module.
const attemptDeadlineAt=()=>new Date(Date.now()+(scenario.expired?-60000:60000));
const deadlineHelpers={
  attemptDeadlineInstant:(exam,started,ext)=>attemptDeadlineAt().getTime(),
  attemptDeadline:attemptDeadlineAt,
  deadlineReached:(deadline,now)=>now>=(deadline instanceof Date?deadline.getTime():deadline),
  submissionWindow:()=>({deadlineMs:attemptDeadlineAt().getTime(),deadline:attemptDeadlineAt().toISOString(),reached:scenario.expired&&!scenario.withinMargin,remainingMs:scenario.expired?0:60000,boundBy:'duration',nowMs:Date.now()}),
  remainingMs:()=>0,
};
const examHelpers={async loadAttemptContext(_admin,id,token){if(id!==ids.attempt||token!==ids.token)return null;return {attempt:{id,status:scenario.status,started_at:new Date().toISOString(),flagged:[],score:null,max_score:null},exam:{id:'exam',settings:{results_published:false}},candidate:{id:'candidate',full_name:'Name'}}},attemptDeadline(){return new Date(Date.now()+(scenario.expired?-60000:60000))},async attemptRows(){if(scenario.rowsFail)throw Error('unavailable');return []},async gradeAttempt(){scenario.graded++;if(scenario.gradeFail)throw Error('grade failure');return {score:2,max:5}}};
function compile(src,filename){const file=path.resolve(filename),m=new Module(file),old=Module._load;m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));Module._load=function(request,parent){if(parent?.filename===file){if(request==='@/lib/exam')return examHelpers;if(request==='@/lib/examDeadline')return deadlineHelpers;if(request==='@/lib/examPause')return pauseHelpers;if(request==='@/lib/connectionLost')return {resumeConnectionPause:async()=>null,isConnectionLost:()=>false,connectionLostAnchor:()=>null,pauseForConnectionLost:async()=>null};if(request==='@/lib/examSubmission')return submissionModule;if(request==='@/lib/live')return {publicQuestion:()=>({})};if(request==='@/lib/examResults')return {buildExamResult:()=>({})};if(request==='@/lib/integrity')return {parseIntegrityPolicy:()=>({enabled:true,tabSwitch:true,focusLoss:true,fullscreen:true,clipboard:true,sound:true,warnAfter:3,reviewAfter:5})};if(request==='@/lib/examHintsServer')return {loadPublishedHints:async()=>new Map()};if(request==='@/lib/supabase/server')return {createAdminClient:()=>admin};if(request==='next/server')return {NextResponse:{json:(body,init)=>Response.json(body,init)}}}return old.apply(this,arguments)};try{m._compile(ts.transpileModule(readFileSync(src,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);return m.exports}finally{Module._load=old}}
// Real manual-pause rules, driven by the scenario flag: a paused attempt is
// refused by submit and never auto-closed by the state route.
const pauseHelpers={
  isManuallyPaused:(a)=>Boolean(scenario?.paused)||(Array.isArray(a?.pause_reasons)&&a.pause_reasons.length>0),
  hasOrganizerPause:(a)=>Boolean(scenario?.paused)||(Array.isArray(a?.pause_reasons)&&a.pause_reasons.some((r)=>r==='assessment'||r==='student')),
  hasConnectionPause:(a)=>Array.isArray(a?.pause_reasons)&&a.pause_reasons.includes('connection'),
  manualPauseMs:()=>0,
  pauseNoticeKind:(a)=>scenario?.paused?(Array.isArray(a?.pause_reasons)&&a.pause_reasons.includes('student')?'student':'assessment'):null,
  parsePauseReasons:(v)=>Array.isArray(v)?v.filter((x)=>x==='assessment'||x==='student'):[] ,
};
const deadlineModule=deadlineHelpers;
let submissionModule=null;
function compileWith(src,name,deps){const file=path.resolve(name),m=new Module(file),old=Module._load;m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));Module._load=function(id,parent){if(parent?.filename===file&&id in deps)return deps[id];return old.apply(this,arguments)};try{m._compile(ts.transpileModule(readFileSync(src,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);return m.exports}finally{Module._load=old}}
submissionModule=compileWith('src/lib/examSubmission.ts','scripts/__virtual_submission_failure.cjs',{'./examDeadline':deadlineModule,'./examPause':pauseHelpers,'./exam':examHelpers});
const {GET}=compile('src/app/api/exam/state/route.ts','scripts/__virtual_state_failure.cjs');const {POST}=compile('src/app/api/exam/submit/route.ts','scripts/__virtual_submit_failure.cjs');
const state=()=>GET(new Request(`https://test.invalid/api/exam/state?attempt_id=${ids.attempt}`,{headers:{authorization:`Bearer ${ids.token}`}}));
const submit=()=>POST(new Request('https://test.invalid/api/exam/submit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({attempt_id:ids.attempt,token:ids.token})}));
let n=0;async function test(name,fn){setup();await fn();n++;console.log(`  ✓ ${name}`)}
await test('paper or grade failures never close attempt via submit',async()=>{scenario.rowsFail=true;assert.equal((await submit()).status,500);assert.equal(scenario.closed,0);scenario.rowsFail=false;scenario.gradeFail=true;assert.equal((await submit()).status,500);assert.equal(scenario.closed,0)});
await test('paper or grade failures never close attempt via auto-submit',async()=>{scenario.expired=true;scenario.rowsFail=true;assert.equal((await state()).status,500);assert.equal(scenario.closed,0);scenario.rowsFail=false;scenario.gradeFail=true;assert.equal((await state()).status,500);assert.equal(scenario.closed,0)});
await test('lost close race and close errors are not confirmed',async()=>{scenario.closeMissing=true;assert.equal((await submit()).status,500);assert.equal(scenario.candidateWrites,0);setup();scenario.expired=true;scenario.closeFail=true;assert.equal((await state()).status,500);assert.equal(scenario.candidateWrites,0)});
await test('candidate update failure after closure reports uncertainty',async()=>{scenario.candidateFail=true;assert.equal((await submit()).status,500);assert.equal(scenario.closed,1);setup();scenario.expired=true;scenario.candidateFail=true;assert.equal((await state()).status,500);assert.equal(scenario.closed,1)});
await test('state read failure is not returned as empty answers',async()=>{scenario.savedFail=true;const r=await state();assert.equal(r.status,500);assert.match(r.headers.get('cache-control'),/no-store/)});
await test('normal manual submission hides unpublished result',async()=>{const r=await submit();const b=await r.json();assert.equal(r.status,200);assert.equal(b.status,'submitted');assert.equal(b.score,null);assert.equal(scenario.closed,1)});
await test('expired submission uses server auto-submitted status',async()=>{scenario.expired=true;const r=await submit();const b=await r.json();assert.equal(r.status,200);assert.equal(b.status,'auto_submitted');assert.equal(b.auto_submitted,true)});
await test('successful expired state performs grading and closes',async()=>{scenario.expired=true;const r=await state();const b=await r.json();assert.equal(r.status,200);assert.equal(b.attempt.status,'auto_submitted');assert.equal(scenario.closed,1)});
await test('a manually paused attempt cannot submit and is never auto-closed',async()=>{scenario.paused=true;const r=await submit();assert.equal(r.status,409);const b=await r.json();assert.equal(b.paused,true);assert.match(b.error,/paused by your organizer/i);assert.equal(scenario.closed,0);scenario.paused=true;scenario.expired=true;const rs=await state();assert.equal(rs.status,200);assert.equal(scenario.closed,0,'the state route skips auto-close while paused')});
await test('already submitted request does not grade again',async()=>{scenario.status='submitted';const r=await submit();assert.equal(r.status,200);assert.equal(scenario.graded,0);assert.equal(scenario.closed,0)});
console.log(`\n${n} exam submission failure checks passed (mocked grading/DB).`);
