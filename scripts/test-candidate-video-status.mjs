// Real candidate component, mocked browser/network and LiveKit hooks; not LiveKit E2E.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Module} from 'node:module';
import path from 'node:path';
import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import ts from 'typescript';
// Test-harness fallback: newly introduced platform modules (i18n, exam
// content language, entitlement/module helpers) resolve with safe stubs when
// a suite does not stub them itself. Suite-specific stubs always win because
// their interceptors run first and only fall through to this base loader.
const __FB_T={"exam.next":"Next →","exam.previous":"← Previous","exam.submitExamination":"Submit examination","exam.secureLockdown":"Secure Lockdown","exam.formulas":"Formulas","exam.mathKeyboard":"Math keyboard","exam.openMathKeyboard":"Open platform mathematical keyboard","exam.finalCheck":"Final check","exam.submitTitle":"Submit your paper?","exam.keepWorking":"Keep working","exam.yesSubmit":"Yes, submit now","exam.checkingSaves":"Checking saves…","exam.saveAnswer":"Save answer","exam.saved":"Saved","exam.saving":"Saving…","exam.flagForReview":"Flag for review","exam.clearFlag":"Clear flag","exam.timeRemaining":"Time remaining","exam.question":"Question","exam.autosaveOn":"Autosave on","exam.connectionLost":"Connection lost — your answers are saved locally","exam.paused":"Paused","exam.resume":"Resume","exam.unanswered":"Unanswered","exam.flagged":"Flagged","exam.needSaveFirst":"Save this answer or discard the changes before submitting.","examAccess.secureAccess":"Secure examination access","examAccess.studentCheckIn":"Student check-in","examAccess.title":"Enter your examination","examAccess.subtitle":"Enter your name, examination code, and class to verify your identity and begin your examination.","examAccess.firstName":"First Name","examAccess.lastName":"Last Name","examAccess.examCode":"Examination Code","examAccess.classLabel":"Class","examAccess.selectClass":"Select your class…","examAccess.serverTimed":"Server-timed session","examAccess.answersAutosaved":"Answers autosaved","examAccess.resumeReconnect":"Resume after reconnect","examAccess.verifyBegin":"Verify and Begin","examAccess.verifying":"Verifying…","examAccess.lockdownActive":"Verified EVALORA Secure Exam Browser Environment Active","examAccess.confirmDetails":"I confirm these details are mine and understand that the time limit, submission, autosave and any enabled proctoring are enforced by the server."};
const __FB_REQ={"@/components/i18n/LanguageSwitcher":{LanguageSwitcher:()=>null},"@/components/i18n/I18nProvider":{I18nProvider:({children})=>children,useI18n:()=>({locale:"en",dict:{},t:(k)=>__FB_T[k]??k,setLocale:()=>{},localeNames:{en:"English",fr:"Français",es:"Español"},formatNumber:(l,v)=>String(v),formatDate:(l,v)=>String(v),formatTime:(l,v)=>String(v),formatDateTime:(l,v)=>String(v)}),localeTag:()=> "en"},"@/lib/i18n/server":{getI18n:async()=>({locale:"en",dict:{},t:(k)=>__FB_T[k]??k}),getRequestLocale:async()=> "en"},"@/lib/i18n":{getI18n:async()=>({locale:"en",dict:{},t:(k)=>__FB_T[k]??k}),getRequestLocale:async()=> "en",getDictionary:()=> ({}),translate:(d,k)=>__FB_T[k]??k,makeTranslator:()=>({t:(k)=>__FB_T[k]??k,dict:{}}),formatNumber:(l,v)=>String(v),formatDate:(l,v)=>String(v),formatTime:(l,v)=>String(v),formatDateTime:(l,v)=>String(v),LOCALE_COOKIE:"evalora_locale",LOCALE_COOKIE_MAX_AGE:31536000,LOCALES:["en","fr","es"],LOCALE_NAMES:{en:"English",fr:"Français",es:"Español"},LOCALE_TAGS:{en:"en",fr:"fr",es:"es"},resolveLocale:()=> "en"},"@/lib/examLanguage":{normalizeExamLanguage:()=>null,detectExamLanguage:()=> "en",examLanguageLabel:()=> "English"},"@/lib/capabilities":{getCapabilities:async()=>({entitlement:{planName:"Free",planSlug:"free",status:"free",source:"free",limits:{},modules:{},currentPeriodEnd:null,trialEndsAt:null},featureFlags:{},capabilities:{},isSuperAdmin:false}),requireCapability:async(x)=>x,requireModule:()=>{}},"@/lib/modules":{moduleEnabled:()=>true,MODULE_DEFAULTS:{},MODULE_CATALOG:[],MODULE_GROUPS:[],MODULE_CAPABILITY_GATES:{}},"@/lib/resultLifecycle":{RESULT_STAGES:["draft","in_progress","submitted","marking","results_review","validated","published"],deriveResultStage:()=>({stage:"draft",index:0,complete:false})},"@/components/exam/ResultLifecycle":{ResultLifecycle:()=>null},"@/lib/admin":{audit:async()=>{},requireSuperAdmin:async()=>({user:{id:"test-user"},profile:{platform_role:"super_admin",status:"active"}}),FLASH_COOKIE:"evalora_flash",fstr:()=>null,fnum:()=>null,fint:()=>null}};
const __FB_BASE=Module._load;
Module._load=function(request){if(typeof request==="string"&&request in __FB_REQ){return __FB_REQ[request];}return __FB_BASE.apply(this,arguments);};
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
function compile(source,dest){const f=path.resolve(dest),m=new Module(f);m.filename=f;m.paths=Module._nodeModulePaths(path.dirname(f));m._compile(ts.transpileModule(readFileSync(source,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,f);return m.exports;}
const queue=compile('src/lib/examSaveQueue.ts','scripts/__vid_queue.cjs');const dest='scripts/__vid_exam.cjs';const file=path.resolve(dest);let connection='connecting',camera=false,microphone=false, screen=false,roomProps;
const original=Module._load;Module._load=function(req,parent){if(parent?.filename===file){
 if(req==='@/components/QuestionRunner')return {QuestionRunner:props=>{const [draft,setDraft]=React.useState('');return React.createElement('input',{'data-draft':true,value:draft,onChange:e=>{setDraft(e.target.value);props.onDirtyChange(true);}});}};
 if(req==='@/components/Calculator')return {CalculatorLauncher:()=>null};
 if(req==='@/components/MathKeyboardPanel')return {MathKeyboardPanel:()=>null};
 if(req==='@/components/math-input/MathInputContext')return {MathInputProvider:({children})=>children,useMathInput:()=>({request:()=>{},target:null})};
 if(req==='@/lib/mathInputManager')return {mathInputManager:{open:()=>{},close:()=>{},subscribe:()=>()=>{}}};
 if(req==='@/lib/content')return {plainText:(v)=>String(v??'')};
 if(req==='@/components/Logo'||req==='@/components/RichContent')return {Logo:()=>null,RichContent:()=>null};
 if(req==='@/components/ExamCorrige')return {ExamCorrige:()=>null};
 if(req==='@/components/ExamLanguageShield')return {ExamLanguageShield:()=>null};
 if(req==='@/lib/examExperience')return {DEFAULT_EXAM_EXPERIENCE:{premium:true,duplicateProtection:true,languageLock:true,floatingCalculator:true,interactiveMathTools:true,premiumMathInterface:true},examExperienceFromLimits:()=>({premium:true,duplicateProtection:true,languageLock:true,floatingCalculator:true,interactiveMathTools:true,premiumMathInterface:true})};
 if(req==='@/lib/examLanguage')return {detectExamLanguage:()=> 'en'};
 if(req==='@/lib/examResults')return {answerKeyLine:()=>null,optionMarkings:()=>[],resultLabel:()=>''};
 if(req==='@/lib/examFeedback')return {questionFeedback:()=>({assessed:null,scheme:null,improve:null,any:false}),resultSummary:(questions,pass)=>({awarded:0,max:0,percent:0,passPercent:pass,passed:false,objective:{awarded:0,max:0,percent:0,count:0},structured:{awarded:0,max:0,percent:0,count:0},topics:[],criteria:[],strongTopics:[],weakTopics:[],pendingManual:false,pendingCount:0,message:'summary'})};
 if(req==='@/lib/integrity')return {parseIntegrityPolicy:raw=>({...raw,enabled:true,tabSwitch:true,focusLoss:true,fullscreen:true,clipboard:true,sound:true,warnAfter:3,reviewAfter:5})};
 if(req==='@/lib/integrityMonitor')return {IntegrityMonitor:class{start(){}stop(){}}};
 if(req==='@/lib/useAssessmentLockdown') return {useProtectedSurface:()=>{},useAssessmentLockdown:()=>{}};
 if(req==='@/lib/lockdown')return {buildLockdownLaunchUrl:()=>'',DEFAULT_EXAM_LOCKDOWN:{enabled:false,require_app:false}};
 if(req==='@/lib/lockdownClient')return {isSecureBrowserEnvironment:()=>false,persistSecureBrowserState:()=>{}};
 if(req==='@/lib/examSaveQueue')return queue;
 if(req==='./ExamMessenger')return {ExamMessenger:()=>null};
 if(req==='./RetakePanel')return {RetakePanel:()=>null};
 if(req==='./HintPanel')return {HintPanel:()=>null};
 if(req==='./FormulaPanel')return {FormulaPanel:()=>null};
 if(req==='@/components/PresenceRail')return {PresenceRail:()=>null};
 if(req==='@/lib/hintAttention')return {answerStateFor:({hasSavedAnswer,isCorrect})=>!hasSavedAnswer?'unanswered':isCorrect===true?'correct':isCorrect===false?'incorrect':'answered'};
 if(req==='@/lib/presence')return {PRESENCE_HEARTBEAT_MS:20000,PRESENCE_REFRESH_MS:15000};
 if(req==='@/components/ui')return {Button:p=>React.createElement('button',p),ButtonLink:p=>React.createElement('a',p),Input:p=>React.createElement('input',p),Textarea:p=>React.createElement('textarea',p),Select:p=>React.createElement('select',p),Field:({label,children})=>React.createElement('div',null,children),Card:p=>React.createElement('div',p),Badge:p=>React.createElement('span',p),PageTitle:()=>null,DataTable:()=>null,EmptyState:()=>null,StatCard:()=>null};
 if(req==='@/lib/utils')return {cn:(...v)=>v.filter(Boolean).join(' '),mmss:()=> '10:00'};
 if(req==='@livekit/components-styles')return {};
 if(req==='@livekit/components-react')return {LiveKitRoom:p=>{roomProps=p;return React.createElement('section',null,p.children)},VideoTrack:()=>null,useConnectionState:()=>connection,useLocalParticipant:()=>({isCameraEnabled:camera,isMicrophoneEnabled:microphone,isScreenShareEnabled:screen,localParticipant:{setScreenShareEnabled:async value=>{screen=value;}}}),useTracks:()=>[]};
 if(req==='livekit-client')return {Track:{Source:{Camera:'camera'}}};
 if(req==='lucide-react')return {Flag:()=>null,ShieldAlert:()=>null,ShieldCheck:()=>null,X:()=>null,Sigma:()=>null};
}return original.apply(this,arguments);};
const {TakeExamClient}=compile('src/app/take-exam/[attemptId]/TakeExamClient.tsx',dest);Module._load=original;
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
