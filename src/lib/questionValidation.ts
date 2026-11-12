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
      let partMarks = 0;
      for (const raw of parts) {
        const part = (raw ?? {}) as Record<string, unknown>;
        const pts = Number(part.points);
        if (!Number.isFinite(pts) || pts <= 0) issues.push("every part must carry positive marks");
        else partMarks += pts;
        const hints = Array.isArray(part.hints) ? part.hints : [];
        if (hints.filter((h) => typeof h === "string" && h.trim().length >= 8).length < 2) {
          issues.push("every part needs two progressive hints");
        }
        if (part.kind === "numeric") {
          if (!Number.isFinite(Number(part.answer))) issues.push("every numeric part needs a numeric answer");
        } else if (!Array.isArray(part.accepted) || !part.accepted.some((a) => typeof a === "string" && a.trim())) {
          issues.push("every text/expression part needs at least one accepted answer");
        }
      }
      if (parts.length && Math.abs(partMarks - Number(question.points)) > 0.001) {
        issues.push("the part marks must add up to the question marks");
      }
      break;
    }
    case "open_ended": {
      if (!String(config.marking_criteria ?? "").trim()) {
        issues.push("marking criteria are required for a structured-response question");
      }
      // Optional response workspace. When a teacher configures it explicitly it
      // must be coherent: at least one tool, and a required tool must be enabled.
      if (config.response_tools !== undefined) {
        const rawTools = config.response_tools;
        const tools = Array.isArray(rawTools) ? rawTools.filter((tool): tool is string => typeof tool === "string") : null;
        if (!tools || tools.length === 0) {
          issues.push("at least one response tool must be enabled");
        } else {
          const requirement = typeof config.response_requirement === "string" ? config.response_requirement : "any";
          const requirementTool: Record<string, { tool: string; label: string }> = {
            graph: { tool: "graph", label: "a graph" },
            geometry: { tool: "geometry", label: "a geometric construction" },
            statistics: { tool: "statistics", label: "a statistics chart" },
            data_table: { tool: "data_table", label: "a completed data table" },
            text: { tool: "rich_text", label: "a written answer" },
          };
          const required = requirementTool[requirement];
          if (required && !tools.includes(required.tool)) {
            issues.push(`the response must include ${required.label}, but that tool is not enabled`);
          }
        }
      }
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
