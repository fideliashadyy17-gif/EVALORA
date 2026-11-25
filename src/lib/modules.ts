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
  /**
   * WHERE the module appears in the organization workspace — the single
   * source of truth the sidebar derives its href→module map from
   * (src/lib/navModules.ts) and the Plan & Module Management console
   * displays, so a toggle can never promise a surface that does not exist:
   *   nav    → sidebar entry; hrefs are the destinations it controls
   *   page   → visible feature inside an organization page (href + where)
   *   admin  → Super Admin console only; the organization workspace has no UI
   *   none   → not yet available in the organization workspace (why)
   */
  surface: ModuleSurface;
}

export type ModuleSurface =
  | { kind: "nav"; hrefs: string[]; requires?: string }
  | { kind: "page"; href: string; where: string }
  | { kind: "admin"; href: string; where: string }
  | { kind: "none"; why: string };

export const MODULE_CATALOG: readonly ModuleDef[] = [
  // ── Assessments & live competitions ───────────────────────────────────
  { key: "competitions", group: "assessments", label: "Live Competitions", description: "Create and manage live competitions and assessment events (the Assessment section of the workspace).", capability: "live_competitions" , surface: {"kind": "nav", "hrefs": ["/dashboard/competitions"]} },
  { key: "competition_config", group: "assessments", label: "Competition configuration", description: "Event settings, formats and competition configuration screens." , surface: {"kind": "page", "href": "/dashboard/competitions", "where": "the New competition form and event settings"} },
  { key: "competition_code", group: "assessments", label: "Assessment Code", description: "Assessment join & access codes — shown on the Live Competitions page and its competition detail screens." , surface: {"kind": "page", "href": "/dashboard/competitions", "where": "the Admission code column, code minting and the detail-page code panel"} },
  { key: "competition_participants", group: "assessments", label: "Participants & eligibility", description: "Participant registration, eligibility and rosters." , surface: {"kind": "page", "href": "/dashboard/competitions", "where": "the participant roster on each competition detail page"} },
  { key: "competition_phases", group: "assessments", label: "Event phases", description: "Phase design, qualification review and progression." , surface: {"kind": "admin", "href": "/admin/competitions/events", "where": "event phases and qualification review"} },
  { key: "competition_questions", group: "assessments", label: "Competition questions", description: "Competition question sets, pools and per-event papers." , surface: {"kind": "admin", "href": "/admin/competitions/questions", "where": "competition question pools"} },
  { key: "competition_results", group: "assessments", label: "Rankings & results", description: "Leaderboards, rankings and competition results." , surface: {"kind": "nav", "hrefs": ["/dashboard/competitions/rankings"], "requires": "competitions"} },
  { key: "competition_monitoring", group: "assessments", label: "Live monitoring", description: "Real-time monitoring of running competition sessions." , surface: {"kind": "admin", "href": "/admin/competitions/live", "where": "live monitoring"} },
  { key: "competition_reports", group: "assessments", label: "Competition reports", description: "Competition analytics and exportable reports." , surface: {"kind": "admin", "href": "/admin/competitions/reports", "where": "competition reports"} },

  // ── Quizzes ───────────────────────────────────────────────────────────
  { key: "quizzes", group: "quizzes", label: "Quiz management", description: "Create, publish and operate quizzes.", capability: "quiz_management" , surface: {"kind": "nav", "hrefs": ["/dashboard/quizzes"]} },
  { key: "paper_builder", group: "quizzes", label: "Question Paper Builder", description: "The existing Paper Builder workflow (single shared builder — never duplicated).", capability: "question_paper_builder" , surface: {"kind": "nav", "hrefs": ["/dashboard/paper-builder"]} },
  { key: "quiz_solutions", group: "quizzes", label: "Answers & solutions", description: "Answer keys, worked solutions and review release." , surface: {"kind": "none", "why": "answer keys and solution release are not yet wired to an organization surface"} },
  { key: "quiz_assignment", group: "quizzes", label: "Quiz assignment", description: "Assign quizzes to classes, candidates and schedules." , surface: {"kind": "admin", "href": "/admin/quizzes/assignments", "where": "quiz assignments"} },
  { key: "question_bank", group: "quizzes", label: "Question management", description: "Question bank, categories, types and imports.", capability: "question_bank" , surface: {"kind": "nav", "hrefs": ["/dashboard/questions"]} },
  { key: "quiz_results", group: "quizzes", label: "Quiz results & reports", description: "Quiz result views, grading tables and exports." , surface: {"kind": "admin", "href": "/admin/quizzes/results", "where": "quiz results and leaderboards"} },

  // ── Examinations ──────────────────────────────────────────────────────
  { key: "examinations", group: "exams", label: "Examination management", description: "Create, configure and operate formal examinations.", capability: "examinations" , surface: {"kind": "nav", "hrefs": ["/dashboard/exams", "/dashboard/formulas", "/dashboard/grading"]} },
  { key: "exam_links", group: "exams", label: "Exam link & expiration", description: "Personal exam links, expiry windows and link lifecycle." , surface: {"kind": "none", "why": "personal exam-link lifecycle is not yet wired to an organization surface (candidate links live in Results Management)"} },
  { key: "exam_share_codes", group: "exams", label: "Share link & access code", description: "Shared links, access codes and candidate access codes." , surface: {"kind": "page", "href": "/dashboard/exams", "where": "share links and access codes on examination actions"} },
  { key: "exam_hints", group: "exams", label: "Examination hints", description: "Hint authoring and delivery inside a paper." , surface: {"kind": "none", "why": "hint authoring is not yet wired to an organization surface"} },
  { key: "exam_candidate_links", group: "exams", label: "Candidate link", description: "Per-candidate invitation links." , surface: {"kind": "none", "why": "part of Results Management and Candidate Links - configure exam_results instead"} },
  { key: "exam_candidates", group: "exams", label: "Candidate management", description: "Candidate registration, rosters and access management." , surface: {"kind": "page", "href": "/dashboard/exams", "where": "candidate registration and rosters inside an examination"} },
  { key: "exam_monitoring", group: "exams", label: "Monitoring & supervision", description: "Invigilation, live supervision and session oversight." , surface: {"kind": "page", "href": "/dashboard/exams", "where": "the monitor route for a running examination"} },
  { key: "exam_results", group: "exams", label: "Results Management & Candidate Links", description: "Marking, grading, provisional review, score validation, publication and individual candidate result links." , surface: {"kind": "nav", "hrefs": ["/dashboard/results"]} },
  { key: "exam_validation", group: "exams", label: "Results validation", description: "Mandatory validation step before publication." , surface: {"kind": "page", "href": "/dashboard/exams", "where": "the mandatory validation step before publication"} },
  { key: "exam_publication", group: "exams", label: "Results publication", description: "Publish validated results to candidates (audited)." , surface: {"kind": "page", "href": "/dashboard/exams", "where": "results publication actions"} },
  { key: "exam_reports", group: "exams", label: "MYP Results", description: "Examination reports, exports and MYP results (MYP Results pages)." , surface: {"kind": "nav", "hrefs": ["/dashboard/myp-results"]} },
  { key: "exam_printable", group: "exams", label: "Printable papers", description: "Candidate-printable paper rendering." , surface: {"kind": "page", "href": "/dashboard/exams", "where": "the candidate printable paper route"} },
  { key: "exam_templates", group: "exams", label: "Official templates", description: "Official exam paper templates and headers." , surface: {"kind": "page", "href": "/dashboard/settings/templates", "where": "examination paper templates"} },
  { key: "exam_calculator", group: "exams", label: "Scientific calculator", description: "Scientific/basic calculator offered to candidates." , surface: {"kind": "page", "href": "/dashboard/exams", "where": "the calculator option when creating an examination"} },

  // ── Institution (existing capabilities retained) ──────────────────────
  { key: "classes", group: "institution", label: "Class management", description: "Classes and class assignments.", capability: "class_management" , surface: {"kind": "nav", "hrefs": ["/dashboard/academics/classes"]} },
  { key: "academics", group: "institution", label: "Academic structure", description: "Academic years, terms and structures." , surface: {"kind": "nav", "hrefs": ["/dashboard/academics"]} },
  { key: "students", group: "institution", label: "Student management", description: "Student directory, registration and imports.", capability: "student_management" , surface: {"kind": "nav", "hrefs": ["/dashboard/students"]} },
  { key: "teachers", group: "institution", label: "Teachers", description: "Teacher and staff management (Teachers page)." , surface: {"kind": "nav", "hrefs": ["/dashboard/teachers"]} },
  { key: "team", group: "institution", label: "Staff & members", description: "Workspace members and invitations." , surface: {"kind": "nav", "hrefs": ["/dashboard/team"]} },
  { key: "accounts", group: "institution", label: "Accounts & permissions", description: "Roles, accounts, and RBAC access management within the organization." , surface: {"kind": "nav", "hrefs": ["/dashboard/accounts", "/dashboard/rbac"]} },
  { key: "org_settings", group: "institution", label: "Organization settings", description: "Tenant settings, branding and portal." , surface: {"kind": "nav", "hrefs": ["/dashboard/settings"]} },
  { key: "rubrics", group: "institution", label: "Rubrics", description: "Marking rubrics (Rubrics page)." , surface: {"kind": "nav", "hrefs": ["/dashboard/rubrics"]} },
  { key: "proctoring", group: "institution", label: "Proctoring", description: "Proctoring / lockdown examination supervision.", capability: "proctoring" , surface: {"kind": "nav", "hrefs": ["/dashboard/proctoring"]} },
  { key: "org_reports", group: "institution", label: "Results & Reports", description: "Organization-wide results and reports (Results & Reports page).", capability: "reports_analytics" , surface: {"kind": "nav", "hrefs": ["/dashboard/reports"]} },
  { key: "platform", group: "institution", label: "My Platform", description: "Public platform page management for the organization (My Platform page)." , surface: {"kind": "nav", "hrefs": ["/dashboard/platform"]} },
  { key: "billing", group: "institution", label: "Billing & Plan", description: "Billing, subscription and plan views (Billing & Plan page)." , surface: {"kind": "nav", "hrefs": ["/dashboard/billing"]} },
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

/**
 * Configured vs effective state for ONE module — the single rule used by the
 * Super Admin console, the workspace navigation and the tests, so the UI can
 * never disagree with enforcement:
 *
 *   INHERIT → effective = organization's plan value, else PLATFORM DEFAULT
 *   ON      → enabled (stored on this subscription only)
 *   OFF     → disabled (even when the plan includes it)
 *
 * `configured` is what the admin chose; `effective` is what the organization
 * actually gets; `source` explains where the effective value came from.
 * Overrides only exist on a VALID active/trialing subscription — getEntitlement
 * stops reading them once the subscription lapses (free plan applies).
 */
export type ModuleConfiguredState = "inherit" | "on" | "off";
export type ModuleEntitlementSource = "plan" | "override" | "default";

export interface EffectiveModuleState {
  configured: ModuleConfiguredState;
  effective: boolean;
  source: ModuleEntitlementSource;
}

export function resolveEffectiveModule(
  planModules: Record<string, boolean> | null | undefined,
  overrideModules: Record<string, boolean> | null | undefined,
  key: string,
): EffectiveModuleState {
  const override = overrideModules && typeof overrideModules === "object" && !Array.isArray(overrideModules) ? overrideModules : null;
  const plan = planModules && typeof planModules === "object" && !Array.isArray(planModules) ? planModules : null;
  if (override && key in override) {
    const value = override[key] === true;
    return { configured: value ? "on" : "off", effective: value, source: "override" };
  }
  if (plan && key in plan) {
    return { configured: "inherit", effective: plan[key] === true, source: "plan" };
  }
  return { configured: "inherit", effective: MODULE_DEFAULTS[key] ?? true, source: "default" };
}

/** Effective state for every catalog module (admin console rendering). */
export function resolveEffectiveModules(
  planModules: Record<string, boolean> | null | undefined,
  overrideModules: Record<string, boolean> | null | undefined,
): Record<string, EffectiveModuleState> {
  const out: Record<string, EffectiveModuleState> = {};
  for (const { key } of MODULE_CATALOG) out[key] = resolveEffectiveModule(planModules, overrideModules, key);
  return out;
}

/** key → capability it gates 1:1 (for the capabilities choke point).
 *  ONLY real CapabilityKeys from capability-rules.ts — a phantom key here
 *  would silently disable nothing while the nav hid the module (the exact
 *  navigation/authorization divergence this mapping exists to prevent). */
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
