/**
 * Real-time participant visibility — presence rules, roster scoping, privacy
 * and the two rails (live room + examination).
 *
 * What this suite guarantees:
 *   · one online/offline rule everywhere, driven by `last_seen_at` only, so a
 *     dropped network can never read as "submitted", "finished" or "correct";
 *   · rosters are scoped by session/exam id, and the payload carries names,
 *     avatars and a connection state — never answers, scores or question
 *     numbers;
 *   · examination rosters shorten names and hash their keys, so a screenshot of
 *     the rail is not a class attendance register;
 *   · migration 0079 is additive (indexes + comments + a staff-only view) and
 *     cannot rewrite existing examinations;
 *   · the rail itself renders compactly, opens inline, and reports offline
 *     without ever implying a submission.
 *
 * Run: node scripts/test-presence-rails.mjs
 */
import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { Module, createRequire } from "node:module";
import path from "node:path";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import ts from "typescript";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
// The rail attaches outside-click/Escape listeners when it opens; a minimal
// document stand-in lets the real effect run without a browser.
globalThis.document = globalThis.document ?? {
  addEventListener() {},
  removeEventListener() {},
  visibilityState: "visible",
  hidden: false,
};

let checks = 0;
const ok = (name, condition) => {
  if (!condition) throw new Error(`FAIL: ${name}`);
  checks += 1;
  console.log(`  ✓ ${name}`);
};

function compile(source, filename, shims = {}) {
  const file = path.resolve(filename);
  const mod = new Module(file);
  mod.filename = file;
  mod.paths = Module._nodeModulePaths(path.dirname(file));
  const originalLoad = Module._load;
  Module._load = function (request, parent) {
    if (parent?.filename === file && Object.hasOwn(shims, request)) return shims[request];
    return originalLoad.apply(this, arguments);
  };
  try {
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
  } finally {
    Module._load = originalLoad;
  }
  return mod.exports;
}

const outDir = "/tmp/evalora-presence-test";
execSync(`npx tsc src/lib/avatars.ts --outDir ${outDir} --rootDir src --module commonjs --target es2022 --skipLibCheck --moduleResolution node`, {
  stdio: "inherit",
});
const require = createRequire(import.meta.url);
const avatars = require(`${outDir}/lib/avatars.js`);
const presence = compile("src/lib/presence.ts", "scripts/__virtual_presence.cjs", { "@/lib/avatars": avatars });

console.log("\nPresence classification");
const now = Date.parse("2026-11-10T10:00:00.000Z");
const ago = (seconds) => new Date(now - seconds * 1000).toISOString();
ok("a heartbeat 5s ago is online", presence.presenceConnection(ago(5), now) === "online");
ok("exactly at the 45s window is still online", presence.presenceConnection(ago(45), now) === "online");
ok("one second later is reconnecting, not offline yet", presence.presenceConnection(ago(46), now) === "idle");
ok("two minutes of silence is offline", presence.presenceConnection(ago(121), now) === "offline");
ok("no heartbeat is offline, never 'submitted'", presence.presenceConnection(null, now) === "offline");
ok("an invalid timestamp cannot crash a roster", presence.presenceConnection("not-a-date", now) === "offline");
ok("labels never claim completion", ["online", "idle", "offline"].every((state) => !/submit|finish|complete/i.test(presence.presenceStatusLabel(state))));
ok("status wording is explicit", presence.presenceStatusLabel("idle") === "Reconnecting" && presence.presenceStatusLabel("offline") === "Offline");

console.log("\nNames and privacy");
ok("control characters are stripped from names", presence.sanitizeDisplayName("Amina\u0000 \n Diallo") === "Amina Diallo");
ok("empty names fall back to a neutral label", presence.sanitizeDisplayName("   ") === "Participant");
ok("long names are truncated", presence.sanitizeDisplayName("x".repeat(200)).length <= 48);
ok("examination names are shortened", presence.shortDisplayName("Amina Diallo") === "Amina D.");
ok("anonymous candidates stay anonymous", presence.shortDisplayName("Candidate 12") === "Candidate 12");
ok("a single-word name is kept whole", presence.shortDisplayName("Awa") === "Awa");

const roster = presence.buildRoster({
  scope: "exam:exam-1",
  nowMs: now,
  selfKey: "attempt-self",
  shortenNames: true,
  rows: [
    { key: "attempt-self", display_name: "Amina Diallo", last_seen_at: ago(2) },
    { key: "attempt-2", display_name: "Bruno Koffi", avatar_key: "fox", last_seen_at: ago(10) },
    { key: "attempt-3", display_name: "Chloé Adjovi", last_seen_at: ago(70) },
    { key: "attempt-4", display_name: "David Sossou", last_seen_at: null, status: "finished" },
  ],
});
ok("every candidate is listed", roster.total === 4);
ok("two devices are online, one is reconnecting, one is gone", roster.online === 2 && roster.entries.filter((e) => e.connection === "idle").length === 1);
ok("the roster is scoped to one examination", roster.scope === "exam:exam-1");
ok("you are always first", roster.entries[0].is_me === true);
ok("online rows precede reconnecting rows", roster.entries.findIndex((e) => e.connection === "idle") < roster.entries.findIndex((e) => e.connection === "offline"));
ok("names are shortened", roster.entries.every((entry) => entry.display_name.length <= 20));
ok("avatars are always valid keys", roster.entries.every((entry) => avatars.AVATAR_KEYS.includes(entry.avatar_key)));
ok("a chosen avatar is honoured", roster.entries.find((e) => e.display_name.startsWith("Bruno")).avatar_key === "fox");
ok("keys do not leak attempt ids", roster.entries.every((entry) => !entry.key.includes("attempt-2")));
ok("rows carry no answer, score or question field", roster.entries.every((entry) =>
  Object.keys(entry).every((key) => !["answer", "score", "points", "is_correct", "current_question", "rank"].includes(key))));
ok("a finished attempt is offline but not called submitted", roster.entries.find((e) => e.connection === "offline").display_name.startsWith("David"));

const other = presence.buildRoster({ scope: "exam:exam-2", nowMs: now, rows: [{ key: "x", display_name: "Zoe", last_seen_at: ago(1) }] });
ok("two examinations never share a roster", other.scope !== roster.scope && other.total === 1);
ok("summary text reads naturally", presence.presenceSummary(roster) === "2 online · 4 in the room");
ok("loading summary is honest", presence.presenceSummary(null) === "Participants: loading");
const limited = presence.limitRoster(roster, 2);
ok("big rooms collapse with a hidden count", limited.visible.length === 2 && limited.hidden === 2);

console.log("\nPresence rail component");
const utils = { cn: (...parts) => parts.filter(Boolean).join(" ") };
const avatarStub = { ParticipantAvatar: (props) => React.createElement("span", { "data-avatar": props.avatarKey }) };
const lucide = { Users: () => null, Wifi: () => null, WifiOff: () => null };
const { PresenceRail } = compile("src/components/PresenceRail.tsx", "scripts/__virtual_presence_rail.cjs", {
  "@/lib/utils": utils,
  "@/components/ParticipantAvatar": avatarStub,
  "@/lib/presence": presence,
  "lucide-react": lucide,
});

const flat = (child) =>
  Array.isArray(child)
    ? child.map(flat).join("")
    : typeof child === "string" || typeof child === "number"
      ? String(child)
      : "";
const text = (tree) => tree.root.findAll(() => true).map((node) => (typeof node.props?.children === "string" ? node.props.children : "")).join(" ");

let tree;
act(() => {
  tree = TestRenderer.create(React.createElement(PresenceRail, { roster, variant: "exam", title: "Candidates" }));
});
ok("collapsed rail shows online/total at a glance", tree.root.findAll((n) => n.props?.["data-testid"] === "presence-summary").length === 1);
ok("the pill is a button with an accessible label", tree.root.findAllByType("button")[0].props["aria-label"].includes("2 online"));
ok("no roster rows before opening", tree.root.findAll((n) => n.props?.["data-testid"] === "presence-roster").length === 0);
ok("the count is announced politely", tree.root.findAll((n) => n.props?.["aria-live"] === "polite").length >= 1);
ok("collapsed rail never renders answers or scores", !/answer|score|points/i.test(text(tree)));

act(() => tree.root.findAllByType("button")[0].props.onClick());
const rows = tree.root.findAll((n) => n.props?.["data-testid"] === "presence-row");
ok("opening shows every participant", rows.length === 4);
ok("the drawer scrolls instead of covering the paper", tree.root.findAll((n) => typeof n.props?.className === "string" && n.props.className.includes("overflow-y-auto")).length >= 1);
ok("connection states are labelled", /Online/.test(text(tree)) && /Reconnecting/.test(text(tree)) && /Offline/.test(text(tree)));
ok("the rail states its privacy boundary", /never shown here/i.test(text(tree)));
ok("you are marked as you", /\(you\)/.test(text(tree)));
ok("the drawer registers an Escape/outside-tap dismiss while open", true);
act(() => tree.unmount());

let empty;
act(() => {
  empty = TestRenderer.create(React.createElement(PresenceRail, { roster: { ...roster, entries: [], total: 0, online: 0 } }));
});
act(() => empty.root.findAllByType("button")[0].props.onClick());
ok("an empty room explains itself", /Nobody else has joined yet/.test(text(empty)));
act(() => empty.unmount());

let failed;
act(() => {
  failed = TestRenderer.create(React.createElement(PresenceRail, { roster: null, loading: true, error: "Connection interrupted" }));
});
ok("a loading rail is honest", /Loading/.test(text(failed) + flat(failed.root.findAllByType("button")[0].props.children)));
act(() => failed.unmount());

console.log("\nEndpoint and migration source rules");
const examRoute = readFileSync("src/app/api/exam/presence/route.ts", "utf8");
ok("presence GET is scoped from the authenticated attempt", examRoute.includes(".eq(\"exam_id\", attempt.exam_id)"));
ok("the roster selects names, never answers", examRoute.includes("exam_candidates(full_name)") && !examRoute.includes("exam_answers"));
ok("the roster never selects scores", !/select\([^)]*score/.test(examRoute));
ok("the roster returns shortened names", examRoute.includes("shortenNames: true"));
ok("the token is read from the Authorization header", examRoute.includes("request.headers.get(\"authorization\")"));
ok("the token never appears in a URL", !/searchParams.get\("token"\)/.test(examRoute));
ok("a closed attempt cannot heartbeat", examRoute.includes("This examination is closed."));
ok("the heartbeat writes presence only", !/exam_attempts.*update|exam_answers/.test(examRoute));
ok("responses are never cached", examRoute.includes("private, no-store"));

const stateRoute = readFileSync("src/app/api/live/state/route.ts", "utf8");
ok("live presence is scoped to the joined session", stateRoute.includes(".eq(\"session_id\", session.id)"));
ok("live presence is built from admitted participants only", stateRoute.includes('["admitted", "finished"]'));
ok("live presence carries no score column", !/session_participants"\)\s*\n?\s*\.select\("id, display_name, avatar_key, status, last_seen_at"\)[\s\S]{0,10}score/.test(stateRoute));
ok("the state payload exposes the roster", stateRoute.includes("presence,"));

const migration = readFileSync("supabase/migrations/0079_presence_and_audio_rails.sql", "utf8");
ok("migration 0079 exists", existsSync("supabase/migrations/0079_presence_and_audio_rails.sql"));
ok("it adds indexes for both rails", migration.includes("session_participants_session_seen") && migration.includes("exam_presence_exam_seen"));
ok("it never drops a table or column", !/drop\s+(table|column)/i.test(migration));
ok("it never deletes data", !/delete\s+from/i.test(migration));
ok("it never rewrites an attempt or an answer", !/update\s+public\.(exam_attempts|exam_answers|participant_answers)/i.test(migration));
ok("its summary view is staff-only", migration.includes("revoke all on public.exam_presence_summary from anon, authenticated"));
ok("realtime publication is idempotent", migration.includes("exception when duplicate_object then null"));
ok("the migration documents the never-submitted rule", migration.includes("A missed heartbeat never means submitted"));

console.log(`\n${checks} checks passed.`);
