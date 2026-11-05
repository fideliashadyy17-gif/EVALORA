// Proctor component connection UX under mocked LiveKit and network; not E2E.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Module} from 'node:module';
import path from 'node:path';
import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import ts from 'typescript';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let connection='connecting',roomProps,formMounts=0;
function Input(props){const [draft,setDraft]=React.useState('');React.useEffect(()=>{formMounts++},[]);return React.createElement('input',{...props,value:draft,onChange:e=>setDraft(e.target.value)});}
const file=path.resolve('scripts/__proctor.cjs'),orig=Module._load;
Module._load=function(req,parent){if(parent?.filename===file){
 if(req==='@/components/ui')return {Button:p=>React.createElement('button',p),Card:p=>React.createElement('div',p),Badge:p=>React.createElement('span',p),Field:p=>React.createElement('label',p),Input,Select:p=>React.createElement('select',p)};
 if(req==='@livekit/components-styles')return {};
 if(req==='@livekit/components-react')return {LiveKitRoom:p=>{roomProps=p;return React.createElement('section',null,p.children)},ParticipantTile:()=>null,useConnectionState:()=>connection,useParticipants:()=>[],useTracks:()=>[]};
 if(req==='livekit-client')return {Track:{Source:{Camera:'camera',ScreenShare:'screen'}}};
 if(req==='../../actions')return {logIncident:()=>{}};
}return orig.apply(this,arguments);};
const m=new Module(file);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));m._compile(ts.transpileModule(readFileSync('src/app/dashboard/exams/[id]/proctor/ProctorRoom.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,file);Module._load=orig;
let calls=0;globalThis.fetch=async()=>{calls++;return calls===1?{ok:false,json:async()=>({})}:{ok:true,json:async()=>({token:'token',serverUrl:'wss://example.invalid'})}};
let tree;const props={examId:'exam',candidates:[]};await act(async()=>{tree=TestRenderer.create(React.createElement(m.exports.ProctorRoom,props));});
const text=()=>JSON.stringify(tree.toJSON());const retry=()=>tree.root.findAllByType('button').find(b=>b.props.children==='Retry video connection');const note=()=>tree.root.findAllByType('input').find(x=>x.props.placeholder==='Note (what you observed, with time)…');
assert.match(text(),/Could not request video access/);await act(async()=>note().props.onChange({target:{value:'observation draft'}}));await act(async()=>retry().props.onClick());assert.equal(note().props.value,'observation draft');assert.equal(formMounts,1);assert.match(text(),/Connecting/);assert.doesNotMatch(text(),/Video room connected/);
connection='connected';await act(async()=>tree.update(React.createElement(m.exports.ProctorRoom,props)));assert.match(text(),/Video room connected/);assert.match(text(),/No candidate cameras yet/);
connection='reconnecting';await act(async()=>tree.update(React.createElement(m.exports.ProctorRoom,props)));assert.match(text(),/Reconnecting/);assert.match(text(),/cannot be verified/);assert.doesNotMatch(text(),/Video room connected/);
connection='disconnected';await act(async()=>tree.update(React.createElement(m.exports.ProctorRoom,props)));assert.match(text(),/Disconnected/);await act(async()=>roomProps.onError(new Error('network')));assert.match(text(),/Video connection failed/);await act(async()=>retry().props.onClick());assert.equal(note().props.value,'observation draft');assert.equal(formMounts,1);
await act(()=>tree.unmount());console.log('PASS: proctor token failure/retry, connection states and incident draft preservation (React with mocks).');
