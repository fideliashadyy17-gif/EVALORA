/**
 * EVALORA AI CORE — deterministic intent routing.
 *
 * This module is pure: no database, no model, no `server-only`. It exists so the
 * router can be tested exhaustively and so the fallback path is readable on its
 * own. `planner.ts` composes it with the registry, permissions and the model.
 */

export interface PlanStep {
  tool: string;
  args: Record<string, unknown>;
  why: string;
}

export interface RulePlan {
  steps: PlanStep[];
  refusal?: string;
  note?: string;
}

/** Validates a model-authored plan against the registry and its schemas. */
import { getTool } from "./tools";

export const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/* ── Rule-based intent routing ──────────────────────────────────────── */


export interface IntentRule {
  name: string;
  test: (text: string) => boolean;
  build: (text: string) => PlanStep | null;
}

export const text = (instruction: string): string => instruction.trim();

/**
 * Deterministic intent rules. Order matters: the first match wins, which is why
 * the destructive intents (revoke, publish) come before the generic ones.
 */
export const INTENT_RULES: IntentRule[] = [
  {
    name: "revoke_agent",
    test: (t) => /\b(revoke|disconnect)\b.*\b(agent|chatgpt|claude|gemini|mcp)\b/i.test(t) && UUID_RE.test(t),
    build: (t) => ({
      tool: "revoke_ai_agent",
      args: { agent_id: UUID_RE.exec(t)![0], reason: text(t).slice(0, 400), confirm: true },
      why: "The instruction names an agent credential and a revocation.",
    }),
  },
  {
    name: "publish_results",
    test: (t) => /\b(publish|release|withdraw|unpublish)\b/i.test(t) && /\b(result|mark)s?\b/i.test(t),
    build: (t) => {
      const id = UUID_RE.exec(t)?.[0];
      if (!id) return null;
      return {
        tool: "publish_results",
        args: { examination_id: id, publish: !/unpublish|withdraw/i.test(t), confirm: true },
        why: "The instruction publishes or withdraws results for a named examination.",
      };
    },
  },
  {
    name: "publish_examination",
    test: (t) => /\b(publish|open|release)\b/i.test(t) && /\b(exam|examination|paper)\b/i.test(t) && !/\bresult/i.test(t),
    build: (t) => {
      const id = UUID_RE.exec(t)?.[0];
      if (!id) return null;
      return {
        tool: "publish_examination",
        args: { examination_id: id, status: /\bopen\b/i.test(t) ? "open" : "scheduled", confirm: true },
        why: "The instruction publishes a named examination.",
      };
    },
  },
  {
    name: "grade_adjustment",
    test: (t) => /\b(adjust|add|bonus)\b[\s\S]*\b(marks?|points?|grade)\b/i.test(t) && UUID_RE.test(t),
    build: (t) => {
      const id = UUID_RE.exec(t)![0];
      const points = Number(/([0-9]+(?:\.[0-9]+)?)\s*(?:marks?|points?)/i.exec(t)?.[1] ?? "");
      if (!Number.isFinite(points) || points <= 0) return null;
      return {
        tool: "apply_grade_adjustment",
        args: { examination_id: id, points, reason: text(t).slice(0, 400), confirm: true },
        why: "The instruction asks for a score adjustment on a named examination.",
      };
    },
  },
  {
    name: "create_examination",
    test: (t) => /\b(create|build|make|generate|prepare|draft|write)\b/i.test(t) && /\b(exam|examination|paper|test|assessment)\b/i.test(t),
    build: (t) => ({
      tool: "create_examination",
      args: { instruction: text(t), source: "auto" },
      why: "The instruction asks for a new examination.",
    }),
  },
  {
    name: "create_quiz",
    test: (t) => /\b(create|build|make|generate)\b/i.test(t) && /\bquiz\b/i.test(t),
    build: (t) => {
      const count = Number(/([0-9]{1,2})\s*questions?/i.exec(t)?.[1] ?? "");
      return {
        tool: "create_quiz",
        args: {
          title: text(t).slice(0, 150) || "New quiz",
          generate: { question_count: Number.isFinite(count) && count > 0 ? count : 8 },
        },
        why: "The instruction asks for a quiz.",
      };
    },
  },
  {
    name: "generate_question",
    test: (t) => /\b(generate|author|create|make|give me)\b/i.test(t) && /\bquestion\b/i.test(t) && !/\bexam|paper|quiz\b/i.test(t),
    build: (t) => {
      const topic = /(linear[_ ]equations?|quadratic|fractions?|percentages?|probability|pythagoras|trigonometry|area|volume|statistics|sequences?|algebra|ratio|geometry|integers|functions?|vectors?|matrices|logarithms?|calculus|derivatives?)/i.exec(t)?.[0];
      if (!topic) return null;
      const key = topic.toLowerCase().replace(/[\s-]+/g, "_").replace(/s$/, "");
      const normalise: Record<string, string> = {
        linear_equation: "linear_equations",
        quadratic: "quadratic_equations",
        fraction: "fractions",
        percentage: "percentages",
        sequence: "sequences",
        function: "functions",
        vector: "vectors",
        matrice: "matrices",
        logarithm: "logarithms",
        derivative: "derivatives",
      };
      return {
        tool: "generate_question",
        args: {
          topic: normalise[key] ?? key,
          difficulty: /\b(hard|challenging)\b/i.test(t) ? "hard" : /\beasy\b/i.test(t) ? "easy" : "medium",
          save: /\bsave|add to\b/i.test(t),
        },
        why: "The instruction asks for a practice question on a named topic.",
      };
    },
  },
  {
    name: "mark_responses",
    test: (t) => /\b(mark|propose|grade)\b/i.test(t) && /\b(response|answer|script|submission)\b/i.test(t),
    build: (t) => {
      const ids = t.match(new RegExp(UUID_RE.source, "gi")) ?? [];
      if (ids.length < 3) return null;
      return {
        tool: "mark_responses",
        args: { examination_id: ids[0], attempt_id: ids[1], question_id: ids[2] },
        why: "The instruction names an examination, attempt and question to mark.",
      };
    },
  },
  {
    name: "analyze",
    test: (t) => /\b(analyse|analyze|how did|performance|results?|statistics|average|hardest|weakest|difficult)\b/i.test(t),
    build: (t) => {
      const id = UUID_RE.exec(t)?.[0];
      if (!id) return null;
      if (/\bclass\b/i.test(t)) return { tool: "get_class_statistics", args: { class_id: id }, why: "The instruction asks about a class." };
      if (/\bresults?\b/i.test(t) && !/\banalyse|analyze|performance|hardest\b/i.test(t)) {
        return { tool: "get_exam_results", args: { examination_id: id }, why: "The instruction asks for results." };
      }
      return { tool: "analyze_exam_performance", args: { examination_id: id }, why: "The instruction asks how an examination performed." };
    },
  },
  {
    name: "validate",
    test: (t) => /\b(validate|check|review|verify)\b/i.test(t) && /\b(exam|examination|paper)\b/i.test(t) && UUID_RE.test(t),
    build: (t) => ({ tool: "validate_examination", args: { examination_id: UUID_RE.exec(t)![0] }, why: "The instruction asks for a validation pass." }),
  },
  {
    name: "duplicate",
    test: (t) => /\b(duplicate|copy|clone|version)\b/i.test(t) && /\b(exam|examination|paper)\b/i.test(t) && UUID_RE.test(t),
    build: (t) => ({ tool: "duplicate_examination", args: { examination_id: UUID_RE.exec(t)![0] }, why: "The instruction asks for a copy." }),
  },
  {
    name: "inspect",
    test: (t) => /\b(open|show|list|find|what|which|how many|summar)\w*\b/i.test(t),
    build: (t) => {
      const id = UUID_RE.exec(t)?.[0];
      if (id && /\bexam/i.test(t)) return { tool: "get_examination", args: { examination_id: id }, why: "The instruction names an examination." };
      if (id && /\bquiz|paper/i.test(t)) return { tool: "get_quiz", args: { quiz_id: id }, why: "The instruction names a paper." };
      if (/\bclasses\b/i.test(t) || /\bsubjects\b/i.test(t) || /\bworkspace|context\b/i.test(t)) {
        return { tool: "get_org_context", args: {}, why: "The instruction asks about the workspace itself." };
      }
      if (/\bquestion/i.test(t) && !/\bexam|paper\b/i.test(t)) return { tool: "get_question_bank", args: {}, why: "The instruction asks about questions." };
      if (/\bquiz|paper/i.test(t)) return { tool: "list_quizzes", args: {}, why: "The instruction asks about papers." };
      if (/\bagents?\b/i.test(t)) return { tool: "list_ai_agents", args: {}, why: "The instruction asks about external agents." };
      if (/\bexam/i.test(t)) return { tool: "list_examinations", args: {}, why: "The instruction asks about examinations." };
      return { tool: "get_org_context", args: {}, why: "A read-only overview is the safest useful answer." };
    },
  },
];

/** Routes an instruction with no model available. */
export function planFromRules(instruction: string): RulePlan {
  const t = text(instruction);
  if (t.length < 3) return { steps: [], refusal: "Write an instruction describing what you want EVALORA to do." };
  for (const rule of INTENT_RULES) {
    if (!rule.test(t)) continue;
    const step = rule.build(t);
    if (step) return { steps: [step], note: step.why };
    // The intent was recognised but a required identifier or quantity is absent:
    // say what is missing rather than guessing a record.
  }
  return {
    steps: [],
    refusal:
      "I could not turn that into an action EVALORA can perform. Try naming the record id, or phrase it as one of: " +
      "create an examination, generate a question, validate a paper, analyse results, mark a response.",
  };
}

export function validateModelPlan(
  raw: unknown,
  allowedNames: Set<string>,
): { steps: PlanStep[]; dropped: string[] } {
  const body = raw as Record<string, unknown>;
  const list = Array.isArray(body?.steps) ? body.steps : [];
  const steps: PlanStep[] = [];
  const dropped: string[] = [];
  for (const entry of list.slice(0, 3)) {
    const row = (entry ?? {}) as Record<string, unknown>;
    const name = typeof row.tool === "string" ? row.tool : "";
    if (!allowedNames.has(name)) {
      dropped.push(name || "an unnamed tool");
      continue;
    }
    const definition = getTool(name)!;
    const args = row.args && typeof row.args === "object" && !Array.isArray(row.args) ? (row.args as Record<string, unknown>) : {};
    // Only declared properties survive: an undeclared argument is dropped, not
    // forwarded to a handler that might read it.
    const properties = (definition.input as { properties?: Record<string, unknown> }).properties ?? {};
    const declared = Object.keys(properties);
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(args)) {
      if (declared.length === 0 || declared.includes(key)) cleaned[key] = value;
    }
    steps.push({ tool: name, args: cleaned, why: typeof row.why === "string" ? row.why.slice(0, 300) : "" });
  }
  return { steps, dropped };
}

