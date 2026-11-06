// Execute real workspace marking action using a mocked database/auth boundary.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Module} from 'node:module';
import path from 'node:path';
import ts from 'typescript';
const file=path.resolve('scripts/__virtual_marking_action.cjs');
let ctx, tables, failures, writes;
function setup() {
 ctx={user:{id:'marker'},org:{id:'org-a',role:'teacher'},allowed:true}; failures={};writes=[];
 tables={exams:[{id:'exam-a',quiz_id:'quiz-a',organization_id:'org-a'}],exam_attempts:[{id:'attempt-a',exam_id:'exam-a',status:'submitted'}],exam_answers:[{id:'answer-a',attempt_id:'attempt-a',question_id:'q-a',quiz_question_id:'qq-a',questions:{organization_id:'org-a',points:10,type:'open_ended'},points_awarded:null,is_correct:null}],quiz_questions:[{id:'qq-a',quiz_id:'quiz-a',question_id:'q-a',points:5}]};
}
const db={from(table) {const filter=[];let patch=null;
 const q={select(){return q;},eq(k,v){filter.push((row)=>row[k]===v);return q;},in(k,values){filter.push((row)=>values.includes(row[k]));return q;},update(data){patch=data;return q;},
 async maybeSingle(){if(failures[`${table}:${patch?'update':'read'}`])return {data:null,error:{message:'failure'}};const rows=(tables[table]??[]).filter((row)=>filter.every((f)=>f(row)));if(rows.length>1)return {data:null,error:{message:'multiple'}};const row=rows[0];if(!row)return {data:null,error:null};if(patch){Object.assign(row,patch);writes.push({table,patch});}return {data:{...row},error:null};},
 then(resolve,reject){if(failures[`${table}:list`])return Promise.resolve({data:null,error:{message:'failure'}}).then(resolve,reject);return Promise.resolve({data:(tables[table]??[]).filter((row)=>filter.every((f)=>f(row))).map((row)=>({...row})),error:null}).then(resolve,reject);}};return q;}};
const original=Module._load;
Module._load=function(request,parent){if(parent?.filename===file){
 if(request==='@/lib/auth')return {requireUser:async()=>ctx,activeOrg:()=>ctx.org,can:()=>ctx.allowed,CREATOR_ROLES:[],MARKER_ROLES:[],PROCTOR_ROLES:[]};
 if(request==='@/lib/entitlements'||request==='@/lib/capabilities'||request==='@/lib/ai-marking')return {};
 if(request==='@/lib/supabase/server')return {createClient:async()=>db,createAdminClient:()=>db};
 if(request==='@/lib/utils')return {};
 if(request==='next/cache')return {revalidatePath:()=>{}};
 if(request==='next/navigation')return {redirect:(url)=>{const e=Error(url);e.url=url;throw e;}};
}return original.apply(this,arguments);};
const mod=new Module(file);mod.filename=file;mod.paths=Module._nodeModulePaths(path.dirname(file));mod._compile(ts.transpileModule(readFileSync('src/app/dashboard/exams/actions.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);Module._load=original;
function form(overrides={}) {const fd=new FormData();const fields={answer_id:'answer-a',attempt_id:'attempt-a',exam_id:'exam-a',points:'4.5',note:'good',...overrides};for(const [k,v] of Object.entries(fields))if(v!==null)fd.set(k,v);return fd;}
async function run(fd=form()){try{await mod.exports.markAnswer(fd);throw Error('Expected redirect');}catch(e){if(!e.url)throw e;return e.url;}}
let n=0;async function test(name,fn){setup();await fn();console.log(`  ✓ ${name}`);n++;}
await test('role and tenant required',async()=>{ctx.allowed=false;assert.equal(await run(),'/dashboard/exams');assert.equal(writes.length,0);ctx.allowed=true;ctx.org=null;assert.equal(await run(),'/dashboard/exams');});
await test('cross-tenant exam rejected',async()=>{tables.exams[0].organization_id='org-b';assert.match(await run(),/mark_error=invalid/);assert.equal(writes.length,0);});
await test('attempt and answer must belong to submitted examination',async()=>{tables.exam_attempts[0].exam_id='different';assert.match(await run(),/mark_error=invalid/);assert.equal(writes.length,0);tables.exam_attempts[0].exam_id='exam-a';tables.exam_answers[0].attempt_id='other';assert.match(await run(),/mark_error=invalid/);assert.equal(writes.length,0);});
await test('in-progress attempt and objective answer rejected',async()=>{tables.exam_attempts[0].status='in_progress';assert.match(await run(),/mark_error=in_progress/);tables.exam_attempts[0].status='submitted';tables.exam_answers[0].questions.type='single_choice';assert.match(await run(),/mark_error=invalid/);assert.equal(writes.length,0);});
await test('foreign-tenant question rejected even if linked',async()=>{tables.exam_answers[0].questions.organization_id='org-b';assert.match(await run(),/mark_error=invalid/);assert.equal(writes.length,0);});
await test('paper association must match answer',async()=>{tables.exam_answers[0].quiz_question_id='other';assert.match(await run(),/mark_error=invalid/);assert.equal(writes.length,0);});
await test('missing legacy quiz question id uses server paper association',async()=>{tables.exam_answers[0].quiz_question_id=null;assert.match(await run(),/mark_ok=1/);assert.equal(writes.length,2);});
await test('invalid and excessive points rejected against paper override',async()=>{for(const points of ['', '-1','NaN','Infinity','6'])assert.match(await run(form({points})),/mark_error=points/);assert.equal(writes.length,0);});
await test('zero mark is accepted and paper without override uses question maximum',async()=>{tables.quiz_questions[0].points=null;assert.match(await run(form({points:'0'})),/mark_ok=1/);assert.equal(tables.exam_answers[0].points_awarded,0);setup();tables.quiz_questions[0].points=null;assert.match(await run(form({points:'9'})),/mark_ok=1/);});
await test('valid mark saves answer and recalculates total',async()=>{tables.exam_answers.push({id:'answer-b',attempt_id:'attempt-a',points_awarded:2,is_correct:true});assert.match(await run(),/mark_ok=1/);assert.equal(tables.exam_answers[0].points_awarded,4.5);assert.equal(tables.exam_answers[0].marked_by,'marker');assert.equal(tables.exam_attempts[0].score,6.5);assert.equal(tables.exam_attempts[0].status,'marked');});
await test('other unmarked answers prevent marked status',async()=>{tables.exam_answers.push({id:'answer-b',attempt_id:'attempt-a',points_awarded:null,is_correct:null});assert.match(await run(),/mark_ok=1/);assert.equal(tables.exam_attempts[0].status,'submitted');});
await test('failed answer update is not reported as success',async()=>{failures['exam_answers:update']=true;assert.match(await run(),/mark_error=failed/);assert.equal(writes.length,0);});
await test('failed total read or update reports potentially partial save',async()=>{failures['exam_answers:list']=true;assert.match(await run(),/mark_error=partial/);assert.equal(writes.length,1);setup();failures['exam_attempts:update']=true;assert.match(await run(),/mark_error=partial/);assert.equal(writes.length,1);});
console.log(`\n${n} workspace marking checks passed (mocked auth/database).`);
