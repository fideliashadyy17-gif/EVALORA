/**
 * Functional checks for the Assessment Studio primitives introduced with the
 * structured response upgrade: the safe expression parser, the versioned graph
 * and geometry specifications, response-workspace inference and server-side
 * answer validation.
 *
 * Run: node scripts/test-assessment-studio.mjs
 */
import { execSync } from "node:child_process";
import { createRequire } from "node:module";

const outDir = "/tmp/evalora-studio-test";
execSync(
  `npx tsc src/lib/content.ts src/lib/mathExpr.ts src/lib/graphSpec.ts src/lib/geometrySpec.ts src/lib/responseTools.ts --outDir ${outDir} --rootDir src --module commonjs --target es2022 --strict --esModuleInterop --skipLibCheck --moduleResolution node`,
  { stdio: "inherit" },
);
execSync(`ln -sfn "$(pwd)/node_modules" ${outDir}/node_modules`, { stdio: "inherit" });

const require = createRequire(import.meta.url);
const { compileExpression, stripEquation, evaluateSafe } = require(`${outDir}/lib/mathExpr.js`);
const {
  emptyGraphSpec,
  normaliseGraphSpec,
  graphSpecHasWork,
  sampleGraphFunction,
  graphIntersections,
  graphSpecIssues,
} = require(`${outDir}/lib/graphSpec.js`);
const {
  emptyGeometrySpec,
  normaliseGeometrySpec,
  resolveGeometry,
  geometryMeasurements,
  geometrySpecHasWork,
} = require(`${outDir}/lib/geometrySpec.js`);
const {
  responseWorkspaceFor,
  validateAnswerPayload,
  answerHasWork,
  describeAnswerComponents,
  RESPONSE_TOOL_IDS,
} = require(`${outDir}/lib/responseTools.js`);

let passed = 0;
const ok = (name, condition) => {
  if (!condition) throw new Error(`FAIL: ${name}`);
  passed += 1;
  console.log(`  ✓ ${name}`);
};
const near = (a, b, tolerance = 1e-6) => Math.abs(a - b) <= tolerance;

/* ─── Safe expression parser ─────────────────────────────────────── */
console.log("Expression parser");
{
  const linear = compileExpression("2x + 3");
  ok("compiles 2x + 3", linear.ok);
  ok("evaluates 2x + 3 at x = 4", near(linear.evaluate(4), 11));

  ok("strips a y = prefix", stripEquation("y = 2x + 3") === "2x + 3");
  ok("strips f(x) = prefix", stripEquation("f(x)=x^2") === "x^2");

  const quadratic = compileExpression("x^2 - 4x + 3");
  ok("quadratic roots", quadratic.ok && near(quadratic.evaluate(1), 0) && near(quadratic.evaluate(3), 0));
  ok("right-associative powers", near(compileExpression("2^3^2").evaluate(0), 512));
  ok("unary minus binds tighter than power", near(compileExpression("-2^2").evaluate(0), -4));
  ok("implicit multiplication with brackets", near(compileExpression("(x+1)(x-2)").evaluate(3), 4));
  ok("implicit multiplication before functions", near(compileExpression("2sin(0)").evaluate(1), 0));
  ok("constants", near(compileExpression("pi").evaluate(0), Math.PI));

  ok("rejects an unbalanced bracket", !compileExpression("sin(x").ok);
  ok("rejects an unknown function", !compileExpression("nope(x)").ok);
  ok("rejects a trailing operator", !compileExpression("x +").ok);
  ok("rejects division by zero-ish garbage", !compileExpression("x / ").ok);
  ok("empty expression is rejected", !compileExpression("").ok);
  ok("safe evaluation guards NaN", evaluateSafe(compileExpression("sqrt(x)"), -1) === null);
  ok("evaluateSafe returns numbers", evaluateSafe(compileExpression("x^2"), 3) === 9);
}

/* ─── Graph specification ────────────────────────────────────────── */
console.log("Graph specification");
{
  const empty = emptyGraphSpec();
  ok("empty graph is version 1", empty.version === 1);
  ok("empty graph has no work", !graphSpecHasWork(empty));
  ok("empty graph has no validation issues", graphSpecIssues(empty).length === 0);

  const spec = normaliseGraphSpec({
    version: 99,
    domain: { xMin: -5, xMax: 5, yMin: -10, yMax: 10 },
    functions: [{ expression: "y = x^2 - 4" }],
    points: [{ x: 1, y: 2, label: "A" }],
  });
  ok("unknown versions normalise to 1", spec.version === 1);
  ok("domain survives normalisation", spec.domain.xMin === -5 && spec.domain.yMax === 10);
  ok("function expression survives", spec.functions[0].expression === "y = x^2 - 4");
  ok("normalised graph has work", graphSpecHasWork(spec));

  const sampled = sampleGraphFunction(spec.functions[0], spec);
  ok("function samples without error", sampled.error === null && sampled.samples.length > 100);
  ok("sampled points satisfy the equation", sampled.samples.every((p) => near(p.y, p.x * p.x - 4, 1e-6)));
  ok("sampled path is an SVG polyline", sampled.path.startsWith("M ") && sampled.path.includes(" L "));

  const bad = sampleGraphFunction({ ...spec.functions[0], expression: "x^" }, spec);
  ok("invalid expressions produce an error, not a crash", bad.error !== null && bad.samples.length === 0);

  const crossing = normaliseGraphSpec({
    domain: { xMin: -5, xMax: 5, yMin: -5, yMax: 5 },
    functions: [
      { id: "f", expression: "2x + 1", from: -5, to: 5 },
      { id: "g", expression: "-x + 4", from: -5, to: 5 },
    ],
  });
  const hits = graphIntersections(crossing);
  ok("finds the intersection of two lines", hits.length === 1 && near(hits[0].x, 1, 1e-3) && near(hits[0].y, 3, 1e-3));

  const huge = normaliseGraphSpec({ points: Array.from({ length: 400 }, (_, i) => ({ x: i, y: i })) });
  ok("point count is capped", huge.points.length <= 200);
  ok("degenerate domains are repaired", normaliseGraphSpec({ domain: { xMin: 5, xMax: 5, yMin: 3, yMax: 3 } }).domain.xMax > 5);
}

/* ─── Geometry specification ─────────────────────────────────────── */
console.log("Geometry specification");
{
  const empty = emptyGeometrySpec();
  ok("empty construction has no work", !geometrySpecHasWork(empty));
  const spec = normaliseGeometrySpec({
    points: [
      { id: "A", x: 0, y: 0, label: "A" },
      { id: "B", x: 4, y: 0, label: "B" },
      { id: "C", x: 0, y: 3, label: "C" },
    ],
    lines: [
      { id: "AB", kind: "segment", a: "A", b: "B" },
      { id: "AC", kind: "segment", a: "A", b: "C" },
    ],
    polygons: [{ id: "tri", points: ["A", "B", "C"] }],
  });
  ok("construction has work", geometrySpecHasWork(spec));
  const resolved = resolveGeometry(spec);
  ok("points resolve", resolved.points.size === 3);
  ok("segments resolve", resolved.lines.filter((l) => l.kind === "segment").length === 2);
  const measurements = geometryMeasurements(spec, resolved);
  ok("measures segment AB as 4", measurements.some((m) => m.id === "AB" && m.kind === "length" && m.text === "4 units"));
  ok("measures segment AC as 3", measurements.some((m) => m.id === "AC" && m.kind === "length" && m.text === "3 units"));
  ok("measures the triangle area", measurements.some((m) => m.kind === "area" && m.text.includes("6")));

  const midpoint = normaliseGeometrySpec({
    points: [
      { id: "A", x: 0, y: 0 },
      { id: "B", x: 6, y: 4 },
      { id: "M", kind: "midpoint", dependsOn: ["A", "B"] },
    ],
  });
  const mid = resolveGeometry(midpoint).points.get("M");
  ok("midpoint resolves to the average", mid && near(mid.x, 3) && near(mid.y, 2));

  const badRefs = normaliseGeometrySpec({ lines: [{ id: "L", a: "missing", b: "also-missing" }] });
  ok("lines with unknown points are dropped", badRefs.lines.length === 0);
  const dupes = normaliseGeometrySpec({ points: [{ id: "A", x: 0, y: 0 }, { id: "A", x: 2, y: 2 }] });
  ok("duplicate point ids are dropped", dupes.points.length === 1);
}

/* ─── Response workspace inference ───────────────────────────────── */
console.log("Response workspace");
{
  ok("six response tools are published", RESPONSE_TOOL_IDS.length === 6 && RESPONSE_TOOL_IDS.includes("graph") && RESPONSE_TOOL_IDS.includes("science"));

  const prose = responseWorkspaceFor({ type: "open_ended", prompt: "Explain what a sequence is." });
  ok("prose question gets rich text", prose.tools.includes("rich_text") && prose.tools.includes("math"));
  ok("prose question has no graph", !prose.graph.enabled);
  ok("prose inference is marked inferred", prose.source === "inferred");

  const graph = responseWorkspaceFor({ type: "open_ended", prompt: "Sketch the graph of y = 2x + 3 on the axes." });
  ok("graph language enables the graph workspace", graph.graph.enabled && graph.tools.includes("graph"));
  ok("graph question still allows written work", graph.tools.includes("rich_text"));

  const geometry = responseWorkspaceFor({ type: "open_ended", prompt: "Construct triangle ABC and its perpendicular bisector." });
  ok("construction language enables geometry", geometry.geometry.enabled && geometry.tools.includes("geometry"));

  const configured = responseWorkspaceFor({
    type: "open_ended",
    prompt: "Explain your reasoning.",
    config: { response_tools: ["rich_text", "graph"], response_guidance: "Show the method.", response_requirement: "graph" },
  });
  ok("explicit tools override inference", configured.tools.includes("graph") && !configured.tools.includes("geometry"));
  ok("explicit configuration is marked configured", configured.source === "configured");
  ok("guidance and requirement pass through", configured.guidance === "Show the method." && configured.requirement === "graph");

  const geometryOnly = responseWorkspaceFor({ type: "open_ended", prompt: "x", config: { response_tools: ["geometry"] } });
  ok("tool list can exclude prose", !geometryOnly.tools.includes("rich_text") && geometryOnly.geometry.enabled);

  const mcq = responseWorkspaceFor({ type: "single_choice", prompt: "Plot the graph of y = x." });
  ok("objective types keep their native UI", mcq.source === "native" && mcq.tools.length === 0 && !mcq.graph.enabled);

  const starter = responseWorkspaceFor({
    type: "open_ended",
    prompt: "Plot…",
    config: { response_graph: { title: "Axes for Q4", starter: { domain: { xMin: -4, xMax: 4, yMin: -3, yMax: 3 } } } },
  });
  ok("teacher starter axes reach the candidate", starter.graph.starter.domain.xMin === -4 && starter.graph.starter.domain.yMax === 3);
  ok("teacher graph title reaches the candidate", starter.graph.title === "Axes for Q4");
}

/* ─── Answer validation (server side) ────────────────────────────── */
console.log("Answer validation");
{
  const graph = emptyGraphSpec();
  graph.points.push({ id: "p1", x: 2, y: 3, label: "P", color: "#0a5c36", showLabel: true });
  const geometry = emptyGeometrySpec();
  geometry.points.push({ id: "A", x: 0, y: 0, label: "A", color: "#0a5c36", showLabel: true });

  const structured = validateAnswerPayload("open_ended", {
    version: 1,
    text: "Working follows.",
    doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "x = 4" }] }] },
    graph,
    geometry,
    smuggled: "<script>alert(1)</script>",
  });
  ok("structured answer is accepted", structured.ok);
  ok("unknown keys are stripped", !("smuggled" in structured.answer));
  ok("structured answer keeps graph and geometry", Boolean(structured.answer.graph && structured.answer.geometry));
  ok("structured answer is versioned", structured.answer.version === 1);

  ok("rejects a non-object answer", !validateAnswerPayload("open_ended", "hello").ok);
  ok("rejects an array answer", !validateAnswerPayload("open_ended", []).ok);
  ok("rejects a malformed document", !validateAnswerPayload("open_ended", { doc: { type: "paragraph" } }).ok);
  ok("rejects a numeric doc text", !validateAnswerPayload("open_ended", { text: 42 }).ok);
  ok("rejects an oversized written answer", !validateAnswerPayload("open_ended", { text: "x".repeat(20001) }).ok);
  ok("accepts an empty response", validateAnswerPayload("open_ended", {}).ok);

  ok("legacy option answer still validates", validateAnswerPayload("single_choice", { option_id: "a" }).ok);
  ok("legacy numeric answer still validates", validateAnswerPayload("numeric", { value: 3.5 }).ok);
  ok("objective answers keep unknown keys", validateAnswerPayload("short_answer", { text: "42", extra: true }).answer.extra === true);
  ok("rejects a non-string selection", !validateAnswerPayload("single_choice", { option_id: 7 }).ok);
  ok("rejects malformed pairs", !validateAnswerPayload("matching", { pairs: [{ left: 1 }] }).ok);

  ok("empty document has no work", !answerHasWork({ doc: { type: "doc", content: [{ type: "paragraph" }] } }));
  ok("written text counts as work", answerHasWork({ text: "x = 4" }));
  ok("formatted document counts as work", answerHasWork({ doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "hi" }] }] } }));
  ok("graph point counts as work", answerHasWork({ graph }));
  ok("geometry point counts as work", answerHasWork({ geometry }));
  ok("empty structured answer has no work", !answerHasWork({ version: 1, graph: emptyGraphSpec(), geometry: emptyGeometrySpec() }));

  ok("components describe a mixed response", describeAnswerComponents({ text: "x", graph }).includes("graph construction"));
  ok("components describe an empty response", describeAnswerComponents({}).includes("Empty response"));
}

console.log(`\n${passed} checks passed`);
