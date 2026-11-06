// Execute the real server page and render HTML with mocked auth/database boundaries.
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync} from 'node:fs';
import {Module} from 'node:module';
import path from 'node:path';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const file=path.resolve('scripts/__paper_page.cjs');let ctx, exam, quiz, count, prepared, conditions;
function setup(){ctx={org:{id:'org-a',name:'School'},allowed:true};exam={id:'exam-a',quiz_id:'quiz-a',title:'Final exam',instructions:'Answer carefully',duration_minutes:60};quiz={id:'quiz-a'};count=1;conditions=[];prepared=[{quiz_question_id:'qq',type:'single_choice',prompt:'2+2?',points:2,options:[{id:'x',label:'4'}]}];}
const db={from(table){let filters=[];let head=false;const q={select(_s,opts){head=!!opts?.head;return q;},eq(k,v){filters.push([k,v]);return q;},then(resolve){conditions.push({table,filters,head});return Promise.resolve({count,error:null}).then(resolve);},async maybeSingle(){conditions.push({table,filters});const obj=table==='exams'?exam:quiz;const orgFilter=filters.find(([k])=>k==='organization_id')?.[1];return {data:orgFilter==='org-a'?obj:null,error:null};}};return q;}};
const original=Module._load;Module._load=function(req,parent){if(parent?.filename===file){
 if(req==='@/lib/auth')return {requireUser:async()=>ctx,activeOrg:c=>c.org,can:c=>c.allowed,CREATOR_ROLES:[]};
 if(req==='@/lib/supabase/server')return {createClient:async()=>db};
 if(req==='@/lib/live')return {loadQuizQuestions:async()=>Array(count).fill({})};
 if(req==='@/lib/printablePaper')return {PrintablePaperError:Error,preparePrintableQuestions:()=>prepared};
 if(req==='@/components/ExportTools')return {PrintButton:()=>React.createElement('button',null,'Print / PDF')};
 if(req==='@/components/RichContent')return {RichContent:({text})=>React.createElement('span',null,text)};
 if(req==='next/link')return {__esModule:true,default:({children,href})=>React.createElement('a',{href},children)};
 if(req==='next/navigation')return {notFound:()=>{throw Error('NOT_FOUND');}};
}return original.apply(this,arguments);};
const m=new Module(file);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));m._compile(ts.transpileModule(readFileSync('src/app/dashboard/exams/[id]/paper/page.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,file);Module._load=original;
async function render(){return renderToStaticMarkup(await m.exports.default({params:Promise.resolve({id:'exam-a'})}));}
let n=0;async function test(name,fn){setup();await fn();n++;console.log('  ✓ '+name);}
await test('authorized staff see printable cover, instructions and questions',async()=>{const html=await render();if(process.env.PAPER_TEST_HTML)writeFileSync(process.env.PAPER_TEST_HTML,html);for(const text of ['Final exam','School','Answer carefully','Candidate name','Question 1','2+2?','Print / PDF'])assert.ok(html.includes(text),text);assert.ok(conditions.filter(x=>x.table==='exams'||x.table==='quizzes').every(x=>x.filters.some(([k,v])=>k==='organization_id'&&v==='org-a')));});
await test('non-creator and absent tenant are rejected',async()=>{ctx.allowed=false;await assert.rejects(render(),/NOT_FOUND/);ctx.allowed=true;ctx.org=null;await assert.rejects(render(),/NOT_FOUND/);});
await test('foreign tenant exam and quiz cannot load',async()=>{ctx.org.id='org-b';await assert.rejects(render(),/NOT_FOUND/);ctx.org.id='org-a';quiz=null;await assert.rejects(render(),/NOT_FOUND/);});
await test('unprintable or truncated paper does not expose print control',async()=>{count=2;prepared=[];const old=db.from;db.from=function(table){const q=old(table);if(table==='quiz_questions'){q.then=(resolve)=>Promise.resolve({count:3,error:null}).then(resolve);}return q;};try{const html=await render();assert.ok(html.includes('complete paper could not be loaded'));assert.ok(!html.includes('Print / PDF'));}finally{db.from=old;}});
console.log(`\n${n} paper page checks passed (server render; mocked auth/database).`);
