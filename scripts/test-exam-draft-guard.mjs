// React-level exam interaction tests with fake browser/network; not browser or DB E2E.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Module} from 'node:module';
import path from 'node:path';
import React from 'react';
import TestRenderer, {act} from 'react-test-renderer';
import ts from 'typescript';
// Test-harness fallback: newly introduced platform modules (i18n, exam
// content language, entitlement/module helpers) resolve with safe stubs when
// a suite does not stub them itself. Suite-specific stubs always win because
// their interceptors run first and only fall through to this base loader.
const __FB_T={"exam.next":"Next →","exam.previous":"← Previous","exam.submitExamination":"Submit examination","exam.secureLockdown":"Secure Lockdown","exam.formulas":"Formulas","exam.mathKeyboard":"Math keyboard","exam.openMathKeyboard":"Open platform mathematical keyboard","exam.finalCheck":"Final check","exam.submitTitle":"Submit your paper?","exam.keepWorking":"Keep working","exam.yesSubmit":"Yes, submit now","exam.checkingSaves":"Checking saves…","exam.saveAnswer":"Save answer","exam.saved":"Saved","exam.saving":"Saving…","exam.flagForReview":"Flag for review","exam.clearFlag":"Clear flag","exam.timeRemaining":"Time remaining","exam.question":"Question","exam.autosaveOn":"Autosave on","exam.connectionLost":"Connection lost — your answers are saved locally","exam.paused":"Paused","exam.resume":"Resume","exam.unanswered":"Unanswered","exam.flagged":"Flagged","exam.needSaveFirst":"Save this answer or discard the changes before submitting.","examAccess.secureAccess":"Secure examination access","examAccess.studentCheckIn":"Student check-in","examAccess.title":"Enter your examination","examAccess.subtitle":"Enter your name, examination code, and class to verify your identity and begin your examination.","examAccess.firstName":"First Name","examAccess.lastName":"Last Name","examAccess.examCode":"Examination Code","examAccess.classLabel":"Class","examAccess.selectClass":"Select your class…","examAccess.serverTimed":"Server-timed session","examAccess.answersAutosaved":"Answers autosaved","examAccess.resumeReconnect":"Resume after reconnect","examAccess.verifyBegin":"Verify and Begin","examAccess.verifying":"Verifying…","examAccess.lockdownActive":"Verified EVALORA Secure Exam Browser Environment Active","examAccess.confirmDetails":"I confirm these details are mine and understand that the time limit, submission, autosave and any enabled proctoring are enforced by the server."};
const __FB_REQ={"@/components/CandidatePaperDownloadButton":{CandidatePaperDownloadButton:()=>null},"@/lib/scoreAdjustmentsServer":{computeAttemptScoreWithAdjustments:async(_c,_id,raw,max)=>{const n=Number(raw)||0;return typeof max==="number"&&Number.isFinite(max)?Math.min(n,max):n},loadExamScoreAdjustmentContext:async()=>null,previewScoreAdjustmentServer:async()=>({ok:false,status:400,code:"unavailable",error:"unavailable"}),applyScoreAdjustmentServer:async()=>({ok:false,status:400,code:"unavailable",error:"unavailable"}),isUuid:()=>true},"@/lib/formulaLibrary":{validateSheetDraft:(raw)=>Array.isArray(raw)&&raw.length?{ok:true,groups:raw}:{ok:false,error:"empty"},validateFormulaInput:()=>({ok:true,value:{topic:"t",chapter:null,title:"x",latex:"x",note:null,subject_id:null}}),groupLibraryEntries:()=>[],unwrapMathDelimiters:(v)=>String(v),FORMULA_LIMITS:{maxTopics:60,maxEntries:500,topic:120,chapter:120,title:160,latex:300,note:240,maxSheetGroups:8,maxSheetItems:12}},"@/components/PlatformCredit":{PlatformCredit:()=>null},"@/components/i18n/LanguageSwitcher":{LanguageSwitcher:()=>null},"@/components/i18n/I18nProvider":{I18nProvider:({children})=>children,useI18n:()=>({locale:"en",dict:{},t:(k)=>__FB_T[k]??k,setLocale:()=>{},localeNames:{en:"English",fr:"Français",es:"Español"},formatNumber:(l,v)=>String(v),formatDate:(l,v)=>String(v),formatTime:(l,v)=>String(v),formatDateTime:(l,v)=>String(v)}),localeTag:()=> "en"},"@/lib/i18n/server":{getI18n:async()=>({locale:"en",dict:{},t:(k)=>__FB_T[k]??k}),getRequestLocale:async()=> "en"},"@/lib/i18n":{getI18n:async()=>({locale:"en",dict:{},t:(k)=>__FB_T[k]??k}),getRequestLocale:async()=> "en",getDictionary:()=> ({}),translate:(d,k)=>__FB_T[k]??k,makeTranslator:()=>({t:(k)=>__FB_T[k]??k,dict:{}}),formatNumber:(l,v)=>String(v),formatDate:(l,v)=>String(v),formatTime:(l,v)=>String(v),formatDateTime:(l,v)=>String(v),LOCALE_COOKIE:"evalora_locale",LOCALE_COOKIE_MAX_AGE:31536000,LOCALES:["en","fr","es"],LOCALE_NAMES:{en:"English",fr:"Français",es:"Español"},LOCALE_TAGS:{en:"en",fr:"fr",es:"es"},resolveLocale:()=> "en"},"@/lib/examLanguage":{normalizeExamLanguage:()=>null,detectExamLanguage:()=> "en",examLanguageLabel:()=> "English"},"@/lib/capabilities":{getCapabilities:async()=>({entitlement:{planName:"Free",planSlug:"free",status:"free",source:"free",limits:{},modules:{},currentPeriodEnd:null,trialEndsAt:null},featureFlags:{},capabilities:{},isSuperAdmin:false}),requireCapability:async(x)=>x,requireModule:()=>{}},"@/lib/modules":{moduleEnabled:()=>true,MODULE_DEFAULTS:{},MODULE_CATALOG:[],MODULE_GROUPS:[],MODULE_CAPABILITY_GATES:{}},"@/lib/resultLifecycle":{RESULT_STAGES:["draft","in_progress","submitted","marking","results_review","validated","published"],deriveResultStage:()=>({stage:"draft",index:0,complete:false})},"@/components/exam/ResultLifecycle":{ResultLifecycle:()=>null},"@/lib/admin":{audit:async()=>{},requireSuperAdmin:async()=>({user:{id:"test-user"},profile:{platform_role:"super_admin",status:"active"}}),FLASH_COOKIE:"evalora_flash",fstr:()=>null,fnum:()=>null,fint:()=>null}};
const __FB_BASE=Module._load;
Module._load=function(request){if(typeof request==="string"&&request in __FB_REQ){return __FB_REQ[request];}return __FB_BASE.apply(this,arguments);};
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
  if(request==='@/components/Calculator') return {CalculatorLauncher:()=>null};
  if(request==='@/components/MathKeyboardPanel') return {MathKeyboardPanel:()=>null};
  if(request==='@/components/math-input/MathInputContext') return {MathInputProvider:({children})=>children,useMathInput:()=>({request:()=>{},target:null})};
  if(request==='@/lib/mathInputManager') return {mathInputManager:{open:()=>{},close:()=>{},subscribe:()=>()=>{}}};
  if(request==='@/lib/content') return {plainText:(v)=>String(v??'')};
  if(request==='@/components/Logo') return {Logo:()=>null};
  if(request==='@/components/RichContent') return {RichContent:()=>null};
  if(request==='@/components/ExamCorrige') return {ExamCorrige:()=>null};
  if(request==='@/components/ExamLanguageShield') return {ExamLanguageShield:()=>null};
  if(request==='@/lib/examExperience') return {DEFAULT_EXAM_EXPERIENCE:{premium:true,duplicateProtection:true,languageLock:true,floatingCalculator:true,interactiveMathTools:true,premiumMathInterface:true},examExperienceFromLimits:()=>({premium:true,duplicateProtection:true,languageLock:true,floatingCalculator:true,interactiveMathTools:true,premiumMathInterface:true})};
  if(request==='@/lib/examLanguage') return {detectExamLanguage:()=> 'en'};
  if(request==='@/lib/examResults') return {answerKeyLine:()=>null,optionMarkings:()=>[],resultLabel:()=>'',
    // the client only reads presentation helpers; keep them inert here
    parseIntegrityPolicy:undefined};
  if(request==='@/lib/examFeedback') return {
    questionFeedback:()=>({assessed:null,scheme:null,improve:null,any:false}),
    resultSummary:(questions,pass)=>({awarded:0,max:0,percent:0,passPercent:pass,passed:false,
      objective:{awarded:0,max:0,percent:0,count:0},structured:{awarded:0,max:0,percent:0,count:0},
      topics:[],criteria:[],strongTopics:[],weakTopics:[],pendingManual:false,pendingCount:0,message:'summary'})};
  if(request==='@/lib/integrity') return {parseIntegrityPolicy:(raw)=>({...raw,enabled:true,tabSwitch:true,focusLoss:true,fullscreen:true,clipboard:true,sound:true,warnAfter:3,reviewAfter:5})};
  if(request==='@/lib/integrityMonitor') return {IntegrityMonitor:class{start(){}stop(){}}};
  if(request==='@/lib/useAssessmentLockdown') return {useProtectedSurface:()=>{},useAssessmentLockdown:()=>{}};
  if(request==='@/lib/lockdown')return {buildLockdownLaunchUrl:()=>'',DEFAULT_EXAM_LOCKDOWN:{enabled:false,require_app:false}};
  if(request==='@/lib/lockdownClient')return {isSecureBrowserEnvironment:()=>false,persistSecureBrowserState:()=>{}};
  if(request==='@/lib/examSaveQueue') return queue;
  if(request==='./ExamMessenger') return {ExamMessenger:()=>null};
  if(request==='./RetakePanel') return {RetakePanel:()=>null};
  if(request==='./HintPanel') return {HintPanel:()=>null};
  if(request==='./FormulaPanel') return {FormulaPanel:()=>null};
  if(request==='@/components/PresenceRail') return {PresenceRail:()=>null};
  if(request==='@/lib/hintAttention') return {answerStateFor:({hasSavedAnswer,isCorrect})=>!hasSavedAnswer?'unanswered':isCorrect===true?'correct':isCorrect===false?'incorrect':'answered'};
  if(request==='@/lib/presence') return {PRESENCE_HEARTBEAT_MS:20000,PRESENCE_REFRESH_MS:15000};
  if(request==='@/components/ui') return {Button:(p)=>React.createElement('button',p),ButtonLink:(p)=>React.createElement('a',p),Input:(p)=>React.createElement('input',p),Textarea:(p)=>React.createElement('textarea',p),Select:(p)=>React.createElement('select',p),Field:({label,children})=>React.createElement('div',null,children),Card:(p)=>React.createElement('div',p),Badge:(p)=>React.createElement('span',p),PageTitle:()=>null,DataTable:()=>null,EmptyState:()=>null,StatCard:()=>null};
  if(request==='@/lib/utils') return {cn:(...args)=>args.filter(Boolean).join(' '),mmss:()=> '10:00'};
  if(request==='@livekit/components-styles') return {};
  if(request==='@livekit/components-react') return {};
  if(request==='livekit-client') return {Track:{Source:{}}};
  if(request==='lucide-react') return {Flag:()=>null,ShieldAlert:()=>null,ShieldCheck:()=>null,X:()=>null,Sigma:()=>null};
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
