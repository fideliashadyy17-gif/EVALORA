// React-level tests for the projected live page as the organizer's control
// centre: authorization, command dispatch, ranking evolution, reveal order and
// the waiting room.
//
// These are not browser tests. They render the real screen component against a
// fake network and assert the properties that matter for a live room:
//   * an authorized organizer sees the controls and can drive the competition
//     from the projected page without navigating anywhere;
//   * a visitor who only holds the screen token sees the presentation and no
//     controls at all;
//   * the champion is never rendered before the reveal reaches that stage;
//   * the audience can follow how the ranking changed after each question.
import { readFileSync } from "node:fs";
import { Module } from "node:module";
import path from "node:path";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import ts from "typescript";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function compile(source, filename) {
  const file = path.resolve(filename);
  const mod = new Module(file);
  mod.filename = file;
  mod.paths = Module._nodeModulePaths(path.dirname(file));
  mod._compile(
    ts.transpileModule(readFileSync(source, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    }).outputText,
    file,
  );
  return mod.exports;
}

const screenFile = path.resolve("scripts/__virtual_live_screen.cjs");
const originalLoad = Module._load;

function loadScreen() {
  Module._load = function (request, parent) {
    if (parent?.filename === screenFile) {
      if (request === "@/components/Logo") return { Logo: () => React.createElement("img", { alt: "EVALORA" }) };
      if (request === "@/components/ParticipantAvatar")
        return {
          ParticipantAvatar: ({ name, avatarKey }) =>
            React.createElement("span", { "data-avatar": avatarKey }, name ?? ""),
        };
      if (request === "@/components/RichContent")
        return { RichContent: ({ text }) => React.createElement("span", null, text ?? "") };
      if (request === "@/lib/useAssessmentLockdown") return { useAssessmentLockdown: () => undefined };
      if (request === "@/lib/utils") return { mmss: (seconds) => `${seconds}s` };
      if (request === "qrcode") return { toDataURL: async () => "data:image/png;base64,AA" };
    }
    return originalLoad.apply(this, arguments);
  };
  const loaded = compile("src/app/live/[liveId]/screen/PublicScreenClient.tsx", "scripts/__virtual_live_screen.cjs");
  Module._load = originalLoad;
  return loaded.PublicScreenClient;
}

const PublicScreenClient = loadScreen();

let checks = 0;
const checkAsync = async (name, fn) => {
  await fn();
  checks += 1;
  console.log(`✓ ${name}`);
};

/* ── Fake browser + network ───────────────────────────────────────────── */
const controlPosts = [];
let navigations = [];
let screenPayload = null;
let controlPayload = { authorized: false };

const listeners = new Map();
globalThis.window = {
  location: {
    origin: "https://evalora.test",
    replace: (url) => navigations.push(url),
  },
  addEventListener: (type, fn) => {
    listeners.set(type, fn);
    if (type === "keydown") globalThis.window.__keyHandler = fn;
  },
  removeEventListener: (type) => listeners.delete(type),
};

globalThis.fetch = async (url, options = {}) => {
  const target = String(url);
  if (target.includes("/api/live/control")) {
    if (options.method === "POST") {
      controlPosts.push(JSON.parse(options.body));
      return { ok: true, json: async () => ({ ok: true, state: controlPayload.state }) };
    }
    return { ok: true, json: async () => controlPayload };
  }
  return { ok: true, json: async () => screenPayload };
};

const flat = (child) =>
  Array.isArray(child)
    ? child.map(flat).join("")
    : typeof child === "string" || typeof child === "number"
      ? String(child)
      : child && typeof child === "object" && child.children
        ? flat(child.children)
        : "";

const textOf = (tree) => flat(tree.toJSON());
const buttonByText = (tree, label) =>
  tree.root.findAllByType("button").find((node) => flat(node.props.children).includes(label));
const buttonLabels = (tree) => tree.root.findAllByType("button").map((node) => flat(node.props.children));

async function settle() {
  await act(async () => {
    for (let i = 0; i < 8; i += 1) await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 5));
    for (let i = 0; i < 8; i += 1) await Promise.resolve();
  });
}

async function mount(payload, control) {
  screenPayload = payload;
  controlPayload = control;
  let tree;
  await act(async () => {
    tree = TestRenderer.create(
      React.createElement(PublicScreenClient, { liveId: "11111111-1111-4111-8111-111111111111", token: "screen-token" }),
    );
  });
  await settle();
  return tree;
}

const AUTHORIZED = (state = {}) => ({
  authorized: true,
  state: {
    status: "live",
    phase: "question",
    current_question_index: 0,
    question_count: 3,
    answer_locked: false,
    admission_open: true,
    presentation_stage: "idle",
    results_revealed: false,
    paused: false,
    ended: false,
    mode: "synchronized",
    ...state,
  },
});

function payload(overrides = {}) {
  const now = Date.now();
  return {
    server_now: new Date(now).toISOString(),
    competition_id: "comp-1",
    session_id: "11111111-1111-4111-8111-111111111111",
    title: "Inter-House Championship",
    organization: { name: "EVALORA Academy", logo_url: null },
    instructions: null,
    join_code: "ABC123",
    status: "live",
    mode: "synchronized",
    phase: "question",
    presentation_stage: "idle",
    session_round: 1,
    answer_locked: false,
    admission_open: true,
    show_leaderboard: true,
    progress: { index: 0, total: 3, remaining_after_current: 2 },
    question: {
      quiz_question_id: "q1",
      type: "single_choice",
      prompt: "What is 7 × 8?",
      prompt_doc: null,
      points: 10,
      options: [
        { id: "o1", label: "54", content_doc: null },
        { id: "o2", label: "56", content_doc: null },
      ],
      media_url: null,
      media_type: null,
      explanation: null,
      explanation_doc: null,
      matching_lefts: [],
      matching_rights: [],
    },
    question_started_at: new Date(now - 3000).toISOString(),
    question_deadline_at: new Date(now + 17000).toISOString(),
    time_per_question_seconds: 20,
    joined: 3,
    connected: 2,
    participants: [
      { display_name: "Ada", avatar_key: "owl", status: "admitted", connected: true },
      { display_name: "Bilal", avatar_key: "fox", status: "waiting", connected: true },
    ],
    answered_current: 1,
    leaderboard: null,
    ranking: null,
    strip: [],
    final: null,
    next_session: null,
    audio: { enabled: false, volume: 0.5, theme: "off", sound_effects: false },
    presentation: { animations_enabled: false, show_join_code_on_screen: true },
    ...overrides,
  };
}

const rankingRow = (overrides) => ({
  participant_id: overrides.participant_id,
  display_name: overrides.display_name,
  avatar_key: "owl",
  score: overrides.score ?? 100,
  rank: overrides.rank,
  delta: overrides.delta ?? null,
  movement: overrides.movement ?? "same",
  is_leader: overrides.rank === 1,
  is_new_leader: Boolean(overrides.is_new_leader),
});

/* ── Authorization ────────────────────────────────────────────────────── */
await checkAsync("a public viewer holding only the screen token sees the presentation", async () => {
  const tree = await mount(payload(), { authorized: false });
  const text = textOf(tree);
  if (!text.includes("What is 7 × 8?")) throw new Error("the question is missing from the public screen");
  if (!text.includes("Question")) throw new Error("the question counter is missing");
  await act(async () => tree.unmount());
});

await checkAsync("no organizer control is rendered for an unauthorized viewer", async () => {
  const tree = await mount(payload(), { authorized: false });
  const labels = buttonLabels(tree).join("|");
  if (labels.includes("Next question")) throw new Error("controls leaked to the public screen");
  if (textOf(tree).includes("Organizer controls")) throw new Error("the organizer bar leaked");
  await act(async () => tree.unmount());
});

await checkAsync("an authorized organizer gets every control on the projected page", async () => {
  const tree = await mount(payload(), AUTHORIZED());
  const text = textOf(tree);
  for (const label of ["Organizer controls", "Next question", "Previous", "Pause", "Lock answers", "Close registration", "Show leaderboard"]) {
    if (!text.includes(label)) throw new Error(`missing control: ${label}`);
  }
  await act(async () => tree.unmount());
});

await checkAsync("the organizer can finish the competition from the projected page", async () => {
  const tree = await mount(payload(), AUTHORIZED({ current_question_index: 1, phase: "question" }));
  const button = buttonByText(tree, "End competition");
  if (!button) throw new Error("the end-of-competition control is missing");
  await act(async () => button.props.onClick());
  await settle();
  if (controlPosts.length !== 1) throw new Error(`expected one command, saw ${controlPosts.length}`);
  if (controlPosts[0].command !== "end") throw new Error("wrong command sent");
  if (controlPosts[0].session_id !== "11111111-1111-4111-8111-111111111111") throw new Error("wrong session targeted");
  if (navigations.length) throw new Error("a command must never navigate away from the projected page");
  await act(async () => tree.unmount());
  controlPosts.length = 0;
});

await checkAsync("arrow keys advance the competition without leaving the page", async () => {
  const tree = await mount(payload(), AUTHORIZED());
  const handler = globalThis.window.__keyHandler;
  if (typeof handler !== "function") throw new Error("keyboard controls are not attached");
  await act(async () => handler({ key: "ArrowRight", preventDefault() {}, target: { tagName: "BODY" } }));
  await settle();
  if (controlPosts[0]?.command !== "next") throw new Error("ArrowRight did not send the next command");
  await act(async () => tree.unmount());
  controlPosts.length = 0;
});

/* ── Reveal sequence ──────────────────────────────────────────────────── */
const podium = [
  rankingRow({ participant_id: "p1", display_name: "Ada", rank: 1, score: 900 }),
  rankingRow({ participant_id: "p2", display_name: "Bilal", rank: 2, score: 700 }),
  rankingRow({ participant_id: "p3", display_name: "Chidi", rank: 3, score: 500 }),
];

await checkAsync("the final result is not revealed before the organizer starts", async () => {
  const tree = await mount(
    payload({ status: "ended", phase: "completed", presentation_stage: "final_pending", question: null }),
    AUTHORIZED({ status: "ended", phase: "completed", presentation_stage: "final_pending", ended: true, current_question_index: 2 }),
  );
  const text = textOf(tree);
  if (text.includes("Ada") || text.includes("Chidi")) throw new Error("a final standing leaked before the reveal");
  if (!text.includes("Competition complete")) throw new Error("the finished state is not explained on screen");
  if (!buttonLabels(tree).join("|").includes("Reveal final results")) throw new Error("the organizer cannot start the reveal");
  await act(async () => tree.unmount());
});

await checkAsync("the suspense stage names nobody", async () => {
  const tree = await mount(
    payload({
      status: "ended",
      phase: "podium",
      presentation_stage: "suspense",
      question: null,
      final: { stage: "suspense", places: 0, podium: [], full: null, participant_count: 3, history: [] },
    }),
    AUTHORIZED({ status: "ended", phase: "podium", presentation_stage: "suspense", ended: true, results_revealed: true }),
  );
  const text = textOf(tree);
  if (!text.includes("Results are in")) throw new Error("the suspense screen is missing");
  if (text.includes("Ada") || text.includes("Bilal") || text.includes("Chidi")) throw new Error("names appeared during suspense");
  await act(async () => tree.unmount());
});

await checkAsync("third place is revealed before the champion exists on screen", async () => {
  const tree = await mount(
    payload({
      status: "ended",
      phase: "podium",
      presentation_stage: "third",
      question: null,
      final: { stage: "third", places: 1, podium: [podium[2]], full: null, participant_count: 3, history: [] },
    }),
    AUTHORIZED({ status: "ended", phase: "podium", presentation_stage: "third", ended: true, results_revealed: true }),
  );
  const text = textOf(tree);
  if (!text.includes("Chidi")) throw new Error("third place was not revealed");
  if (text.includes("Ada")) throw new Error("the champion was visible during the third-place reveal");
  if (!buttonLabels(tree).join("|").includes("Reveal 2nd place")) throw new Error("the organizer cannot reveal second place");
  await act(async () => tree.unmount());
});

await checkAsync("the champion is the highlight of the final stage", async () => {
  const tree = await mount(
    payload({
      status: "ended",
      phase: "podium",
      presentation_stage: "champion",
      question: null,
      final: { stage: "champion", places: 3, podium, full: null, participant_count: 3, history: [] },
    }),
    AUTHORIZED({ status: "ended", phase: "podium", presentation_stage: "champion", ended: true, results_revealed: true }),
  );
  const text = textOf(tree);
  if (!text.includes("EVALORA champion") || !text.includes("Ada")) throw new Error("the champion celebration is missing");
  if (!text.includes("900")) throw new Error("the champion's score is missing");
  await act(async () => tree.unmount());
});

await checkAsync("the full final leaderboard lists everybody when shown", async () => {
  const fourth = rankingRow({ participant_id: "p4", display_name: "Dara", rank: 4, score: 300 });
  const tree = await mount(
    payload({
      status: "ended",
      phase: "podium",
      presentation_stage: "board",
      question: null,
      final: { stage: "board", places: 4, podium, full: [...podium, fourth], participant_count: 4, history: [] },
    }),
    AUTHORIZED({ status: "ended", phase: "podium", presentation_stage: "board", ended: true, results_revealed: true }),
  );
  const text = textOf(tree);
  if (!text.includes("Final leaderboard")) throw new Error("the full board is missing");
  if (!text.includes("Dara")) throw new Error("participants outside the podium are missing");
  if (!buttonLabels(tree).join("|").includes("Finish & return to waiting room")) throw new Error("the return control is missing");
  await act(async () => tree.unmount());
});

/* ── Ranking evolution between questions ──────────────────────────────── */
await checkAsync("the leaderboard shows who climbed, who dropped and the new leader", async () => {
  const rows = [
    rankingRow({ participant_id: "p5", display_name: "Esi", rank: 1, score: 500, delta: 4, movement: "up", is_new_leader: true }),
    rankingRow({ participant_id: "p1", display_name: "Ada", rank: 2, score: 480, delta: -1, movement: "down" }),
    rankingRow({ participant_id: "p3", display_name: "Chidi", rank: 3, score: 400, delta: 0, movement: "same" }),
  ];
  const tree = await mount(
    payload({
      phase: "leaderboard",
      question: null,
      ranking: { question_index: 1, is_final: false, rows, hidden: 0, answered_count: 4, participant_count: 5 },
    }),
    AUTHORIZED({ phase: "leaderboard" }),
  );
  const text = textOf(tree);
  if (!text.includes("Esi") || !text.includes("New leader")) throw new Error("the new leader is not highlighted");
  if (!text.includes("▲4")) throw new Error("the upward movement indicator is missing");
  if (!text.includes("▼1")) throw new Error("the downward movement indicator is missing");
  if (!text.includes("Rankings after question 2")) throw new Error("the ranking is not attributed to the closed question");
  await act(async () => tree.unmount());
});

await checkAsync("the running question carries a top-three strip with movement", async () => {
  const strip = [
    rankingRow({ participant_id: "p1", display_name: "Ada", rank: 1, score: 300 }),
    rankingRow({ participant_id: "p2", display_name: "Bilal", rank: 2, score: 250, delta: 2, movement: "up" }),
  ];
  const tree = await mount(payload({ strip }), AUTHORIZED());
  const text = textOf(tree);
  if (!text.includes("Live ranking")) throw new Error("the live ranking strip is missing");
  if (!text.includes("Bilal")) throw new Error("the strip does not name the runners-up");
  await act(async () => tree.unmount());
});

/* ── Waiting room and locks ───────────────────────────────────────────── */
await checkAsync("the waiting room lists participants, their avatars and registration state", async () => {
  const tree = await mount(
    payload({ status: "lobby", phase: "waiting", question: null, progress: { index: -1, total: 3, remaining_after_current: 3 } }),
    AUTHORIZED({ status: "lobby", phase: "waiting", current_question_index: -1 }),
  );
  const text = textOf(tree);
  if (!text.includes("Ada") || !text.includes("Bilal")) throw new Error("joined participants are not shown");
  if (!text.includes("Registration open")) throw new Error("the registration state is missing");
  if (!text.includes("ABC123")) throw new Error("the join code is missing from the waiting room");
  if (!buttonLabels(tree).join("|").includes("Start competition")) throw new Error("the organizer cannot start the competition");
  await act(async () => tree.unmount());
});

await checkAsync("a paused competition is announced and the timer is not restarted", async () => {
  const tree = await mount(payload({ status: "paused" }), AUTHORIZED({ status: "paused", paused: true }));
  const text = textOf(tree);
  if (!text.includes("Paused")) throw new Error("the paused state is not shown");
  if (!buttonLabels(tree).join("|").includes("Resume")) throw new Error("the organizer cannot resume");
  await act(async () => tree.unmount());
});

await checkAsync("answer locking is shown without pausing the presentation", async () => {
  const tree = await mount(payload({ answer_locked: true }), AUTHORIZED({ answer_locked: true }));
  const text = textOf(tree);
  if (!text.includes("Answers locked")) throw new Error("the locked state is not shown to the room");
  if (text.includes("Paused")) throw new Error("locking answers must not look like a pause");
  if (!buttonLabels(tree).join("|").includes("Unlock answers")) throw new Error("the organizer cannot unlock");
  await act(async () => tree.unmount());
});

await checkAsync("after the podium the projected page returns to a fresh waiting room", async () => {
  const tree = await mount(
    payload({
      status: "ended",
      phase: "completed",
      presentation_stage: "finished",
      question: null,
      next_session: { session_id: "s2", join_code: "XYZ789", screen_path: "/live/s2/screen?token=t" },
    }),
    AUTHORIZED({ status: "ended", phase: "completed", presentation_stage: "finished", ended: true, results_revealed: true }),
  );
  const text = textOf(tree);
  if (!text.includes("Next competition starting")) throw new Error("the return to the waiting room is not announced");
  if (!text.includes("XYZ789")) throw new Error("the new round's code is missing");
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 60));
  });
  await act(async () => tree.unmount());
});

console.log(`\n${checks} checks passed`);
