/**
 * Diagram and label mathematics — the defect this guards against is a
 * candidate being shown raw LaTeX.
 *
 * Authors write maths inside diagram labels the same way they write it in a
 * paragraph: a grouped-frequency column headed `$10 \le V < 14$`, a Venn
 * region holding `$2x - 1$`. Both are stored as ordinary strings inside the
 * diagram spec, and until the renderer hands them to KaTeX the candidate sees
 * `$10 \le V < 14$` where the paper prints 10 ≤ V < 14.
 *
 * The suite renders the real components with `react-dom/server`, so it proves
 * what a candidate's browser is sent rather than what the helpers claim.
 *
 * A single dollar sign is NOT mathematics: "Cost ($)" is a currency label on a
 * term-graph axis, and must stay plain scalable SVG text.
 *
 * Run: node scripts/test-diagram-math-rendering.mjs
 */
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTs } from "./lib/loadTs.mjs";

const { renderMathText, hasMathRun } = loadTs("src/lib/content.ts");
const { AssessDiagram } = loadTs("src/components/AssessDiagram.tsx");

let passed = 0;
const ok = (name, condition) => {
  assert.ok(condition, `FAIL: ${name}`);
  passed += 1;
  console.log(`  \u2713 ${name}`);
};

const draw = (spec) => renderToStaticMarkup(createElement(AssessDiagram, { spec }));
const count = (html, needle) => (html.match(new RegExp(needle, "g")) ?? []).length;

/* ── The shared helper ─────────────────────────────────────────────────── */
ok("prose with no mathematics is left alone", renderMathText("Volume (m³)") === "Volume (m³)");
ok("inline mathematics becomes KaTeX output",
  renderMathText("$x + 5$").includes("katex") && !renderMathText("$x + 5$").includes("$"));
ok("display mathematics becomes KaTeX output",
  renderMathText("$$\\frac{7}{9}$$").includes("katex-display"));
ok("prose around mathematics survives",
  renderMathText("Volume $V$ (m³)").startsWith("Volume ") && renderMathText("Volume $V$ (m³)").endsWith(" (m³)"));
ok("an unpaired dollar sign is not treated as mathematics",
  renderMathText("Cost ($)") === "Cost ($)" && hasMathRun("Cost ($)") === false);
ok("markup in a label is escaped, not executed",
  !renderMathText("<script>x</script>").includes("<script"));
ok("empty and nullish labels render to nothing", renderMathText("") === "" && renderMathText(null) === "");

/* ── A data table drawn from a diagram spec ────────────────────────────── */
const table = draw({
  version: 1,
  kind: "table",
  title: "",
  columns: ["Volume $V$ (m³)", "$10 \\le V < 14$", "$14 \\le V < 18$"],
  rows: [["Days (f)", "6", "12"]],
});
ok("a table header in mathematics renders as notation", table.includes("katex"));
ok("no unrendered $…$ reaches the table", !table.includes("$"));
ok("the LaTeX itself is only kept in KaTeX's MathML annotation",
  table.includes('encoding="application/x-tex"'));
ok("plain cells still render as plain text", table.includes("Days (f)") && table.includes(">6<"));

const plainTable = draw({ version: 1, kind: "table", title: "", columns: ["x", "y"], rows: [["1", "2"]] });
ok("a table with no mathematics uses no KaTeX at all", !plainTable.includes("katex"));

/* ── A Venn diagram whose regions hold algebra ─────────────────────────── */
const venn = draw({
  version: 1,
  kind: "venn2",
  title: "",
  venn: {
    leftLabel: "B",
    rightLabel: "M",
    leftOnly: "$x + 5$",
    both: "$x$",
    rightOnly: "$2x - 1$",
    outside: "6",
    universalLabel: "ξ",
  },
});
ok("Venn regions in mathematics are rendered with KaTeX", count(venn, "katex") >= 3);
ok("mathematics in an SVG is carried by a foreignObject", venn.includes("<foreignObject"));
ok("no unrendered $…$ reaches the Venn diagram", !venn.includes("$"));
ok("plain Venn labels stay real SVG text", /<text[^>]*>B<\/text>/.test(venn) && /<text[^>]*>6<\/text>/.test(venn));

/* ── Currency is not mathematics ───────────────────────────────────────── */
const termGraph = draw({
  version: 1,
  kind: "term_graph",
  title: "Taxi costs",
  xMin: 0, xMax: 5, yMin: 0, yMax: 25,
  points: [[1, 9], [2, 13]],
  xLabel: "Distance (km)",
  yLabel: "Cost ($)",
});
ok("a currency dollar sign stays plain scalable text", /<text[^>]*>Cost \(\$\)<\/text>/.test(termGraph));
ok("a currency label opens no foreignObject", !termGraph.includes("<foreignObject"));

const doubleLine = draw({
  version: 1,
  kind: "double_number_line",
  title: "Cost of pens",
  lines: [
    { label: "Pens", unit: "pens", max: 7, ticks: [{ at: 0, label: "0" }, { at: 7, label: "7" }] },
    { label: "Cost", unit: "$", max: 14, ticks: [{ at: 0, label: "0" }, { at: 14, label: "?" }] },
  ],
});
ok("a unit of $ is printed, not parsed", /<text[^>]*>\$<\/text>/.test(doubleLine));

/* ── Other labelled kinds ──────────────────────────────────────────────── */
const stemLeaf = draw({
  version: 1,
  kind: "stem_leaf",
  title: "",
  stemRows: [{ stem: "1", leaves: ["2", "5"] }],
  stemKey: "$1 \\mid 2$ means 12",
});
ok("a stem-and-leaf key in mathematics renders as notation", stemLeaf.includes("katex"));
ok("the stem-and-leaf leaves are untouched", stemLeaf.includes("1") && stemLeaf.includes("2"));

const shape = draw({
  version: 1,
  kind: "shape_pattern",
  title: "",
  patterns: [{ label: "Pattern $n$", squares: 4, dots: 3 }],
});
const caption = shape.slice(shape.indexOf("<p"));
ok("a pattern caption in mathematics renders as notation", caption.includes("katex") && !caption.includes("$"));

const boxPlot = draw({
  version: 1,
  kind: "box_plot",
  title: "",
  boxPlots: [{ label: "$A$", min: 1, q1: 3, median: 5, q3: 7, max: 9 }],
  xMin: 0, xMax: 10, yMin: 0, yMax: 1,
});
ok("a box-plot lane label in mathematics renders as notation", boxPlot.includes("katex"));

console.log(`\n${passed} checks passed (diagram mathematics: real components, server-rendered).`);
