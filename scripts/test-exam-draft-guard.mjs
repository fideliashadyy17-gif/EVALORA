// React-level exam interaction tests with fake browser/network; not browser or DB E2E.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Module} from 'node:module';
import path from 'node:path';
import React from 'react';
import TestRenderer, {act} from 'react-test-renderer';
import ts from 'typescript';
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
function compile(source, filename) {
  const file=path.resolve(filename); const mod=new Module(file); mod.filename=file; mod.paths=Module._nodeModulePaths(path.dirname(file));
  mod._compile(ts.transpileModule(readFileSync(source,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,file); return mod.exports;
}
const queue=compile('src/lib/examSaveQueue.ts','scripts/__virtual_queue.cjs');
const file=path.resolve('scripts/__virtual_exam.cjs'); const original=Module._load;
function StubRunner(props) {return React.createElement('div', {'data-runner': props.question.question_id}, React.createElement('button',{onClick:()=>props.onDirtyChange(true)},'Edit draft'), React.createElement('button',{onClick:()=>{if(props.onAnswer({text:'answer'})!==false) props.onDirtyChange(false);}},'Save draft'));}
Module._load=function(request,parent) {
 if(parent?.filename===file) {
  if(request==='@/components/QuestionRunner') return {QuestionRunner:StubRunner};
  if(request==='@/components/Logo') return {Logo:()=>null};
  if(request==='@/components/RichContent') return {RichContent:()=>null};
  if(request==='@/components/ExamCorrige') return {ExamCorrige:()=>null};
  if(request==='@/lib/examResults') return {answerKeyLine:()=>null,optionMarkings:()=>[],resultLabel:()=>'',
    // the client only reads presentation helpers; keep them inert here
    parseIntegrityPolicy:undefined};
  if(request==='@/lib/integrity') return {parseIntegrityPolicy:(raw)=>({...raw,enabled:true,tabSwitch:true,focusLoss:true,fullscreen:true,clipboard:true,sound:true,warnAfter:3,reviewAfter:5})};
  if(request==='@/lib/integrityMonitor') return {IntegrityMonitor:class{start(){}stop(){}}};
  if(request==='@/lib/useAssessmentLockdown') return {useProtectedSurface:()=>{}};
  if(request==='@/lib/examSaveQueue') return queue;
  if(request==='./ExamMessenger') return {ExamMessenger:()=>null};
  if(request==='./RetakePanel') return {RetakePanel:()=>null};
  if(request==='@/components/ui') return {Button:(p)=>React.createElement('button',p),Card:(p)=>React.createElement('div',p),Badge:(p)=>React.createElement('span',p)};
  if(request==='@/lib/utils') return {cn:(...args)=>args.filter(Boolean).join(' '),mmss:()=> '10:00'};
  if(request==='@livekit/components-styles') return {};
  if(request==='@livekit/components-react') return {};
  if(request==='livekit-client') return {Track:{Source:{}}};
  if(request==='lucide-react') return {Flag:()=>null,ShieldAlert:()=>null,X:()=>null};
 }
 return original.apply(this,arguments);
};
const {TakeExamClient}=compile('src/app/take-exam/[attemptId]/TakeExamClient.tsx','scripts/__virtual_exam.cjs'); Module._load=original;
const values=new Map(); globalThis.sessionStorage={getItem:(k)=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:(k)=>values.delete(k)};
globalThis.localStorage={getItem:()=>JSON.stringify({token:'test'})};
const events={}; let confirm=false;
globalThis.window={addEventListener:(k,f)=>{events[k]=f},removeEventListener:(k)=>{delete events[k]},confirm:()=>confirm};
const q=(id)=>({question_id:id,quiz_question_id:'qq'+id,type:'short_answer',prompt:id,options:[],points:1,media_url:null,media_type:null,saved_answer:null,result:null});
const state={server_now:new Date().toISOString(),exam:{id:'exam',title:'Test',description:null,instructions:null,proctoring:false,require_screen_share:false,pass_mark_percent:50},candidate:{name:'Candidate',ref:null},attempt:{id:'attempt',status:'in_progress',deadline:new Date(Date.now()+600000).toISOString(),flagged:[],score:null,max_score:null,results_published:false},questions:[q('a'),q('b')]};
let saves=0, submits=0;
globalThis.fetch=async (url,options)=>{if(url.startsWith('/api/exam/state')) {assert.ok(!url.includes('token='));assert.equal(options.headers.Authorization,'Bearer test');assert.equal(options.cache,'no-store');return {ok:true,json:async()=>structuredClone(state)};} if(url==='/api/exam/save') {saves++;return {ok:true};} if(url==='/api/exam/submit'){submits++;return {ok:true};} throw Error('unexpected fetch '+url);};
let tree; await act(async()=>{tree=TestRenderer.create(React.createElement(TakeExamClient,{attemptId:'attempt'}));});
function button(label) {const b=tree.root.findAllByType('button').find((e)=>e.props.children===label); assert.ok(b,`missing button ${label}`);return b;}
async function click(label){await act(async()=>button(label).props.onClick());}
const questionId=()=>tree.root.find((node)=>typeof node.props['data-runner']==='string').props['data-runner'];
await click('Edit draft'); assert.equal(questionId(),'a');
let prevented=false; const event={preventDefault:()=>{prevented=true},returnValue:null}; events.beforeunload(event); assert.equal(prevented,true);
await click('Next →'); assert.equal(questionId(),'a','cancel navigation retains draft');
await click('Submit examination'); assert.equal(submits,0); assert.equal(tree.root.findAllByProps({role:'alert'}).some((n)=>String(n.props.children).includes('Save this answer')),true);
confirm=true; await click('Discard unsaved changes'); assert.equal(questionId(),'a'); prevented=false; events.beforeunload(event); assert.equal(prevented,false);
await click('Edit draft'); await click('Save draft'); assert.equal(saves,1); await click('Next →'); assert.equal(questionId(),'b');
await click('Edit draft'); confirm=true; await click('← Previous'); assert.equal(questionId(),'a');
await act(()=>tree.unmount()); console.log('4 exam draft guard interaction checks passed (React test renderer; mocked browser/network).');
