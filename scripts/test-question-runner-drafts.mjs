// Component interaction checks; these do not replace browser E2E.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Module } from 'node:module';
import path from 'node:path';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import ts from 'typescript';
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const file = path.resolve('scripts/__virtual_question_runner.cjs');
const js = ts.transpileModule(readFileSync('src/components/QuestionRunner.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const originalLoad = Module._load;
Module._load = function(request, parent) {
  if (parent?.filename === file) {
    if (request === './ui') return Object.fromEntries(['Button', 'Input', 'Textarea'].map((name) => [name, (props) => React.createElement({Button:'button', Input:'input', Textarea:'textarea'}[name], props)]));
    if (request === './MathText') return { MathText: ({text}) => text };
    if (request === './RichContent') return { RichContent: ({text}) => text };
    if (request === '@/lib/utils') return { cn: (...args) => args.filter(Boolean).join(' ') };
  }
  return originalLoad.apply(this, arguments);
};
const virtual = new Module(file); virtual.filename = file; virtual.paths = Module._nodeModulePaths(path.dirname(file)); virtual._compile(js, file);
Module._load = originalLoad;
const { QuestionRunner } = virtual.exports;
const question = (type) => ({quiz_question_id:'qq', question_id:'q', type, prompt:'Question', points:1, media_url:null, media_type:null, options:[{id:'a',label:'A'},{id:'b',label:'B'}], matching_lefts:['L'], matching_rights:['R']});
async function render(type, onAnswer, dirty) { let tree; await act(() => { tree = TestRenderer.create(React.createElement(QuestionRunner, { question:question(type), onAnswer, ...(dirty ? {onDirtyChange:dirty} : {}) })); }); return tree; }
async function click(node) { await act(() => node.props.onClick()); }
const buttons = (tree) => tree.root.findAllByType('button');
const saveButton = (tree) => buttons(tree).find((node) => node.props.children === 'Submit answer');
let count = 0;
async function test(name, fn) { await fn(); console.log(`  ✓ ${name}`); count++; }
for (const [type, tag, value, expected] of [['short_answer','input','hello',{text:'hello'}],['open_ended','textarea','essay',{text:'essay'}],['numeric','input','2.5',{value:2.5}]]) {
  await test(`${type}: edit marks dirty and accepted save clears it`, async () => {
    const changes=[], answers=[]; const tree = await render(type, (a) => { answers.push(a); return true; }, (d) => changes.push(d));
    await act(() => tree.root.findByType(tag).props.onChange({target:{value}})); assert.deepEqual(changes,[true]);
    await click(saveButton(tree)); assert.deepEqual(answers,[expected]); assert.deepEqual(changes,[true,false]); await act(() => tree.unmount());
  });
}
await test('multiple selection stays dirty if save is rejected', async () => {
  const changes=[]; const tree=await render('multiple_select', () => false, (d) => changes.push(d));
  await click(buttons(tree)[0]); await click(saveButton(tree)); assert.deepEqual(changes,[true]); await act(() => tree.unmount());
});
await test('ordering and matching edits are marked and saved', async () => {
  for (const type of ['ordering','matching']) {
    const changes=[], answers=[]; const tree=await render(type, (a) => {answers.push(a); return true;}, (d) => changes.push(d));
    if (type==='ordering') await click(buttons(tree).find((b) => b.props.children==='↓' && !b.props.disabled));
    else await act(() => tree.root.findByType('select').props.onChange({target:{value:'R'}}));
    await click(saveButton(tree)); assert.deepEqual(changes,[true,false]); assert.deepEqual(answers[0], type==='ordering'? {order:['B','A']} : {pairs:[{left:'L',right:'R'}]}); await act(() => tree.unmount());
  }
});
await test('tap answer rejection stays dirty; success clears', async () => {
  const changes=[]; let accept=false; const tree=await render('single_choice', () => accept, (d) => changes.push(d));
  await click(buttons(tree)[0]); assert.deepEqual(changes,[true]); accept=true; await click(buttons(tree)[1]); assert.deepEqual(changes,[true,true,false]); await act(() => tree.unmount());
});
await test('older asynchronous acceptance does not clear newer edits', async () => {
  let resolve; const promise = new Promise((r) => {resolve=r;}); const changes=[];
  const tree=await render('short_answer', () => promise, (d) => changes.push(d));
  const input=tree.root.findByType('input'); await act(() => input.props.onChange({target:{value:'old'}})); await click(saveButton(tree));
  await act(() => input.props.onChange({target:{value:'new'}})); await act(async () => {resolve(true); await promise;});
  assert.deepEqual(changes,[true,true]); await act(() => tree.unmount());
});
await test('live session without draft tracking still sends tap and typed answers', async () => {
  const answers=[]; let tree=await render('single_choice', (a) => answers.push(a)); await click(buttons(tree)[0]); await act(() => tree.unmount());
  tree=await render('short_answer', (a) => answers.push(a)); await act(() => tree.root.findByType('input').props.onChange({target:{value:'live'}})); await click(saveButton(tree));
  assert.deepEqual(answers,[{option_id:'a'},{text:'live'}]); await act(() => tree.unmount());
});
await test('malformed persisted answers show a warning and disable editing instead of crashing or overwriting', async () => {
  for (const [type, initial] of [
    ['single_choice',{option_id:{id:'a'}}], ['single_choice','invalid'], ['short_answer',[]], ['multiple_select',{option_ids:{a:true}}],
    ['ordering',{order:'not-an-array'}], ['ordering',{order:['A',null]}],
    ['matching',{pairs:'not-an-array'}], ['matching',{pairs:[null]}], ['matching',{pairs:[{left:'L',right:3}]}], ['matching',{pairs:[{left:'L',right:'R'},{left:'L',right:'Q'}]}],
    ['short_answer',{text:{}}], ['numeric',{value:{}}], ['numeric',{value:'abc'}], ['open_ended',{text:[]}],
  ]) {
    let tree; const answers=[];
    await act(() => {tree=TestRenderer.create(React.createElement(QuestionRunner,{question:question(type),initial,onAnswer:a=>answers.push(a)}));});
    assert.equal(tree.root.findAllByProps({role:'alert'}).length,1,type);
    for (const tag of ['button','input','textarea','select']) for (const control of tree.root.findAllByType(tag)) assert.equal(control.props.disabled,true,`${type} ${tag}`);
    assert.equal(answers.length,0);await act(()=>tree.unmount());
  }
});
await test('valid previously saved answers are restored without a warning', async () => {
  for(const [type,initial] of [['multiple_select',{option_ids:['a']}],['ordering',{order:['B','A']}],['matching',{pairs:[{left:'L',right:'R'}]}],['short_answer',{text:'saved'}],['numeric',{value:2.5}]]){
    let tree;await act(()=>{tree=TestRenderer.create(React.createElement(QuestionRunner,{question:question(type),initial,onAnswer:()=>{}}));});
    assert.equal(tree.root.findAllByProps({role:'alert'}).length,0,type);
    if(type==='matching')assert.equal(tree.root.findByType('select').props.value,'R');
    if(type==='short_answer')assert.equal(tree.root.findByType('input').props.value,'saved');
    if(type==='numeric')assert.equal(tree.root.findByType('input').props.value,'2.5');
    if(type==='multiple_select')assert.equal(saveButton(tree).props.disabled,false);
    await act(()=>tree.unmount());
  }
});
console.log(`\n${count} QuestionRunner interaction checks passed (React test renderer; no browser).`);
