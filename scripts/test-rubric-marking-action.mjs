// Exercises the real markWithRubric / moderateAnswer server actions with mocked
// authorization and database, so the criterion-parsing and bounds logic is not
// only proven by the browser.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Module} from 'node:module';
import path from 'node:path';
import ts from 'typescript';
// Test-harness fallback: newly introduced platform modules (i18n, exam
// content language, entitlement/module helpers) resolve with safe stubs when
// a suite does not stub them itself. Suite-specific stubs always win because
// their interceptors run first and only fall through to this base loader.
const __FB_T={"exam.next":"Next →","exam.previous":"← Previous","exam.submitExamination":"Submit examination","exam.secureLockdown":"Secure Lockdown","exam.formulas":"Formulas","exam.mathKeyboard":"Math keyboard","exam.openMathKeyboard":"Open platform mathematical keyboard","exam.finalCheck":"Final check","exam.submitTitle":"Submit your paper?","exam.keepWorking":"Keep working","exam.yesSubmit":"Yes, submit now","exam.checkingSaves":"Checking saves…","exam.saveAnswer":"Save answer","exam.saved":"Saved","exam.saving":"Saving…","exam.flagForReview":"Flag for review","exam.clearFlag":"Clear flag","exam.timeRemaining":"Time remaining","exam.question":"Question","exam.autosaveOn":"Autosave on","exam.connectionLost":"Connection lost — your answers are saved locally","exam.paused":"Paused","exam.resume":"Resume","exam.unanswered":"Unanswered","exam.flagged":"Flagged","exam.needSaveFirst":"Save this answer or discard the changes before submitting.","examAccess.secureAccess":"Secure examination access","examAccess.studentCheckIn":"Student check-in","examAccess.title":"Enter your examination","examAccess.subtitle":"Enter your name, examination code, and class to verify your identity and begin your examination.","examAccess.firstName":"First Name","examAccess.lastName":"Last Name","examAccess.examCode":"Examination Code","examAccess.classLabel":"Class","examAccess.selectClass":"Select your class…","examAccess.serverTimed":"Server-timed session","examAccess.answersAutosaved":"Answers autosaved","examAccess.resumeReconnect":"Resume after reconnect","examAccess.verifyBegin":"Verify and Begin","examAccess.verifying":"Verifying…","examAccess.lockdownActive":"Verified EVALORA Secure Exam Browser Environment Active","examAccess.confirmDetails":"I confirm these details are mine and understand that the time limit, submission, autosave and any enabled proctoring are enforced by the server."};
const __FB_REQ={"@/components/i18n/LanguageSwitcher":{LanguageSwitcher:()=>null},"@/components/i18n/I18nProvider":{I18nProvider:({children})=>children,useI18n:()=>({locale:"en",dict:{},t:(k)=>__FB_T[k]??k,setLocale:()=>{},localeNames:{en:"English",fr:"Français",es:"Español"},formatNumber:(l,v)=>String(v),formatDate:(l,v)=>String(v),formatTime:(l,v)=>String(v),formatDateTime:(l,v)=>String(v)}),localeTag:()=> "en"},"@/lib/i18n/server":{getI18n:async()=>({locale:"en",dict:{},t:(k)=>__FB_T[k]??k}),getRequestLocale:async()=> "en"},"@/lib/i18n":{getI18n:async()=>({locale:"en",dict:{},t:(k)=>__FB_T[k]??k}),getRequestLocale:async()=> "en",getDictionary:()=> ({}),translate:(d,k)=>__FB_T[k]??k,makeTranslator:()=>({t:(k)=>__FB_T[k]??k,dict:{}}),formatNumber:(l,v)=>String(v),formatDate:(l,v)=>String(v),formatTime:(l,v)=>String(v),formatDateTime:(l,v)=>String(v),LOCALE_COOKIE:"evalora_locale",LOCALE_COOKIE_MAX_AGE:31536000,LOCALES:["en","fr","es"],LOCALE_NAMES:{en:"English",fr:"Français",es:"Español"},LOCALE_TAGS:{en:"en",fr:"fr",es:"es"},resolveLocale:()=> "en"},"@/lib/examLanguage":{normalizeExamLanguage:()=>null,detectExamLanguage:()=> "en",examLanguageLabel:()=> "English"},"@/lib/capabilities":{getCapabilities:async()=>({entitlement:{planName:"Free",planSlug:"free",status:"free",source:"free",limits:{},modules:{},currentPeriodEnd:null,trialEndsAt:null},featureFlags:{},capabilities:{},isSuperAdmin:false}),requireCapability:async(x)=>x,requireModule:()=>{}},"@/lib/modules":{moduleEnabled:()=>true,MODULE_DEFAULTS:{},MODULE_CATALOG:[],MODULE_GROUPS:[],MODULE_CAPABILITY_GATES:{}},"@/lib/resultLifecycle":{RESULT_STAGES:["draft","in_progress","submitted","marking","results_review","validated","published"],deriveResultStage:()=>({stage:"draft",index:0,complete:false})},"@/components/exam/ResultLifecycle":{ResultLifecycle:()=>null},"@/lib/admin":{audit:async()=>{},requireSuperAdmin:async()=>({user:{id:"test-user"},profile:{platform_role:"super_admin",status:"active"}}),FLASH_COOKIE:"evalora_flash",fstr:()=>null,fnum:()=>null,fint:()=>null}};
const __FB_BASE=Module._load;
Module._load=function(request){if(typeof request==="string"&&request in __FB_REQ){return __FB_REQ[request];}return __FB_BASE.apply(this,arguments);};

const file = path.resolve('scripts/__virtual_grading_actions.cjs');

const ORG = '11111111-1111-4111-8111-111111111111';
const EXAM = '22222222-2222-4222-8222-222222222222';
const QUIZ = '33333333-3333-4333-8333-333333333333';
const ATTEMPT = '44444444-4444-4444-8444-444444444444';
const ANSWER = '55555555-5555-4555-8555-555555555555';
const QUESTION = '66666666-6666-4666-8666-666666666666';
const RUBRIC = '77777777-7777-4777-8777-777777777777';
const C1 = '88888888-8888-4888-8888-888888888888';
const C2 = '99999999-9999-4999-8999-999999999999';
const GRADER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

let state;
let writes;

function setup() {
  state = {
    org: ORG,
    allowed: true,
    exam: {id: EXAM, quiz_id: QUIZ},
    attempt: {id: ATTEMPT, exam_id: EXAM, status: 'submitted'},
    answer: {
      id: ANSWER,
      attempt_id: ATTEMPT,
      question_id: QUESTION,
      quiz_question_id: null,
      points_awarded: 0,
      questions: {organization_id: ORG, points: 10, type: 'open_ended'},
      exam_attempts: {exam_id: EXAM, status: 'submitted'},
    },
    quizQuestion: {id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', points: 10},
    rubric: {id: RUBRIC},
    link: {id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'},
    criteria: [
      {id: C1, max_marks: 6, position: 0},
      {id: C2, max_marks: 6, position: 1},
    ],
    answers: [{points_awarded: 0, is_correct: null}],
    fail: {},
  };
  writes = [];
}

function resolve(table, ctx, single) {
  const key = table;
  if (state.fail[key]) return {data: null, error: {message: 'failure'}};
  const op = ctx.op;

  if (table === 'exam_answers' && op === 'update') {
    writes.push({op: 'update', table, payload: ctx.payload});
    // Keep the fake rows consistent so the attempt total is recomputed from the
    // mark that was just written, as it would be in the database.
    if (ctx.payload.points_awarded !== undefined) {
      state.answer.points_awarded = ctx.payload.points_awarded;
      state.answers = [{points_awarded: ctx.payload.points_awarded, is_correct: ctx.payload.is_correct ?? null}];
    }
    return {data: single ? {id: state.answer.id} : [{id: state.answer.id}], error: null};
  }
  if (table === 'exam_attempts' && op === 'update') {
    writes.push({op: 'update', table, payload: ctx.payload});
    return {data: single ? {id: state.attempt.id} : [{id: state.attempt.id}], error: null};
  }
  if (table === 'answer_rubric_scores') {
    if (op === 'delete') {
      writes.push({op: 'delete', table, filters: ctx.filters});
      return {data: null, error: null};
    }
    if (op === 'insert') {
      writes.push({op: 'insert', table, payload: ctx.payload});
      return {data: null, error: null};
    }
  }
  if (table === 'grading_moderation' && op === 'insert') {
    writes.push({op: 'insert', table, payload: ctx.payload});
    return {data: null, error: null};
  }

  const rows = {
    exams: state.exam,
    exam_attempts: state.attempt,
    exam_answers: state.answer,
    quiz_questions: state.quizQuestion,
    grading_rubrics: state.rubric,
    exam_rubric_links: state.link,
  }[table];

  if (table === 'grading_rubric_criteria') return {data: state.criteria, error: null};
  if (table === 'exam_answers' && ctx.cols && ctx.cols.includes('points_awarded, is_correct')) {
    return {data: state.answers, error: null};
  }
  if (rows === undefined || rows === null) return {data: single ? null : [], error: null};
  // Honour the equality filters the action relies on, so a row that does not
  // belong to the requested examination or workspace is not returned.
  const matches = ctx.filters.every(([key, value]) => !(key in rows) || rows[key] === value);
  if (!matches) return {data: single ? null : [], error: null};
  return {data: single ? rows : [rows], error: null};
}

function from(table) {
  const ctx = {op: 'select', filters: [], cols: null, payload: null};
  const api = {
    select(cols) { ctx.cols = String(cols); return api; },
    delete() { ctx.op = 'delete'; return api; },
    insert(payload) { ctx.op = 'insert'; ctx.payload = payload; return api; },
    update(payload) { ctx.op = 'update'; ctx.payload = payload; return api; },
    eq(k, v) { ctx.filters.push([k, v]); return api; },
    or() { return api; },
    in() { return api; },
    order() { return api; },
    limit() { return api; },
    maybeSingle() { return Promise.resolve(resolve(table, ctx, true)); },
    then(onOk, onErr) { return Promise.resolve(resolve(table, ctx, false)).then(onOk, onErr); },
  };
  return api;
}

const db = {from};

const stub = {
  '@/lib/auth': {
    requireUser: async () => ({org: {id: state.org}, allowed: state.allowed, user: {id: GRADER, email: 'grader@example.com'}}),
    activeOrg: (ctx) => (ctx.org ? ctx.org : null),
    can: (ctx) => ctx.allowed,
    CREATOR_ROLES: [],
    MARKER_ROLES: [],
    PROCTOR_ROLES: [],
  },
  '@/lib/entitlements': {withinLimit: () => true},
  '@/lib/ai-marking': {describeAiMarking: () => ({configured: false, reason: 'not configured'})},
  '@/lib/capabilities': {getCapabilities: async () => ({entitlement: {}, capabilities: {}})},
  '@/lib/supabase/server': {createClient: async () => db, createAdminClient: () => db},
  '@/lib/utils': {genCode: () => 'CODE1234'},
  'next/cache': {revalidatePath: () => {}},
  'next/navigation': {redirect: (url) => {const e = Error(url); e.url = url; throw e;}},
};

const load = Module._load;
Module._load = function (request, parent) {
  if (parent?.filename === file && stub[request]) {
    if (parent?.filename === file && request === '@/lib/auth' && state) {
      const base = {...stub['@/lib/auth']};
      base.requireUser = async () => ({org: {id: state.org}, allowed: state.allowed, user: {id: GRADER, email: 'grader@example.com'}});
      base.activeOrg = (ctx) => (ctx.org ? ctx.org : null);
      base.can = (ctx) => ctx.allowed;
      return base;
    }
    return stub[request];
  }
  return load.apply(this, arguments);
};
const mod = new Module(file);
mod.filename = file;
mod.paths = Module._nodeModulePaths(path.dirname(file));
mod._compile(
  ts.transpileModule(readFileSync('src/app/dashboard/exams/actions.ts', 'utf8'), {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
  }).outputText,
  file,
);
Module._load = load;

function form(fields) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, String(v));
  return fd;
}

async function call(name, fields) {
  try {
    await mod.exports[name](form(fields));
    throw Error('redirect expected');
  } catch (e) {
    if (!e.url) throw e;
    return e.url;
  }
}

function rubricFields(marks) {
  const base = {answer_id: ANSWER, attempt_id: ATTEMPT, exam_id: EXAM, rubric_id: RUBRIC, note: 'criterion marking'};
  for (const [id, value] of Object.entries(marks)) base[`criterion_${id}`] = value;
  return base;
}

let count = 0;
async function test(name, fn) {
  setup();
  await fn();
  count++;
  console.log('  ✓ ' + name);
}

await test('saves criterion marks, sums them and recomputes the attempt', async () => {
  const url = await call('markWithRubric', rubricFields({[C1]: 5, [C2]: 4}));
  assert.match(url, /mark_ok=rubric/);
  const insert = writes.find((w) => w.table === 'answer_rubric_scores' && w.op === 'insert');
  assert.ok(insert, 'criterion scores must be written');
  assert.equal(insert.payload.length, 2);
  assert.equal(insert.payload[0].marks_awarded, 5);
  assert.equal(insert.payload[0].grader_id, GRADER);
  assert.equal(insert.payload[0].organization_id, ORG);
  const answerWrite = writes.find((w) => w.table === 'exam_answers' && w.op === 'update');
  assert.equal(answerWrite.payload.points_awarded, 9);
  assert.equal(answerWrite.payload.grading_method, 'rubric');
  assert.equal(answerWrite.payload.is_correct, true);
  const attemptWrite = writes.find((w) => w.table === 'exam_attempts' && w.op === 'update');
  assert.equal(attemptWrite.payload.score, 9);
});

await test('clears only this grader\u2019s previous criterion scores', async () => {
  await call('markWithRubric', rubricFields({[C1]: 1, [C2]: 1}));
  const clear = writes.find((w) => w.table === 'answer_rubric_scores' && w.op === 'delete');
  assert.ok(clear, 'previous scores must be replaced');
  assert.deepEqual(clear.filters, [['answer_id', ANSWER], ['grader_id', GRADER]]);
});

await test('rejects a criterion above its own maximum without writing', async () => {
  const url = await call('markWithRubric', rubricFields({[C1]: 7, [C2]: 1}));
  assert.match(url, /mark_error=criteria/);
  assert.equal(writes.length, 0);
});

await test('rejects a blank criterion instead of scoring it as zero', async () => {
  const url = await call('markWithRubric', rubricFields({[C1]: 5, [C2]: ''}));
  assert.match(url, /mark_error=criteria/);
  assert.equal(writes.length, 0);
});

await test('rejects a total above the question maximum', async () => {
  state.quizQuestion = {id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', points: 8};
  const url = await call('markWithRubric', rubricFields({[C1]: 6, [C2]: 6}));
  assert.match(url, /mark_error=rubric_total/);
  assert.equal(writes.length, 0);
});

await test('rejects a rubric that is not attached to the examination', async () => {
  state.link = null;
  const url = await call('markWithRubric', rubricFields({[C1]: 1, [C2]: 1}));
  assert.match(url, /mark_error=rubric/);
  assert.equal(writes.length, 0);
});

await test('rejects a rubric owned by another workspace', async () => {
  state.rubric = null;
  const url = await call('markWithRubric', rubricFields({[C1]: 1, [C2]: 1}));
  assert.match(url, /mark_error=rubric/);
  assert.equal(writes.length, 0);
});

await test('rejects marking a foreign attempt', async () => {
  state.attempt = {id: ATTEMPT, exam_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', status: 'submitted'};
  const url = await call('markWithRubric', rubricFields({[C1]: 1, [C2]: 1}));
  assert.match(url, /mark_error=invalid/);
  assert.equal(writes.length, 0);
});

await test('rejects grading while the attempt is in progress', async () => {
  state.attempt.status = 'in_progress';
  const url = await call('markWithRubric', rubricFields({[C1]: 1, [C2]: 1}));
  assert.match(url, /mark_error=in_progress/);
  assert.equal(writes.length, 0);
});

await test('moderation sends only the decision; the database derives the context', async () => {
  const url = await call('moderateAnswer', {answer_id: ANSWER, exam_id: EXAM, decision: 'adjusted', proposed_marks: 8.5, note: 'second opinion'});
  assert.match(url, /moderation_ok=adjusted/);
  const insert = writes.find((w) => w.table === 'grading_moderation');
  assert.deepEqual(Object.keys(insert.payload).sort(), ['answer_id', 'decision', 'moderator_email', 'moderator_id', 'note', 'proposed_marks']);
  assert.equal(insert.payload.proposed_marks, 8.5);
  assert.equal(insert.payload.moderator_id, GRADER);
  assert.ok(writes.some((w) => w.table === 'exam_attempts' && w.op === 'update'), 'attempt total must be recomputed');
});

await test('an adjustment without a corrected mark is rejected', async () => {
  const url = await call('moderateAnswer', {answer_id: ANSWER, exam_id: EXAM, decision: 'adjusted'});
  assert.match(url, /moderation_error=marks/);
  assert.equal(writes.length, 0);
});

await test('a corrected mark above the question maximum is rejected', async () => {
  const url = await call('moderateAnswer', {answer_id: ANSWER, exam_id: EXAM, decision: 'adjusted', proposed_marks: 11});
  assert.match(url, /moderation_error=marks/);
  assert.equal(writes.length, 0);
});

await test('an unknown decision is rejected', async () => {
  const url = await call('moderateAnswer', {answer_id: ANSWER, exam_id: EXAM, decision: 'overridden', proposed_marks: 3});
  assert.match(url, /moderation_error=decision/);
  assert.equal(writes.length, 0);
});

await test('approval needs no corrected mark and writes no marks change', async () => {
  const url = await call('moderateAnswer', {answer_id: ANSWER, exam_id: EXAM, decision: 'approved', note: 'agreed'});
  assert.match(url, /moderation_ok=approved/);
  const insert = writes.find((w) => w.table === 'grading_moderation');
  assert.equal(insert.payload.proposed_marks, null);
  assert.equal(writes.filter((w) => w.table === 'exam_answers').length, 0, 'approval must not rewrite the mark');
});

await test('a member without a marking role cannot grade', async () => {
  state.allowed = false;
  assert.equal(await call('markWithRubric', rubricFields({[C1]: 1, [C2]: 1})), '/dashboard/exams');
  assert.equal(await call('moderateAnswer', {answer_id: ANSWER, exam_id: EXAM, decision: 'approved'}), '/dashboard/exams');
  assert.equal(writes.length, 0);
});

await test('a database failure is never reported as success', async () => {
  state.fail.answer_rubric_scores = true;
  const url = await call('markWithRubric', rubricFields({[C1]: 1, [C2]: 1}));
  assert.match(url, /mark_error=failed/);
});

console.log(`\n${count} rubric marking and moderation action checks passed (mocked auth/database).`);
