/**
 * The organizer console's projected-screen links.
 *
 * EVALORA answers on more than one hostname and Supabase auth cookies are
 * host-scoped. The console used to hand the organizer an absolute link on the
 * canonical host, so opening the screen from a console on another hostname made
 * the page treat a signed-in Super Admin as an anonymous visitor: no toolbar,
 * no explanation, nothing to click. The link the organizer clicks must stay on
 * the origin that already carries their session; only the copied projector link
 * is absolute.
 *
 * Run: node scripts/test-live-screen-links.mjs
 */
import { execSync } from "node:child_process";
import { createRequire } from "node:module";

const outDir = "/tmp/evalora-live-links-test";
execSync(
  `npx tsc src/lib/liveLinks.ts --outDir ${outDir} --rootDir src --module commonjs --target es2022 --strict --skipLibCheck`,
  { stdio: "inherit" },
);

const require = createRequire(import.meta.url);
const { screenLinks } = require(`${outDir}/lib/liveLinks.js`);

let checks = 0;
const ok = (name, condition) => {
  if (!condition) throw new Error(`FAIL: ${name}`);
  checks += 1;
  console.log(`  ✓ ${name}`);
};

const CANONICAL = "https://evalora-six.vercel.app";
const path = "/live/31dd0de3-2148-4bfb-8b59-198062e32064/screen?token=eyJzaWQiOiIzMWRkIn0.sig";
const { absolute, host } = screenLinks(path, CANONICAL);

ok("the copied projector link is absolute and canonical", absolute === `${CANONICAL}${path}`);
ok("the organizer link stays same-origin", host === `${path}&host=1`);
ok("the organizer link is never another origin", host.startsWith("/") && !/^https?:/i.test(host) && !host.startsWith("//"));
ok("the organizer link asks the screen to explain a missing toolbar", host.endsWith("&host=1"));

const bare = screenLinks("/live/abc/screen", CANONICAL);
ok("a token-less path still keeps the flag", bare.host === "/live/abc/screen?host=1");
ok("only the copied link gets the host prefix", bare.absolute === `${CANONICAL}/live/abc/screen`);

// A console served elsewhere must not bounce the organizer to the canonical
// host: the path is reused as-is so the browser keeps the current origin.
const elsewhere = screenLinks(`https://other-host.vercel.app${path}`, CANONICAL);
ok("an absolute screen path is copied verbatim", elsewhere.absolute === `https://other-host.vercel.app${path}`);
ok("an absolute screen path is opened on the current origin", elsewhere.host === `${path}&host=1`);

const hostile = screenLinks("//evil.invalid/live/x/screen?token=t", CANONICAL);
ok("a protocol-relative path cannot leave the origin", hostile.host.startsWith("/") && !hostile.host.startsWith("//"));

console.log(`\n${checks} checks passed — live screen links (pure module).`);
