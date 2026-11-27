// Notification wording — the event registry, the resolution order, the wire.
//
// This suite executes the REAL template layer (src/lib/notificationTemplates.ts,
// src/lib/notificationDelivery.ts, src/lib/notificationTemplateStore.ts and
// src/lib/notificationService.ts) with only the boundaries faked: the database,
// the configuration service and the entitlement read. Every assertion is about
// shipped code.
//
// What it pins down:
//
//   • the registry is internally consistent — every variable an event's shipped
//     copy uses is one the event supplies, every variable has a sample so the
//     console preview never shows a literal token, no variable can carry a
//     credential, and every event is actually sent from somewhere in src/ (a
//     registry with dead events would be a catalogue, not a feature);
//   • resolution is organization wording → EVALORA default → the copy shipped in
//     code, with the locale fallback, paused and email-only rows skipped, and
//     platform-only events unreachable from an organization row;
//   • an uncustomized deployment delivers byte-identically what the hard-coded
//     call sites used to write — the acceptance criterion the whole phase rests
//     on;
//   • delivery honours the switch that governs the RECIPIENT: a tenant that
//     turned notifications off stops receiving its own but cannot silence the
//     platform queue that verifies its payments;
//   • a saved template changes what is written to `notifications`, which is the
//     only assertion that proves the table is wired rather than decorative;
//   • the store refuses an invalid draft without touching the table, keeps one
//     wording in force per event and language, and deletes only the scope it was
//     asked to delete;
//   • the two consoles authorize differently and the organization one derives
//     its scope from the session, never from a posted field.
import "./__platform_config_stubs.mjs";

import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { readdirSync } from "node:fs";
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
        (e) => { failures.push(`${label}: ${e?.message ?? e}`); },
      );
    }
    passed += 1;
  } catch (error) {
    failures.push(`${label}: ${error?.message ?? error}`);
  }
  return undefined;
}

/* ───────────────────────── source loader ─────────────────────────
 * Same loader the other source-executing suites use: `@/…` and relative
 * specifiers resolve to real files under src/, anything registered in `fakes`
 * is returned instead of the real module, everything else falls through to the
 * shared harness shim.
 */
const fakes = new Map();
const loaded = new Map();
const EXTENSIONS = [".ts", ".tsx", "/index.ts", "/index.tsx"];

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
const src = (rel) => path.join(ROOT, rel);
const read = (rel) => readFileSync(src(rel), "utf8");
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

/* ───────────────────────── in-memory database ───────────────────────── */
const db = {
  notification_templates: [],
  notifications: [],
  organizations: [],
};
let selectFails = false;
let insertFails = null; // string message → the write reports this error
const queries = [];

function matches(row, filters) {
  return filters.every(({ column, op, value }) => {
    if (op === "eq") return String(row[column]) === String(value);
    if (op === "neq") return String(row[column]) !== String(value);
    if (op === "in") return value.includes(row[column]);
    if (op === "is") return value === null ? row[column] == null : row[column] === value;
    return true;
  });
}

async function runSelect(table, state) {
  queries.push({ table, op: "select", state: JSON.parse(JSON.stringify({ ...state, or: state.or ?? null })) });
  if (selectFails) throw new Error('relation "public.notification_templates" does not exist');
  let rows = (db[table] ?? []).filter((row) => matches(row, state.filters));
  if (state.or) {
    // `organization_id.eq.<uuid>,organization_id.is.null`
    const parts = String(state.or).split(",").map((part) => part.trim());
    const eq = parts.find((part) => part.startsWith("organization_id.eq."));
    const isNull = parts.some((part) => part === "organization_id.is.null");
    const wanted = eq ? eq.slice("organization_id.eq.".length) : null;
    rows = rows.filter((row) => (wanted && String(row.organization_id) === wanted) || (isNull && row.organization_id == null));
  }
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
          (error) =>
            onRejected
              ? onRejected(error)
              : onFulfilled
                ? onFulfilled({ data: null, error: { message: error.message } })
                : undefined,
        ),
  });

  const api = {
    select: () => api,
    eq: (column, value) => chain(table, { ...state, filters: [...state.filters, { column, op: "eq", value }] }),
    neq: (column, value) => chain(table, { ...state, filters: [...state.filters, { column, op: "neq", value }] }),
    in: (column, value) => chain(table, { ...state, filters: [...state.filters, { column, op: "in", value }] }),
    is: (column, value) => chain(table, { ...state, filters: [...state.filters, { column, op: "is", value }] }),
    or: (expression) => chain(table, { ...state, or: expression }),
    order: () => api,
    limit: (n) => chain(table, { ...state, limit: n }),
    range: () => api,
    maybeSingle: async () => {
      try {
        const rows = await runSelect(table, state);
        return { data: rows[0] ?? null, error: null };
      } catch (error) {
        return { data: null, error: { message: error.message } };
      }
    },
    single: async () => {
      try {
        const rows = await runSelect(table, state);
        return rows.length ? { data: rows[0], error: null } : { data: null, error: { message: "no rows" } };
      } catch (error) {
        return { data: null, error: { message: error.message } };
      }
    },
    /**
     * `.insert(…)` is awaited directly by the delivery layer and chained into
     * `.select("id").maybeSingle()` by the store, so it has to be both a
     * thenable and a builder.
     */
    insert: (payload) => {
      const work = async () => {
        queries.push({ table, op: "insert", rows: Array.isArray(payload) ? payload.length : 1 });
        if (insertFails) throw new Error(insertFails);
        if (selectFails) throw new Error("database unreachable");
        const entries = Array.isArray(payload) ? payload : [payload];
        const stored = entries.map((entry) => ({ id: randomUUID(), created_at: new Date().toISOString(), ...entry }));
        for (const row of stored) db[table].push(row);
        return stored;
      };
      const failed = (error, onFulfilled, onRejected) =>
        onRejected ? onRejected(error) : onFulfilled ? onFulfilled({ data: null, error: { message: error.message } }) : undefined;
      return {
        select: () => ({
          maybeSingle: async () => {
            try {
              const stored = await work();
              return { data: stored[0] ?? null, error: null };
            } catch (error) {
              return { data: null, error: { message: error.message } };
            }
          },
          single: async () => {
            try {
              const stored = await work();
              return stored.length ? { data: stored[0], error: null } : { data: null, error: { message: "no rows" } };
            } catch (error) {
              return { data: null, error: { message: error.message } };
            }
          },
        }),
        then: (onFulfilled, onRejected) =>
          Promise.resolve()
            .then(work)
            .then(
              (stored) => (onFulfilled ? onFulfilled({ data: stored, error: null, count: stored.length }) : undefined),
              (error) => failed(error, onFulfilled, onRejected),
            ),
      };
    },
    // `.update(payload).eq(…).eq(…)` — filters keep accumulating after the
    // payload, so this is a chain, and the terminal await performs the update.
    update: (payload) => chain(table, { ...state, mode: "update", payload }),
    delete: () => chain(table, { ...state, mode: "delete" }),
    ...settle(
      state.mode === "update"
        ? async () => {
            queries.push({ table, op: "update", state: JSON.parse(JSON.stringify({ ...state, or: state.or ?? null })) });
            if (selectFails) throw new Error("database unreachable");
            const hit = db[table].filter((row) => matches(row, state.filters));
            hit.forEach((row) => Object.assign(row, state.payload));
            return hit.map((row) => ({ ...row }));
          }
        : state.mode === "delete"
        ? async () => {
            queries.push({ table, op: "delete", state: JSON.parse(JSON.stringify({ ...state, or: state.or ?? null })) });
            if (selectFails) throw new Error("database unreachable");
            const before = db[table].length;
            db[table] = db[table].filter((row) => !matches(row, state.filters));
            return new Array(before - db[table].length).fill(null);
          }
        : () => runSelect(table, state),
    ),
  };
  return api;
}

const fakeDb = {
  from: (table) => {
    if (!(table in db)) db[table] = [];
    return chain(table, { filters: [], or: null, limit: null, mode: null, selectAfterInsert: false });
  },
};

/* ───────────────────────── faked boundaries ───────────────────────── */
const configState = {
  in_app_enabled: true,
  in_app_enabled_platform: true,
  sender_name: "EVALORA",
  email_delivery_available: false,
  default_locale: "en",
};
fakes.set(src("src/lib/config/service.ts"), {
  getNotificationsConfig: async (organizationId) => ({
    in_app_enabled: organizationId ? configState.in_app_enabled : configState.in_app_enabled_platform,
    sender_name: configState.sender_name,
    email_delivery_available: configState.email_delivery_available,
  }),
  getLocalizationConfig: async () => ({
    default_locale: configState.default_locale,
    supported_locales: ["en", "fr", "es"],
    default_timezone: "UTC",
  }),
});

const entitlementState = { modules: { platform: true } };
fakes.set(src("src/lib/entitlements.ts"), {
  getEntitlement: async () => ({
    planName: "Institution",
    planSlug: "institution",
    status: "active",
    source: "plan",
    limits: {},
    modules: entitlementState.modules,
    moduleOverrides: {},
    currentPeriodEnd: null,
    trialEndsAt: null,
  }),
});

fakes.set(src("src/lib/supabase/server.ts"), {
  createAdminClient: () => fakeDb,
  createClient: async () => fakeDb,
});

/* ───────────────────────── the modules under test ───────────────────────── */
const templates = load("src/lib/notificationTemplates.ts");
const service = load("src/lib/notificationService.ts");
const delivery = load("src/lib/notificationDelivery.ts");
const store = load("src/lib/notificationTemplateStore.ts");

const EVENTS = templates.NOTIFICATION_EVENTS;
const eventKey = (key) => EVENTS.find((event) => event.key === key);
const ORG = "de000000-0000-4000-8000-000000000001";
const OTHER_ORG = "0a400000-0000-4000-8000-000000000001";
const USER = "11111111-1111-4111-8111-111111111111";

function resetDb() {
  db.notification_templates.length = 0;
  db.notifications.length = 0;
  db.organizations.length = 0;
  queries.length = 0;
  selectFails = false;
  insertFails = null;
  configState.in_app_enabled = true;
  configState.in_app_enabled_platform = true;
  configState.sender_name = "EVALORA";
  configState.default_locale = "en";
  entitlementState.modules = { platform: true };
}

function template(overrides) {
  return {
    id: randomUUID(),
    organization_id: null,
    event_key: "payment_submitted",
    channel: "in_app",
    title: "A saved title",
    body: "A saved body",
    locale: "en",
    variables: [],
    is_active: true,
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

/* ═══════════════════════════ the registry ═══════════════════════════ */

await check("every event is a unique, stable snake_case key", () => {
  const keys = EVENTS.map((event) => event.key);
  assert.equal(new Set(keys).size, keys.length, "event keys must be unique");
  for (const key of keys) {
    assert.match(key, /^[a-z][a-z0-9_]*$/, `${key} must be a stable snake_case key`);
    assert.ok(key.length <= 60, `${key} is too long to be a stable key`);
  }
  assert.deepEqual([...templates.NOTIFICATION_EVENT_KEYS].sort(), [...keys].sort());
});

await check("every event declares who it reaches and what it writes", () => {
  for (const event of EVENTS) {
    assert.ok(event.label && event.label.length > 3, `${event.key} needs a label an administrator recognises`);
    assert.ok(event.description && event.description.length > 20, `${event.key} needs to say when it fires`);
    assert.ok(["subject_user", "organization_admins", "platform_admins"].includes(event.audience), event.key);
    assert.ok(event.audienceLabel, `${event.key} needs a plain-language audience`);
    assert.ok(["organization", "platform"].includes(event.templateScope), event.key);
    assert.ok(["organization", "platform"].includes(event.deliveryGate), event.key);
    assert.ok(event.type, `${event.key} needs the notifications.type value it writes`);
    assert.ok(event.title.trim() && event.body.trim(), `${event.key} needs shipped copy`);
    assert.ok(event.link.startsWith("/"), `${event.key} must lead somewhere inside EVALORA`);
    assert.ok(
      event.title.length <= templates.NOTIFICATION_TITLE_MAX,
      `${event.key}'s shipped title exceeds the limit the console enforces`,
    );
    assert.ok(
      event.body.length <= templates.NOTIFICATION_BODY_MAX,
      `${event.key}'s shipped message exceeds the limit the console enforces`,
    );
  }
});

await check("a platform-recipient event is never gated on a tenant's switch", () => {
  for (const event of EVENTS) {
    if (event.audience === "platform_admins") {
      assert.equal(
        event.deliveryGate,
        "platform",
        `${event.key} reaches platform administrators, so one tenant's switch must not silence it`,
      );
    }
  }
  // An event whose wording is not a tenant's to choose is not gated on a tenant
  // either: the platform-security messages have no organization behind them.
  for (const event of EVENTS) {
    if (event.templateScope === "platform") {
      assert.equal(event.deliveryGate, "platform", `${event.key} has no tenant, so no tenant switch applies`);
    }
    if (event.deliveryGate === "organization") {
      assert.notEqual(
        event.audience,
        "platform_admins",
        `${event.key} reaches platform administrators, so a tenant must not be able to gate it`,
      );
    }
  }
});

await check("every variable an event declares is a registered, non-sensitive value", () => {
  const registered = new Set(templates.NOTIFICATION_VARIABLES.map((variable) => variable.name));
  const forbidden = ["password", "secret", "token", "api_key", "apikey", "credential", "access_token", "hash", "proof"];
  for (const variable of templates.NOTIFICATION_VARIABLES) {
    assert.match(variable.name, /^[a-z_]+$/, `${variable.name} must match the renderer's token grammar`);
    assert.equal(variable.token, `{{${variable.name}}}`);
    assert.ok(variable.label && variable.source && variable.example !== undefined, variable.name);
    for (const word of forbidden) {
      assert.ok(
        !variable.name.toLowerCase().includes(word),
        `${variable.name} looks like it could carry a ${word} — no secret is ever a template variable`,
      );
    }
  }
  for (const event of EVENTS) {
    for (const name of event.variables) {
      assert.ok(registered.has(name), `${event.key} declares {{${name}}}, which is not a registered variable`);
    }
  }
});

await check("the shipped copy only uses variables the event supplies", () => {
  for (const event of EVENTS) {
    const used = templates.extractTemplateVariables(event.title, event.body, event.link);
    for (const name of used) {
      assert.ok(
        event.variables.includes(name),
        `${event.key}'s shipped copy uses {{${name}}} but the event does not declare it — a recipient would read the token`,
      );
    }
  }
});

await check("every declared variable has a sample, so no preview shows a token", () => {
  for (const event of EVENTS) {
    for (const name of event.variables) {
      assert.ok(
        Object.prototype.hasOwnProperty.call(event.sample, name),
        `${event.key} declares {{${name}}} without a sample value`,
      );
      assert.equal(typeof event.sample[name], "string", `${event.key}'s sample for ${name} must be text`);
    }
    const preview = templates.previewTemplate(event.key, event.title, event.body, event.sample);
    assert.ok(!preview.title.includes("{{"), `${event.key}'s preview title still shows a token`);
    assert.ok(!preview.body.includes("{{"), `${event.key}'s preview message still shows a token`);
  }
});

await check("every event link renders to a safe internal path", () => {
  for (const event of EVENTS) {
    const link = templates.renderNotificationLink(event.key, event.sample);
    assert.ok(link, `${event.key}'s destination must survive rendering`);
    assert.equal(templates.safeNotificationLink(link), link, `${event.key} renders to an unsafe destination`);
    assert.ok(!link.includes("{{"), `${event.key}'s destination still holds a token after rendering`);
  }
  assert.equal(templates.renderNotificationLink("not_an_event"), null);
});

await check("the locale list mirrors the configuration schema's supported languages", () => {
  const schema = load("src/lib/config/schema.ts");
  assert.deepEqual(
    templates.NOTIFICATION_TEMPLATE_LOCALES.map((locale) => locale.value),
    schema.SUPPORTED_LOCALE_OPTIONS.map((locale) => locale.value),
    "a template must not offer a language the interface does not have",
  );
  assert.deepEqual(
    templates.NOTIFICATION_CHANNELS.map((channel) => channel.value),
    ["in_app", "both", "email"],
    "the channel list must match the table's check constraint",
  );
});

await check("every event in the registry is actually sent from somewhere in src/", () => {
  // A registry nobody fires would be a catalogue. Only files that deliver count,
  // and the delivery layer itself does not: it sends whatever it is given.
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name)) files.push(full);
    }
  };
  walk(src("src"));
  const senders = files
    .map((file) => path.relative(ROOT, file))
    .filter((rel) => rel !== "src/lib/notificationDelivery.ts")
    .filter((rel) => /sendNotification\(/.test(read(rel)));
  assert.ok(senders.length >= 8, `expected the call sites to be wired, found ${senders.length}`);
  const corpus = senders.map((rel) => read(rel)).join("\n");
  for (const event of EVENTS) {
    assert.ok(
      corpus.includes(`"${event.key}"`),
      `${event.key} is declared but no call site sends it — a dead event would be a placeholder`,
    );
  }
});

await check("no hard-coded notification insert survives outside the delivery layer", () => {
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name)) files.push(path.relative(ROOT, full));
    }
  };
  walk(src("src"));
  const allowed = new Set([
    // The delivery layer is the writer.
    "src/lib/notificationDelivery.ts",
    // A test delivers one notification to the person editing.
    "src/lib/notificationTemplateStore.ts",
    // Announcements composed by an administrator at send time — deliberately not
    // templates, and the console says so.
    "src/app/admin/actions.ts",
  ]);
  const offenders = files.filter(
    (rel) => !allowed.has(rel) && /\.from\("notifications"\)\s*\.insert\(/.test(read(rel)),
  );
  assert.deepEqual(offenders, [], `these files still write notifications directly: ${offenders.join(", ")}`);
});

await check("the notification service still exports the registry contract", () => {
  assert.equal(typeof service.renderNotificationTemplate, "function");
  assert.ok(Array.isArray(service.NOTIFICATION_TEMPLATE_VARIABLES));
  assert.ok(service.NOTIFICATION_TEMPLATE_VARIABLES.length >= 8);
  assert.equal(typeof service.notificationsEnabledFor, "function");
  assert.equal(typeof service.notificationCapabilityReport, "function");
  // The renderer is one implementation, shared — not a second copy in the
  // service that could drift from the one the console previews with.
  assert.equal(
    service.renderNotificationTemplate("Hi {{candidate_name}}", { candidate_name: "Aïcha" }),
    templates.renderNotificationTemplate("Hi {{candidate_name}}", { candidate_name: "Aïcha" }),
  );
  assert.equal(service.renderNotificationTemplate, templates.renderNotificationTemplate);
});

/* ═══════════════════════════ rendering ═══════════════════════════ */

await check("rendering substitutes known tokens and leaves unknown ones visible", () => {
  const rendered = templates.renderNotificationTemplate(
    "Hello {{candidate_name}}, code {{ access_code }}, unknown {{not_registered}}.",
    { candidate_name: "Aïcha", access_code: "K7Q2M9" },
  );
  assert.match(rendered, /Aïcha/);
  assert.match(rendered, /K7Q2M9/);
  assert.match(rendered, /\{\{not_registered\}\}/, "an unknown token stays visible so the author sees the mistake");
  assert.equal(templates.renderNotificationTemplate("", { a: 1 }), "");
  assert.equal(templates.renderNotificationTemplate("Nothing here", {}), "Nothing here");
});

await check("rendering strips control characters and caps a value's length", () => {
  const rendered = templates.renderNotificationTemplate("{{body}}", { body: `line\u0000one\ntwo${"x".repeat(3000)}` });
  assert.ok(!rendered.includes("\u0000"), "a NUL must not survive into a notification");
  assert.ok(!rendered.includes("\n"), "a newline must not survive into a notification");
  assert.ok(rendered.length <= 2000, "a value is capped so one variable cannot flood a row");
  assert.equal(templates.renderNotificationTemplate("{{missing}}", { missing: null }), "");
});

await check("extractTemplateVariables dedupes, lowercases and sorts", () => {
  assert.deepEqual(
    templates.extractTemplateVariables("{{B}} {{ a }} {{b}}", null, undefined, "{{C}}"),
    ["a", "b", "c"],
  );
  assert.deepEqual(templates.extractTemplateVariables("no tokens"), []);
});

await check("a destination must stay inside EVALORA", () => {
  assert.equal(templates.safeNotificationLink("/dashboard/billing"), "/dashboard/billing");
  assert.equal(templates.safeNotificationLink("/retake/abc-123"), "/retake/abc-123");
  assert.equal(templates.safeNotificationLink("//evil.example/x"), null, "a protocol-relative URL is an exit");
  assert.equal(templates.safeNotificationLink("https://evil.example/x"), null, "an absolute URL is an exit");
  assert.equal(templates.safeNotificationLink("dashboard"), null, "a relative path is ambiguous");
  assert.equal(templates.safeNotificationLink("/dash board"), null);
  assert.equal(templates.safeNotificationLink("/back\\slash"), null);
  assert.equal(templates.safeNotificationLink(""), null);
  assert.equal(templates.safeNotificationLink(`/${"a".repeat(400)}`), null);
});

/* ═══════════════════════════ resolution ═══════════════════════════ */

await check("with nothing saved, the copy shipped in code is delivered verbatim", () => {
  for (const event of EVENTS) {
    const resolved = templates.resolveTemplate([], event.key, { organizationId: ORG, locale: "en" });
    assert.equal(resolved.provenance, "built_in", event.key);
    assert.equal(resolved.title, event.title, `${event.key}'s title must be byte-identical to the shipped copy`);
    assert.equal(resolved.body, event.body, `${event.key}'s message must be byte-identical to the shipped copy`);
    assert.equal(resolved.link, event.link, event.key);
    assert.equal(resolved.type, event.type, event.key);
    assert.equal(resolved.isCustomized, false, event.key);
    assert.equal(resolved.templateId, null, event.key);
  }
});

await check("an organization's wording beats the EVALORA default", () => {
  const rows = [
    template({ organization_id: null, event_key: "payment_refunded", title: "Platform title", body: "Platform body" }),
    template({ organization_id: ORG, event_key: "payment_refunded", title: "Org title", body: "Org body {{amount}}" }),
  ];
  const resolved = templates.resolveTemplate(rows, "payment_refunded", { organizationId: ORG });
  assert.equal(resolved.provenance, "organization");
  assert.equal(resolved.title, "Org title");
  assert.equal(resolved.body, "Org body {{amount}}");
  assert.equal(resolved.isCustomized, true);

  const other = templates.resolveTemplate(rows, "payment_refunded", { organizationId: OTHER_ORG });
  assert.equal(other.provenance, "platform", "another organization must get the default, not its neighbour's wording");
  assert.equal(other.title, "Platform title");

  const none = templates.resolveTemplate(rows, "payment_refunded", { organizationId: null });
  assert.equal(none.provenance, "platform");
});

await check("a paused or unusable row is skipped, not delivered", () => {
  const rows = [
    template({ organization_id: ORG, event_key: "account_created", is_active: false, title: "Paused" }),
    template({ organization_id: null, event_key: "account_created", title: "Default wording", body: "Default body" }),
  ];
  const resolved = templates.resolveTemplate(rows, "account_created", { organizationId: ORG });
  assert.equal(resolved.provenance, "platform", "a paused template hands delivery back");
  assert.equal(resolved.title, "Default wording");
});

await check("an email-only template is the wording in force, and its channel is reported", () => {
  // The channel is part of the answer rather than a filter on it: "email only"
  // is a choice an author made, so the console shows that wording as in force
  // and delivery reports that nothing went out — instead of quietly substituting
  // copy the author explicitly did not ask for.
  const rows = [
    template({ organization_id: ORG, event_key: "account_created", channel: "email", title: "Email only", body: "Mail body" }),
  ];
  const resolved = templates.resolveTemplate(rows, "account_created", { organizationId: ORG });
  assert.equal(resolved.provenance, "organization");
  assert.equal(resolved.channel, "email");
  assert.equal(resolved.title, "Email only");

  const both = templates.resolveTemplate(
    [template({ organization_id: ORG, event_key: "account_created", channel: "both", title: "Both channels", body: "b" })],
    "account_created",
    { organizationId: ORG },
  );
  assert.equal(both.provenance, "organization", "`both` still delivers in-app");
  assert.equal(both.channel, "both");

  const unknownChannel = templates.resolveTemplate(
    [template({ organization_id: ORG, event_key: "account_created", channel: "sms", title: "Odd channel", body: "b" })],
    "account_created",
    { organizationId: ORG },
  );
  assert.equal(unknownChannel.channel, "in_app", "a channel outside the table's constraint is read as in-app, never trusted");
});

await check("a row with empty copy is skipped rather than blanking a notification", () => {
  const rows = [template({ organization_id: ORG, event_key: "account_created", title: "   ", body: "" })];
  const resolved = templates.resolveTemplate(rows, "account_created", { organizationId: ORG });
  assert.equal(resolved.provenance, "built_in");
});

await check("the language falls back to English, then to the shipped copy", () => {
  const rows = [
    template({ organization_id: ORG, event_key: "account_created", locale: "en", title: "English wording" }),
    template({ organization_id: ORG, event_key: "account_created", locale: "fr", title: "Formulation française" }),
  ];
  assert.equal(templates.resolveTemplate(rows, "account_created", { organizationId: ORG, locale: "fr" }).title, "Formulation française");
  assert.equal(templates.resolveTemplate(rows, "account_created", { organizationId: ORG, locale: "es" }).title, "English wording");
  assert.equal(
    templates.resolveTemplate(
      [template({ organization_id: ORG, event_key: "account_created", locale: "en", title: "English wording" })],
      "account_created",
      { organizationId: ORG, locale: "fr" },
    ).title,
    "English wording",
  );
  // A French platform default is used before an English one only when the
  // organization has nothing of its own.
  assert.equal(
    templates.resolveTemplate(
      [template({ organization_id: null, event_key: "account_created", locale: "fr", title: "Plateforme française" })],
      "account_created",
      { organizationId: ORG, locale: "fr" },
    ).title,
    "Plateforme française",
  );
});

await check("a platform-only event cannot be rewritten by an organization row", () => {
  const event = EVENTS.find((candidate) => candidate.templateScope === "platform");
  assert.ok(event, "the registry must keep at least one platform-scoped event");
  const rows = [template({ organization_id: ORG, event_key: event.key, title: "A tenant rewrote a platform message" })];
  const resolved = templates.resolveTemplate(rows, event.key, { organizationId: ORG });
  assert.equal(resolved.provenance, "built_in", `${event.key} is not about one tenant's wording`);
  assert.equal(resolved.title, event.title);
});

await check("an unknown event resolves to nothing at all", () => {
  assert.equal(templates.resolveTemplate([], "invented_event", {}), null);
  assert.equal(templates.notificationEvent("invented_event"), undefined);
  assert.equal(templates.isNotificationEventKey("invented_event"), false);
  assert.equal(templates.isNotificationEventKey("payment_submitted"), true);
  assert.equal(templates.resolveAllTemplates([], { organizationId: ORG }).length, EVENTS.length);
});

await check("validation refuses what would reach a recipient broken", () => {
  const unknownEvent = templates.validateTemplateDraft({ event_key: "invented", title: "x", body: "y" });
  assert.equal(unknownEvent.ok, false);
  assert.equal(unknownEvent.code, "unknown_event");

  const noTitle = templates.validateTemplateDraft({ event_key: "account_created", title: "  ", body: "Hello" });
  assert.equal(noTitle.code, "title");
  const noBody = templates.validateTemplateDraft({ event_key: "account_created", title: "Hello", body: "" });
  assert.equal(noBody.code, "body");

  const longTitle = templates.validateTemplateDraft({
    event_key: "account_created",
    title: "t".repeat(templates.NOTIFICATION_TITLE_MAX + 1),
    body: "Hello",
  });
  assert.equal(longTitle.code, "title_long");
  assert.match(longTitle.message, /160/);

  const longBody = templates.validateTemplateDraft({
    event_key: "account_created",
    title: "Hello",
    body: "b".repeat(templates.NOTIFICATION_BODY_MAX + 1),
  });
  assert.equal(longBody.code, "body_long");

  const badChannel = templates.validateTemplateDraft({
    event_key: "account_created",
    title: "Hello",
    body: "Hello",
    channel: "sms",
  });
  assert.equal(badChannel.code, "channel");

  const badLocale = templates.validateTemplateDraft({
    event_key: "account_created",
    title: "Hello",
    body: "Hello",
    locale: "de",
  });
  assert.equal(badLocale.code, "locale");
  assert.match(badLocale.message, /en, fr, es/);
});

await check("validation refuses a variable the event does not supply, and says which", () => {
  const result = templates.validateTemplateDraft({
    event_key: "payment_refunded",
    title: "Refund for {{candidate_name}}",
    body: "We refunded {{amount}}.",
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "unknown_variable");
  assert.match(result.message, /\{\{candidate_name\}\}/, "the refusal names the token the author typed");
  assert.match(result.message, /\{\{amount\}\}/, "and lists what the event does supply");

  // An event with no variables refuses any token at all.
  const noVariables = templates.validateTemplateDraft({
    event_key: "subscription_updated",
    title: "Changed {{plan_name}}",
    body: "Your plan changed.",
  });
  assert.equal(noVariables.code, "unknown_variable");
  assert.match(noVariables.message, /supplies no variables/);
});

await check("a valid draft is normalized, its variables recorded and its preview rendered", () => {
  const result = templates.validateTemplateDraft({
    event_key: "payment_submitted",
    title: "  Payment from {{organization_name}}  ",
    body: "Hello — {{plan_name}} ({{billing_period}}), reference {{transaction_ref}}.\u0000",
    channel: "both",
    locale: "fr",
    is_active: true,
  });
  assert.equal(result.ok, true);
  assert.equal(result.title, "Payment from {{organization_name}}", "whitespace is trimmed");
  assert.ok(!result.body.includes("\u0000"), "control characters are stripped before anything is stored");
  assert.deepEqual(result.variables, ["billing_period", "organization_name", "plan_name", "transaction_ref"]);
  assert.equal(result.channel, "both");
  assert.equal(result.locale, "fr");
  assert.equal(result.isActive, true);
  assert.equal(result.emailOnly, false);
  assert.equal(result.preview.title, "Payment from Oak International School");
  assert.match(result.preview.body, /Institution \(yearly\), reference TRX-88213/);

  const paused = templates.validateTemplateDraft({
    event_key: "payment_submitted",
    title: "x",
    body: "y",
    is_active: false,
  });
  assert.equal(paused.ok, true);
  assert.equal(paused.isActive, false, "an author can store wording without putting it in force");

  const emailOnly = templates.validateTemplateDraft({
    event_key: "payment_submitted",
    title: "x",
    body: "y",
    channel: "email",
  });
  assert.equal(emailOnly.emailOnly, true);
});

/* ═══════════════════════════ delivery ═══════════════════════════ */

await check("an uncustomized deployment writes exactly what the call sites used to write", async () => {
  resetDb();
  db.organizations.push({ id: ORG, name: "Oak International School" });
  const result = await delivery.sendNotification(fakeDb, {
    event: "payment_submitted",
    organizationId: ORG,
    userIds: [USER],
    values: { plan_name: "Institution", billing_period: "yearly", transaction_ref: "TRX-88213" },
  });
  assert.equal(result.delivered, 1);
  assert.equal(result.skipped, null);
  assert.equal(result.provenance, "built_in");
  assert.equal(db.notifications.length, 1);
  const row = db.notifications[0];
  assert.equal(row.user_id, USER);
  assert.equal(row.type, "payment");
  assert.equal(row.title, "New payment to review");
  assert.equal(
    row.body,
    "Oak International School submitted a Institution (yearly) payment: TRX-88213",
    "byte-identical to the string the billing action used to build by hand",
  );
  assert.equal(row.link, "/admin/payments");
});

await check("a saved template changes what a recipient actually receives", async () => {
  resetDb();
  db.organizations.push({ id: ORG, name: "Oak International School" });
  db.notification_templates.push(
    template({
      organization_id: ORG,
      event_key: "payment_submitted",
      title: "Paiement de {{organization_name}} à vérifier",
      body: "Référence {{transaction_ref}} — {{sender_name}}",
      locale: "en",
    }),
  );
  const result = await delivery.sendNotification(fakeDb, {
    event: "payment_submitted",
    organizationId: ORG,
    userIds: [USER],
    values: { transaction_ref: "TRX-1" },
  });
  assert.equal(result.delivered, 1);
  assert.equal(result.provenance, "organization");
  assert.ok(result.templateId, "the delivered row reports which template produced it");
  assert.equal(db.notifications[0].title, "Paiement de Oak International School à vérifier");
  assert.equal(db.notifications[0].body, "Référence TRX-1 — EVALORA");
});

await check("an organization with no wording of its own gets the EVALORA default", async () => {
  resetDb();
  db.organizations.push({ id: ORG, name: "Oak International School" });
  db.notification_templates.push(
    template({ organization_id: null, event_key: "payment_refunded", title: "Refund notice", body: "We refunded {{amount}}." }),
  );
  await delivery.sendNotification(fakeDb, {
    event: "payment_refunded",
    organizationId: ORG,
    userIds: [USER],
    values: { amount: "US$19.00" },
  });
  assert.equal(db.notifications[0].title, "Refund notice");
  assert.equal(db.notifications[0].body, "We refunded US$19.00.");
});

await check("a tenant that switched notifications off stops receiving its own", async () => {
  resetDb();
  db.organizations.push({ id: ORG, name: "Oak International School" });
  configState.in_app_enabled = false;
  const result = await delivery.sendNotification(fakeDb, {
    event: "payment_refunded",
    organizationId: ORG,
    userIds: [USER],
    values: { amount: "US$19.00" },
  });
  assert.equal(result.delivered, 0);
  assert.equal(result.skipped, "notifications_disabled");
  assert.equal(db.notifications.length, 0, "nothing is written behind a hidden bell");
});

await check("…but cannot silence the platform queue that verifies its payment", async () => {
  resetDb();
  db.organizations.push({ id: ORG, name: "Oak International School" });
  configState.in_app_enabled = false;
  const result = await delivery.sendNotification(fakeDb, {
    event: "payment_submitted",
    organizationId: ORG,
    userIds: [USER],
    values: { plan_name: "Institution", billing_period: "monthly", transaction_ref: "TRX-9" },
  });
  assert.equal(result.delivered, 1, "a platform-recipient event answers to the platform switch only");
  assert.equal(result.skipped, null);

  configState.in_app_enabled_platform = false;
  const silenced = await delivery.sendNotification(fakeDb, {
    event: "payment_submitted",
    organizationId: ORG,
    userIds: [USER],
    values: { plan_name: "Institution", billing_period: "monthly", transaction_ref: "TRX-9" },
  });
  assert.equal(silenced.delivered, 0);
  assert.equal(silenced.skipped, "notifications_disabled");
});

await check("delivery follows the switch, while the module keeps gating the surfaces", async () => {
  resetDb();
  db.organizations.push({ id: ORG, name: "Oak International School" });
  // A plan that excludes the `platform` module already hides the bell and the
  // notifications page — that gate is unchanged and still fails closed.
  entitlementState.modules = { platform: false };
  assert.equal(await service.notificationsEnabledFor(ORG), false, "the surfaces stay module-gated");

  // Delivery itself answers to the configured switch, not to the module, so a
  // live tenant does not stop receiving notifications it receives today just
  // because wording became editable.
  const stillDelivered = await delivery.sendNotification(fakeDb, {
    event: "organization_member_added",
    organizationId: ORG,
    userIds: [USER],
    values: { member_role: "teacher" },
  });
  assert.equal(stillDelivered.delivered, 1);
  assert.equal(stillDelivered.skipped, null);
  assert.equal(db.notifications[0].body, "An EVALORA administrator added you as teacher. Open your dashboard to get started.");

  entitlementState.modules = { platform: true };
  assert.equal(await service.notificationsEnabledFor(ORG), true, "with the module and the switch on, the surfaces are back");
});

await check("delivery reports rather than guesses when there is nobody or nothing", async () => {
  resetDb();
  assert.equal((await delivery.sendNotification(fakeDb, { event: "invented", userIds: [USER] })).skipped, "unknown_event");
  assert.equal((await delivery.sendNotification(fakeDb, { event: "payment_refunded", userIds: [] })).skipped, "no_recipients");
  assert.equal(
    (await delivery.sendNotification(fakeDb, { event: "payment_refunded", userIds: ["", "  "] })).skipped,
    "no_recipients",
  );
  assert.equal(db.notifications.length, 0, "none of those wrote a row");
});

await check("duplicate recipients collapse into one notification each", async () => {
  resetDb();
  const result = await delivery.sendNotification(fakeDb, {
    event: "payment_refunded",
    organizationId: ORG,
    userIds: [USER, USER, USER],
    values: { amount: "US$19.00" },
  });
  assert.equal(result.delivered, 1);
  assert.equal(db.notifications.length, 1, "nobody receives the same message three times");
});

await check("an email-only template delivers nothing and says so", async () => {
  resetDb();
  db.notification_templates.push(
    template({ organization_id: null, event_key: "payment_refunded", channel: "email", title: "Mail only", body: "b" }),
  );
  const result = await delivery.sendNotification(fakeDb, {
    event: "payment_refunded",
    organizationId: ORG,
    userIds: [USER],
    values: { amount: "US$19.00" },
  });
  assert.equal(result.delivered, 0);
  assert.equal(result.skipped, "email_only_template", "reported, not quietly replaced by the shipped copy");
  assert.equal(db.notifications.length, 0);
});

await check("a failed write never breaks the operation that caused it", async () => {
  resetDb();
  insertFails = "duplicate key value violates unique constraint";
  const result = await delivery.sendNotification(fakeDb, {
    event: "payment_refunded",
    organizationId: ORG,
    userIds: [USER],
    values: { amount: "US$19.00" },
  });
  assert.equal(result.delivered, 0);
  assert.equal(result.skipped, "insert_failed");
  assert.match(result.error, /duplicate key/);

  insertFails = null;
  selectFails = true;
  const unreadable = await delivery.sendNotification(fakeDb, {
    event: "payment_refunded",
    organizationId: ORG,
    userIds: [USER],
    values: { amount: "US$19.00" },
  });
  assert.equal(unreadable.delivered, 0, "with the database unreachable nothing can be written");
  assert.equal(unreadable.skipped, "insert_failed");
  selectFails = false;
});

await check("an unreachable template store still delivers the shipped copy", async () => {
  resetDb();
  db.organizations.push({ id: ORG, name: "Oak International School" });
  // Only the template read fails; the write path is healthy.
  const originalFrom = fakeDb.from;
  let broke = false;
  fakeDb.from = (table) => {
    if (table === "notification_templates" && !broke) {
      broke = true;
      return {
        select: () => ({ eq: () => ({ is: () => Promise.resolve({ data: null, error: { message: "timeout" } }), or: () => Promise.resolve({ data: null, error: { message: "timeout" } }) }) }),
      };
    }
    return originalFrom(table);
  };
  const composed = await delivery.composeNotification({ event: "payment_refunded", organizationId: ORG, values: { amount: "US$19.00" } });
  fakeDb.from = originalFrom;
  assert.equal(composed.provenance, "built_in");
  assert.equal(composed.body, "A payment of US$19.00 was refunded by the EVALORA team.");
});

await check("the platform supplies the organization name and the sender name", async () => {
  resetDb();
  db.organizations.push({ id: ORG, name: "Oak International School" });
  configState.sender_name = "EVALORA Examinations";
  const composed = await delivery.composeNotification({
    event: "payment_refunded",
    organizationId: ORG,
    values: { amount: "US$19.00" },
  });
  const withSender = await delivery.composeNotification({
    event: "organization_member_added",
    organizationId: ORG,
    values: { member_role: "teacher", organization_name: "Sent by hand" },
  });
  assert.equal(composed.provenance, "built_in");
  // The organization name is resolved from the tenant row, not passed by hand.
  db.notification_templates.push(
    template({ organization_id: ORG, event_key: "payment_refunded", title: "{{organization_name}}", body: "from {{sender_name}}" }),
  );
  const rendered = await delivery.composeNotification({
    event: "payment_refunded",
    organizationId: ORG,
    values: { amount: "US$19.00" },
    locale: "en",
  });
  assert.equal(rendered.title, "Oak International School");
  assert.equal(rendered.body, "from EVALORA Examinations");
  assert.equal(withSender.provenance, "built_in");

  const nameless = await delivery.composeNotification({ event: "payment_refunded", organizationId: null, values: { amount: "US$19.00" } });
  assert.equal(nameless.provenance, "built_in", "a platform-scoped event resolves without a tenant");
});

await check("a parameterized destination renders with the event's own values", async () => {
  resetDb();
  const requestId = randomUUID();
  const composed = await delivery.composeNotification({
    event: "exam_retake_approved",
    organizationId: ORG,
    values: {
      exam_title: "MYP 4 Mathematics",
      retake_request_id: requestId,
      retake_code_clause: " Retake code: K7Q2M9.",
      access_deadline_clause: "",
    },
  });
  assert.equal(composed.link, `/retake/${requestId}`);
  assert.equal(composed.type, "exam_retake_approved");
  assert.equal(
    composed.body,
    "Your retake request for “MYP 4 Mathematics” was approved. Retake code: K7Q2M9. Your original submitted attempt is preserved.",
    "the optional clauses compose without dangling punctuation",
  );
  assert.equal(composed.title, "Retake approved");

  const rejected = await delivery.composeNotification({
    event: "exam_retake_rejected",
    organizationId: ORG,
    values: { exam_title: "MYP 5 Biology", retake_request_id: requestId, rejection_reason_clause: "" },
  });
  assert.equal(
    rejected.body,
    "Your retake request for “MYP 5 Biology” was rejected. Your original submitted attempt is unchanged.",
  );
});

await check("the console state reports provenance, the saved row and the fallback", async () => {
  resetDb();
  db.organizations.push({ id: ORG, name: "Oak International School" });
  db.notification_templates.push(
    template({ organization_id: null, event_key: "payment_refunded", title: "Platform refund title", body: "Platform body" }),
    template({ organization_id: ORG, event_key: "account_created", title: "Our welcome", body: "Our body", is_active: false }),
  );
  const { states, locale } = await delivery.notificationTemplateState({ organizationId: ORG });
  assert.equal(locale, "en");
  assert.equal(states.length, EVENTS.length);
  const refunded = states.find((state) => state.event.key === "payment_refunded");
  assert.equal(refunded.resolved.provenance, "platform");
  assert.equal(refunded.inherited?.title, "Platform refund title");
  assert.equal(refunded.saved, null);
  const created = states.find((state) => state.event.key === "account_created");
  assert.ok(created.saved, "a paused row is still shown, so paused and never-authored look different");
  assert.equal(created.saved.is_active, false);
  assert.equal(created.resolved.provenance, "built_in", "and it is not in force");
  assert.equal(created.preview.title, eventKey("account_created").title);

  const platformView = await delivery.notificationTemplateState({ organizationId: null });
  assert.equal(
    platformView.states.find((state) => state.event.key === "payment_refunded").resolved.provenance,
    "platform",
  );
  assert.equal(platformView.states.every((state) => state.inherited === null), true, "the platform scope inherits from code only");
});

await check("the console reads the template table once per scope, not once per event", async () => {
  resetDb();
  queries.length = 0;
  await delivery.notificationTemplateState({ organizationId: ORG });
  const templateReads = queries.filter((query) => query.table === "notification_templates" && query.op === "select");
  assert.ok(templateReads.length <= 2, `expected at most two reads, saw ${templateReads.length}`);
});

/* ═══════════════════════════ the store ═══════════════════════════ */

await check("saving a first template stores it with the variables it uses", async () => {
  resetDb();
  const result = await store.saveNotificationTemplate(fakeDb, {
    actorId: USER,
    organizationId: ORG,
    draft: {
      event_key: "payment_submitted",
      title: "Payment from {{organization_name}}",
      body: "Reference {{transaction_ref}} for {{plan_name}}.",
      channel: "in_app",
      locale: "en",
      is_active: true,
    },
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.action, "created");
  assert.deepEqual(result.variables, ["organization_name", "plan_name", "transaction_ref"]);
  assert.equal(db.notification_templates.length, 1);
  const row = db.notification_templates[0];
  assert.equal(row.organization_id, ORG);
  assert.equal(row.event_key, "payment_submitted");
  assert.equal(row.title, "Payment from {{organization_name}}");
  assert.deepEqual(row.variables, ["organization_name", "plan_name", "transaction_ref"]);
  assert.equal(row.created_by, USER);
  assert.equal(row.is_active, true);
});

await check("saving again updates the same row instead of adding a competing one", async () => {
  resetDb();
  await store.saveNotificationTemplate(fakeDb, {
    actorId: USER,
    organizationId: ORG,
    draft: { event_key: "payment_refunded", title: "First", body: "First body", locale: "en" },
  });
  const second = await store.saveNotificationTemplate(fakeDb, {
    actorId: USER,
    organizationId: ORG,
    draft: { event_key: "payment_refunded", title: "Second", body: "Second body", locale: "en" },
  });
  assert.equal(second.ok, true);
  assert.equal(second.action, "updated");
  assert.equal(db.notification_templates.length, 1, "one event, one language, one row");
  assert.equal(db.notification_templates[0].title, "Second");
});

await check("one wording stays in force per event and language", async () => {
  resetDb();
  // The table's unique index is per (tenant, event, channel, locale), so two
  // active rows for one event and language can exist — an in-app one and an
  // email one — and the resolver would have to guess between them. A save
  // settles it: the row that matches the channel being saved is kept, anything
  // else for the same event and language is paused and reported.
  db.notification_templates.push(
    template({ organization_id: ORG, event_key: "payment_refunded", channel: "in_app", locale: "en", title: "Old in-app", body: "b" }),
    template({ organization_id: ORG, event_key: "payment_refunded", channel: "email", locale: "en", title: "Old email", body: "b" }),
  );
  const changed = await store.saveNotificationTemplate(fakeDb, {
    actorId: USER,
    organizationId: ORG,
    draft: { event_key: "payment_refunded", title: "Mail", body: "Body", channel: "email", locale: "en" },
  });
  assert.equal(changed.ok, true, JSON.stringify(changed));
  assert.equal(changed.action, "updated");
  assert.equal(changed.superseded, 1, "the competing row is paused and the console is told");
  assert.equal(changed.emailOnly, true);
  const active = db.notification_templates.filter((row) => row.is_active);
  assert.equal(active.length, 1, "exactly one wording may be in force per event and language");
  assert.equal(active[0].title, "Mail");
  assert.equal(active[0].channel, "email");
});

await check("an invalid draft never reaches the table", async () => {
  resetDb();
  const result = await store.saveNotificationTemplate(fakeDb, {
    actorId: USER,
    organizationId: ORG,
    draft: { event_key: "subscription_updated", title: "Refund {{candidate_name}}", body: "Body", locale: "en" },
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "unknown_variable");
  assert.equal(db.notification_templates.length, 0);
  assert.equal(queries.filter((query) => query.op === "insert").length, 0, "no write was attempted");
});

await check("a malformed scope id can never widen a write", async () => {
  resetDb();
  const result = await store.saveNotificationTemplate(fakeDb, {
    actorId: USER,
    organizationId: "not-a-uuid",
    draft: { event_key: "payment_refunded", title: "x", body: "y", locale: "en" },
  });
  assert.equal(result.ok, true);
  assert.equal(db.notification_templates[0].organization_id, null, "a non-UUID falls back to the platform scope, where row-level security requires a Super Admin");
});

await check("resetting deletes only the scope it was asked about", async () => {
  resetDb();
  db.notification_templates.push(
    template({ organization_id: null, event_key: "payment_refunded", title: "Platform default", body: "b" }),
    template({ organization_id: ORG, event_key: "payment_refunded", title: "Org wording", body: "b" }),
    template({ organization_id: OTHER_ORG, event_key: "payment_refunded", title: "Neighbour wording", body: "b" }),
  );
  const result = await store.resetNotificationTemplate(fakeDb, {
    organizationId: ORG,
    eventKey: "payment_refunded",
    locale: "en",
  });
  assert.equal(result.ok, true);
  assert.equal(result.removed, 1);
  assert.equal(result.inherits, "platform");
  const titles = db.notification_templates.map((row) => row.title).sort();
  assert.deepEqual(titles, ["Neighbour wording", "Platform default"], "the default and the neighbour survive");

  const nothing = await store.resetNotificationTemplate(fakeDb, {
    organizationId: ORG,
    eventKey: "payment_refunded",
    locale: "en",
  });
  assert.equal(nothing.ok, true);
  assert.equal(nothing.removed, 0);

  const platformReset = await store.resetNotificationTemplate(fakeDb, {
    organizationId: null,
    eventKey: "payment_refunded",
    locale: "en",
  });
  assert.equal(platformReset.inherits, "built_in");
  assert.equal(db.notification_templates.length, 1);
  assert.equal(db.notification_templates[0].organization_id, OTHER_ORG);
});

await check("a test delivers one real notification to the person editing, from the unsaved draft", async () => {
  resetDb();
  const result = await store.sendTemplateTest(fakeDb, {
    actorId: USER,
    draft: {
      event_key: "payment_refunded",
      title: "Draft refund title {{amount}}",
      body: "Draft body about the refund",
      locale: "en",
    },
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.title, "Draft refund title US$1,290.00");
  assert.equal(db.notifications.length, 1);
  assert.equal(db.notifications[0].user_id, USER, "a test can only ever address the editor");
  assert.equal(db.notifications[0].type, "payment");
  assert.equal(db.notifications[0].link, "/dashboard/billing");
  assert.equal(db.notification_templates.length, 0, "a test does not save anything");

  const refused = await store.sendTemplateTest(fakeDb, {
    actorId: USER,
    draft: { event_key: "subscription_updated", title: "{{nope}}", body: "b" },
  });
  assert.equal(refused.ok, false);
  assert.equal(refused.code, "unknown_variable");
  const noActor = await store.sendTemplateTest(fakeDb, { actorId: "", draft: { event_key: "payment_submitted", title: "a", body: "b" } });
  assert.equal(noActor.ok, false);
});

/* ═══════════════════════════ the surfaces ═══════════════════════════ */

await check("the platform console authorizes twice and audits every write", () => {
  const page = read("src/app/admin/control-center/notifications/page.tsx");
  assert.match(page, /requireSuperAdmin\(\)/);
  assert.match(page, /canOperate\(ctx, null, "notification\.templates\.manage"\)/);
  assert.match(page, /NotificationTemplateStudio/);
  assert.match(page, /notificationTemplateState\(/);
  assert.match(page, /notificationCapabilityReport\(/);
  // A scope chosen in the query string is validated before it is used.
  assert.match(page, /UUID\.test\(requestedOrg\)/);
  assert.match(page, /read-only/i, "a denied administrator is told the page is read-only, not shown editors that fail");

  const actions = read("src/app/admin/control-center/notifications/actions.ts");
  assert.match(actions, /"use server"/);
  assert.match(actions, /canOperate\(ctx, null, "notification\.templates\.manage"\)/);
  assert.match(actions, /saveNotificationTemplate\(/);
  assert.match(actions, /resetNotificationTemplate\(/);
  assert.match(actions, /sendTemplateTest\(/);
  assert.equal(actions.match(/await audit\(/g)?.length, 3, "save, test and reset are each audited");
  assert.match(actions, /notification_template\.save/);
  assert.match(actions, /notification_template\.reset/);
  assert.match(actions, /notification_template\.test/);
  assert.match(actions, /formData\.get\("confirm"\) !== "on"/, "a deletion needs an explicit confirmation");
});

await check("the organization console derives its scope from the session, never from a field", () => {
  const page = read("src/app/dashboard/settings/notifications/page.tsx");
  assert.match(page, /activeOrg\(ctx\)/);
  assert.match(page, /requireModule\(entitlement, "org_settings"/);
  assert.match(page, /canOperate\(ctx, org\.id, "organizations\.edit", "org_settings"\)/);
  assert.match(page, /notificationTemplateState\(\{ organizationId: org\.id/);
  assert.match(page, /resolveNotificationConfig\(org\.id\)/, "the page reports whether delivery is even on");

  const actions = read("src/app/dashboard/settings/notifications/actions.ts");
  assert.match(actions, /"use server"/);
  assert.match(actions, /activeOrg\(ctx\)/);
  assert.match(actions, /canOperate\(ctx, org\.id, "organizations\.edit", "org_settings"\)/);
  assert.equal(
    actions.includes('formData.get("organization_id")'),
    false,
    "the organization console must not take its scope from a posted field",
  );
  assert.match(actions, /organizationId: auth\.organizationId/);
  assert.match(actions, /formData\.get\("confirm"\) !== "on"/);
});

await check("the organization console is reachable from the sidebar it is gated by", () => {
  // Three files have to agree, or the sidebar offers a destination that
  // redirects: the module catalog registers the href, the sidebar renders it,
  // and the page gates on the SAME module key the catalog names. This is the
  // rule src/lib/navModules.ts documents and scripts/test-module-sync.mjs
  // enforces for every module; it is pinned here too because the notification
  // console is the surface that changed.
  const HREF = "/dashboard/settings/notifications";
  const catalog = read("src/lib/modules.ts");
  const chrome = read("src/components/dashboard/DashboardChrome.tsx");
  const page = read("src/app/dashboard/settings/notifications/page.tsx");

  const owner = catalog
    .split("\n  {\n")
    .find((entry) => entry.includes(`"${HREF}"`) && entry.includes('kind: "nav"'));
  assert.ok(owner, "the catalog registers the console under a nav module");
  const key = /key: "([a-z_]+)"/.exec(owner)?.[1];
  assert.equal(key, "org_settings", "the console belongs to Organization Settings, not to My Platform");
  assert.match(page, new RegExp(`requireModule\\(entitlement, "${key}"`), "the page gate and the catalog name the same module");

  assert.match(chrome, new RegExp(`href: "${HREF.replace(/\//g, "\\/")}"`), "the sidebar renders the entry");
  const item = chrome.split("\n").find((line) => line.includes(`href: "${HREF}"`));
  assert.match(item, /audience: "managers"/, "only a manager is offered the wording console");
  const labelKey = /labelKey: "nav\.([A-Za-z]+)"/.exec(item)?.[1];
  assert.ok(labelKey, "the entry uses a dictionary key, so it translates");
  for (const rel of ["en", "es", "fr"]) {
    assert.match(read(`src/lib/i18n/dictionaries/${rel}.ts`), new RegExp(`${labelKey}:`), `${rel} translates the sidebar entry`);
  }

  // And the platform console stays where the Super Admin finds it.
  const shell = read("src/app/admin/AdminShell.tsx");
  assert.match(shell, /\/admin\/control-center\/notifications/);
  assert.match(shell, /admin\.notificationWordingNav/);
});

await check("both consoles write through one store, and one renderer", () => {
  for (const rel of [
    "src/app/admin/control-center/notifications/actions.ts",
    "src/app/dashboard/settings/notifications/actions.ts",
  ]) {
    const source = read(rel);
    assert.match(source, /@\/lib\/notificationTemplateStore/, `${rel} must use the shared store`);
    assert.equal(
      /\.from\("notification_templates"\)/.test(source),
      false,
      `${rel} must not open a second write path to the table`,
    );
  }
  const editor = read("src/components/notifications/NotificationTemplateEditor.tsx");
  assert.match(editor, /^"use client"/m);
  assert.match(editor, /from "@\/lib\/notificationTemplates"/, "the preview uses the shipped renderer, not a copy of it");
  assert.match(editor, /previewTemplate\(/);
  assert.match(editor, /extractTemplateVariables\(/);
  assert.match(editor, /useActionState/, "a refusal comes back with the draft still on screen");
  assert.equal(
    editor.includes(".replace(/"),
    false,
    "the client must not reimplement substitution — it previews with the shipped renderer",
  );
  const studio = read("src/components/notifications/NotificationTemplateStudio.tsx");
  assert.match(studio, /NotificationTemplateEditor/);
  assert.match(studio, /What a recipient reads now/, "the server-rendered truth is labelled as such");
});

await check("the consoles are reachable from the places an administrator already is", () => {
  assert.match(read("src/app/admin/notifications/page.tsx"), /\/admin\/control-center\/notifications/);
  assert.match(read("src/app/admin/control-center/page.tsx"), /\/admin\/control-center\/notifications/);
  assert.match(read("src/app/dashboard/settings/page.tsx"), /\/dashboard\/settings\/notifications/);
  assert.ok(existsSync(src("src/app/admin/control-center/notifications/page.tsx")));
  assert.ok(existsSync(src("src/app/dashboard/settings/notifications/page.tsx")));
});

await check("the wired call sites send named events, not hand-built strings", () => {
  const sites = [
    ["src/app/admin/actions.ts", ["payment_request_approved", "payment_request_rejected"]],
    ["src/app/admin/actions/orgs.ts", ["organization_member_added"]],
    ["src/app/admin/actions/payments.ts", ["payment_recorded", "payment_verified", "payment_refunded", "subscription_updated"]],
    ["src/app/admin/actions/users.ts", ["account_created", "super_admin_granted", "super_admin_revoked"]],
    ["src/app/api/exam/retake/route.ts", ["exam_retake_requested"]],
    ["src/app/dashboard/billing/actions.ts", ["payment_submitted"]],
    ["src/app/invite/[token]/page.tsx", ["invitation_accepted"]],
    ["src/lib/examRetakeServer.ts", ["exam_retake_approved", "exam_retake_rejected"]],
  ];
  const seen = new Set();
  for (const [rel, keys] of sites) {
    const source = read(rel);
    assert.match(source, /sendNotification\(/, `${rel} must deliver through the template layer`);
    for (const key of keys) {
      assert.ok(source.includes(`"${key}"`), `${rel} must send ${key}`);
      seen.add(key);
    }
  }
  assert.equal(seen.size, EVENTS.length, "every registered event is sent by a named call site");
  // The retake decision carries the organization so its wording can apply.
  const retake = read("src/lib/examRetakeServer.ts");
  assert.match(retake, /organizationId: input\.organizationId/);
  for (const rel of [
    "src/app/admin/examinations/retake-actions.ts",
    "src/app/dashboard/monitoring/actions.ts",
    "src/app/api/monitor/exams/[id]/restart/route.ts",
  ]) {
    assert.match(read(rel), /organizationId:/, `${rel} must tell the notification which organization's wording applies`);
  }
});

await check("the broadcast centre keeps its free-form messages and says they are not templates", () => {
  const actions = read("src/app/admin/actions.ts");
  assert.match(actions, /admin_broadcast_notification/, "a broadcast is still composed by the administrator");
  const page = read("src/app/admin/notifications/page.tsx");
  assert.match(page, /written from templates|wording console/i);
  const console = read("src/app/admin/control-center/notifications/page.tsx");
  assert.match(console, /What is not a template/);
  assert.match(console, /Supabase Auth/);
});

/* ───────────────────────── report ───────────────────────── */
console.log(`\nnotification templates: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exit(1);
}
console.log("✓ the notification event registry, its resolution order and its delivery are wired");
process.exit(0);
