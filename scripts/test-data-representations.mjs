// Statistics chart and structured data-table checks.
//
// The specifications are compiled with strict TypeScript and the real React
// components are rendered with React Test Renderer (no browser): every chart
// type must produce an SVG from data, and an empty workspace must not crash.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire, Module } from "node:module";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import TestRenderer, { act } from "react-test-renderer";
import ts from "typescript";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const outDir = "/tmp/evalora-data-representations";
execSync(
  `./node_modules/.bin/tsc src/lib/statsSpec.ts src/lib/dataTableSpec.ts --outDir ${outDir} --rootDir src --module commonjs --target es2022 --strict --skipLibCheck --moduleResolution node`,
  { stdio: "inherit" },
);
const require = createRequire(import.meta.url);
const stats = require(`${outDir}/lib/statsSpec.js`);
const tables = require(`${outDir}/lib/dataTableSpec.js`);

let passed = 0;
const ok = (name, condition) => {
  if (!condition) throw new Error(`FAIL: ${name}`);
  passed += 1;
  console.log(`  ✓ ${name}`);
};

function loadComponent(relativeFile, stubs) {
  const filename = path.resolve(`scripts/__virtual_${path.basename(relativeFile).replace(/\W/g, "_")}.cjs`);
  const source = ts.transpileModule(readFileSync(relativeFile, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  const originalLoad = Module._load;
  Module._load = function (request, parent) {
    if (parent?.filename === filename && stubs[request]) return stubs[request];
    return originalLoad.apply(this, arguments);
  };
  const virtual = new Module(filename);
  virtual.filename = filename;
  virtual.paths = Module._nodeModulePaths(path.dirname(filename));
  virtual._compile(source, filename);
  Module._load = originalLoad;
  return virtual.exports;
}

const { StatsView } = loadComponent("src/components/stats/StatsView.tsx", {
  "@/lib/statsSpec": stats,
});
const { DataTableView } = loadComponent("src/components/stats/DataTableView.tsx", {
  "@/lib/dataTableSpec": tables,
});

const render = (element) => {
  let tree;
  act(() => { tree = TestRenderer.create(element); });
  return tree;
};
const host = (tree, type) => tree.root.findAll((node) => node.type === type);
const textOf = (tree) => tree.root.findAll((node) => typeof node.props?.children === "string")
  .map((node) => node.props.children).join(" ");

console.log("Statistics rendering");
{
  const dot = render(React.createElement(StatsView, {
    spec: { ...stats.emptyStatsSpec(), values: [1, 1, 2, 3], title: "Dot plot" },
  }));
  ok("dot plot renders an svg", host(dot, "svg").length === 1);
  ok("dot plot renders the title", textOf(dot).includes("Dot plot"));
  ok("dot plot renders one dot per observation", host(dot, "circle").length === 4);
  act(() => dot.unmount());

  const bar = render(React.createElement(StatsView, {
    spec: {
      ...stats.emptyStatsSpec(),
      chart: "bar_chart",
      categories: [
        { id: "a", label: "Red", value: 4 },
        { id: "b", label: "Blue", value: 7 },
      ],
    },
  }));
  ok("bar chart renders a bar per category", host(bar, "rect").length >= 3);
  ok("bar chart labels its categories", textOf(bar).includes("Red") && textOf(bar).includes("Blue"));
  act(() => bar.unmount());

  const histogram = render(React.createElement(StatsView, {
    spec: { ...stats.emptyStatsSpec(), chart: "histogram", values: [1, 2, 2, 3, 8, 9], binWidth: 2 },
  }));
  ok("histogram renders bins", host(histogram, "rect").length >= 4);
  ok("histogram prints frequencies", textOf(histogram).includes("2"));
  act(() => histogram.unmount());

  const box = render(React.createElement(StatsView, {
    spec: { ...stats.emptyStatsSpec(), chart: "box_plot", values: [1, 2, 3, 4, 5, 100] },
  }));
  ok("box plot renders its box", host(box, "rect").length >= 2);
  ok("box plot marks the outlier", host(box, "circle").length >= 1);
  act(() => box.unmount());

  const cumulative = render(React.createElement(StatsView, {
    spec: { ...stats.emptyStatsSpec(), chart: "cumulative_frequency", values: [1, 2, 2, 4] },
  }));
  ok("cumulative chart draws a step path", host(cumulative, "path").length >= 1);
  ok("cumulative chart marks each plotted value", host(cumulative, "circle").length === 3);
  act(() => cumulative.unmount());

  const empty = render(React.createElement(StatsView, { spec: stats.emptyStatsSpec() }));
  ok("an empty chart renders a prompt, not a crash", textOf(empty).includes("Add data values"));
  act(() => empty.unmount());

  const summary = render(React.createElement(StatsView, {
    spec: { ...stats.emptyStatsSpec(), values: [1, 2, 3, 4], showSummary: true },
  }));
  const chips = summary.root.findAll((node) => node.type === "li");
  ok("summary chips appear when enabled", chips.length >= 4 && textOf(summary).includes("Median"));
  act(() => summary.unmount());
}

console.log("Server rendering");
{
  const chartHtml = renderToStaticMarkup(React.createElement(StatsView, {
    spec: { ...stats.emptyStatsSpec(), chart: "histogram", values: [1, 2, 2, 3], title: "Server chart" },
  }));
  ok("stats chart renders to static HTML for server components", chartHtml.includes("<svg") && chartHtml.includes("viewBox"));
  ok("stats chart keeps an accessible label in SSR", chartHtml.includes("Server chart"));

  const tableHtml = renderToStaticMarkup(React.createElement(DataTableView, {
    spec: tables.normaliseDataTableSpec({ columns: ["x", "f"], rows: [["1", "2"]], rowHeaders: true }),
  }));
  ok("data table renders to static HTML", tableHtml.includes("<table") && tableHtml.includes("scope=\"row\""));
}

console.log("Data table rendering");
{
  const spec = tables.normaliseDataTableSpec({
    title: "Frequency table",
    columns: ["Interval", "Frequency"],
    rows: [["0–9", "4"], ["10–19", "7"]],
    rowHeaders: true,
  });
  const view = render(React.createElement(DataTableView, { spec }));
  ok("table renders a table element", host(view, "table").length === 1);
  ok("table renders both headers", host(view, "th").filter((node) => node.props.scope === "col").length === 2);
  ok("table renders row headers", host(view, "th").filter((node) => node.props.scope === "row").length === 2);
  ok("table renders one data cell per row", host(view, "td").length === 2);
  ok("table prints its values", textOf(view).includes("0–9") && textOf(view).includes("7"));
  ok("table renders its caption", textOf(view).includes("Frequency table"));
  act(() => view.unmount());

  const blank = render(React.createElement(DataTableView, { spec: tables.emptyDataTableSpec() }));
  ok("blank table still renders its grid", host(blank, "tr").length === 4);
  act(() => blank.unmount());
}

console.log(`\n${passed} checks passed (data representations).`);
