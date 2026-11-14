// Structured response composition checks (React test renderer; no browser).
//
// Exercises the real StructuredResponseEditor: tabs, dirty state, saving,
// structured payloads, graph/geometry retention and the unmount flush that
// protects an answer when a candidate navigates away before autosave fires.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Module } from "node:module";
import path from "node:path";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import ts from "typescript";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const file = path.resolve("scripts/__virtual_structured_response.cjs");
const source = ts.transpileModule(readFileSync("src/components/response/StructuredResponseEditor.tsx", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

const emptyGraph = () => ({
  version: 1, title: "", domain: { xMin: -10, xMax: 10, yMin: -8, yMax: 8 }, functions: [], points: [], segments: [], annotations: [],
});
const emptyGeometry = () => ({ version: 1, title: "", points: [], lines: [], circles: [], polygons: [], angles: [], annotations: [] });
const emptyStats = () => ({ version: 1, chart: "dot_plot", title: "", xLabel: "", yLabel: "Frequency", values: [], categories: [], binWidth: null, showSummary: false });
const emptyTable = () => ({ version: 1, title: "", columns: ["Column 1", "Column 2"], rows: [["", ""], ["", ""]], rowHeaders: false });
const emptyVenn = (overrides = {}) => ({
  version: 1, sets: 2, labels: ["A", "B"], universalLabel: "ξ", regions: {}, items: [], title: "", instructions: "", showCounts: true, ...overrides,
});
const emptyTree = (overrides = {}) => ({ version: 1, title: "", instructions: "", rootLabel: "Start", nodes: [{ id: "root", parentId: null, label: "", probability: "", outcome: "" }], ...overrides });
const emptyStemLeaf = (overrides = {}) => ({ version: 1, title: "", stemLabel: "Stem", leafLabel: "Leaf", key: "Key: 4 | 7 means 47", rows: [{ id: "row-1", stem: "", leaves: "" }], ...overrides });
const hasItems = (spec) => Boolean(spec && ["points", "segments", "annotations", "functions", "lines", "circles", "polygons", "angles"].some((key) => Array.isArray(spec[key]) && spec[key].length));
const payloads = [];
let lastGraphChange = null;
let lastGeometryChange = null;
let lastStatsChange = null;
let lastTableChange = null;

const originalLoad = Module._load;
Module._load = function (request, parent) {
  if (parent?.filename === file) {
    // Resolve the existing tool doubles synchronously for these composition
    // tests. Chunk loading itself requires a real Next/browser build test.
    if (request === "next/dynamic") return { default: (loader) => {
      const text = loader.toString();
      const modulePath = /require\(["']([^"']+)["']\)/.exec(text)?.[1];
      const exportName = /m\.(\w+)/.exec(text)?.[1];
      assert.ok(modulePath && exportName, "dynamic tool resolves a named export");
      return Module._load(modulePath, parent)[exportName];
    } };
    if (request === "@/components/editor/RichContentEditor") {
      return {
        RichContentEditor: ({ onChange, disabled }) => React.createElement("button", {
          "data-testid": "write",
          disabled: Boolean(disabled),
          onClick: () => onChange({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "x = 4" }] }] }),
        }, "write"),
      };
    }
    if (request === "@/components/graph/GraphEditor") {
      return {
        GraphEditor: ({ onChange, readOnly }) => React.createElement("button", {
          "data-testid": "plot",
          disabled: Boolean(readOnly),
          onClick: () => { lastGraphChange = { ...emptyGraph(), points: [{ id: "p1", x: 2, y: 3, label: "P", color: "#0a5c36", showCoordinates: true, open: false, visible: true }] }; onChange(lastGraphChange); },
        }, "plot"),
      };
    }
    if (request === "@/components/geometry/GeometryEditor") {
      return {
        GeometryEditor: ({ onChange, readOnly }) => React.createElement("button", {
          "data-testid": "construct",
          disabled: Boolean(readOnly),
          onClick: () => { lastGeometryChange = { ...emptyGeometry(), points: [{ id: "A", x: 1, y: 1, kind: "free", dependsOn: [], label: "A", color: "#0a5c36", showLabel: true }] }; onChange(lastGeometryChange); },
        }, "construct"),
      };
    }
    if (request === "@/components/stats/StatsEditor") {
      return {
        StatsEditor: ({ onChange, readOnly }) => React.createElement("button", {
          "data-testid": "chart",
          disabled: Boolean(readOnly),
          onClick: () => { lastStatsChange = { ...emptyStats(), chart: "histogram", values: [1, 2, 2, 3] }; onChange(lastStatsChange); },
        }, "chart"),
      };
    }
    if (request === "@/components/stats/DataTableEditor") {
      return {
        DataTableEditor: ({ onChange, readOnly }) => React.createElement("button", {
          "data-testid": "fill-table",
          disabled: Boolean(readOnly),
          onClick: () => { lastTableChange = { ...emptyTable(), rows: [["1", "2"], ["3", "4"]] }; onChange(lastTableChange); },
        }, "fill table"),
      };
    }
    if (request === "@/components/venn/VennEditor") {
      return {
        VennEditor: ({ onChange, disabled }) => React.createElement("button", {
          "data-testid": "venn",
          disabled: Boolean(disabled),
          onClick: () => onChange({ ...emptyVenn(), regions: { A: "12", AnB: "5", B: "8" } }),
        }, "venn"),
      };
    }
    if (request === "@/components/probability/ProbabilityTreeEditor") return {
      ProbabilityTreeEditor: ({ onChange, disabled }) => React.createElement("button", { "data-testid": "tree", disabled: Boolean(disabled), onClick: () => onChange(emptyTree({ nodes: [...emptyTree().nodes, { id: "a", parentId: "root", label: "Red", probability: "1/2", outcome: "Red" }] })) }, "tree"),
    };
    if (request === "@/components/probability/ProbabilityTreeView") return { ProbabilityTreeView: () => null };
    if (request === "@/lib/probabilityTreeSpec") return {
      emptyProbabilityTreeSpec: emptyTree,
      normaliseProbabilityTreeSpec: (raw, fallback = emptyTree()) => (raw && typeof raw === "object" ? { ...fallback, ...raw, nodes: Array.isArray(raw.nodes) ? raw.nodes : fallback.nodes } : fallback),
      probabilityTreeHasWork: (spec) => Boolean(spec?.nodes?.some((node) => node.id !== "root" && (node.label || node.probability || node.outcome))),
    };
    if (request === "@/components/stem-leaf/StemLeafEditor") return {
      StemLeafEditor: ({ onChange, disabled }) => React.createElement("button", { "data-testid": "stem-leaf", disabled: Boolean(disabled), onClick: () => onChange(emptyStemLeaf({ rows: [{ id: "row-1", stem: "4", leaves: "1 3 7" }] })) }, "stem leaf"),
    };
    if (request === "@/components/stem-leaf/StemLeafView") return { StemLeafView: () => null };
    if (request === "@/lib/stemLeafSpec") return {
      emptyStemLeafSpec: emptyStemLeaf,
      normaliseStemLeafSpec: (raw, fallback = emptyStemLeaf()) => (raw && typeof raw === "object" ? { ...fallback, ...raw, rows: Array.isArray(raw.rows) ? raw.rows : fallback.rows } : fallback),
      stemLeafHasWork: (spec) => Boolean(spec?.rows?.some((row) => String(row.stem ?? "").trim() || String(row.leaves ?? "").trim())),
    };
    if (request === "@/lib/vennSpec") return {
      emptyVennSpec: emptyVenn,
      normaliseVennSpec: (raw, fallback = emptyVenn()) => (raw && typeof raw === "object" ? { ...fallback, ...raw } : fallback),
      vennSpecHasWork: (spec) => Boolean(spec && spec.regions && Object.values(spec.regions).some((value) => String(value).trim())),
      regionKeysFor: (sets) => (sets === 3 ? ["A", "B", "C", "AnB", "AnC", "BnC", "AnBnC", "neither"] : ["A", "B", "AnB", "neither"]),
      regionLabel: (spec, key) => key,
    };
    if (request === "@/components/RichContent") return { RichContent: () => React.createElement("div", { "data-testid": "readonly-doc" }, "answer") };
    if (request === "@/components/graph/GraphView") return { GraphView: () => null };
    if (request === "@/components/geometry/GeometryView") return { GeometryView: () => null };
    if (request === "@/lib/content") return {
      emptyDoc: () => ({ type: "doc", content: [{ type: "paragraph" }] }),
      docToPlainText: (doc) => {
        const texts = [];
        const walk = (node) => {
          if (!node) return;
          if (node.type === "text" && typeof node.text === "string") texts.push(node.text);
          if (Array.isArray(node.content)) node.content.forEach(walk);
        };
        walk(doc);
        return texts.join(" ");
      },
    };
    if (request === "@/lib/graphSpec") return {
      emptyGraphSpec: emptyGraph,
      normaliseGraphSpec: (raw) => (raw && typeof raw === "object" ? { ...emptyGraph(), ...raw } : emptyGraph()),
      graphSpecHasWork: hasItems,
    };
    if (request === "@/lib/geometrySpec") return {
      emptyGeometrySpec: emptyGeometry,
      normaliseGeometrySpec: (raw) => (raw && typeof raw === "object" ? { ...emptyGeometry(), ...raw } : emptyGeometry()),
      geometrySpecHasWork: hasItems,
    };
    if (request === "@/lib/statsSpec") return {
      emptyStatsSpec: emptyStats,
      normaliseStatsSpec: (raw) => (raw && typeof raw === "object" ? { ...emptyStats(), ...raw } : emptyStats()),
      statsSpecHasWork: (spec) => Boolean(spec && Array.isArray(spec.values) && spec.values.length) ||
        Boolean(spec && Array.isArray(spec.categories) && spec.categories.some((entry) => entry.label || entry.value)),
    };
    if (request === "@/lib/dataTableSpec") return {
      emptyDataTableSpec: emptyTable,
      normaliseDataTableSpec: (raw) => (raw && typeof raw === "object" ? { ...emptyTable(), ...raw } : emptyTable()),
      dataTableHasWork: (spec) => Boolean(spec && Array.isArray(spec.rows) && spec.rows.some((row) => row.some((cell) => String(cell).trim()))),
    };
    if (request === "@/components/ui") return { Button: ({ children, ...props }) => React.createElement("button", props, children) };
    if (request === "@/lib/utils") return { cn: (...args) => args.filter(Boolean).join(" ") };
  }
  return originalLoad.apply(this, arguments);
};
const virtual = new Module(file);
virtual.filename = file;
virtual.paths = Module._nodeModulePaths(path.dirname(file));
virtual._compile(source, file);
Module._load = originalLoad;
const { StructuredResponseEditor } = virtual.exports;

const emptyVennWorkspace = () => ({ enabled: false, title: "Venn diagram", instructions: "", starter: emptyVenn(), allowSetChange: true });
const emptyTreeWorkspace = () => ({ enabled: false, title: "Probability tree", instructions: "", starter: emptyTree(), allowStructure: true });
const emptyStemLeafWorkspace = () => ({ enabled: false, title: "Stem-and-leaf diagram", instructions: "", starter: emptyStemLeaf() });

const workspace = (overrides = {}) => ({
  tools: ["rich_text", "math", "graph", "geometry"],
  graph: { enabled: true, title: "Your graph", instructions: "", allowFunctions: true, starter: emptyGraph() },
  geometry: { enabled: true, title: "Your construction", instructions: "", starter: emptyGeometry() },
  statistics: { enabled: false, title: "Your statistics chart", instructions: "", chart: "any", starter: emptyStats() },
  dataTable: { enabled: false, title: "Your data table", instructions: "", starter: emptyTable() },
  venn: emptyVennWorkspace(),
  probabilityTree: emptyTreeWorkspace(),
  stemLeaf: emptyStemLeafWorkspace(),
  guidance: "",
  requirement: "any",
  defaultTool: null,
  source: "configured",
  ...overrides,
});

function render(props = {}) {
  const emitted = [];
  let tree;
  act(() => {
    tree = TestRenderer.create(React.createElement(StructuredResponseEditor, {
      workspace: props.workspace ?? workspace(),
      initial: props.initial ?? null,
      autosave: props.autosave ?? false,
      disabled: props.disabled ?? false,
      emit: (payload) => { emitted.push(payload); payloads.push(payload); return props.accepted ?? true; },
      onDirtyChange: props.onDirtyChange,
    }));
  });
  return { tree, emitted };
}
const byTestId = (tree, id) => tree.root.findAll((node) => node.props?.["data-testid"] === id);
const tab = (tree, label) => tree.root.findAll((node) => node.type === "button" && String(node.props.children).includes(label))[0];

let count = 0;
async function test(name, fn) { await fn(); count += 1; console.log(`  ✓ ${name}`); }

await test("renders one tab per enabled tool plus the written editor", () => {
  const { tree } = render();
  const tabs = tree.root.findAllByType("button").slice(0, 3).map((b) => String(b.props.children).replace(/,/g, "").trim());
  assert.deepEqual(tabs, ["✎ Written answer", "📈 Graph", "△ Geometry"]);
  assert.equal(byTestId(tree, "write").length, 1);
  act(() => tree.unmount());
});

await test("a written change marks dirty and Save emits a structured, versioned payload", () => {
  const dirty = [];
  const { tree, emitted } = render({ onDirtyChange: (value) => dirty.push(value) });
  act(() => byTestId(tree, "write")[0].props.onClick());
  const save = tab(tree, "Save answer");
  assert.equal(save.props.disabled, false);
  act(() => save.props.onClick());
  assert.deepEqual(dirty, [true, false]);
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].version, 1);
  assert.equal(emitted[0].text, "x = 4");
  assert.equal(emitted[0].doc.type, "doc");
  act(() => tree.unmount());
});

await test("graph work appears in the saved payload and survives tab changes", () => {
  const { tree, emitted } = render();
  act(() => tab(tree, "Graph").props.onClick());
  act(() => byTestId(tree, "plot")[0].props.onClick());
  act(() => tab(tree, "Written answer").props.onClick());
  act(() => tab(tree, "Graph").props.onClick());
  act(() => tab(tree, "Save answer").props.onClick());
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].graph.points.length, 1);
  assert.equal(emitted[0].graph.points[0].x, 2);
  act(() => tree.unmount());
});

await test("geometry work appears in the saved payload", () => {
  const { tree, emitted } = render();
  act(() => tab(tree, "Geometry").props.onClick());
  act(() => byTestId(tree, "construct")[0].props.onClick());
  act(() => tab(tree, "Save answer").props.onClick());
  assert.equal(emitted[0].geometry.points[0].id, "A");
  act(() => tree.unmount());
});

await test("statistics and data table tools save structured payloads", () => {
  const { tree, emitted } = render({
    workspace: workspace({
      tools: ["rich_text", "math", "statistics", "data_table"],
      statistics: { enabled: true, title: "Scores", instructions: "", chart: "any", starter: emptyStats() },
      dataTable: { enabled: true, title: "Frequency table", instructions: "", starter: emptyTable() },
    }),
  });
  act(() => tab(tree, "Statistics").props.onClick());
  act(() => byTestId(tree, "chart")[0].props.onClick());
  act(() => tab(tree, "Data table").props.onClick());
  act(() => byTestId(tree, "fill-table")[0].props.onClick());
  act(() => tab(tree, "Save answer").props.onClick());
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].statistics.chart, "histogram");
  assert.equal(emitted[0].statistics.values.length, 4);
  assert.equal(emitted[0].data_table.rows[1][0], "3");
  act(() => tree.unmount());
});

await test("the Venn workspace saves a filled diagram as structured data", () => {
  const { tree, emitted } = render({
    workspace: workspace({
      tools: ["rich_text", "math", "venn"],
      venn: { enabled: true, title: "Sets", instructions: "Fill every region.", starter: emptyVenn({ sets: 3 }), allowSetChange: false },
    }),
  });
  assert.ok(tab(tree, "Venn diagram"));
  act(() => tab(tree, "Venn diagram").props.onClick());
  act(() => byTestId(tree, "venn")[0].props.onClick());
  act(() => tab(tree, "Save answer").props.onClick());
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].venn.regions.A, "12");
  assert.equal(emitted[0].venn.regions.AnB, "5");
  act(() => tree.unmount());
});

await test("probability-tree branches save as structured data and restore", () => {
  const configured = workspace({ tools: ["rich_text", "probability_tree"], probabilityTree: { enabled: true, title: "Tree", instructions: "", starter: emptyTree(), allowStructure: true } });
  const { tree, emitted } = render({ workspace: configured });
  act(() => tab(tree, "Probability tree").props.onClick());
  act(() => byTestId(tree, "tree")[0].props.onClick());
  act(() => tab(tree, "Save answer").props.onClick());
  assert.equal(emitted[0].probability_tree.nodes[1].probability, "1/2");
  act(() => tree.unmount());
  const restored = render({ workspace: configured, initial: emitted[0], autosave: true });
  act(() => tab(restored.tree, "Probability tree").props.onClick());
  act(() => byTestId(restored.tree, "tree")[0].props.onClick());
  act(() => restored.tree.unmount());
  assert.equal(restored.emitted[0].probability_tree.nodes[1].label, "Red");
});

await test("stem-and-leaf rows save as structured data and satisfy required guidance", () => {
  const { tree, emitted } = render({ workspace: workspace({ tools: ["rich_text", "stem_leaf"], stemLeaf: { enabled: true, title: "Leaves", instructions: "", starter: emptyStemLeaf() }, requirement: "stem_leaf" }) });
  assert.equal(tree.root.findAll((node) => node.props?.role === "status").length, 1);
  act(() => tab(tree, "Stem-and-leaf").props.onClick());
  act(() => byTestId(tree, "stem-leaf")[0].props.onClick());
  act(() => tab(tree, "Save answer").props.onClick());
  assert.equal(emitted[0].stem_leaf.rows[0].leaves, "1 3 7");
  act(() => tree.unmount());
});

await test("a Venn diagram is kept when the teacher disables the tool", () => {
  const initial = { version: 1, venn: { ...emptyVenn(), regions: { A: "9" } } };
  const { tree, emitted } = render({ initial });
  act(() => byTestId(tree, "write")[0].props.onClick());
  act(() => tab(tree, "Save answer").props.onClick());
  assert.equal(emitted[0].venn.regions.A, "9");
  act(() => tree.unmount());
});

await test("statistics and table work is kept when the teacher disables those tools", () => {
  const initial = {
    version: 1,
    statistics: { ...emptyStats(), values: [2, 4, 6] },
    data_table: { ...emptyTable(), rows: [["a", "b"]] },
  };
  const { tree, emitted } = render({ initial });
  act(() => byTestId(tree, "write")[0].props.onClick());
  act(() => tab(tree, "Save answer").props.onClick());
  assert.equal(emitted[0].statistics.values.length, 3);
  assert.equal(emitted[0].data_table.rows[0][0], "a");
  act(() => tree.unmount());
});

await test("autosave flushes the latest answer synchronously on unmount", () => {
  const { tree, emitted } = render({ autosave: true });
  act(() => byTestId(tree, "write")[0].props.onClick());
  assert.equal(emitted.length, 0);
  act(() => tree.unmount());
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].text, "x = 4");
});

await test("a saved graph is kept even if the teacher later disables the graph tool", () => {
  const initial = { version: 1, text: "Earlier work", doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Earlier work" }] }] }, graph: { ...emptyGraph(), points: [{ id: "p1", x: 1, y: 1 }] } };
  const { tree, emitted } = render({ workspace: workspace({ tools: ["rich_text"], graph: { enabled: false, title: "g", instructions: "", allowFunctions: true, starter: emptyGraph() }, geometry: { enabled: false, title: "g", instructions: "", starter: emptyGeometry() } }), initial });
  act(() => byTestId(tree, "write")[0].props.onClick());
  act(() => tab(tree, "Save answer").props.onClick());
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].graph.points.length, 1);
  act(() => tree.unmount());
});

await test("missing required graph guidance is shown and the editor stays usable", () => {
  const { tree } = render({ workspace: workspace({ requirement: "graph" }) });
  const status = tree.root.findAll((node) => node.props?.role === "status");
  assert.equal(status.length, 1);
  assert.match(String(status[0].props.children.join("")), /asks for a graph/);
  act(() => tree.unmount());
});

await test("a rejected save keeps the response dirty", () => {
  const dirty = [];
  const { tree } = render({ accepted: false, onDirtyChange: (value) => dirty.push(value) });
  act(() => byTestId(tree, "write")[0].props.onClick());
  act(() => tab(tree, "Save answer").props.onClick());
  assert.deepEqual(dirty, [true]);
  assert.match(String(tab(tree, "Save answer").props.children), /Save answer/);
  act(() => tree.unmount());
});

await test("disabled marking view exposes no editable controls", () => {
  const { tree } = render({ disabled: true });
  assert.equal(byTestId(tree, "write").length, 0);
  assert.equal(byTestId(tree, "readonly-doc").length, 1);
  assert.equal(tab(tree, "Answer locked").props.disabled, true);
  act(() => tree.unmount());
});

console.log(`\n${count} structured-response checks passed (real component; mocked editor children).`);
