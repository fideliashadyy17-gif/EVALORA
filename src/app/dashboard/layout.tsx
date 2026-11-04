import { DashboardChrome } from "@/components/dashboard/DashboardChrome";
import { activeOrg, requireUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await requireUser();
  const org = activeOrg(ctx);

  // Super admins may use the console without an organization.
  if (!org && ctx.profile.platform_role !== "super_admin") redirect("/onboarding");
  if (!org) redirect("/admin");

  if (org.status === "suspended") {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <h1 className="font-display text-2xl font-semibold text-evergreen-950">Organization suspended</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Access to this workspace has been suspended by the EVALORA team.
          Please contact support for assistance.
        </p>
      </div>
    );
  }

  return (
    <DashboardChrome
      orgName={org.name}
      orgRole={org.role}
      userName={ctx.profile.full_name || ctx.profile.email}
      isSuperAdmin={ctx.profile.platform_role === "super_admin"}
    >
      {children}
    </DashboardChrome>
  );
}
