import { DashboardChrome } from "@/components/dashboard/DashboardChrome";
import { activeOrg, requireUser } from "@/lib/auth";
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
      <DashboardChrome
        orgName={org.name}
        orgSlug={org.slug}
        isDemo={Boolean(org.is_demo)}
        orgRole={org.role}
        canSwitchWorkspace={!isSuperAdmin && !ctx.tenantSlug && ctx.memberships.length > 1}
        userName={ctx.profile.full_name || ctx.profile.email}
      >
        {children}
      </DashboardChrome>
    </>
  );
}
