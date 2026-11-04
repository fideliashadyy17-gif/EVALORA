import { AuthShell } from "@/components/AuthShell";
import { Button, ButtonLink } from "@/components/ui";
import { getSessionContext } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Organization invitation" };

async function accept(formData: FormData) {
  "use server";
  const token = String(formData.get("token"));
  const ctx = await getSessionContext();
  if (!ctx) redirect(`/login?next=/invite/${token}`);
  const admin = createAdminClient();
  const { data: inv } = await admin
    .from("invitations")
    .select("*")
    .eq("token", token)
    .eq("status", "pending")
    .maybeSingle();
  if (!inv || new Date(inv.expires_at) < new Date()) redirect(`/invite/${token}?e=expired`);
  if (inv.email.toLowerCase() !== ctx.user.email.toLowerCase()) redirect(`/invite/${token}?e=email`);

  await admin.from("organization_members").upsert(
    { organization_id: inv.organization_id, user_id: ctx.user.id, role: inv.role, status: "active" },
    { onConflict: "organization_id,user_id" },
  );
  await admin.from("invitations").update({ status: "accepted" }).eq("id", inv.id);
  await admin.from("notifications").insert({
    user_id: ctx.user.id,
    type: "invitation",
    title: "Invitation accepted",
    body: "You joined a new organization workspace.",
    link: "/dashboard",
  });
  redirect("/dashboard");
}

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ e?: string }>;
}) {
  const { token } = await params;
  const sp = await searchParams;
  const admin = createAdminClient();
  const { data: inv } = await admin
    .from("invitations")
    .select("*, organizations(name)")
    .eq("token", token)
    .maybeSingle();
  const ctx = await getSessionContext();

  return (
    <AuthShell title="You've been invited" subtitle="Join the organization workspace on EVALORA.">
      {!inv || inv.status !== "pending" ? (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">
          This invitation is no longer valid. Ask your administrator for a new one.
        </p>
      ) : sp.e === "email" ? (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">
          This invitation was sent to <strong>{inv.email}</strong>. Sign in with that email address to accept it.
        </p>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-ink-soft">
            <strong className="text-ink">{(inv.organizations as { name: string } | null)?.name ?? "An organization"}</strong>{" "}
            invites you to join as <strong className="text-ink">{inv.role}</strong>.
          </p>
          {ctx ? (
            <form action={accept}>
              <input type="hidden" name="token" value={token} />
              <Button type="submit" variant="gold" className="w-full py-3">Accept invitation</Button>
            </form>
          ) : (
            <div className="grid gap-2">
              <ButtonLink href={`/login?next=/invite/${token}`} className="py-3">Sign in to accept</ButtonLink>
              <ButtonLink href="/register" variant="outline" className="py-3">Create an account</ButtonLink>
            </div>
          )}
        </div>
      )}
    </AuthShell>
  );
}
