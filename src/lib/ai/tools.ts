/**
 * EVALORA AI CORE — Action Engine tool catalogue.
 *
 * ONE list, consumed by three surfaces:
 *   - the native assistant (server action → same executor),
 *   - the REST API  (`POST /api/ai/v1/tools/<name>`),
 *   - the MCP server (`tools/list` and `tools/call`).
 *
 * A tool therefore cannot exist on one surface and not another, and the
 * permission, the risk class and the input contract are declared once. The
 * executor that runs them is `execute.ts`; the registry never writes anything
 * itself.
 */

import {
  arr,
  bool,
  emptySchema,
  int,
  num,
  obj,
  str,
  uuid,
  type ToolDefinition,
  type ToolRisk,
} from "./types";

const ordinary = (permission: string, module?: string): ToolRisk => ({
  risk: "ordinary",
  permission,
  module,
  writes: false,
});
const ordinaryWrite = (permission: string, module?: string): ToolRisk => ({
  risk: "ordinary",
  permission,
  module,
  writes: true,
});
const sensitive = (permission: string, module?: string): ToolRisk => ({
  risk: "sensitive",
  permission,
  module,
  writes: true,
  mayRequireApproval: true,
});

export const TOOLS: ToolDefinition[] = [
  /* ─── Context ───────────────────────────────────────────────────────── */
  {
    name: "get_org_context",
    title: "Get workspace context",
    description:
      "Return the live catalogue for the caller's organization: classes, subjects, curricula, the question types available for new questions, plan limits, enabled modules and current content totals.",
    risk: ordinary("dashboard.view"),
    input: emptySchema({}),
    modelHint: "Call this first when you need to know which classes, subjects or question types exist.",
  },

  /* ─── Examinations ──────────────────────────────────────────────────── */
  {
    name: "list_examinations",
    title: "List examinations",
    description: "List examinations in the caller's organization, newest first, with status, duration, marks and attempt counts.",
    risk: ordinary("exams.view", "examinations"),
    input: emptySchema({
      status: str("Optional status filter.", { enum: ["draft", "scheduled", "open", "closed", "paused"] }),
      query: str("Optional text to match in the title."),
      limit: int("How many to return (1–50, default 20).", { minimum: 1, maximum: 50 }),
    }),
    modelHint: "Use to find an existing examination before updating or analysing it.",
  },
  {
    name: "get_examination",
    title: "Get one examination",
    description:
      "Return one examination with its paper structure (sections, questions, marks) and settings. Answer keys are never included.",
    risk: ordinary("exams.view", "examinations"),
    input: emptySchema({ examination_id: uuid("The examination id.") }, ["examination_id"]),
    modelHint: "Use before improving or analysing an examination.",
  },
  {
    name: "create_examination",
    title: "Create a complete examination (draft)",
    description:
      "Build a complete examination: blueprint, sections, original questions with computed answers, marking scheme and points, then persist it as a DRAFT with its own paper. Nothing is published, nothing is assigned to candidates and no existing paper is touched. Accepts either a natural-language instruction or explicit parameters.",
    risk: ordinaryWrite("exams.create", "examinations"),
    input: emptySchema({
      instruction: str(
        "Natural-language instruction, e.g. \"Create a Grade 9 MYP Mathematics examination on algebraic expressions, linear equations and sequences, 90 minutes, 2 sections, 100 marks\".",
      ),
      title: str("Explicit title. Overrides the one inferred from the instruction.", { maxLength: 160 }),
      grade_label: str("Class/level label, e.g. \"Grade 9\", \"MYP4\", \"Year 10\"."),
      subject: str("Subject name, e.g. \"Mathematics\"."),
      curriculum: str("Curriculum key.", { enum: ["myp", "ap", "english", "beninese"] }),
      duration_minutes: int("Duration in minutes (1–1440).", { minimum: 1, maximum: 1440 }),
      question_count: int("How many questions to author (2–60).", { minimum: 2, maximum: 60 }),
      total_marks: num("Total marks for the paper.", { minimum: 1 }),
      topics: arr("Topic keys to cover.", str("A topic key from get_org_context.")),
      sections: arr(
        "Optional section layout.",
        obj("A section.", {
          id: str("Short id, e.g. \"A\"."),
          title: str("Section title."),
          instructions: str("Instructions printed under the section title."),
          share: num("Fraction of the paper's questions in this section (0–1)."),
        }, ["id", "title", "share"]),
      ),
      pass_mark_percent: num("Pass mark percentage (0–100).", { minimum: 0, maximum: 100 }),
      difficulty_mix: obj("Optional difficulty mix; the three values must sum to 1.", {
        easy: num("Share of easy questions."),
        medium: num("Share of medium questions."),
        hard: num("Share of hard questions."),
      }),
      source: str("Which engine authored the questions.", { enum: ["auto", "model", "template"] }),
    }, ["instruction"]),
    modelHint:
      "The main tool for \"create an exam\". It returns a draft examination id and a workspace link. Do not call publish_examination afterwards unless the teacher explicitly asked to publish.",
  },
  {
    name: "validate_examination",
    title: "Validate an examination",
    description:
      "Run the structural review of an examination's paper: section and mark totals, key completeness, duplicate detection, formula delimiters and marking consistency. Returns errors and warnings; it does not change anything.",
    risk: ordinary("exams.view", "examinations"),
    input: emptySchema({ examination_id: uuid("The examination id.") }, ["examination_id"]),
    modelHint: "Use after creating or changing an examination, and before proposing publication.",
  },
  {
    name: "update_examination",
    title: "Update examination metadata",
    description:
      "Change an examination's title, description, instructions, duration, pass mark or scheduling window. Content of a published or attempt-locked paper is never modified by this tool.",
    risk: ordinaryWrite("exams.edit", "examinations"),
    input: emptySchema({
      examination_id: uuid("The examination id."),
      title: str("New title.", { maxLength: 160 }),
      description: str("New description.", { maxLength: 1000 }),
      instructions: str("New candidate instructions.", { maxLength: 4000 }),
      duration_minutes: int("New duration in minutes.", { minimum: 1, maximum: 1440 }),
      pass_mark_percent: num("New pass mark percentage.", { minimum: 0, maximum: 100 }),
      starts_at: str("ISO timestamp for the start of the window."),
      ends_at: str("ISO timestamp for the end of the window."),
    }, ["examination_id"]),
    modelHint: "Use for metadata changes only; question content is protected.",
  },
  {
    name: "duplicate_examination",
    title: "Duplicate an examination as a new draft",
    description:
      "Copy an existing examination — including its paper — into a new DRAFT owned by the caller. This is how an improvement to a published or attempt-locked examination is expressed: the original is never rewritten.",
    risk: ordinaryWrite("exams.create", "examinations"),
    input: emptySchema({
      examination_id: uuid("The examination to copy."),
      title: str("Title for the copy.", { maxLength: 160 }),
    }, ["examination_id"]),
    modelHint: "Use when a teacher asks to improve an exam that is published or being sat.",
  },
  {
    name: "publish_examination",
    title: "Publish an examination",
    description:
      "Move a draft examination to scheduled/open so candidates can sit it. Sensitive: requires exams.edit and, under the default policy, a recorded human approval.",
    risk: sensitive("exams.edit", "examinations"),
    input: emptySchema({
      examination_id: uuid("The examination id."),
      status: str("Target status.", { enum: ["scheduled", "open"] }),
      confirm: bool("Must be true. The caller has read the examination and intends to open it."),
    }, ["examination_id", "status", "confirm"]),
    modelHint: "Never call this unless the teacher explicitly asked to publish. It may return approval_required.",
  },
  {
    name: "compare_examinations",
    title: "Compare two examinations",
    description:
      "Diff two examinations: question counts, mark totals, topic and difficulty distribution, and questions present in one but not the other.",
    risk: ordinary("exams.view", "examinations"),
    input: emptySchema({
      left_id: uuid("First examination."),
      right_id: uuid("Second examination."),
    }, ["left_id", "right_id"]),
    modelHint: "Use when a teacher asks how a new version differs from the one it replaced.",
  },

  /* ─── Questions ─────────────────────────────────────────────────────── */
  {
    name: "get_question_bank",
    title: "Search the question bank",
    description: "Search questions in the caller's organization by text, topic, type, difficulty or status. Answer keys are not returned.",
    risk: ordinary("questions.view", "question_bank"),
    input: emptySchema({
      query: str("Text to match in the prompt."),
      type: str("Question type filter."),
      difficulty: str("Difficulty filter.", { enum: ["easy", "medium", "hard", "competition"] }),
      status: str("Status filter.", { enum: ["draft", "pending_review", "published", "archived"] }),
      limit: int("How many to return (1–50, default 20).", { minimum: 1, maximum: 50 }),
    }),
    modelHint: "Use to find reusable existing questions before authoring new ones.",
  },
  {
    name: "create_question",
    title: "Create a question",
    description:
      "Create one question in the bank with its options, key and explanation, after running the same publication checks the editor uses. Created as a draft unless the caller is allowed to publish and asks for it.",
    risk: ordinaryWrite("questions.create", "question_bank"),
    input: emptySchema({
      type: str("Question type.", {
        enum: ["single_choice", "multiple_select", "true_false", "short_answer", "numeric", "open_ended", "assess_parts"],
      }),
      prompt: str("The question text. Supports $…$ LaTeX."),
      points: num("Marks.", { minimum: 0 }),
      difficulty: str("Difficulty.", { enum: ["easy", "medium", "hard", "competition"] }),
      topic: str("Topic label."),
      explanation: str("Worked solution shown after marking."),
      options: arr("Answer options (single/multiple choice, short answer acceptance list).", obj("An option.", {
        label: str("Option text."),
        is_correct: bool("Whether this option is part of the key."),
      }, ["label", "is_correct"])),
      numeric_answer: num("The key for a numeric question."),
      tolerance: num("Accepted numeric tolerance.", { minimum: 0 }),
      marking_criteria: str("Marking criteria for a constructed-response question."),
    }, ["type", "prompt", "points"]),
    modelHint: "Use for a single question; use create_examination for a whole paper.",
  },
  {
    name: "generate_question",
    title: "Generate a practice question",
    description:
      "Author one original question from EVALORA's deterministic, curriculum-aware families. Answers are computed, so the question is always markable and never requires a model provider.",
    risk: ordinaryWrite("questions.create", "question_bank"),
    input: emptySchema({
      topic: str("Topic key, e.g. \"linear_equations\"."),
      difficulty: str("Difficulty.", { enum: ["easy", "medium", "hard"] }),
      grade_label: str("Class/level label."),
      seed: str("Optional seed for reproducibility."),
      save: bool("Persist the question in the bank. Default false: the question is returned for review only."),
    }, ["topic"]),
    modelHint: "Use when asked for one practice item on a given topic.",
  },

  /* ─── Quizzes ───────────────────────────────────────────────────────── */
  {
    name: "list_quizzes",
    title: "List quizzes / papers",
    description: "List papers (quizzes) in the caller's organization.",
    risk: ordinary("quizzes.view", "quizzes"),
    input: emptySchema({
      status: str("Status filter.", { enum: ["draft", "published", "archived"] }),
      query: str("Text to match in the title."),
      limit: int("How many to return (1–50, default 20).", { minimum: 1, maximum: 50 }),
    }),
    modelHint: "Use to find a paper before examining or updating it.",
  },
  {
    name: "get_quiz",
    title: "Get one quiz / paper",
    description: "Return one paper with its sections, questions and marks. Keys are not included.",
    risk: ordinary("quizzes.view", "quizzes"),
    input: emptySchema({ quiz_id: uuid("The quiz id.") }, ["quiz_id"]),
    modelHint: "Use before updating or analysing a paper.",
  },
  {
    name: "create_quiz",
    title: "Create a quiz or paper",
    description:
      "Create a paper (quiz) from existing or newly generated questions, with sections, marks, duration and randomization settings. Created as a DRAFT unless publication is explicitly allowed and requested.",
    risk: ordinaryWrite("quizzes.create", "quizzes"),
    input: emptySchema({
      title: str("Title.", { maxLength: 160 }),
      description: str("Description.", { maxLength: 1000 }),
      instructions: str("Instructions for candidates.", { maxLength: 4000 }),
      grade_label: str("Class/level label."),
      subject: str("Subject name."),
      section_titles: arr("Optional section titles, in order.", str("A section title.")),
      generate: obj("Inline blueprint for questions to author for this paper.", {
        topics: arr("Topic keys.", str("Topic key.")),
        question_count: int("How many questions.", { minimum: 1, maximum: 60 }),
        difficulty_mix: obj("Difficulty mix.", {
          easy: num("Share of easy questions."),
          medium: num("Share of medium questions."),
          hard: num("Share of hard questions."),
        }),
      }),
      question_ids: arr("Existing question ids to include, in order.", uuid("A question id.")),
      randomize_questions: bool("Randomize question order per session."),
      randomize_options: bool("Randomize option order per session."),
    }, ["title"]),
    modelHint: "Use when the teacher asks for a quiz rather than a full timed examination.",
  },
  {
    name: "update_quiz",
    title: "Update a quiz or paper",
    description:
      "Update a paper's title, description, instructions, section layout or randomization settings. Question content of an attempt-locked paper is never rewritten by this tool.",
    risk: ordinaryWrite("quizzes.edit", "quizzes"),
    input: emptySchema({
      quiz_id: uuid("The quiz id."),
      title: str("New title.", { maxLength: 160 }),
      description: str("New description.", { maxLength: 1000 }),
      instructions: str("New candidate instructions.", { maxLength: 4000 }),
      randomize_questions: bool("Randomize question order."),
      randomize_options: bool("Randomize option order."),
    }, ["quiz_id"]),
    modelHint: "Use for paper metadata changes.",
  },

  /* ─── Marking ───────────────────────────────────────────────────────── */
  {
    name: "get_marking_scheme",
    title: "Get a marking scheme",
    description: "Return the marking scheme for an examination's paper: per-question marks, keys where the caller is allowed to see them, and manual-marking guidance.",
    risk: ordinary("grading.view", "examinations"),
    input: emptySchema({ examination_id: uuid("The examination id.") }, ["examination_id"]),
    modelHint: "Use before proposing marks or explaining an answer.",
  },
  {
    name: "get_student_responses",
    title: "Get candidate responses",
    description: "Return saved responses for one examination's attempts, with question ids and awarded marks. Requires grading.view.",
    risk: ordinary("grading.view", "examinations"),
    input: emptySchema({
      examination_id: uuid("The examination id."),
      attempt_id: uuid("Optional single attempt."),
      limit: int("How many attempts to read (1–100, default 20).", { minimum: 1, maximum: 100 }),
    }, ["examination_id"]),
    modelHint: "Use before proposing marks.",
  },
  {
    name: "mark_responses",
    title: "Propose marks for responses",
    description:
      "Ask the configured model for criterion marks on ONE response, capped by the question's maximum, and store the result as a PROPOSAL only. A human accepts or rejects it; this tool never writes a final mark.",
    risk: sensitive("grading.edit", "examinations"),
    input: emptySchema({
      examination_id: uuid("The examination id."),
      attempt_id: uuid("The attempt."),
      question_id: uuid("The question."),
    }, ["examination_id", "attempt_id", "question_id"]),
    modelHint: "Never claim a mark was awarded: proposals require human acceptance.",
  },

  /* ─── Grade adjustment & results ────────────────────────────────────── */
  {
    name: "preview_grade_adjustment",
    title: "Preview a grade adjustment",
    description:
      "Show what a category score adjustment would do to each candidate's total, without writing anything. Uses EVALORA's own adjustment maths and caps.",
    risk: ordinary("grading.view", "examinations"),
    input: emptySchema({
      examination_id: uuid("The examination id."),
      points: num("Points to add."),
      category_key: str("Optional criterion/category key to adjust."),
    }, ["examination_id", "points"]),
    modelHint: "Use before proposing an adjustment so the teacher sees the effect.",
  },
  {
    name: "apply_grade_adjustment",
    title: "Apply a grade adjustment",
    description:
      "Apply an authorized score adjustment through EVALORA's own audited ledger. Sensitive: requires grading.validate and, under the default policy, a recorded human approval.",
    risk: sensitive("grading.validate", "examinations"),
    input: emptySchema({
      examination_id: uuid("The examination id."),
      points: num("Points to add."),
      category_key: str("Optional criterion/category key."),
      reason: str("Why the adjustment is being made.", { maxLength: 500 }),
      confirm: bool("Must be true."),
    }, ["examination_id", "points", "reason", "confirm"]),
    modelHint: "Never call without an explicit instruction from an authorized teacher.",
  },
  {
    name: "get_exam_results",
    title: "Get examination results",
    description: "Return the result summary for one examination: per-candidate totals, percentages and publication state.",
    risk: ordinary("results.view", "examinations"),
    input: emptySchema({ examination_id: uuid("The examination id.") }, ["examination_id"]),
    modelHint: "Use for result questions; never invent a missing mark.",
  },
  {
    name: "publish_results",
    title: "Publish or unpublish results",
    description:
      "Publish or withdraw an examination's results. Sensitive: requires results.publish and validation, and under the default policy a recorded human approval.",
    risk: sensitive("results.publish", "examinations"),
    input: emptySchema({
      examination_id: uuid("The examination id."),
      publish: bool("true to publish, false to withdraw."),
      confirm: bool("Must be true."),
    }, ["examination_id", "publish", "confirm"]),
    modelHint: "Never publish results the caller did not explicitly ask to publish.",
  },

  /* ─── Analytics ─────────────────────────────────────────────────────── */
  {
    name: "get_class_statistics",
    title: "Get class statistics",
    description: "Return class-level statistics computed from stored attempts: counts, averages and pass rate. Missing data is reported as missing, never as zero.",
    risk: ordinary("reports.view", "examinations"),
    input: emptySchema({
      class_id: uuid("The class id."),
      examination_id: uuid("Optional: restrict to one examination."),
    }, ["class_id"]),
    modelHint: "Use for class performance questions.",
  },
  {
    name: "analyze_exam_performance",
    title: "Analyse an examination",
    description:
      "Analyse a marked examination from stored answers: per-question success rates, the questions candidates found hardest, and criterion breakdowns where the paper carries them. Recommendations are built only from measured data.",
    risk: ordinary("reports.view", "examinations"),
    input: emptySchema({ examination_id: uuid("The examination id.") }, ["examination_id"]),
    modelHint: "Use for \"how did the class do\" questions. Say when there is not enough data.",
  },

  /* ─── Agent administration (organization) ───────────────────────────── */
  {
    name: "list_ai_agents",
    title: "List AI agents",
    description: "List the external AI agents registered for the caller's organization, with status and last use.",
    risk: ordinary("ai.manage_agents"),
    input: emptySchema({}),
    modelHint: "Use when asked which agents can reach this workspace.",
  },
  {
    name: "revoke_ai_agent",
    title: "Revoke an AI agent",
    description: "Revoke an external agent's credential immediately. Sensitive: requires ai.manage_agents and a recorded human approval.",
    risk: sensitive("ai.manage_agents"),
    input: emptySchema({
      agent_id: uuid("The agent id."),
      reason: str("Why the credential is being revoked.", { maxLength: 500 }),
      confirm: bool("Must be true."),
    }, ["agent_id", "reason", "confirm"]),
    modelHint: "Use only when the teacher asks to disconnect an agent.",
  },
];

export const TOOL_INDEX: Record<string, ToolDefinition> = Object.fromEntries(TOOLS.map((t) => [t.name, t]));

export function getTool(name: string): ToolDefinition | null {
  return TOOL_INDEX[name] ?? null;
}

/** Names only, for a model's tool list. */
export function toolNames(): string[] {
  return TOOLS.map((t) => t.name);
}

/** The subset a caller is permitted to see, given a permission resolver. */
export function toolsForPermissions(
  allowed: (permission: string) => boolean,
): ToolDefinition[] {
  return TOOLS.filter((tool) => allowed(tool.risk.permission));
}
