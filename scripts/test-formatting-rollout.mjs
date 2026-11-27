// Phase 4 — configured formatting reaches every screen.
//
// Before this rollout, `src/lib/utils.ts` formatted every date with a literal
// "en-GB" and every amount with a literal "en-US", so the Platform Control
// Center's Presentation settings (formatting.date_format, formatting.time_format,
// formatting.number_format) and localization.default_timezone were read by
// src/lib/formatting.ts and by nothing else: an administrator could change them
// and not one screen would move.
//
// This suite is the ratchet. It has two halves:
//
//   1. STATIC — the shape of the rollout, asserted over the whole tree:
//      the hardcoded helpers are gone rather than deprecated, every file that
//      formats binds a resolved formatter, only server files resolve and only
//      client files consume the provider, the remaining hand-written Intl calls
//      are exactly the allowlisted ones (each with a recorded reason), and the
//      candidate's live examination clock is still device time — a configured
//      timezone must never move a countdown a candidate is relying on.
//
//   2. BEHAVIOURAL — the real source, executed: src/lib/formatting.ts and
//      src/lib/formattingRequest.ts are loaded with only the configuration
//      service and the locale resolver faked, so the assertions are about
//      shipped code: the shipped profile reproduces the platform's old output
//      exactly, an organization override reaches the formatter, the viewer's
//      interface language decides month names, a malformed scope can never
//      widen to another tenant, and an unreachable configuration store degrades
//      to the shipped defaults instead of throwing.
//
// Run: node scripts/test-formatting-rollout.mjs
process.env.TZ = "UTC"; // deterministic expectations below, whatever the host zone

import "./__platform_config_stubs.mjs";

import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { Module } from "node:module";
import path from "node:path";
import ts from "typescript";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src");
let passed = 0;
const failures = [];

async function check(label, fn) {
  try {
    await fn();
    passed += 1;
  } catch (error) {
    failures.push(`${label}: ${error?.message ?? error}`);
  }
}

/* ───────────────────────── tree walk ───────────────────────── */
const EXTENSIONS = [".ts", ".tsx", "/index.ts", "/index.tsx"];
const sourceFiles = [];
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const absolute = path.join(dir, entry);
    if (statSync(absolute).isDirectory()) walk(absolute);
    else if (/\.(ts|tsx)$/.test(absolute)) sourceFiles.push(absolute);
  }
})(SRC);
const rel = (file) => path.relative(ROOT, file).split(path.sep).join("/");
const read = (file) => readFileSync(file, "utf8");
const isClient = (file) => /^["']use client["']/m.test(read(file));
/**
 * Source without comment-only lines, so a file that DOCUMENTS the formatter API
 * (src/lib/utils.ts, src/lib/formatting.ts) is not counted as a file that uses
 * it. Only whole-line comments are dropped: a line of real code is never
 * hidden, so an offender cannot escape by trailing a comment.
 */
const code = (file) => read(file).split("\n").filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line)).join("\n");

/* ───────────────────────── source loader ─────────────────────────
 * Loads real TypeScript, resolving `@/…` and relative specifiers. Anything in
 * `fakes` wins (the configuration service and the locale resolver, which are
 * the boundaries under test); everything else falls through to the shared
 * harness shim, so src/lib/formatting.ts and src/lib/formattingRequest.ts run
 * for real.
 */
const fakes = new Map();
const loaded = new Map();

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
  for (const ext of EXTENSIONS) if (isFile(`${stem}${ext}`)) return `${stem}${ext}`;
  return null;
}
function resolveRequest(request, fromFile) {
  if (request.startsWith("@/")) return resolveFile(SRC, request.slice(2));
  if (request.startsWith(".")) return resolveFile(path.resolve(path.dirname(fromFile), request));
  return null;
}
function load(file) {
  const absolute = resolveFile(path.resolve(ROOT, file)) ?? file;
  if (loaded.has(absolute)) return loaded.get(absolute).exports;
  const mod = new Module(absolute, null);
  mod.filename = absolute;
  mod.paths = Module._nodeModulePaths(path.dirname(absolute));
  loaded.set(absolute, mod);
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (fakes.has(request)) return fakes.get(request);
    if (parent?.filename === absolute) {
      const target = resolveRequest(request, absolute);
      if (target) return load(target);
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    const { outputText } = ts.transpileModule(read(absolute), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
      fileName: absolute,
    });
    mod._compile(outputText, absolute);
    return mod.exports;
  } finally {
    Module._load = originalLoad;
  }
}

/* ───────────────── faked boundaries ─────────────────
 * The configuration service is faked so an ORGANIZATION OVERRIDE can be injected
 * and so the scope it was called with can be inspected (the tenant assertion).
 * The locale resolver is faked because the real one reads a request cookie.
 */
const SCHEMA_DEFAULTS = {
  formatting: { date_format: "dmy_short", time_format: "24h", number_format: "en_us", default_academic_year: "2026-2027" },
  localization: { default_locale: "en", supported_locales: ["en", "fr", "es"], default_timezone: "Africa/Porto-Novo" },
};
let overrides = { formatting: {}, localization: {} };
let serviceCalls = [];
let viewerLocale = "en";
let serviceThrows = false;

fakes.set("@/lib/config/service", {
  getFormattingConfig: async (organizationId) => {
    serviceCalls.push({ namespace: "formatting", organizationId: organizationId ?? null });
    if (serviceThrows) throw new Error("configuration store unreachable");
    return { ...SCHEMA_DEFAULTS.formatting, ...overrides.formatting };
  },
  getLocalizationConfig: async (organizationId) => {
    serviceCalls.push({ namespace: "localization", organizationId: organizationId ?? null });
    if (serviceThrows) throw new Error("configuration store unreachable");
    return { ...SCHEMA_DEFAULTS.localization, ...overrides.localization };
  },
});
fakes.set("@/lib/i18n/server", { getRequestLocale: async () => viewerLocale });

function reset() {
  overrides = { formatting: {}, localization: {} };
  serviceCalls = [];
  viewerLocale = "en";
  serviceThrows = false;
}

const formatting = load("src/lib/formatting.ts");
const request = load("src/lib/formattingRequest.ts");
const notifications = load("src/lib/notifications.ts");
const utilsSource = read(path.join(SRC, "lib/utils.ts"));

const SAMPLE = new Date("2026-11-26T14:30:00Z");
const ORG_A = "de000000-0000-4000-8000-000000000001";

/* ═══════════════ 1. The hardcoded helpers are gone, not deprecated ═══════════════ */

await check("utils.ts no longer defines the hardcoded formatters", () => {
  for (const name of ["fmtDate", "fmtDateTime", "money"]) {
    assert.ok(!new RegExp(`export function ${name}\\(`).test(utilsSource), `${name} is still exported`);
  }
  assert.ok(!/new Intl\.NumberFormat\(|toLocaleDateString\(|toLocaleString\(/.test(utilsSource), "utils.ts still formats inline");
});

await check("utils.ts says where formatting went", () => {
  assert.match(utilsSource, /requestFormatter/);
  assert.match(utilsSource, /useFormatting/);
  assert.match(utilsSource, /src\/lib\/formatting\.ts/);
});

await check("no source file imports a formatter from @/lib/utils", () => {
  const offenders = sourceFiles.filter((file) => {
    const source = read(file);
    return /import[\s\S]{0,400}?\b(fmtDate|fmtDateTime|money)\b[\s\S]{0,400}?from\s+["']@\/lib\/utils["']/.test(source);
  }).map(rel);
  assert.deepEqual(offenders, []);
});

/* ═══════════════ 2. Every formatter is a resolved one ═══════════════ */

// The modules that DEFINE formatting are not consumers of it.
const FORMATTING_MODULES = new Set(["src/lib/formatting.ts", "src/lib/formattingRequest.ts", "src/lib/utils.ts"]);
const filesFormatting = sourceFiles.filter((file) => {
  if (FORMATTING_MODULES.has(rel(file))) return false;
  return /\bfmtDate\(|\bfmtDateTime\(|\bfmtNumber\(|\bmoney\(/.test(code(file));
});

await check("every file that formats binds a resolved formatter", () => {
  const unbound = filesFormatting.filter((file) => {
    const source = code(file);
    return !/requestFormatter\(|useFormatting\(/.test(source) && !/formatRelativeTime\(/.test(source);
  }).map(rel);
  assert.deepEqual(unbound, [], "these files format without a resolved profile");
});

await check("server files resolve, client files consume the provider", () => {
  const wrong = [];
  for (const file of sourceFiles) {
    if (FORMATTING_MODULES.has(rel(file))) continue; // these document the API in comments
    const source = code(file);
    const resolves = /requestFormatter\(|requestFormatConfig\(/.test(source);
    const consumes = /useFormatting\(/.test(source);
    if (resolves && isClient(file)) wrong.push(`${rel(file)} is a client component but resolves on the server`);
    if (consumes && !isClient(file) && !rel(file).endsWith("FormattingProvider.tsx")) {
      wrong.push(`${rel(file)} calls useFormatting() but is not a client component`);
    }
    if (resolves && consumes) wrong.push(`${rel(file)} both resolves and consumes — pick the one its runtime supports`);
  }
  assert.deepEqual(wrong, []);
});

await check("the resolver is server-only and cannot be bundled for the browser", () => {
  const source = read(path.join(SRC, "lib/formattingRequest.ts"));
  assert.match(source, /^import "server-only";/m);
  assert.match(source, /from "react"/, "per-request memoization must come from React's cache()");
  assert.ok(!isClient(path.join(SRC, "lib/formattingRequest.ts")));
});

await check("the rollout is platform-wide, not a handful of pages", () => {
  const resolving = sourceFiles.filter((f) => !FORMATTING_MODULES.has(rel(f)) && /requestFormatter\(|useFormatting\(/.test(code(f)));
  assert.ok(resolving.length >= 100, `only ${resolving.length} files bind a formatter`);
  const tenants = resolving.filter((f) => /requestFormatter\(\s*(org|organization|access\.org)/.test(code(f)));
  assert.ok(tenants.length >= 20, `only ${tenants.length} files scope to an organization`);
});

/* ═══════════════ 3. Hand-written Intl is an allowlist with reasons ═══════════════ */

const INLINE_RE = /\.toLocaleDateString\(|\.toLocaleTimeString\(|\.toLocaleString\(|new Intl\.NumberFormat\(|new Intl\.DateTimeFormat\(/;
const INLINE_ALLOWLIST = {
  "src/lib/formatting.ts": "the configured formatters themselves",
  "src/lib/i18n/index.ts": "interface-language runtime: month and weekday names for the shell, not stored data",
  "src/lib/config/validate.ts": "timezone capability probe, not presentation",
  "src/lib/notifications.ts": "import-free pure helper; the caller passes its configured formatter",
  "src/lib/mypPdf.ts": "print artifact with a fixed layout, pinned to UTC so a PDF never reflows",
  "src/components/LocalTime.tsx": "device time by design — the candidate's own clock",
  "src/app/take-exam/[attemptId]/ExamMessenger.tsx": "live examination surface: device time, never a configured zone",
  "src/app/take-exam/[attemptId]/RetakePanel.tsx": "live examination surface: device time, the server decides validity",
  "src/components/response/StructuredResponseEditor.tsx": "candidate save indicator inside a live examination",
};

await check("hand-written formatters exist only where a reason is recorded", () => {
  const found = sourceFiles.filter((f) => INLINE_RE.test(read(f))).map(rel).sort();
  const expected = Object.keys(INLINE_ALLOWLIST).sort();
  const unexplained = found.filter((f) => !expected.includes(f));
  const stale = expected.filter((f) => !found.includes(f));
  assert.deepEqual(unexplained, [], "new hardcoded formatter(s) — route them through requestFormatter/useFormatting or record a reason");
  assert.deepEqual(stale, [], "allowlist entries that no longer format inline — remove them");
});

await check("every allowlist entry states its reason in the source", () => {
  const silent = Object.keys(INLINE_ALLOWLIST).filter((file) => {
    if (file === "src/lib/formatting.ts") return false; // the module header explains itself
    const source = read(path.join(ROOT, file));
    return !/device|candidate|UTC|locale|language|import-free|print|probe|configured formatter/i.test(source);
  });
  assert.deepEqual(silent, []);
});

await check("a candidate's live examination never resolves a configured timezone", () => {
  const live = sourceFiles.filter((f) => rel(f).startsWith("src/app/take-exam/") || rel(f) === "src/components/LocalTime.tsx");
  assert.ok(live.length > 5, "the live examination surface should be present");
  const configured = live.filter((f) => /formattingRequest|FormattingProvider/.test(read(f))).map(rel);
  assert.deepEqual(configured, [], "the countdown and the candidate clock must stay on device time");
});

/* ═══════════════ 4. The providers are mounted ═══════════════ */

await check("the root layout mounts the platform-wide provider", () => {
  const source = read(path.join(SRC, "app/layout.tsx"));
  assert.match(source, /requestFormatConfig\(null\)/);
  assert.match(source, /<FormattingProvider cfg=\{formatCfg\}>/);
});

await check("the organization workspace nests its own provider", () => {
  const source = read(path.join(SRC, "app/dashboard/layout.tsx"));
  assert.match(source, /requestFormatConfig\(org\.id\)/);
  assert.match(source, /<FormattingProvider cfg=\{formatCfg\}>/);
  assert.match(source, /<\/FormattingProvider>/);
});

await check("the provider is a client component that binds a pure formatter", () => {
  const file = path.join(SRC, "components/formatting/FormattingProvider.tsx");
  assert.ok(isClient(file));
  const source = read(file);
  assert.match(source, /formatterFrom\(/);
  assert.match(source, /DEFAULT_FORMAT_CONFIG/);
  assert.ok(!/requestFormatter|formattingRequest/.test(source), "a client component must not resolve configuration itself");
});

/* ═══════════════ 5. The shipped profile reproduces the old output ═══════════════ */

await check("amounts render exactly as the hardcoded en-US money() did", () => {
  const fmt = formatting.formatterFrom(formatting.DEFAULT_FORMAT_CONFIG);
  assert.equal(fmt.money(123450, "USD"), "$1,234.50");
  assert.equal(fmt.money(19000, "USD"), "$190"); // whole amounts keep no decimals
  assert.equal(fmt.money(0, "USD"), "$0");
  assert.equal(fmt.money(99, "EUR"), "€0.99");
});

await check("dates render exactly as the hardcoded en-GB fmtDate() did", () => {
  const fmt = formatting.formatterFrom({ ...formatting.DEFAULT_FORMAT_CONFIG, timezone: "UTC" });
  assert.equal(fmt.date("2026-11-26T14:30:00Z"), "26 Nov 2026");
  assert.equal(fmt.date(null), "—");
  assert.equal(fmt.date(""), "—");
  assert.equal(fmt.date("not a date"), "—", "an unparseable value is a dash, never 'Invalid Date'");
});

await check("the configured timezone moves the rendered wall clock", () => {
  const utc = formatting.formatterFrom({ ...formatting.DEFAULT_FORMAT_CONFIG, timezone: "UTC" });
  const portoNovo = formatting.formatterFrom({ ...formatting.DEFAULT_FORMAT_CONFIG, timezone: "Africa/Porto-Novo" });
  assert.equal(utc.time(SAMPLE), "14:30");
  assert.equal(portoNovo.time(SAMPLE), "15:30");
  assert.equal(portoNovo.dateTime(SAMPLE), "26 Nov 2026, 15:30");
});

await check("a bare calendar date never shifts to another day", () => {
  // A birthday or a due date is stored as a day, not an instant. Rendering it
  // through a zone behind UTC used to be able to print the day before.
  const newYork = formatting.formatterFrom({ ...formatting.DEFAULT_FORMAT_CONFIG, timezone: "America/New_York" });
  assert.equal(newYork.date("2010-05-04"), "4 May 2010");
  assert.equal(newYork.dateTime("2010-05-04"), "4 May 2010, 00:00");
  const kiritimati = formatting.formatterFrom({ ...formatting.DEFAULT_FORMAT_CONFIG, timezone: "Pacific/Kiritimati" }); // UTC+14
  assert.equal(kiritimati.date("2010-05-04"), "4 May 2010");
  assert.equal(formatting.zoneFor("2010-05-04", kiritimati.cfg), "UTC");
  assert.equal(formatting.zoneFor("2010-05-04T00:00:00Z", kiritimati.cfg), "Pacific/Kiritimati");
});

await check("a real instant still moves with the configured zone", () => {
  const porto = formatting.formatterFrom({ ...formatting.DEFAULT_FORMAT_CONFIG, timezone: "Africa/Porto-Novo" });
  assert.equal(porto.date("2026-11-26T23:30:00Z"), "27 Nov 2026", "23:30 UTC is already the next day in Cotonou");
  assert.equal(porto.time("2026-11-26T23:30:00Z"), "00:30");
  assert.equal(porto.dateTime("2026-11-26T23:30:00Z"), "27 Nov 2026, 00:30");
  const device = formatting.formatterFrom(formatting.DEFAULT_FORMAT_CONFIG);
  assert.equal(formatting.zoneFor(SAMPLE, device.cfg), undefined, "\"device\" leaves the viewer's own zone");
});

await check("every date format renders as its option label promises", () => {
  const at = (dateFormat) => formatting.formatterFrom({ ...formatting.DEFAULT_FORMAT_CONFIG, timezone: "UTC", dateFormat });
  assert.equal(at("dmy_short").date(SAMPLE), "26 Nov 2026");
  assert.equal(at("dmy_numeric").date(SAMPLE), "26/11/2026");
  assert.equal(at("mdy_numeric").date(SAMPLE), "11/26/2026");
  assert.equal(at("iso").date(SAMPLE), "2026-11-26");
  assert.equal(at("long").date(SAMPLE), "Thursday, 26 November 2026");
});

await check("both clocks render", () => {
  const at = (timeFormat) => formatting.formatterFrom({ ...formatting.DEFAULT_FORMAT_CONFIG, timezone: "UTC", timeFormat });
  assert.equal(at("24h").time(SAMPLE), "14:30");
  assert.equal(at("12h").time(SAMPLE), "2:30 pm");
  assert.equal(at("12h").time(new Date("2026-11-26T00:05:00Z")), "12:05 am", "midnight is 12, not 0");
});

await check("an unknown configured value falls back instead of rendering garbage", () => {
  const cfg = formatting.buildFormatConfig({ date_format: "q_paren", time_format: "sundial", number_format: "klingon", default_timezone: "Mars/Olympus" });
  assert.deepEqual(cfg, { ...formatting.DEFAULT_FORMAT_CONFIG, localeTag: "en-GB" });
});

await check("the number format changes separators for marks and amounts alike", () => {
  const french = formatting.formatterFrom({ ...formatting.DEFAULT_FORMAT_CONFIG, numberFormat: "fr_fr" });
  assert.match(french.number(1234.5), /^1[\s\u202f\u00a0]234,5$/);
  assert.match(french.money(123450, "USD"), /1[\s\u202f\u00a0]234,50/);
  assert.match(french.percent(87.5), /^87,5[\s\u202f\u00a0]?%$/);
});

await check("a stored currency code Intl refuses cannot take the screen down", () => {
  const fmt = formatting.formatterFrom(formatting.DEFAULT_FORMAT_CONFIG);
  assert.equal(fmt.money(123450, "FCFA"), "1,234.5 FCFA");
  assert.equal(fmt.money(123450, null), "$1,234.50", "a missing code is the platform default");
  assert.equal(fmt.money(123450, "   "), "$1,234.50");
  assert.equal(fmt.money(Number.NaN, "USD"), "—");
  assert.ok(formatting.isCurrencyCode("xof") && !formatting.isCurrencyCode("FCFA"));
});

/* ═══════════════ 6. The resolver: scope, language and failure ═══════════════ */

await check("the shipped profile is what an unconfigured platform resolves to", async () => {
  reset();
  const fmt = await request.requestFormatter(null);
  assert.equal(fmt.cfg.dateFormat, "dmy_short");
  assert.equal(fmt.cfg.numberFormat, "en_us");
  assert.equal(fmt.cfg.timezone, "Africa/Porto-Novo", "the configured default timezone is applied, not the server's");
  assert.equal(fmt.date(SAMPLE), "26 Nov 2026");
  assert.equal(fmt.time(SAMPLE), "15:30");
});

await check("an organization override reaches the formatter", async () => {
  reset();
  overrides.formatting = { date_format: "iso", time_format: "12h", number_format: "fr_fr" };
  const fmt = await request.requestFormatter(ORG_A);
  assert.equal(fmt.date(SAMPLE), "2026-11-26");
  assert.equal(fmt.time(SAMPLE), "3:30 pm");
  assert.match(fmt.money(123450, "USD"), /1[\s\u202f\u00a0]234,50/);
  assert.deepEqual(serviceCalls.map((c) => c.organizationId), [ORG_A, ORG_A], "both namespaces were read for that organization");
});

await check("the viewer's interface language decides month names", async () => {
  reset();
  viewerLocale = "fr";
  const fmt = await request.requestFormatter(null);
  assert.equal(fmt.date(SAMPLE), "26 nov. 2026");
  assert.equal(fmt.cfg.localeTag, "fr-FR");
});

await check("a malformed scope can never widen to another tenant", async () => {
  for (const bad of ["../other-org", "de000000-0000-4000-8000-000000000001 OR 1=1", "", "null", "DE000000-0000-4000-8000-00000000000"]) {
    assert.equal(request.normalizeFormatScope(bad), null, `${bad} should not scope anything`);
  }
  reset();
  await request.requestFormatter("not-a-uuid");
  assert.deepEqual(serviceCalls.map((c) => c.organizationId), [null, null], "the service was asked for the platform-wide scope, never the raw input");
});

await check("a real scope is passed through normalized", () => {
  assert.equal(request.normalizeFormatScope(` ${ORG_A.toUpperCase()} `), ORG_A);
  assert.equal(request.normalizeFormatScope(undefined), null);
});

await check("an unreachable configuration store degrades to the shipped profile", async () => {
  reset();
  serviceThrows = true;
  const fmt = await request.requestFormatter(ORG_A);
  assert.deepEqual(fmt.cfg, formatting.DEFAULT_FORMAT_CONFIG);
  assert.equal(fmt.date(SAMPLE), "26 Nov 2026");
});

await check("the same profile is used by the server and by a hydrated client", async () => {
  reset();
  const cfg = await request.requestFormatConfig(ORG_A);
  const roundTripped = JSON.parse(JSON.stringify(cfg));
  const server = formatting.formatterFrom(cfg);
  const client = formatting.formatterFrom(roundTripped);
  for (const value of [SAMPLE, "2026-01-01T00:00:00Z", null]) {
    assert.equal(client.date(value), server.date(value));
    assert.equal(client.dateTime(value), server.dateTime(value));
  }
  assert.equal(client.money(123450, "USD"), server.money(123450, "USD"));
});

/* ═══════════════ 7. Neighbouring helpers follow the profile ═══════════════ */

await check("the notification timestamp uses the formatter it is given", () => {
  const now = Date.parse("2026-11-06T12:00:00Z");
  assert.equal(notifications.formatRelativeTime("2026-11-06T11:59:30Z", now), "just now");
  assert.equal(notifications.formatRelativeTime("2026-11-06T11:45:00Z", now), "15 min ago");
  assert.equal(notifications.formatRelativeTime("2026-10-01T12:00:00Z", now), "1 Oct 2026", "shipped fallback");
  const iso = (value) => formatting.formatDate(value, { ...formatting.DEFAULT_FORMAT_CONFIG, dateFormat: "iso", timezone: "UTC" });
  assert.equal(notifications.formatRelativeTime("2026-10-01T12:00:00Z", now, iso), "2026-10-01", "the caller's profile wins");
  assert.equal(notifications.formatRelativeTime("nonsense", now), "");
});

await check("the bell passes its workspace profile to that helper", () => {
  const source = read(path.join(SRC, "components/dashboard/NotificationBell.tsx"));
  assert.match(source, /formatRelativeTime\(item\.created_at, now, fmtDate\)/);
  assert.match(source, /const \{ date: fmtDate \} = useFormatting\(\);/);
});

await check("the configured academic year is offered where a new one is created", () => {
  // formatting.default_academic_year was declared with consumers that did not
  // read it. Both real ones are asserted here, so it cannot go inert again.
  const exam = read(path.join(SRC, "app/dashboard/exams/new/page.tsx"));
  const academics = read(path.join(SRC, "app/dashboard/academics/page.tsx"));
  assert.ok(/getFormattingConfig\(org\.id\)/.test(exam), "the new examination form does not read the formatting namespace");
  assert.ok(/defaultValue=\{formattingCfg\?\.default_academic_year \?\? ""\}/.test(exam), "the academic year field is not pre-filled from configuration");
  assert.ok(/defaultValue=\{editYear\?\.name \?\? formattingCfg\?\.default_academic_year \?\? ""\}/.test(academics), "a new academic year record is not offered the configured label");
  const schema = read(path.join(SRC, "lib/config/schema.ts"));
  assert.ok(!/consumedBy: \["src\/lib\/formatting\.ts", "src\/app\/dashboard\/paper-builder/.test(schema), "the stale consumer claim is still there");
});

await check("rounding is a configured rule, never a literal", () => {
  assert.equal(formatting.applyRounding(1.25, "half_up_1"), 1.3);
  assert.equal(formatting.applyRounding(1.25, "bankers_1"), 1.2);
  assert.equal(formatting.applyRounding(1.2345, "half_up_0"), 1);
  assert.equal(formatting.applyRounding(1.2345, "none"), 1.2345);
  assert.equal(formatting.applyRounding(Number.NaN, "half_up_1"), Number.NaN);
});

await check("the Control Center preview describes the profile it will apply", () => {
  const lines = formatting.describeFormatConfig({ ...formatting.DEFAULT_FORMAT_CONFIG, timezone: "UTC" });
  assert.equal(lines.length, 6);
  assert.ok(lines[0].includes("26 Nov 2026"));
  assert.ok(lines.some((line) => line.includes("viewer's device")) === false, "an explicit zone is named, not described as the device");
});

/* ═══════════════ report ═══════════════ */
if (failures.length) {
  console.error(`\n✗ ${failures.length} formatting rollout check(s) failed:`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`✓ configured formatting rollout — ${passed} checks passed`);
console.log(`  ${filesFormatting.length} files format values · ${Object.keys(INLINE_ALLOWLIST).length} allowlisted hand-written formatters`);
