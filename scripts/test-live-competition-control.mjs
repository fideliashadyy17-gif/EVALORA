/**
 * Live competition control centre — rules, ranking evolution, reveal gating
 * and the additive migration 0078.
 *
 * The organizer now drives the whole competition from the projected page, so
 * this suite proves the server-side guarantees behind that surface:
 *   * every command is a pure transition with explicit guards (no going past
 *     the first or last question, no duplicate scoring, no duplicate rounds);
 *   * pausing preserves the remaining time and resumes from it;
 *   * answer locking is separate from pausing and from closing registration;
 *   * the podium is revealed third → second → champion, and the champion is
 *     never present in a payload before its stage;
 *   * rankings are snapshotted once per closed question with movement data;
 *   * migration 0078 is additive: existing sessions keep their question,
 *     timer, answers and scores.
 *
 * Run: node scripts/test-live-competition-control.mjs
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { PGlite } from "@electric-sql/pglite";

let checks = 0;
const ok = (name, condition) => {
  if (!condition) throw new Error(`FAIL: ${name}`);
  checks += 1;
  console.log(`  ✓ ${name}`);
};

/* ── Compile the pure modules ─────────────────────────────────────────── */
const outDir = "/tmp/evalora-live-control-test";
execSync(
  `npx tsc src/lib/liveControl.ts src/lib/liveRanking.ts --outDir ${outDir} --rootDir src --module commonjs --target es2022 --esModuleInterop --skipLibCheck --moduleResolution node`,
  { stdio: "inherit" },
);
execSync(`ln -sfn "$(pwd)/node_modules" ${outDir}/node_modules`, { stdio: "inherit" });
const require = createRequire(import.meta.url);
const control = require(`${outDir}/lib/liveControl.js`);
const ranking = require(`${outDir}/lib/liveRanking.js`);

const NOW = new Date("2026-11-10T10:00:00.000Z");
const later = (ms) => new Date(NOW.getTime() + ms);

function session(overrides = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    status: "live",
    phase: "question",
    mode: "synchronized",
    current_question_index: 0,
    question_started_at: new Date(NOW.getTime() - 5000).toISOString(),
    question_deadline_at: new Date(NOW.getTime() + 15000).toISOString(),
    answer_locked: false,
    admission_open: true,
    presentation_stage: "idle",
    paused_total_ms: 0,
    settings: {},
    ...overrides,
  };
}

const run = (command, overrides = {}, extra = {}) =>
  control.applyLiveCommand({
    command,
    session: session(overrides),
    questionCount: 4,
    durationFor: () => 20,
    now: NOW,
    ...extra,
  });

/* ── Start, next, previous ───────────────────────────────────────────── */
const start = run("start", { status: "lobby", phase: "waiting", current_question_index: -1, question_started_at: null, question_deadline_at: null });
ok("start opens question 1 with a 3s lead-in", start.patch.current_question_index === 0 && start.patch.phase === "countdown");
ok("start uses the question's own duration", new Date(start.patch.question_deadline_at).getTime() - new Date(start.patch.question_started_at).getTime() === 20000);
ok("start is refused once the competition is running", run("start").error !== undefined);

const nextWithBoard = run("next");
ok("next closes the current question", nextWithBoard.closedQuestion?.index === 0 && nextWithBoard.closedQuestion?.final === false);
ok("next snapshots the closed question", nextWithBoard.snapshotIndex === 0);
ok("next shows the ranking between questions by default", nextWithBoard.patch.phase === "leaderboard");
ok("the ranking step already points at the next question", nextWithBoard.patch.current_question_index === 1);
ok("no timer runs during the between-questions ranking", nextWithBoard.patch.question_deadline_at === null);

const afterBoard = run("next", { phase: "leaderboard", current_question_index: 1, question_started_at: null, question_deadline_at: null });
ok("next from the ranking opens the question that index pointed at", afterBoard.patch.current_question_index === 1 && afterBoard.patch.phase === "countdown");
ok("the reopened question starts with its full duration", new Date(afterBoard.patch.question_deadline_at).getTime() - new Date(afterBoard.patch.question_started_at).getTime() === 20000);

const straightOn = run("next", { settings: { leaderboard_between_questions: false } });
ok("an organizer can skip the between-questions ranking", straightOn.patch.phase === "countdown" && straightOn.patch.current_question_index === 1);

ok("ending early closes the current question and prepares the reveal", (() => {
  const early = run("end", { current_question_index: 1 });
  return early.patch.status === "ended" && early.patch.presentation_stage === "final_pending" && early.snapshotIndex === 1 && early.patch.answer_locked === true;
})());
ok("ending a lobby session is refused", run("end", { status: "lobby", current_question_index: -1 }).error !== undefined);

const prev = run("prev", { current_question_index: 2 });
ok("previous restores the earlier question", prev.patch.current_question_index === 1 && prev.patch.phase === "countdown");
ok("previous restarts that question's own timer", new Date(prev.patch.question_deadline_at).getTime() - new Date(prev.patch.question_started_at).getTime() === 20000);
ok("previous never touches answers or scores", !("score" in prev.patch) && !("answer" in prev.patch) && prev.closedQuestion === null);
ok("previous is refused on the first question", run("prev", { current_question_index: 0 }).error !== undefined);
ok("previous from the ranking goes back one question", run("prev", { phase: "leaderboard", current_question_index: 2, question_started_at: null }).patch.current_question_index === 1);

const last = run("next", { current_question_index: 3 });
ok("advancing past the final question ends the competition", last.patch.status === "ended");
ok("the final question is closed and locked", last.closedQuestion?.final === true && last.patch.answer_locked === true);
ok("results stay pending until the organizer reveals them", last.patch.presentation_stage === "final_pending");
ok("the final ranking snapshot is requested from authoritative scores", last.snapshotIndex === 3);

/* ── Pause / resume keeps the remaining time ─────────────────────────── */
const paused = run("pause");
ok("pause stores a resume snapshot", paused.patch.status === "paused" && typeof paused.patch.settings.pause_snapshot?.paused_at === "string");
ok("pausing twice is a harmless no-op", run("pause", { status: "paused" }).noop === true);
const resumeAt = later(7000);
const resumed = control.applyLiveCommand({
  command: "resume",
  session: session({ status: "paused", settings: { pause_snapshot: { paused_at: NOW.toISOString() } } }),
  questionCount: 4,
  durationFor: () => 20,
  now: resumeAt,
});
const shiftedBy = new Date(resumed.patch.question_deadline_at).getTime() - new Date(session().question_deadline_at).getTime();
ok("resume shifts the deadline by exactly the paused time", shiftedBy === 7000);
ok("resume records the paused duration on the session", resumed.patch.paused_total_ms === 7000);
ok("resume returns to the live question without restarting it", resumed.patch.status === "live" && resumed.patch.phase === "question");
ok("resume is a no-op when the session is already live", run("resume").noop === true);

/* ── Answer lock and registration are independent controls ───────────── */
const locked = run("lock");
ok("lock sets the answer flag only", locked.patch.answer_locked === true && locked.patch.status === undefined && !("phase" in locked.patch));
ok("locking twice is a no-op", run("lock", { answer_locked: true }).noop === true);
ok("unlock clears the flag", run("unlock", { answer_locked: true }).patch.answer_locked === false);
ok("unlock on an unlocked session is a no-op", run("unlock").noop === true);
ok("closing registration does not pause or lock answers", run("close_join").patch.admission_open === false && !("answer_locked" in run("close_join").patch));
ok("registration controls are idempotent", run("close_join", { admission_open: false }).noop === true && run("open_join").noop === true);

/* ── Ranking board ───────────────────────────────────────────────────── */
const board = run("show_board", { current_question_index: 2 });
ok("showing the board keeps the current question for its ranking", board.snapshotIndex === 2 && board.patch.phase === "leaderboard");
const hide = control.applyLiveCommand({
  command: "hide_board",
  session: session({
    phase: "leaderboard",
    current_question_index: 2,
    question_started_at: new Date(NOW.getTime() - 4000).toISOString(),
    question_deadline_at: new Date(NOW.getTime() + 16000).toISOString(),
  }),
  questionCount: 4,
  durationFor: () => 20,
  now: NOW,
});
ok("hiding the board returns to the live question", hide.patch.phase === "question");
ok("hiding the board never resets the running timer", !("question_deadline_at" in hide.patch) && !("question_started_at" in hide.patch));

/* ── The reveal sequence ─────────────────────────────────────────────── */
ok("results cannot be revealed before the competition ends", run("reveal_results").error !== undefined);
const ended = { status: "ended", phase: "completed", presentation_stage: "final_pending", current_question_index: 3 };
const revealStart = run("reveal_results", ended);
ok("reveal starts in suspense", revealStart.patch.presentation_stage === "suspense" && revealStart.patch.phase === "podium");
ok("reveal is stamped with when results became public", typeof revealStart.patch.results_revealed_at === "string");

const sequence = [];
let stage = "suspense";
for (let i = 0; i < 5; i += 1) {
  const step = run("reveal_next", { ...ended, presentation_stage: stage });
  if (!step.patch.presentation_stage) break;
  stage = step.patch.presentation_stage;
  sequence.push(stage);
}
ok("the podium is revealed third, then second, then champion", JSON.stringify(sequence) === JSON.stringify(["third", "second", "champion", "board"]));
ok("reveal_next stops at the full leaderboard", run("reveal_next", { ...ended, presentation_stage: "board" }).noop === true);
ok("reveal_next is refused before the reveal starts", run("reveal_next", ended).error !== undefined);
ok("the full board can be opened directly", run("show_full_board", { ...ended, presentation_stage: "third" }).patch.presentation_stage === "board");
ok("the podium can be replayed from the start", run("replay_podium", { ...ended, presentation_stage: "board" }).patch.presentation_stage === "suspense");

const finish = run("finish", { ...ended, presentation_stage: "board" });
ok("finishing the presentation asks for a new round", finish.createNextSession === true && finish.patch.presentation_stage === "finished");
ok("finishing twice never opens a second waiting room", run("finish", { ...ended, presentation_stage: "finished" }).noop === true);
ok("the presentation cannot be finished before the competition ends", run("finish").error !== undefined);

/* ── Reveal gating: the champion is never sent early ─────────────────── */
ok("suspense reveals no place", control.revealedPlaces("suspense") === 0);
ok("third-place stage reveals exactly one place", control.revealedPlaces("third") === 1);
ok("champion stage reveals three places", control.revealedPlaces("champion") === 3);
ok("the full board reveals everybody", control.revealedPlaces("board") === Number.POSITIVE_INFINITY);
ok("unknown stages fall back to idle", control.parsePresentationStage("leaked") === "idle");

const entries = [
  { participant_id: "p1", display_name: "Ada", avatar_key: "owl", score: 90, rank: 1 },
  { participant_id: "p2", display_name: "Bilal", avatar_key: "fox", score: 80, rank: 2 },
  { participant_id: "p3", display_name: "Chidi", avatar_key: "panda", score: 70, rank: 3 },
  { participant_id: "p4", display_name: "Dara", avatar_key: "lion", score: 60, rank: 4 },
];
const third = ranking.revealedPodium(entries, "third");
ok("revealing third place shows the third participant", third.length === 1 && third[0].rank === 3 && third[0].display_name === "Chidi");
ok("the champion is absent while only third place is revealed", !JSON.stringify(third).includes("Ada"));
const second = ranking.revealedPodium(entries, "second");
ok("revealing second place shows third then second", second.length === 2 && second.map((r) => r.rank).join(",") === "3,2");
const champion = ranking.revealedPodium(entries, "champion");
ok("the champion is revealed last", champion.map((r) => r.rank).join(",") === "3,2,1");
ok("championRevealed is false before the champion stage", ranking.championRevealed("second") === false && ranking.championRevealed("champion") === true);

/* ── Ranking movement ────────────────────────────────────────────────── */
const previous = [
  { participant_id: "p1", display_name: "Ada", avatar_key: "owl", score: 20, rank: 1 },
  { participant_id: "p2", display_name: "Bilal", avatar_key: "fox", score: 10, rank: 2 },
  { participant_id: "p3", display_name: "Chidi", avatar_key: "panda", score: 10, rank: 3 },
  { participant_id: "p4", display_name: "Dara", avatar_key: "lion", score: 10, rank: 4 },
  { participant_id: "p5", display_name: "Esi", avatar_key: "frog", score: 5, rank: 5 },
];
const current = [
  { participant_id: "p5", display_name: "Esi", avatar_key: "frog", score: 100, rank: 1 },
  { participant_id: "p1", display_name: "Ada", avatar_key: "owl", score: 60, rank: 2 },
  { participant_id: "p2", display_name: "Bilal", avatar_key: "fox", score: 40, rank: 3 },
  { participant_id: "p3", display_name: "Chidi", avatar_key: "panda", score: 30, rank: 4 },
  { participant_id: "p4", display_name: "Dara", avatar_key: "lion", score: 20, rank: 5 },
];
const rows = ranking.withMovement(current, previous);
ok("a participant who climbed from fifth to first shows upward movement", rows[0].movement === "up" && rows[0].delta === 4);
ok("a new leader is flagged explicitly", rows[0].is_new_leader === true);
ok("the former leader is flagged as dropped", rows[1].movement === "down" && rows[1].delta === -1);
ok("participants keep their previous position for the delta", rows[4].movement === "down" && rows[4].delta === -1);
ok("a first appearance is marked new", ranking.withMovement(current, []).every((r) => r.movement === "new"));
ok("tie-free ordering is preserved from the authoritative ranking", rows.map((r) => r.rank).join(",") === "1,2,3,4,5");
ok("stored snapshots are sanitised on read", ranking.parseRankingEntries([{ participant_id: "x", display_name: 3 }, { bogus: true }]).length === 1);
ok("ranking history names the leader of each question", JSON.stringify(
  ranking.historyPoints([
    { question_index: 1, entries: current },
    { question_index: 0, entries: previous },
  ]).map((p) => `${p.question_index}:${p.leader_name}`),
) === JSON.stringify(["0:Ada", "1:Esi"]));

/* ── Wiring: the endpoints enforce the same rules ────────────────────── */
const answerRoute = readFileSync("src/app/api/live/answer/route.ts", "utf8");
ok("the answer endpoint refuses submissions while answers are locked", /answer_locked/.test(answerRoute) && answerRoute.includes("423"));
const controlRoute = readFileSync("src/app/api/live/control/route.ts", "utf8");
ok("the control endpoint re-authorizes organizer access on every POST", controlRoute.includes("can(ctx, session.organization_id, CREATOR_ROLES)"));
ok("the control endpoint only accepts known commands", controlRoute.includes("LIVE_COMMANDS.includes(command)"));
ok("conflicting transitions are rejected with a compare-and-set", controlRoute.includes("CAS_COMMANDS"));
const screenRoute = readFileSync("src/app/api/live/screen/route.ts", "utf8");
ok("the public screen applies reveal gating", screenRoute.includes("revealedPodium"));
ok("the public screen exposes the full final board only at the board stage", screenRoute.includes('stage === "board"'));
ok("the public screen verifies the display token before anything else", screenRoute.includes("verifyDisplayToken"));
const stateRoute = readFileSync("src/app/api/live/state/route.ts", "utf8");
ok("participants receive their own position only once the reveal starts", stateRoute.includes("isResultsStage(stage)"));
ok("a participant never receives the full board before it is shown", stateRoute.includes('stage === "board" ? rows.map(decorate) : null'));
const screenClient = readFileSync("src/app/live/[liveId]/screen/PublicScreenClient.tsx", "utf8");
ok("organizer controls render only for an authorized browser session", screenClient.includes("authorized && control &&"));
ok("the projected page sends commands to the re-authorized endpoint", screenClient.includes('fetch("/api/live/control"'));
ok("the waiting room lists participants with connection status", screenClient.includes("connected"));

/* ── Migration 0078 in an isolated database ──────────────────────────── */
const sql = readFileSync("supabase/migrations/0078_live_competition_control.sql", "utf8");
const db = new PGlite();
const query = (text, params) => db.query(text, params);
const one = async (text, params) => (await query(text, params)).rows[0];

try {
  await db.exec(`
    create schema if not exists auth;
    create role authenticated;
    create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
    create function public.is_super_admin() returns boolean language sql stable as $$ select false $$;
    create function public.can_host_live_session(uuid) returns boolean language sql stable as $$ select true $$;

    create table public.organizations (id uuid primary key, name text not null);
    create table public.profiles (id uuid primary key);
    create table public.quizzes (id uuid primary key, title text);
    create table public.questions (id uuid primary key, prompt text);
    create table public.quiz_questions (
      id uuid primary key,
      quiz_id uuid references public.quizzes(id) on delete cascade,
      question_id uuid references public.questions(id) on delete cascade,
      position int not null default 0
    );
    create table public.quiz_sessions (
      id uuid primary key default gen_random_uuid(),
      quiz_id uuid not null references public.quizzes(id) on delete cascade,
      organization_id uuid not null references public.organizations(id) on delete cascade,
      host_id uuid references public.profiles(id),
      join_code text unique not null,
      title text,
      mode text not null default 'synchronized',
      status text not null default 'lobby',
      phase text not null default 'waiting',
      phase_started_at timestamptz not null default now(),
      current_question_index int not null default -1,
      question_started_at timestamptz,
      question_deadline_at timestamptz,
      admission_open boolean not null default true,
      require_approval boolean not null default false,
      display_token_version integer not null default 1,
      settings jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      ended_at timestamptz
    );
    create table public.session_participants (
      id uuid primary key default gen_random_uuid(),
      session_id uuid not null references public.quiz_sessions(id) on delete cascade,
      display_name text not null,
      score numeric not null default 0,
      status text not null default 'admitted'
    );
    create table public.participant_answers (
      id uuid primary key default gen_random_uuid(),
      session_id uuid not null references public.quiz_sessions(id) on delete cascade,
      participant_id uuid not null references public.session_participants(id) on delete cascade,
      quiz_question_id uuid references public.quiz_questions(id) on delete cascade,
      points_awarded numeric not null default 0,
      response_ms int
    );
  `);

  await query(
    `insert into public.organizations (id, name) values ('00000000-0000-4000-8000-0000000000aa', 'Test School')`,
  );
  await query(`insert into public.quizzes (id, title) values ('00000000-0000-4000-8000-0000000000bb', 'Live quiz')`);
  await query(`insert into public.questions (id, prompt) values ('00000000-0000-4000-8000-0000000000cc', 'What is 2+2?')`);
  await query(
    `insert into public.quiz_questions (id, quiz_id, question_id, position) values ('00000000-0000-4000-8000-0000000000dd', '00000000-0000-4000-8000-0000000000bb', '00000000-0000-4000-8000-0000000000cc', 0)`,
  );
  // A session that is LIVE while the migration runs.
  await query(`
    insert into public.quiz_sessions (id, quiz_id, organization_id, join_code, status, phase, current_question_index, question_started_at, question_deadline_at, settings)
    values ('00000000-0000-4000-8000-0000000000ee', '00000000-0000-4000-8000-0000000000bb', '00000000-0000-4000-8000-0000000000aa', 'ABC123', 'live', 'question', 0, '2026-11-10T09:59:00Z', '2026-11-10T09:59:30Z', '{"show_leaderboard":true}'::jsonb)
  `);
  await query(`
    insert into public.session_participants (id, session_id, display_name, score)
    values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000ee', 'Ada', 12)
  `);
  await query(`
    insert into public.participant_answers (session_id, participant_id, quiz_question_id, points_awarded, response_ms)
    values ('00000000-0000-4000-8000-0000000000ee', '00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000dd', 12, 1500)
  `);

  await db.exec(sql);

  const row = await one(
    `select status, phase, current_question_index, question_started_at, answer_locked, presentation_stage, paused_total_ms, session_round, previous_session_id, settings
       from public.quiz_sessions where id = '00000000-0000-4000-8000-0000000000ee'`,
  );
  ok("the migration adds the answer lock unlocked by default", row.answer_locked === false);
  ok("the migration starts every session at reveal stage idle", row.presentation_stage === "idle");
  ok("the migration starts every session at round 1", Number(row.session_round) === 1);
  ok("the migration adds pause bookkeeping", Number(row.paused_total_ms) === 0);
  ok("the migration does not add a predecessor to an existing session", row.previous_session_id === null);
  ok("a live session keeps its question, timer and status", row.status === "live" && row.phase === "question" && row.current_question_index === 0);
  ok("a live session keeps its settings", row.settings.show_leaderboard === true);

  const participant = await one(`select score from public.session_participants where display_name = 'Ada'`);
  ok("participants and their scores are untouched", Number(participant.score) === 12);
  const answer = await one(`select points_awarded from public.participant_answers`);
  ok("answers are untouched", Number(answer.points_awarded) === 12);

  const snapshotTable = await one(`
    select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'live_ranking_snapshots'
  `);
  ok("the ranking snapshot table exists with RLS enabled", snapshotTable?.relrowsecurity === true);
  const policies = await one(`select count(*)::int as n from pg_policies where tablename = 'live_ranking_snapshots'`);
  ok("the ranking snapshot table has exactly one read policy", Number(policies.n) === 1);

  await query(`
    insert into public.live_ranking_snapshots (session_id, organization_id, question_index, is_final, participant_count, answered_count, entries, leader_name)
    values ('00000000-0000-4000-8000-0000000000ee', '00000000-0000-4000-8000-0000000000aa', 0, false, 1, 1, '[{"participant_id":"x","display_name":"Ada","rank":1,"score":12}]'::jsonb, 'Ada')
  `);
  let duplicateBlocked = false;
  try {
    await query(`
      insert into public.live_ranking_snapshots (session_id, organization_id, question_index, entries)
      values ('00000000-0000-4000-8000-0000000000ee', '00000000-0000-4000-8000-0000000000aa', 0, '[]'::jsonb)
    `);
  } catch {
    duplicateBlocked = true;
  }
  ok("one snapshot per session and question is enforced", duplicateBlocked);

  let badStageRejected = false;
  try {
    await query(`update public.quiz_sessions set presentation_stage = 'champion_leaked' where id = '00000000-0000-4000-8000-0000000000ee'`);
  } catch {
    badStageRejected = true;
  }
  ok("only the known reveal stages are accepted", badStageRejected);

  let badRoundRejected = false;
  try {
    await query(`update public.quiz_sessions set session_round = 0 where id = '00000000-0000-4000-8000-0000000000ee'`);
  } catch {
    badRoundRejected = true;
  }
  ok("a round number below 1 is rejected", badRoundRejected);

  // A second round is a NEW row that points at the finished one.
  await query(`
    insert into public.quiz_sessions (id, quiz_id, organization_id, join_code, status, phase, session_round, previous_session_id)
    values ('00000000-0000-4000-8000-0000000000ff', '00000000-0000-4000-8000-0000000000bb', '00000000-0000-4000-8000-0000000000aa', 'XYZ789', 'lobby', 'waiting', 2, '00000000-0000-4000-8000-0000000000ee')
  `);
  const rounds = await query(
    `select session_round, previous_session_id from public.quiz_sessions order by session_round`,
  );
  ok("a new round keeps the previous session intact", rounds.rows.length === 2 && rounds.rows[1].previous_session_id === "00000000-0000-4000-8000-0000000000ee");
  ok("the finished round keeps its own snapshot history", (await one(`select count(*)::int as n from public.live_ranking_snapshots`)).n === 1);

  await query(`delete from public.quiz_sessions where id = '00000000-0000-4000-8000-0000000000ee'`);
  ok("deleting a session cascades its snapshots", (await one(`select count(*)::int as n from public.live_ranking_snapshots`)).n === 0);
} finally {
  await db.close();
}

console.log(`\n${checks} checks passed`);
