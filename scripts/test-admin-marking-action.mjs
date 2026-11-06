// Execute the real Super Admin marking action with mocked auth, audit and DB.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Module} from 'node:module';
import path from 'node:path';
import ts from 'typescript';
const file=path.resolve('scripts/__virtual_admin_mark_action.cjs');
let authorized,tables,failures,writes,audits;
function setup(){authorized=true;failures={};writes=[];audits=[];
 tables={exam_answers:[{id:'answer',attempt_id:'attempt',question_id:'question',quiz_question_id:'paper-question',points_awarded:null,is_correct:null,questions:{organization_id:'org',points:10},exam_attempts:{id:'attempt',exam_id:'exam',status:'submitted',exams:{organization_id:'org',quiz_id:'quiz'}}}],quiz_questions:[{id:'paper-question',quiz_id:'quiz',question_id:'question',points:5}],exam_attempts:[{id:'attempt',exam_id:'exam',status:'submitted'}]};}
const db={from(table){const filters=[];let patch=null;const q={select(){return q},eq(k,v){filters.push((r)=>r[k]===v);return q},in(k,v){filters.push((r)=>v.includes(r[k]));return q},update(v){patch=v;return q},async maybeSingle(){if(failures[`${table}:${patch?'update':'read'}`])return {data:null,error:{message:'failed'}};const rows=(tables[table]??[]).filter((row)=>filters.every((f)=>f(row)));if(rows.length!==1)return {data:null,error:rows.length?{message:'duplicate'}:null};if(patch){Object.assign(rows[0],patch);writes.push({table,patch})}return {data:{...rows[0]},error:null}},then(resolve,reject){if(failures[`${table}:list`])return Promise.resolve({data:null,error:{message:'failed'}}).then(resolve,reject);return Promise.resolve({data:(tables[table]??[]).filter((row)=>filters.every((f)=>f(row))).map((x)=>({...x})),error:null}).then(resolve,reject)}};return q}};
const original=Module._load;Module._load=function(request,parent){if(parent?.filename===file){
 if(request==='@/lib/admin')return {requireSuperAdmin:async()=>{if(!authorized)throw Error('denied');return {user:{id:'admin'}}},audit:async(...args)=>audits.push(args),fstr:(fd,key,max)=>String(fd.get(key)??'').trim().slice(0,max)||null};
 if(request==='@/lib/csv'||request==='@/lib/exam'||request==='@/lib/platform'||request==='@/lib/utils')return {};
 if(request==='@/lib/supabase/server')return {createAdminClient:()=>db};
 if(request==='next/cache')return {revalidatePath:()=>{}};
 if(request==='next/headers')return {};
 if(request==='next/navigation')return {redirect:(url)=>{const e=Error(url);e.url=url;throw e}};
}return original.apply(this,arguments)};
const m=new Module(file);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));m._compile(ts.transpileModule(readFileSync('src/app/admin/examinations/actions.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);Module._load=original;
function form(overrides={}){const f=new FormData();for(const [k,v] of Object.entries({answer_id:'answer',points:'4.5',note:'note',...overrides}))if(v!==null)f.set(k,v);return f}
async function run(fd=form()){try{await m.exports.markExamAnswerAsAdmin(fd);throw Error('Expected redirect')}catch(e){if(!e.url)throw e;return e.url}}
let count=0;async function test(name,fn){setup();await fn();count++;console.log(`  ✓ ${name}`)}
await test('requires Super Admin before database write',async()=>{authorized=false;await assert.rejects(()=>run(),/denied/);assert.equal(writes.length,0)});
await test('rejects missing or foreign-owned question',async()=>{tables.exam_answers[0].questions.organization_id='other';assert.match(await run(),/e=answer/);assert.equal(writes.length,0)});
await test('rejects in-progress attempt',async()=>{tables.exam_answers[0].exam_attempts.status='in_progress';assert.match(await run(),/e=in_progress/);assert.equal(writes.length,0)});
await test('checks paper association and stored quiz question id',async()=>{tables.exam_answers[0].quiz_question_id='other';assert.match(await run(),/e=answer/);assert.equal(writes.length,0)});
await test('legacy answer with null association is resolved against paper',async()=>{tables.exam_answers[0].quiz_question_id=null;assert.match(await run(),/ok=marked/);assert.equal(writes.length,2)});
await test('rejects missing, non-finite, negative and excess points',async()=>{for(const points of ['',null,'NaN','Infinity','-1','6'])assert.match(await run(form({points})),/e=points/);assert.equal(writes.length,0)});
await test('paper allocation overrides question default and zero allowed',async()=>{tables.quiz_questions[0].points=null;assert.match(await run(form({points:'9'})),/ok=marked/);setup();assert.match(await run(form({points:'0'})),/ok=marked/);assert.equal(tables.exam_answers[0].points_awarded,0)});
await test('valid marks and totals are written and audited',async()=>{tables.exam_answers.push({id:'other',attempt_id:'attempt',points_awarded:2,is_correct:true});assert.match(await run(),/ok=marked/);assert.equal(tables.exam_attempts[0].score,6.5);assert.equal(tables.exam_attempts[0].status,'marked');assert.equal(audits[0][1],'exam.answer_marked_by_admin');assert.equal(audits[0][5].max_points,5)});
await test('other unmarked responses do not advance status',async()=>{tables.exam_answers.push({id:'other',attempt_id:'attempt',points_awarded:null,is_correct:null});assert.match(await run(),/ok=marked/);assert.equal(tables.exam_attempts[0].status,'submitted')});
await test('answer failure returns error without success audit',async()=>{failures['exam_answers:update']=true;assert.match(await run(),/e=failed/);assert.equal(audits.length,0)});
await test('partial answer save on total read failure is reported and audited',async()=>{failures['exam_answers:list']=true;assert.match(await run(),/e=partial/);assert.equal(writes.length,1);assert.equal(audits[0][1],'exam.answer_marked_by_admin_total_unconfirmed')});
await test('partial answer save on total write failure is reported and audited',async()=>{failures['exam_attempts:update']=true;assert.match(await run(),/e=partial/);assert.equal(writes.length,1);assert.equal(audits[0][1],'exam.answer_marked_by_admin_total_unconfirmed')});
console.log(`\n${count} Super Admin marking checks passed (mocked auth/database/audit).`);
