"use client";

/**
 * Plan & Module Management console.
 *
 * Three synchronized views backed directly by Supabase:
 *  1. Plan Coverage Overview — dynamically calculated saved coverage for
 *     Free / Premium / Institution (e.g. 12/41 29.27%, 26/41 63.41%, 41/41 100%)
 *     with visual progress indicators.
 *  2. Plans × Modules Matrix — fully controlled checkboxes bound 1:1 to saved
 *     `plans.modules` booleans, clearly separating Plan Inclusion styling from
 *     Technical Implementation Status, plus exact Organization Workspace Location.
 *  3. Organization Overrides — fully controlled tri-state (inherit / on / off)
 *     on `subscriptions.modules_override`, distinguishing Inherited from plan,
 *     Explicitly enabled, Explicitly disabled, Operational availability, and
 *     actual Organization Workspace Location.
 */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, EmptyState } from "@/components/ui";
import { useI18n } from "@/components/i18n/I18nProvider";
import {
  MODULE_GROUPS,
  computeOverrideBreakdown,
  computePlanCoverage,
  computeSelectionCoverage,
  resolveModuleOperationalState,
  resolvePlanModuleIncluded,
  type ModuleAvailability,
  type ModuleConfiguredState,
  type ModuleEntitlementSource,
  type ModuleGroup,
  type ModuleSurface,
  type PlanTier,
} from "@/lib/modules";
import {
  applyRecommendedPlanModules,
  savePlanModules,
  saveSubscriptionModules,
} from "./actions";
import { cn } from "@/lib/utils";

export interface PlanRow {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  priceMonthlyCents?: number;
  priceYearlyCents?: number;
  currency?: string;
  limits?: Record<string, unknown> | null;
  modules: Record<string, boolean> | null;
  isActive?: boolean;
  subscriberCount: number;
}

export interface SubRow {
  id: string;
  organization_id: string;
  organizationName: string;
  organizationSlug?: string;
  status: string;
  source?: string;
  currentPeriodEnd?: string | null;
  trialEndsAt?: string | null;
  planName: string;
  planSlug: string;
  /** The assigned plan's module map — the INHERIT source of truth. */
  planModules: Record<string, boolean> | null;
  modulesOverride: Record<string, boolean> | null;
}

export interface CatalogRow {
  key: string;
  group: ModuleGroup;
  label: string;
  description: string;
  recommendedPlan?: PlanTier;
  availability?: ModuleAvailability;
  externalDependency?: string;
  /** Verified organization dashboard navigation path. */
  workspacePath: string;
  /** Optional Super Admin reference route strictly under `/admin/*`. */
  adminReferenceHref?: string;
  /** Where this module actually appears — never promise a phantom surface. */
  surface: ModuleSurface;
}

const GROUP_LABEL_KEY: Record<ModuleGroup, string> = {
  assessments: "nav.assessments",
  quizzes: "nav.quizzes",
  exams: "nav.examinations",
  institution: "nav.institutionalManagement",
};

const TIER_LABEL: Record<PlanTier, string> = {
  free: "Free+",
  premium: "Premium+",
  institution: "Institution",
};

function fmtLimit(val: unknown): string {
  if (val === -1) return "Unlimited";
  if (typeof val === "number") return String(val);
  if (typeof val === "boolean") return val ? "Included" : "Off";
  return "—";
}

function fmtShortDate(iso: string | null | undefined): string {
  if (!iso) return "No end date";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function buildPlanDraft(
  plan: PlanRow | undefined,
  catalog: CatalogRow[],
): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const m of catalog) {
    out[m.key] = resolvePlanModuleIncluded(plan?.modules, m.key);
  }
  return out;
}

function buildOverrideDraft(
  sub: SubRow | undefined,
  catalog: CatalogRow[],
): Record<string, ModuleConfiguredState> {
  const out: Record<string, ModuleConfiguredState> = {};
  const overrides = sub?.modulesOverride ?? null;
  for (const m of catalog) {
    if (overrides && m.key in overrides) {
      out[m.key] = overrides[m.key] === true ? "on" : "off";
    } else {
      out[m.key] = "inherit";
    }
  }
  return out;
}

function draftOverridesToMap(
  draft: Record<string, ModuleConfiguredState>,
): Record<string, boolean> | null {
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(draft)) {
    if (v === "on") out[k] = true;
    else if (v === "off") out[k] = false;
  }
  return Object.keys(out).length > 0 ? out : null;
}

function primaryOrgRoute(surface: ModuleSurface): string | null {
  if (surface.kind === "nav") return surface.hrefs.join(" · ");
  if (surface.kind === "page") return surface.href;
  return null;
}

export function PlanModulesAdminClient({
  plans,
  subs,
  catalog,
  livekitConfigured = false,
  livekitHost = null,
  livekitMissing = [],
  initialPlanId,
  initialSubId,
}: {
  plans: PlanRow[];
  subs: SubRow[];
  catalog: CatalogRow[];
  livekitConfigured?: boolean;
  livekitHost?: string | null;
  livekitMissing?: string[];
  initialPlanId?: string;
  initialSubId?: string;
}) {
  const { t } = useI18n();
  const [planId, setPlanId] = useState(initialPlanId ?? plans[0]?.id ?? "");
  const [subId, setSubId] = useState(initialSubId ?? subs[0]?.id ?? "");

  // Keep selected plan/sub in sync when URL searchParams change after server redirect.
  useEffect(() => {
    if (initialPlanId && plans.some((p) => p.id === initialPlanId)) {
      setPlanId(initialPlanId);
    }
  }, [initialPlanId, plans]);

  useEffect(() => {
    if (initialSubId && subs.some((s) => s.id === initialSubId)) {
      setSubId(initialSubId);
    }
  }, [initialSubId, subs]);

  const plan = plans.find((p) => p.id === planId) ?? plans[0];
  const sub = subs.find((s) => s.id === subId);

  // Fully controlled checkbox state for Panel 1, always re-synchronized to the
  // persisted Supabase `plans.modules` whenever the plan or its saved map changes.
  const savedPlanSignature = useMemo(
    () => `${plan?.id ?? ""}:${JSON.stringify(plan?.modules ?? null)}`,
    [plan?.id, plan?.modules],
  );
  const [draftModules, setDraftModules] = useState<Record<string, boolean>>(() =>
    buildPlanDraft(plan, catalog),
  );
  useEffect(() => {
    setDraftModules(buildPlanDraft(plan, catalog));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedPlanSignature]);

  // Fully controlled tri-state override selectors for Panel 2, always synchronized
  // with persisted `subscriptions.modules_override`.
  const savedSubSignature = useMemo(
    () => `${sub?.id ?? ""}:${JSON.stringify(sub?.modulesOverride ?? null)}:${JSON.stringify(sub?.planModules ?? null)}`,
    [sub?.id, sub?.modulesOverride, sub?.planModules],
  );
  const [draftOverrides, setDraftOverrides] = useState<Record<string, ModuleConfiguredState>>(() =>
    buildOverrideDraft(sub, catalog),
  );
  useEffect(() => {
    setDraftOverrides(buildOverrideDraft(sub, catalog));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedSubSignature]);

  const grouped = useMemo(() => {
    const map = new Map<ModuleGroup, CatalogRow[]>();
    for (const m of catalog) {
      const list = map.get(m.group) ?? [];
      list.push(m);
      map.set(m.group, list);
    }
    return map;
  }, [catalog]);

  const planCustom = plan?.modules != null;
  const savedPlanCoverage = useMemo(
    () => computePlanCoverage(plan?.modules),
    [plan?.modules],
  );
  const draftPlanCoverage = useMemo(
    () => computeSelectionCoverage(draftModules),
    [draftModules],
  );
  const hasUnsavedPlanChanges = useMemo(
    () =>
      catalog.some(
        (m) =>
          (draftModules[m.key] ?? false) !==
          resolvePlanModuleIncluded(plan?.modules, m.key),
      ),
    [catalog, draftModules, plan?.modules],
  );

  const effectiveOverrideMap = useMemo(
    () => draftOverridesToMap(draftOverrides),
    [draftOverrides],
  );
  const subBreakdown = useMemo(
    () =>
      sub
        ? computeOverrideBreakdown(sub.planModules, effectiveOverrideMap)
        : null,
    [sub, effectiveOverrideMap],
  );
  const hasUnsavedOverrideChanges = useMemo(() => {
    if (!sub) return false;
    const saved = buildOverrideDraft(sub, catalog);
    return catalog.some((m) => (draftOverrides[m.key] ?? "inherit") !== saved[m.key]);
  }, [sub, catalog, draftOverrides]);

  const sourceLabel: Record<ModuleEntitlementSource, string> = {
    plan: t("admin.pmmSourcePlan"),
    override: t("admin.pmmSourceOverride"),
    default: t("admin.pmmSourceDefault"),
  };

  /**
   * Technical implementation status pill — deliberately uses sky-blue / amber / red
   * tones and NEVER uses green, so it can never be confused with Plan Inclusion.
   */
  const renderTechnicalStatusPill = (m: CatalogRow) => {
    const avail = m.availability ?? "implemented";
    if (avail === "not_implemented" || m.surface.kind === "none") {
      return (
        <span
          className="inline-flex items-center rounded-full bg-red-50 px-2.5 py-0.5 text-[11px] font-semibold text-red-900 ring-1 ring-red-200"
          data-testid="pmm-tech-status"
        >
          Not implemented
        </span>
      );
    }
    if (avail === "external_dependency") {
      if (livekitConfigured) {
        return (
          <span
            className="inline-flex items-center rounded-full bg-sky-50 px-2.5 py-0.5 text-[11px] font-semibold text-sky-900 ring-1 ring-sky-200"
            data-testid="pmm-tech-status"
          >
            Implemented &amp; operational · LiveKit configured
          </span>
        );
      }
      return (
        <span
          className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-950 ring-1 ring-amber-300"
          data-testid="pmm-tech-status"
        >
          Core operational · LiveKit video pending
        </span>
      );
    }
    return (
      <span
        className="inline-flex items-center rounded-full bg-sky-50 px-2.5 py-0.5 text-[11px] font-semibold text-sky-900 ring-1 ring-sky-200"
        data-testid="pmm-tech-status"
      >
        Implemented &amp; operational
      </span>
    );
  };

  const renderWorkspaceLocation = (m: CatalogRow) => {
    const route = primaryOrgRoute(m.surface);
    return (
      <div
        className="mt-2 rounded-lg border border-slate-200/80 bg-slate-50/90 px-2.5 py-2 text-[11px]"
        data-testid="pmm-workspace-location"
      >
        <p className="font-semibold uppercase tracking-wide text-slate-500">
          Organization Workspace Location
        </p>
        <p className="mt-0.5 font-medium text-slate-900" data-testid="pmm-surface">
          {m.workspacePath}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          {route && (
            <code className="rounded bg-white px-1.5 py-0.5 font-mono text-[10px] text-slate-700 ring-1 ring-slate-200">
              {route}
            </code>
          )}
          {m.adminReferenceHref && (
            <Link
              href={m.adminReferenceHref}
              className="font-semibold text-sky-800 underline underline-offset-2 hover:text-sky-950"
            >
              Admin reference →
            </Link>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8">
      {/* ── Plan differentiation overview strip (calculated from saved DB) ── */}
      <div className="grid gap-4 md:grid-cols-3" data-testid="pmm-plan-comparison">
        {plans.map((p) => {
          const coverage = computePlanCoverage(p.modules);
          const isSelected = p.id === plan?.id;
          const lim = p.limits ?? {};
          const headline = `${p.name.toUpperCase()}: ${coverage.enabled} / ${coverage.total} modules — ${coverage.percentLabel}`;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setPlanId(p.id)}
              data-testid={`pmm-plan-card-${p.slug}`}
              data-enabled={coverage.enabled}
              data-total={coverage.total}
              data-percent={coverage.percentLabel}
              className={cn(
                "rounded-2xl border p-5 text-left transition",
                isSelected
                  ? "border-evergreen-700 bg-evergreen-50/50 ring-2 ring-evergreen-700/20"
                  : "border-slate-200 bg-white hover:border-evergreen-700/40",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-display text-lg font-semibold text-evergreen-950">
                  {p.name}
                </span>
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold tabular-nums text-evergreen-950 ring-1 ring-slate-200">
                  {coverage.percentLabel}
                </span>
              </div>

              {/* Exact calculated summary line */}
              <p
                className="mt-2 font-mono text-xs font-bold text-evergreen-900"
                data-testid={`pmm-plan-summary-${p.slug}`}
              >
                {headline}
              </p>

              {/* Visual progress indicator */}
              <div
                className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-200"
                role="progressbar"
                aria-label={`${p.name} plan module coverage`}
                aria-valuemin={0}
                aria-valuemax={coverage.total}
                aria-valuenow={coverage.enabled}
              >
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    coverage.percent === 100
                      ? "bg-emerald-600"
                      : coverage.percent >= 50
                        ? "bg-amber-500"
                        : "bg-slate-600",
                  )}
                  style={{ width: `${coverage.percent}%` }}
                />
              </div>

              <p className="mt-2 text-xs text-ink-soft">
                <code className="rounded bg-cream px-1.5 py-0.5">{p.slug}</code> ·{" "}
                {p.subscriberCount} {t("admin.pmmSubscribers")}
                {typeof p.priceMonthlyCents === "number" && (
                  <> · ${(p.priceMonthlyCents / 100).toFixed(0)}/mo</>
                )}
              </p>
              {p.description && (
                <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-ink-soft">
                  {p.description}
                </p>
              )}
              <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-evergreen-900/10 pt-3 text-[11px]">
                <div>
                  <dt className="text-ink-soft">Exams</dt>
                  <dd className="font-semibold text-evergreen-950">{fmtLimit(lim.max_exams)}</dd>
                </div>
                <div>
                  <dt className="text-ink-soft">Quizzes</dt>
                  <dd className="font-semibold text-evergreen-950">{fmtLimit(lim.max_quizzes)}</dd>
                </div>
                <div>
                  <dt className="text-ink-soft">Members</dt>
                  <dd className="font-semibold text-evergreen-950">{fmtLimit(lim.max_members)}</dd>
                </div>
              </dl>
            </button>
          );
        })}
      </div>

      {/* ── Panel 1: plans matrix ─────────────────────────────────── */}
      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold text-evergreen-950">
              {t("admin.pmmPlansTitle")}
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-ink-soft">{t("admin.pmmPlansBody")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={planCustom ? "gray" : "amber"}>
              {planCustom ? t("admin.pmmCustomBadge") : t("admin.pmmDefaultsBadge")}
            </Badge>
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1",
                livekitConfigured
                  ? "bg-sky-50 text-sky-900 ring-sky-200"
                  : "bg-amber-50 text-amber-950 ring-amber-300",
              )}
            >
              {livekitConfigured
                ? `LiveKit video: configured${livekitHost ? ` (${livekitHost})` : ""}`
                : `LiveKit video pending${livekitMissing.length ? ` (missing: ${livekitMissing.join(", ")})` : ""}`}
            </span>
          </div>
        </div>

        <p className="mt-3 rounded-lg border border-evergreen-900/10 bg-cream px-3 py-2 text-xs text-ink-soft">
          <strong>Strict platform boundary:</strong> Plan modules control organization workspace
          capabilities only (Free, Premium, Institution). Institution automatically includes all{" "}
          {catalog.length} organization-level modules. Platform Super Admin controls — tenant
          creation, global subscription management, global security policies, and cross-organization
          access — are never included in any customer plan.
        </p>

        {/* Unambiguous Status Legend */}
        <div
          className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs"
          data-testid="pmm-status-legend"
        >
          <span className="font-semibold text-slate-700">Legend:</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 font-semibold text-emerald-900 ring-1 ring-emerald-400">
            <span className="h-2 w-2 rounded-full bg-emerald-600" />
            Included in plan (checkbox checked)
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-200 px-2.5 py-0.5 font-semibold text-slate-700">
            <span className="h-2 w-2 rounded-full bg-slate-500" />
            Not included in plan (checkbox unchecked)
          </span>
          <span className="inline-flex items-center rounded-full bg-sky-50 px-2.5 py-0.5 font-semibold text-sky-900 ring-1 ring-sky-200">
            Implemented &amp; operational
          </span>
          <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 font-semibold text-amber-950 ring-1 ring-amber-300">
            External dependency
          </span>
          <span className="inline-flex items-center rounded-full bg-red-50 px-2.5 py-0.5 font-semibold text-red-900 ring-1 ring-red-200">
            Not implemented
          </span>
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="min-w-64 flex-1 text-sm font-medium text-evergreen-900">
            {t("admin.pmmSelectPlan")}
            <select
              value={plan?.id ?? ""}
              onChange={(e) => setPlanId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-evergreen-900/20 bg-white px-3 py-2 text-sm"
            >
              {plans.map((p) => {
                const cov = computePlanCoverage(p.modules);
                return (
                  <option key={p.id} value={p.id}>
                    {p.name.toUpperCase()}: {cov.enabled} / {cov.total} modules ({cov.percentLabel}) ·{" "}
                    {p.subscriberCount} {t("admin.pmmSubscribers")}
                  </option>
                );
              })}
            </select>
          </label>
          {plan && (
            <form action={applyRecommendedPlanModules}>
              <input type="hidden" name="plan_id" value={plan.id} />
              <Button type="submit" variant="outline">
                Apply canonical {plan.name} matrix
              </Button>
            </form>
          )}
        </div>

        {plan && (
          <form action={savePlanModules} className="mt-5 space-y-5">
            <input type="hidden" name="plan_id" value={plan.id} />

            {plan.slug === "institution" && (
              <div
                className={cn(
                  "rounded-xl border px-4 py-3 text-xs",
                  draftPlanCoverage.enabled === draftPlanCoverage.total
                    ? "border-emerald-600/40 bg-emerald-50/70 text-emerald-950"
                    : "border-amber-400 bg-amber-50 text-amber-950",
                )}
                data-testid="pmm-institution-callout"
              >
                {draftPlanCoverage.enabled === draftPlanCoverage.total ? (
                  <>
                    <strong>Institution Plan — Complete Organization Suite ({draftPlanCoverage.enabled} / {draftPlanCoverage.total} — {draftPlanCoverage.percentLabel}):</strong>{" "}
                    All {draftPlanCoverage.total} canonical organization-level modules are automatically
                    included and inherited by Institution organizations (such as Oak International
                    School) without manual selection or overrides.
                  </>
                ) : (
                  <>
                    <strong>Institution Plan completeness check:</strong>{" "}
                    {draftPlanCoverage.total - draftPlanCoverage.enabled} organization module(s) are
                    currently unchecked. Use <strong>Apply canonical Institution matrix</strong> above
                    to restore full {draftPlanCoverage.total} / {draftPlanCoverage.total} (100%)
                    automatic inheritance.
                  </>
                )}
              </div>
            )}

            {/* Prominent live & saved plan coverage summary bar */}
            <div
              className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
              data-testid="pmm-active-plan-coverage"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-mono text-sm font-bold text-evergreen-950">
                    {plan.name.toUpperCase()}: {draftPlanCoverage.enabled} /{" "}
                    {draftPlanCoverage.total} modules — {draftPlanCoverage.percentLabel}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-soft">
                    Saved in database:{" "}
                    <strong>
                      {savedPlanCoverage.enabled} / {savedPlanCoverage.total} modules (
                      {savedPlanCoverage.percentLabel})
                    </strong>
                    {hasUnsavedPlanChanges ? " · Unsaved changes in selection below" : " · Synchronized with Supabase"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {hasUnsavedPlanChanges && (
                    <>
                      <Badge tone="amber">Unsaved changes</Badge>
                      <Button
                        type="button"
                        variant="outline"
                        className="text-xs"
                        onClick={() => setDraftModules(buildPlanDraft(plan, catalog))}
                      >
                        Discard changes
                      </Button>
                    </>
                  )}
                </div>
              </div>
              <div
                className="mt-3 h-3 w-full overflow-hidden rounded-full bg-slate-200"
                role="progressbar"
                aria-label={`${plan.name} selected module coverage`}
                aria-valuemin={0}
                aria-valuemax={draftPlanCoverage.total}
                aria-valuenow={draftPlanCoverage.enabled}
              >
                <div
                  className="h-full rounded-full bg-emerald-600 transition-all"
                  style={{ width: `${draftPlanCoverage.percent}%` }}
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                {MODULE_GROUPS.map((g) => {
                  const list = grouped.get(g) ?? [];
                  const inc = list.filter((m) => draftModules[m.key] === true).length;
                  return (
                    <span
                      key={g}
                      className="rounded-lg bg-white px-2.5 py-1 font-medium text-slate-700 ring-1 ring-slate-200"
                    >
                      {t(GROUP_LABEL_KEY[g])}: <strong>{inc} / {list.length}</strong>
                    </span>
                  );
                })}
              </div>
            </div>

            {MODULE_GROUPS.map((group) => {
              const items = grouped.get(group) ?? [];
              const groupSelected = items.filter((m) => draftModules[m.key] === true).length;
              return (
                <section key={group}>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-[11px] font-bold uppercase tracking-wider text-evergreen-700">
                      {t(GROUP_LABEL_KEY[group])}
                    </h3>
                    <span className="text-xs font-semibold tabular-nums text-slate-600">
                      {groupSelected} / {items.length} included
                    </span>
                  </div>
                  <div className="mt-2 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                    {items.map((m) => {
                      const isIncluded = draftModules[m.key] === true;
                      const tierText = m.recommendedPlan ? TIER_LABEL[m.recommendedPlan] : null;
                      return (
                        <div
                          key={`${plan.id}-${m.key}`}
                          data-testid={`pmm-plan-module-${m.key}`}
                          data-included={isIncluded ? "true" : "false"}
                          data-availability={m.availability ?? "implemented"}
                          className={cn(
                            "flex flex-col justify-between rounded-xl border p-3.5 text-sm transition",
                            isIncluded
                              ? "border-emerald-600/50 bg-emerald-50/70"
                              : "border-slate-200 bg-white",
                          )}
                        >
                          <label className="flex cursor-pointer items-start gap-2.5" title={m.description}>
                            <input
                              type="checkbox"
                              name={`m_${m.key}`}
                              checked={isIncluded}
                              onChange={(e) =>
                                setDraftModules((prev) => ({
                                  ...prev,
                                  [m.key]: e.target.checked,
                                }))
                              }
                              className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-700"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="flex flex-wrap items-center gap-1.5">
                                <span className="font-semibold text-evergreen-950">{m.label}</span>
                                {tierText && (
                                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 ring-1 ring-slate-200">
                                    Tier: {tierText}
                                  </span>
                                )}
                              </span>
                              <span className="mt-1 block text-xs leading-5 text-ink-soft">
                                {m.description}
                              </span>
                            </span>
                          </label>

                          {/* Clearly separated Plan Inclusion vs Technical Implementation pills */}
                          <div className="mt-2.5 flex flex-wrap items-center gap-1.5 pl-6">
                            {isIncluded ? (
                              <span
                                className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-900 ring-1 ring-emerald-400"
                                data-testid="pmm-inclusion-badge"
                              >
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                                Included in plan
                              </span>
                            ) : (
                              <span
                                className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-300"
                                data-testid="pmm-inclusion-badge"
                              >
                                <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                                Not included in plan
                              </span>
                            )}
                            {renderTechnicalStatusPill(m)}
                          </div>

                          {m.externalDependency && (
                            <p
                              className={cn(
                                "mt-1.5 pl-6 text-[11px]",
                                livekitConfigured ? "text-sky-900" : "text-amber-900",
                              )}
                            >
                              {livekitConfigured
                                ? `LiveKit Cloud configured${livekitHost ? ` (${livekitHost})` : ""} for live video & screen rooms; Supabase incident logging, review workflows, retention policies & evidence ledger operate natively.`
                                : `${m.externalDependency}${livekitMissing.length ? ` Missing on this environment: ${livekitMissing.join(", ")}.` : ""}`}
                            </p>
                          )}

                          <div className="pl-6">{renderWorkspaceLocation(m)}</div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}

            <div className="flex flex-wrap items-center gap-3 border-t border-evergreen-900/10 pt-4">
              <Button type="submit">{t("admin.pmmSavePlan")}</Button>
              <p className="text-xs text-ink-soft">
                Saving persists all {catalog.length} explicit booleans to Supabase ({draftPlanCoverage.enabled}{" "}
                included, {draftPlanCoverage.total - draftPlanCoverage.enabled} excluded).{" "}
                {t("admin.pmmSaveNote")}
              </p>
            </div>
          </form>
        )}
      </Card>

      {/* ── Panel 2: organization overrides ───────────────────────── */}
      <Card className="p-6">
        <h2 className="font-display text-xl font-semibold text-evergreen-950">
          {t("admin.pmmOverridesTitle")}
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-ink-soft">{t("admin.pmmOverridesBody")}</p>

        <label className="mt-4 block text-sm font-medium text-evergreen-900">
          {t("admin.pmmSelectOrg")}
          <select
            value={subId}
            onChange={(e) => setSubId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-evergreen-900/20 bg-white px-3 py-2 text-sm"
          >
            <option value="">{t("admin.pmmSelectOrgPlaceholder")}</option>
            {subs.map((s) => {
              const cov = computePlanCoverage(s.planModules, s.modulesOverride);
              return (
                <option key={s.id} value={s.id}>
                  {s.organizationName} · {s.planName} ({s.status}) · {cov.enabled}/{cov.total} (
                  {cov.percentLabel})
                </option>
              );
            })}
          </select>
        </label>

        {!sub || !subBreakdown ? (
          <div className="mt-4">
            <EmptyState title={t("admin.pmmPickOrg")} />
          </div>
        ) : (
          <form action={saveSubscriptionModules} className="mt-5 space-y-5">
            <input type="hidden" name="subscription_id" value={sub.id} />

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
                    Assigned Plan
                  </p>
                  <p className="mt-0.5 font-semibold text-evergreen-950">
                    {sub.planName}{" "}
                    <span className="font-mono text-xs text-ink-soft">({sub.planSlug})</span>
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
                    Subscription Status
                  </p>
                  <p className="mt-0.5 text-sm font-semibold capitalize text-evergreen-950">
                    {sub.status} · {String(sub.source ?? "paid").replace(/_/g, " ")}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
                    Validity
                  </p>
                  <p className="mt-0.5 text-sm font-medium text-evergreen-950">
                    {sub.status === "trialing"
                      ? `Trial until ${fmtShortDate(sub.trialEndsAt)}`
                      : `Valid until ${fmtShortDate(sub.currentPeriodEnd)}`}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
                    Effective Modules
                  </p>
                  <p
                    className="mt-0.5 font-mono text-sm font-bold text-evergreen-950"
                    data-testid="pmm-org-effective-coverage"
                  >
                    {subBreakdown.enabled} / {subBreakdown.total} — {subBreakdown.percentLabel}
                  </p>
                </div>
              </div>

              {/* Visual progress indicator for org effective coverage */}
              <div
                className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-slate-200"
                role="progressbar"
                aria-label={`${sub.organizationName} effective module coverage`}
                aria-valuemin={0}
                aria-valuemax={subBreakdown.total}
                aria-valuenow={subBreakdown.enabled}
              >
                <div
                  className="h-full rounded-full bg-emerald-600 transition-all"
                  style={{ width: `${subBreakdown.percent}%` }}
                />
              </div>

              {/* Explicit inheritance & override distinction badges */}
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs" data-testid="pmm-org-breakdown">
                <span className="rounded-full bg-white px-2.5 py-1 font-semibold text-slate-800 ring-1 ring-slate-300">
                  Inherited from {sub.planName}: {subBreakdown.inherited} ({subBreakdown.inheritedEnabled} enabled)
                </span>
                <span className="rounded-full bg-emerald-100 px-2.5 py-1 font-semibold text-emerald-900 ring-1 ring-emerald-400">
                  Explicitly enabled: {subBreakdown.explicitOn}
                </span>
                <span className="rounded-full bg-red-100 px-2.5 py-1 font-semibold text-red-900 ring-1 ring-red-300">
                  Explicitly disabled: {subBreakdown.explicitOff}
                </span>
                {hasUnsavedOverrideChanges && (
                  <>
                    <Badge tone="amber">Unsaved override changes</Badge>
                    <Button
                      type="button"
                      variant="outline"
                      className="text-xs"
                      onClick={() => setDraftOverrides(buildOverrideDraft(sub, catalog))}
                    >
                      Discard changes
                    </Button>
                  </>
                )}
              </div>
            </div>

            <p className="text-sm text-ink-soft">
              {t("admin.pmmOverrideSummary", {
                org: sub.organizationName,
                plan: sub.planName,
                count: subBreakdown.explicitOn + subBreakdown.explicitOff,
              })}
            </p>
            <p
              className="mt-1 rounded-lg bg-cream px-3 py-2 text-xs text-ink-soft"
              data-testid="pmm-plan-summary"
            >
              {t("admin.pmmPlanSummary", {
                plan: sub.planName,
                enabled: String(computePlanCoverage(sub.planModules).enabled),
                total: String(catalog.length),
              })}{" "}
              {t("admin.pmmPlanSummaryNote")}
            </p>

            {MODULE_GROUPS.map((group) => (
              <section key={group}>
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-evergreen-700">
                  {t(GROUP_LABEL_KEY[group])}
                </h3>
                <div className="mt-2 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  {(grouped.get(group) ?? []).map((m) => {
                    const resolved = resolveModuleOperationalState(
                      sub.planModules,
                      effectiveOverrideMap,
                      m.key,
                      { livekitConfigured },
                    );
                    const state = resolved.configured;
                    const isUnimplemented =
                      resolved.availability === "not_implemented" || m.surface.kind === "none";
                    const inheritanceTag =
                      state === "on"
                        ? "Explicitly enabled"
                        : state === "off"
                          ? "Explicitly disabled"
                          : `Inherited from ${sub.planName}`;

                    return (
                      <div
                        key={`${sub.id}-${m.key}`}
                        className={cn(
                          "flex flex-col justify-between rounded-xl border p-3.5 text-sm",
                          state === "on"
                            ? "border-emerald-600/50 bg-emerald-50/70"
                            : state === "off"
                              ? "border-red-500/40 bg-red-50/70"
                              : resolved.operationallyAvailable
                                ? "border-emerald-600/30 bg-white"
                                : "border-slate-200 bg-slate-50/70",
                        )}
                        title={m.description}
                        data-testid={`pmm-module-${m.key}`}
                        data-configured={state}
                        data-effective={resolved.operationallyAvailable ? "enabled" : "disabled"}
                        data-source={resolved.source}
                        data-availability={resolved.availability}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-evergreen-950">{m.label}</p>
                            <p className="mt-0.5 text-xs text-ink-soft">
                              {t("admin.pmmConfigured")}: <strong>{inheritanceTag}</strong>
                            </p>
                            <p
                              className={cn(
                                "mt-0.5 text-xs font-semibold",
                                isUnimplemented
                                  ? "text-red-700"
                                  : resolved.operationallyAvailable
                                    ? "text-emerald-700"
                                    : "text-slate-600",
                              )}
                            >
                              {t("admin.pmmEffective")}:{" "}
                              {isUnimplemented
                                ? "Unavailable (not implemented)"
                                : resolved.operationallyAvailable
                                  ? t("admin.enabled")
                                  : t("admin.disabled")}
                            </p>
                            <p className="mt-0.5 text-[11px] text-ink-soft">
                              {t("admin.pmmSource")}:{" "}
                              {resolved.source === "plan"
                                ? `Inherited from ${sub.planName}`
                                : sourceLabel[resolved.source]}
                            </p>
                          </div>

                          <select
                            name={`o_${m.key}`}
                            value={state}
                            onChange={(e) =>
                              setDraftOverrides((prev) => ({
                                ...prev,
                                [m.key]: e.target.value as ModuleConfiguredState,
                              }))
                            }
                            aria-label={`Override for ${m.label}`}
                            className="shrink-0 rounded-lg border border-evergreen-900/20 bg-white px-2 py-1 text-xs font-medium"
                          >
                            <option value="inherit">{t("admin.pmmInherit")}</option>
                            <option value="on">{t("admin.pmmOn")}</option>
                            <option value="off">{t("admin.pmmOff")}</option>
                          </select>
                        </div>

                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1",
                              state === "on"
                                ? "bg-emerald-100 text-emerald-900 ring-emerald-400"
                                : state === "off"
                                  ? "bg-red-100 text-red-900 ring-red-300"
                                  : resolved.operationallyAvailable
                                    ? "bg-emerald-50 text-emerald-900 ring-emerald-300"
                                    : "bg-slate-100 text-slate-700 ring-slate-300",
                            )}
                          >
                            {inheritanceTag}
                          </span>
                          {renderTechnicalStatusPill(m)}
                        </div>

                        {renderWorkspaceLocation(m)}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}

            <div className="flex flex-wrap items-center gap-3 border-t border-evergreen-900/10 pt-4">
              <Button type="submit">{t("admin.pmmSaveOverride")}</Button>
              <p className="text-xs text-ink-soft">{t("admin.pmmOverrideNote")}</p>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
