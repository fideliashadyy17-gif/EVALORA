// Run: node scripts/test-integrity.mjs
// The shared assessment-integrity layer: policy, escalation, browser monitor and
// the server route that records what the monitor sees.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Module } from "node:module";
import path from "node:path";
import ts from "typescript";

function compile(source, dest) {
  const file = path.resolve(dest);
  const mod = new Module(file);
  mod.filename = file;
  mod.paths = Module._nodeModulePaths(path.dirname(file));
  mod._compile(
    ts.transpileModule(readFileSync(source, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    file,
  );
  return mod.exports;
}

const rules = compile("src/lib/integrity.ts", "scripts/__integrity_rules.cjs");
// The monitor imports its rules; give it the module compiled just above so the
// test exercises the real implementation, not a copy.
const monitorPath = path.resolve("scripts/__integrity_monitor.cjs");
const lockdown = compile("src/lib/assessmentLockdown.ts", "scripts/__assessment_lockdown.cjs");
const originalLoad = Module._load;
Module._load = function (request, parent) {
  if (parent?.filename === monitorPath && request === "./integrity") return rules;
  if (parent?.filename === monitorPath && request === "./assessmentLockdown") return lockdown;
  return originalLoad.apply(this, arguments);
};
const monitorModule = compile("src/lib/integrityMonitor.ts", "scripts/__integrity_monitor.cjs");
Module._load = originalLoad;
const { IntegrityMonitor } = monitorModule;

let passed = 0;
function ok(name, condition) {
  assert.ok(condition, name);
  console.log(`  ✓ ${name}`);
  passed++;
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/* ── Policy ── */
ok("a missing policy falls back to the safe defaults", (() => {
  const p = rules.parseIntegrityPolicy(undefined);
  return p.enabled && p.tabSwitch && p.focusLoss && p.fullscreen && p.clipboard && p.sound && p.warnAfter === 3 && p.reviewAfter === 5;
})());
ok("an assessment can switch integrity off", rules.parseIntegrityPolicy({ enabled: false }).enabled === false);
ok("an assessment can disable clipboard detection alone", rules.parseIntegrityPolicy({ clipboard: false }).clipboard === false);
ok("thresholds are clamped to a sane range", (() => {
  const p = rules.parseIntegrityPolicy({ warnAfter: 0, reviewAfter: 999 });
  return p.warnAfter === 1 && p.reviewAfter === 50;
})());
ok("a review threshold below the warning threshold is raised", (() => {
  const p = rules.parseIntegrityPolicy({ warnAfter: 5, reviewAfter: 2 });
  return p.reviewAfter === 5;
})());
ok("junk in the settings object never throws", (() => {
  const p = rules.parseIntegrityPolicy({ enabled: "yes", warnAfter: "abc", clipboard: 0 });
  return p.enabled === true && p.warnAfter === 3 && p.clipboard === true;
})());

/* ── Event gating and catalogue ── */
ok("integrity off means nothing is recorded", rules.isEventEnabled("tab_hidden", rules.parseIntegrityPolicy({ enabled: false })) === false);
ok("tab detection can be turned off", rules.isEventEnabled("tab_hidden", rules.parseIntegrityPolicy({ tabSwitch: false })) === false);
ok("focus detection can be turned off", rules.isEventEnabled("focus_lost", rules.parseIntegrityPolicy({ focusLoss: false })) === false);
ok("clipboard events follow the clipboard switch", (() => {
  const off = rules.parseIntegrityPolicy({ clipboard: false });
  return !rules.isEventEnabled("copy", off) && !rules.isEventEnabled("paste", off) && !rules.isEventEnabled("cut", off);
})());
ok("full-screen exit follows its own switch", rules.isEventEnabled("fullscreen_exit", rules.parseIntegrityPolicy({ fullscreen: false })) === false);
ok("returns and reconnections are informational, not violations", ["tab_visible", "focus_back", "online"].every((e) => rules.isRecordable(e) === false) && rules.isRecordable("tab_hidden"));
ok("events map to readable incident types", rules.incidentTypeFor("tab_hidden") === "integrity_tab_hidden" && rules.eventFromIncidentType("integrity_tab_hidden") === "tab_hidden");
ok("a teacher console label exists for each incident type", rules.describeIncidentType("integrity_fullscreen_exit").includes("full-screen"));
ok("an unknown incident type is still readable", rules.describeIncidentType("left_seat") === "left seat");
ok("severity distinguishes accidents from copying", rules.severityForEvent("focus_lost") === "low" && rules.severityForEvent("copy") === "high" && rules.severityForEvent("tab_hidden") === "medium");

/* ── Escalation ladder ── */
const policy = rules.parseIntegrityPolicy({ warnAfter: 3, reviewAfter: 5 });
ok("zero violations is no escalation", rules.escalationLevel(0, policy) === "none");
ok("one violation is a plain warning, never a sanction", rules.escalationLevel(1, policy) === "warn");
ok("reaching warnAfter makes the warning persistent", rules.escalationLevel(3, policy) === "strong");
ok("reaching reviewAfter escalates to the invigilator", rules.escalationLevel(5, policy) === "review");
ok("the warning copy names the count and never accuses", (() => {
  const w = rules.warningFor("tab_hidden", 4, policy);
  return w.title === "Repeated activity recorded" && w.body.includes("4 incidents") && !/cheat|fraud|guilty|disqualif/i.test(w.body);
})());
ok("the review copy explains what happens next", (() => {
  const w = rules.warningFor("copy", 5, policy);
  return w.level === "review" && /invigilator will review/i.test(w.body);
})());
ok("a blocked copy, cut or paste names the block, in the agreed words", ["copy", "cut", "paste"].every((e) => rules.warningFor(e, 1, policy).body.includes("Copying, cutting and pasting are disabled during this assessment.")));
ok("a blocked right-click names the context menu block", rules.warningFor("context_menu", 1, policy).body.includes("The right-click menu is disabled during this assessment."));

/* ── Monitor ── */
function fakeTarget() {
  const map = new Map();
  return {
    addEventListener(type, handler) {
      map.set(type, [...(map.get(type) ?? []), handler]);
    },
    removeEventListener(type, handler) {
      map.set(type, (map.get(type) ?? []).filter((h) => h !== handler));
    },
    fire(type, event = {}) {
      for (const handler of [...(map.get(type) ?? [])]) handler(event);
    },
    listeners: () => [...map.values()].reduce((n, list) => n + list.length, 0),
  };
}

function harness({ policyOverrides = {}, reportResult = null, reportThrows = false } = {}) {
  const document = Object.assign(fakeTarget(), { visibilityState: "visible", fullscreenElement: null });
  const window = fakeTarget();
  let now = 10000;
  const sent = [];
  const warnings = [];
  const activePolicy = rules.parseIntegrityPolicy(policyOverrides);
  const monitor = new IntegrityMonitor(
    { document, window, now: () => now },
    activePolicy,
    async (event, detail) => {
      sent.push({ event, detail });
      if (reportThrows) throw new Error("offline");
      return reportResult;
    },
    (warning) => warnings.push(warning),
  );
  return { monitor, document, window, sent, warnings, policy: activePolicy, advance: (ms) => { now += ms; } };
}

{
  const h = harness();
  h.monitor.start();
  ok("start attaches the browser listeners once", h.document.listeners() > 0 && h.monitor.start() === undefined && h.document.listeners() > 0);
  h.document.visibilityState = "hidden";
  h.document.fire("visibilitychange");
  await tick();
  ok("leaving the tab is reported as tab_hidden", h.sent.length === 1 && h.sent[0].event === "tab_hidden");

  h.document.fire("visibilitychange");
  await tick();
  ok("the same signal in a burst is not counted twice", h.sent.length === 1);

  h.advance(3000);
  h.window.fire("blur");
  await tick();
  ok("losing window focus after returning is its own event", h.sent.length === 2 && h.sent[1].event === "focus_lost");

  h.monitor.stop();
  const before = h.sent.length;
  h.document.fire("visibilitychange");
  h.window.fire("blur");
  await tick();
  ok("stop() detaches every listener", h.document.listeners() === 0 && h.window.listeners() === 0 && h.sent.length === before);
}

{
  const h = harness();
  h.monitor.start();
  h.document.visibilityState = "hidden";
  h.document.fire("visibilitychange");
  await tick();
  h.window.fire("blur"); // browsers fire both for one gesture
  await tick();
  ok("the blur that follows a hidden tab is collapsed, not double-counted", h.sent.filter((e) => e.event === "focus_lost").length === 0);
}

{
  // Clipboard and context-menu actions are listened for on the window in the
  // capture phase (the lockdown), not on the document, so a page's own
  // stopPropagation() cannot hide them from the monitor.
  const h = harness();
  h.monitor.start();
  const cancelled = [];
  const spy = (type) => ({ type, preventDefault: () => cancelled.push(type) });
  h.window.fire("copy", spy("copy"));
  h.window.fire("paste", spy("paste"));
  h.window.fire("cut", spy("cut"));
  h.window.fire("contextmenu", spy("contextmenu"));
  h.document.fire("fullscreenchange");
  await tick();
  ok("clipboard, context menu and full-screen exit are all reported", ["copy", "paste", "context_menu", "fullscreen_exit"].every((e) => h.sent.some((s) => s.event === e)));
  ok("each blocked clipboard or context-menu action is cancelled, not just logged", ["copy", "paste", "cut", "contextmenu"].every((t) => cancelled.includes(t)));
  ok("the document keeps only visibility and full-screen listeners", h.document.listeners() === 2);
}

{
  const h = harness({ policyOverrides: { clipboard: false } });
  h.monitor.start();
  let cancelled = false;
  h.window.fire("copy", { type: "copy", preventDefault: () => (cancelled = true) });
  h.window.fire("cut", { type: "cut" });
  await tick();
  ok("a disabled protection reports nothing and cancels nothing", h.sent.length === 0 && cancelled === false && h.window.listeners() === 5);  // blur, focus, beforeunload, offline, online: no lockdown
}

{
  const h = harness({ policyOverrides: { enabled: false } });
  h.monitor.start();
  h.document.visibilityState = "hidden";
  h.document.fire("visibilitychange");
  await tick();
  ok("an assessment with integrity off never starts watching", h.sent.length === 0 && h.document.listeners() === 0);
}

{
  // Recording switched off is not the same as copying allowed: the clipboard
  // switch alone governs blocking, so an assessment with integrity off still
  // cancels copy and reports nothing.
  const h = harness({ policyOverrides: { enabled: false } });
  h.monitor.start();
  let cancelled = false;
  h.window.fire("copy", { type: "copy", preventDefault: () => (cancelled = true) });
  await tick();
  ok("integrity off still blocks copy, and records nothing", cancelled === true && h.sent.length === 0);
  h.monitor.stop();
  ok("stop() still releases the lockdown with integrity off", h.window.listeners() === 0);
}

{
  const h = harness({ policyOverrides: { warnAfter: 2, reviewAfter: 4 }, reportResult: { count: 4 } });
  h.monitor.start();
  await h.document.visibilityState;
  h.document.visibilityState = "hidden";
  h.document.fire("visibilitychange");
  await tick();
  ok("the server's count, not the local guess, decides escalation", h.warnings.at(-1).level === "review" && h.warnings.at(-1).count === 4);
}

{
  const h = harness({ reportThrows: true });
  h.monitor.start();
  h.document.visibilityState = "hidden";
  h.document.fire("visibilitychange");
  await tick();
  ok("an unreachable server never breaks the monitor", h.sent.length === 1 && h.warnings.some((w) => w.level === "warn"));
}

/* ── The recording API ── */
const route = readFileSync("src/app/api/exam/integrity/route.ts", "utf8");
ok("the route trusts only the attempt token", /loadAttemptContext\(admin, attempt_id, token\)/.test(route));
ok("the candidate, paper and organisation come from the token", /organization_id: exam\.organization_id/.test(route) && /candidate_id: candidate\.id/.test(route) && /exam_id: exam\.id/.test(route));
ok("no client-supplied identity is accepted", !/z\.object\([^)]*organization_id/.test(route) && !/z\.object\([^)]*candidate_id/.test(route));
ok("a closed attempt records nothing", /attempt\.status !== "in_progress"/.test(route));
ok("the assessment policy gates recording server-side", /parseIntegrityPolicy/.test(route) && /reason: "integrity_disabled"/.test(route) && /reason: "event_disabled"/.test(route));
ok("duplicate bursts are collapsed server-side too", /DEDUPE_MS/.test(route) && /reason: "duplicate"/.test(route));
ok("a runaway client cannot flood the review queue", /MAX_EVENTS_PER_ATTEMPT/.test(route) && /reason: "capped"/.test(route));
ok("returns are stored but never counted as violations", /integrity_tab_visible,integrity_focus_back,integrity_online/.test(route));
ok("the incident lands in the existing table, not a second one", /from\("proctoring_incidents"\)/.test(route) && !/from\("integrity_events"\)/.test(route));

/* ── Client wiring ── */
const client = readFileSync("src/app/take-exam/[attemptId]/TakeExamClient.tsx", "utf8");
ok("the exam screen runs the shared monitor", /new IntegrityMonitor\(/.test(client) && /monitor\.start\(\)/.test(client) && /monitor\.stop\(\)/.test(client));
ok("monitoring stops once the paper is submitted", /attemptStatus !== "in_progress"/.test(client));
ok("the candidate sees a warning", /role="alert"/.test(client) && /warning\.title/.test(client) && /warning\.body/.test(client));
ok("the warning can be dismissed without leaving the paper", /Dismiss this warning/.test(client) && /setWarning\(null\)/.test(client));
ok("audio is attempted only when the policy allows it and is safely guarded", /AudioContext/.test(client) && /activePolicy\.sound/.test(client) && /catch \{/.test(client));
ok("events travel to the dedicated endpoint, never straight to the database", /\/api\/exam\/integrity/.test(client) && !/from\("proctoring_incidents"\)/.test(client));
ok("the exam page locks the paper while it is open for answering only", /useProtectedSurface\(Boolean\(token\) && attemptStatus === "in_progress"/.test(client));
const playClient = readFileSync("src/app/play/[code]/PlayClient.tsx", "utf8");
const screenClient = readFileSync("src/app/live/[liveId]/screen/PublicScreenClient.tsx", "utf8");
ok("the live quiz is locked once a participant has joined", /useAssessmentLockdown\(Boolean\(identity\)\)/.test(playClient));
ok("the projection screen is locked while open", /useAssessmentLockdown\(true\)/.test(screenClient));
ok("the monitor's lockdown is detached on stop()", /this\.detachLockdown\?\.\(\)/.test(readFileSync("src/lib/integrityMonitor.ts", "utf8")));
const state = readFileSync("src/app/api/exam/state/route.ts", "utf8");
ok("the candidate client receives the policy but never an answer key", /integrity: parseIntegrityPolicy\(settings\.integrity\)/.test(state) && !/settings\.integrity.*is_correct/.test(state));

/* ── Teacher consoles ── */
const examConsole = readFileSync("src/app/dashboard/exams/[id]/page.tsx", "utf8");
const dashboardConsole = readFileSync("src/app/dashboard/proctoring/page.tsx", "utf8");
const adminConsole = readFileSync("src/app/admin/proctoring/page.tsx", "utf8");
ok("the examination console explains what happened in words", /describeIncidentType\(i\.type\)/.test(examConsole));
ok("the proctoring console does the same", /describeIncidentType\(String\(i\.type\)\)/.test(dashboardConsole));
ok("the super-admin console does the same", /describeIncidentType\(String\(i\.type\)\)/.test(adminConsole));
ok("raw browser payloads are not shown to teachers", /!String\(i\.type\)\.startsWith\("integrity_"\)/.test(examConsole));

/* ── Notification bell ── */
const bell = readFileSync("src/components/dashboard/NotificationBell.tsx", "utf8");
const shell = readFileSync("src/app/admin/AdminShell.tsx", "utf8");
ok("the bell opens a floating panel instead of navigating", /aria-haspopup="dialog"/.test(bell) && /role="dialog"/.test(bell));
ok("it shows the real notification rows", /from\("notifications"\)/.test(bell));
ok("mark one and mark all read stay available", /Mark all read/.test(bell) && /Mark read/.test(bell));
ok("the empty state is explicit", /all caught up/.test(bell));
ok("the admin console uses the popover", /<NotificationBell/.test(shell) && !/href="\/admin\/notifications"[\s\S]{0,120}aria-label=\{`Notifications/.test(shell));
ok("platform alerts still count in the badge", /extraCount=\{counts\.payments \+ counts\.tickets \+ counts\.incidents\}/.test(shell));
ok("the portal to the full console remains", /allHref="\/admin\/notifications"/.test(shell) && /allLabel="See all platform alerts"/.test(shell));

console.log(`\n${passed} checks passed.`);
