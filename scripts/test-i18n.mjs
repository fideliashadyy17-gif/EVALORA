// Multilingual system checks — dictionary parity, placeholders, structure.
//
//   node scripts/test-i18n.mjs
//
// The dictionaries are plain object literals with `as const` and comments —
// evaluated directly here so the REAL shipped files are tested, not a copy.
import { readFileSync } from "node:fs";

let checks = 0;
const failures = [];

function ok(cond, message) {
  checks += 1;
  if (!cond) failures.push(message);
}

function loadDict(lang) {
  const src = readFileSync(`src/lib/i18n/dictionaries/${lang}.ts`, "utf8");
  const start = src.indexOf("export const");
  ok(start >= 0, `${lang}: export const marker missing`);
  // Terminator: `} as const;` (en) or the top-level `};` closing the literal.
  const asConst = src.indexOf("as const;", start);
  const plainEnd = src.indexOf("\n};", start);
  const end = asConst >= 0 ? asConst + "as const;".length : plainEnd >= 0 ? plainEnd + 3 : -1;
  ok(end > start, `${lang}: object terminator missing`);
  let body = src.slice(start, end);
  body = body.replace(/^export const \w+ =/m, "return (");
  body = body.replace(/as const;?/, "");
  body = body.replace(/;+\s*$/, "");
  body = `${body});`;
  const dict = new Function(body)();
  ok(dict && typeof dict === "object", `${lang}: dictionary did not evaluate`);
  return dict;
}

function flatten(value, prefix = "", out = new Map()) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [k, v] of Object.entries(value)) {
      flatten(v, prefix ? `${prefix}.${k}` : k, out);
    }
  } else {
    out.set(prefix, String(value));
  }
  return out;
}

const PLACEHOLDER = /\{(\w+)\}/g;
function placeholders(text) {
  return new Set([...text.matchAll(PLACEHOLDER)].map((m) => m[1]));
}

const en = loadDict("en");
const fr = loadDict("fr");
const es = loadDict("es");

const enKeys = flatten(en);
const frKeys = flatten(fr);
const esKeys = flatten(es);

// 1. Key parity — every English key exists in fr/es and vice versa.
ok(enKeys.size > 350, `en dictionary unexpectedly small (${enKeys.size} keys)`);
for (const key of enKeys.keys()) {
  ok(frKeys.has(key), `fr missing key: ${key}`);
  ok(esKeys.has(key), `es missing key: ${key}`);
}
for (const key of frKeys.keys()) ok(enKeys.has(key), `fr has extra key: ${key}`);
for (const key of esKeys.keys()) ok(enKeys.has(key), `es has extra key: ${key}`);

// 2. Placeholder parity — {param} sets identical across locales.
for (const [key, value] of enKeys) {
  const expected = placeholders(value);
  for (const [lang, map] of [["fr", frKeys], ["es", esKeys]]) {
    if (!map.has(key)) continue;
    const got = placeholders(map.get(key));
    const missing = [...expected].filter((p) => !got.has(p));
    const extra = [...got].filter((p) => !expected.has(p));
    ok(missing.length === 0, `${lang} ${key}: missing placeholders ${missing.join(",")}`);
    ok(extra.length === 0, `${lang} ${key}: unexpected placeholders ${extra.join(",")}`);
  }
}

// 3. No empty translations.
for (const [lang, map] of [["fr", frKeys], ["es", esKeys]]) {
  for (const [key, value] of map) {
    ok(value.trim().length > 0, `${lang} ${key}: empty value`);
  }
}

// 4. Required namespaces present (trilingual coverage anchors).
for (const section of ["common", "actions", "nav", "public", "auth", "portal", "examAccess", "dashboard", "results", "exam", "errors", "notifications", "student", "admin", "i18n"]) {
  ok(section in en, `en missing section ${section}`);
  ok(section in fr, `fr missing section ${section}`);
  ok(section in es, `es missing section ${section}`);
}

// 5. Exam content isolation by structure: no question/paper/content namespaces.
for (const dict of [en, fr, es]) {
  for (const banned of ["questions", "paper", "examContent", "content", "curriculum", "items"]) {
    ok(!(banned in dict), `dictionary must not contain exam-content namespace: ${banned}`);
  }
}

// 6. Interface switcher labels are exactly the native names.
ok(en.i18n.interfaceLanguage === "Interface language", "en interface label");
ok(typeof fr.nav === "object" && "signIn" in fr.nav, "fr nav.signIn present");

// 7. Source files: locale cookie + no session mutation on switch.
const provider = readFileSync("src/components/i18n/I18nProvider.tsx", "utf8");
const serverI18n = readFileSync("src/lib/i18n/server.ts", "utf8");
const localeAction = readFileSync("src/lib/i18n/actions.ts", "utf8");
const localeMigration = readFileSync("supabase/migrations/20261124191000_profile_interface_locale.sql", "utf8");

// Per-user server-storable persistence (plus cookie for anonymous visitors).
ok(/interface_locale/.test(localeMigration) && /add column if not exists interface_locale text/.test(localeMigration),
  "profiles.interface_locale additive migration exists");
ok(/export async function saveLocalePreference/.test(localeAction), "server action to save per-user locale exists");
ok(/isLocale\(locale\)/.test(localeAction), "saveLocalePreference validates the locale");
ok(/profiles[\s\S]{0,400}interface_locale/.test(localeAction), "saveLocalePreference writes profiles.interface_locale");
ok(/auth\.getUser\(\)/.test(localeAction), "saveLocalePreference verifies the session first");
ok(provider.includes("saveLocalePreference(next)"), "setLocale mirrors the choice to the profile");
ok(/interface_locale/.test(serverI18n), "getRequestLocale falls back to the stored profile preference");
ok(/cookieValue/.test(serverI18n), "cookie remains the first persistence source");
// Exam content language column must not be involved anywhere in UI locale code.
ok(!/settings\.language|exam_content/.test(localeAction + serverI18n), "UI locale persistence never touches exam content language");

const i18nConfig = readFileSync("src/lib/i18n/config.ts", "utf8");
ok(/LOCALE_COOKIE\s*=\s*"evalora_locale"/.test(i18nConfig), "locale cookie name must be evalora_locale");
ok(!/signOut|sign_out/.test(provider), "setLocale must never sign the user out");
ok(provider.includes("router.refresh"), "setLocale must refresh the current route");

if (failures.length) {
  console.error(`i18n: ${failures.length} FAILURE(S)`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`i18n: ${checks} checks passed`);
