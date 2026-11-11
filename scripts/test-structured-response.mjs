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
const hasItems = (spec) => Boolean(spec && ["points", "segments", "annotations", "functions", "lines", "circles", "polygons", "angles"].some((key) => Array.isArray(spec[key]) && spec[key].length));
const payloads = [];
let lastGraphChange = null;
let lastGeometryChange = null;

const originalLoad = Module._load;
Module._load = function (request, parent) {
  if (parent?.filename === file) {
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

const workspace = (overrides = {}) => ({
  tools: ["rich_text", "math", "graph", "geometry"],
  graph: { enabled: true, title: "Your graph", instructions: "", allowFunctions: true, starter: emptyGraph() },
  geometry: { enabled: true, title: "Your construction", instructions: "", starter: emptyGeometry() },
  guidance: "",
  requirement: "any",
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
