/**
 * Central platform module catalog — the single source of truth behind
 * Super Admin "Plan & Module Management", dynamic organization workspace
 * navigation, server-side entitlement guards, and operational availability
 * reporting.
 *
 * Storage (additive, backward compatible):
 *   - `plans.modules`                 jsonb — the plan's entitlement map
 *   - `subscriptions.modules_override` jsonb — a per-organization override
 *
 * Enforcement order (server side, never menus only):
 *   plans.modules  →  overridden by  →  subscriptions.modules_override
 * Platform-owner sessions bypass the whole map (all-true) — commerce only;
 * RLS, roles and tenant isolation still apply. Global platform super-admin
 * tools (tenant creation, global subscriptions, global security) are strictly
 * outside this catalog and are never granted to any customer plan.
 */

export const MODULE_GROUPS = ["assessments", "quizzes", "exams", "institution"] as const;
export type ModuleGroup = (typeof MODULE_GROUPS)[number];

export type PlanTier = "free" | "premium" | "institution";

/**
 * Honest operational readiness for each module:
 *  - implemented          → fully built and operational in the org workspace
 *  - external_dependency  → org workflow is implemented; specific live media/
 *                           third-party features require configured server
 *                           infrastructure (e.g. LiveKit credentials)
 *  - not_implemented      → not yet built; MUST NEVER be reported as
 *                           operationally enabled even if toggled on
 */
export type ModuleAvailability = "implemented" | "external_dependency" | "not_implemented";

export interface ModuleDef {
  /** Stable identifier persisted in plans.modules / overrides. */
  key: string;
  group: ModuleGroup;
  /** English label; the admin console translates via the i18n dictionary. */
  label: string;
  description: string;
  /** Minimum subscription tier in the canonical EVALORA plan hierarchy. */
  recommendedPlan: PlanTier;
  /** Honest implementation / operational readiness status. */
  availability: ModuleAvailability;
  /** Exact external infrastructure requirement when availability is external_dependency. */
  externalDependency?: string;
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
  {
    key: "competitions",
    group: "assessments",
    label: "Live Competitions",
    description: "Create and manage live competitions and assessment events (the Assessment section of the workspace).",
    recommendedPlan: "institution",
    availability: "implemented",
    capability: "live_competitions",
    surface: { kind: "nav", hrefs: ["/dashboard/competitions"] },
  },
  {
    key: "competition_config",
    group: "assessments",
    label: "Competition configuration",
    description: "Event settings, formats and competition configuration screens.",
    recommendedPlan: "institution",
    availability: "implemented",
    surface: { kind: "page", href: "/dashboard/competitions", where: "the New competition form and event settings" },
  },
  {
    key: "competition_code",
    group: "assessments",
    label: "Assessment Code",
    description: "Assessment join & access codes — shown on the Live Competitions page and its competition detail screens.",
    recommendedPlan: "institution",
    availability: "implemented",
    surface: { kind: "page", href: "/dashboard/competitions", where: "the Admission code column, code minting and the detail-page code panel" },
  },
  {
    key: "competition_participants",
    group: "assessments",
    label: "Participants & eligibility",
    description: "Participant registration, eligibility and rosters.",
    recommendedPlan: "institution",
    availability: "implemented",
    surface: { kind: "page", href: "/dashboard/competitions", where: "the participant roster on each competition detail page" },
  },
  {
    key: "competition_phases",
    group: "assessments",
    label: "Event phases",
    description: "Phase design, qualification review and progression inside Live Competitions.",
    recommendedPlan: "institution",
    availability: "implemented",
    surface: { kind: "page", href: "/dashboard/competitions", where: "Event phases & qualification progression on each competition detail page" },
  },
  {
    key: "competition_questions",
    group: "assessments",
    label: "Competition questions",
    description: "Competition question sets, attached pools and mark allocations.",
    recommendedPlan: "institution",
    availability: "implemented",
    surface: { kind: "page", href: "/dashboard/competitions", where: "the attached question pool and mark breakdown on each competition detail page" },
  },
  {
    key: "competition_results",
    group: "assessments",
    label: "Rankings & results",
    description: "Leaderboards, rankings and competition results.",
    recommendedPlan: "institution",
    availability: "implemented",
    surface: { kind: "nav", hrefs: ["/dashboard/competitions/rankings"], requires: "competitions" },
  },
  {
    key: "competition_monitoring",
    group: "assessments",
    label: "Live monitoring",
    description: "Real-time monitoring and host control launch for running competition sessions.",
    recommendedPlan: "institution",
    availability: "implemented",
    surface: { kind: "page", href: "/dashboard/competitions", where: "live session status and host monitoring controls on each competition detail page" },
  },
  {
    key: "competition_reports",
    group: "assessments",
    label: "Competition reports",
    description: "Competition analytics, completion metrics and exportable session reports.",
    recommendedPlan: "institution",
    availability: "implemented",
    surface: { kind: "page", href: "/dashboard/competitions", where: "competition analytics and report summaries on each competition detail page" },
  },

  // ── Quizzes ───────────────────────────────────────────────────────────
  {
    key: "quizzes",
    group: "quizzes",
    label: "Quiz management",
    description: "Create, publish and operate quizzes.",
    recommendedPlan: "free",
    availability: "implemented",
    capability: "quiz_management",
    surface: { kind: "nav", hrefs: ["/dashboard/quizzes"] },
  },
  {
    key: "paper_builder",
    group: "quizzes",
    label: "Question Paper Builder",
    description: "The existing Paper Builder workflow (single shared builder — never duplicated).",
    recommendedPlan: "premium",
    availability: "implemented",
    capability: "question_paper_builder",
    surface: { kind: "nav", hrefs: ["/dashboard/paper-builder"] },
  },
  {
    key: "quiz_solutions",
    group: "quizzes",
    label: "Answers & solutions",
    description: "Answer keys, worked solutions and controlled review release on quiz detail pages.",
    recommendedPlan: "premium",
    availability: "implemented",
    surface: { kind: "page", href: "/dashboard/quizzes", where: "Answers & Solutions key review and release settings on each quiz page" },
  },
  {
    key: "quiz_assignment",
    group: "quizzes",
    label: "Quiz assignment",
    description: "Assign quizzes to classes, cohorts and scheduled delivery windows.",
    recommendedPlan: "premium",
    availability: "implemented",
    surface: { kind: "page", href: "/dashboard/quizzes", where: "class and schedule assignment controls on each quiz page" },
  },
  {
    key: "question_bank",
    group: "quizzes",
    label: "Question management",
    description: "Question bank, categories, types and imports.",
    recommendedPlan: "free",
    availability: "implemented",
    capability: "question_bank",
    surface: { kind: "nav", hrefs: ["/dashboard/questions"] },
  },
  {
    key: "quiz_results",
    group: "quizzes",
    label: "Quiz results & reports",
    description: "Quiz session results, participant score summaries and session reports.",
    recommendedPlan: "free",
    availability: "implemented",
    surface: { kind: "page", href: "/dashboard/quizzes", where: "quiz session history, scores and report links on each quiz page" },
  },

  // ── Examinations ──────────────────────────────────────────────────────
  {
    key: "examinations",
    group: "exams",
    label: "Examination management",
    description: "Create, configure and operate formal examinations.",
    recommendedPlan: "free",
    availability: "implemented",
    capability: "examinations",
    surface: { kind: "nav", hrefs: ["/dashboard/exams", "/dashboard/formulas", "/dashboard/grading"] },
  },
  {
    key: "exam_links",
    group: "exams",
    label: "Exam link & expiration",
    description: "Examination invitation links, activation/expiry windows and link lifecycle controls.",
    recommendedPlan: "premium",
    availability: "implemented",
    surface: { kind: "page", href: "/dashboard/exams", where: "Exam Link & Expiration lifecycle controls (/dashboard/exams/links and each examination page)" },
  },
  {
    key: "exam_share_codes",
    group: "exams",
    label: "Share link & access code",
    description: "Shared links, access codes and candidate admission codes.",
    recommendedPlan: "premium",
    availability: "implemented",
    surface: { kind: "page", href: "/dashboard/exams", where: "share links and access codes on examination actions" },
  },
  {
    key: "exam_hints",
    group: "exams",
    label: "Examination hints",
    description: "Guided hint authoring, leak checks and controlled publication inside an examination.",
    recommendedPlan: "premium",
    availability: "implemented",
    surface: { kind: "page", href: "/dashboard/exams", where: "Examination Hints authoring and publishing (/dashboard/exams/[id]/hints)" },
  },
  {
    key: "exam_candidate_links",
    group: "exams",
    label: "Candidate link",
    description: "Per-candidate direct admission links, access codes and published result links.",
    recommendedPlan: "premium",
    availability: "implemented",
    surface: { kind: "page", href: "/dashboard/exams", where: "per-candidate admission and result links inside each examination and Results Management" },
  },
  {
    key: "exam_candidates",
    group: "exams",
    label: "Candidate management",
    description: "Candidate registration, rosters and access management.",
    recommendedPlan: "free",
    availability: "implemented",
    surface: { kind: "page", href: "/dashboard/exams", where: "candidate registration and rosters inside an examination" },
  },
  {
    key: "exam_monitoring",
    group: "exams",
    label: "Monitoring & supervision",
    description: "Live examination dashboard, real-time candidate progress, time extensions, pause/resume, retake authorization and intervention history.",
    recommendedPlan: "premium",
    availability: "implemented",
    surface: { kind: "nav", hrefs: ["/dashboard/monitoring"] },
  },
  { key: "exam_results", group: "exams", label: "Results Management & Candidate Links", description: "Marking, grading, provisional review, score validation, publication and individual candidate result links.", recommendedPlan: "free", availability: "implemented", surface: { kind: "nav", hrefs: ["/dashboard/results"] } },
  {
    key: "exam_validation",
    group: "exams",
    label: "Results validation",
    description: "Mandatory validation step before publication.",
    recommendedPlan: "premium",
    availability: "implemented",
    surface: { kind: "page", href: "/dashboard/exams", where: "the mandatory validation step before publication" },
  },
  {
    key: "exam_publication",
    group: "exams",
    label: "Results publication",
    description: "Publish validated results to candidates (audited).",
    recommendedPlan: "free",
    availability: "implemented",
    surface: { kind: "page", href: "/dashboard/exams", where: "results publication actions" },
  },
  {
    key: "exam_reports",
    group: "exams",
    label: "MYP Results",
    description: "Examination reports, exports and MYP results (MYP Results pages).",
    recommendedPlan: "institution",
    availability: "implemented",
    surface: { kind: "nav", hrefs: ["/dashboard/myp-results"] },
  },
  {
    key: "exam_printable",
    group: "exams",
    label: "Printable papers",
    description: "Candidate-printable paper rendering.",
    recommendedPlan: "premium",
    availability: "implemented",
    surface: { kind: "page", href: "/dashboard/exams", where: "the candidate printable paper route" },
  },
  {
    key: "exam_templates",
    group: "exams",
    label: "Official templates",
    description: "Official exam paper templates and institutional headers.",
    recommendedPlan: "institution",
    availability: "implemented",
    surface: { kind: "page", href: "/dashboard/settings/templates", where: "examination paper templates" },
  },
  {
    key: "exam_calculator",
    group: "exams",
    label: "Scientific calculator",
    description: "Scientific/basic calculator offered to candidates.",
    recommendedPlan: "premium",
    availability: "implemented",
    surface: { kind: "page", href: "/dashboard/exams", where: "the calculator option when creating an examination" },
  },

  // ── Institution (existing capabilities retained) ──────────────────────
  {
    key: "classes",
    group: "institution",
    label: "Class management",
    description: "Classes and class assignments.",
    recommendedPlan: "free",
    availability: "implemented",
    capability: "class_management",
    surface: { kind: "nav", hrefs: ["/dashboard/academics/classes"] },
  },
  {
    key: "academics",
    group: "institution",
    label: "Academic structure",
    description: "Academic years, terms, departments, subjects and structures.",
    recommendedPlan: "institution",
    availability: "implemented",
    surface: { kind: "nav", hrefs: ["/dashboard/academics"] },
  },
  {
    key: "students",
    group: "institution",
    label: "Student management",
    description: "Student directory, registration and imports.",
    recommendedPlan: "free",
    availability: "implemented",
    capability: "student_management",
    surface: { kind: "nav", hrefs: ["/dashboard/students"] },
  },
  {
    key: "teachers",
    group: "institution",
    label: "Teachers",
    description: "Teacher and staff management (Teachers page).",
    recommendedPlan: "institution",
    availability: "implemented",
    surface: { kind: "nav", hrefs: ["/dashboard/teachers"] },
  },
  {
    key: "team",
    group: "institution",
    label: "Staff & members",
    description: "Workspace members and invitations.",
    recommendedPlan: "free",
    availability: "implemented",
    surface: { kind: "nav", hrefs: ["/dashboard/team"] },
  },
  {
    key: "accounts",
    group: "institution",
    label: "Accounts & permissions",
    description: "Roles, accounts, and RBAC access management within the organization.",
    recommendedPlan: "institution",
    availability: "implemented",
    surface: { kind: "nav", hrefs: ["/dashboard/accounts", "/dashboard/rbac"] },
  },
  {
    key: "org_settings",
    group: "institution",
    label: "Organization settings",
    description: "Tenant settings, branding and portal.",
    recommendedPlan: "free",
    availability: "implemented",
    surface: { kind: "nav", hrefs: ["/dashboard/settings"] },
  },
  {
    key: "rubrics",
    group: "institution",
    label: "Rubrics",
    description: "Marking rubrics (Rubrics page).",
    recommendedPlan: "premium",
    availability: "implemented",
    surface: { kind: "nav", hrefs: ["/dashboard/rubrics"] },
  },
  {
    key: "proctoring",
    group: "institution",
    label: "Proctoring",
    description: "Proctoring rooms, live video supervision, incident review ledger and recordings.",
    recommendedPlan: "premium",
    availability: "external_dependency",
    externalDependency:
      "LiveKit server credentials (LIVEKIT_API_KEY, LIVEKIT_API_SECRET, NEXT_PUBLIC_LIVEKIT_URL) are required for live video/screen rooms; incident logging, review workflows, retention policies and evidence ledger operate natively via Supabase.",
    capability: "proctoring",
    surface: { kind: "nav", hrefs: ["/dashboard/proctoring"] },
  },
  {
    key: "org_reports",
    group: "institution",
    label: "Results & Reports",
    description: "Organization-wide results, analytics and exportable reports (Results & Reports page).",
    recommendedPlan: "premium",
    availability: "implemented",
    capability: "reports_analytics",
    surface: { kind: "nav", hrefs: ["/dashboard/reports"] },
  },
  {
    key: "platform",
    group: "institution",
    label: "My Platform",
    description: "Public platform page management for the organization (My Platform page).",
    recommendedPlan: "institution",
    availability: "implemented",
    surface: { kind: "nav", hrefs: ["/dashboard/platform"] },
  },
  {
    key: "billing",
    group: "institution",
    label: "Billing & Plan",
    description: "Billing, subscription and plan views (Billing & Plan page).",
    recommendedPlan: "free",
    availability: "implemented",
    surface: { kind: "nav", hrefs: ["/dashboard/billing"] },
  },
] as const;

export type ModuleKey = (typeof MODULE_CATALOG)[number]["key"];

export const MODULE_KEYS: readonly string[] = MODULE_CATALOG.map((m) => m.key);

/**
 * Defaults for every module when a plan has not yet persisted an explicit map.
 * Kept ALL TRUE for zero-regression compatibility with legacy plans; canonical
 * Free / Premium / Institution plans persist explicit differentiated maps in
 * `public.plans.modules` (see `PLAN_MODULE_TEMPLATES`).
 */
export const MODULE_DEFAULTS: Record<string, boolean> = Object.fromEntries(
  MODULE_KEYS.map((key) => [key, true]),
);

const TIER_ORDER: Record<PlanTier, number> = {
  free: 0,
  premium: 1,
  institution: 2,
};

/**
 * Canonical differentiated module matrices for Free, Premium and Institution.
 * Used for database migrations, Super Admin plan presets, and verification.
 */
export const PLAN_MODULE_TEMPLATES: Record<PlanTier, Record<string, boolean>> = {
  free: Object.fromEntries(
    MODULE_CATALOG.map((m) => [m.key, TIER_ORDER[m.recommendedPlan] <= TIER_ORDER.free]),
  ),
  premium: Object.fromEntries(
    MODULE_CATALOG.map((m) => [m.key, TIER_ORDER[m.recommendedPlan] <= TIER_ORDER.premium]),
  ),
  institution: Object.fromEntries(
    MODULE_CATALOG.map((m) => [m.key, TIER_ORDER[m.recommendedPlan] <= TIER_ORDER.institution]),
  ),
};

/** Recommended module map for a plan slug (falls back to Institution for unknown custom enterprise tiers). */
export function recommendedModulesForPlan(slug: string): Record<string, boolean> {
  if (slug === "free") return { ...PLAN_MODULE_TEMPLATES.free };
  if (slug === "premium") return { ...PLAN_MODULE_TEMPLATES.premium };
  return { ...PLAN_MODULE_TEMPLATES.institution };
}

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
 */
export type ModuleConfiguredState = "inherit" | "on" | "off";
export type ModuleEntitlementSource = "plan" | "override" | "default";

export interface EffectiveModuleState {
  configured: ModuleConfiguredState;
  effective: boolean;
  source: ModuleEntitlementSource;
}

export interface ModuleOperationalState extends EffectiveModuleState {
  availability: ModuleAvailability;
  /** True only when BOTH entitled (`effective`) AND actually implemented (`availability !== "not_implemented"` and `surface.kind !== "none"`). */
  operationallyAvailable: boolean;
  externalDependency?: string;
  externalInfrastructureReady?: boolean;
}

export function resolveEffectiveModule(
  planModules: Record<string, boolean> | null | undefined,
  overrideModules: Record<string, boolean> | null | undefined,
  key: string,
): EffectiveModuleState {
  const plan = coerceMap(planModules);
  const override = coerceMap(overrideModules);
  if (override && key in override) {
    const value = override[key] === true;
    return { configured: value ? "on" : "off", effective: value, source: "override" };
  }
  if (plan && key in plan) {
    return { configured: "inherit", effective: plan[key] === true, source: "plan" };
  }
  return { configured: "inherit", effective: MODULE_DEFAULTS[key] ?? true, source: "default" };
}

/**
 * Combines commercial entitlement with honest implementation/infrastructure
 * readiness so an unimplemented module is NEVER reported as operationally enabled.
 */
export function resolveModuleOperationalState(
  planModules: Record<string, boolean> | null | undefined,
  overrideModules: Record<string, boolean> | null | undefined,
  key: string,
  infra?: { livekitConfigured?: boolean },
): ModuleOperationalState {
  const base = resolveEffectiveModule(planModules, overrideModules, key);
  const def = MODULE_CATALOG.find((m) => m.key === key);
  const availability: ModuleAvailability = def?.availability ?? "not_implemented";
  const hasOrgSurface = Boolean(def && def.surface.kind !== "none" && def.surface.kind !== "admin");
  const operationallyAvailable = base.effective && availability !== "not_implemented" && hasOrgSurface;
  return {
    ...base,
    availability,
    operationallyAvailable,
    externalDependency: def?.externalDependency,
    externalInfrastructureReady:
      key === "proctoring" ? Boolean(infra?.livekitConfigured) : undefined,
  };
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
