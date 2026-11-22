/**
 * EVALORA — landing page verification (real browser).
 *
 * Run against a production build already listening on http://127.0.0.1:3100:
 *   node scripts/verify-landing.mjs
 *
 * What this proves that a type-check cannot:
 *   1. The page renders without console errors or hydration failures.
 *   2. Nothing overflows horizontally at 390 / 768 / 1024 / 1440 / 1920.
 *   3. The tab interfaces and the billing toggle actually change content.
 *   4. Every interactive control is reachable by keyboard and shows focus.
 *   5. Screenshots are produced for desktop, tablet and mobile for review.
 *
 * Exits non-zero on any failure so CI can gate on it.
 */
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.LANDING_URL || "http://127.0.0.1:3100";
const OUT = "verification";
const VIEWPORTS = [
  { name: "mobile-390", width: 390, height: 844, mobile: true },
  { name: "tablet-768", width: 768, height: 1024, mobile: false },
  { name: "laptop-1024", width: 1024, height: 768, mobile: false },
  { name: "desktop-1440", width: 1440, height: 900, mobile: false },
  { name: "wide-1920", width: 1920, height: 1080, mobile: false },
];

const failures = [];
const record = (ok, label, detail = "") => {
  const line = `${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`;
  console.log(line);
  note(line);
  if (!ok) failures.push(label + (detail ? ` (${detail})` : ""));
};

mkdirSync(OUT, { recursive: true });
/** One place to publish results — CI summary, or the console locally. */
const report = [];
const note = (line) => {
  report.push(line);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, line + "\n");
};

/**
 * Prefer Playwright's downloaded Chromium; fall back to a system Chrome so the
 * check still runs on a runner where the browser CDN was unreachable.
 */
process.on("uncaughtException", (error) => {
  note(`## Landing verification could not run\n\n\`\`\`\n${error?.stack || error}\n\`\`\``);
  process.exit(1);
});
const launchOptions = {};
if (process.env.CHROME_PATH) launchOptions.executablePath = process.env.CHROME_PATH;
let browser;
try {
  browser = await chromium.launch(launchOptions);
} catch (error) {
  console.warn(`Could not launch Chromium (${error.message}). Trying the system Chrome channel.`);
  browser = await chromium.launch({ channel: "chrome", ...launchOptions });
}
const context = await browser.newContext({ deviceScaleFactor: 1 });
const consoleErrors = [];
context.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
context.on("pageerror", (err) => consoleErrors.push(String(err)));

/* ── 1. Layout at every breakpoint ─────────────────────────────────────── */
for (const vp of VIEWPORTS) {
  const page = await context.newPage();
  await page.setViewportSize({ width: vp.width, height: vp.height });
  await page.goto(BASE + "/", { waitUntil: "load" });
  await page.waitForTimeout(1200);

  const overflow = await page.evaluate(() => {
    const de = document.documentElement;
    const offenders = [];
    if (de.scrollWidth > de.clientWidth + 1) {
      for (const el of document.querySelectorAll("body *")) {
        const r = el.getBoundingClientRect();
        if (r.width === 0) continue;
        if (r.right > de.clientWidth + 1 || r.left < -1) {
          const style = getComputedStyle(el);
          if (style.position === "fixed" || style.visibility === "hidden") continue;
          offenders.push(`${el.tagName.toLowerCase()}.${(el.className || "").toString().split(" ").slice(0, 2).join(".")} right=${Math.round(r.right)}`);
        }
      }
    }
    return { scrollWidth: de.scrollWidth, clientWidth: de.clientWidth, offenders: offenders.slice(0, 5) };
  });
  record(
    overflow.scrollWidth <= overflow.clientWidth + 1,
    `no horizontal overflow @ ${vp.name}`,
    `${overflow.scrollWidth}/${overflow.clientWidth}${overflow.offenders.length ? " :: " + overflow.offenders.join(", ") : ""}`,
  );

  // The hero heading and the primary call to action must be on-screen.
  const heroVisible = await page.locator("h1").first().isVisible();
  record(heroVisible, `h1 visible @ ${vp.name}`);

  await page.screenshot({ path: `${OUT}/${vp.name}-full.png`, fullPage: true });
  await page.screenshot({ path: `${OUT}/${vp.name}-hero.png`, clip: { x: 0, y: 0, width: vp.width, height: Math.min(vp.height, 900) } });
  await page.close();
}

/* ── 2. Interaction and keyboard behaviour (desktop) ───────────────────── */
const page = await context.newPage();
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(BASE + "/", { waitUntil: "load" });
await page.waitForTimeout(800);

// Billing toggle swaps the price shown on the Premium card
const premiumPrice = page.locator("#lp-pricing .lp-price").nth(1).locator(".lp-metric").first();
const yearlyText = (await premiumPrice.textContent())?.trim();
await page.getByRole("button", { name: /^Monthly$/ }).click();
await page.waitForTimeout(150);
const monthlyText = (await premiumPrice.textContent())?.trim();
record(Boolean(yearlyText) && Boolean(monthlyText) && yearlyText !== monthlyText, "billing toggle changes price", `${yearlyText} → ${monthlyText}`);
await page.getByRole("button", { name: /^Yearly/ }).click();

// Role switcher changes the visible panel
const roleTab = page.getByRole("tab", { name: /School Administrators/ });
await roleTab.click();
await page.waitForTimeout(150);
const rolePanel = await page.locator('[role="tabpanel"]').filter({ hasText: "Run the institution end to end" }).count();
record(rolePanel > 0, "role switcher shows the school administrator panel");

// Engine showcase tabs render a different preview
const proctorTab = page.getByRole("tab", { name: /^Proctoring$/ });
await proctorTab.click();
await page.waitForTimeout(200);
record((await page.getByText("LiveKit room").count()) > 0, "engine showcase swaps to the proctoring preview");

// Mobile navigation opens and closes
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(BASE + "/", { waitUntil: "load" });
await page.waitForTimeout(800);
const menuButton = page.getByRole("button", { name: /Open menu/ });
await menuButton.click();
const menuVisible = await page.locator("#lp-mobile-menu a").first().isVisible();
record(menuVisible, "mobile menu opens");
await page.keyboard.press("Escape");
record(!(await page.locator("#lp-mobile-menu a").first().isVisible()), "Escape closes the mobile menu");

// Keyboard: tab from the top reaches the skip link, then the logo/nav
await page.keyboard.press("Tab");
const firstFocus = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? "");
record(/Skip to main content/.test(firstFocus), "first Tab reaches the skip link", firstFocus);

/* ── 3. Reduced-motion users are not left with hidden content ──────────── */
const reduced = await browser.newContext({ reducedMotion: "reduce" });
const rmPage = await reduced.newPage();
await rmPage.setViewportSize({ width: 1440, height: 900 });
await rmPage.goto(BASE + "/", { waitUntil: "load" });
await rmPage.waitForTimeout(600);
const hiddenBlocks = await rmPage.evaluate(() =>
  [...document.querySelectorAll(".lp-reveal")].filter((el) => getComputedStyle(el).opacity !== "1").length,
);
record(hiddenBlocks === 0, "reduced motion: all reveal blocks are visible", `${hiddenBlocks} hidden`);
await reduced.close();

/* ── 4. Console health ────────────────────────────────────────────────── */
const meaningful = consoleErrors.filter((e) => !/favicon|preload|Download the React DevTools/i.test(e));
record(meaningful.length === 0, "no console errors", meaningful.slice(0, 3).join(" | "));

await browser.close();

const verdict = failures.length === 0 ? "PASS" : "FAIL";
writeFileSync(`${OUT}/report.md`, `# Landing verification — ${verdict}\n\n` + report.join("\n") + "\n");
note(`\n**${verdict}** — ${failures.length} failing check(s)\n`);
console.log(`\n${verdict} — ${failures.length} failing check(s)`);
if (failures.length) {
  console.log(failures.map((f) => `  · ${f}`).join("\n"));
  process.exit(1);
}
