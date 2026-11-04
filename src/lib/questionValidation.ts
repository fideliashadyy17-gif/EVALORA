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
      if (!options.some((o) => String(o.label ?? "").trim())) {
        issues.push("at least one accepted answer is required");
      }
      break;
    case "ordering":
      if (options.filter((o) => String(o.label ?? "").trim()).length < 2) {
        issues.push("at least two ordering items are required");
      }
      break;
    case "numeric": {
      const answer = Number(config.numeric_answer);
      const tolerance = config.tolerance == null || config.tolerance === "" ? 0 : Number(config.tolerance);
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
      if (complete.length < 2) issues.push("at least two complete matching pairs are required");
      break;
    }
    case "open_ended":
      if (!String(config.marking_criteria ?? "").trim()) {
        issues.push("marking criteria are required for a structured-response question");
      }
      break;
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
