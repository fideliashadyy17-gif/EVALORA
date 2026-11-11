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
  `npx tsc src/lib/content.ts src/lib/mathExpr.ts src/lib/graphSpec.ts src/lib/geometrySpec.ts src/lib/statsSpec.ts src/lib/dataTableSpec.ts src/lib/responseTools.ts --outDir ${outDir} --rootDir src --module commonjs --target es2022 --strict --esModuleInterop --skipLibCheck --moduleResolution node`,
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
const {
  emptyStatsSpec,
  normaliseStatsSpec,
  statsSummary,
  statsSpecHasWork,
  statsSpecSummary,
  histogramBins,
  dotPlotStacks,
  cumulativeFrequencies,
  boxPlotSummary,
  niceBinWidth,
  countAxis,
} = require(`${outDir}/lib/statsSpec.js`);
const {
  emptyDataTableSpec,
  normaliseDataTableSpec,
  dataTableHasWork,
  resizeDataTable,
} = require(`${outDir}/lib/dataTableSpec.js`);

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

/* ─── Statistics specification ───────────────────────────────────── */
console.log("Statistics specification");
{
  const empty = emptyStatsSpec();
  ok("empty statistics spec has no work", !statsSpecHasWork(empty));
  const spec = normaliseStatsSpec({
    version: 7,
    chart: "histogram",
    values: [4, 7, 7, 8, 9, 10, 12, -3, "5", "nope", Infinity],
    binWidth: 5,
    title: "Scores",
  });
  ok("unknown version normalises to 1", spec.version === 1);
  ok("chart type survives normalisation", spec.chart === "histogram");
  ok("non-numeric values are dropped", spec.values.length === 9);
  ok("numeric strings are accepted", spec.values.includes(5));
  ok("statistics spec has work", statsSpecHasWork(spec));
  ok("summary counts every value", statsSummary(spec.values).count === 9);

  const five = statsSummary([1, 2, 3, 4, 5]);
  ok("mean is exact", five.mean === 3);
  ok("median is the middle value", five.median === 3);
  ok("Tukey quartiles exclude the median", five.q1 === 1.5 && five.q3 === 4.5);
  ok("IQR and range are computed", five.iqr === 3 && five.range === 4);
  ok("single mode is detected", JSON.stringify(statsSummary([1, 1, 2, 3]).mode) === "[1]");
  ok("ties produce multiple modes", statsSummary([1, 1, 2, 2, 3]).mode.length === 2);
  ok("no mode when every value is distinct", statsSummary([1, 2, 3]).mode.length === 0);
  ok("population standard deviation", Math.abs(statsSummary([2, 4, 4, 4, 5, 5, 7, 9]).standardDeviation - 2) < 1e-9);

  const gaps = normaliseStatsSpec({ chart: "bad_chart", values: "not-an-array" });
  ok("unknown chart types fall back to a dot plot", gaps.chart === "dot_plot" && gaps.values.length === 0);

  ok("nice bin width chooses a round step", niceBinWidth(18, 8) === 2.5 || niceBinWidth(18, 8) === 2);
  const bins = histogramBins([1, 2, 2, 3, 9, 10], 2);
  ok("histogram bins cover the data", bins.length >= 5 && bins.reduce((total, bin) => total + bin.count, 0) === 6);
  ok("histogram bins have positive width", bins.every((bin) => bin.to > bin.from));
  ok("automatic bin width is finite", histogramBins([1, 2, 3, 4], null).every((bin) => Number.isFinite(bin.from)));

  const stacks = dotPlotStacks([3, 1, 3, 2, 3]);
  ok("dot plot stacks equal values", stacks.length === 3 && stacks.find((entry) => entry.value === 3).count === 3);
  const cumulative = cumulativeFrequencies([1, 2, 2, 4]);
  ok("cumulative frequency accumulates", cumulative[cumulative.length - 1].cumulative === 4);
  ok("cumulative points are ordered", cumulative.map((point) => point.value).join(",") === "1,2,4");

  const box = boxPlotSummary([1, 2, 3, 4, 5, 100]);
  ok("box plot finds the median", box && box.median === 3.5);
  ok("box plot identifies the outlier", box && box.outliers.includes(100));
  ok("box plot whisker stops before the outlier", box && box.whiskerHigh === 5);
  ok("box plot of no data is null", boxPlotSummary([]) === null);

  const categorical = normaliseStatsSpec({ chart: "bar_chart", categories: [{ label: "Red", value: 3 }] });
  ok("bar chart has work from categories", statsSpecHasWork(categorical));
  ok("bar chart summary counts categories", statsSpecSummary(categorical) === "1 category");
  ok("count axis uses whole-number steps", countAxis(7).step >= 1 && countAxis(7).ticks.every(Number.isInteger));
}

/* ─── Data table specification ───────────────────────────────────── */
console.log("Data table specification");
{
  const empty = emptyDataTableSpec();
  ok("empty table has no work", !dataTableHasWork(empty));
  const table = normaliseDataTableSpec({
    columns: ["Interval", "Frequency"],
    rows: [["0–9", "4"], ["10–19"], ["20–29", "7", "extra"]],
    rowHeaders: true,
  });
  ok("columns survive normalisation", table.columns.length === 2);
  ok("rows align to the column count", table.rows.every((row) => row.length === 2));
  ok("missing cells become empty strings", table.rows[1][1] === "");
  ok("extra cells are dropped", table.rows[2].length === 2);
  ok("row header flag survives", table.rowHeaders === true);
  ok("filled table has work", dataTableHasWork(table));

  const wide = resizeDataTable(table, 4, 4);
  ok("resize grows rows and columns", wide.rows.length === 4 && wide.columns.length === 4);
  ok("resize preserves existing cells", wide.rows[0][1] === "4");
  const narrow = resizeDataTable(table, 1, 1);
  ok("resize shrinks without losing the first cell", narrow.rows.length === 1 && narrow.rows[0][0] === "0–9");
  ok("resize enforces a minimum grid", resizeDataTable(table, 0, 0).rows.length === 1);

  const long = normaliseDataTableSpec({ rows: [["x".repeat(500)]] });
  ok("cells are bounded", long.rows[0][0].length === 200);
}

/* ─── Response workspace inference ───────────────────────────────── */
console.log("Response workspace");
{
  ok("eight response tools are published", RESPONSE_TOOL_IDS.length === 8 && RESPONSE_TOOL_IDS.includes("graph") && RESPONSE_TOOL_IDS.includes("statistics") && RESPONSE_TOOL_IDS.includes("data_table"));

  const prose = responseWorkspaceFor({ type: "open_ended", prompt: "Explain what a sequence is." });
  ok("prose question gets rich text", prose.tools.includes("rich_text") && prose.tools.includes("math"));
  ok("prose question has no graph", !prose.graph.enabled);
  ok("prose inference is marked inferred", prose.source === "inferred");

  const graph = responseWorkspaceFor({ type: "open_ended", prompt: "Sketch the graph of y = 2x + 3 on the axes." });
  ok("graph language enables the graph workspace", graph.graph.enabled && graph.tools.includes("graph"));
  ok("graph question still allows written work", graph.tools.includes("rich_text"));

  const geometry = responseWorkspaceFor({ type: "open_ended", prompt: "Construct triangle ABC and its perpendicular bisector." });
  ok("construction language enables geometry", geometry.geometry.enabled && geometry.tools.includes("geometry"));

  const stats = responseWorkspaceFor({ type: "open_ended", prompt: "Draw a histogram of the data and find the median." });
  ok("statistics language enables the statistics workspace", stats.statistics.enabled && stats.tools.includes("statistics"));
  ok("statistics question still allows prose", stats.tools.includes("rich_text"));

  const tableQuestion = responseWorkspaceFor({ type: "open_ended", prompt: "Complete the table below for the first five terms." });
  ok("table-completion language enables the structured table", tableQuestion.dataTable.enabled && tableQuestion.tools.includes("data_table"));

  const configuredStats = responseWorkspaceFor({
    type: "open_ended",
    prompt: "Show your data.",
    config: {
      response_tools: ["rich_text", "statistics", "data_table"],
      response_stats: { title: "Scores", chart: "histogram", starter: { values: [1, 2, 3], chart: "histogram" } },
      response_data_table: { starter: { columns: ["x", "f"], rows: [["1", "2"]], rowHeaders: true } },
    },
  });
  ok("configured chart type reaches the candidate", configuredStats.statistics.chart === "histogram");
  ok("configured starter values reach the candidate", configuredStats.statistics.starter.values.length === 3);
  ok("configured table starter reaches the candidate", configuredStats.dataTable.starter.rows.length === 1 && configuredStats.dataTable.starter.rowHeaders);

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
  ok("objective types never receive statistics or a data table", !mcq.statistics.enabled && !mcq.dataTable.enabled);

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

  const statistics = normaliseStatsSpec({ chart: "box_plot", values: [1, 2, 3, 4, 100] });
  const dataTable = normaliseDataTableSpec({ columns: ["x", "f"], rows: [["1", "2"]], rowHeaders: true });
  const structured = validateAnswerPayload("open_ended", {
    version: 1,
    text: "Working follows.",
    doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "x = 4" }] }] },
    graph,
    geometry,
    statistics,
    data_table: dataTable,
    smuggled: "<script>alert(1)</script>",
  });
  ok("structured answer is accepted", structured.ok);
  ok("unknown keys are stripped", !("smuggled" in structured.answer));
  ok("structured answer keeps graph and geometry", Boolean(structured.answer.graph && structured.answer.geometry));
  ok("structured answer keeps the statistics chart", structured.answer.statistics?.values?.length === 5);
  ok("structured answer keeps the data table", structured.answer.data_table?.rows?.[0]?.[0] === "1");

  ok("a malformed statistics answer is rejected", !validateAnswerPayload("open_ended", { statistics: "chart" }).ok);
  ok("too many statistics values are rejected", !validateAnswerPayload("open_ended", {
    statistics: { values: Array.from({ length: 401 }, (_, index) => index) },
  }).ok);
  ok("too many table rows are rejected", !validateAnswerPayload("open_ended", {
    data_table: { columns: ["a"], rows: Array.from({ length: 41 }, () => ["1"]) },
  }).ok);
  ok("oversized table cells are rejected", !validateAnswerPayload("open_ended", {
    data_table: { columns: ["a"], rows: [["x".repeat(201)]] },
  }).ok);
  ok("a malformed data table is rejected", !validateAnswerPayload("open_ended", { data_table: [] }).ok);
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
  ok("statistics chart counts as work", answerHasWork({ statistics }));
  ok("data table counts as work", answerHasWork({ data_table: dataTable }));
  ok("an empty statistics answer has no work", !answerHasWork({ statistics: emptyStatsSpec() }));
  ok("an empty data table has no work", !answerHasWork({ data_table: emptyDataTableSpec() }));
  ok("empty structured answer has no work", !answerHasWork({ version: 1, graph: emptyGraphSpec(), geometry: emptyGeometrySpec() }));

  ok("components describe a mixed response", describeAnswerComponents({ text: "x", graph }).includes("graph construction"));
  ok("components describe statistics and a table", describeAnswerComponents({ statistics, data_table: dataTable }).join(" · ").includes("statistics chart"));
  ok("components describe an empty response", describeAnswerComponents({}).includes("Empty response"));
}

console.log(`\n${passed} checks passed`);
