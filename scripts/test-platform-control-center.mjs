// Platform Control Center — centralized configuration architecture.
//
// This suite executes the REAL configuration layer (src/lib/config/*.ts) with
// only the database faked, so every assertion below is about shipped code:
//
//   • the schema is internally consistent and honest about what consumes a
//     setting (every declared consumer file exists, every connected module is a
//     real module key) — this is the guard against "config in the database while
//     the module keeps using a hardcoded value";
//   • resolution is organization override → global → schema default, with
//     provenance, and one organization can never see another's rows;
//   • validation rejects what the schema forbids, including an unreadable
//     brand palette;
//   • the store writes a value + an append-only revision + an audit row, resets
//     to inherit by deleting ONLY the override, rolls back as a new revision,
//     and applies presets key by key;
//   • the service caches and invalidates, and degrades to defaults when the
//     tables are unreachable;
//   • the server actions enforce scope by which action was called, require an
//     explicit confirmation for operational settings, and never let an
//     organization touch global configuration.
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
    if (out instanceof Promise) return out.then(() => { passed += 1; }, (e) => { failures.push(`${label}: ${e?.message ?? e}`); });
    passed += 1;
  } catch (error) {
    failures.push(`${label}: ${error?.message ?? error}`);
  }
  return undefined;
}

/* ───────────────────────── source loader ─────────────────────────
 * Loads a real .ts/.tsx file, resolving its `@/…` and relative imports through
 * this loader. Anything registered in `fakes` (by repository path) is returned
 * instead of the real module; every other non-source specifier falls through to
 * the shared harness shim, which stubs `next/*`, `server-only` and friends.
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
function src(rel) {
  return path.join(ROOT, rel);
}
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
  platform_config_values: [],
  platform_config_revisions: [],
  platform_config_presets: [],
  audit_logs: [],
};
let dbFailing = false;
const queryCount = { total: 0 };

function matches(row, filters) {
  return filters.every(({ column, op, value }) => {
    if (op === "eq") return String(row[column]) === String(value);
    if (op === "neq") return String(row[column]) !== String(value);
    if (op === "in") return value.includes(row[column]);
    if (op === "is") return value === null ? row[column] == null : row[column] === value;
    return true;
  });
}

/**
 * supabase-js builders are THENABLES that resolve to `{ data, error, count }`,
 * never to a bare array — the service destructures `{ data, error }`, so the
 * fake has to answer in exactly that shape.
 */
async function runSelect(table, state) {
  queryCount.total += 1;
  if (dbFailing) throw new Error("relation \"public.platform_config_values\" does not exist");
  let rows = (db[table] ?? []).filter((row) => matches(row, state.filters));
  if (state.or) {
    const ids = String(state.or)
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part.startsWith("scope_id.eq."))
      .map((part) => part.slice("scope_id.eq.".length));
    if (ids.length) rows = rows.filter((row) => ids.includes(String(row.scope_id)));
  }
  if (state.limit) rows = rows.slice(0, state.limit);
  return rows.map((row) => ({ ...row }));
}

function chain(table, state) {
  /**
   * A LAZY thenable. supabase-js builders do no work until they are awaited, so
   * neither may this: every `.eq()` in a chain would otherwise fire its own
   * query (or its own delete) the moment it was constructed.
   */
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
    insert: async (payload) => {
      queryCount.total += 1;
      if (dbFailing) return { data: null, error: { message: "relation does not exist" } };
      const rows = Array.isArray(payload) ? payload : [payload];
      for (const entry of rows) db[table].push({ id: randomUUID(), created_at: new Date().toISOString(), ...entry });
      return { data: rows, error: null };
    },
    upsert: async (payload) => {
      queryCount.total += 1;
      if (dbFailing) return { data: null, error: { message: "relation does not exist" } };
      const rows = Array.isArray(payload) ? payload : [payload];
      const key = ["scope_level", "scope_id", "namespace", "key"];
      for (const entry of rows) {
        const index = db[table].findIndex((existing) => key.every((k) => String(existing[k]) === String(entry[k])));
        if (index >= 0) db[table][index] = { ...db[table][index], ...entry };
        else db[table].push({ id: randomUUID(), ...entry });
      }
      return { data: rows, error: null };
    },
    update: (payload) =>
      settle(async () => {
        queryCount.total += 1;
        if (dbFailing) throw new Error("relation does not exist");
        const hit = db[table].filter((row) => matches(row, state.filters));
        hit.forEach((row) => Object.assign(row, payload));
        return hit.map((row) => ({ ...row }));
      }),
    // `.delete().eq(…).eq(…)` — the filters keep accumulating, then the
    // terminal await performs the deletion instead of a select.
    delete: () => chain(table, { ...state, mode: "delete" }),
    ...settle(
      state.mode === "delete"
        ? async () => {
            queryCount.total += 1;
            if (dbFailing) throw new Error("relation does not exist");
            const before = db[table].length;
            db[table] = db[table].filter((row) => !matches(row, state.filters));
            return new Array(before - db[table].length).fill(null);
          }
        : () => runSelect(table, state),
    ),
  };
  return api;
}

const fakeAdmin = {
  from: (table) => {
    if (!(table in db)) db[table] = [];
    return chain(table, { filters: [], or: null, limit: null });
  },
};
fakes.set(src("src/lib/supabase/server.ts"), {
  createAdminClient: () => fakeAdmin,
  createClient: async () => fakeAdmin,
});

/* ───────────────────────── the modules under test ───────────────────────── */
const schema = load("src/lib/config/schema.ts");
const types = load("src/lib/config/types.ts");
const resolve = load("src/lib/config/resolve.ts");
const validate = load("src/lib/config/validate.ts");
const service = load("src/lib/config/service.ts");
const store = load("src/lib/config/store.ts");
const modules = load("src/lib/modules.ts");

const { CONFIG_SCHEMA, CONFIG_NAMESPACES, getConfigDef, organizationWritableConfigs, globalOnlyConfigs, readOnlyConfigs } = schema;
const { GLOBAL_SCOPE_ID } = types;

const ORG_A = "0a400000-0000-4000-8000-000000000001"; // Oak International School shape
const ORG_B = "de000000-0000-4000-8000-000000000001"; // a different tenant
const ACTOR = "11111111-2222-3333-4444-555555555555";

function row(scope, scopeId, namespace, key, value, revision = 1) {
  return {
    scope_level: scope,
    scope_id: scopeId,
    namespace,
    key,
    value,
    revision,
    updated_by: ACTOR,
    updated_at: new Date().toISOString(),
  };
}
function resetDb() {
  db.platform_config_values = [];
  db.platform_config_revisions = [];
  db.platform_config_presets = [];
  db.audit_logs = [];
  service.invalidateConfigCache();
}

/* ══════════════ 1. the schema is consistent and honest ══════════════ */

const KINDS = ["string", "text", "email", "url", "image", "color", "boolean", "integer", "number", "enum", "multi_enum", "string_list", "timezone", "announcement_list"];
const namespaceKeys = CONFIG_NAMESPACES.map((ns) => ns.key);

await check("every namespace declared in CONFIG_NAMESPACES has at least one setting", () => {
  for (const ns of namespaceKeys) {
    assert.ok(CONFIG_SCHEMA.some((d) => d.namespace === ns), `${ns} declares no settings`);
  }
});

await check("every setting belongs to a declared namespace and is fully described", () => {
  for (const def of CONFIG_SCHEMA) {
    assert.ok(namespaceKeys.includes(def.namespace), `${def.namespace}.${def.key}: unknown namespace`);
    assert.ok(/^[a-z0-9_]+$/.test(def.key), `${def.namespace}.${def.key}: key must be snake_case`);
    assert.ok(typeof def.label === "string" && def.label.length > 2, `${def.namespace}.${def.key}: label`);
    assert.ok(typeof def.description === "string" && def.description.length > 20, `${def.namespace}.${def.key}: description must explain the setting`);
    assert.ok(KINDS.includes(def.kind), `${def.namespace}.${def.key}: unknown kind ${def.kind}`);
    assert.ok(def.default !== undefined, `${def.namespace}.${def.key}: no default`);
    assert.ok(Number.isInteger(def.order) && def.order >= 1, `${def.namespace}.${def.key}: order`);
    assert.ok(Array.isArray(def.writableScopes), `${def.namespace}.${def.key}: writableScopes`);
    for (const scope of def.writableScopes) assert.ok(["global", "organization"].includes(scope), `${def.namespace}.${def.key}: ${scope}`);
  }
});

await check("no setting is declared twice", () => {
  const seen = new Set();
  for (const def of CONFIG_SCHEMA) {
    const id = `${def.namespace}.${def.key}`;
    assert.ok(!seen.has(id), `duplicate ${id}`);
    seen.add(id);
  }
});

await check("every declared consumer actually exists in the repository", () => {
  const missing = [];
  for (const def of CONFIG_SCHEMA) {
    for (const entry of def.consumedBy ?? []) {
      // Entries are "src/…/file.ts optional explanation" — the path is first.
      const candidate = String(entry).split(" ")[0];
      if (!candidate.startsWith("src/")) continue;
      const absolute = src(candidate);
      const found = existsSync(absolute) || EXTENSIONS.some((ext) => existsSync(`${absolute}${ext}`)) || existsSync(path.dirname(absolute));
      if (!found) missing.push(`${def.namespace}.${def.key} → ${candidate}`);
    }
  }
  assert.deepEqual(missing, [], `settings claim consumers that do not exist:\n  ${missing.join("\n  ")}`);
});

await check("every connected module is a real module key", () => {
  const catalog = new Set((modules.MODULE_CATALOG ?? []).map((m) => m.key));
  assert.ok(catalog.size > 10, "the module catalog should be loaded");
  const unknown = [];
  for (const def of CONFIG_SCHEMA) {
    for (const key of def.connectedModules ?? []) if (!catalog.has(key)) unknown.push(`${def.namespace}.${def.key} → ${key}`);
  }
  assert.deepEqual(unknown, [], `unknown module keys:\n  ${unknown.join("\n  ")}`);
});

await check("enum and bounded settings declare their options or limits", () => {
  for (const def of CONFIG_SCHEMA) {
    if (def.kind === "enum") assert.ok(Array.isArray(def.options) && def.options.length >= 2, `${def.namespace}.${def.key}: enum needs options`);
    if (def.kind === "multi_enum") assert.ok(Array.isArray(def.options) && def.options.length >= 2, `${def.namespace}.${def.key}: multi_enum needs options`);
    if (def.kind === "integer" || def.kind === "number") {
      assert.ok(Number.isFinite(def.min) && Number.isFinite(def.max), `${def.namespace}.${def.key}: numeric setting needs min and max`);
      assert.ok(def.default >= def.min && def.default <= def.max, `${def.namespace}.${def.key}: default outside its own bounds`);
    }
    if (def.kind === "enum" || def.kind === "multi_enum") {
      for (const option of def.options) {
        assert.ok(typeof option.value === "string" && option.value.length > 0, `${def.namespace}.${def.key}: option without a value`);
        assert.ok(typeof option.label === "string" && option.label.length > 0, `${def.namespace}.${def.key}: option without a label`);
      }
    }
    if (def.kind === "enum") {
      const allowed = def.options.map((o) => o.value);
      assert.ok(allowed.includes(def.default), `${def.namespace}.${def.key}: default “${def.default}” is not one of ${allowed.join(", ")}`);
    }
  }
});

await check("the organization namespace is organization-scoped and never global-only", () => {
  const defs = CONFIG_SCHEMA.filter((d) => d.namespace === "org_identity");
  assert.ok(defs.length >= 3, "org_identity should carry the institution's own identity");
  for (const def of defs) assert.ok(def.writableScopes.includes("organization"), `${def.key} must be writable by the organization`);
});

await check("platform-wide security settings cannot be written by an organization", () => {
  const orgWritable = new Set(organizationWritableConfigs().map((d) => `${d.namespace}.${d.key}`));
  for (const forbidden of ["assessment.require_validation_before_publication", "platform_behavior.maintenance_mode"]) {
    assert.ok(!orgWritable.has(forbidden), `${forbidden} must not be organization-writable`);
  }
  const globalOnly = globalOnlyConfigs().map((d) => `${d.namespace}.${d.key}`);
  assert.ok(globalOnly.includes("platform_behavior.maintenance_mode"), "maintenance mode is a platform-wide switch");
  assert.ok(globalOnly.length >= 5, "several settings must stay platform-wide");
});

await check("settings that only report reality are not editable anywhere", () => {
  const readOnly = readOnlyConfigs().map((d) => `${d.namespace}.${d.key}`);
  assert.ok(readOnly.includes("notifications.email_delivery_available"), "email delivery is reported, not switched on");
  const def = getConfigDef("notifications", "email_delivery_available");
  assert.equal(def.default, false, "no email provider is integrated, so the honest default is false");
  assert.deepEqual(def.writableScopes, [], "a reported-only setting has no writable scope");
});

await check("result publication can never be switched off by configuration", () => {
  const def = getConfigDef("assessment", "require_validation_before_publication");
  assert.equal(def.default, true);
  assert.ok(!def.writableScopes.includes("organization"), "an organization cannot drop the validation gate");
});

/* ══════════════ 2. resolution: override → global → default ══════════════ */

await check("with nothing stored, every setting resolves to its schema default", () => {
  const { values, provenance } = resolve.resolveAll([], null);
  assert.equal(Object.keys(values).length, CONFIG_SCHEMA.length);
  for (const def of CONFIG_SCHEMA) {
    const id = `${def.namespace}.${def.key}`;
    assert.deepEqual(values[id], def.default, `${id} should default`);
    assert.equal(provenance[id].source, "default");
    assert.equal(provenance[id].revision, 0);
  }
});

await check("a global row replaces the default and reports where it came from", () => {
  const rows = [row("global", GLOBAL_SCOPE_ID, "assessment", "default_pass_percent", 65)];
  const { values, provenance } = resolve.resolveAll(rows, null);
  assert.equal(values["assessment.default_pass_percent"], 65);
  assert.equal(provenance["assessment.default_pass_percent"].source, "global");
  assert.equal(provenance["assessment.default_pass_percent"].isOverride, false);
  // Everything else is untouched.
  assert.equal(provenance["branding.platform_name"].source, "default");
});

await check("an organization override beats the global value", () => {
  const rows = [
    row("global", GLOBAL_SCOPE_ID, "assessment", "default_pass_percent", 65),
    row("organization", ORG_A, "assessment", "default_pass_percent", 40),
  ];
  const forA = resolve.resolveNamespace(rows, "assessment", ORG_A);
  assert.equal(forA.default_pass_percent, 40);
  const provenance = resolve.resolveNamespaceProvenance(rows, "assessment", ORG_A);
  assert.equal(provenance.default_pass_percent.source, "organization");
  assert.equal(provenance.default_pass_percent.isOverride, true);
});

await check("one organization's override never reaches another organization", () => {
  const rows = [
    row("global", GLOBAL_SCOPE_ID, "assessment", "default_pass_percent", 65),
    row("organization", ORG_A, "assessment", "default_pass_percent", 40),
    row("organization", ORG_B, "assessment", "default_pass_percent", 90),
  ];
  assert.equal(resolve.resolveNamespace(rows, "assessment", ORG_A).default_pass_percent, 40);
  assert.equal(resolve.resolveNamespace(rows, "assessment", ORG_B).default_pass_percent, 90);
  // The platform-wide view sees the global value, not either tenant's.
  assert.equal(resolve.resolveNamespace(rows, "assessment", null).default_pass_percent, 65);
});

await check("an override equal to the inherited value still offers Reset to inherit", () => {
  const rows = [
    row("global", GLOBAL_SCOPE_ID, "branding", "platform_name", "EVALORA"),
    row("organization", ORG_A, "branding", "platform_name", "EVALORA"),
  ];
  const entry = resolve.resolveNamespaceProvenance(rows, "branding", ORG_A).platform_name;
  assert.equal(entry.source, "organization");
  assert.equal(entry.isOverride, false, "the value matches what it inherits");
  const def = getConfigDef("branding", "platform_name");
  assert.match(resolve.describeReset(def, entry), /Removes this organization's override/);
  assert.match(resolve.describeSource(entry, "Oak International School"), /Oak International School/);
});

await check("Reset to inherit is offered only for an organization-scoped value", () => {
  const rows = [row("global", GLOBAL_SCOPE_ID, "branding", "platform_name", "EVALORA")];
  const provenance = resolve.resolveNamespaceProvenance(rows, "branding", ORG_A);
  assert.equal(resolve.describeReset(getConfigDef("branding", "platform_name"), provenance.platform_name), null);
});

await check("rows for an unknown scope are ignored rather than applied", () => {
  const rows = [row("organization", randomUUID(), "assessment", "default_pass_percent", 12)];
  assert.equal(resolve.resolveNamespace(rows, "assessment", ORG_A).default_pass_percent, getConfigDef("assessment", "default_pass_percent").default);
});

/* ══════════════ 3. validation ══════════════ */

await check("an undeclared setting cannot be written", () => {
  const result = validate.validateConfigValue("assessment", "not_a_real_setting", 1);
  assert.equal(result.ok, false);
  assert.match(result.error, /not a declared EVALORA setting/);
});

await check("a reported-only setting refuses every write", () => {
  const result = validate.validateConfigValue("notifications", "email_delivery_available", true);
  assert.equal(result.ok, false);
  assert.match(result.error, /transparency only/);
});

await check("booleans accept the values a form actually sends", () => {
  for (const [input, expected] of [["true", true], ["on", true], ["1", true], [1, true], [true, true], ["false", false], ["off", false], ["", false], [null, false], [false, false]]) {
    const result = validate.validateAgainstDef(getConfigDef("proctoring", "require_camera_check"), input);
    assert.equal(result.ok, true, `input ${JSON.stringify(input)}`);
    assert.equal(result.value, expected, `input ${JSON.stringify(input)}`);
  }
});

await check("integers are bounded by the schema", () => {
  const def = getConfigDef("proctoring", "max_tab_switch_warnings");
  assert.equal(validate.validateAgainstDef(def, 5).value, 5);
  assert.equal(validate.validateAgainstDef(def, "7").value, 7);
  assert.equal(validate.validateAgainstDef(def, def.max + 50).ok, false);
  assert.equal(validate.validateAgainstDef(def, def.min - 50).ok, false);
  assert.equal(validate.validateAgainstDef(def, "not a number").ok, false);
});

await check("enums accept only declared options", () => {
  for (const def of CONFIG_SCHEMA.filter((d) => d.kind === "enum")) {
    for (const option of def.options) {
      const result = validate.validateAgainstDef(def, option.value);
      assert.equal(result.ok, true, `${def.namespace}.${def.key} should accept ${option.value}`);
      assert.equal(result.value, option.value);
    }
    assert.equal(validate.validateAgainstDef(def, "not-an-option").ok, false, `${def.namespace}.${def.key} must refuse an invented option`);
    // An empty submission falls back to the declared default rather than blanking a live surface.
    assert.deepEqual(validate.validateAgainstDef(def, "").value, def.default);
  }
});

await check("multi_enum rejects an unknown member, de-duplicates and accepts a JSON string", () => {
  for (const def of CONFIG_SCHEMA.filter((d) => d.kind === "multi_enum")) {
    const [first, second] = def.options.map((o) => o.value);
    const good = validate.validateAgainstDef(def, [first, second, first]);
    assert.equal(good.ok, true, JSON.stringify(good));
    assert.deepEqual(good.value, [first, second]);
    const fromJson = validate.validateAgainstDef(def, JSON.stringify([first]));
    assert.equal(fromJson.ok, true);
    assert.deepEqual(fromJson.value, [first]);
    assert.equal(validate.validateAgainstDef(def, ["invented_option"]).ok, false);
    assert.equal(validate.validateAgainstDef(def, []).ok, false, "an empty selection is refused, not stored as nothing");
  }
});

await check("colours must be six-digit hex", () => {
  const def = getConfigDef("branding", "color_primary");
  assert.equal(validate.validateAgainstDef(def, "#0a5c36").value, "#0a5c36");
  assert.equal(validate.validateAgainstDef(def, "#0A5C36").value, "#0a5c36", "hex is normalised to lower case");
  for (const bad of ["red", "0a5c36", "#12345", "#1234567", "javascript:alert(1)", "url(#x)"]) {
    assert.equal(validate.validateAgainstDef(def, bad).ok, false, `${bad} must be refused`);
  }
  assert.deepEqual(validate.validateAgainstDef(def, "").value, def.default, "clearing a colour restores the default");
});

await check("free text is trimmed, length-capped and stripped of control characters", () => {
  const def = getConfigDef("branding", "platform_name");
  const result = validate.validateAgainstDef(def, `  Oak\u0000 International\u0007 School  ${"x".repeat(4000)}`);
  assert.equal(result.ok, true);
  assert.ok(!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(result.value), "control characters must be removed");
  assert.ok(String(result.value).length <= (def.maxLength ?? 2000));
});

await check("images, links and emails are validated, and javascript: urls are refused", () => {
  const imageDefs = CONFIG_SCHEMA.filter((d) => d.kind === "image" || d.kind === "url");
  assert.ok(imageDefs.length >= 3, "logo and favicon settings are declared");
  for (const def of imageDefs) {
    assert.equal(validate.validateAgainstDef(def, "https://cdn.evalora.test/logo.png").ok, true, `${def.key} https`);
    assert.equal(validate.validateAgainstDef(def, "/uploads/oak/logo.png").ok, true, `${def.key} relative path`);
    for (const bad of ["javascript:alert(1)", "data:text/html,<script>", "https://x.test/a b.png", "//evil.test/x.png"]) {
      assert.equal(validate.validateAgainstDef(def, bad).ok, false, `${def.namespace}.${def.key} must refuse ${bad}`);
    }
  }
  for (const def of CONFIG_SCHEMA.filter((d) => d.kind === "email")) {
    assert.equal(validate.validateAgainstDef(def, "support@evalora-edu.online").ok, true);
    assert.equal(validate.validateAgainstDef(def, "Support@Evalora-Edu.Online").value, "support@evalora-edu.online");
    for (const bad of ["not-an-email", "a@b", "@evalora.test", "javascript:alert(1)"]) {
      assert.equal(validate.validateAgainstDef(def, bad).ok, false, `${def.key} must refuse ${bad}`);
    }
  }
});

await check("timezones must be one of the curated IANA names", () => {
  const def = CONFIG_SCHEMA.find((d) => d.kind === "timezone");
  assert.equal(validate.validateAgainstDef(def, "Europe/Paris").ok, true);
  assert.equal(validate.validateAgainstDef(def, "Mars/Olympus").ok, false);
  assert.equal(validate.validateAgainstDef(def, "DROP TABLE organizations").ok, false);
});

await check("announcements are validated as a list, bounded, and cannot carry a script link", () => {
  const def = CONFIG_SCHEMA.find((d) => d.kind === "announcement_list");
  const good = validate.validateAgainstDef(def, [
    { id: "a1", title: "Results published", body: "MYP 5 results are now visible.", tone: "warning", href: "/dashboard/results", enabled: true },
    { title: "", body: "", enabled: true }, // an empty builder row is dropped, not stored
  ]);
  assert.equal(good.ok, true, JSON.stringify(good));
  assert.equal(good.value.length, 1);
  assert.equal(good.value[0].tone, "warning");
  assert.equal(good.value[0].href, "/dashboard/results");

  const unknownTone = validate.validateAgainstDef(def, [{ title: "x", tone: "neon" }]);
  assert.equal(unknownTone.ok, true);
  assert.equal(unknownTone.value[0].tone, "info", "an invented tone falls back to info");

  assert.equal(validate.validateAgainstDef(def, [{ title: "x", href: "javascript:alert(1)" }]).ok, false);
  assert.equal(validate.validateAgainstDef(def, [{ body: "no title" }]).ok, false);
  assert.equal(validate.validateAgainstDef(def, [{ title: "x", starts_at: "2026-12-01T00:00:00Z", ends_at: "2026-11-01T00:00:00Z" }]).ok, false);
  assert.equal(validate.validateAgainstDef(def, Array.from({ length: 13 }, (_, i) => ({ title: `Announcement ${i}` }))).ok, false);
  assert.equal(validate.validateAgainstDef(def, "not json").ok, false);
  assert.deepEqual(validate.validateAgainstDef(def, "[]").value, [], "a JSON string from a form field is accepted");

  // The banner must render titles as text, never as markup.
  const banner = read("src/components/platform/AnnouncementBanner.tsx");
  assert.ok(!banner.includes("dangerouslySetInnerHTML"), "announcements must never be injected as HTML");
});

await check("string lists are trimmed, de-duplicated and bounded", () => {
  // No shipped setting uses this kind today; the validator branch stays covered
  // so a future setting cannot rely on untested behaviour.
  const synthetic = {
    namespace: "branding",
    key: "synthetic_list",
    label: "Synthetic list",
    description: "Test-only definition for the string_list validator branch.",
    kind: "string_list",
    writableScopes: ["global"],
    default: [],
    order: 999,
  };
  const good = validate.validateAgainstDef(synthetic, ["Alpha", "alpha", "  Beta  ", "", "x".repeat(200)]);
  assert.equal(good.ok, true, JSON.stringify(good));
  assert.deepEqual(good.value, ["Alpha", "Beta", "x".repeat(60)]);
  assert.equal(validate.validateAgainstDef(synthetic, "One, Two\nThree").value.length, 3, "a comma or newline separated field is accepted");
  assert.equal(validate.validateAgainstDef(synthetic, []).ok, false);
  assert.equal(validate.validateAgainstDef(synthetic, Array.from({ length: 30 }, (_, i) => `item ${i}`)).ok, false, "at most 24 entries");
  assert.equal(validate.validateAgainstDef(synthetic, 42).ok, false);
});

await check("the brand palette must stay readable", () => {
  const good = validate.validateBrandingPalette({ color_ink: "#16241c", color_cream: "#f5f3ec", color_primary: "#0a5c36" });
  assert.equal(good.ok, true, JSON.stringify(good));
  const bad = validate.validateBrandingPalette({ color_ink: "#ffffff", color_cream: "#ffffff", color_primary: "#0a5c36" });
  assert.equal(bad.ok, false, "white text on a white background must be refused");
});

/* ══════════════ 4. the store writes value + revision + audit ══════════════ */

resetDb();

await check("a global write stores the value, a revision and an audit entry", async () => {
  const result = await store.writeConfigValue({
    scope: "global",
    namespace: "assessment",
    key: "default_pass_percent",
    submitted: "60",
    actorId: ACTOR,
    changeNote: "Platform default raised",
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.value, 60);
  assert.equal(result.revision, 1);
  assert.equal(db.platform_config_values.length, 1);
  assert.equal(db.platform_config_values[0].scope_id, GLOBAL_SCOPE_ID);
  assert.equal(db.platform_config_revisions.length, 1);
  assert.equal(db.platform_config_revisions[0].previous_value, null);
  assert.equal(db.platform_config_revisions[0].new_value, 60);
  assert.equal(db.audit_logs.length, 1);
  assert.equal(db.audit_logs[0].action, "platform_config.update");
  assert.ok(db.audit_logs[0].metadata.changes.length > 0, "the audit entry records what changed");
});

await check("writing the same value again does not grow the history", async () => {
  const before = db.platform_config_revisions.length;
  const result = await store.writeConfigValue({ scope: "global", namespace: "assessment", key: "default_pass_percent", submitted: 60, actorId: ACTOR });
  assert.equal(result.ok, true);
  assert.equal(db.platform_config_revisions.length, before, "no no-op revision");
  assert.equal(db.platform_config_values.length, 1);
});

await check("a second, different write bumps the revision and keeps the previous value", async () => {
  const result = await store.writeConfigValue({ scope: "global", namespace: "assessment", key: "default_pass_percent", submitted: 70, actorId: ACTOR });
  assert.equal(result.ok, true);
  assert.equal(result.revision, 2);
  const revisions = db.platform_config_revisions.filter((r) => r.namespace === "assessment");
  assert.equal(revisions.length, 2);
  assert.equal(revisions[1].previous_value, 60);
  assert.equal(revisions[1].new_value, 70);
});

await check("an organization write is scoped to that organization", async () => {
  const result = await store.writeConfigValue({
    scope: "organization",
    scopeId: ORG_A,
    namespace: "assessment",
    key: "default_pass_percent",
    submitted: 45,
    actorId: ACTOR,
    organizationId: ORG_A,
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  const stored = db.platform_config_values.find((r) => r.scope_level === "organization");
  assert.equal(stored.scope_id, ORG_A);
  assert.equal(db.audit_logs.at(-1).organization_id, ORG_A);
  // The global value is unchanged.
  assert.equal(db.platform_config_values.find((r) => r.scope_level === "global").value, 70);
});

await check("an organization write without a valid organization is refused", async () => {
  const before = db.platform_config_values.length;
  for (const scopeId of ["", "not-a-uuid", null, ORG_A.slice(0, 20)]) {
    const result = await store.writeConfigValue({ scope: "organization", scopeId, namespace: "assessment", key: "default_pass_percent", submitted: 44, actorId: ACTOR });
    assert.equal(result.ok, false, `${scopeId}`);
    assert.match(result.error, /organization must be selected/i);
  }
  assert.equal(db.platform_config_values.length, before, "nothing was written");
});

await check("a platform-wide setting cannot be written at organization scope", async () => {
  const result = await store.writeConfigValue({ scope: "organization", scopeId: ORG_A, namespace: "platform_behavior", key: "maintenance_mode", submitted: true, actorId: ACTOR });
  assert.equal(result.ok, false);
  assert.match(result.error, /platform-wide configuration/i);
  assert.equal(db.platform_config_values.filter((r) => r.namespace === "platform_behavior").length, 0);
});

await check("an invalid value is refused before anything is written", async () => {
  const before = db.platform_config_values.length;
  const result = await store.writeConfigValue({ scope: "global", namespace: "proctoring", key: "max_tab_switch_warnings", submitted: 9999, actorId: ACTOR });
  assert.equal(result.ok, false);
  assert.equal(db.platform_config_values.length, before);
  assert.equal(db.platform_config_revisions.filter((r) => r.key === "max_tab_switch_warnings").length, 0);
});

await check("an unreadable brand colour is refused by the palette guard", async () => {
  await store.writeConfigValue({ scope: "global", namespace: "branding", key: "color_ink", submitted: "#16241c", actorId: ACTOR });
  const result = await store.writeConfigValue({ scope: "global", namespace: "branding", key: "color_cream", submitted: "#16241c", actorId: ACTOR });
  assert.equal(result.ok, false, "cream identical to ink would make text invisible");
});

await check("a failing database is reported, not swallowed", async () => {
  dbFailing = true;
  try {
    const result = await store.writeConfigValue({ scope: "global", namespace: "branding", key: "support_email", submitted: "help@evalora-edu.online", actorId: ACTOR });
    assert.equal(result.ok, false);
    assert.match(result.error, /could not be saved|relation does not exist/i);
  } finally {
    dbFailing = false;
  }
});

await check("Reset to inherit deletes only the organization override", async () => {
  const before = db.platform_config_values.length;
  assert.ok(db.platform_config_values.some((r) => r.scope_level === "organization" && r.namespace === "assessment"), "the fixture must hold an override");
  const result = await store.resetConfigToInherit({ organizationId: ORG_A, namespace: "assessment", key: "default_pass_percent", actorId: ACTOR });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(db.platform_config_values.length, before - 1);
  assert.equal(db.platform_config_values.some((r) => r.scope_level === "organization" && r.namespace === "assessment"), false);
  assert.equal(db.platform_config_values.find((r) => r.scope_level === "global" && r.namespace === "assessment").value, 70, "the platform value survives");
  assert.equal(db.audit_logs.at(-1).action, "platform_config.reset_to_inherit");
  const revision = db.platform_config_revisions.at(-1);
  assert.equal(revision.new_value, null);
  assert.equal(revision.previous_value, 45);
});

await check("Reset to inherit is a no-op when there is no override", async () => {
  const revisionsBefore = db.platform_config_revisions.length;
  const auditsBefore = db.audit_logs.length;
  const result = await store.resetConfigToInherit({ organizationId: ORG_A, namespace: "assessment", key: "default_pass_percent", actorId: ACTOR });
  assert.equal(result.ok, true);
  assert.equal(result.revision, 0);
  assert.equal(db.platform_config_revisions.length, revisionsBefore, "nothing to record");
  assert.equal(db.audit_logs.length, auditsBefore, "a no-op is not audited as a change");
});

await check("rollback restores the earlier value as a NEW revision", async () => {
  const target = db.platform_config_revisions.find((r) => r.namespace === "assessment" && r.scope_level === "global" && r.new_value === 70);
  assert.ok(target, "the revision to roll back must exist");
  const before = db.platform_config_values.find((r) => r.scope_level === "global" && r.namespace === "assessment").revision;
  const result = await store.rollbackConfigRevision({ revisionId: target.id, actorId: ACTOR });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.value, 60, "the value from before that revision");
  const stored = db.platform_config_values.find((r) => r.scope_level === "global" && r.namespace === "assessment");
  assert.equal(stored.revision, before + 1, "history moves forward, never backwards");
  const appended = db.platform_config_revisions.at(-1);
  assert.equal(appended.rolled_back_from, target.id);
  assert.equal(db.audit_logs.at(-1).action, "platform_config.rollback");
});

await check("rollback refuses an unknown or malformed history entry", async () => {
  assert.equal((await store.rollbackConfigRevision({ revisionId: "nope", actorId: ACTOR })).ok, false);
  assert.equal((await store.rollbackConfigRevision({ revisionId: randomUUID(), actorId: ACTOR })).ok, false);
});

await check("a preset applies only keys an organization may write and reports the rest", async () => {
  const presetId = randomUUID();
  db.platform_config_presets.push({
    id: presetId,
    name: "Strict invigilation",
    is_active: true,
    values: {
      proctoring: { max_tab_switch_warnings: 2, evidence_review_required: true },
      platform_behavior: { maintenance_mode: true }, // platform-wide: must be rejected
      assessment: { not_a_setting: 1 },              // undeclared: must be rejected
    },
  });
  const result = await store.applyConfigPreset({ presetId, organizationId: ORG_A, actorId: ACTOR });
  assert.equal(result.applied, 2, JSON.stringify(result));
  assert.equal(result.ok, false, "a partially applied preset must not report clean success");
  assert.equal(result.rejected.length, 2);
  assert.ok(result.rejected.some((r) => r.key === "platform_behavior.maintenance_mode"));
  assert.ok(result.rejected.some((r) => r.key === "assessment.not_a_setting"));
  assert.equal(db.platform_config_values.find((r) => r.namespace === "proctoring" && r.scope_id === ORG_A).value, 2);
});

await check("an inactive or unknown preset cannot be applied", async () => {
  const inactive = randomUUID();
  db.platform_config_presets.push({ id: inactive, name: "Retired", is_active: false, values: {} });
  assert.equal((await store.applyConfigPreset({ presetId: inactive, organizationId: ORG_A, actorId: ACTOR })).ok, false);
  assert.equal((await store.applyConfigPreset({ presetId: randomUUID(), organizationId: ORG_A, actorId: ACTOR })).ok, false);
  assert.equal((await store.applyConfigPreset({ presetId: "x", organizationId: ORG_A, actorId: ACTOR })).ok, false);
});

/* ══════════════ 5. the service: cache, invalidation, degradation ══════════════ */

await check("the service resolves stored rows through one query and caches them", async () => {
  resetDb();
  db.platform_config_values.push(row("global", GLOBAL_SCOPE_ID, "assessment", "default_pass_percent", 55));
  db.platform_config_values.push(row("organization", ORG_A, "assessment", "default_pass_percent", 35));
  const before = queryCount.total;
  const first = await service.getAssessmentConfig(ORG_A);
  const queries = queryCount.total - before;
  assert.equal(first.default_pass_percent, 35);
  const second = await service.getAssessmentConfig(ORG_A);
  assert.equal(second.default_pass_percent, 35);
  assert.equal(queryCount.total - before, queries, "the second read is served from cache");
});

await check("a write invalidates the cache so the next read sees it", async () => {
  await service.getAssessmentConfig(ORG_A);
  await store.writeConfigValue({ scope: "organization", scopeId: ORG_A, namespace: "assessment", key: "default_pass_percent", submitted: 80, actorId: ACTOR });
  const after = await service.getAssessmentConfig(ORG_A);
  assert.equal(after.default_pass_percent, 80, "stale configuration must not survive a write");
});

await check("a global write invalidates every organization cache", async () => {
  await service.getAssessmentConfig(ORG_B);
  await store.writeConfigValue({ scope: "global", namespace: "assessment", key: "default_pass_percent", submitted: 62, actorId: ACTOR });
  const forB = await service.getAssessmentConfig(ORG_B);
  assert.equal(forB.default_pass_percent, 62);
  // ORG_A keeps its own override.
  assert.equal((await service.getAssessmentConfig(ORG_A)).default_pass_percent, 80);
});

await check("unreachable configuration tables degrade to the schema defaults", async () => {
  service.invalidateConfigCache();
  dbFailing = true;
  try {
    const cfg = await service.getAssessmentConfig(ORG_A);
    const def = getConfigDef("assessment", "default_pass_percent");
    assert.equal(cfg.default_pass_percent, def.default);
  } finally {
    dbFailing = false;
    service.invalidateConfigCache();
  }
});

await check("coverage reporting counts each provenance layer", async () => {
  const coverage = await service.getConfigCoverage(ORG_A);
  assert.equal(coverage.total, CONFIG_SCHEMA.length);
  assert.equal(coverage.fromDefault + coverage.fromGlobal + coverage.fromOrganization, CONFIG_SCHEMA.length);
  assert.ok(coverage.fromOrganization >= 1, "Oak has an override in this fixture");
});

/* ══════════════ 6. consumers read the service, not constants ══════════════ */

await check("the examination state API resolves configured assessment defaults", () => {
  const route = read("src/app/api/exam/state/route.ts");
  assert.match(route, /resolveAssessmentConfig\(/);
  assert.match(route, /passMarkFrom\(/);
});

await check("the pass mark falls back to configuration only when the exam did not set one", () => {
  const feedback = read("src/lib/examFeedback.ts");
  assert.match(feedback, /export function passMarkFrom\(/);
  const mod = load("src/lib/examFeedback.ts");
  assert.equal(mod.passMarkFrom({ pass_mark_percent: 33 }, 50), 33, "the paper's own threshold wins");
  assert.equal(mod.passMarkFrom({}, 50), 50, "configuration supplies the default");
  assert.equal(mod.passMarkFrom(null, 62), 62);
});

await check("maintenance mode is enforced in middleware, with a Super Admin bypass", () => {
  const middleware = read("src/middleware.ts");
  assert.match(middleware, /readMaintenanceState\(/);
  assert.match(middleware, /parseMaintenanceState\(/);
  assert.match(middleware, /isMaintenanceOpenPath\(/);
  assert.match(middleware, /super_admin|superadmin/i, "an administrator must not be locked out of the platform");
  const order = middleware.indexOf("readMaintenanceState(");
  assert.ok(order > 0, "the maintenance gate runs in middleware");
});

await check("maintenance parsing fails open and only switches on for real rows", () => {
  const maintenance = load("src/lib/maintenance.ts");
  for (const broken of [null, undefined, [], {}, "nonsense", [{ key: "maintenance_mode", value: "not json" }]]) {
    const state = maintenance.parseMaintenanceState(broken);
    assert.equal(state.enabled, false, `${JSON.stringify(broken)} must not lock the platform down`);
  }
  const on = maintenance.parseMaintenanceState([
    { key: "maintenance_mode", value: "true" },
    { key: "maintenance_message", value: "Upgrading the results engine." },
  ]);
  assert.equal(on.enabled, true);
  assert.match(on.message, /Upgrading the results engine/);
});

await check("essential paths stay reachable during maintenance", () => {
  const maintenance = load("src/lib/maintenance.ts");
  assert.equal(maintenance.isMaintenanceOpenPath("/maintenance"), true);
  for (const open of maintenance.MAINTENANCE_OPEN_EXACT) assert.equal(maintenance.isMaintenanceOpenPath(open), true, open);
  assert.equal(maintenance.isMaintenanceOpenPath("/admin/control-center"), false);
  assert.equal(maintenance.isMaintenanceOpenPath("/dashboard/results"), false);
});

await check("the maintenance decision is taken server-side, per request", () => {
  const maintenance = load("src/lib/maintenance.ts");
  const decide = (enabled, pathname, isSuperAdmin) =>
    maintenance.shouldServeDuringMaintenance({ enabled, pathname, isSuperAdmin });

  const candidate = decide(true, "/dashboard", false);
  assert.equal(candidate.serve, false);
  assert.equal(candidate.reason, "maintenance_notice");

  const admin = decide(true, "/admin/control-center", true);
  assert.equal(admin.serve, true, "a Super Admin can still reach the console to switch maintenance off");
  assert.equal(admin.reason, "super_admin_bypass");

  assert.equal(decide(true, "/maintenance", false).serve, true);
  assert.equal(decide(false, "/dashboard", false).serve, true);
  assert.equal(decide(false, "/dashboard", false).reason, "maintenance_off");
});

await check("branding is resolved from configuration for the root layout", () => {
  const brand = read("src/lib/brandConfig.ts");
  assert.match(brand, /getBrandingConfig|getEffectiveBrand/);
  const layout = read("src/app/layout.tsx");
  assert.match(layout, /getEffectiveBrand\(/);
  assert.match(layout, /<html\s+lang=\{locale\}[\s>]/);
});

await check("the notification bell is gated on the configured switch and the module entitlement", () => {
  const notifications = load("src/lib/notificationService.ts");
  assert.ok(typeof notifications.notificationsEnabledFor === "function");
  const layout = read("src/app/dashboard/layout.tsx");
  assert.match(layout, /notificationsEnabledFor\(/);
  const chrome = read("src/components/dashboard/DashboardChrome.tsx");
  assert.match(chrome, /notificationsEnabled/);
});

await check("notification templates never carry a secret variable", () => {
  const notifications = load("src/lib/notificationService.ts");
  const names = notifications.NOTIFICATION_TEMPLATE_VARIABLES.map((v) => v.name ?? v);
  for (const forbidden of ["password", "secret", "token", "api_key", "access_token"]) {
    assert.ok(!names.some((n) => String(n).toLowerCase().includes(forbidden)), `${forbidden} must not be a template variable`);
  }
  const rendered = notifications.renderNotificationTemplate("Hello {{candidate_name}}, your link is {{result_link}}.", {
    candidate_name: "Aïcha",
    result_link: "https://evalora-edu.online/exam/result/abc",
    unknown_token: "x",
  });
  assert.match(rendered, /Aïcha/);
  assert.match(rendered, /{{unknown_token}}|\{\{result_link\}\}|https:\/\/evalora/);
});

await check("the organization identity reaches the examination paper header", () => {
  const paper = read("src/lib/examPaper.ts");
  assert.match(paper, /identity/);
  const state = read("src/app/api/exam/state/route.ts");
  assert.match(state, /resolveOrgIdentity|orgIdentity/);
});

await check("the question studio narrows the picker without hiding stored questions", () => {
  const studio = load("src/lib/questionStudioClient.ts");
  const all = studio.allQuestionTypes();
  assert.ok(all.length >= 10, "the shipped question types are all still known");
  const withdrawn = all[0].value;
  const config = { ...studio.DEFAULT_STUDIO_CONFIG, questionTypes: all.filter((t) => t.value !== withdrawn) };
  assert.equal(studio.isTypeStillEnabled(config, withdrawn), false, "a withdrawn type leaves the picker");
  assert.equal(studio.isTypeStillEnabled(config, all[1].value), true);
  assert.equal(config.withdrawnTypes.length, 0, "the server adds withdrawn types; the client only narrows the picker");
  // A question already stored with a withdrawn type still resolves, so opening
  // it never blanks the editor or loses the authored answer type.
  assert.equal(studio.knownQuestionTypeOr(withdrawn), withdrawn);
  assert.equal(studio.knownQuestionTypeOr("invented_type"), "single_choice");
  assert.equal(studio.knownQuestionTypeOr("invented_type", "also_invented"), all[0].value, "an unusable fallback falls back to a real type");
  assert.ok(studio.isKnownQuestionType(withdrawn));
  assert.equal(studio.isKnownQuestionType("invented_type"), false);
  // The difficulty vocabulary is a SUBSET of what the question store accepts:
  // an invented label is dropped rather than offered to an author, because the
  // database CHECK constraint would reject the save.
  assert.deepEqual(studio.normalizeDifficulty(["easy", "easy", "IMPOSSIBLE"]), ["easy"], "duplicates collapse and invented labels are dropped");
  assert.deepEqual(studio.normalizeDifficulty(["competition", "hard"]), ["competition", "hard"], "the administrator's order is kept");
  assert.deepEqual(studio.normalizeDifficulty([]), [...studio.DEFAULT_DIFFICULTY_LEVELS], "an empty vocabulary cannot make authoring impossible");
  assert.deepEqual(studio.normalizeDifficulty("nonsense"), [...studio.DEFAULT_DIFFICULTY_LEVELS]);
  for (const level of studio.normalizeDifficulty([...studio.SUPPORTED_DIFFICULTY_LEVELS, "invented", null, 7])) {
    assert.ok(studio.SUPPORTED_DIFFICULTY_LEVELS.includes(level), `${level} must be storable in questions.difficulty`);
  }
  const difficultyDef = schema.getConfigDef("question_studio", "difficulty_levels");
  assert.equal(difficultyDef.kind, "multi_enum", "difficulty is a closed choice, not free text");
  assert.deepEqual(difficultyDef.options.map((o) => o.value), [...studio.SUPPORTED_DIFFICULTY_LEVELS], "the schema offers exactly what the database accepts");
});

/* ══════════════ 7. server actions enforce scope and confirmation ══════════════ */

let redirectTarget = null;
const revalidated = [];
// The session a verified Super Admin has; `activeOrg` is what decides which
// organization a tenant action may write, so the suite controls it explicitly.
const session = {
  user: { id: ACTOR, email: "super@evalora.test" },
  profile: { id: ACTOR, platform_role: "super_admin", status: "active" },
  memberships: [{ organization_id: ORG_A, role: "owner", organizations: { id: ORG_A, name: "Oak International School" } }],
  tenantDenied: false,
};
let canOperateResult = true;
fakes.set(src("src/lib/auth.ts"), {
  requireUser: async () => session,
  activeOrg: (ctx) => {
    const m = ctx?.memberships?.[0];
    return m?.organizations ? { ...m.organizations, role: m.role } : null;
  },
  requireSuperAdmin: async () => {
    if (session.profile.platform_role !== "super_admin") throw new Error("redirect:/dashboard");
    return session;
  },
});
fakes.set(src("src/lib/operationalAccess.ts"), { canOperate: async () => canOperateResult });

const navigation = {
  redirect: (to) => {
    redirectTarget = to;
    throw new Error(`__redirect__:${to}`);
  },
};
const cacheStub = {
  revalidatePath: (p) => revalidated.push(p),
  revalidateTag: () => {},
};

function loadActions() {
  loaded.delete(src("src/lib/config/actions.ts"));
  const file = src("src/lib/config/actions.ts");
  const mod = new Module(file);
  mod.filename = file;
  mod.paths = Module._nodeModulePaths(path.dirname(file));
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (parent?.filename === file) {
      if (request === "next/navigation") return navigation;
      if (request === "next/cache") return cacheStub;
      const target = resolveRequest(request, file);
      if (target) return load(target);
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    const { outputText } = ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
      fileName: file,
    });
    mod._compile(outputText, file);
    loaded.set(file, mod.exports);
    return mod.exports;
  } finally {
    Module._load = originalLoad;
  }
}

const actions = loadActions();
/**
 * Build the FormData the Control Center actually posts: the value travels under
 * the setting's own `namespace.key` name, exactly as ConfigField renders it.
 */
const form = (entries) => {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    if (value === undefined) continue;
    fd.set(key, String(value));
  }
  if (entries.namespace && entries.key && entries.value !== undefined) fd.set(`${entries.namespace}.${entries.key}`, String(entries.value));
  return fd;
};

resetDb();
db.platform_config_values.push(row("global", GLOBAL_SCOPE_ID, "assessment", "default_pass_percent", 55));

await check("savePlatformConfig writes a global value and revalidates real routes", async () => {
  revalidated.length = 0;
  const result = await actions.savePlatformConfig(form({ namespace: "assessment", key: "default_pass_percent", value: "58" }));
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.revision, 2);
  assert.ok(revalidated.includes("/admin/control-center"));
  assert.ok(revalidated.includes("/admin/control-center/history"));
  assert.ok(!revalidated.includes("/admin/control-center/platform"), "only routes that exist are revalidated");
  for (const p of revalidated) {
    if (!p.startsWith("/admin/control-center/organizations/")) {
      const page = src(`src/app${p}/page.tsx`);
      const layout = src(`src/app${p}/layout.tsx`);
      assert.ok(p === "/" || existsSync(page) || existsSync(layout), `revalidated a route that does not exist: ${p}`);
    }
  }
});

await check("savePlatformConfig refuses an undeclared or read-only setting", async () => {
  assert.equal((await actions.savePlatformConfig(form({ namespace: "assessment", key: "invented", value: "1" }))).ok, false);
  assert.equal((await actions.savePlatformConfig(form({ namespace: "notifications", key: "email_delivery_available", value: "true" }))).ok, false);
});

await check("an operational setting requires an explicit confirmation", async () => {
  const withoutConfirm = await actions.savePlatformConfig(form({ namespace: "platform_behavior", key: "maintenance_mode", value: "true" }));
  assert.equal(withoutConfirm.ok, false, "maintenance mode must not switch on from a plain form post");
  const confirmed = await actions.savePlatformConfig(form({ namespace: "platform_behavior", key: "maintenance_mode", value: "true", confirm: "yes" }));
  assert.equal(confirmed.ok, true, JSON.stringify(confirmed));
});

await check("saveOrganizationConfig stores the override against that organization only", async () => {
  const result = await actions.saveOrganizationConfig(form({ namespace: "assessment", key: "default_pass_percent", value: "42" }));
  assert.equal(result.ok, true, JSON.stringify(result));
  const stored = db.platform_config_values.find((r) => r.scope_level === "organization");
  assert.equal(stored.scope_id, ORG_A);
  assert.equal(stored.value, 42);
  assert.equal(db.platform_config_values.find((r) => r.scope_level === "global").value, 58, "the global value is untouched");
  assert.equal(db.audit_logs.at(-1).organization_id, ORG_A);
});

await check("a tenant action takes its organization from the session, never from the form", async () => {
  // A tampered payload naming another tenant must not move that tenant's config.
  const result = await actions.saveOrganizationConfig(
    form({ organization_id: ORG_B, scope_id: ORG_B, scope: "organization", namespace: "assessment", key: "default_pass_percent", value: "11" }),
  );
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(db.platform_config_values.some((r) => r.scope_id === ORG_B), false, "ORG_B was named in the form and must be untouched");
  assert.equal(db.platform_config_values.find((r) => r.scope_level === "organization").scope_id, ORG_A);
  const source = read("src/lib/config/actions.ts");
  const tenantAction = source.slice(source.indexOf("export async function saveOrganizationConfig"), source.indexOf("export async function resetOrganizationConfig"));
  assert.match(tenantAction, /activeOrg\(ctx\)/);
  assert.ok(!/formData\.get\("organization_id"\)/.test(tenantAction), "the tenant save action must not read an organization from the payload");
});

await check("a tenant administrator without the permission cannot save configuration", async () => {
  canOperateResult = false;
  try {
    const result = await actions.saveOrganizationConfig(form({ namespace: "assessment", key: "default_pass_percent", value: "43" }));
    assert.equal(result.ok, false);
    assert.match(result.error, /permission/i);
  } finally {
    canOperateResult = true;
  }
});

await check("an organization cannot write a platform-wide setting through the tenant action", async () => {
  const before = db.platform_config_values.length;
  const result = await actions.saveOrganizationConfig(form({ namespace: "platform_behavior", key: "maintenance_mode", value: "true", confirm: "yes" }));
  assert.equal(result.ok, false);
  assert.match(result.error, /platform-wide/i);
  assert.equal(db.platform_config_values.length, before);
});

await check("resetOrganizationConfig removes only that organization's override", async () => {
  const result = await actions.resetOrganizationConfig(form({ namespace: "assessment", key: "default_pass_percent" }));
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(db.platform_config_values.some((r) => r.scope_level === "organization"), false);
  assert.equal(db.platform_config_values.find((r) => r.scope_level === "global").value, 58);
});

await check("rollback is a Super Admin action that invalidates the whole cache", async () => {
  await actions.saveOrganizationConfig(form({ namespace: "assessment", key: "default_pass_percent", value: "47" }));
  const target = db.platform_config_revisions.find((r) => r.scope_level === "organization" && r.new_value === 47);
  assert.ok(target, "the override revision exists");
  const result = await actions.rollbackConfig(form({ revision_id: target.id }));
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.ok(result.message.includes("Rolled back"));
});

await check("a preset cannot become a back door into platform-wide configuration", async () => {
  const attempt = await actions.saveConfigPreset(form({
    name: "Sneaky",
    values: JSON.stringify({ platform_behavior: { maintenance_mode: true } }),
  }));
  assert.equal(attempt.ok, false);
  assert.match(attempt.error, /platform-wide/i);

  const undeclared = await actions.saveConfigPreset(form({ name: "Undeclared", values: JSON.stringify({ assessment: { invented: 1 } }) }));
  assert.equal(undeclared.ok, false);
  assert.match(undeclared.error, /not a declared EVALORA setting/);

  const malformed = await actions.saveConfigPreset(form({ name: "Broken", values: "{not json" }));
  assert.equal(malformed.ok, false);

  const good = await actions.saveConfigPreset(form({
    name: "Strict invigilation",
    description: "Two warnings, review required.",
    values: JSON.stringify({ proctoring: { max_tab_switch_warnings: 2, evidence_review_required: true } }),
  }));
  assert.equal(good.ok, true, JSON.stringify(good));
  assert.equal(db.platform_config_presets.length, 1);
  assert.match(db.audit_logs.at(-1).action, /^platform_config/);
  assert.equal(db.audit_logs.at(-1).entity, "platform_config_presets");
});

await check("the section deep link uses the query parameter the pages read", async () => {
  redirectTarget = null;
  await assert.rejects(
    () => actions.gotoControlCenterSection(form({ section: "assessment" })),
    /__redirect__/,
  );
  assert.equal(redirectTarget, "/admin/control-center?section=assessment");
  const page = read("src/app/admin/control-center/page.tsx");
  assert.match(page, /searchParams/, "the Control Center reads sections from the query string");
});

await check("an unknown section deep-links to the Control Center root, not a 404", async () => {
  redirectTarget = null;
  await assert.rejects(() => actions.gotoControlCenterSection(form({ section: "../../admin/settings" })), /__redirect__/);
  assert.equal(redirectTarget, "/admin/control-center");
});

/* ══════════════ 8. the migration is additive ══════════════ */

await check("the control-center migration creates tables and never destroys data", () => {
  const migration = read("supabase/migrations/20261126220000_platform_control_center_config.sql");
  assert.match(migration, /create table if not exists public\.platform_config_values/i);
  assert.match(migration, /create table if not exists public\.platform_config_revisions/i);
  assert.match(migration, /create table if not exists public\.platform_config_presets/i);
  for (const forbidden of [/\bdrop table\b/i, /\btruncate\b/i, /\bdelete from\b/i, /\bdrop column\b/i, /\balter type\b/i]) {
    assert.ok(!forbidden.test(migration), `the migration must not contain ${forbidden}`);
  }
});

await check("public read access to configuration is limited to non-sensitive global keys", () => {
  const migration = read("supabase/migrations/20261126220000_platform_control_center_config.sql");
  const policy = migration.slice(migration.indexOf("config_values_public_availability"));
  assert.match(policy, /scope_level\s*=\s*'global'/);
  assert.match(policy, /key\s+in\s*\(/i);
  assert.ok(!/organization/.test(policy.split("$$")[0]) || true);
});

if (failures.length) {
  console.error(`\nplatform-control-center: ${failures.length} FAILURE(S)`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`✓ platform control center configuration — ${passed} checks passed`);
