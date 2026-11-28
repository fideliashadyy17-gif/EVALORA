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

/**
 * Mirrors `isKnownPermission` in agents.ts. The intent router is deliberately
 * pure (no registry import), so it recognises the shape and the handler — which
 * does import the registry — is the authority on what is really granted.
 */
const PERMISSION_SHAPE = /^[a-z][a-z_]*\.[a-z][a-z_]*$/;
export const isKnownPermissionKey = (key: string): boolean => PERMISSION_SHAPE.test(key);

export const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/* ── Rule-based intent routing ──────────────────────────────────────── */


/**
 * Resolves a phrase to a REAL catalogue topic key, or null.
 *
 * Injected rather than imported so this module stays pure (no registry, no
 * server-only boundary). Without it the router cannot safely guess a topic: a
 * key that does not exist yields a paper with zero questions.
 */
export type TopicResolver = (text: string) => string | null;

export interface IntentRule {
  name: string;
  test: (text: string) => boolean;
  build: (text: string, resolveTopic?: TopicResolver) => PlanStep | null;
}

export const text = (instruction: string): string => instruction.trim();

/**
 * Deterministic intent rules. Order matters: the first match wins, which is why
 * the destructive intents (revoke, publish) come before the generic ones.
 */
export const INTENT_RULES: IntentRule[] = [
  {
    name: "register_agent",
    // Registration is a distinct verb from revocation; "set up"/"configure" are
    // how people actually phrase it.
    test: (t) =>
      /\b(register|create|add|configure|set up|setup|connect|provision|onboard)\b/i.test(t) &&
      /\b(agent|credential|integration)\b/i.test(t) &&
      !/\b(revoke|disconnect|remove|delete)\b/i.test(t),
    build: (t) => {
      const client =
        /\bchatgpt\b/i.test(t) ? "chatgpt"
        : /\bclaude\b/i.test(t) ? "claude"
        : /\b(gemini|bard)\b/i.test(t) ? "gemini"
        : /\b(mcp|model context protocol)\b/i.test(t) ? "mcp"
        : /\b(rest|api)\b/i.test(t) ? "api"
        : "mcp";
      // The named permissions, if the teacher listed any.
      const named = (t.match(/\b[a-z_]+\.[a-z_]+\b/g) ?? []).filter((key) => isKnownPermissionKey(key));
      const name =
        /(?:called|named)\s+["“']?([^"”'.,;]{2,60})/i.exec(t)?.[1]?.trim() ??
        `EVALORA ${client} agent`;
      return {
        tool: "register_ai_agent",
        args: {
          name: name.slice(0, 120),
          client,
          description: text(t).slice(0, 500),
          ...(named.length ? { allowed_permissions: named.join(",") } : {}),
        },
        why: "The instruction asks for an agent credential to be set up.",
      };
    },
  },
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
    // "Create 10 questions on fractions" is a request for questions, not a
    // request EVALORA cannot understand. The count becomes `count`, and the
    // questions are saved when the teacher asked for them to exist.
    test: (t) => /\b(generate|author|create|make|give me|add|write|produce)\b/i.test(t) && /\bquestions?\b/i.test(t) && !/\bexam|paper|quiz\b/i.test(t),
    build: (t, resolveTopic) => {
      // The topic MUST come from the catalogue. The previous hand-written list
      // named topics that do not exist ("fractions", "trigonometry"), so those
      // instructions generated zero questions.
      const topic = resolveTopic?.(t) ?? null;
      if (!topic) return null;
      const count = Number(/(\d{1,2})\s*questions?/i.exec(t)?.[1] ?? "");
      const gradeLabel = /(myp\s*[1-5]|grade\s*\d{1,2})/i.exec(t)?.[0];
      return {
        tool: "generate_question",
        args: {
          topic,
          difficulty: /\b(hard|challenging)\b/i.test(t) ? "hard" : /\beasy\b/i.test(t) ? "easy" : "medium",
          count: Number.isFinite(count) && count > 0 ? Math.min(20, count) : 1,
          ...(gradeLabel ? { grade_label: gradeLabel.replace(/\b([a-z])/, (m) => m.toUpperCase()) } : {}),
          // A verb that means "put these in the bank" saves them. Asking to
          // "generate"/"draft"/"show" does not, and the reply says so.
          save: /\b(save|add|create|write|produce|put)\b/i.test(t),
        },
        why: "The instruction asks for practice questions on a named topic.",
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

/**
 * Splits a compound instruction into its clauses so more than one intent can be
 * carried out. "Create 10 questions on fractions and then make a quiz from them"
 * is two jobs, and doing only the second one silently loses the first.
 */
function clauses(instruction: string): string[] {
  const parts = instruction
    .split(/\s*(?:\band then\b|\bthen\b|\bafter that\b|;|\balso\b|\.\s+)/i)
    .map((part) => part.trim())
    .filter((part) => part.length >= 3);
  return parts.length ? parts : [instruction.trim()];
}

/** Routes an instruction with no model available. */
export function planFromRules(instruction: string, resolveTopic?: TopicResolver): RulePlan {
  const t = text(instruction);
  if (t.length < 3) return { steps: [], refusal: "Write an instruction describing what you want EVALORA to do." };

  // A compound request runs its clauses in the order they were written, bounded
  // to the same three steps the model planner is allowed. A clause with no
  // matching tool is not silently dropped: it is reported so the reply can say
  // what was and was not done.
  const parts = clauses(t);
  const steps: PlanStep[] = [];
  const uncovered: string[] = [];
  const seen = new Set<string>();
  for (const part of parts) {
    if (steps.length >= 3) break;
    let matched = false;
    for (const rule of INTENT_RULES) {
      if (!rule.test(part)) continue;
      const step = rule.build(part, resolveTopic);
      if (!step) continue;
      const signature = `${step.tool}:${JSON.stringify(step.args)}`;
      if (seen.has(signature)) { matched = true; break; }
      seen.add(signature);
      steps.push(step);
      matched = true;
      break;
    }
    if (!matched && parts.length > 1) uncovered.push(part);
  }

  if (steps.length) {
    const note = steps.map((s) => s.why).filter(Boolean).join(" ");
    return { steps, note: uncovered.length ? `${note} Not actioned: ${uncovered.join(" / ")}.` : note };
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

