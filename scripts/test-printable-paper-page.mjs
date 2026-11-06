// Execute the real server page and render HTML with mocked auth/database boundaries.
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync} from 'node:fs';
import {Module} from 'node:module';
import path from 'node:path';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const file=path.resolve('scripts/__paper_page.cjs');let ctx, exam, quiz, count, prepared, conditions, candidates;
function setup(){ctx={org:{id:'org-a',name:'School'},allowed:true};exam={id:'exam-a',quiz_id:'quiz-a',title:'Final exam',instructions:'Answer carefully',duration_minutes:60};quiz={id:'quiz-a'};count=1;conditions=[];candidates=[{id:'c1',full_name:'Ada Lovelace',access_code:'AD1'},{id:'c2',full_name:'Bo Chen',access_code:null}];prepared=[{quiz_question_id:'qq',type:'single_choice',prompt:'2+2?',points:2,options:[{id:'x',label:'4'}]}];}
const db={from(table){let filters=[];let head=false;const q={select(_s,opts){head=!!opts?.head;return q;},eq(k,v){filters.push([k,v]);return q;},then(resolve){conditions.push({table,filters,head});const data=table==='exam_candidates'?(head?null:candidates):table==='exam_rubric_links'?[]:undefined;return Promise.resolve({count,error:null,data}).then(resolve);},async maybeSingle(){conditions.push({table,filters});const obj=table==='exams'?exam:quiz;const orgFilter=filters.find(([k])=>k==='organization_id')?.[1];return {data:orgFilter==='org-a'?obj:null,error:null};}};return q;}};
const original=Module._load;Module._load=function(req,parent){if(parent?.filename===file){
 if(req==='@/lib/auth')return {requireUser:async()=>ctx,activeOrg:c=>c.org,can:c=>c.allowed,CREATOR_ROLES:[]};
 if(req==='@/lib/supabase/server')return {createClient:async()=>db};
 if(req==='@/lib/live')return {loadQuizQuestions:async()=>Array(count).fill({})};
 if(req==='@/lib/printablePaper')return {PrintablePaperError:Error,preparePrintableQuestions:()=>prepared};
 if(req==='@/lib/printablePackets')return {
   PrintablePacketError:Error,
   buildAnswerSheet:(items)=>items.map((it,i)=>({number:i+1,kind:it.options.length?'choices':'lines',type:it.type,points:it.points,lines:it.options.length?0:7,choiceLabels:it.options.map((_o,j)=>String.fromCharCode(65+j))})),
   buildMarkerGrid:(items)=>items.map((it,i)=>({number:i+1,questionId:it.question_id,points:it.points,rubricId:null,rubricTitle:null,level:null,criteria:[],criteriaTotal:0})),
   buildCandidatePackets:(list,items)=>list.length?list.map((c,i)=>({index:i,candidate:c,answerSheet:items.map((it,j)=>({number:j+1,kind:'lines',type:it.type,points:it.points,lines:7,choiceLabels:[]})),markerGrid:items.map((it,j)=>({number:j+1,questionId:it.question_id,points:it.points,rubricId:null,rubricTitle:null,level:null,criteria:[],criteriaTotal:0})),totalMarks:items.reduce((t,it)=>t+it.points,0)})):(()=>{throw new Error('no candidates')})()
 };
 if(req==='@/components/ExportTools')return {PrintButton:()=>React.createElement('button',null,'Print / PDF')};
 if(req==='@/components/RichContent')return {RichContent:({text})=>React.createElement('span',null,text)};
 if(req==='next/link')return {__esModule:true,default:({children,href})=>React.createElement('a',{href},children)};
 if(req==='next/navigation')return {notFound:()=>{throw Error('NOT_FOUND');}};
}return original.apply(this,arguments);};
const m=new Module(file);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));m._compile(ts.transpileModule(readFileSync('src/app/dashboard/exams/[id]/paper/page.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,file);Module._load=original;
async function render(mode){return renderToStaticMarkup(await m.exports.default({params:Promise.resolve({id:'exam-a'}),searchParams:Promise.resolve(mode?{mode}:{})}));}
let n=0;async function test(name,fn){setup();await fn();n++;console.log('  ✓ '+name);}
await test('authorized staff see printable cover, instructions and questions',async()=>{const html=await render();if(process.env.PAPER_TEST_HTML)writeFileSync(process.env.PAPER_TEST_HTML,html);for(const text of ['Final exam','School','Answer carefully','Candidate name','Question 1','2+2?','Print / PDF'])assert.ok(html.includes(text),text);assert.ok(conditions.filter(x=>x.table==='exams'||x.table==='quizzes').every(x=>x.filters.some(([k,v])=>k==='organization_id'&&v==='org-a')));});
await test('non-creator and absent tenant are rejected',async()=>{ctx.allowed=false;await assert.rejects(render(),/NOT_FOUND/);ctx.allowed=true;ctx.org=null;await assert.rejects(render(),/NOT_FOUND/);});
await test('foreign tenant exam and quiz cannot load',async()=>{ctx.org.id='org-b';await assert.rejects(render(),/NOT_FOUND/);ctx.org.id='org-a';quiz=null;await assert.rejects(render(),/NOT_FOUND/);});
await test('unprintable or truncated paper does not expose print control',async()=>{count=2;prepared=[];const old=db.from;db.from=function(table){const q=old(table);if(table==='quiz_questions'){q.then=(resolve)=>Promise.resolve({count:3,error:null}).then(resolve);}return q;};try{const html=await render();assert.ok(html.includes('complete paper could not be loaded'));assert.ok(!html.includes('Print / PDF'));}finally{db.from=old;}});
await test('the answer sheet view numbers every question with writing space',async()=>{const html=await render('sheet');assert.match(html,/answer sheet/);assert.match(html,/Question 1/);assert.match(html,/Candidate name:/);assert.match(html,/\[2 marks\]/);});
await test('candidate packets carry one named packet per candidate',async()=>{const html=await render('packets');assert.match(html,/Candidate packets/);assert.match(html,/Ada Lovelace/);assert.match(html,/Bo Chen/);assert.equal((html.match(/Answer sheet/g)||[]).length>=2,true,'each packet repeats the sheet');assert.match(html,/print:break-before-page/,'later packets start on a new page');});
await test('the marker grid view prints a table for the marker',async()=>{const html=await render('markers');assert.match(html,/marker grid/i);assert.match(html,/Awarded/);assert.match(html,/Single mark/);});
await test('an unknown mode falls back to the question paper',async()=>{const html=await render('nonsense');assert.match(html,/Examination questions/);assert.doesNotMatch(html,/paper-packet/,'no packet body is rendered for an unknown mode');});
console.log(`\n${n} paper page checks passed (server render; mocked auth/database).`);
