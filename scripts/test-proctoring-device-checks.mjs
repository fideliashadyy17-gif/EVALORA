// Proctoring device checks — the code that makes three configuration switches
// (`proctoring.require_camera_check`, `require_microphone_check`,
// `require_browser_check`) actually do something at admission.
//
// Everything here runs the REAL modules: src/lib/deviceCheck.ts, the
// src/components/exam gate, and src/app/api/exam/device-check/route.ts with only
// the database and the configuration service faked. The assertions cover the
// three things that matter for a proctoring control:
//
//   1. PRIVACY — a media stream is always stopped, nothing but a bounded summary
//      is ever sent, a successful check writes no row, and no code path
//      enumerates devices or captures media;
//   2. AUTHORITY — the server, not the candidate's browser, decides which checks
//      were required, so a tampered payload can neither invent nor hide an
//      incident;
//   3. HONESTY — the switches really are wired: the pages resolve them, the
//      panel disappears when they are off, and the start button waits for the
//      check the institution asked for.
import "./__platform_config_stubs.mjs";

import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { Module } from "node:module";
import path from "node:path";
import { randomUUID } from "node:crypto";
import ts from "typescript";

const ROOT = process.cwd();
let passed = 0;
const failures = [];

function check(label, fn) {
  try {
    const out = fn();
    if (out instanceof Promise) {
      return out.then(
        () => { passed += 1; },
        (error) => { failures.push(`${label}: ${error?.message ?? error}`); },
      );
    }
    passed += 1;
  } catch (error) {
    failures.push(`${label}: ${error?.message ?? error}`);
  }
  return undefined;
}

/* ───────────────────────── source loader ───────────────────────── */
const fakes = new Map();
const loaded = new Map();
const EXTENSIONS = [".ts", ".tsx", "/index.ts", "/index.tsx"];

const src = (rel) => path.join(ROOT, rel);
const read = (rel) => readFileSync(src(rel), "utf8");
function isFile(candidate) {
  try {
    return statSync(candidate).isFile();
  } catch {
    return false;
  }
}
function resolveFile(base, suffix = "") {
  const stem = suffix ? path.resolve(base, suffix) : base;
  if (isFile(stem)) return stem;
  for (const ext of EXTENSIONS) {
    const candidate = `${stem}${ext}`;
    if (isFile(candidate)) return candidate;
  }
  return null;
}
function resolveRequest(request, parentFile) {
  if (request.startsWith("@/")) return resolveFile(src("src"), request.slice(2));
  if (request.startsWith(".")) return resolveFile(path.dirname(parentFile), request);
  return null;
}
function load(relOrAbs) {
  const file = path.isAbsolute(relOrAbs) ? relOrAbs : src(relOrAbs);
  if (fakes.has(file)) return fakes.get(file);
  if (loaded.has(file)) return loaded.get(file);
  const mod = new Module(file);
  mod.filename = file;
  mod.paths = Module._nodeModulePaths(path.dirname(file));
  loaded.set(file, mod.exports);
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (parent?.filename === file) {
      const target = resolveRequest(request, file);
      if (target) return load(target);
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    const { outputText } = ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
      fileName: file,
    });
    mod._compile(outputText, file);
    loaded.set(file, mod.exports);
    return mod.exports;
  } finally {
    Module._load = originalLoad;
  }
}

/* ───────────────────────── fake configuration + database ───────────────────────── */
// The proctoring namespace as the configuration service would resolve it. Tests
// set this directly, so src/lib/proctoringConfig.ts (clamping, fallbacks) stays
// real while the stored values are under test control.
let proctoringValues = null;
fakes.set(src("src/lib/config/service.ts"), {
  getProctoringConfig: async () => proctoringValues ?? {},
  getNamespaceConfig: async () => proctoringValues ?? {},
  invalidateConfigCache: () => {},
});

const db = { exam_attempts: [], exams: [], exam_candidates: [], proctoring_incidents: [] };
const ATTEMPT_ID = randomUUID();
const ACCESS_TOKEN = randomUUID();
const EXAM_ID = randomUUID();
const CANDIDATE_ID = randomUUID();
const ORG_ID = "0a400000-0000-4000-8000-000000000001";

function seedDb(status = "in_progress") {
  db.exam_attempts = [{ id: ATTEMPT_ID, access_token: ACCESS_TOKEN, exam_id: EXAM_ID, candidate_id: CANDIDATE_ID, status }];
  db.exams = [{ id: EXAM_ID, organization_id: ORG_ID, title: "MYP 5 Mathematics (Version C)", status: "open", settings: {} }];
  db.exam_candidates = [{ id: CANDIDATE_ID, exam_id: EXAM_ID, full_name: "Aïcha Diallo" }];
  db.proctoring_incidents = [];
}
seedDb();

function matches(row, filters) {
  return filters.every(({ column, op, value }) => {
    if (op === "eq") return String(row[column]) === String(value);
    if (op === "in") return value.includes(row[column]);
    return true;
  });
}
async function runSelect(table, state) {
  let rows = (db[table] ?? []).filter((row) => matches(row, state.filters));
  if (state.limit) rows = rows.slice(0, state.limit);
  return rows.map((row) => ({ ...row }));
}
function chain(table, state) {
  const settle = (work) => ({
    then: (onFulfilled, onRejected) =>
      Promise.resolve()
        .then(work)
        .then(
          (rows) => (onFulfilled ? onFulfilled({ data: rows, error: null, count: rows.length }) : undefined),
          (error) => (onRejected ? onRejected(error) : onFulfilled ? onFulfilled({ data: null, error: { message: error.message } }) : undefined),
        ),
  });
  const api = {
    select: () => api,
    eq: (column, value) => chain(table, { ...state, filters: [...state.filters, { column, op: "eq", value }] }),
    in: (column, value) => chain(table, { ...state, filters: [...state.filters, { column, op: "in", value }] }),
    order: () => api,
    limit: (n) => chain(table, { ...state, limit: n }),
    maybeSingle: async () => {
      const rows = await runSelect(table, state);
      return { data: rows[0] ?? null, error: null };
    },
    single: async () => {
      const rows = await runSelect(table, state);
      return rows.length ? { data: rows[0], error: null } : { data: null, error: { message: "no rows" } };
    },
    insert: async (payload) => {
      const rows = Array.isArray(payload) ? payload : [payload];
      for (const entry of rows) db[table].push({ id: randomUUID(), created_at: new Date().toISOString(), ...entry });
      return { data: rows, error: null };
    },
    ...settle(() => runSelect(table, state)),
  };
  return api;
}
const fakeAdmin = {
  from: (table) => {
    if (!(table in db)) db[table] = [];
    return chain(table, { filters: [], limit: null });
  },
};
fakes.set(src("src/lib/supabase/server.ts"), {
  createAdminClient: () => fakeAdmin,
  createClient: async () => fakeAdmin,
});

/* ───────────────────────── modules under test ───────────────────────── */
const deviceCheck = load("src/lib/deviceCheck.ts");
const gate = load("src/components/exam/useDeviceCheckGate.ts");
const proctoringConfig = load("src/lib/proctoringConfig.ts");
const route = load("src/app/api/exam/device-check/route.ts");

const json = (body) => ({ json: async () => body });
const post = (body) => route.POST(json(body));
const get = (params) => route.GET({ url: `https://evalora-edu.online/api/exam/device-check?${new URLSearchParams(params).toString()}` });
const baseBody = () => ({ attempt_id: ATTEMPT_ID, token: ACCESS_TOKEN });

/** The configuration a strict invigilation setup would store. */
const ALL_ON = {
  require_camera_check: true,
  require_microphone_check: true,
  require_browser_check: true,
  max_tab_switch_warnings: 2,
  incident_alert_threshold: 4,
  evidence_review_required: true,
  continuous_recording_enabled: false,
};
const ALL_OFF = {
  require_camera_check: false,
  require_microphone_check: false,
  require_browser_check: false,
  max_tab_switch_warnings: 3,
  incident_alert_threshold: 3,
  evidence_review_required: true,
  continuous_recording_enabled: false,
};

/* ══════════════ 1. configuration resolution ══════════════ */

await check("proctoring switches resolve from configuration, clamped to safe bounds", async () => {
  proctoringValues = ALL_ON;
  const cfg = await proctoringConfig.resolveProctoringConfig(ORG_ID);
  assert.equal(cfg.requireCameraCheck, true);
  assert.equal(cfg.requireMicrophoneCheck, true);
  assert.equal(cfg.requireBrowserCheck, true);
  assert.equal(cfg.maxTabSwitchWarnings, 2);
  assert.equal(cfg.incidentAlertThreshold, 4);

  proctoringValues = { ...ALL_ON, max_tab_switch_warnings: 5000, incident_alert_threshold: -3 };
  const clamped = await proctoringConfig.resolveProctoringConfig(ORG_ID);
  assert.equal(clamped.maxTabSwitchWarnings, 20, "a stored 5000 must not become an unusable threshold");
  assert.equal(clamped.incidentAlertThreshold, 1);
});

await check("an unreadable configuration falls back to the shipped behaviour", async () => {
  proctoringValues = null;
  const cfg = await proctoringConfig.resolveProctoringConfig(ORG_ID);
  assert.deepEqual(cfg, proctoringConfig.PROCTORING_FALLBACKS);
  assert.equal(cfg.continuousRecordingEnabled, false, "continuous recording is not implemented, so it stays off");
});

/* ══════════════ 2. the browser-side probes ══════════════ */

await check("no check is run when the platform asked for none", () => {
  assert.equal(deviceCheck.deviceChecksRequired({ camera: false, microphone: false, browser: false }), false);
  assert.equal(deviceCheck.deviceChecksRequired(null), false);
  assert.equal(deviceCheck.deviceChecksRequired(undefined), false);
  assert.equal(deviceCheck.deviceChecksRequired({ camera: false, microphone: true, browser: false }), true);
});

await check("a missing media API reports unavailable instead of pretending", async () => {
  const status = await deviceCheck.probeMediaDevice("video");
  assert.equal(status, "unavailable", "Node has no mediaDevices, and that must be reported honestly");
});

await check("a granted probe stops every track before returning", async () => {
  const stopped = [];
  const fakeNavigator = {
    mediaDevices: {
      getUserMedia: async () => ({
        getTracks: () => [{ stop: () => stopped.push("video") }, { stop: () => stopped.push("audio") }],
      }),
    },
  };
  const original = globalThis.navigator;
  Object.defineProperty(globalThis, "navigator", { value: fakeNavigator, configurable: true });
  try {
    assert.equal(await deviceCheck.probeMediaDevice("video"), "granted");
  } finally {
    Object.defineProperty(globalThis, "navigator", { value: original, configurable: true });
  }
  assert.equal(stopped.length, 2, "the stream must never stay open");
});

await check("refused, missing and broken devices are each reported distinctly", async () => {
  const cases = [
    ["NotAllowedError", "denied"],
    ["SecurityError", "denied"],
    ["NotFoundError", "unavailable"],
    ["OverconstrainedError", "unavailable"],
    ["AbortError", "error"],
  ];
  for (const [name, expected] of cases) {
    const fakeNavigator = {
      mediaDevices: {
        getUserMedia: async () => {
          throw new DOMException("no", name);
        },
      },
    };
    const original = globalThis.navigator;
    Object.defineProperty(globalThis, "navigator", { value: fakeNavigator, configurable: true });
    try {
      assert.equal(await deviceCheck.probeMediaDevice("audio"), expected, name);
    } finally {
      Object.defineProperty(globalThis, "navigator", { value: original, configurable: true });
    }
  }
});

await check("a probe that throws still stops the stream it opened", async () => {
  let stopped = 0;
  const stream = { getTracks: () => [{ stop: () => { stopped += 1; } }] };
  const fakeNavigator = {
    mediaDevices: {
      getUserMedia: () =>
        new Promise((resolve, reject) => {
          resolve(stream);
          setTimeout(() => reject(new DOMException("late", "AbortError")), 0);
        }),
    },
  };
  const original = globalThis.navigator;
  Object.defineProperty(globalThis, "navigator", { value: fakeNavigator, configurable: true });
  try {
    await deviceCheck.probeMediaDevice("video");
  } finally {
    Object.defineProperty(globalThis, "navigator", { value: original, configurable: true });
  }
  assert.equal(stopped, 1);
});

await check("runDeviceChecks reports only what was asked for", async () => {
  const none = await deviceCheck.runDeviceChecks({ camera: false, microphone: false, browser: false });
  assert.equal(none.camera, "not_required");
  assert.equal(none.microphone, "not_required");
  assert.equal(none.browser, null);
  assert.equal(none.checkedAt, null, "nothing ran, so nothing is timestamped");

  const browserOnly = await deviceCheck.runDeviceChecks({ camera: false, microphone: false, browser: true });
  assert.equal(browserOnly.camera, "not_required");
  assert.ok(browserOnly.browser, "the browser check produced a report");
  assert.ok(browserOnly.checkedAt);
});

await check("the browser report is bounded and never carries a raw user agent", () => {
  const info = deviceCheck.collectBrowserInfo({
    userAgent: `Mozilla/5.0 (${longText(400)}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36`,
    platform: longText(200),
    onLine: true,
  });
  assert.ok(info.name.length <= deviceCheck.DEVICE_CHECK_LIMITS.name);
  assert.ok(info.version.length <= deviceCheck.DEVICE_CHECK_LIMITS.version);
  assert.ok(info.platform.length <= deviceCheck.DEVICE_CHECK_LIMITS.platform);
  assert.equal(info.name, "Chrome");
  assert.ok(!JSON.stringify(info).includes("Mozilla/5.0"), "the raw user-agent string is never stored");
  assert.ok(Number.isInteger(info.screenWidth));
});

await check("an insecure or offline environment is flagged as unsupported", () => {
  const originalWindow = globalThis.window;
  Object.defineProperty(globalThis, "window", { value: { isSecureContext: false }, configurable: true });
  try {
    const info = deviceCheck.collectBrowserInfo({ userAgent: "Mozilla/5.0 Chrome/126.0.0.0", onLine: true });
    assert.equal(info.supported, false);
    assert.match(info.reason, /secure connection/i);
  } finally {
    Object.defineProperty(globalThis, "window", { value: originalWindow, configurable: true });
  }
  Object.defineProperty(globalThis, "window", { value: { isSecureContext: true }, configurable: true });
  try {
    const offline = deviceCheck.collectBrowserInfo({ userAgent: "Mozilla/5.0 Firefox/127.0", onLine: false });
    assert.equal(offline.supported, false);
    assert.match(offline.reason, /internet connection/i);
    const good = deviceCheck.collectBrowserInfo({ userAgent: "Mozilla/5.0 Firefox/127.0", onLine: true });
    assert.equal(good.supported, true);
    assert.equal(good.name, "Firefox");
  } finally {
    Object.defineProperty(globalThis, "window", { value: originalWindow, configurable: true });
  }
});

await check("only required checks can fail", () => {
  const result = { camera: "denied", microphone: "unavailable", browser: { supported: true }, checkedAt: null };
  assert.deepEqual(deviceCheck.failedDeviceChecks(result, { camera: true, microphone: false, browser: false }), ["camera"]);
  assert.deepEqual(deviceCheck.failedDeviceChecks(result, { camera: false, microphone: false, browser: false }), []);
  assert.deepEqual(
    deviceCheck.failedDeviceChecks({ camera: "granted", microphone: "granted", browser: { supported: false }, checkedAt: null }, { camera: true, microphone: true, browser: true }),
    ["browser"],
  );
  assert.deepEqual(deviceCheck.failedDeviceChecks(null, { camera: true, microphone: true, browser: true }), []);
});

await check("the wire payload omits what was not required and bounds what was", () => {
  const result = {
    camera: "granted",
    microphone: "denied",
    browser: { name: longText(200), version: "1", platform: "p", screenWidth: 1440, screenHeight: 900, online: true, supported: false, reason: longText(500) },
    checkedAt: "2026-11-26T10:00:00.000Z",
  };
  const cameraOnly = deviceCheck.deviceCheckWirePayload(result, { camera: true, microphone: false, browser: false });
  assert.deepEqual(Object.keys(cameraOnly).sort(), ["camera", "checked_at"]);

  const everything = deviceCheck.deviceCheckWirePayload(result, { camera: true, microphone: true, browser: true });
  assert.equal(everything.browser.name.length, deviceCheck.DEVICE_CHECK_LIMITS.name);
  assert.equal(everything.browser.reason.length, deviceCheck.DEVICE_CHECK_LIMITS.reason);
  assert.equal(everything.browser.screen_width, 1440);
  assert.equal(everything.browser.supported, false);

  assert.equal(deviceCheck.deviceCheckWirePayload(result, { camera: false, microphone: false, browser: false }), null);
  assert.equal(deviceCheck.deviceCheckWirePayload(null, { camera: true, microphone: false, browser: false }), null);
});

await check("the candidate-facing wording never claims recording happens", () => {
  for (const device of ["camera", "microphone"]) {
    for (const status of deviceCheck.DEVICE_CHECK_STATUSES) {
      const sentence = deviceCheck.deviceCheckSentence(device, status);
      assert.ok(sentence.length > 10, `${device}/${status}`);
      assert.ok(!/record(ing|ed) (you|video|audio)/i.test(sentence), `${device}/${status} must not imply recording`);
    }
  }
  assert.match(deviceCheck.deviceCheckSentence("camera", "granted"), /Nothing was recorded/);
  assert.match(deviceCheck.deviceCheckSentence("camera", "denied"), /still sit the examination/);
});

await check("the panel and its gate never switch a check on from untrusted data", () => {
  for (const garbage of [null, undefined, {}, "camera", 1, { camera: "true" }, { camera: 1 }, []]) {
    assert.equal(gate.normalizeDeviceCheckRequirements(garbage), null, JSON.stringify(garbage));
  }
  assert.deepEqual(gate.normalizeDeviceCheckRequirements({ camera: true }), { camera: true, microphone: false, browser: false });
  assert.deepEqual(gate.normalizeDeviceCheckRequirements({ camera: true, microphone: true, browser: true, extra: true }), {
    camera: true,
    microphone: true,
    browser: true,
  });
});

await check("no code path enumerates devices or captures media", () => {
  for (const file of ["src/lib/deviceCheck.ts", "src/components/exam/DeviceCheckPanel.tsx", "src/components/exam/useDeviceCheckGate.ts"]) {
    const source = read(file);
    assert.ok(!source.includes("enumerateDevices"), `${file} must not enumerate devices`);
    assert.ok(!source.includes("MediaRecorder"), `${file} must not record media`);
    assert.ok(!source.includes("getImageData") && !source.includes("captureStream"), `${file} must not capture frames`);
  }
  const lib = read("src/lib/deviceCheck.ts");
  assert.match(lib, /finally \{[\s\S]{0,200}stopAllTracks\(stream\)/, "tracks are stopped even when the probe throws");
});

/* ══════════════ 3. the recording API ══════════════ */

await check("the requirements endpoint needs the attempt's own token", async () => {
  proctoringValues = ALL_ON;
  seedDb();
  const ok = await get({ attempt_id: ATTEMPT_ID, token: ACCESS_TOKEN });
  assert.equal(ok.status, 200);
  const body = await ok.json();
  assert.deepEqual(body.required, { camera: true, microphone: true, browser: true });

  assert.equal((await get({ attempt_id: ATTEMPT_ID, token: randomUUID() })).status, 404, "a wrong token finds no attempt");
  assert.equal((await get({ attempt_id: randomUUID(), token: ACCESS_TOKEN })).status, 404);
  assert.equal((await get({ attempt_id: "not-a-uuid", token: ACCESS_TOKEN })).status, 400);
  assert.equal((await get({})).status, 400);
});

await check("the requirements endpoint reports what the organization configured", async () => {
  proctoringValues = ALL_OFF;
  const body = await (await get({ attempt_id: ATTEMPT_ID, token: ACCESS_TOKEN })).json();
  assert.deepEqual(body.required, { camera: false, microphone: false, browser: false });
});

await check("a passed check writes nothing at all", async () => {
  proctoringValues = ALL_ON;
  seedDb();
  const res = await post({
    ...baseBody(),
    camera: "granted",
    microphone: "granted",
    browser: { name: "Chrome", version: "126", platform: "macOS", screen_width: 1440, screen_height: 900, online: true, supported: true },
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.recorded, false);
  assert.equal(body.reason, "all_checks_passed");
  assert.deepEqual(body.failures, []);
  assert.equal(db.proctoring_incidents.length, 0, "a successful admission is not evidence and must not be stored");
});

await check("a required check that failed leaves exactly one low-severity incident", async () => {
  proctoringValues = ALL_ON;
  seedDb();
  const res = await post({ ...baseBody(), camera: "denied", microphone: "granted", browser: { name: "Chrome", version: "126", platform: "macOS", screen_width: 1440, screen_height: 900, online: true, supported: true } });
  const body = await res.json();
  assert.equal(body.recorded, true);
  assert.deepEqual(body.failures, ["camera"]);
  assert.equal(db.proctoring_incidents.length, 1);
  const incident = db.proctoring_incidents[0];
  assert.equal(incident.type, "device_check_failed");
  assert.equal(incident.severity, "low", "an unverified camera is a review item, not an accusation");
  assert.equal(incident.status, "open");
  assert.equal(incident.organization_id, ORG_ID);
  assert.equal(incident.exam_id, EXAM_ID);
  assert.equal(incident.candidate_id, CANDIDATE_ID);
  assert.equal(incident.attempt_id, ATTEMPT_ID);
  const note = JSON.parse(incident.note);
  assert.deepEqual(note.failed, ["camera"]);
  assert.equal(note.camera, "denied");
  assert.ok(incident.note.length <= 400);
});

await check("a retry does not fill the review queue with repeats", async () => {
  const again = await post({
    ...baseBody(),
    camera: "denied",
    microphone: "granted",
    browser: { name: "Chrome", version: "126", platform: "macOS", screen_width: 1440, screen_height: 900, online: true, supported: true },
  });
  const body = await again.json();
  assert.equal(body.recorded, false);
  assert.equal(body.reason, "duplicate");
  assert.deepEqual(body.failures, ["camera"]);
  assert.equal(db.proctoring_incidents.length, 1);
});

await check("the server decides what was required, not the payload", async () => {
  // The organization switched the camera check OFF: a payload claiming a camera
  // failure must not manufacture an incident.
  proctoringValues = ALL_OFF;
  seedDb();
  const ignored = await post({ ...baseBody(), camera: "denied", microphone: "denied" });
  const ignoredBody = await ignored.json();
  assert.equal(ignoredBody.recorded, false);
  assert.deepEqual(ignoredBody.failures, []);
  assert.equal(db.proctoring_incidents.length, 0);

  // And a payload that simply omits a REQUIRED check counts as a failure:
  // silence is not evidence that a device worked.
  proctoringValues = ALL_ON;
  seedDb();
  const silent = await post({ ...baseBody(), microphone: "granted" });
  const silentBody = await silent.json();
  assert.equal(silentBody.recorded, true);
  assert.ok(silentBody.failures.includes("camera"), "the omitted camera check is reported");
  assert.ok(silentBody.failures.includes("browser"), "the omitted browser check is reported");
});

await check("an unsupported browser environment is recorded with its reason", async () => {
  proctoringValues = { ...ALL_OFF, require_browser_check: true };
  seedDb();
  const res = await post({
    ...baseBody(),
    browser: { name: "Netscape", version: "4", platform: "Win95", screen_width: 640, screen_height: 480, online: true, supported: false, reason: "This browser could not be identified." },
  });
  const body = await res.json();
  assert.deepEqual(body.failures, ["browser"]);
  assert.equal(db.proctoring_incidents.length, 1);
  assert.match(db.proctoring_incidents[0].note, /could not be identified/);
  const note = JSON.parse(db.proctoring_incidents[0].note);
  assert.ok(!("camera" in note), "a check that was not required is not mentioned");
  assert.ok(!("microphone" in note));
  assert.deepEqual(note.required, ["browser"]);
});

await check("the endpoint is authenticated by attempt token only", async () => {
  proctoringValues = ALL_ON;
  seedDb();
  assert.equal((await post({ ...baseBody(), token: randomUUID(), camera: "denied" })).status, 404);
  assert.equal((await post({ attempt_id: ATTEMPT_ID, token: "nope", camera: "denied" })).status, 400);
  assert.equal((await post({ camera: "denied" })).status, 400);
  assert.equal((await post(null)).status, 400);
  assert.equal(db.proctoring_incidents.length, 0);
});

await check("a submitted attempt records nothing", async () => {
  proctoringValues = ALL_ON;
  seedDb("submitted");
  const res = await post({ ...baseBody(), camera: "denied" });
  const body = await res.json();
  assert.equal(body.recorded, false);
  assert.equal(body.reason, "attempt_not_active");
  assert.equal(db.proctoring_incidents.length, 0);
});

await check("an attempt whose examination cannot be resolved is refused", async () => {
  proctoringValues = ALL_ON;
  seedDb();
  db.exams = [];
  const res = await post({ ...baseBody(), camera: "denied" });
  assert.equal(res.status, 500);
  assert.equal(db.proctoring_incidents.length, 0);
});

await check("oversized and malformed fields are rejected by the schema", async () => {
  proctoringValues = ALL_ON;
  seedDb();
  const tooLong = await post({ ...baseBody(), browser: { name: longText(500), supported: false } });
  assert.equal(tooLong.status, 400);
  const badStatus = await post({ ...baseBody(), camera: "granted_but_recording" });
  assert.equal(badStatus.status, 400);
  const badScreen = await post({ ...baseBody(), browser: { name: "Chrome", supported: true, screen_width: -5 } });
  assert.equal(badScreen.status, 400);
  assert.equal(db.proctoring_incidents.length, 0);
});

await check("responses are never cached or shared", async () => {
  proctoringValues = ALL_ON;
  seedDb();
  const res = await post({ ...baseBody(), camera: "granted", microphone: "granted", browser: { name: "Chrome", supported: true } });
  assert.match(res.headers.get("cache-control") ?? "", /no-store/);
});

/* ══════════════ 4. the switches are actually wired to the screens ══════════════ */

await check("the shared-link admission page resolves the organization's checks server-side", () => {
  const page = read("src/app/exam/join/[token]/page.tsx");
  assert.match(page, /resolveProctoringConfig\(exam\.organization_id\)/);
  assert.match(page, /deviceChecks=\{/);
  const client = read("src/app/exam/join/[token]/JoinClient.tsx");
  assert.match(client, /useDeviceCheckGate\(deviceChecks\)/);
  assert.match(client, /<DeviceCheckPanel \{\.\.\.deviceGate\.panelProps\}/);
  assert.match(client, /deviceGate\.blocking/, "the start button waits for the check");
  assert.match(client, /await deviceGate\.submit\(data\.attempt_id, data\.access_token\)/);
});

await check("the code-entry screen resolves checks when it can and asks when it cannot", () => {
  const page = read("src/app/exam-access/page.tsx");
  assert.match(page, /resolveProctoringConfig\(matchedExam\.organization_id/);
  const client = read("src/app/exam-access/ExamAccessClient.tsx");
  assert.match(client, /useDeviceCheckGate\(deviceChecks\)/);
  assert.match(client, /loadRequirementsForAttempt\(data\.attempt_id, data\.access_token\)/);
  assert.match(client, /pendingEntry/, "a post-admission step exists when the organization was unknown");
  assert.match(client, /await deviceGate\.submit\(entry\.attemptId, entry\.token\)/);
});

await check("the panel renders nothing when no check is required", () => {
  const panel = read("src/components/exam/DeviceCheckPanel.tsx");
  assert.match(panel, /if \(!deviceChecksRequired\(needs\)\) return null;/);
  assert.match(panel, /awaitingAcknowledgement/, "a failure has to be acknowledged");
  assert.match(panel, /do not record video or/i, "the candidate is told the truth about recording");
  assert.ok(!panel.includes("dangerouslySetInnerHTML"));
});

await check("the schema points at the code that really consumes each switch", () => {
  const schemaSource = read("src/lib/config/schema.ts");
  for (const key of ["require_camera_check", "require_microphone_check", "require_browser_check"]) {
    const start = schemaSource.indexOf(`key: "${key}"`);
    assert.ok(start > 0, `${key} must be declared`);
    const block = schemaSource.slice(start, start + 1400);
    assert.match(block, /src\/lib\/deviceCheck\.ts/, `${key} must name the module that runs the check`);
    assert.match(block, /src\/app\/api\/exam\/device-check\/route\.ts/, `${key} must name the endpoint that records the outcome`);
    for (const claimed of block.match(/"(src\/[^"]+?)\s/g) ?? []) {
      const file = claimed.slice(1).trim();
      const absolute = src(file);
      assert.ok(existsSync(absolute) || existsSync(`${absolute}.ts`) || existsSync(`${absolute}.tsx`), `${key} claims ${file}, which does not exist`);
    }
  }
});

await check("the recorded incident is readable in the existing consoles", () => {
  const integrity = load("src/lib/integrity.ts");
  const label = integrity.describeIncidentType("device_check_failed");
  assert.equal(label, "device check failed");
  assert.ok(!label.includes("_"), "a supervisor reads words, not enum values");
  for (const console of ["src/app/dashboard/exams/[id]/page.tsx", "src/app/dashboard/proctoring/page.tsx", "src/app/admin/proctoring/page.tsx"]) {
    assert.match(read(console), /describeIncidentType/);
  }
});

function longText(length) {
  return "x".repeat(length);
}

if (failures.length) {
  console.error(`\nproctoring-device-checks: ${failures.length} FAILURE(S)`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`✓ proctoring device checks — ${passed} checks passed`);
