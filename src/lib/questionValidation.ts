/**
 * Publication readiness for questions.
 *
 * Drafts and pending-review questions may legitimately be incomplete, but a
 * published question must be answerable and gradeable. The same rules are
 * enforced by the workspace and Super Admin save/status actions.
 */

export interface PublishableQuestion {
  type: string;
  prompt?: string | null;
  points?: number | string | null;
  config?: Record<string, unknown> | null;
  options?: Array<{ label?: string | null; is_correct?: boolean | null }> | null;
}

/** Validate an explicitly configured response workspace for either kind of constructed response. */
function responseWorkspaceIssues(config: Record<string, unknown>, issues: string[]) {
  if (config.response_tools === undefined) return;
  const rawTools = config.response_tools;
  const tools = Array.isArray(rawTools) ? rawTools.filter((tool): tool is string => typeof tool === "string") : null;
  if (!tools || tools.length === 0) {
    issues.push("at least one response tool must be enabled");
    return;
  }
  const requirement = typeof config.response_requirement === "string" ? config.response_requirement : "any";
  const requirementTool: Record<string, { tool: string; label: string }> = {
    graph: { tool: "graph", label: "a graph" },
    geometry: { tool: "geometry", label: "a geometric construction" },
    statistics: { tool: "statistics", label: "a statistics chart" },
    data_table: { tool: "data_table", label: "a completed data table" },
    venn: { tool: "venn", label: "a Venn diagram" },
    probability_tree: { tool: "probability_tree", label: "a probability tree" },
    stem_leaf: { tool: "stem_leaf", label: "a stem-and-leaf diagram" },
    text: { tool: "rich_text", label: "a written answer" },
  };
  const required = requirementTool[requirement];
  if (required && !tools.includes(required.tool)) {
    issues.push(`the response must include ${required.label}, but that tool is not enabled`);
  }
}

export function questionPublishIssues(question: PublishableQuestion): string[] {
  const issues: string[] = [];
  const options = question.options ?? [];
  const config = question.config ?? {};
  const correct = options.filter((o) => Boolean(o.is_correct)).length;

  if (!String(question.prompt ?? "").trim()) issues.push("the question prompt is empty");
  if (!Number.isFinite(Number(question.points)) || Number(question.points) < 0) {
    issues.push("the mark value is invalid");
  }

  switch (question.type) {
    case "single_choice":
    case "true_false":
      if (options.length < 2) issues.push("at least two answer options are required");
      if (correct !== 1) issues.push("exactly one option must be marked correct");
      break;
    case "multiple_select":
      if (options.length < 2) issues.push("at least two answer options are required");
      if (correct < 1) issues.push("at least one option must be marked correct");
      break;
    case "poll":
      if (options.length < 2) issues.push("at least two poll options are required");
      break;
    case "short_answer":
      if (!options.some((o) => o.is_correct && String(o.label ?? "").trim())) {
        issues.push("at least one accepted answer is required");
      }
      break;
    case "ordering":
      if (options.filter((o) => String(o.label ?? "").trim()).length < 2) {
        issues.push("at least two ordering items are required");
      }
      break;
    case "numeric": {
      const rawAnswer = config.numeric_answer;
      const answer = typeof rawAnswer === "number" || (typeof rawAnswer === "string" && rawAnswer.trim()) ? Number(rawAnswer) : NaN;
      const rawTolerance = config.tolerance;
      const tolerance = rawTolerance == null || rawTolerance === "" ? 0 :
        typeof rawTolerance === "number" || (typeof rawTolerance === "string" && rawTolerance.trim()) ? Number(rawTolerance) : NaN;
      if (!Number.isFinite(answer)) issues.push("a valid numeric answer is required");
      if (!Number.isFinite(tolerance) || tolerance < 0) issues.push("the numeric tolerance must be zero or greater");
      break;
    }
    case "matching": {
      const pairs = Array.isArray(config.pairs) ? config.pairs : [];
      const complete = pairs.filter((pair) => {
        if (!pair || typeof pair !== "object") return false;
        const row = pair as Record<string, unknown>;
        return String(row.left ?? "").trim() && String(row.right ?? "").trim();
      });
      if (complete.length < 2 || complete.length !== pairs.length) issues.push("at least two complete matching pairs are required");
      const lefts = complete.map((pair) => String((pair as Record<string, unknown>).left).trim().toLowerCase().replace(/\s+/g, " "));
      if (new Set(lefts).size !== lefts.length) issues.push("matching prompts must be unique");
      break;
    }
    case "assess_parts": {
      const parts = Array.isArray(config.parts) ? config.parts : [];
      if (parts.length < 1) issues.push("at least one typed answer part is required");
      if (parts.length > 12) issues.push("an assess-parts question can contain at most twelve parts");
      let partMarks = 0;
      const ids = new Set<string>();
      for (const raw of parts) {
        const part = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
        const id = typeof part.id === "string" ? part.id.trim() : "";
        if (!id || ids.has(id)) issues.push("every part needs a unique stable ID");
        else ids.add(id);
        const pts = Number(part.points);
        if (!Number.isFinite(pts) || pts <= 0) issues.push("every part must carry positive marks");
        else partMarks += pts;
        const hints = Array.isArray(part.hints) ? part.hints : [];
        if (hints.filter((hint) => typeof hint === "string" && hint.trim().length >= 8).length < 2) {
          issues.push("every part needs two progressive hints");
        }
        if (part.kind !== "numeric" && part.kind !== "text" && part.kind !== "expression") {
          issues.push("every part must have a supported answer type");
          continue;
        }
        if (part.kind === "numeric") {
          const answer = part.answer;
          if (!(typeof answer === "number" || (typeof answer === "string" && answer.trim())) || !Number.isFinite(Number(answer))) {
            issues.push("every numeric part needs a numeric answer");
          }
          const tolerance = part.tolerance;
          if (tolerance !== undefined && (!Number.isFinite(Number(tolerance)) || Number(tolerance) < 0)) {
            issues.push("numeric part tolerance must be zero or greater");
          }
        } else if (!Array.isArray(part.accepted) || !part.accepted.some((answer) => typeof answer === "string" && answer.trim())) {
          issues.push("every text/expression part needs at least one accepted answer");
        }
      }
      if (parts.length && Math.abs(partMarks - Number(question.points)) > 0.001) {
        issues.push("the part marks must add up to the question marks");
      }
      responseWorkspaceIssues(config, issues);
      break;
    }
    case "open_ended": {
      if (!String(config.marking_criteria ?? "").trim()) {
        issues.push("marking criteria are required for a structured-response question");
      }
      responseWorkspaceIssues(config, issues);
      break;
    }
    case "slide":
      break;
    default:
      issues.push("the question type is not supported");
  }

  return issues;
}

export function questionPublishError(question: PublishableQuestion): string | null {
  const issues = questionPublishIssues(question);
  return issues.length ? `This question cannot be published yet: ${issues.join("; ")}.` : null;
}
