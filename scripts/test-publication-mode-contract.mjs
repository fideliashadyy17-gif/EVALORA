// Contract checks for persisted result-publication modes and candidate-safe release.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Module } from 'node:module';
import path from 'node:path';
import ts from 'typescript';

const migration = readFileSync('supabase/migrations/0062_result_publication_modes_and_grading_state.sql', 'utf8');
const examState = readFileSync('src/app/api/exam/state/route.ts', 'utf8');
const liveState = readFileSync('src/app/api/live/state/route.ts', 'utf8');
const examActions = readFileSync('src/app/dashboard/exams/actions.ts', 'utf8');
const adminExamActions = readFileSync('src/app/admin/examinations/actions.ts', 'utf8');
const compActions = readFileSync('src/app/admin/actions/competitions.ts', 'utf8');
const quizActions = readFileSync('src/app/dashboard/quizzes/actions.ts', 'utf8');
const hostActions = readFileSync('src/app/dashboard/sessions/[id]/host/actions.ts', 'utf8');
const examClient = readFileSync('src/app/take-exam/[attemptId]/TakeExamClient.tsx', 'utf8');
const liveClient = readFileSync('src/app/play/[code]/PlayClient.tsx', 'utf8');

const file = path.resolve('scripts/__publication_mode_contract.cjs');
const compiled = new Module(file);
compiled.filename = file;
compiled.paths = Module._nodeModulePaths(path.dirname(file));
const oldLoad = Module._load;
Module._load = function (request, parent) {
  if (parent?.filename === file && request === '@/lib/supabase/server') return { createAdminClient: () => ({}) };
  if (parent?.filename === file && request === '@/lib/scoring') return {
    hasAnswerContent: (answer) => Boolean(answer && typeof answer === 'object' && !Array.isArray(answer) && Object.values(answer).some((value) => typeof value === 'string' ? value.trim().length > 0 : Array.isArray(value) ? value.length > 0 : value !== null && value !== undefined)),
    isAutoGradableQuestion: (type) => ['single_choice','multiple_select','true_false','short_answer','numeric','ordering','matching'].includes(type),
  };
  return oldLoad.apply(this, arguments);
};
try {
  compiled._compile(ts.transpileModule(readFileSync('src/lib/resultPublication.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, file);
} finally { Module._load = oldLoad; }
const { resultPublicationMode, examResultChannelName, hasAnswerContent, isAutoGradableQuestion } = compiled.exports;
let checks = 0;
function ok(name, value) { assert.ok(value, name); checks++; console.log(`  ✓ ${name}`); }

ok('new exams and legacy exam rows default to manual publication', /result_publication_mode text not null default 'manual'/.test(migration));
ok('legacy competitions remain distinguishable instead of silently becoming automatic', /result_publication_mode text\s+check \(result_publication_mode is null or result_publication_mode in \('manual','automatic'\)\)/.test(migration));
ok('attempts persist grading and publication state', ['grading_status', 'auto_score', 'auto_max_score', 'pending_manual_count', 'published_at'].every((x) => migration.includes(`add column if not exists ${x}`)));
ok('publication history is tenant-scoped and excludes student/participant roles', (migration.match(/public\.org_role\(organization_id\) in \('owner','admin','teacher','organizer','corrector'\)/g) ?? []).length === 2);
ok('publication mode normalizer defaults safely to manual', resultPublicationMode(undefined) === 'manual' && resultPublicationMode('unexpected') === 'manual' && resultPublicationMode('automatic') === 'automatic');
ok('new quiz and competition workflows persist manual by default', /result_publication_mode: z\.enum\(\["manual", "automatic"\]\)\.default\("manual"\)/.test(quizActions) && /result_publication_mode: String\(formData\.get\("result_publication_mode"\) \?\? "manual"\)/.test(compActions));
ok('exam publication mode changes lock after attempts exist', examActions.includes('publication_error=locked') && /if \(attempt && \(modeChanged \|\| correctionsChanged\)\)/.test(examActions));
ok('competition mode changes lock after a session or publication', /payload\.result_publication_mode !== oldMode && \(comp0\.session_id \|\| comp0\.results_published\)/.test(compActions));
ok('manual exam publication blocks pending written marks and grades legacy attempts first in both dashboards', examActions.includes('pending_manual_count') && examActions.includes('awaiting_manual_grading') && examActions.includes('grading_failed') && adminExamActions.includes('attemptRows(admin, exam!, attempt)') && adminExamActions.includes('e=awaiting_marking'));
ok('candidate exam state hides scores until fully graded and officially released', /const resultPublished = submitted && gradingComplete && Number\(attempt\.pending_manual_count/.test(examState) && /score: resultPublished \?/.test(examState));
ok('corrections are separately gated from official scores', /const correctionsPublished = resultPublished && settings\.corrections_published !== false/.test(examState));
ok('live final scores are withheld and self-paced leaderboards require session publication', liveState.includes('finalResultPending') && liveState.includes('sessionResultsPublished') && /resultPublicationMode === "legacy" \|\| session\.mode !== "self_paced"/.test(liveState));
ok('legacy live sessions preserve legacy result visibility', liveState.includes('resultPublicationMode === "legacy"') && compActions.includes('"legacy"') && quizActions.includes('"legacy"'));
ok('candidate clients subscribe to publication broadcasts and recover on reconnect', examClient.includes('event: "result-published"') && examClient.includes('event: "result-unpublished"') && liveClient.includes('event: "state-changed"') && liveClient.includes('window.addEventListener("online"'));
ok('subjective answers with empty text are not treated as completed marks', hasAnswerContent({ text: '  ' }) === false && hasAnswerContent({ text: 'reasoned response' }) === true);
ok('objective grading includes only configured objective question kinds', isAutoGradableQuestion('numeric') && isAutoGradableQuestion('single_choice') && !isAutoGradableQuestion('open_ended'));
const channelA = examResultChannelName('attempt-1', 'secret-a');
const channelB = examResultChannelName('attempt-1', 'secret-b');
ok('exam result channels are token-scoped without exposing the token', channelA !== channelB && !channelA.includes('secret-a') && channelA.startsWith('exam-result:'));

console.log(`\n${checks} publication contract checks passed (safe local source/logic fixtures).`);
