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
  if (ctx.profile.status !== "active") redirect("/login?error=suspended");
  const admin = createAdminClient();
  const { data: inv } = await admin
    .from("invitations")
    .select("*")
    .eq("token", token)
    .eq("status", "pending")
    .maybeSingle();
  if (!inv || new Date(inv.expires_at) < new Date()) redirect(`/invite/${token}?e=expired`);
  if (inv.email.toLowerCase() !== ctx.user.email.toLowerCase()) redirect(`/invite/${token}?e=email`);

  // The database performs the membership insert and the plan check together;
  // doing it in two steps (as before) let a workspace exceed its member limit.
  const { data: outcome, error: acceptError } = await admin.rpc("accept_invitation", {
    p_token: token,
    p_user: ctx.user.id,
  });
  if (acceptError) redirect(`/invite/${token}?e=failed`);
  if (outcome === "limit") redirect(`/invite/${token}?e=limit`);
  if (outcome === "expired") redirect(`/invite/${token}?e=expired`);
  if (outcome === "invalid") redirect(`/invite/${token}?e=expired`);
  await admin.from("notifications").insert({
    user_id: ctx.user.id,
    type: "invitation",
    title: "Invitation accepted",
    body: "You joined a new organization workspace.",
    link: "/dashboard",
  });
  redirect("/auth/resolve");
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
      ) : sp.e === "limit" ? (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
          This workspace has reached the number of members included in its plan, so the invitation cannot be accepted
          yet. Ask an owner or administrator to upgrade the plan, then try this link again — it stays valid until it
          expires.
        </p>
      ) : sp.e === "failed" ? (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">
          The invitation could not be accepted. Nothing was changed — please try again, and tell your administrator if
          it keeps happening.
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
