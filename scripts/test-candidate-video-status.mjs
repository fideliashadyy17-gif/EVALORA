// Real candidate component, mocked browser/network and LiveKit hooks; not LiveKit E2E.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Module} from 'node:module';
import path from 'node:path';
import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import ts from 'typescript';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
function compile(source,dest){const f=path.resolve(dest),m=new Module(f);m.filename=f;m.paths=Module._nodeModulePaths(path.dirname(f));m._compile(ts.transpileModule(readFileSync(source,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,f);return m.exports;}
const queue=compile('src/lib/examSaveQueue.ts','scripts/__vid_queue.cjs');const file=path.resolve('scripts/__vid_exam.cjs');let connection='connecting',camera=false,microphone=false, screen=false,roomProps;
const original=Module._load;Module._load=function(req,parent){if(parent?.filename===file){
 if(req==='@/components/QuestionRunner')return {QuestionRunner:props=>{const [draft,setDraft]=React.useState('');return React.createElement('input',{'data-draft':true,value:draft,onChange:e=>{setDraft(e.target.value);props.onDirtyChange(true);}});}};
 if(req==='@/components/Logo'||req==='@/components/RichContent')return {Logo:()=>null,RichContent:()=>null};
 if(req==='@/components/ExamCorrige')return {ExamCorrige:()=>null};
 if(req==='@/lib/examResults')return {answerKeyLine:()=>null,optionMarkings:()=>[],resultLabel:()=>''};
 if(req==='@/lib/integrity')return {parseIntegrityPolicy:raw=>({...raw,enabled:true,tabSwitch:true,focusLoss:true,fullscreen:true,clipboard:true,sound:true,warnAfter:3,reviewAfter:5})};
 if(req==='@/lib/integrityMonitor')return {IntegrityMonitor:class{start(){}stop(){}}};
 if(req==='@/lib/useAssessmentLockdown') return {useProtectedSurface:()=>{}};
 if(req==='@/lib/examSaveQueue')return queue;
 if(req==='./ExamMessenger')return {ExamMessenger:()=>null};
 if(req==='./RetakePanel')return {RetakePanel:()=>null};
 if(req==='./HintPanel')return {HintPanel:()=>null};
 if(req==='@/components/PresenceRail')return {PresenceRail:()=>null};
 if(req==='@/lib/hintAttention')return {answerStateFor:({hasSavedAnswer,isCorrect})=>!hasSavedAnswer?'unanswered':isCorrect===true?'correct':isCorrect===false?'incorrect':'answered'};
 if(req==='@/lib/presence')return {PRESENCE_HEARTBEAT_MS:20000,PRESENCE_REFRESH_MS:15000};
 if(req==='@/components/ui')return {Button:p=>React.createElement('button',p),Card:p=>React.createElement('div',p),Badge:p=>React.createElement('span',p)};
 if(req==='@/lib/utils')return {cn:(...v)=>v.filter(Boolean).join(' '),mmss:()=> '10:00'};
 if(req==='@livekit/components-styles')return {};
 if(req==='@livekit/components-react')return {LiveKitRoom:p=>{roomProps=p;return React.createElement('section',null,p.children)},VideoTrack:()=>null,useConnectionState:()=>connection,useLocalParticipant:()=>({isCameraEnabled:camera,isMicrophoneEnabled:microphone,isScreenShareEnabled:screen,localParticipant:{setScreenShareEnabled:async value=>{screen=value;}}}),useTracks:()=>[]};
 if(req==='livekit-client')return {Track:{Source:{Camera:'camera'}}};
 if(req==='lucide-react')return {Flag:()=>null,ShieldAlert:()=>null,X:()=>null};
}return original.apply(this,arguments);};
const {TakeExamClient}=compile('src/app/take-exam/[attemptId]/TakeExamClient.tsx',file);Module._load=original;
const store=new Map();globalThis.sessionStorage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};globalThis.localStorage={getItem:()=>JSON.stringify({token:'attempt-token'})};globalThis.window={addEventListener:()=>{},removeEventListener:()=>{},confirm:()=>true};
const state={server_now:new Date().toISOString(),exam:{id:'exam',title:'Proctored Test',description:null,instructions:null,proctoring:true,require_screen_share:true,pass_mark_percent:50},candidate:{name:'Candidate',ref:null},attempt:{id:'attempt',status:'in_progress',deadline:new Date(Date.now()+600000).toISOString(),flagged:[],score:null,max_score:null,results_published:false},questions:[{question_id:'q',quiz_question_id:'qq',type:'short_answer',prompt:'Q',options:[],points:1,media_url:null,media_type:null,saved_answer:null,result:null}]};
let tokenCalls=0;globalThis.fetch=async url=>{if(url.startsWith('/api/exam/state'))return {ok:true,json:async()=>structuredClone(state)};if(url==='/api/livekit/token'){tokenCalls++;return tokenCalls===1?{ok:false,json:async()=>({error:'unavailable'})}:{ok:true,json:async()=>({token:'room-token',serverUrl:'wss://example.invalid'})};}throw Error('unexpected '+url);};
let tree;await act(async()=>{tree=TestRenderer.create(React.createElement(TakeExamClient,{attemptId:'attempt'}));});
function text(){return JSON.stringify(tree.toJSON());}function button(label){return tree.root.findAllByType('button').find(b=>b.props.children===label);}
assert.match(text(),/Could not connect to video supervision/);assert.doesNotMatch(text(),/Live supervision active|Video room connected/);
await act(async()=>tree.root.findByProps({'data-draft':true}).props.onChange({target:{value:'unsaved draft'}}));
await act(async()=>button('Retry video connection').props.onClick());assert.equal(tree.root.findByProps({'data-draft':true}).props.value,'unsaved draft');assert.equal(tokenCalls,2);assert.match(text(),/Connecting to video room/);assert.doesNotMatch(text(),/Video room connected/);
connection='connected';camera=true;microphone=false;await act(async()=>tree.update(React.createElement(TakeExamClient,{attemptId:'attempt'})));assert.match(text(),/Video room connected/);assert.match(text(),/Camera /);assert.match(text(),/not enabled/);
await act(async()=>roomProps.onMediaDeviceFailure());assert.match(text(),/Camera or microphone could not be enabled/);
connection='reconnecting';await act(async()=>tree.update(React.createElement(TakeExamClient,{attemptId:'attempt'})));assert.match(text(),/Video room reconnecting/);assert.doesNotMatch(text(),/Video room connected/);
connection='disconnected';await act(async()=>tree.update(React.createElement(TakeExamClient,{attemptId:'attempt'})));assert.match(text(),/Video room disconnected/);assert.ok(button('Retry video connection'));await act(async()=>button('Retry video connection').props.onClick());assert.equal(tree.root.findByProps({'data-draft':true}).props.value,'unsaved draft');
await act(()=>tree.unmount());console.log('PASS: candidate video failure, retry, connecting, device, reconnecting and disconnect states; unsaved draft survives retries (React with mocks).');
