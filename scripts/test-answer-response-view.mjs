// Marker rendering regression checks for structured candidate responses.
//
// In particular, an assess-parts answer stores a *map* of typed values at
// `answer.parts`, while its optional working lives at `answer.working`. This
// renders the real marker component with lightweight child-view stubs so a
// future config-parser change cannot make those saved typed answers disappear.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Module } from "node:module";
import path from "node:path";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import ts from "typescript";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const filename = path.resolve("scripts/__virtual_answer_response_view.cjs");
const source = ts.transpileModule(readFileSync("src/components/AnswerResponseView.tsx", "utf8"), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX,
    esModuleInterop: true,
  },
}).outputText;

const plain = (name) => {
  const PlainView = ({ children }) => React.createElement("span", { "data-view": name }, children ?? name);
  PlainView.displayName = `${name}-stub`;
  return PlainView;
};
const MathTextStub = ({ text }) => React.createElement("span", { "data-view": "math-text" }, text);
MathTextStub.displayName = "math-text-stub";
const ProbabilityTreeStub = () => React.createElement("span", { "data-view": "tree-view" }, "Probability tree drawing");
ProbabilityTreeStub.displayName = "probability-tree-stub";
const identity = (value) => value;
const noWork = () => false;
const originalLoad = Module._load;
Module._load = function (request, parent) {
  if (parent?.filename === filename) {
    if (request === "./RichContent") return { RichContent: plain("rich-content") };
    if (request === "./MathText") return { MathText: MathTextStub };
    if (request === "./graph/GraphView") return { GraphView: plain("graph-view") };
    if (request === "./geometry/GeometryView") return { GeometryView: plain("geometry-view") };
    if (request === "./stats/StatsView") return { StatsView: plain("stats-view") };
    if (request === "./venn/VennView") return { VennView: plain("venn-view") };
    if (request === "./probability/ProbabilityTreeView") return { ProbabilityTreeView: ProbabilityTreeStub };
    if (request === "./stem-leaf/StemLeafView") return { StemLeafView: plain("stem-leaf-view") };
    if (request === "./stats/DataTableView") return { DataTableView: plain("data-table-view") };
    if (request === "@/lib/graphSpec") return { normaliseGraphSpec: identity, graphSpecHasWork: noWork };
    if (request === "@/lib/geometrySpec") return { normaliseGeometrySpec: identity, geometrySpecHasWork: noWork };
    if (request === "@/lib/statsSpec") return { normaliseStatsSpec: identity, statsSpecHasWork: noWork };
    if (request === "@/lib/dataTableSpec") return { normaliseDataTableSpec: identity, dataTableHasWork: noWork };
    if (request === "@/lib/vennSpec") return { normaliseVennSpec: identity, vennSpecHasWork: noWork, vennSummary: () => "" };
    if (request === "@/lib/probabilityTreeSpec") return {
      normaliseProbabilityTreeSpec: identity,
      probabilityTreeHasWork: (value) => Boolean(value?.nodes?.length),
      probabilityTreeSummary: () => "one branch",
    };
    if (request === "@/lib/stemLeafSpec") return { normaliseStemLeafSpec: identity, stemLeafHasWork: noWork, stemLeafSummary: () => "" };
    if (request === "@/lib/responseTools") return {
      describeAnswerComponents: (answer) => answer?.parts ? ["typed part answers", "per-part working"] : ["Empty response"],
    };
  }
  return originalLoad.apply(this, arguments);
};

const virtual = new Module(filename);
virtual.filename = filename;
virtual.paths = Module._nodeModulePaths(path.dirname(filename));
virtual._compile(source, filename);
Module._load = originalLoad;
const { AnswerResponseView } = virtual.exports;

function render(props) {
  let tree;
  act(() => { tree = TestRenderer.create(React.createElement(AnswerResponseView, props)); });
  return tree;
}

function textOf(node) {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(" ");
  return textOf(node.children);
}

let checks = 0;
function check(name, fn) {
  fn();
  checks += 1;
  console.log(`  ✓ ${name}`);
}

check("typed assess-parts answers render in question order beside optional per-part working", () => {
  const tree = render({
    answer: {
      parts: { a: "3/4", b: "The quantities are proportional." },
      working: {
        a: {
          text: "3 ÷ 4 = 0.75",
          probability_tree: { nodes: [{ id: "root" }, { id: "red", parentId: "root", label: "Red" }] },
        },
      },
    },
    assessParts: [
      { id: "a", label: "(a)", prompt: "State the probability.", points: 1 },
      { id: "b", label: "(b)", prompt: "Explain your reasoning.", points: 2 },
    ],
    showComponents: true,
  });
  const output = textOf(tree.toJSON());
  assert.match(output, /Typed answers by part/);
  assert.match(output, /\(a\).*State the probability.*3\/4/s);
  assert.match(output, /\(b\).*Explain your reasoning.*The quantities are proportional/s);
  assert.match(output, /Working shown for part\s+\(a\)/);
  assert.match(output, /3 ÷ 4 = 0\.75/);
  assert.match(output, /Probability tree drawing/);
  assert.match(output, /typed part answers/);
  act(() => tree.unmount());
});

check("a saved typed-part map is never parsed as authoring configuration", () => {
  const tree = render({ answer: { parts: { a: "42" }, working: { a: { text: "I checked the units." } } } });
  const output = textOf(tree.toJSON());
  assert.match(output, /\(a\)/);
  assert.match(output, /42/);
  assert.match(output, /I checked the units/);
  assert.doesNotMatch(output, /\(empty response\)/);
  act(() => tree.unmount());
});

check("unknown part ids from a historical question revision remain inspectable", () => {
  const tree = render({
    answer: { parts: { a: "current", legacy: "preserved" } },
    assessParts: [{ id: "a", label: "(a)", prompt: "Current part" }],
  });
  const output = textOf(tree.toJSON());
  assert.match(output, /current/);
  assert.match(output, /\(legacy\)/);
  assert.match(output, /preserved/);
  act(() => tree.unmount());
});

console.log(`\n${checks} checks passed (answer response marker view).`);
