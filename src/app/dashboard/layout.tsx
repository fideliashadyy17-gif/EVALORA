import { DashboardChrome } from "@/components/dashboard/DashboardChrome";
import { FormattingProvider } from "@/components/formatting/FormattingProvider";
import { activeOrg, requireUser } from "@/lib/auth";
import { requestFormatConfig } from "@/lib/formattingRequest";
import { getCapabilities } from "@/lib/capabilities";
import { isScoreAdjustmentPlanEligible } from "@/lib/scoreAdjustments";
import { notificationsEnabledFor } from "@/lib/notificationService";
import Link from "next/link";
import { isLearnerRole } from "@/lib/roleRouting";
import { redirect } from "next/navigation";
import { exitOrgWorkspace } from "../admin/actions/orgs";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  const isSuperAdmin = ctx.profile.platform_role === "super_admin";
  const isFounder = org?.role === "school_founder";
  let orgLogoUrl: string | null = null;
  let modules: Record<string, boolean> | undefined;
  // Score Adjustment is a plan capability, not a module key: resolve the
  // organization's REAL entitlement (no ownerBypass) so the sidebar entry
  // appears exactly where the page and the RPC would allow it.
  let scoreAdjustmentEligible = false;
  // In-app notification switch (Control Center → Notifications), intersected
  // with the plan entitlement. Defaults to visible when it cannot be read, so
  // a configuration outage hides nothing that already worked.
  let notificationsEnabled = true;
  if (org) {
    notificationsEnabled = await notificationsEnabledFor(org.id).catch(() => true);
  }
  if (org) {
    try {
      const { createClient } = await import("@/lib/supabase/server");
      const supabase = await createClient();
      const [{ data }, caps] = await Promise.all([
        supabase.from("organizations").select("logo_url").eq("id", org.id).maybeSingle(),
        getCapabilities(supabase, ctx, org.id),
      ]);
      orgLogoUrl = (data?.logo_url as string | null) ?? null;
      modules = caps.entitlement.modules;
      scoreAdjustmentEligible = isScoreAdjustmentPlanEligible(caps.entitlement);
    } catch {
      orgLogoUrl = orgLogoUrl ?? null;
      // Entitlement read failed: leave `modules` undefined (nav renders the
      // full list). Navigation cosmetics never gate access — every page and
      // server action re-resolves the entitlement server-side and enforces it.
      modules = modules ?? undefined;
    }
  }

  // Wrong-tenant hostname: the signed-in user does not belong to the
  // school whose subdomain this is. Never fall back to another school.
  if (ctx.tenantDenied) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <h1 className="font-display text-2xl font-semibold text-evergreen-950">Different school portal</h1>
        <p className="mt-2 text-sm text-ink-soft">
          This address belongs to another school&apos;s private EVALORA portal, and your account
          is not a member of that school. Sign in with that school&apos;s account, or return to
          the main EVALORA website to reach your own workspace.
        </p>
        <Link href="/" className="mt-4 inline-block font-semibold text-evergreen-800 underline underline-offset-2">
          Go to the main EVALORA website
        </Link>
      </div>
    );
  }

  // Super admins belong in the Super Admin Console (/admin) unless they are explicitly
  // operating inside an organization via "Open workspace" (adminOrgContext) or viewing
  // a specific tenant portal subdomain.
  if (isSuperAdmin && !ctx.adminOrgContext && !ctx.tenantSlug) {
    redirect("/admin");
  }

  // Super admins may use the console without an organization.
  if (!org && !isSuperAdmin) redirect(ctx.memberships.length ? "/workspaces" : "/onboarding");
  if (!org) redirect("/admin");
  if (!isSuperAdmin && ctx.memberships.length > 1 && !ctx.workspaceSelected) redirect("/workspaces");
  if (!isSuperAdmin && isLearnerRole(org.role)) redirect("/student");

  // Suspended/archived workspaces are closed to their members — but the
  // platform owner can still enter to inspect or repair them.
  if (org.status !== "active" && !isSuperAdmin) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <h1 className="font-display text-2xl font-semibold text-evergreen-950">Organization {org.status}</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Access to this workspace has been {org.status} by the EVALORA team.
          Please contact support for assistance.
        </p>
      </div>
    );
  }

  // This school's date/time/number profile, for the client components inside
  // the workspace. Resolved from the session's own organization — never from a
  // URL segment — and shared with the pages through React's request cache.
  const formatCfg = await requestFormatConfig(org.id).catch(() => null);

  return (
    <>
      {ctx.adminOrgContext && (
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-gold-500 px-4 py-2 text-center text-sm font-medium text-evergreen-950">
          <span>
            Administrative access mode — you are operating <strong>{org.name}</strong> as platform owner.
            Everything you do here is audit-logged.
          </span>
          <Link href={`/admin/organizations/${org.id}`} className="font-semibold underline underline-offset-2">
            Organization record
          </Link>
          <form action={exitOrgWorkspace}>
            <button type="submit" className="font-semibold underline underline-offset-2">
              Exit workspace
            </button>
          </form>
        </div>
      )}
      {isFounder && (
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 bg-evergreen-900 px-4 py-2 text-center text-sm font-medium text-cream">
          <span>
            Institutional Supervision (Read-Only) — viewing <strong>{org.name}</strong> in operational oversight mode.
          </span>
          <Link href="/supervision" className="font-semibold text-gold-300 underline underline-offset-2 hover:text-gold-200">
            Executive Summary →
          </Link>
        </div>
      )}
      {org.is_demo && (
        <div className="bg-evergreen-950 px-4 py-2 text-center text-sm font-semibold text-gold-300">
          DEMONSTRATION SCHOOL — all students, results and records in this workspace are fictional sample data.
        </div>
      )}
      {org.status !== "active" && isSuperAdmin && (
        <div className="bg-red-700 px-4 py-2 text-center text-sm font-semibold text-white">
          This organization is currently {org.status}. Its members cannot access this workspace.
        </div>
      )}
      <FormattingProvider cfg={formatCfg}>
        <DashboardChrome
          orgName={org.name}
          orgSlug={org.slug}
          orgLogoUrl={orgLogoUrl}
          isDemo={Boolean(org.is_demo)}
          orgRole={org.role}
          canSwitchWorkspace={!isSuperAdmin && !ctx.tenantSlug && ctx.memberships.length > 1}
          userName={ctx.profile.full_name || ctx.profile.email}
          modules={modules}
          scoreAdjustmentEligible={scoreAdjustmentEligible}
          notificationsEnabled={notificationsEnabled}
        >
          {children}
        </DashboardChrome>
      </FormattingProvider>
    </>
  );
}
