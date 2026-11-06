#!/usr/bin/env node
/**
 * EVALORA — WCAG 2.2 contrast checker for design tokens.
 * Run: node scripts/check-contrast.mjs
 * AA targets: normal text ≥ 4.5:1 · large text & UI indicators ≥ 3:1.
 * Alpha colors are composited over the surface they actually sit on.
 */

function hex(h) {
  h = h.replace("#", "");
  if (h.length === 8) return { r: p(h, 0), g: p(h, 2), b: p(h, 4), a: p(h, 6) / 255 };
  return { r: p(h, 0), g: p(h, 2), b: p(h, 4), a: 1 };
  function p(s, i) { return parseInt(s.slice(i, i + 2), 16); }
}
const over = (fg, bg) => ({ // composite fg (with alpha) over opaque bg
  r: Math.round(fg.r * fg.a + bg.r * (1 - fg.a)),
  g: Math.round(fg.g * fg.a + bg.g * (1 - fg.a)),
  b: Math.round(fg.b * fg.a + bg.b * (1 - fg.a)),
  a: 1,
});
function lum({ r, g, b }) {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function ratio(fgHex, bgHex) {
  const bg = hex(bgHex);
  const fg = over(hex(fgHex), bg);
  const [l1, l2] = [lum(fg), lum(bg)].sort((a, b) => b - a);
  return (l1 + 0.05) / (l2 + 0.05);
}
const withAlpha = (hex6, a) => hex6 + Math.round(a * 255).toString(16).padStart(2, "0").toUpperCase();

/* ─── Tokens (after the readability redesign) ─── */
const T = {
  paper: "#FFFFFF", cream: "#F5F3EC", ink: "#16241C", inkSoft: "#46564C",
  eg50: "#EEF7F1", eg100: "#D8ECDF", eg200: "#B2D9C1", eg600: "#14663F",
  eg700: "#0A5C36", eg800: "#08472A", eg900: "#06351F", eg950: "#042315",
  gold100: "#F5ECC8", gold400: "#DCB94A", gold500: "#C9A227", gold700: "#856816", gold800: "#6E5710",
  red50: "#FEF2F2", red100: "#FEE2E2", red400: "#F87171", red700: "#B91C1C", red800: "#991B1B",
  amber100: "#FEF3C7", amber800: "#92400E", stone200: "#E7E5E4", stone700: "#44403C", white: "#FFFFFF",
};

const checks = [
  /* label, fg, bg, kind ("normal"=4.5 | "large/UI"=3) */
  ["Body text ink on white card", T.ink, T.paper, "normal"],
  ["Body text ink on cream canvas", T.ink, T.cream, "normal"],
  ["Secondary ink-soft on white", T.inkSoft, T.paper, "normal"],
  ["Secondary ink-soft on cream", T.inkSoft, T.cream, "normal"],
  ["Input placeholder (ink-soft) on white", T.inkSoft, T.paper, "normal"],
  ["Primary button: white on evergreen-700", T.white, T.eg700, "normal"],
  ["Gold button/chip: evergreen-950 on gold-500", T.eg950, T.gold500, "normal"],
  ["Danger button: white on red-700", T.white, T.red700, "normal"],
  ["Dark button: white on evergreen-950", T.white, T.eg950, "normal"],
  ["Green badge: evergreen-800 on evergreen-100", T.eg800, T.eg100, "normal"],
  ["Gold badge: gold-800 on gold-100", T.gold800, T.gold100, "normal"],
  ["Red badge: red-800 on red-100", T.red800, T.red100, "normal"],
  ["Amber badge: amber-800 on amber-100", T.amber800, T.amber100, "normal"],
  ["Gray badge: stone-700 on stone-200", T.stone700, T.stone200, "normal"],
  ["Error text red-800 on red-50", T.red800, T.red50, "normal"],
  ["Eyebrow/links evergreen-700 on white", T.eg700, T.paper, "normal"],
  ["Eyebrow evergreen-700 on cream", T.eg700, T.cream, "normal"],
  ["Hero accent words gold-700 on white (large)", T.gold700, T.paper, "large"],
  ["Page headings evergreen-950 on cream (large)", T.eg950, T.cream, "large"],
  ["Footer body evergreen-100 on evergreen-950", T.eg100, T.eg950, "normal"],
  ["Footer fine print evergreen-200 on evergreen-950", T.eg200, T.eg950, "normal"],
  ["Footer headings gold-400 on evergreen-950", T.gold400, T.eg950, "normal"],
  ["CTA band white on evergreen-950", T.white, T.eg950, "normal"],
  ["Projector text white on evergreen-950", T.white, T.eg950, "normal"],
  ["Projector accent gold-400 on evergreen-950 (large)", T.gold400, T.eg950, "large"],
  ["Projector timer red-400 on evergreen-950 (large)", T.red400, T.eg950, "large"],
  ["Exam urgent timer white on red-700", T.white, T.red700, "normal"],
  ["Focus ring evergreen-600 on white (UI)", T.eg600, T.paper, "large"],
  ["Input border evergreen-900@55% on white (UI)", withAlpha(T.eg900, 0.55), T.paper, "large"],
  ["Input border evergreen-900@55% on cream (UI)", withAlpha(T.eg900, 0.55), T.cream, "large"],
  // Card borders (evergreen-900@20%) are decorative — the white surface +
  // shadow carry separation, so WCAG 1.4.11 does not impose a ratio there.
];

console.log("── BEFORE the fix: evergreen-950 was #04231516 (8.6% alpha) ──");
const brokenBg = "#04231516"; // composited over cream body
const effBg = over(hex(brokenBg), hex("#FAF7F0"));
const eff = "#" + [effBg.r, effBg.g, effBg.b].map((v) => v.toString(16).padStart(2, "0")).join("");
for (const [label, fg, bg] of [
  ["White sidebar/hero text on 'evergreen-950' over cream", "#FFFFFF", eff],
  ["Heading text-evergreen-950 (8.6% ink) on cream", brokenBg, "#FAF7F0"],
  ["Gold-button text-evergreen-950 (8.6%) on gold-500", brokenBg, "#C9A227"],
]) console.log(`${label.padEnd(58)} ${ratio(fg, bg).toFixed(2)}:1  ✗ FAIL`);

console.log("\n── AFTER the fix (targets: normal ≥ 4.5 · large/UI ≥ 3.0) ──");
let fails = 0;
for (const [label, fg, bg, kind] of checks) {
  const r = ratio(fg, bg);
  const need = kind === "normal" ? 4.5 : 3.0;
  const ok = r >= need;
  if (!ok) fails++;
  console.log(`${label.padEnd(58)} ${r.toFixed(2)}:1  ${ok ? "✓" : `✗ FAIL (needs ${need})`}`);
}
console.log(fails ? `\n${fails} failing pair(s).` : "\nAll pairs pass WCAG 2.2 AA.");
process.exit(fails ? 1 : 0);
