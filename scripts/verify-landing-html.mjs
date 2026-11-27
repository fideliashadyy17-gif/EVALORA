#!/usr/bin/env node
/**
 * EVALORA — landing page verification without a browser.
 *
 * Fetches the server-rendered HTML of the public pages from a running build and
 * checks the things that a type-check cannot: accessibility (axe-core), link
 * resolution, heading structure, image alt text and the honest-claims pins.
 *
 *   npx next start -p 3100 &
 *   node scripts/verify-landing-html.mjs
 *
 * Dependencies (`jsdom`, `axe-core`) are dev-only and installed on demand; the
 * script tells you the command if they are missing rather than failing.
 */
import { readFileSync } from "node:fs";

const BASE = process.env.LANDING_URL || "http://127.0.0.1:3100";

let JSDOM;
let axeSource;
try {
  ({ JSDOM } = await import("jsdom"));
  axeSource = readFileSync(new URL("../node_modules/axe-core/axe.min.js", import.meta.url), "utf8");
} catch {
  console.error("Missing dev dependencies. Run: npm i --no-save jsdom axe-core");
  process.exit(2);
}

const PUBLIC_ROUTES = [
  "/",
  "/features",
  "/how-it-works",
  "/use-cases",
  "/pricing",
  "/faq",
  "/join",
  "/login",
  "/register",
  "/contact",
  "/help",
  "/privacy",
  "/terms",
  "/cookies",
];

const failures = [];
const ok = (condition, label, detail = "") => {
  console.log(`${condition ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!condition) failures.push(label);
};

for (const route of PUBLIC_ROUTES) {
  const response = await fetch(BASE + route);
  const html = await response.text();
  const dom = new JSDOM(html, { runScripts: "outside-only", url: BASE + route });
  const { window } = dom;
  window.eval(axeSource);
  // jsdom has no layout engine, so colour contrast cannot be computed here. It is
  // covered by scripts/check-contrast.mjs against the design tokens instead.
  const results = await window.axe.run(window.document, {
    resultTypes: ["violations"],
    rules: { "color-contrast": { enabled: false } },
  });
  const doc = window.document;
  const h1 = doc.querySelectorAll("h1").length;
  const noAlt = [...doc.querySelectorAll("img")].filter((i) => !i.hasAttribute("alt")).length;
  ok(response.status === 200, `${route} responds 200`);
  ok(results.violations.length === 0, `${route} has 0 axe violations`, results.violations.map((v) => v.id).join(", "));
  ok(h1 === 1, `${route} has exactly one h1`, String(h1));
  ok(noAlt === 0, `${route} images all have alt text`, `${noAlt} missing`);
}

/* Landing-specific structure and honesty pins */
const home = await (await fetch(BASE + "/")).text();
const homeDoc = new JSDOM(home, { url: BASE + "/" }).window.document;

/**
 * What a visitor actually reads.
 *
 * The raw HTML of a server-rendered page also carries the flight data, which
 * serialises the whole translation catalogue into the document. Scanning that for
 * marketing claims matches strings nobody ever sees: `common.comingSoon` is an
 * unused label in the catalogue, and on its own it failed the "no placeholder
 * promises" pin while every visible sentence on the page was honest. The same
 * trap waits for any future catalogue entry containing "AI". So the honesty pins
 * read the rendered copy — the document with the non-rendered elements removed.
 */
const visibleText = (doc) => {
  const clone = doc.documentElement.cloneNode(true);
  for (const selector of ["script", "style", "noscript", "template"]) {
    for (const node of clone.querySelectorAll(selector)) node.remove();
  }
  return (clone.textContent ?? "").replace(/\s+/g, " ");
};
const homeText = visibleText(homeDoc);

ok(Boolean(homeDoc.querySelector('a[href="#main-content"]')), "landing has a skip link");
ok(Boolean(homeDoc.querySelector("main#main-content")), "landing has one main landmark");
ok(homeDoc.querySelectorAll('[role="tablist"]').length >= 2, "landing tab interfaces are exposed as tablists");
ok(homeDoc.querySelectorAll("details").length >= 5, "landing FAQ uses native disclosure widgets");

// Every internal link must resolve.
const internal = [...new Set([...homeDoc.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")).filter((h) => h.startsWith("/")))];
const broken = [];
for (const href of internal) {
  const r = await fetch(BASE + href, { redirect: "manual" });
  if (r.status >= 400) broken.push(`${href} → ${r.status}`);
}
ok(broken.length === 0, "every internal landing link resolves", broken.join(", "));

// Honest-claims pins: these must be present, and the not-shipped features must not be sold.
const mustSay = [
  [/recording is not enabled/i, "proctoring recording limit is disclosed"],
  [/Windows 10/i, "Lockdown scope is stated"],
  [/never a[n]? (automatic )?verdict|human review|reviewed by a person|human-reviewed/i, "human review is stated"],
  [/manual payment|verified by our team/i, "manual payment verification is stated"],
];
for (const [re, label] of mustSay) ok(re.test(homeText), label);

const mustNotSell = [
  [/AI[- ]powered|AI[- ]generated questions|GPT/i, "no AI generation claim"],
  [/session recording (is )?(enabled|included)/i, "no recording claim"],
  [/coming soon/i, "no placeholder promises"],
];
for (const [re, label] of mustNotSell) ok(!re.test(homeText), label);

console.log(`\n${failures.length === 0 ? "PASS" : "FAIL"} — ${failures.length} failing check(s)`);
if (failures.length) process.exit(1);
