// Render the actual PaperBuilder and RichContent components with isolated
// component adapters. This exercises the real candidate-preview composition
// without a server, student account, or production database.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Module } from "node:module";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const paperFile = path.resolve("src/app/dashboard/papers/PaperBuilder.tsx");
const richFile = path.resolve("src/components/RichContent.tsx");
const richModule = new Module(richFile);
richModule.filename = richFile;
richModule.paths = Module._nodeModulePaths(path.dirname(richFile));
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (parent?.filename === richFile) {
    if (request === "@/lib/content") return {
      docIsEmpty: () => false,
      renderLatex: (latex) => `<span class="katex">${latex}</span>`,
      docHasCorruptedMath: () => false,
      renderMathAndFormatting: (text) => text,
    };
    if (["@/lib/graphSpec", "@/lib/geometrySpec", "@/lib/statsSpec", "@/lib/dataTableSpec"].includes(request)) {
      const normalise = (spec) => spec;
      return { normaliseGraphSpec: normalise, normaliseGeometrySpec: normalise, normaliseStatsSpec: normalise, normaliseDataTableSpec: normalise };
    }
    if (request === "@/lib/assessDiagram") return { normaliseAssessDiagram: (spec) => spec };
    if (request === "@/lib/mathRender") return { docHasCorruptedMath: () => false, renderMathAndFormatting: (text) => text };
    if (request === "./MathText") return { MathText: ({ text }) => React.createElement("span", null, text) };
    if (request === "./graph/GraphView") return { GraphView: ({ spec }) => React.createElement("svg", { "data-graph": spec?.type ?? "unknown", "aria-label": "Question graph" }, React.createElement("circle", { cx: 10, cy: 10, r: 5 })) };
    if (request === "./geometry/GeometryView") return { GeometryView: () => React.createElement("svg", { "data-geometry": "true" }) };
    if (request === "./stats/StatsView") return { StatsView: () => React.createElement("svg", { "data-stats": "true" }) };
    if (request === "./stats/DataTableView") return { DataTableView: () => React.createElement("table", { "data-table-view": "true" }) };
    if (request === "./AssessDiagram") return { AssessDiagram: () => React.createElement("svg", { "data-assess-diagram": "true" }) };
  }
  if (parent?.filename === paperFile) {
    if (request === "@/components/RichContent") return richModule.exports;
    if (request === "@/components/ui") {
      const passthrough = (tag) => {
        const Component = ({ children, ...props }) => React.createElement(tag, props, children);
        Component.displayName = `PaperTest${tag}`;
        return Component;
      };
      const Field = ({ label, children }) => React.createElement("label", null, React.createElement("span", null, label), children);
      return { Button: passthrough("button"), Card: passthrough("section"), Field, Input: passthrough("input"), Select: passthrough("select"), Textarea: passthrough("textarea") };
    }
    if (request === "@/lib/content") return {};
    if (request === "lucide-react") return new Proxy({}, { get: () => () => React.createElement("i") });
    if (request === "next/navigation") return { useRouter: () => ({ push() {}, refresh() {} }) };
    if (request === "./actions") return { savePaper: async () => ({ ok: true, id: "paper" }) };
  }
  return originalLoad.call(this, request, parent, isMain);
};
richModule._compile(ts.transpileModule(readFileSync(richFile, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, richFile);
const paperModule = new Module(paperFile);
paperModule.filename = paperFile;
paperModule.paths = Module._nodeModulePaths(path.dirname(paperFile));
paperModule._compile(ts.transpileModule(readFileSync(paperFile, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, paperFile);
Module._load = originalLoad;

const questionId = "20000000-0000-4000-8000-000000000004";
const doc = { type: "doc", content: [
  { type: "paragraph", content: [{ type: "text", text: "Solve this." }] },
  { type: "mathBlock", attrs: { latex: "x^2 = 9" } },
  { type: "graphBlock", attrs: { spec: { type: "cartesian", expressions: ["y=x^2"] } } },
  { type: "table", content: [{ type: "tableRow", content: [{ type: "tableCell", content: [{ type: "text", text: "input" }] }] }] },
] };
const optionDoc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "mathInline", attrs: { latex: "x=3" } }] }] };
const html = renderToStaticMarkup(React.createElement(paperModule.exports.PaperBuilder, {
  initial: { title: "Algebra paper", description: "", status: "published", instructions: "Show working", class_id: "", subject_id: "", programme: "", curriculum: "", max_marks: 6, randomize_questions: false, randomize_options: false,
    sections: [{ id: "sec-a", title: "Section A", question_ids: [questionId] }], question_points: { [questionId]: 6 } },
  bank: [{ id: questionId, prompt: "Solve this", prompt_doc: doc, type: "single_choice", points: 6, status: "published", topic: "Algebra", question_options: [{ label: "x=3", content_doc: optionDoc, position: 0, is_correct: true }] }],
  classes: [], subjects: [], programmes: [],
}));

assert.ok(html.includes("Candidate paper preview"));
assert.ok(html.includes("Section A") && html.includes("[6 marks]"));
assert.ok(html.includes('class="katex"') && html.includes("x^2 = 9") && html.includes("x=3"));
assert.ok(html.includes('<svg data-graph="cartesian"') && html.includes("<table>"));
assert.ok(!html.includes("is_correct"), "answer correctness must not appear in candidate preview");
console.log("5 checks passed (actual PaperBuilder + RichContent rendered with React SSR; isolated adapters only).");
