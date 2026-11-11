/**
 * Which composition tools a question offers a candidate.
 *
 * The decision is automatic and derived from the question itself, so existing
 * papers gain the right workspace without being edited question-by-question:
 *
 *   · objective types keep their native interface (buttons, drag, number);
 *   · a constructed-response question always gets prose + mathematics;
 *   · graph language in the prompt (or an explicit teacher switch) adds the
 *     graph workspace;
 *   · geometry language adds the construction workspace;
 *   · science language adds the science/units palette.
 *
 * A teacher can override the automatic choice per question with
 * `config.response_tools`, and can pre-configure the axes a graph answer starts
 * from. Nothing here changes wording, marks, answers or grading rules.
 */
import { docToPlainText, type RichDoc } from "./content";
import { emptyGraphSpec, normaliseGraphSpec, type GraphSpec } from "./graphSpec";
import { emptyGeometrySpec, normaliseGeometrySpec, type GeometrySpec } from "./geometrySpec";
import {
  emptyStatsSpec,
  normaliseStatsSpec,
  statsSpecHasWork,
  isStatsChartType,
  type StatsChartType,
  type StatsSpec,
} from "./statsSpec";
import {
  dataTableHasWork,
  emptyDataTableSpec,
  normaliseDataTableSpec,
  type DataTableSpec,
} from "./dataTableSpec";

export const RESPONSE_TOOLS = [
  { id: "rich_text", label: "Structured writing", hint: "Paragraphs, headings, lists, tables, step-by-step working." },
  { id: "math", label: "Mathematics editor", hint: "Visual fractions, powers, roots, integrals, matrices — no LaTeX needed." },
  { id: "table", label: "Tables", hint: "Insert a formatted table inside your written answer." },
  { id: "data_table", label: "Structured data table", hint: "Fill in a table whose columns and rows keep their place for marking." },
  { id: "science", label: "Science & units", hint: "Chemistry notation, scientific units, constants and Greek symbols." },
  { id: "graph", label: "Graph workspace", hint: "Draw or plot a coordinate graph as structured, editable data." },
  { id: "geometry", label: "Geometry workspace", hint: "Construct points, lines, circles, polygons, angles and measurements." },
  { id: "statistics", label: "Statistics workspace", hint: "Enter data and draw a dot plot, bar chart, histogram, box plot or cumulative-frequency chart." },
] as const;

export type ResponseToolId = (typeof RESPONSE_TOOLS)[number]["id"];
export const RESPONSE_TOOL_IDS = RESPONSE_TOOLS.map((tool) => tool.id) as ResponseToolId[];

export interface ResponseGraphConfig {
  enabled: boolean;
  title: string;
  instructions: string;
  allowFunctions: boolean;
  starter: GraphSpec;
}

export interface ResponseGeometryConfig {
  enabled: boolean;
  title: string;
  instructions: string;
  starter: GeometrySpec;
}

export interface ResponseStatsConfig {
  enabled: boolean;
  title: string;
  instructions: string;
  /** "any" lets the candidate choose the representation. */
  chart: StatsChartType | "any";
  starter: StatsSpec;
}

export interface ResponseDataTableConfig {
  enabled: boolean;
  title: string;
  instructions: string;
  starter: DataTableSpec;
}

export interface ResponseWorkspace {
  /** Empty for question types that have their own native interface. */
  tools: ResponseToolId[];
  graph: ResponseGraphConfig;
  geometry: ResponseGeometryConfig;
  statistics: ResponseStatsConfig;
  dataTable: ResponseDataTableConfig;
  guidance: string;
  requirement: "any" | "text" | "graph" | "geometry" | "statistics" | "data_table";
  /** Where the tool set came from — shown to the teacher, never to candidates. */
  source: "native" | "configured" | "inferred";
}

const GRAPH_LANGUAGE = /\b(graph|graphs|plot|plotting|sketch|sketched|curve|parabola|coordinate plane|axes|axis|gradient|turning point|vertex|roots? of the (graph|function)|intersections?)\b/i;
const GEOMETRY_LANGUAGE = /\b(geometry|geometric|construct|construction|triangle|quadrilateral|polygon|angle bisector|perpendicular|parallel|circle|arc|midpoint|bisector|parallelogram|rectangle|square|rhombus|trapezium|trapezoid)\b/i;
const SCIENCE_LANGUAGE = /\b(science|physics|chemistry|biology|molecule|atom|reaction|solution|concentration|velocity|acceleration|force|energy|voltage|resistance|moles?|mass|density|pressure|temperature|units?)\b/i;
const STATISTICS_LANGUAGE = /\b(statistics?|statistical|data set|dataset|frequency|frequenc(?:y|ies) table|histogram|dot plot|bar chart|box (?:and[- ]whisker )?plot|quartiles?|interquartile|iqr|median|mean|standard deviation|distribution|cumulative frequency|stem[- ]and[- ]leaf)\b/i;
const DATA_TABLE_LANGUAGE = /\b(complete the (?:frequency |data )?table|copy and complete the table|fill in the table|table below|frequency table|data table)\b/i;

function hasWord(text: string, pattern: RegExp): boolean {
  return pattern.test(text);
}

function promptText(question: { prompt?: string | null; prompt_doc?: RichDoc | null }): string {
  return [question.prompt ?? "", question.prompt_doc ? docToPlainText(question.prompt_doc) : ""].join(" ");
}

function uniqueTools(values: unknown): ResponseToolId[] {
  if (!Array.isArray(values)) return [];
  const allowed = new Set<ResponseToolId>(RESPONSE_TOOL_IDS);
  return [...new Set(values.filter((v): v is ResponseToolId => typeof v === "string" && allowed.has(v as ResponseToolId)))];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** Infer the default tool set from the wording of the question. */
export function inferResponseTools(question: { prompt?: string | null; prompt_doc?: RichDoc | null }): ResponseToolId[] {
  const text = promptText(question);
  const tools: ResponseToolId[] = ["rich_text", "math", "table"];
  if (hasWord(text, DATA_TABLE_LANGUAGE)) tools.push("data_table");
  if (hasWord(text, GRAPH_LANGUAGE)) tools.push("graph");
  if (hasWord(text, GEOMETRY_LANGUAGE)) tools.push("geometry");
  if (hasWord(text, SCIENCE_LANGUAGE)) tools.push("science");
  if (hasWord(text, STATISTICS_LANGUAGE)) tools.push("statistics");
  return tools;
}

const NATIVE_TYPES = new Set([
  "single_choice", "multiple_select", "true_false", "poll", "ordering", "matching", "numeric", "short_answer", "slide",
]);

export function responseWorkspaceFor(question: {
  type: string;
  prompt?: string | null;
  prompt_doc?: RichDoc | null;
  config?: Record<string, unknown> | null;
}): ResponseWorkspace {
  const cfg = asRecord(question.config);
  const rawGraph = asRecord(cfg.response_graph);
  const rawGeometry = asRecord(cfg.response_geometry);
  const rawStats = asRecord(cfg.response_stats);
  const rawTable = asRecord(cfg.response_data_table);
  const guidance = typeof cfg.response_guidance === "string" ? cfg.response_guidance.slice(0, 1000) : "";
  const requirementRaw = typeof cfg.response_requirement === "string" ? cfg.response_requirement : "any";
  const requirement = (["any", "text", "graph", "geometry", "statistics", "data_table"].includes(requirementRaw)
    ? requirementRaw
    : "any") as ResponseWorkspace["requirement"];

  const graphStarter = normaliseGraphSpec(rawGraph.starter ?? cfg.response_graph_starter ?? null, emptyGraphSpec());
  const geometryStarter = normaliseGeometrySpec(rawGeometry.starter ?? cfg.response_geometry_starter ?? null, emptyGeometrySpec());
  const statsStarter = normaliseStatsSpec(rawStats.starter ?? null, emptyStatsSpec());
  const tableStarter = normaliseDataTableSpec(rawTable.starter ?? null, emptyDataTableSpec());
  const rawChart = rawStats.chart;
  const statsChart: StatsChartType | "any" = rawChart === "any" || rawChart === undefined
    ? "any"
    : isStatsChartType(rawChart) ? rawChart : "any";

  if (NATIVE_TYPES.has(question.type)) {
    return {
      tools: [],
      graph: { enabled: false, title: "Graph", instructions: "", allowFunctions: true, starter: graphStarter },
      geometry: { enabled: false, title: "Geometry", instructions: "", starter: geometryStarter },
      statistics: { enabled: false, title: "Statistics", instructions: "", chart: "any", starter: statsStarter },
      dataTable: { enabled: false, title: "Data table", instructions: "", starter: tableStarter },
      guidance,
      requirement: "any",
      source: "native",
    };
  }

  const configured = uniqueTools(cfg.response_tools);
  const tools = configured.length ? configured : inferResponseTools(question);

  return {
    tools,
    graph: {
      enabled: tools.includes("graph"),
      title: typeof rawGraph.title === "string" && rawGraph.title.trim() ? rawGraph.title.slice(0, 80) : "Your graph",
      instructions: typeof rawGraph.instructions === "string" ? rawGraph.instructions.slice(0, 400) : "",
      allowFunctions: rawGraph.allow_functions !== false,
      starter: graphStarter,
    },
    geometry: {
      enabled: tools.includes("geometry"),
      title: typeof rawGeometry.title === "string" && rawGeometry.title.trim() ? rawGeometry.title.slice(0, 80) : "Your construction",
      instructions: typeof rawGeometry.instructions === "string" ? rawGeometry.instructions.slice(0, 400) : "",
      starter: geometryStarter,
    },
    statistics: {
      enabled: tools.includes("statistics"),
      title: typeof rawStats.title === "string" && rawStats.title.trim() ? rawStats.title.slice(0, 80) : "Your statistics chart",
      instructions: typeof rawStats.instructions === "string" ? rawStats.instructions.slice(0, 400) : "",
      chart: statsChart,
      starter: statsStarter,
    },
    dataTable: {
      enabled: tools.includes("data_table"),
      title: typeof rawTable.title === "string" && rawTable.title.trim() ? rawTable.title.slice(0, 80) : "Your data table",
      instructions: typeof rawTable.instructions === "string" ? rawTable.instructions.slice(0, 400) : "",
      starter: tableStarter,
    },
    guidance,
    requirement,
    source: configured.length ? "configured" : "inferred",
  };
}

/** A workspace with no prose editor at all (pure graph/geometry question). */
export function workspaceNeedsProse(workspace: ResponseWorkspace): boolean {
  return workspace.tools.includes("rich_text");
}

/** Persisted answer shape for a constructed response. Versioned for migration. */
export interface StructuredAnswer {
  version: 1;
  text: string;
  doc: RichDoc | null;
  graph: GraphSpec | null;
  geometry: GeometrySpec | null;
  statistics: StatsSpec | null;
  data_table: DataTableSpec | null;
  saved_at?: string;
}

export const ANSWER_LIMITS = {
  text: 20_000,
  serialized: 600_000,
  graphFunctions: 12,
  graphPoints: 150,
  geometryPoints: 160,
  statsValues: 400,
  statsCategories: 40,
  tableRows: 40,
  tableColumns: 10,
  tableCell: 200,
} as const;

export interface AnswerValidation {
  ok: boolean;
  answer: Record<string, unknown>;
  error?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

function statsPayloadTooLarge(raw: Record<string, unknown>): boolean {
  if (Array.isArray(raw.values) && raw.values.length > ANSWER_LIMITS.statsValues) return true;
  if (Array.isArray(raw.categories) && raw.categories.length > ANSWER_LIMITS.statsCategories) return true;
  return false;
}

function tablePayloadTooLarge(raw: Record<string, unknown>): boolean {
  if (Array.isArray(raw.columns) && raw.columns.length > ANSWER_LIMITS.tableColumns) return true;
  if (Array.isArray(raw.rows)) {
    if (raw.rows.length > ANSWER_LIMITS.tableRows) return true;
    return raw.rows.some((row) => Array.isArray(row) &&
      (row.length > ANSWER_LIMITS.tableColumns ||
        row.some((cell) => typeof cell === "string" && cell.length > ANSWER_LIMITS.tableCell)));
  }
  return false;
}

/**
 * Server-side validation and sanitisation of an autosaved answer. Runs before
 * the JSONB write, so a malformed or oversized payload cannot be stored and a
 * candidate cannot smuggle arbitrary structures into the marking interface.
 * Legacy payloads (plain `text`, option ids, numbers, pairs) remain valid.
 */
export function validateAnswerPayload(type: string, raw: unknown): AnswerValidation {
  if (!isRecord(raw)) return { ok: false, answer: {}, error: "The answer must be an object." };
  let serialized: string;
  try {
    serialized = JSON.stringify(raw);
  } catch {
    return { ok: false, answer: {}, error: "The answer cannot be stored." };
  }
  if (serialized.length > ANSWER_LIMITS.serialized) {
    return { ok: false, answer: {}, error: "The answer is too large to store. Reduce the number of elements." };
  }

  if (type !== "open_ended") {
    // Keep the historical permissive behaviour for objective answers, but
    // never accept values of a type the scorer would treat as malformed.
    const answer = { ...raw };
    if ("option_id" in answer && typeof answer.option_id !== "string") return { ok: false, answer: {}, error: "Invalid selection." };
    if ("option_ids" in answer && !(Array.isArray(answer.option_ids) && answer.option_ids.every((v) => typeof v === "string"))) {
      return { ok: false, answer: {}, error: "Invalid selection." };
    }
    if ("text" in answer && typeof answer.text !== "string") return { ok: false, answer: {}, error: "Invalid text answer." };
    if ("value" in answer && !(typeof answer.value === "number" || typeof answer.value === "string")) {
      return { ok: false, answer: {}, error: "Invalid number." };
    }
    if ("order" in answer && !(Array.isArray(answer.order) && answer.order.every((v) => typeof v === "string"))) {
      return { ok: false, answer: {}, error: "Invalid order." };
    }
    if ("pairs" in answer && !(Array.isArray(answer.pairs) && answer.pairs.every((p) => isRecord(p) && typeof p.left === "string" && typeof p.right === "string"))) {
      return { ok: false, answer: {}, error: "Invalid pairs." };
    }
    return { ok: true, answer };
  }

  const clean: Record<string, unknown> = {};
  if (typeof raw.text === "string") {
    if (raw.text.length > ANSWER_LIMITS.text) return { ok: false, answer: {}, error: "The written answer is too long." };
    clean.text = raw.text;
  } else if (raw.text !== undefined) {
    return { ok: false, answer: {}, error: "The written answer has an invalid format." };
  }

  if (raw.doc !== undefined && raw.doc !== null) {
    if (!isRecord(raw.doc) || raw.doc.type !== "doc") return { ok: false, answer: {}, error: "The structured answer has an invalid format." };
    const docJson = JSON.stringify(raw.doc);
    if (docJson.length > ANSWER_LIMITS.serialized) return { ok: false, answer: {}, error: "The structured answer is too large." };
    clean.doc = raw.doc;
  } else if (raw.doc === null) {
    clean.doc = null;
  }

  if (raw.graph !== undefined && raw.graph !== null) {
    const graph = normaliseGraphSpec(raw.graph);
    if (graph.functions.length > ANSWER_LIMITS.graphFunctions || graph.points.length > ANSWER_LIMITS.graphPoints) {
      return { ok: false, answer: {}, error: "The graph has too many elements." };
    }
    clean.graph = graph;
  } else if (raw.graph === null) {
    clean.graph = null;
  }

  if (raw.geometry !== undefined && raw.geometry !== null) {
    const geometry = normaliseGeometrySpec(raw.geometry);
    if (geometry.points.length > ANSWER_LIMITS.geometryPoints) {
      return { ok: false, answer: {}, error: "The construction has too many points." };
    }
    clean.geometry = geometry;
  } else if (raw.geometry === null) {
    clean.geometry = null;
  }

  if (raw.statistics !== undefined && raw.statistics !== null) {
    if (!isRecord(raw.statistics)) return { ok: false, answer: {}, error: "The statistics answer has an invalid format." };
    if (statsPayloadTooLarge(raw.statistics)) {
      return { ok: false, answer: {}, error: "The chart has too many values or categories." };
    }
    clean.statistics = normaliseStatsSpec(raw.statistics);
  } else if (raw.statistics === null) {
    clean.statistics = null;
  }

  if (raw.data_table !== undefined && raw.data_table !== null) {
    if (!isRecord(raw.data_table)) return { ok: false, answer: {}, error: "The data table has an invalid format." };
    if (tablePayloadTooLarge(raw.data_table)) {
      return { ok: false, answer: {}, error: "The data table is too large." };
    }
    clean.data_table = normaliseDataTableSpec(raw.data_table);
  } else if (raw.data_table === null) {
    clean.data_table = null;
  }

  clean.version = 1;
  return { ok: true, answer: clean };
}

/**
 * A ProseMirror document with one empty paragraph is what an untouched rich
 * text editor serialises. Anything else (text, mathematics, tables, images,
 * diagrams) counts as real work.
 */
function docHasRealContent(doc: Record<string, unknown>): boolean {
  if (doc.type !== "doc" || !Array.isArray(doc.content) || doc.content.length === 0) return false;
  if (doc.content.length === 1) {
    const only = doc.content[0];
    if (isRecord(only) && only.type === "paragraph" && (!Array.isArray(only.content) || only.content.length === 0)) return false;
  }
  return true;
}

/** Does a saved answer carry something beyond an empty editor? */
export function answerHasWork(answer: Record<string, unknown> | null | undefined): boolean {
  if (!answer) return false;
  if (typeof answer.text === "string" && answer.text.trim()) return true;
  if (isRecord(answer.doc) && docHasRealContent(answer.doc)) return true;
  const graph = answer.graph;
  if (graph && isRecord(graph)) {
    if (Array.isArray(graph.points) && graph.points.length) return true;
    if (Array.isArray(graph.functions) && graph.functions.some((f) => isRecord(f) && typeof f.expression === "string" && f.expression.trim())) return true;
    if (Array.isArray(graph.segments) && graph.segments.length) return true;
    if (Array.isArray(graph.annotations) && graph.annotations.some((a) => isRecord(a) && typeof a.text === "string" && a.text.trim())) return true;
  }
  const geometry = answer.geometry;
  if (geometry && isRecord(geometry)) {
    for (const key of ["points", "lines", "circles", "polygons", "angles"]) {
      if (Array.isArray(geometry[key]) && (geometry[key] as unknown[]).length) return true;
    }
  }
  if (answer.statistics && isRecord(answer.statistics)) {
    if (statsSpecHasWork(normaliseStatsSpec(answer.statistics))) return true;
  }
  if (answer.data_table && isRecord(answer.data_table)) {
    if (dataTableHasWork(normaliseDataTableSpec(answer.data_table))) return true;
  }
  return false;
}

/** A short status line for the teacher marking view. */
export function describeAnswerComponents(answer: Record<string, unknown> | null | undefined): string[] {
  if (!answer) return ["No saved response"];
  const parts: string[] = [];
  if (typeof answer.text === "string" && answer.text.trim()) parts.push("written answer");
  if (isRecord(answer.doc) && answerHasWork({ doc: answer.doc })) parts.push("formatted response");
  if (isRecord(answer.graph) && answerHasWork({ graph: answer.graph })) parts.push("graph construction");
  if (isRecord(answer.geometry) && answerHasWork({ geometry: answer.geometry })) parts.push("geometry construction");
  if (isRecord(answer.statistics) && statsSpecHasWork(normaliseStatsSpec(answer.statistics))) parts.push("statistics chart");
  if (isRecord(answer.data_table) && dataTableHasWork(normaliseDataTableSpec(answer.data_table))) parts.push("data table");
  return parts.length ? parts : ["Empty response"];
}
