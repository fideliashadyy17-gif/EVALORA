/**
 * A tiny TypeScript loader for the pure-logic test scripts.
 *
 * Several scripts compile a handful of `src/lib/*.ts` modules with
 * `ts.transpileModule` so they can exercise real production code without a
 * database, a browser or a Next build. That only works while those modules
 * keep their imports local: as soon as `scoring.ts` reaches `./autoMark`,
 * which reaches `./marking/summativeBRubrics`, which reaches a `.json` file,
 * per-directory `require` resolution breaks.
 *
 * This loader resolves every relative and `@/` specifier back to its source
 * file under `src/`, compiling dependencies on demand and caching them, so a
 * harness can compile one entry point and get the whole graph. Bare
 * specifiers (`react`, `next/server`, …) are left to Node as before, and an
 * explicit `stubs` map still wins, which is what the existing harnesses use to
 * swap in a fake Supabase client.
 */
import { existsSync, readFileSync } from "node:fs";
import { Module } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Absolute filename of every module we have compiled, mapped to its source path. */
const registry = new Map();
const cache = new Map();

/** `src/lib/scoring.ts` for `./assessParts`, or null for a bare specifier. */
function sourceFor(spec, fromRel) {
  if (spec.startsWith("@/")) return `src/${spec.slice(2)}`;
  if (!spec.startsWith(".")) return null;
  return path.posix.normalize(path.posix.join(path.posix.dirname(fromRel), spec));
}

function sourceFile(rel) {
  if (rel.endsWith(".ts") || rel.endsWith(".tsx")) return rel;
  return existsSync(path.join(ROOT, `${rel}.tsx`)) ? `${rel}.tsx` : `${rel}.ts`;
}

let hooked = false;

function hook() {
  if (hooked) return;
  hooked = true;
  const original = Module._load;
  Module._load = function load(request, parent, isMain) {
    const rel = parent?.filename ? registry.get(parent.filename) : undefined;
    if (rel) {
      const source = sourceFor(request, rel);
      if (source) {
        if (source.endsWith(".json")) {
          // Works with and without `esModuleInterop`: a plain object satisfies
          // `x.default` only if we set it, and named JSON imports read the rest.
          const parsed = JSON.parse(readFileSync(path.join(ROOT, source), "utf8"));
          return { __esModule: true, default: parsed, ...parsed };
        }
        const file = sourceFile(source);
        if (existsSync(path.join(ROOT, file))) return loadModule(file);
      }
    }
    return original.apply(this, arguments);
  };
}

function loadModule(rel, filename, stubs) {
  hook();
  const cached = cache.get(rel);
  if (cached) return cached.exports;

  const file = path.resolve(filename ?? path.join(ROOT, rel));
  const mod = new Module(file);
  mod.filename = file;
  mod.paths = Module._nodeModulePaths(path.dirname(file));
  registry.set(file, rel);

  const entry = { exports: mod.exports, stubs: stubs ?? {} };
  cache.set(rel, entry);

  // Registered before compiling so an import cycle returns the partial exports
  // object instead of recursing forever.
  const previous = Module._load;
  Module._load = function load(request, parent, isMain) {
    if (parent?.filename === file && request in entry.stubs) return entry.stubs[request];
    return previous.apply(this, arguments);
  };
  try {
    const emitted = ts.transpileModule(readFileSync(path.join(ROOT, rel), "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        resolveJsonModule: true,
        esModuleInterop: true,
        // .tsx compiles to the automatic JSX runtime, so a component needs no
        // `import React` and resolves `react/jsx-runtime` from node_modules.
        jsx: rel.endsWith(".tsx") ? ts.JsxEmit.ReactJSX : ts.JsxEmit.None,
      },
    }).outputText;
    mod._compile(emitted, file);
  } finally {
    Module._load = previous;
  }
  return mod.exports;
}

/**
 * Compile `src/...rel` (and everything it imports from `src/`) and return its
 * exports. `stubs` overrides named specifiers for that one module.
 */
export function loadTs(rel, stubs = {}) {
  return loadModule(rel, undefined, stubs);
}

/**
 * Drop-in replacement for the inline `compile(src, name, deps)` helpers in the
 * older test scripts: same argument order, but dependencies resolve.
 */
export function compile(src, name, deps = {}) {
  const rel = path.relative(ROOT, path.resolve(src)).split(path.sep).join("/");
  return loadModule(rel, name, deps);
}
