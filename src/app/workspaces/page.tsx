import { SignOutButton } from "@/components/SignOutButton";
import { Button, Card } from "@/components/ui";
import { activeOrg, MEMBER_ORG_COOKIE, requireUser } from "@/lib/auth";
import { postAuthDestination } from "@/lib/roleRouting";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Choose a workspace" };
export const dynamic = "force-dynamic";

async function selectWorkspace(formData: FormData) {
  "use server";
  const ctx = await requireUser();
  if (ctx.profile.platform_role === "super_admin") redirect("/admin");
  if (ctx.tenantSlug || ctx.tenantDenied) redirect("/dashboard");
  const id = String(formData.get("organization_id") ?? "");
  const member = ctx.memberships.find((m) => m.organization_id === id && m.organizations?.status === "active");
  if (!member) redirect("/workspaces?error=selection");
  const store = await cookies();
  store.set(MEMBER_ORG_COOKIE, member.organization_id, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30,
  });
  redirect(postAuthDestination({ platformRole: ctx.profile.platform_role, role: member.role, hasOrg: true }, null));
}

export default async function WorkspacesPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const ctx = await requireUser();
  if (ctx.profile.platform_role === "super_admin") redirect("/admin");
  if (ctx.tenantSlug || ctx.tenantDenied) redirect("/dashboard");
  if (!ctx.memberships.length) redirect("/onboarding");
  const selected = ctx.workspaceSelected ? activeOrg(ctx)?.id : null;
  const sp = await searchParams;
  return <main className="mx-auto max-w-2xl px-4 py-12">
    <h1 className="font-display text-3xl font-semibold text-evergreen-950">Choose your workspace</h1>
    <p className="mt-2 text-ink-soft">Select an organization where you have an active membership. Each workspace remains separate.</p>
    {sp.error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">That workspace is not available. Please choose an active membership.</p>}
    <div className="mt-6 space-y-3">{ctx.memberships.map((membership) => {
      const org = membership.organizations;
      return <Card key={membership.organization_id} className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div><h2 className="font-semibold text-evergreen-950">{org?.name ?? "Unavailable organization"}</h2><p className="text-sm capitalize text-ink-soft">{membership.role}{selected === membership.organization_id ? " · selected" : ""}{org && org.status !== "active" ? ` · ${org.status}` : ""}</p></div>
        {org?.status === "active" && <form action={selectWorkspace}><input type="hidden" name="organization_id" value={membership.organization_id} /><Button type="submit" variant="outline">Open workspace</Button></form>}
      </Card>;
    })}</div>
    <div className="mt-7"><SignOutButton /></div>
  </main>;
}
