// Verifies the platform attribution is rendered on every public surface.
//
// The string lives in one component (src/components/PlatformCredit.tsx) mounted
// in four shells. This check exists because the attribution had been dropped
// entirely at some point in the project's history with nothing to catch it:
// a render-time assertion is the only thing that would have failed.
//
//   npm run build && npx next start -p 3200
//   node scripts/verify-attribution.mjs
//
// Routes that legitimately do not carry it on a fresh request are documented
// below rather than silently ignored.

const EXPECTED = "Powered by M. SADIKOU";

// The origin must be supplied. Defaulting to a port of my own choosing is how
// this check silently passed nothing in CI: the workflow serves on :3100, the
// script assumed :3200, every fetch failed to connect and every route reported
// "HTTP 0" — a green step that had verified nothing.
const BASE = (process.env.LANDING_URL ?? process.env.BASE ?? "").replace(/\/$/, "");
if (!BASE) {
  console.error("✗ set BASE (or LANDING_URL) to the server origin, e.g. BASE=http://127.0.0.1:3100");
  process.exit(2);
}
try {
  const probe = await fetch(BASE + "/login", { redirect: "manual" });
  if (!probe.ok) throw new Error(`HTTP ${probe.status}`);
} catch (error) {
  console.error(`✗ nothing is answering at ${BASE} (${error.message}) — start the server or fix BASE`);
  process.exit(2);
}

/** Public routes that must render the attribution directly. */
const PUBLIC_ROUTES = [
  "/",
  "/pricing",
  "/features",
  "/how-it-works",
  "/use-cases",
  "/login",
  "/register",
  "/forgot-password",
  "/contact",
  "/faq",
  "/help",
  "/privacy",
  "/terms",
  "/cookies",
  "/exam-access",
];

/**
 * Routes that redirect an anonymous visitor. The attribution is present on the
 * destination, so the assertion follows the redirect instead of skipping it.
 */
const REDIRECTING_ROUTES = ["/workspaces", "/dashboard", "/admin"];

let failures = 0;
function record(ok, label, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) {
    failures += 1;
    if (process.env.GITHUB_ACTIONS) {
      console.log(`::error title=Attribution missing::${label}${detail ? ` — ${detail}` : ""}`);
    }
  }
}

for (const route of PUBLIC_ROUTES) {
  const res = await fetch(BASE + route, { redirect: "manual" }).catch((error) => ({ ok: false, status: 0, text: async () => String(error) }));
  const html = await res.text();
  const count = (html.match(new RegExp(EXPECTED.replace(/\./g, "\\."), "g")) ?? []).length;
  record(res.status === 200 && count >= 1, route, `HTTP ${res.status}, found ×${count}`);
}

for (const route of REDIRECTING_ROUTES) {
  const first = await fetch(BASE + route, { redirect: "manual" }).catch(() => null);
  const location = first?.headers?.get("location");
  if (!location) {
    // A signed-out visitor may also be served the page directly depending on
    // middleware configuration; either outcome is acceptable as long as the
    // final document carries the attribution.
    const html = await (await fetch(BASE + route)).text();
    record(html.includes(EXPECTED), route, "served directly");
    continue;
  }
  const html = await (await fetch(new URL(location, BASE))).text();
  record(html.includes(EXPECTED), route, `redirects to ${new URL(location, BASE).pathname}`);
}

// The landing page is the one public surface with its own footer, so assert it
// exactly once there rather than relying on the shared shell.
const home = await (await fetch(BASE + "/")).text();
record(/<footer[\s\S]*Powered by M\. SADIKOU[\s\S]*<\/footer>/.test(home), "landing footer contains the attribution");

console.log(
  failures === 0
    ? `\nPASS: ${EXPECTED} is rendered on every public surface`
    : `\nFAIL: ${failures} surface(s) missing the attribution`,
);
process.exit(failures === 0 ? 0 : 1);
