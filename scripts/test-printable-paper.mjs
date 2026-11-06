// Test real sanitization/format eligibility without a production database.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Module} from 'node:module';
import path from 'node:path';
import ts from 'typescript';
function compile(src, dest){let file=path.resolve(dest);let m=new Module(file);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));m._compile(ts.transpileModule(readFileSync(src,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);return m.exports;}
const live=compile('src/lib/live.ts','scripts/__print_live.cjs');
const paperFile=path.resolve('scripts/__print_paper.cjs');const orig=Module._load;
Module._load=function(req,parent){if(parent?.filename===paperFile && req==='./live')return live;return orig.apply(this,arguments);};
const {preparePrintableQuestions}=compile('src/lib/printablePaper.ts',paperFile);Module._load=orig;
function row(type='single_choice'){return {id:'qq',question_id:'q',points:2,questions:{id:'q',organization_id:'org-a',type,prompt:'2+2?',prompt_doc:null,points:1,config:{numeric_answer:4,accepted_answers:['secret'],media_type:null},explanation:'ANSWER KEY SECRET',question_options:[{id:'o1',label:'4',is_correct:true,position:0},{id:'o2',label:'5',is_correct:false,position:1}]}};}
let n=0;function test(name,fn){fn();n++;console.log('  ✓ '+name);}
test('choice paper omits correctness and secrets',()=>{const p=preparePrintableQuestions([row()],'org-a');assert.equal(p[0].points,2);assert.equal(p[0].options.length,2);assert.doesNotMatch(JSON.stringify(p),/is_correct|numeric_answer|accepted_answers|ANSWER KEY SECRET/);});
test('short answer never exposes answer-key options',()=>{assert.deepEqual(preparePrintableQuestions([row('short_answer')],'org-a')[0].options,[]);});
test('foreign tenant and inconsistent association rejected',()=>{assert.throws(()=>preparePrintableQuestions([row()],'org-b'),/organization/);const r=row();r.question_id='foreign';assert.throws(()=>preparePrintableQuestions([r],'org-a'),/organization/);});
test('unsupported interactive types and audio are not silently omitted',()=>{assert.throws(()=>preparePrintableQuestions([row('matching')],'org-a'),/not yet supported/);const r=row();r.questions.config={media_url:'https://example.com/a.mp3',media_type:'audio'};assert.throws(()=>preparePrintableQuestions([r],'org-a'),/cannot be printed/);});
test('empty paper, missing options and negative marks fail closed',()=>{assert.throws(()=>preparePrintableQuestions([],'org-a'),/no questions/);const r=row();r.questions.question_options=[];assert.throws(()=>preparePrintableQuestions([r],'org-a'),/no printable options/);r.points=-1;assert.throws(()=>preparePrintableQuestions([r],'org-a'),/invalid marks/);});
test('long, numeric and image-backed questions are accepted without answers',()=>{for(const type of ['open_ended','numeric']){const r=row(type);r.questions.config={media_url:'https://example.com/image.png',media_type:'image',answer:'secret'};const [out]=preparePrintableQuestions([r],'org-a');assert.equal(out.media_type,'image');assert.deepEqual(out.options,[]);assert.doesNotMatch(JSON.stringify(out),/secret/);}});
console.log(`\n${n} printable-paper checks passed (real sanitizer, no DB/browser).`);
