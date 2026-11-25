import { PageTitle, ButtonLink } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { getLiveKitEnvStatus } from "@/lib/livekit";
import { MODULE_CATALOG } from "@/lib/modules";
import { createAdminClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import {
  PlanModulesAdminClient,
  type PlanRow,
  type SubRow,
} from "./PlanModulesAdminClient";

export const metadata: Metadata = { title: "Plan & Module Management" };
export const dynamic = "force-dynamic";

/**
 * Super Admin — Plan & Module Management.
 *
 * Reads plans.modules, plans.limits, and subscriptions.modules_override from
 * Supabase and renders the central control matrix alongside honest operational
 * implementation & infrastructure readiness status. Enforcement is server-side
 * everywhere: getCapabilities, requireModule, navModules, and API routes all
 * resolve the same persisted configuration.
 */
export default async function PlanModuleManagementPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; sub?: string; ok?: string; e?: string }>;
}) {
  await requireSuperAdmin();
  const sp = (await searchParams) ?? {};
  const admin = createAdminClient();

  const livekitStatus = getLiveKitEnvStatus();
  const livekitConfigured = livekitStatus.configured;

  const [{ data: plans }, { data: subs }, { data: orgs }, { data: subCounts }] =
    await Promise.all([
      admin
        .from("plans")
        .select("id, slug, name, description, price_monthly_cents, price_yearly_cents, currency, limits, modules, is_active")
        .order("sort"),
      admin
        .from("subscriptions")
        .select("id, organization_id, status, source, current_period_end, trial_ends_at, modules_override, plan_id, plans(name, slug, modules)")
        .in("status", ["active", "trialing"])
        .order("created_at", { ascending: false }),
      admin.from("organizations").select("id, name, slug, status"),
      admin
        .from("subscriptions")
        .select("plan_id, status")
        .in("status", ["active", "trialing"]),
    ]);

  const orgById = new Map(
    (orgs ?? []).map((o) => [
      o.id as string,
      { name: o.name as string, slug: (o.slug as string) ?? "", status: (o.status as string) ?? "active" },
    ]),
  );
  const counts = new Map<string, number>();
  for (const row of subCounts ?? []) {
    const key = row.plan_id as string;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const planRows: PlanRow[] = (plans ?? []).map((p) => ({
    id: p.id as string,
    slug: p.slug as string,
    name: p.name as string,
    description: (p.description as string | null) ?? null,
    priceMonthlyCents: Number(p.price_monthly_cents ?? 0),
    priceYearlyCents: Number(p.price_yearly_cents ?? 0),
    currency: (p.currency as string) ?? "USD",
    limits: (p.limits as Record<string, unknown> | null) ?? null,
    modules: (p.modules as Record<string, boolean> | null) ?? null,
    isActive: Boolean(p.is_active),
    subscriberCount: counts.get(p.id as string) ?? 0,
  }));

  const subRows: SubRow[] = (subs ?? []).map((s) => {
    const plan = s.plans as { name?: string; slug?: string; modules?: unknown } | null;
    const orgInfo = orgById.get(s.organization_id as string);
    return {
      id: s.id as string,
      organization_id: s.organization_id as string,
      organizationName: orgInfo?.name ?? "Unknown organization",
      organizationSlug: orgInfo?.slug ?? "",
      status: s.status as string,
      source: (s.source as string | null) ?? "paid",
      currentPeriodEnd: (s.current_period_end as string | null) ?? null,
      trialEndsAt: (s.trial_ends_at as string | null) ?? null,
      planName: plan?.name ?? "—",
      planSlug: plan?.slug ?? "—",
      planModules: (plan?.modules as Record<string, boolean> | null) ?? null,
      modulesOverride:
        (s.modules_override as Record<string, boolean> | null) ?? null,
    };
  });

  return (
    <>
      <PageTitle
        eyebrow="Commerce & Entitlements · Modules"
        title="Plan & Module Management"
        subtitle="Differentiated plan module matrices (Free / Premium / Institution) and per-organization overrides persisted in Supabase. Every toggle reflects honest implementation status, external infrastructure dependencies, and exact organization workspace location — enforced server-side alongside centralized RBAC."
        action={
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/admin/plans" variant="outline">Plans & limits</ButtonLink>
            <ButtonLink href="/admin/subscriptions" variant="outline">Subscriptions</ButtonLink>
          </div>
        }
      />
      {sp.ok === "override" && (
        <p role="status" className="mb-6 rounded-lg bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">
          Override saved. The configured state, effective state and source below are read back from the database —
          the organization&apos;s dashboard navigation, server guards and operational pages now resolve this configuration on their next load.
        </p>
      )}
      {sp.ok === "plan" && (
        <p role="status" className="mb-6 rounded-lg bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">
          Plan modules saved. Every organization on this plan inherits the new configuration on its next
          entitlement resolution — explicit organization overrides remain respected.
        </p>
      )}
      {sp.e && (
        <p role="alert" className="mb-6 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-900">
          {sp.e === "save"
            ? "The configuration could not be saved. Nothing was changed — check the selected organization and try again."
            : "Invalid selection. Choose a plan or organization and try again."}
        </p>
      )}
      <PlanModulesAdminClient
        plans={planRows}
        subs={subRows}
        catalog={MODULE_CATALOG.map((m) => ({
          key: m.key,
          group: m.group,
          label: m.label,
          description: m.description,
          recommendedPlan: m.recommendedPlan,
          availability: m.availability,
          externalDependency: m.externalDependency,
          workspacePath: m.workspacePath,
          adminReferenceHref: m.adminReferenceHref,
          surface: m.surface,
        }))}
        livekitConfigured={livekitConfigured}
        livekitHost={livekitStatus.host}
        livekitMissing={livekitStatus.missing}
        initialPlanId={sp.plan}
        initialSubId={sp.sub}
      />
    </>
  );
}
