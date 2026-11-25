"use client";

/**
 * Plan & Module Management console.
 *
 * Three synchronized views backed directly by Supabase:
 *  1. Plan Tier Comparison — Free / Premium / Institution module counts & limits.
 *  2. Plans × Modules Matrix — edits `plans.modules` (explicit booleans) with
 *     implementation status, external infrastructure readiness, and preset sync.
 *  3. Organization Overrides — tri-state (inherit / on / off) on
 *     `subscriptions.modules_override`, showing plan validity, entitlement
 *     source, effective operational status, and workspace location.
 */
import { useMemo, useState } from "react";
import { Badge, Button, Card, EmptyState } from "@/components/ui";
import { useI18n } from "@/components/i18n/I18nProvider";
import {
  MODULE_GROUPS,
  MODULE_DEFAULTS,
  resolveEffectiveModule,
  resolveModuleOperationalState,
  type ModuleAvailability,
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
  /** Where this module actually appears — never promise a phantom surface. */
  surface: ModuleSurface;
}

const GROUP_LABEL_KEY: Record<ModuleGroup, string> = {
  assessments: "nav.assessments",
  quizzes: "nav.quizzes",
  exams: "nav.examinations",
  institution: "nav.institutionalManagement",
};

const TIER_BADGE: Record<PlanTier, { label: string; tone: "gray" | "gold" | "green" }> = {
  free: { label: "Free+", tone: "gray" },
  premium: { label: "Premium+", tone: "gold" },
  institution: { label: "Institution", tone: "green" },
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

export function PlanModulesAdminClient({
  plans,
  subs,
  catalog,
  livekitConfigured = false,
  initialPlanId,
  initialSubId,
}: {
  plans: PlanRow[];
  subs: SubRow[];
  catalog: CatalogRow[];
  livekitConfigured?: boolean;
  initialPlanId?: string;
  initialSubId?: string;
}) {
  const { t } = useI18n();
  const [planId, setPlanId] = useState(initialPlanId ?? plans[0]?.id ?? "");
  const [subId, setSubId] = useState(initialSubId ?? subs[0]?.id ?? "");

  const plan = plans.find((p) => p.id === planId) ?? plans[0];
  const sub = subs.find((s) => s.id === subId);

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
  const overrideCount = sub?.modulesOverride
    ? Object.keys(sub.modulesOverride).length
    : 0;
  const sourceLabel: Record<ModuleEntitlementSource, string> = {
    plan: t("admin.pmmSourcePlan"),
    override: t("admin.pmmSourceOverride"),
    default: t("admin.pmmSourceDefault"),
  };

  // The single honest answer to "where will I see this?": derived from the
  // same catalog surface the organization sidebar derives its map from.
  const surfaceText = (surface: ModuleSurface): string => {
    if (surface.kind === "nav") return t("admin.pmmSurfaceSidebar", { href: surface.hrefs.join(" · ") });
    if (surface.kind === "page") return t("admin.pmmSurfacePage", { href: surface.href, where: surface.where });
    if (surface.kind === "admin") return t("admin.pmmSurfaceAdmin", { href: surface.href, where: surface.where });
    return t("admin.pmmSurfaceNone", { why: surface.why });
  };

  const countPlanEnabled = (p: PlanRow) =>
    catalog.filter((m) => resolveEffectiveModule(p.modules, null, m.key).effective).length;

  const planEnabledCount = sub
    ? catalog.filter((m) => resolveEffectiveModule(sub.planModules, null, m.key).effective).length
    : 0;
  const subOperationalCount = sub
    ? catalog.filter(
        (m) =>
          resolveModuleOperationalState(sub.planModules, sub.modulesOverride, m.key, {
            livekitConfigured,
          }).operationallyAvailable,
      ).length
    : 0;

  const renderAvailabilityBadge = (m: CatalogRow, enabled: boolean) => {
    const avail = m.availability ?? "implemented";
    if (avail === "not_implemented" || m.surface.kind === "none") {
      return <Badge tone="red">Not yet implemented</Badge>;
    }
    if (avail === "external_dependency") {
      return (
        <Badge tone={livekitConfigured ? "green" : "amber"}>
          {livekitConfigured
            ? "Implemented · LiveKit ready"
            : "External infra (LiveKit video pending)"}
        </Badge>
      );
    }
    return enabled ? (
      <Badge tone="green">Operational</Badge>
    ) : (
      <Badge tone="gray">Implemented · disabled</Badge>
    );
  };

  return (
    <div className="space-y-8">
      {/* ── Plan differentiation overview strip ───────────────────── */}
      <div className="grid gap-4 md:grid-cols-3" data-testid="pmm-plan-comparison">
        {plans.map((p) => {
          const enabledCount = countPlanEnabled(p);
          const isSelected = p.id === plan?.id;
          const lim = p.limits ?? {};
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setPlanId(p.id)}
              className={cn(
                "rounded-2xl border p-5 text-left transition",
                isSelected
                  ? "border-evergreen-700 bg-evergreen-50/70 ring-2 ring-evergreen-700/20"
                  : "border-evergreen-900/15 bg-white hover:border-evergreen-700/40",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-display text-lg font-semibold text-evergreen-950">{p.name}</span>
                <Badge tone={p.modules ? "green" : "amber"}>
                  {enabledCount} / {catalog.length} modules
                </Badge>
              </div>
              <p className="mt-1 text-xs text-ink-soft">
                <code className="rounded bg-cream px-1.5 py-0.5">{p.slug}</code> · {p.subscriberCount}{" "}
                {t("admin.pmmSubscribers")}
                {typeof p.priceMonthlyCents === "number" && (
                  <> · ${(p.priceMonthlyCents / 100).toFixed(0)}/mo</>
                )}
              </p>
              {p.description && (
                <p className="mt-2 line-clamp-2 text-xs leading-5 text-ink-soft">{p.description}</p>
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
            <Badge tone={planCustom ? "green" : "amber"}>
              {planCustom ? t("admin.pmmCustomBadge") : t("admin.pmmDefaultsBadge")}
            </Badge>
            <Badge tone={livekitConfigured ? "green" : "amber"}>
              {livekitConfigured ? "LiveKit video: configured" : "LiveKit video: not configured"}
            </Badge>
          </div>
        </div>

        <p className="mt-3 rounded-lg border border-evergreen-900/10 bg-cream px-3 py-2 text-xs text-ink-soft">
          <strong>Strict platform boundary:</strong> Plan modules control organization workspace capabilities only
          (Free, Premium, Institution). Platform Super Admin controls — tenant creation, global subscription management,
          global security policies, and cross-organization access — are never included in any customer plan.
        </p>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="min-w-64 flex-1 text-sm font-medium text-evergreen-900">
            {t("admin.pmmSelectPlan")}
            <select
              value={plan?.id ?? ""}
              onChange={(e) => setPlanId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-evergreen-900/20 bg-white px-3 py-2 text-sm"
            >
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.slug}) · {countPlanEnabled(p)}/{catalog.length} modules · {p.subscriberCount}{" "}
                  {t("admin.pmmSubscribers")}
                </option>
              ))}
            </select>
          </label>
          {plan && (
            <form action={applyRecommendedPlanModules}>
              <input type="hidden" name="plan_id" value={plan.id} />
              <Button type="submit" variant="outline">
                Reset {plan.name} to recommended tier matrix
              </Button>
            </form>
          )}
        </div>

        {plan && (
          <form key={plan.id} action={savePlanModules} className="mt-5 space-y-5">
            <input type="hidden" name="plan_id" value={plan.id} />
            {MODULE_GROUPS.map((group) => (
              <section key={group}>
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-evergreen-700">
                  {t(GROUP_LABEL_KEY[group])}
                </h3>
                <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {(grouped.get(group) ?? []).map((m) => {
                    const checked =
                      m.key in (plan.modules ?? {})
                        ? Boolean(plan.modules?.[m.key])
                        : MODULE_DEFAULTS[m.key] ?? true;
                    const tierInfo = m.recommendedPlan ? TIER_BADGE[m.recommendedPlan] : null;
                    return (
                      <label
                        key={`${plan.id}-${m.key}`}
                        className={cn(
                          "flex items-start gap-2.5 rounded-xl border p-3 text-sm transition",
                          checked
                            ? "border-evergreen-700/40 bg-evergreen-50"
                            : "border-evergreen-900/15 bg-white",
                        )}
                        title={m.description}
                      >
                        <input
                          type="checkbox"
                          name={`m_${m.key}`}
                          defaultChecked={checked}
                          className="mt-0.5 h-4 w-4 accent-evergreen-700"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-1.5">
                            <span className="font-semibold text-evergreen-950">{m.label}</span>
                            {tierInfo && <Badge tone={tierInfo.tone}>{tierInfo.label}</Badge>}
                          </span>
                          <span className="mt-1 block text-xs leading-5 text-ink-soft">
                            {m.description}
                          </span>
                          <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            {renderAvailabilityBadge(m, checked)}
                          </span>
                          {m.externalDependency && (
                            <span className="mt-1 block text-[11px] text-amber-800">
                              Dependency: {m.externalDependency}
                            </span>
                          )}
                          <span className="mt-1 block text-[11px] font-medium text-evergreen-700" data-testid="pmm-surface">
                            {surfaceText(m.surface)}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </section>
            ))}
            <div className="flex flex-wrap items-center gap-3 border-t border-evergreen-900/10 pt-4">
              <Button type="submit">{t("admin.pmmSavePlan")}</Button>
              <p className="text-xs text-ink-soft">{t("admin.pmmSaveNote")}</p>
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
            {subs.map((s) => (
              <option key={s.id} value={s.id}>
                {s.organizationName} · {s.planName} ({s.status})
              </option>
            ))}
          </select>
        </label>

        {!sub ? (
          <div className="mt-4">
            <EmptyState title={t("admin.pmmPickOrg")} />
          </div>
        ) : (
          <form key={sub.id} action={saveSubscriptionModules} className="mt-5 space-y-5">
            <input type="hidden" name="subscription_id" value={sub.id} />

            <div className="grid gap-3 rounded-xl border border-evergreen-900/10 bg-cream p-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Assigned Plan</p>
                <p className="mt-0.5 font-semibold text-evergreen-950">
                  {sub.planName} <span className="font-mono text-xs text-ink-soft">({sub.planSlug})</span>
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Subscription Status</p>
                <p className="mt-0.5 text-sm font-semibold capitalize text-evergreen-950">
                  {sub.status} · {String(sub.source ?? "paid").replace(/_/g, " ")}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Validity</p>
                <p className="mt-0.5 text-sm font-medium text-evergreen-950">
                  {sub.status === "trialing"
                    ? `Trial until ${fmtShortDate(sub.trialEndsAt)}`
                    : `Valid until ${fmtShortDate(sub.currentPeriodEnd)}`}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Effective Modules</p>
                <p className="mt-0.5 text-sm font-semibold text-evergreen-950">
                  {subOperationalCount} / {catalog.length} operational · {overrideCount} override(s)
                </p>
              </div>
            </div>

            <p className="text-sm text-ink-soft">
              {t("admin.pmmOverrideSummary", {
                org: sub.organizationName,
                plan: sub.planName,
                count: overrideCount,
              })}
            </p>
            <p className="mt-1 rounded-lg bg-cream px-3 py-2 text-xs text-ink-soft" data-testid="pmm-plan-summary">
              {t("admin.pmmPlanSummary", {
                plan: sub.planName,
                enabled: String(planEnabledCount),
                total: String(catalog.length),
              })}{" "}
              {t("admin.pmmPlanSummaryNote")}
            </p>

            {MODULE_GROUPS.map((group) => (
              <section key={group}>
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-evergreen-700">
                  {t(GROUP_LABEL_KEY[group])}
                </h3>
                <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {(grouped.get(group) ?? []).map((m) => {
                    const resolved = resolveModuleOperationalState(
                      sub.planModules,
                      sub.modulesOverride,
                      m.key,
                      { livekitConfigured },
                    );
                    const state = resolved.configured;
                    const isUnimplemented =
                      resolved.availability === "not_implemented" || m.surface.kind === "none";
                    return (
                      <label
                        key={`${sub.id}-${m.key}`}
                        className={cn(
                          "flex items-start gap-2.5 rounded-xl border p-3 text-sm",
                          state === "inherit"
                            ? "border-evergreen-900/15 bg-white"
                            : state === "on"
                              ? "border-emerald-700/40 bg-emerald-50"
                              : "border-red-700/40 bg-red-50",
                        )}
                        title={m.description}
                        data-testid={`pmm-module-${m.key}`}
                        data-configured={state}
                        data-effective={resolved.operationallyAvailable ? "enabled" : "disabled"}
                        data-source={resolved.source}
                        data-availability={resolved.availability}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold text-evergreen-950">{m.label}</span>
                          <span className="mt-0.5 block text-xs">
                            {t("admin.pmmConfigured")}:{" "}
                            <strong>
                              {state === "inherit"
                                ? t("admin.pmmInherit")
                                : state === "on"
                                  ? t("admin.pmmOn")
                                  : t("admin.pmmOff")}
                            </strong>
                          </span>
                          <span
                            className={cn(
                              "mt-0.5 block text-xs font-semibold",
                              isUnimplemented
                                ? "text-amber-800"
                                : resolved.operationallyAvailable
                                  ? "text-emerald-700"
                                  : "text-red-700",
                            )}
                          >
                            {t("admin.pmmEffective")}:{" "}
                            {isUnimplemented
                              ? "Unavailable (not yet implemented)"
                              : resolved.operationallyAvailable
                                ? t("admin.enabled")
                                : t("admin.disabled")}
                          </span>
                          <span className="mt-0.5 block text-[11px] text-ink-soft">
                            {t("admin.pmmSource")}:{" "}
                            {resolved.source === "plan"
                              ? `${sourceLabel.plan} (${sub.planName})`
                              : sourceLabel[resolved.source]}
                          </span>
                          <span className="mt-1 flex flex-wrap gap-1">
                            {renderAvailabilityBadge(m, resolved.operationallyAvailable)}
                          </span>
                          <span className="mt-1 block text-[11px] font-medium text-evergreen-700" data-testid="pmm-surface">
                            {surfaceText(m.surface)}
                          </span>
                        </span>
                        <select
                          name={`o_${m.key}`}
                          defaultValue={state}
                          className="rounded-lg border border-evergreen-900/20 bg-white px-2 py-1 text-xs"
                        >
                          <option value="inherit">{t("admin.pmmInherit")}</option>
                          <option value="on">{t("admin.pmmOn")}</option>
                          <option value="off">{t("admin.pmmOff")}</option>
                        </select>
                      </label>
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
