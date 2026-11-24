/**
 * Central platform module catalog — the single source of truth behind
 * Super Admin "Plan & Module Management".
 *
 * Storage (additive, backward compatible):
 *   - `plans.modules`            jsonb — the plan's entitlement map
 *   - `subscriptions.modules_override` jsonb — a per-organization override
 *
 * Both columns are nullable. `null` / a missing key resolves to the module's
 * default in `MODULE_DEFAULTS` — which is `true` for every module, so the
 * feature set of every pre-existing plan (including the Institution plan
 * used by Oak International School) is unchanged until the Super Admin
 * explicitly turns something off. Zero regression by construction.
 *
 * Enforcement order (server side, never menus only):
 *   plans.modules  →  overridden by  →  subscriptions.modules_override
 * Platform-owner sessions bypass the whole map (all-true) — commerce only;
 * RLS, roles and tenant isolation still apply.
 */

export const MODULE_GROUPS = ["assessments", "quizzes", "exams", "institution"] as const;
export type ModuleGroup = (typeof MODULE_GROUPS)[number];

export interface ModuleDef {
  /** Stable identifier persisted in plans.modules / overrides. */
  key: string;
  group: ModuleGroup;
  /** English label; the admin console translates via the i18n dictionary. */
  label: string;
  description: string;
  /**
   * Capability key this module gates 1:1 in getCapabilities (when set, the
   * capability is ANDed with the module automatically — one enforcement
   * point, no per-page duplication).
   */
  capability?: string;
}

export const MODULE_CATALOG: readonly ModuleDef[] = [
  // ── Assessments & live competitions ───────────────────────────────────
  { key: "competitions", group: "assessments", label: "Competition management", description: "Create and manage live competitions and assessment events.", capability: "competitions" },
  { key: "competition_config", group: "assessments", label: "Competition configuration", description: "Event settings, formats and competition configuration screens." },
  { key: "competition_code", group: "assessments", label: "Assessment & access codes", description: "Competition join codes, access codes and code lifecycle." },
  { key: "competition_participants", group: "assessments", label: "Participants & eligibility", description: "Participant registration, eligibility and rosters." },
  { key: "competition_phases", group: "assessments", label: "Event phases", description: "Phase design, qualification review and progression." },
  { key: "competition_questions", group: "assessments", label: "Competition questions", description: "Competition question sets, pools and per-event papers." },
  { key: "competition_results", group: "assessments", label: "Rankings & results", description: "Leaderboards, rankings and competition results." },
  { key: "competition_monitoring", group: "assessments", label: "Live monitoring", description: "Real-time monitoring of running competition sessions." },
  { key: "competition_reports", group: "assessments", label: "Competition reports", description: "Competition analytics and exportable reports." },

  // ── Quizzes ───────────────────────────────────────────────────────────
  { key: "quizzes", group: "quizzes", label: "Quiz management", description: "Create, publish and operate quizzes.", capability: "quizzes" },
  { key: "paper_builder", group: "quizzes", label: "Question paper builder", description: "The existing Paper Builder workflow (single shared builder — never duplicated).", capability: "paper_builder" },
  { key: "quiz_solutions", group: "quizzes", label: "Answers & solutions", description: "Answer keys, worked solutions and review release." },
  { key: "quiz_assignment", group: "quizzes", label: "Quiz assignment", description: "Assign quizzes to classes, candidates and schedules." },
  { key: "question_bank", group: "quizzes", label: "Question management", description: "Question bank, categories, types and imports.", capability: "question_bank" },
  { key: "quiz_results", group: "quizzes", label: "Quiz results & reports", description: "Quiz result views, grading tables and exports." },

  // ── Examinations ──────────────────────────────────────────────────────
  { key: "examinations", group: "exams", label: "Examination management", description: "Create, configure and operate formal examinations.", capability: "examinations" },
  { key: "exam_links", group: "exams", label: "Exam link & expiration", description: "Personal exam links, expiry windows and link lifecycle." },
  { key: "exam_share_codes", group: "exams", label: "Share link & access code", description: "Shared links, access codes and candidate access codes." },
  { key: "exam_hints", group: "exams", label: "Examination hints", description: "Hint authoring and delivery inside a paper." },
  { key: "exam_candidate_links", group: "exams", label: "Candidate link", description: "Per-candidate invitation links." },
  { key: "exam_candidates", group: "exams", label: "Candidate management", description: "Candidate registration, rosters and access management." },
  { key: "exam_monitoring", group: "exams", label: "Monitoring & supervision", description: "Invigilation, live supervision and session oversight." },
  { key: "exam_results", group: "exams", label: "Result management", description: "Marking, grading, provisional review and result links." },
  { key: "exam_validation", group: "exams", label: "Results validation", description: "Mandatory validation step before publication." },
  { key: "exam_publication", group: "exams", label: "Results publication", description: "Publish validated results to candidates (audited)." },
  { key: "exam_reports", group: "exams", label: "Examination reports", description: "Examination reports, exports and MYP results.", capability: "myp_results" },
  { key: "exam_printable", group: "exams", label: "Printable papers", description: "Candidate-printable paper rendering." },
  { key: "exam_templates", group: "exams", label: "Official templates", description: "Official exam paper templates and headers." },
  { key: "exam_calculator", group: "exams", label: "Scientific calculator", description: "Scientific/basic calculator offered to candidates." },

  // ── Institution (existing capabilities retained) ──────────────────────
  { key: "classes", group: "institution", label: "Class management", description: "Classes and class assignments.", capability: "class_management" },
  { key: "academics", group: "institution", label: "Academic structure", description: "Academic years, terms and structures." },
  { key: "students", group: "institution", label: "Student management", description: "Student directory, registration and imports.", capability: "student_management" },
  { key: "teachers", group: "institution", label: "Teachers & staff", description: "Teacher and staff management.", capability: "teacher_management" },
  { key: "team", group: "institution", label: "Staff & members", description: "Workspace members and invitations." },
  { key: "accounts", group: "institution", label: "Accounts & permissions", description: "Roles and permissions within the organization." },
  { key: "org_settings", group: "institution", label: "Organization settings", description: "Tenant settings, branding and portal." },
  { key: "rubrics", group: "institution", label: "Rubrics", description: "Marking rubrics.", capability: "rubrics" },
  { key: "proctoring", group: "institution", label: "Proctoring", description: "Proctoring / lockdown examination supervision.", capability: "proctoring" },
  { key: "org_reports", group: "institution", label: "Results & reports", description: "Organization-wide results and reports.", capability: "reports" },
  { key: "platform", group: "institution", label: "My platform", description: "Public platform page management for the organization.", capability: "platform" },
  { key: "billing", group: "institution", label: "Billing & plan", description: "Billing, subscription and plan views.", capability: "billing" },
] as const;

export type ModuleKey = (typeof MODULE_CATALOG)[number]["key"];

export const MODULE_KEYS: readonly string[] = MODULE_CATALOG.map((m) => m.key);

/**
 * Defaults for every module. ALL TRUE: turning a module off is always an
 * explicit Super Admin decision, so existing organizations (Oak on the
 * Institution plan included) keep every feature they have today.
 */
export const MODULE_DEFAULTS: Record<string, boolean> = Object.fromEntries(
  MODULE_KEYS.map((key) => [key, true]),
);

/** key → capability it gates1:1 (for the capabilities choke point). */
export const MODULE_CAPABILITY_GATES: Record<string, string> = Object.fromEntries(
  MODULE_CATALOG.filter((m) => m.capability).map((m) => [m.key, m.capability as string]),
);

function coerceMap(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "boolean") out[k] = v;
  }
  return out;
}

/**
 * Resolve the effective module map: defaults ← plan map ← org override.
 * Unknown keys are ignored; missing keys fall back to the previous layer.
 * Pure function — safe to unit test and safe to call per request.
 */
export function resolveModules(options: {
  planModules?: unknown;
  overrideModules?: unknown;
  /** Platform-owner session: commerce entitlements never apply. */
  ownerBypass?: boolean;
}): Record<string, boolean> {
  if (options.ownerBypass) return { ...MODULE_DEFAULTS };
  const plan = coerceMap(options.planModules);
  const override = coerceMap(options.overrideModules);
  const out: Record<string, boolean> = { ...MODULE_DEFAULTS };
  for (const key of MODULE_KEYS) {
    if (key in plan) out[key] = plan[key];
    if (key in override) out[key] = override[key];
  }
  return out;
}

/** True when the module is active for the given resolved map (fail-true for unknown keys). */
export function moduleEnabled(modules: Record<string, boolean> | undefined, key: string): boolean {
  if (!modules) return true;
  if (!(key in modules)) return MODULE_DEFAULTS[key] ?? true;
  return modules[key] !== false;
}
