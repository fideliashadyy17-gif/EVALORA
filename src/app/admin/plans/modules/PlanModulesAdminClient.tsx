"use client";

/**
 * Plan & Module Management console.
 *
 * Two panels:
 *  1. Plans × modules matrix — saves plans.modules (explicit booleans).
 *  2. Organization overrides — tri-state (inherit / on / off) per module on
 *     subscriptions.modules_override.
 *
 * Everything is enforced server-side elsewhere (getCapabilities ANDs the
 * resolved map into every page/action check); this UI is the control surface.
 */
import { useMemo, useState } from "react";
import { Badge, Button, Card, EmptyState } from "@/components/ui";
import { useI18n } from "@/components/i18n/I18nProvider";
import {
  MODULE_GROUPS,
  MODULE_DEFAULTS,
  resolveEffectiveModule,
  type ModuleEntitlementSource,
  type ModuleGroup,
} from "@/lib/modules";
import { savePlanModules, saveSubscriptionModules } from "./actions";
import { cn } from "@/lib/utils";

export interface PlanRow {
  id: string;
  slug: string;
  name: string;
  modules: Record<string, boolean> | null;
  subscriberCount: number;
}

export interface SubRow {
  id: string;
  organization_id: string;
  organizationName: string;
  status: string;
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
}

const GROUP_LABEL_KEY: Record<ModuleGroup, string> = {
  assessments: "nav.assessments",
  quizzes: "nav.quizzes",
  exams: "nav.examinations",
  institution: "nav.institutionalManagement",
};

export function PlanModulesAdminClient({
  plans,
  subs,
  catalog,
  initialPlanId,
  initialSubId,
}: {
  plans: PlanRow[];
  subs: SubRow[];
  catalog: CatalogRow[];
  initialPlanId?: string;
  initialSubId?: string;
}) {
  const { t } = useI18n();
  const [planId, setPlanId] = useState(initialPlanId ?? plans[0]?.id ?? "");
  const [subId, setSubId] = useState(initialSubId ?? "");

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
  const planEnabledCount = sub
    ? catalog.filter((m) => resolveEffectiveModule(sub.planModules, null, m.key).effective).length
    : 0;

  return (
    <div className="space-y-8">
      {/* ── Panel 1: plans matrix ─────────────────────────────────── */}
      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold text-evergreen-950">
              {t("admin.pmmPlansTitle")}
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-ink-soft">{t("admin.pmmPlansBody")}</p>
          </div>
          <Badge tone={planCustom ? "gold" : "green"}>
            {planCustom ? t("admin.pmmCustomBadge") : t("admin.pmmDefaultsBadge")}
          </Badge>
        </div>

        <label className="mt-4 block text-sm font-medium text-evergreen-900">
          {t("admin.pmmSelectPlan")}
          <select
            value={plan?.id ?? ""}
            onChange={(e) => setPlanId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-evergreen-900/20 bg-white px-3 py-2 text-sm"
          >
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.slug}) · {p.subscriberCount} {t("admin.pmmSubscribers")}
              </option>
            ))}
          </select>
        </label>

        {plan && (
          <form action={savePlanModules} className="mt-5 space-y-5">
            <input type="hidden" name="plan_id" value={plan.id} />
            {MODULE_GROUPS.map((group) => (
              <section key={group}>
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-evergreen-700">
                  {t(GROUP_LABEL_KEY[group])}
                </h3>
                <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {(grouped.get(group) ?? []).map((m) => {
                    const checked = m.key in (plan.modules ?? {})
                      ? Boolean(plan.modules?.[m.key])
                      : MODULE_DEFAULTS[m.key] ?? true;
                    return (
                      <label
                        key={m.key}
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
                        <span>
                          <span className="block font-semibold text-evergreen-950">{m.label}</span>
                          <span className="mt-0.5 block text-xs leading-5 text-ink-soft">
                            {m.description}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </section>
            ))}
            <div className="flex items-center gap-3 border-t border-evergreen-900/10 pt-4">
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
          <form action={saveSubscriptionModules} className="mt-5 space-y-5">
            <input type="hidden" name="subscription_id" value={sub.id} />
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
                    // THE FIX: effective state = override ?? PLAN ?? platform
                    // default — never the bare default while INHERIT, so the
                    // console can no longer disagree with the dashboard.
                    const resolved = resolveEffectiveModule(
                      sub.planModules,
                      sub.modulesOverride,
                      m.key,
                    );
                    const state = resolved.configured;
                    return (
                      <label
                        key={m.key}
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
                        data-effective={resolved.effective ? "enabled" : "disabled"}
                        data-source={resolved.source}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold text-evergreen-950">{m.label}</span>
                          <span className="mt-0.5 block text-xs">
                            {t("admin.pmmConfigured")}: <strong>{state === "inherit" ? t("admin.pmmInherit") : state === "on" ? t("admin.pmmOn") : t("admin.pmmOff")}</strong>
                          </span>
                          <span
                            className={cn(
                              "mt-0.5 block text-xs font-semibold",
                              resolved.effective ? "text-emerald-700" : "text-red-700",
                            )}
                          >
                            {t("admin.pmmEffective")}: {resolved.effective ? t("admin.enabled") : t("admin.disabled")}
                          </span>
                          <span className="mt-0.5 block text-[11px] text-ink-soft">
                            {t("admin.pmmSource")}: {sourceLabel[resolved.source]}
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
            <div className="flex items-center gap-3 border-t border-evergreen-900/10 pt-4">
              <Button type="submit">{t("admin.pmmSaveOverride")}</Button>
              <p className="text-xs text-ink-soft">{t("admin.pmmOverrideNote")}</p>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
