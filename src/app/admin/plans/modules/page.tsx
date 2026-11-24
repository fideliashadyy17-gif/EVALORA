import { PageTitle, ButtonLink } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
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
 * Reads plans.modules and subscriptions.modules_override (both additive,
 * nullable jsonb) and renders the central control matrix. Enforcement is
 * server-side elsewhere: getCapabilities ANDs the resolved map into the
 * capability set every page and action consults.
 */
export default async function PlanModuleManagementPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; sub?: string; ok?: string; e?: string }>;
}) {
  await requireSuperAdmin();
  const sp = (await searchParams) ?? {};
  const admin = createAdminClient();

  const [{ data: plans }, { data: subs }, { data: orgs }, { data: subCounts }] =
    await Promise.all([
      admin
        .from("plans")
        .select("id, slug, name, modules")
        .order("sort"),
      admin
        .from("subscriptions")
        .select("id, organization_id, status, modules_override, plan_id, plans(name, slug, modules)")
        .in("status", ["active", "trialing"])
        .order("created_at", { ascending: false }),
      admin.from("organizations").select("id, name"),
      admin
        .from("subscriptions")
        .select("plan_id, status")
        .in("status", ["active", "trialing"]),
    ]);

  const orgName = new Map((orgs ?? []).map((o) => [o.id, o.name as string]));
  const counts = new Map<string, number>();
  for (const row of subCounts ?? []) {
    const key = row.plan_id as string;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const planRows: PlanRow[] = (plans ?? []).map((p) => ({
    id: p.id as string,
    slug: p.slug as string,
    name: p.name as string,
    modules: (p.modules as Record<string, boolean> | null) ?? null,
    subscriberCount: counts.get(p.id as string) ?? 0,
  }));

  const subRows: SubRow[] = (subs ?? []).map((s) => {
    const plan = s.plans as { name?: string; slug?: string; modules?: unknown } | null;
    return {
      id: s.id as string,
      organization_id: s.organization_id as string,
      organizationName:
        orgName.get(s.organization_id as string) ?? "Unknown organization",
      status: s.status as string,
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
        subtitle="Central module catalog × plans, with per-organization overrides. Entitlements are stored in the database and enforced server-side on navigation, pages and actions — roles keep restricting independently."
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
          the organization&apos;s dashboard navigation and pages now resolve this configuration on their next load.
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
        }))}
        initialPlanId={sp.plan}
        initialSubId={sp.sub}
      />
    </>
  );
}
