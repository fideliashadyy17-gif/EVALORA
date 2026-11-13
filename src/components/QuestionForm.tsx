"use client";

import { RichContentEditor, type UploadResult } from "@/components/editor/RichContentEditor";
import { RichContent } from "@/components/RichContent";
import { Button, Card, Field, Input, Select, Textarea } from "@/components/ui";
import { QUESTION_TYPES } from "@/lib/brand";
import { RESPONSE_TOOLS } from "@/lib/responseTools";
import { emptyGraphSpec } from "@/lib/graphSpec";
import { emptyGeometrySpec } from "@/lib/geometrySpec";
import { STATS_CHART_LABELS, STATS_CHART_TYPES, emptyStatsSpec, type StatsChartType } from "@/lib/statsSpec";
import { emptyDataTableSpec, normaliseDataTableSpec } from "@/lib/dataTableSpec";
import { emptyVennSpec, normaliseVennSpec } from "@/lib/vennSpec";
import { emptyProbabilityTreeSpec, normaliseProbabilityTreeSpec } from "@/lib/probabilityTreeSpec";
import { emptyStemLeafSpec, normaliseStemLeafSpec } from "@/lib/stemLeafSpec";
import { docIsEmpty, docToLabel, docToPlainText, emptyDoc, textToDoc, type RichDoc } from "@/lib/content";
import { useRouter } from "next/navigation";
import { useState } from "react";

export interface QuestionFormOption {
  label: string;
  is_correct: boolean;
  content_doc?: RichDoc | null;
}

export interface QuestionFormValues {
  id?: string;
  organization_id?: string;
  type: string;
  prompt: string;
  prompt_doc?: RichDoc | null;
  explanation?: string;
  explanation_doc?: RichDoc | null;
  points: number;
  difficulty: string;
  topic?: string;
  status: string;
  category_id?: string | null;
  class_id?: string | null;
  subject_id?: string | null;
  curriculum?: string | null;
  curriculum_course?: string | null;
  subtopic?: string | null;
  source_reference?: string | null;
  source_url?: string | null;
  config?: Record<string, unknown>;
  options: QuestionFormOption[];
}

export type QuestionSaveFn = (
  input: QuestionFormValues,
) => Promise<{ ok?: boolean; id?: string; error?: string }>;

interface OptState {
  doc: RichDoc;
  label: string;
  is_correct: boolean;
}

type AssessPartKind = "numeric" | "text" | "expression";

/** Draft-friendly form state for a typed, auto-marked multi-part question. */
interface AssessPartState {
  id: string;
  label: string;
  prompt: string;
  kind: AssessPartKind;
  points: string;
  unit: string;
  placeholder: string;
  numericAnswer: string;
  tolerance: string;
  accepted: string;
  hintOne: string;
  hintTwo: string;
  strand: string;
  keywordGroups: string;
  minKeywordGroups: string;
}

const CHOICE_TYPES = ["single_choice", "multiple_select", "true_false", "poll"];
const LABEL_TYPES = ["short_answer", "ordering"];
const PART_ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz";

function partIdFor(index: number) {
  return PART_ID_ALPHABET[index] ?? `part-${index + 1}`;
}

function initialAssessPart(raw: unknown, index: number): AssessPartState {
  const part = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const kind: AssessPartKind = part.kind === "numeric" || part.kind === "expression" ? part.kind : "text";
  const hints = Array.isArray(part.hints) ? part.hints : [];
  const accepted = Array.isArray(part.accepted)
    ? part.accepted.filter((item): item is string => typeof item === "string").join("\n")
    : "";
  const keywordGroups = Array.isArray(part.keywords)
    ? part.keywords
      .filter((group): group is unknown[] => Array.isArray(group))
      .map((group) => group.filter((word): word is string => typeof word === "string").join(" | "))
      .join("\n")
    : "";
  const id = typeof part.id === "string" && part.id.trim() ? part.id.trim() : partIdFor(index);
  return {
    id,
    label: typeof part.label === "string" && part.label.trim() ? part.label : `(${id})`,
    prompt: typeof part.prompt === "string" ? part.prompt : "",
    kind,
    points: part.points == null ? "1" : String(part.points),
    unit: typeof part.unit === "string" ? part.unit : "",
    placeholder: typeof part.placeholder === "string" ? part.placeholder : "",
    numericAnswer: part.answer == null ? "" : String(part.answer),
    tolerance: part.tolerance == null ? "0" : String(part.tolerance),
    accepted,
    hintOne: typeof hints[0] === "string" ? hints[0] : "",
    hintTwo: typeof hints[1] === "string" ? hints[1] : "",
    strand: typeof part.strand === "string" ? part.strand : "",
    keywordGroups,
    minKeywordGroups: part.minKeywordGroups == null ? "" : String(part.minKeywordGroups),
  };
}

/**
 * One unified question authoring form used by the Question Bank (workspace),
 * the Super Admin console, and — through quizzes — live competitions and
 * examinations. Prompt, every choice option and the explanation use the full
 * three-mode mathematical editor; short-answer/ordering keep exact-text
 * fields because their scoring compares canonical strings.
 */
export function QuestionForm({
  initial,
  categories,
  save,
  uploadImage,
  successHref,
  organizationId,
  classOptions,
  subjectOptions,
  curriculumOptions,
}: {
  initial?: Partial<QuestionFormValues> & { id?: string };
  categories: { id: string; name: string }[];
  save: QuestionSaveFn;
  uploadImage?: (formData: FormData) => Promise<UploadResult>;
  successHref: string;
  organizationId?: string;
  classOptions?: { id: string; name: string }[];
  subjectOptions?: { id: string; name: string }[];
  curriculumOptions?: { key: string; name: string }[];
}) {
  const router = useRouter();
  const [type, setType] = useState<string>(initial?.type ?? "single_choice");
  const [promptDoc, setPromptDoc] = useState<RichDoc>(
    () => initial?.prompt_doc ?? textToDoc(initial?.prompt ?? ""),
  );
  const [explanationDoc, setExplanationDoc] = useState<RichDoc>(
    () => initial?.explanation_doc ?? textToDoc(initial?.explanation ?? ""),
  );
  const [points, setPoints] = useState<number>(initial?.points ?? 1);
  const [difficulty, setDifficulty] = useState<string>(initial?.difficulty ?? "medium");
  const [topic, setTopic] = useState(initial?.topic ?? "");
  const [status, setStatus] = useState<string>(initial?.status ?? "draft");
  const [categoryId, setCategoryId] = useState(initial?.category_id ?? "");
  const [classId, setClassId] = useState(initial?.class_id ?? "");
  const [subjectId, setSubjectId] = useState(initial?.subject_id ?? "");
  const [curriculum, setCurriculum] = useState(initial?.curriculum ?? "");
  const [curriculumCourse, setCurriculumCourse] = useState(initial?.curriculum_course ?? "");
  const [subtopic, setSubtopic] = useState(initial?.subtopic ?? "");
  const [sourceReference, setSourceReference] = useState(initial?.source_reference ?? "");
  const [sourceUrl, setSourceUrl] = useState(initial?.source_url ?? "");
  const cfg = (initial?.config ?? {}) as Record<string, unknown>;
  const [numericAnswer, setNumericAnswer] = useState(String(cfg.numeric_answer ?? ""));
  const [tolerance, setTolerance] = useState(String(cfg.tolerance ?? "0"));
  const [mediaUrl, setMediaUrl] = useState(String(cfg.media_url ?? ""));
  const [mediaType, setMediaType] = useState(String(cfg.media_type ?? "image"));
  const [markingCriteria, setMarkingCriteria] = useState(String(cfg.marking_criteria ?? ""));
  const [assessParts, setAssessParts] = useState<AssessPartState[]>(() => (
    Array.isArray(cfg.parts) ? cfg.parts.slice(0, 12).map(initialAssessPart) : []
  ));
  const rawTools = cfg.response_tools;
  const [toolMode, setToolMode] = useState<"auto" | "custom">(Array.isArray(rawTools) && rawTools.length ? "custom" : "auto");
  const [responseTools, setResponseTools] = useState<string[]>(
    Array.isArray(rawTools) && rawTools.length ? rawTools.filter((v): v is string => typeof v === "string") : ["rich_text", "math", "table"],
  );
  const rawGraph = (cfg.response_graph ?? {}) as Record<string, unknown>;
  const graphDomain = (rawGraph.starter as { domain?: Record<string, unknown> } | undefined)?.domain ?? {};
  const [graphTitle, setGraphTitle] = useState(String(rawGraph.title ?? "Your graph"));
  const [graphInstructions, setGraphInstructions] = useState(String(rawGraph.instructions ?? ""));
  const [graphAllowFunctions, setGraphAllowFunctions] = useState(rawGraph.allow_functions !== false);
  const [graphXMin, setGraphXMin] = useState(String(graphDomain.xMin ?? -10));
  const [graphXMax, setGraphXMax] = useState(String(graphDomain.xMax ?? 10));
  const [graphYMin, setGraphYMin] = useState(String(graphDomain.yMin ?? -8));
  const [graphYMax, setGraphYMax] = useState(String(graphDomain.yMax ?? 8));
  const rawGeometry = (cfg.response_geometry ?? {}) as Record<string, unknown>;
  const geometryDomain = (rawGeometry.starter as { domain?: Record<string, unknown> } | undefined)?.domain ?? {};
  const [geometryTitle, setGeometryTitle] = useState(String(rawGeometry.title ?? "Your construction"));
  const [geometryInstructions, setGeometryInstructions] = useState(String(rawGeometry.instructions ?? ""));
  const [geometryXMin, setGeometryXMin] = useState(String(geometryDomain.xMin ?? -6));
  const [geometryXMax, setGeometryXMax] = useState(String(geometryDomain.xMax ?? 6));
  const [geometryYMin, setGeometryYMin] = useState(String(geometryDomain.yMin ?? -4));
  const [geometryYMax, setGeometryYMax] = useState(String(geometryDomain.yMax ?? 4));
  const rawVenn = (cfg.response_venn ?? {}) as Record<string, unknown>;
  const vennStarter = (rawVenn.starter ?? {}) as Record<string, unknown>;
  const [vennTitle, setVennTitle] = useState(String(rawVenn.title ?? "Your Venn diagram"));
  const [vennInstructions, setVennInstructions] = useState(
    String(rawVenn.instructions ?? "Write each region's count inside the region."),
  );
  const [vennSets, setVennSets] = useState<"2" | "3">(Number(vennStarter.sets) === 3 ? "3" : "2");
  const [vennLabels, setVennLabels] = useState(
    Array.isArray(vennStarter.labels) ? (vennStarter.labels as unknown[]).map(String).slice(0, 3) : ["A", "B", "C"],
  );
  const [vennUniversalLabel, setVennUniversalLabel] = useState(String(vennStarter.universalLabel ?? "ξ"));
  const [vennFixSets, setVennFixSets] = useState(rawVenn.allow_set_change === false);
  const [vennItems, setVennItems] = useState(() => Array.isArray(vennStarter.items)
    ? (vennStarter.items as unknown[]).flatMap((item) => item && typeof item === "object" && typeof (item as { label?: unknown }).label === "string"
      ? [(item as { label: string }).label] : []).join("\n")
    : "");
  const rawProbabilityTree = (cfg.response_probability_tree ?? {}) as Record<string, unknown>;
  const rawProbabilityTreeStarter = (rawProbabilityTree.starter ?? {}) as Record<string, unknown>;
  const [probabilityTreeTitle, setProbabilityTreeTitle] = useState(String(rawProbabilityTree.title ?? "Your probability tree"));
  const [probabilityTreeInstructions, setProbabilityTreeInstructions] = useState(String(rawProbabilityTree.instructions ?? ""));
  const [probabilityTreeRootLabel, setProbabilityTreeRootLabel] = useState(String(rawProbabilityTreeStarter.rootLabel ?? "Start"));
  const [probabilityTreeAllowStructure, setProbabilityTreeAllowStructure] = useState(rawProbabilityTree.allow_structure !== false);
  const rawStemLeaf = (cfg.response_stem_leaf ?? {}) as Record<string, unknown>;
  const rawStemLeafStarter = (rawStemLeaf.starter ?? {}) as Record<string, unknown>;
  const [stemLeafTitle, setStemLeafTitle] = useState(String(rawStemLeaf.title ?? "Your stem-and-leaf diagram"));
  const [stemLeafInstructions, setStemLeafInstructions] = useState(String(rawStemLeaf.instructions ?? ""));
  const [stemLeafLayout, setStemLeafLayout] = useState<"standard" | "back_to_back">(rawStemLeafStarter.layout === "back_to_back" ? "back_to_back" : "standard");
  const [stemLeafStemLabel, setStemLeafStemLabel] = useState(String(rawStemLeafStarter.stemLabel ?? "Stem"));
  const [stemLeafLeafLabel, setStemLeafLeafLabel] = useState(String(rawStemLeafStarter.leafLabel ?? "Leaf"));
  const [stemLeafLeftLeafLabel, setStemLeafLeftLeafLabel] = useState(String(rawStemLeafStarter.leftLeafLabel ?? "Left leaves"));
  const [stemLeafRightLeafLabel, setStemLeafRightLeafLabel] = useState(String(rawStemLeafStarter.rightLeafLabel ?? "Right leaves"));
  const [stemLeafKey, setStemLeafKey] = useState(String(rawStemLeafStarter.key ?? "Key: 4 | 7 means 47"));
  const [nextTimeHint, setNextTimeHint] = useState(String(cfg.next_time_hint ?? ""));
  const rawStats = (cfg.response_stats ?? {}) as Record<string, unknown>;
  const rawStatsStarter = (rawStats.starter ?? {}) as { values?: unknown; chart?: unknown };
  const [statsTitle, setStatsTitle] = useState(String(rawStats.title ?? "Your statistics chart"));
  const [statsInstructions, setStatsInstructions] = useState(String(rawStats.instructions ?? ""));
  const [statsChart, setStatsChart] = useState(String(rawStats.chart ?? "any"));
  const [statsValues, setStatsValues] = useState(
    Array.isArray(rawStatsStarter.values) ? rawStatsStarter.values.join(", ") : "",
  );
  const rawTable = (cfg.response_data_table ?? {}) as Record<string, unknown>;
  const rawTableStarter = (rawTable.starter ?? {}) as {
    columns?: unknown;
    rows?: unknown;
    rowHeaders?: unknown;
  };
  const [tableTitle, setTableTitle] = useState(String(rawTable.title ?? "Your data table"));
  const [tableInstructions, setTableInstructions] = useState(String(rawTable.instructions ?? ""));
  const [tableColumns, setTableColumns] = useState(
    Array.isArray(rawTableStarter.columns) ? rawTableStarter.columns.join(", ") : "Item, Value",
  );
  const [tableRows, setTableRows] = useState(
    Array.isArray(rawTableStarter.rows)
      ? (rawTableStarter.rows as unknown[][]).map((row) => row.map((cell) => String(cell ?? "")).join(" | ")).join("\n")
      : "\n\n\n",
  );
  const [tableRowHeaders, setTableRowHeaders] = useState(Boolean(rawTableStarter.rowHeaders));
  const [responseRequirement, setResponseRequirement] = useState(String(cfg.response_requirement ?? "any"));
  const [responseGuidance, setResponseGuidance] = useState(String(cfg.response_guidance ?? ""));
  const [pairs, setPairs] = useState<{ left: string; right: string }[]>(
    (cfg.pairs as { left: string; right: string }[]) ?? [{ left: "", right: "" }, { left: "", right: "" }],
  );
  const [options, setOptions] = useState<OptState[]>(() =>
    initial?.options?.length
      ? initial.options.map((o) => ({
          doc: o.content_doc ?? textToDoc(o.label),
          label: o.label,
          is_correct: o.is_correct,
        }))
      : [
          { doc: emptyDoc(), label: "", is_correct: true },
          { doc: emptyDoc(), label: "", is_correct: false },
          { doc: emptyDoc(), label: "", is_correct: false },
          { doc: emptyDoc(), label: "", is_correct: false },
        ],
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const upload = uploadImage
    ? async (file: File): Promise<UploadResult> => {
        const fd = new FormData();
        fd.set("file", file);
        if (organizationId) fd.set("organization_id", organizationId);
        return uploadImage(fd);
      }
    : undefined;

  function setOpt(i: number, patch: Partial<OptState>) {
    setOptions((prev) => prev.map((o, idx) => (idx === i ? { ...o, ...patch } : o)));
  }

  function setAssessPart(index: number, patch: Partial<AssessPartState>) {
    setAssessParts((previous) => previous.map((part, current) => current === index ? { ...part, ...patch } : part));
  }

  function addAssessPart() {
    setAssessParts((previous) => [...previous, initialAssessPart({}, previous.length)]);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    const prompt = docToPlainText(promptDoc);
    if (!prompt && docIsEmpty(promptDoc)) {
      setError("Write the question first.");
      setBusy(false);
      return;
    }
    const config: Record<string, unknown> = {};
    if (mediaUrl.trim()) {
      config.media_url = mediaUrl.trim();
      config.media_type = mediaType;
    }
    if (type === "numeric") {
      config.numeric_answer = parseFloat(numericAnswer);
      config.tolerance = parseFloat(tolerance) || 0;
      if (Number.isNaN(config.numeric_answer as number)) {
        setError("Enter the correct numeric answer.");
        setBusy(false);
        return;
      }
    }
    if (type === "matching") {
      config.pairs = pairs.filter((p) => p.left.trim() && p.right.trim());
      if ((config.pairs as unknown[]).length < 2) {
        setError("Matching questions need at least two complete pairs.");
        setBusy(false);
        return;
      }
    }
    if (type === "assess_parts") {
      const usedIds = new Set<string>();
      config.parts = assessParts.slice(0, 12).map((part, index) => {
        const requestedId = part.id.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
        let id = requestedId || partIdFor(index);
        while (usedIds.has(id)) id = `${id}-${index + 1}`;
        usedIds.add(id);
        const parsedPoints = Number(part.points);
        const parsedAnswer = Number(part.numericAnswer);
        const parsedTolerance = Number(part.tolerance);
        const accepted = part.accepted.split("\n").map((value) => value.trim()).filter(Boolean).slice(0, 24);
        const keywordGroups = part.keywordGroups.split("\n")
          .map((group) => group.split("|").map((word) => word.trim()).filter(Boolean).slice(0, 8))
          .filter((group) => group.length)
          .slice(0, 6);
        const minKeywordGroups = Number(part.minKeywordGroups);
        return {
          id,
          label: part.label.trim() || `(${id})`,
          prompt: part.prompt.trim(),
          kind: part.kind,
          points: Number.isFinite(parsedPoints) ? parsedPoints : 0,
          ...(part.unit.trim() ? { unit: part.unit.trim().slice(0, 24) } : {}),
          ...(part.placeholder.trim() ? { placeholder: part.placeholder.trim().slice(0, 60) } : {}),
          hints: [part.hintOne.trim(), part.hintTwo.trim()],
          ...(part.strand.trim() ? { strand: part.strand.trim().slice(0, 16) } : {}),
          ...(part.kind === "numeric"
            ? {
                ...(Number.isFinite(parsedAnswer) ? { answer: parsedAnswer } : {}),
                ...(Number.isFinite(parsedTolerance) && parsedTolerance >= 0 ? { tolerance: parsedTolerance } : {}),
              }
            : { accepted }),
          ...(keywordGroups.length ? {
            keywords: keywordGroups,
            minKeywordGroups: Number.isFinite(minKeywordGroups) && minKeywordGroups >= 1
              ? Math.min(keywordGroups.length, Math.floor(minKeywordGroups))
              : keywordGroups.length,
          } : {}),
        };
      });
    }
    if (type === "open_ended" || type === "assess_parts") {
      if (type === "open_ended" && markingCriteria.trim()) config.marking_criteria = markingCriteria.trim();
      // Automatic mode leaves the configuration absent, so the platform derives
      // tools from the question wording (graph language, geometry language…).
      if (toolMode === "custom") config.response_tools = responseTools;
      if (responseRequirement !== "any") config.response_requirement = responseRequirement;
      if (responseGuidance.trim()) config.response_guidance = responseGuidance.trim();
      if (toolMode === "custom" && responseTools.includes("graph")) {
        config.response_graph = {
          title: graphTitle.trim() || "Your graph",
          instructions: graphInstructions.trim(),
          allow_functions: graphAllowFunctions,
          starter: emptyGraphSpec({
            domain: {
              ...emptyGraphSpec().domain,
              xMin: Number(graphXMin) || -10,
              xMax: Number(graphXMax) || 10,
              yMin: Number(graphYMin) || -8,
              yMax: Number(graphYMax) || 8,
            },
          }),
        };
      }
      if (toolMode === "custom" && responseTools.includes("geometry")) {
        config.response_geometry = {
          title: geometryTitle.trim() || "Your construction",
          instructions: geometryInstructions.trim(),
          starter: emptyGeometrySpec({
            domain: {
              ...emptyGeometrySpec().domain,
              xMin: Number(geometryXMin) || -6,
              xMax: Number(geometryXMax) || 6,
              yMin: Number(geometryYMin) || -4,
              yMax: Number(geometryYMax) || 4,
            },
          }),
        };
      }
      if (toolMode === "custom" && responseTools.includes("statistics")) {
        const values = statsValues
          .split(/[\s,;]+/)
          .map((token) => Number(token))
          .filter((value) => Number.isFinite(value))
          .slice(0, 400);
        const chart = STATS_CHART_TYPES.includes(statsChart as StatsChartType)
          ? (statsChart as StatsChartType)
          : "dot_plot";
        config.response_stats = {
          title: statsTitle.trim() || "Your statistics chart",
          instructions: statsInstructions.trim(),
          chart: statsChart === "any" ? "any" : chart,
          starter: emptyStatsSpec({ chart, values }),
        };
      }
      if (toolMode === "custom" && responseTools.includes("data_table")) {
        const columns = tableColumns.split(",").map((column) => column.trim()).filter(Boolean);
        const rows = tableRows
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => line.split("|").map((cell) => cell.trim()));
        config.response_data_table = {
          title: tableTitle.trim() || "Your data table",
          instructions: tableInstructions.trim(),
          starter: normaliseDataTableSpec(
            { columns, rows, rowHeaders: tableRowHeaders },
            emptyDataTableSpec(),
          ),
        };
      }
      if (toolMode === "custom" && responseTools.includes("probability_tree")) {
        config.response_probability_tree = {
          title: probabilityTreeTitle.trim() || "Your probability tree",
          instructions: probabilityTreeInstructions.trim(),
          allow_structure: probabilityTreeAllowStructure,
          starter: normaliseProbabilityTreeSpec({ rootLabel: probabilityTreeRootLabel.trim() || "Start" }, emptyProbabilityTreeSpec()),
        };
      }
      if (toolMode === "custom" && responseTools.includes("stem_leaf")) {
        config.response_stem_leaf = {
          title: stemLeafTitle.trim() || "Your stem-and-leaf diagram",
          instructions: stemLeafInstructions.trim(),
          starter: normaliseStemLeafSpec({
            layout: stemLeafLayout,
            stemLabel: stemLeafStemLabel.trim() || "Stem",
            leafLabel: stemLeafLeafLabel.trim() || "Leaf",
            leftLeafLabel: stemLeafLeftLeafLabel.trim() || "Left leaves",
            rightLeafLabel: stemLeafRightLeafLabel.trim() || "Right leaves",
            key: stemLeafKey.trim() || "Key: 4 | 7 means 47",
          }, emptyStemLeafSpec({ layout: stemLeafLayout })),
        };
      }
      if (toolMode === "custom" && responseTools.includes("venn")) {
        const sets = vennSets === "3" ? 3 : 2;
        const labels = vennLabels.slice(0, sets).map((label, i) => label.trim() || ["A", "B", "C"][i]);
        const items = vennItems.split(/\n+/).map((label) => label.trim()).filter(Boolean).slice(0, 60)
          .map((label, index) => ({ id: `given-${index + 1}`, label, region: "bank" }));
        config.response_venn = {
          title: vennTitle.trim() || "Your Venn diagram",
          instructions: vennInstructions.trim(),
          allow_set_change: !vennFixSets,
          starter: normaliseVennSpec(
            { sets, labels, universalLabel: vennUniversalLabel.trim() || "ξ", items },
            emptyVennSpec({ sets, labels }),
          ),
        };
      }
    }

    // The transferable takeaway shown to the candidate once results are
    // published: what to do differently next time. Never shown mid-paper, and
    // available on every type that can be marked, not just open answers.
    if (nextTimeHint.trim()) config.next_time_hint = nextTimeHint.trim();
    if (markingCriteria.trim() && config.marking_criteria === undefined) {
      config.marking_criteria = markingCriteria.trim();
    }

    let finalOptions: QuestionFormOption[] = [];
    if (CHOICE_TYPES.includes(type)) {
      finalOptions = options
        .filter((o) => !docIsEmpty(o.doc))
        .map((o) => ({ label: docToLabel(o.doc), content_doc: o.doc, is_correct: o.is_correct }));
      if (type === "true_false" && finalOptions.length === 0) {
        finalOptions = [
          { label: "True", content_doc: textToDoc("True"), is_correct: true },
          { label: "False", content_doc: textToDoc("False"), is_correct: false },
        ];
      }
      if (type !== "poll" && finalOptions.length > 0 && !finalOptions.some((o) => o.is_correct)) {
        setError("Mark at least one option as correct.");
        setBusy(false);
        return;
      }
      if (type === "poll") finalOptions = finalOptions.map((o) => ({ ...o, is_correct: false }));
    } else if (LABEL_TYPES.includes(type)) {
      finalOptions = options
        .map((o) => ({ label: o.label.trim(), is_correct: type === "short_answer" ? true : false }))
        .filter((o) => o.label.length > 0);
    }

    const res = await save({
      id: initial?.id,
      organization_id: organizationId,
      type,
      prompt: prompt || docToLabel(promptDoc),
      prompt_doc: promptDoc,
      explanation: docToPlainText(explanationDoc),
      explanation_doc: docIsEmpty(explanationDoc) ? null : explanationDoc,
      points,
      difficulty,
      topic,
      status,
      category_id: categoryId || null,
      class_id: classId || null,
      subject_id: subjectId || null,
      curriculum: curriculum || null,
      curriculum_course: curriculumCourse || null,
      subtopic: subtopic || null,
      source_reference: sourceReference || null,
      source_url: sourceUrl || null,
      config,
      options: finalOptions,
    });
    setBusy(false);
    if (res.error) return setError(res.error);
    router.push(successHref);
    router.refresh();
  }

  const isChoice = CHOICE_TYPES.includes(type);
  const supportsResponseWorkspace = type === "open_ended" || type === "assess_parts";
  const letters = ["A", "B", "C", "D", "E", "F", "G", "H"];

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
      <Card className="space-y-5 p-6">
        {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Question type">
            <Select value={type} onChange={(e) => setType(e.target.value)}>
              {QUESTION_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="draft">Draft</option>
              <option value="pending_review">Pending review</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </Select>
          </Field>
        </div>

        <Field label="Question" hint="Text / Word mode for prose, Math mode for visual equations, LaTeX mode for source. Content can mix all three.">
          <RichContentEditor
            value={promptDoc}
            onChange={setPromptDoc}
            uploadImage={upload}
            ariaLabel="Question prompt"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Media URL (optional)" hint="External image/audio/video shown with the question — or insert images directly in the editor above.">
            <Input value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} placeholder="https://…" />
          </Field>
          <Field label="Media type">
            <Select value={mediaType} onChange={(e) => setMediaType(e.target.value)}>
              <option value="image">Image</option>
              <option value="audio">Audio</option>
              <option value="video">Video</option>
            </Select>
          </Field>
        </div>

        {type === "numeric" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Correct answer">
              <Input type="number" step="any" value={numericAnswer} onChange={(e) => setNumericAnswer(e.target.value)} placeholder="42" />
            </Field>
            <Field label="Tolerance (±)">
              <Input type="number" step="any" value={tolerance} onChange={(e) => setTolerance(e.target.value)} />
            </Field>
          </div>
        )}

        {type === "assess_parts" && (
          <div className="space-y-4 rounded-xl border border-evergreen-900/15 bg-cream/50 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-evergreen-950">Typed, auto-marked parts</h3>
                <p className="mt-1 text-xs text-ink-soft">
                  Each part is a real candidate input with its own marks, accepted answer and two progressive hints. Optional construction tools below save separate working for every part without changing typed-part marks.
                </p>
              </div>
              <span className="rounded-full bg-evergreen-100 px-2.5 py-1 text-xs font-semibold text-evergreen-900">
                {assessParts.reduce((total, part) => total + (Number(part.points) || 0), 0)} / {points} marks
              </span>
            </div>
            {assessParts.length === 0 && (
              <p className="rounded-lg border border-dashed border-evergreen-900/20 bg-white p-3 text-sm text-ink-soft">
                Add a part to make this a genuine multi-part question. A published question needs at least one complete part and matching total marks.
              </p>
            )}
            <div className="space-y-4">
              {assessParts.map((part, index) => (
                <div key={`${part.id}-${index}`} className="space-y-3 rounded-xl border border-evergreen-900/15 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-evergreen-950">Part {index + 1}</p>
                    <button type="button" className="text-sm font-medium text-red-700 hover:underline" onClick={() => setAssessParts((previous) => previous.filter((_, current) => current !== index))}>Remove part</button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-4">
                    <Field label="Stable ID" hint="Used to restore saved work.">
                      <Input value={part.id} onChange={(e) => setAssessPart(index, { id: e.target.value })} placeholder={partIdFor(index)} />
                    </Field>
                    <Field label="Candidate label">
                      <Input value={part.label} onChange={(e) => setAssessPart(index, { label: e.target.value })} placeholder={`(${partIdFor(index)})`} />
                    </Field>
                    <Field label="Answer type">
                      <Select value={part.kind} onChange={(e) => setAssessPart(index, { kind: e.target.value === "numeric" || e.target.value === "expression" ? e.target.value : "text" })}>
                        <option value="numeric">Number</option>
                        <option value="expression">Expression / formula</option>
                        <option value="text">Text / explanation</option>
                      </Select>
                    </Field>
                    <Field label="Marks">
                      <Input type="number" min="0" step="any" value={part.points} onChange={(e) => setAssessPart(index, { points: e.target.value })} />
                    </Field>
                  </div>
                  <Field label="Prompt for this part">
                    <Textarea rows={2} value={part.prompt} onChange={(e) => setAssessPart(index, { prompt: e.target.value })} placeholder="Calculate the estimated mean, showing your method." />
                  </Field>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Field label="Unit (optional)"><Input value={part.unit} onChange={(e) => setAssessPart(index, { unit: e.target.value })} placeholder="km/h" /></Field>
                    <Field label="Input placeholder (optional)"><Input value={part.placeholder} onChange={(e) => setAssessPart(index, { placeholder: e.target.value })} placeholder="Type a value…" /></Field>
                    <Field label="MYP strand (optional)"><Input value={part.strand} onChange={(e) => setAssessPart(index, { strand: e.target.value })} placeholder="C(ii)" /></Field>
                  </div>
                  {part.kind === "numeric" ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Correct numeric answer"><Input type="number" step="any" value={part.numericAnswer} onChange={(e) => setAssessPart(index, { numericAnswer: e.target.value })} placeholder="42" /></Field>
                      <Field label="Tolerance (±)"><Input type="number" min="0" step="any" value={part.tolerance} onChange={(e) => setAssessPart(index, { tolerance: e.target.value })} /></Field>
                    </div>
                  ) : (
                    <Field label="Accepted answer variants" hint="One exact accepted answer per line. Expressions are canonicalised before matching.">
                      <Textarea rows={3} value={part.accepted} onChange={(e) => setAssessPart(index, { accepted: e.target.value })} placeholder={part.kind === "expression" ? "a_n = 3n + 2\n3n + 2" : "A clear mathematical explanation"} />
                    </Field>
                  )}
                  {part.kind === "text" && (
                    <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
                      <Field label="Keyword groups for partial text credit (optional)" hint="One group per line; separate acceptable phrases with | .">
                        <Textarea rows={3} value={part.keywordGroups} onChange={(e) => setAssessPart(index, { keywordGroups: e.target.value })} placeholder={"mean | average\nspread | range"} />
                      </Field>
                      <Field label="Groups needed"><Input type="number" min="1" step="1" value={part.minKeywordGroups} onChange={(e) => setAssessPart(index, { minKeywordGroups: e.target.value })} placeholder="2" /></Field>
                    </div>
                  )}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Hint 1 — nudge" hint="At least 8 characters; never give the answer."><Textarea rows={2} value={part.hintOne} onChange={(e) => setAssessPart(index, { hintOne: e.target.value })} placeholder="Identify the quantities that change together." /></Field>
                    <Field label="Hint 2 — first step" hint="At least 8 characters; never give the answer."><Textarea rows={2} value={part.hintTwo} onChange={(e) => setAssessPart(index, { hintTwo: e.target.value })} placeholder="Start by writing the ratio in its simplest form." /></Field>
                  </div>
                </div>
              ))}
            </div>
            <Button type="button" variant="outline" disabled={assessParts.length >= 12} onClick={addAssessPart}>+ Add typed part</Button>
          </div>
        )}

        {supportsResponseWorkspace && (
          <div className="space-y-4 rounded-xl border border-evergreen-900/15 bg-cream/50 p-4">
            <div>
              <h3 className="text-sm font-semibold text-evergreen-950">
                {type === "assess_parts" ? "Optional saved working workspace" : "Student composition environment"}
              </h3>
              <p className="mt-1 text-xs text-ink-soft">
                {type === "assess_parts"
                  ? <>Choose the construction tools a candidate may use to show working for each typed part. The working is saved, restored and visible to markers, while typed-part scoring remains deterministic.</>
                  : <>Choose <strong>Automatic</strong> and the platform supplies the right tools from the question itself: prose and mathematics for a constructed response, plus a graph workspace for graph/plot/sketch questions, a geometry workspace for construction questions and the science palette for science questions. Existing questions need no editing.</>}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <label className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm ${toolMode === "auto" ? "border-evergreen-700 bg-evergreen-50" : "border-evergreen-900/20 bg-white"}`}>
                  <input type="radio" name="tool_mode" checked={toolMode === "auto"} onChange={() => setToolMode("auto")} /> {type === "assess_parts" ? "No separate working workspace" : "Automatic (recommended)"}
                </label>
                <label className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm ${toolMode === "custom" ? "border-evergreen-700 bg-evergreen-50" : "border-evergreen-900/20 bg-white"}`}>
                  <input type="radio" name="tool_mode" checked={toolMode === "custom"} onChange={() => setToolMode("custom")} /> Choose tools for this question
                </label>
              </div>
            </div>

            {toolMode === "custom" && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-evergreen-800">Response tools</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {RESPONSE_TOOLS.map((tool) => (
                    <label key={tool.id} className="flex items-start gap-2 rounded-lg border border-evergreen-900/15 bg-white p-2.5 text-sm">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={responseTools.includes(tool.id)}
                        onChange={(e) => setResponseTools((previous) => e.target.checked
                          ? [...new Set([...previous, tool.id])]
                          : previous.filter((id) => id !== tool.id))}
                      />
                      <span>
                        <span className="font-medium text-evergreen-950">{tool.label}</span>
                        <span className="block text-[11px] leading-snug text-ink-soft">{tool.hint}</span>
                      </span>
                    </label>
                  ))}
                </div>
                {responseTools.length === 0 && <p className="mt-2 text-xs text-red-700">Select at least one response tool, or use Automatic.</p>}
              </div>
            )}

            {toolMode === "custom" && responseTools.includes("graph") && (
              <div className="grid gap-3 rounded-lg border border-evergreen-900/15 bg-white p-3 sm:grid-cols-2">
                <Field label="Graph workspace title">
                  <Input value={graphTitle} onChange={(e) => setGraphTitle(e.target.value)} placeholder="Your graph" />
                </Field>
                <Field label="Graph instructions">
                  <Input value={graphInstructions} onChange={(e) => setGraphInstructions(e.target.value)} placeholder="Plot the first six terms…" />
                </Field>
                <div className="grid grid-cols-4 gap-2 sm:col-span-2">
                  {([["xMin", "x min", graphXMin, setGraphXMin], ["xMax", "x max", graphXMax, setGraphXMax], ["yMin", "y min", graphYMin, setGraphYMin], ["yMax", "y max", graphYMax, setGraphYMax]] as const).map(([key, label, value, setter]) => (
                    <Field key={key} label={label}>
                      <Input type="number" step="any" value={value} onChange={(e) => setter(e.target.value)} />
                    </Field>
                  ))}
                </div>
                <label className="flex items-center gap-2 text-sm sm:col-span-2">
                  <input type="checkbox" checked={graphAllowFunctions} onChange={(e) => setGraphAllowFunctions(e.target.checked)} />
                  Allow students to plot functions by equation (as well as drawing points and segments)
                </label>
              </div>
            )}

            {toolMode === "custom" && responseTools.includes("geometry") && (
              <div className="grid gap-3 rounded-lg border border-evergreen-900/15 bg-white p-3 sm:grid-cols-2">
                <Field label="Geometry workspace title">
                  <Input value={geometryTitle} onChange={(e) => setGeometryTitle(e.target.value)} placeholder="Your construction" />
                </Field>
                <Field label="Geometry instructions">
                  <Input value={geometryInstructions} onChange={(e) => setGeometryInstructions(e.target.value)} placeholder="Construct triangle ABC with AB = 4 units…" />
                </Field>
                <div className="grid grid-cols-4 gap-2 sm:col-span-2">
                  {([["xMin", "x min", geometryXMin, setGeometryXMin], ["xMax", "x max", geometryXMax, setGeometryXMax], ["yMin", "y min", geometryYMin, setGeometryYMin], ["yMax", "y max", geometryYMax, setGeometryYMax]] as const).map(([key, label, value, setter]) => (
                    <Field key={key} label={label}>
                      <Input type="number" step="any" value={value} onChange={(e) => setter(e.target.value)} />
                    </Field>
                  ))}
                </div>
              </div>
            )}

            {toolMode === "custom" && responseTools.includes("statistics") && (
              <div className="grid gap-3 rounded-lg border border-evergreen-900/15 bg-white p-3 sm:grid-cols-2">
                <Field label="Statistics workspace title">
                  <Input value={statsTitle} onChange={(e) => setStatsTitle(e.target.value)} placeholder="Your statistics chart" />
                </Field>
                <Field label="Statistics instructions">
                  <Input value={statsInstructions} onChange={(e) => setStatsInstructions(e.target.value)} placeholder="Draw a histogram of the data…" />
                </Field>
                <Field label="Representation">
                  <Select value={statsChart} onChange={(e) => setStatsChart(e.target.value)}>
                    <option value="any">Let the student choose</option>
                    {STATS_CHART_TYPES.map((chart) => (
                      <option key={chart} value={chart}>{STATS_CHART_LABELS[chart]}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Starting data (optional)" hint="Comma-separated values the candidate can edit.">
                  <Input value={statsValues} onChange={(e) => setStatsValues(e.target.value)} placeholder="4, 7, 7, 8, 10, 12" />
                </Field>
              </div>
            )}

            {toolMode === "custom" && responseTools.includes("data_table") && (
              <div className="grid gap-3 rounded-lg border border-evergreen-900/15 bg-white p-3 sm:grid-cols-2">
                <Field label="Data table title">
                  <Input value={tableTitle} onChange={(e) => setTableTitle(e.target.value)} placeholder="Your data table" />
                </Field>
                <Field label="Table instructions">
                  <Input value={tableInstructions} onChange={(e) => setTableInstructions(e.target.value)} placeholder="Complete the frequency table…" />
                </Field>
                <Field label="Column headings" hint="Comma-separated, e.g. Interval, Tally, Frequency.">
                  <Input value={tableColumns} onChange={(e) => setTableColumns(e.target.value)} />
                </Field>
                <Field label="Rows" hint="One row per line; separate cells with | .">
                  <Textarea rows={3} value={tableRows} onChange={(e) => setTableRows(e.target.value)} placeholder="0–9 |   |" />
                </Field>
                <label className="flex items-center gap-2 text-sm sm:col-span-2">
                  <input type="checkbox" checked={tableRowHeaders} onChange={(e) => setTableRowHeaders(e.target.checked)} />
                  Treat the first column as row labels
                </label>
              </div>
            )}

            {toolMode === "custom" && responseTools.includes("probability_tree") && (
              <div className="grid gap-3 rounded-lg border border-evergreen-900/15 bg-white p-3 sm:grid-cols-2">
                <Field label="Probability-tree title"><Input value={probabilityTreeTitle} onChange={(e) => setProbabilityTreeTitle(e.target.value)} placeholder="Your probability tree" /></Field>
                <Field label="Tree instructions"><Input value={probabilityTreeInstructions} onChange={(e) => setProbabilityTreeInstructions(e.target.value)} placeholder="Label each branch and write its probability." /></Field>
                <Field label="Starting-node label"><Input value={probabilityTreeRootLabel} onChange={(e) => setProbabilityTreeRootLabel(e.target.value)} placeholder="Start" /></Field>
                <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={probabilityTreeAllowStructure} onChange={(e) => setProbabilityTreeAllowStructure(e.target.checked)} /> Let students add and remove branches</label>
              </div>
            )}

            {toolMode === "custom" && responseTools.includes("stem_leaf") && (
              <div className="grid gap-3 rounded-lg border border-evergreen-900/15 bg-white p-3 sm:grid-cols-2">
                <Field label="Stem-and-leaf title"><Input value={stemLeafTitle} onChange={(e) => setStemLeafTitle(e.target.value)} placeholder="Your stem-and-leaf diagram" /></Field>
                <Field label="Diagram instructions"><Input value={stemLeafInstructions} onChange={(e) => setStemLeafInstructions(e.target.value)} placeholder="Complete the ordered leaves and show a clear key." /></Field>
                <Field label="Diagram layout"><Select value={stemLeafLayout} onChange={(e) => setStemLeafLayout(e.target.value === "back_to_back" ? "back_to_back" : "standard")}><option value="standard">Standard</option><option value="back_to_back">Back-to-back</option></Select></Field>
                <Field label="Stem heading"><Input value={stemLeafStemLabel} onChange={(e) => setStemLeafStemLabel(e.target.value)} placeholder="Stem" /></Field>
                {stemLeafLayout === "standard" ? <Field label="Leaf heading"><Input value={stemLeafLeafLabel} onChange={(e) => setStemLeafLeafLabel(e.target.value)} placeholder="Leaf" /></Field> : <>
                  <Field label="Left-leaf heading"><Input value={stemLeafLeftLeafLabel} onChange={(e) => setStemLeafLeftLeafLabel(e.target.value)} placeholder="Class A leaves" /></Field>
                  <Field label="Right-leaf heading"><Input value={stemLeafRightLeafLabel} onChange={(e) => setStemLeafRightLeafLabel(e.target.value)} placeholder="Class B leaves" /></Field>
                </>}
                <Field label="Starting key" hint="Students can edit it if needed."><Input value={stemLeafKey} onChange={(e) => setStemLeafKey(e.target.value)} placeholder="Key: 4 | 7 means 47" /></Field>
              </div>
            )}

            {toolMode === "custom" && responseTools.includes("venn") && (
              <div className="grid gap-3 rounded-lg border border-evergreen-900/15 bg-white p-3 sm:grid-cols-2">
                <Field label="Venn diagram title">
                  <Input value={vennTitle} onChange={(e) => setVennTitle(e.target.value)} placeholder="Your Venn diagram" />
                </Field>
                <Field label="Diagram instructions">
                  <Input value={vennInstructions} onChange={(e) => setVennInstructions(e.target.value)} placeholder="Write each region's count inside the region." />
                </Field>
                <Field label="Number of sets">
                  <Select value={vennSets} onChange={(e) => setVennSets(e.target.value === "3" ? "3" : "2")}>
                    <option value="2">Two sets</option>
                    <option value="3">Three sets</option>
                  </Select>
                </Field>
                <Field label="Universal set label">
                  <Input value={vennUniversalLabel} onChange={(e) => setVennUniversalLabel(e.target.value)} placeholder="ξ" />
                </Field>
                <Field label="Given elements to place (optional)" hint="One element per line. Students drag these into Venn regions.">
                  <Textarea rows={3} value={vennItems} onChange={(e) => setVennItems(e.target.value)} placeholder={"e.g. 2\n3\n4"} />
                </Field>
                {Array.from({ length: vennSets === "3" ? 3 : 2 }, (_, i) => (
                  <Field key={i} label={`Set ${i + 1} name`} hint={i === 0 ? "E.g. Football, or A." : undefined}>
                    <Input
                      value={vennLabels[i] ?? ["A", "B", "C"][i]}
                      onChange={(e) => {
                        const next = [...vennLabels];
                        next[i] = e.target.value;
                        setVennLabels(next);
                      }}
                      placeholder={["A", "B", "C"][i]}
                    />
                  </Field>
                ))}
                <label className="flex items-center gap-2 text-sm sm:col-span-2">
                  <input type="checkbox" checked={vennFixSets} onChange={(e) => setVennFixSets(e.target.checked)} />
                  Fix the number of sets (students cannot switch between two and three circles)
                </label>
                <p className="text-xs text-ink-soft sm:col-span-2">
                  Regions are never filled in for the student: the editor opens empty so the diagram is the candidate&apos;s own work.
                </p>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="What must the response contain?" hint="Shown as guidance; it never changes marking.">
                <Select value={responseRequirement} onChange={(e) => setResponseRequirement(e.target.value)}>
                  <option value="any">Any appropriate response</option>
                  <option value="text">A written explanation</option>
                  <option value="graph">A graph</option>
                  <option value="geometry">A geometric construction</option>
                  <option value="statistics">A statistics chart</option>
                  <option value="data_table">A completed data table</option>
                  <option value="venn">A Venn diagram</option>
                  <option value="probability_tree">A probability tree</option>
                  <option value="stem_leaf">A stem-and-leaf diagram</option>
                </Select>
              </Field>
              <Field label="Response guidance for students">
                <Input value={responseGuidance} onChange={(e) => setResponseGuidance(e.target.value)} placeholder="Show your method and explain each step." />
              </Field>
            </div>

            {type === "open_ended" && (
              <Field label="Marking criteria (for markers — never shown to candidates before marking)" hint="Working steps and mark allocation for structured mathematical answers.">
                <Textarea rows={3} value={markingCriteria} onChange={(e) => setMarkingCriteria(e.target.value)} placeholder="1 mark: correct substitution… 2 marks: valid method… 1 mark: final answer with units." />
              </Field>
            )}

            <Field label="Next-time hint (shown after results are published)" hint="The transferable takeaway, not the answer. Never shown during the paper.">
              <Textarea rows={2} value={nextTimeHint} onChange={(e) => setNextTimeHint(e.target.value)} placeholder="When two quantities scale together, find the factor from the value you know…" />
            </Field>
          </div>
        )}

        {type === "matching" && (
          <div>
            <p className="mb-2 text-sm font-medium text-evergreen-900">Correct pairs (shown shuffled to participants)</p>
            <div className="space-y-2">
              {pairs.map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input value={p.left} onChange={(e) => setPairs((prev) => prev.map((x, idx) => (idx === i ? { ...x, left: e.target.value } : x)))} placeholder="Left item (e.g. $\sin 30^\circ$)" />
                  <span className="text-ink-soft">→</span>
                  <Input value={p.right} onChange={(e) => setPairs((prev) => prev.map((x, idx) => (idx === i ? { ...x, right: e.target.value } : x)))} placeholder="Right match" />
                  <button type="button" className="text-sm text-red-700" onClick={() => setPairs((prev) => prev.filter((_, idx) => idx !== i))}>✕</button>
                </div>
              ))}
            </div>
            <Button type="button" variant="ghost" className="mt-2" onClick={() => setPairs((p) => [...p, { left: "", right: "" }])}>+ Add pair</Button>
          </div>
        )}

        {isChoice && (
          <div>
            <p className="mb-1 text-sm font-medium text-evergreen-900">Answer options — tick the correct one{type === "multiple_select" ? "(s)" : ""}</p>
            <p className="mb-3 text-xs text-ink-soft">Each option has its own editor: text, equations and images are independent per option (image-based options included).</p>
            <div className="space-y-4">
              {options.map((o, i) => (
                <div key={i} className="rounded-xl border border-evergreen-900/10 bg-cream/40 p-3">
                  <div className="mb-2 flex items-center gap-3">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-evergreen-700 text-xs font-bold text-white">{letters[i] ?? i + 1}</span>
                    {type !== "poll" && (
                      <label className="flex items-center gap-2 text-sm text-evergreen-900">
                        <input
                          type={type === "multiple_select" ? "checkbox" : "radio"}
                          name="correct"
                          checked={o.is_correct}
                          onChange={(e) => {
                            if (type === "multiple_select") setOpt(i, { is_correct: e.target.checked });
                            else setOptions((prev) => prev.map((x, idx) => ({ ...x, is_correct: idx === i })));
                          }}
                          className="h-5 w-5 accent-evergreen-700"
                        />
                        Correct answer
                      </label>
                    )}
                    <button type="button" className="ml-auto text-sm text-red-700" onClick={() => setOptions((prev) => prev.filter((_, idx) => idx !== i))}>Remove</button>
                  </div>
                  <RichContentEditor
                    value={o.doc}
                    onChange={(doc) => setOpt(i, { doc })}
                    compact
                    uploadImage={upload}
                    ariaLabel={`Option ${letters[i] ?? i + 1}`}
                  />
                </div>
              ))}
            </div>
            <Button type="button" variant="ghost" className="mt-2" onClick={() => setOptions((p) => [...p, { doc: emptyDoc(), label: "", is_correct: false }])}>+ Add option</Button>
          </div>
        )}

        {LABEL_TYPES.includes(type) && (
          <div>
            <p className="mb-2 text-sm font-medium text-evergreen-900">
              {type === "short_answer"
                ? "Accepted answers (exact text; any of these counts as correct)"
                : "Items in the CORRECT order (participants see them shuffled)"}
            </p>
            <div className="space-y-2">
              {options.map((o, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input value={o.label} onChange={(e) => setOpt(i, { label: e.target.value })} placeholder={`Item ${i + 1}`} />
                  <button type="button" className="text-sm text-red-700" onClick={() => setOptions((prev) => prev.filter((_, idx) => idx !== i))}>✕</button>
                </div>
              ))}
            </div>
            <Button type="button" variant="ghost" className="mt-2" onClick={() => setOptions((p) => [...p, { doc: emptyDoc(), label: "", is_correct: false }])}>+ Add item</Button>
          </div>
        )}

        <Field label="Worked solution / explanation" hint="Shown after answering (live feedback) and in examination review where enabled. Full mathematical editor available.">
          <RichContentEditor
            value={explanationDoc}
            onChange={setExplanationDoc}
            uploadImage={upload}
            ariaLabel="Explanation"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Points">
            <Input type="number" step="any" min={0} value={points} onChange={(e) => setPoints(parseFloat(e.target.value) || 0)} />
          </Field>
          <Field label="Difficulty">
            <Select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
              <option value="competition">Competition</option>
            </Select>
          </Field>
          <Field label="Topic">
            <Input value={topic ?? ""} onChange={(e) => setTopic(e.target.value)} placeholder="Fractions" />
          </Field>
          <Field label="Category">
            <Select value={categoryId ?? ""} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">None</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
        </div>

        {(classOptions || subjectOptions || curriculumOptions) && (
          <div className="grid gap-4 rounded-xl border border-evergreen-900/15 bg-cream p-4 sm:grid-cols-4">
            {classOptions && (
              <Field label="Class (Question Bank)">
                <Select value={classId ?? ""} onChange={(e) => setClassId(e.target.value)}>
                  <option value="">No class</option>
                  {classOptions.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Select>
              </Field>
            )}
            {subjectOptions && (
              <Field label="Subject">
                <Select value={subjectId ?? ""} onChange={(e) => setSubjectId(e.target.value)}>
                  <option value="">Not specified</option>
                  {subjectOptions.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </Select>
              </Field>
            )}
            {curriculumOptions && (
              <Field label="Curriculum">
                <Select value={curriculum ?? ""} onChange={(e) => setCurriculum(e.target.value)}>
                  <option value="">Not specified</option>
                  {curriculumOptions.map((c) => (
                    <option key={c.key} value={c.key}>{c.name}</option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label="Curriculum course">
              <Input value={curriculumCourse} onChange={(e) => setCurriculumCourse(e.target.value)} placeholder="MYP 3 Mathematics" />
            </Field>
            <Field label="Subtopic">
              <Input value={subtopic} onChange={(e) => setSubtopic(e.target.value)} placeholder="Fraction of a quantity" />
            </Field>
            <Field label="Source / reference">
              <Input value={sourceReference} onChange={(e) => setSourceReference(e.target.value)} placeholder="Original — guided by MYP mathematics framework" />
            </Field>
            <Field label="Source URL">
              <Input type="url" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://example.org/reference" />
            </Field>
          </div>
        )}

        <div className="flex gap-3">
          <Button onClick={submit} disabled={busy} variant="gold" className="px-6">
            {busy ? "Saving…" : initial?.id ? "Save changes" : "Save question"}
          </Button>
          <Button variant="ghost" onClick={() => router.back()}>Cancel</Button>
        </div>
      </Card>

      <Card className="h-fit p-6 xl:sticky xl:top-6">
        <h2 className="font-display text-lg font-semibold text-evergreen-950">Participant preview</h2>
        <div className="mt-4 rounded-xl border border-evergreen-900/10 bg-cream p-4">
          {mediaUrl && mediaType === "image" && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mediaUrl} alt="" className="mb-3 max-h-48 w-full rounded-lg object-cover" />
          )}
          <div className="font-medium text-ink">
            <RichContent doc={docIsEmpty(promptDoc) ? null : promptDoc} text="Your question will appear here…" />
          </div>
          {isChoice && (
            <div className="mt-3 space-y-2">
              {options.filter((o) => !docIsEmpty(o.doc)).map((o, i) => (
                <div key={i} className="flex items-start gap-2 rounded-lg border border-evergreen-900/10 bg-white px-3 py-2 text-sm">
                  <span className="font-bold text-evergreen-700">{letters[i]}.</span>
                  <RichContent doc={o.doc} />
                </div>
              ))}
            </div>
          )}
          {LABEL_TYPES.includes(type) && type === "short_answer" && (
            <div className="mt-3 rounded-lg border border-dashed border-evergreen-900/20 bg-white px-3 py-2 text-sm text-ink-soft">Type your answer…</div>
          )}
          {type === "assess_parts" && (
            <div className="mt-3 space-y-2">
              {assessParts.map((part, index) => (
                <div key={`${part.id}-preview-${index}`} className="rounded-lg border border-evergreen-900/15 bg-white px-3 py-2 text-sm">
                  <div className="flex items-center justify-between gap-2"><span className="font-semibold text-evergreen-900">{part.label || `(${partIdFor(index)})`}</span><span className="text-xs text-ink-soft">{part.points || "0"} marks</span></div>
                  {part.prompt && <p className="mt-1 text-xs text-ink-soft">{part.prompt}</p>}
                  <div className="mt-2 rounded border border-dashed border-evergreen-900/20 px-2 py-1.5 text-xs text-ink-soft">{part.placeholder || "Type your answer…"}{part.unit ? ` ${part.unit}` : ""}</div>
                </div>
              ))}
            </div>
          )}
          {(type === "open_ended") && (
            <div className="mt-3 rounded-lg border border-dashed border-evergreen-900/20 bg-white px-3 py-2 text-sm text-ink-soft">
              <p>Write your full solution with the mathematics editor…</p>
              {toolMode === "custom" && responseTools.includes("graph") && <p className="mt-1 text-xs">📈 Graph workspace included</p>}
              {toolMode === "custom" && responseTools.includes("geometry") && <p className="mt-1 text-xs">△ Geometry workspace included</p>}
            </div>
          )}
          {type === "numeric" && (
            <div className="mt-3 rounded-lg border border-dashed border-evergreen-900/20 bg-white px-3 py-2 text-sm text-ink-soft">Enter a number…</div>
          )}
          {!docIsEmpty(explanationDoc) && (
            <div className="mt-4 rounded-lg border border-gold-300 bg-gold-50 px-3 py-2 text-sm">
              <p className="mb-1 font-semibold text-gold-900">Worked solution (after answering)</p>
              <RichContent doc={explanationDoc} />
            </div>
          )}
        </div>
        <p className="mt-3 text-xs text-ink-soft">Correctness is never shown in previews or sent to participant devices during live events or examinations.</p>
      </Card>
    </div>
  );
}
