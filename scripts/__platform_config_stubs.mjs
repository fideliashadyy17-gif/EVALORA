/**
 * Shared module-resolution fallback for the source-executing test suites.
 *
 * Many suites in this repository run REAL application code: they read a
 * `.ts`/`.tsx` file, transpile it with the TypeScript compiler API and execute
 * it through a `Module._load` interceptor that stubs the boundaries the suite
 * cares about (auth, database, `next/*`). That interceptor only knows the
 * specifiers that existed when the suite was written, so every new `@/…`
 * import in a file under test made the suite die with MODULE_NOT_FOUND before
 * a single assertion ran.
 *
 * This shim is installed FIRST, so each suite's own interceptor still runs
 * first and still wins. It is only reached for specifiers the suite does not
 * handle — the ones that previously crashed it.
 *
 * Fidelity rule: stub the DATA-ACCESS boundary, run everything else for real.
 *
 *   • `@/lib/config/service` is replaced by a resolver that returns the
 *     declared schema defaults for a namespace. That is exactly what the real
 *     service returns when the configuration tables hold no rows, so modules
 *     under test execute their genuine logic against an unconfigured platform
 *     instead of against a permissive fake.
 *   • `@/lib/supabase/server`, `next/*` and `server-only` are inert, because
 *     there is no database, no request context and no bundler in a bare Node
 *     process.
 *   • every other `@/…` module (assessmentConfig, orgIdentity,
 *     proctoringConfig, notificationService, maintenance, formatting,
 *     questionDesign, integrity, modules …) is transpiled and executed for
 *     real, so the assertions still test the shipped code paths.
 *
 * A module that cannot be loaded is reported loudly rather than silently
 * replaced by a permissive proxy: a suite must fail visibly, never pass
 * vacuously.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { Module } from "node:module";
import path from "node:path";
import ts from "typescript";

const ROOT = process.cwd();
const EXTENSIONS = [".ts", ".tsx", "/index.ts", "/index.tsx"];

/** Resolve an `@/…` specifier to a real file inside `src/`, or null. */
function resolveAlias(specifier) {
  if (!specifier.startsWith("@/")) return null;
  return resolveFromBase(path.join(ROOT, "src"), specifier.slice(2));
}

/**
 * Resolve a RELATIVE specifier from a module this shim loaded. Node's own
 * resolver cannot do this: the sources are TypeScript, so `./config/service`
 * has to be tried as `.ts` / `.tsx` / `/index.ts` before it resolves.
 */
function resolveRelative(specifier, parentFilename) {
  if (!specifier.startsWith(".")) return null;
  if (!parentFilename) return null;
  // Only handle parents inside src/ — anywhere else Node's resolver is correct.
  const srcRoot = path.join(ROOT, "src");
  if (!parentFilename.startsWith(srcRoot)) return null;
  const absolute = path.resolve(path.dirname(parentFilename), specifier);
  return resolveFromBase(absolute, "");
}

/**
 * Resolve a fully or partially built path: an existing file wins, otherwise the
 * TypeScript extensions Next.js allows in `paths`/relative imports are probed.
 * Several sources import with an explicit `.ts` extension ("./mathProse.ts"),
 * so the bare path has to be tried before any suffix is appended — otherwise
 * Node's own loader picks the file up as ESM and its extensionless imports fail.
 */
function resolveFromBase(base, suffix) {
  const stem = suffix ? path.join(base, suffix) : base;
  if (existsSync(stem) && statSync(stem).isFile()) return stem;
  for (const ext of EXTENSIONS) {
    const candidate = `${stem}${ext}`;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/* ─────────────────────── inert boundaries ─────────────────────── */

/** A chainable query builder that always resolves to "nothing found". */
function emptyDb() {
  const chain = {
    select: () => chain,
    eq: () => chain,
    neq: () => chain,
    in: () => chain,
    is: () => chain,
    not: () => chain,
    or: () => chain,
    ilike: () => chain,
    like: () => chain,
    contains: () => chain,
    order: () => chain,
    limit: () => chain,
    range: () => chain,
    single: async () => ({ data: null, error: { message: "no database in test harness" } }),
    maybeSingle: async () => ({ data: null, error: null }),
    insert: () => chain,
    update: () => chain,
    upsert: () => chain,
    delete: () => chain,
    rpc: async () => ({ data: null, error: { message: "no database in test harness" } }),
    then: (resolve) => resolve({ data: [], error: null, count: 0 }),
  };
  return {
    from: () => chain,
    storage: { from: () => ({ upload: async () => ({ error: null }), remove: async () => ({ error: null }), getPublicUrl: () => ({ data: { publicUrl: "" } }) }) },
    auth: { getUser: async () => ({ data: { user: null } }), getSession: async () => ({ data: { session: null } }) },
  };
}

const NEXT_STUBS = {
  "server-only": {},
  "client-only": {},
  "next/cache": { revalidatePath: () => {}, revalidateTag: () => {}, unstable_cache: (fn) => fn },
  "next/headers": {
    cookies: async () => ({ get: () => undefined, getAll: () => [], set: () => {}, delete: () => {} }),
    headers: async () => new Headers(),
    draftMode: async () => ({ isEnabled: false }),
  },
  "next/navigation": {
    redirect: (url) => {
      const error = new Error(`NEXT_REDIRECT ${url}`);
      error.url = url;
      error.digest = `NEXT_REDIRECT;push;${url}`;
      throw error;
    },
    notFound: () => {
      const error = new Error("NEXT_NOT_FOUND");
      error.digest = "NEXT_NOT_FOUND";
      throw error;
    },
    permanentRedirect: (url) => {
      const error = new Error(`NEXT_REDIRECT ${url}`);
      error.url = url;
      throw error;
    },
  },
  "@/lib/supabase/server": {
    createClient: async () => emptyDb(),
    createAdminClient: () => emptyDb(),
    createBrowseClient: () => emptyDb(),
  },
};

/* ─────────── configuration service: schema defaults, no rows ─────────── */

const schemaCache = { loaded: false, byNamespace: new Map(), defs: [] };

function loadSchemaDefaults() {
  if (schemaCache.loaded) return schemaCache;
  const schema = loadRealModule(path.join(ROOT, "src/lib/config/schema.ts"));
  const defs = Array.isArray(schema?.CONFIG_SCHEMA) ? schema.CONFIG_SCHEMA : [];
  for (const def of defs) {
    if (!def || typeof def.namespace !== "string") continue;
    const bucket = schemaCache.byNamespace.get(def.namespace) ?? {};
    bucket[def.key] = def.default === undefined ? null : structuredClone(def.default);
    schemaCache.byNamespace.set(def.namespace, bucket);
  }
  schemaCache.defs = defs;
  schemaCache.loaded = true;
  return schemaCache;
}

function namespaceDefaults(namespace) {
  const { byNamespace } = loadSchemaDefaults();
  return byNamespace.get(namespace) ?? {};
}

function configServiceStub() {
  const get = (namespace) => async () => namespaceDefaults(namespace);
  return {
    invalidateConfigCache: () => {},
    loadConfigRows: async () => [],
    getNamespaceConfig: async (namespace) => namespaceDefaults(namespace),
    getNamespaceProvenance: async () => ({}),
    getFullResolution: async () => ({ values: {}, provenance: {} }),
    getConfigCoverage: async () => ({ total: 0, fromDefault: 0, fromGlobal: 0, fromOrganization: 0, byNamespace: {} }),
    getBrandingConfig: get("branding"),
    getLocalizationConfig: get("localization"),
    getFormattingConfig: get("formatting"),
    getPlatformBehaviorConfig: get("platform_behavior"),
    getAssessmentConfig: get("assessment"),
    getExaminationDefaults: get("examination"),
    getQuestionStudioConfig: get("question_studio"),
    getProctoringConfig: get("proctoring"),
    getNotificationsConfig: get("notifications"),
    getOrgIdentityConfig: get("org_identity"),
  };
}

/** Writes are refused: a suite exercising a config write must stub the store itself. */
function configStoreStub() {
  const refused = async () => ({ ok: false, error: "configuration storage is not available in this test harness" });
  return {
    writeConfigValue: refused,
    resetConfigToInherit: refused,
    rollbackConfigRevision: refused,
    applyConfigPreset: async () => ({ ok: false, applied: 0, rejected: [{ key: "*", error: "unavailable in harness" }] }),
  };
}

/* ─────────────────────── real-module loader ─────────────────────── */

const realCache = new Map();
let loading = null;

function loadRealModule(file) {
  if (realCache.has(file)) return realCache.get(file);
  if (loading === file) {
    // Circular import: hand back the partially populated exports object, the
    // same way Node does, rather than recursing forever.
    return {};
  }
  const previous = loading;
  loading = file;
  const mod = new Module(file);
  mod.filename = file;
  mod.paths = Module._nodeModulePaths(path.dirname(file));
  realCache.set(file, mod.exports);
  try {
    const source = readFileSync(file, "utf8");
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
        resolveJsonModule: true,
      },
      fileName: file,
    });
    mod._compile(outputText, file);
    realCache.set(file, mod.exports);
    return mod.exports;
  } finally {
    loading = previous;
  }
}

/* ─────────────────────── installation ─────────────────────── */

const BOUNDARY = {
  ...NEXT_STUBS,
  "@/lib/config/service": null, // filled lazily: needs the transpiler
  "@/lib/config/store": null,
};

let installed = false;

/**
 * Install the fallback. Idempotent, and safe to call before a suite installs
 * its own interceptor: the suite's interceptor is layered on top and always
 * takes precedence for the specifiers it handles.
 */
export function installPlatformConfigStubs() {
  if (installed) return;
  installed = true;

  const base = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (typeof request === "string") {
      if (request === "@/lib/config/service") return configServiceStub();
      if (request === "@/lib/config/store") return configStoreStub();
      if (request in BOUNDARY && BOUNDARY[request]) return BOUNDARY[request];
      const file = resolveAlias(request) ?? resolveRelative(request, parent?.filename);
      if (file) {
        try {
          return loadRealModule(file);
        } catch (error) {
          throw new Error(
            `[platform-config-stubs] could not load the real module for ${request} (${file}): ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
    }
    return base.apply(this, arguments);
  };
}

export { emptyDb, namespaceDefaults };

// Self-installing on import. A suite adds `import "./__platform_config_stubs.mjs";`
// as its first import and every interceptor it defines afterwards layers on top
// of this one, so suite-specific stubs always take precedence.
installPlatformConfigStubs();
