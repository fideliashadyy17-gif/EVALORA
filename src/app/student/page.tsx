import { SignOutButton } from "@/components/SignOutButton";
import { ButtonLink, Card } from "@/components/ui";
import { activeOrg, requireUser } from "@/lib/auth";
import { isLearnerRole } from "@/lib/roleRouting";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Student workspace" };
export const dynamic = "force-dynamic";

/** A small, real entry point to the existing code-based candidate flows. */
export default async function StudentWorkspace() {
  const ctx = await requireUser();
  if (ctx.profile.platform_role === "super_admin") redirect("/admin");
  if (ctx.tenantDenied) redirect("/dashboard");
  const org = activeOrg(ctx);
  if (!org) redirect(ctx.memberships.length ? "/workspaces" : "/onboarding");
  if (ctx.memberships.length > 1 && !ctx.workspaceSelected) redirect("/workspaces");
  if (!isLearnerRole(org.role)) redirect("/dashboard");
  if (org.status !== "active") return <main className="mx-auto max-w-xl px-4 py-16"><Card className="p-6"><h1 className="font-display text-2xl font-semibold">Organization unavailable</h1><p className="mt-2 text-sm">This workspace is {org.status}. Contact your institution for assistance.</p></Card></main>;
  return <main className="mx-auto max-w-3xl px-4 py-12">
    <p className="text-sm font-semibold uppercase tracking-wide text-evergreen-700">{org.name}</p>
    <h1 className="mt-2 font-display text-3xl font-semibold text-evergreen-950">Welcome, {ctx.profile.full_name?.split(" ")[0] || "student"}</h1>
    <p className="mt-3 text-ink-soft">Use the code provided by your institution to enter an examination or join a live activity.</p>
    <div className="mt-7 grid gap-4 sm:grid-cols-2">
      <Card className="p-6"><h2 className="font-display text-xl font-semibold">Enter an examination</h2><p className="mt-2 text-sm text-ink-soft">Enter your examination and candidate codes to access your paper.</p><ButtonLink href="/exam-access" className="mt-4">Enter examination</ButtonLink></Card>
      <Card className="p-6"><h2 className="font-display text-xl font-semibold">Join a live activity</h2><p className="mt-2 text-sm text-ink-soft">Use your organizer’s join code to enter a live quiz.</p><ButtonLink href="/join" variant="outline" className="mt-4">Join activity</ButtonLink></Card>
    </div>
    <p className="mt-6 text-sm text-ink-soft">Your institution will provide codes and instructions. Assigned assessments and personal results are not yet listed here.</p>
    {ctx.memberships.length > 1 && !ctx.tenantSlug && <Link href="/workspaces" className="mt-6 block font-semibold text-evergreen-700 underline underline-offset-2">Switch workspace</Link>}
    <div className="mt-6"><SignOutButton /></div>
  </main>;
}
