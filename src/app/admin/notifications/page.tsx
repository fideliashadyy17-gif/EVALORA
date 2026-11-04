import { Button, Card, Field, Input, PageTitle, Textarea } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/utils";
import type { Metadata } from "next";
import { broadcastNotification } from "../actions";

export const metadata: Metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";

export default async function AdminNotifications({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; e?: string }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const admin = createAdminClient();

  const [audience, recent] = await Promise.all([
    admin.from("profiles").select("id", { count: "exact", head: true }).eq("status", "active"),
    admin
      .from("notifications")
      .select("id, title, body, link, created_at, profiles(email)")
      .eq("type", "system")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  return (
    <>
      <PageTitle
        title="Notifications"
        subtitle={`Broadcast an in-app announcement to all ${audience.count ?? 0} active user(s). Email delivery joins once a mail provider is configured — in-app delivery is immediate and audit-logged.`}
      />
      {sp.sent && <p className="mb-4 rounded-lg bg-evergreen-50 px-4 py-3 text-sm text-evergreen-900">Broadcast delivered to {sp.sent} user(s).</p>}
      {sp.e === "title" && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">A title is required.</p>}
      {sp.e === "send" && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">The broadcast could not be sent. Nothing was delivered.</p>}

      <Card className="p-6">
        <h2 className="font-display text-lg font-semibold text-evergreen-950">New broadcast</h2>
        <form action={broadcastNotification} className="mt-4 space-y-4">
          <Field label="Title">
            <Input name="title" required maxLength={140} placeholder="e.g. Scheduled maintenance this Sunday" />
          </Field>
          <Field label="Message" hint="Plain text shown in every user's notification center.">
            <Textarea name="body" rows={4} maxLength={1000} placeholder="Details for your users…" />
          </Field>
          <Field label="Link (optional)" hint="Internal path such as /dashboard or /pricing.">
            <Input name="link" maxLength={300} placeholder="/dashboard" />
          </Field>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" required className="h-5 w-5 accent-evergreen-700" />
            I confirm this announcement should go to every active user now.
          </label>
          <Button type="submit" variant="gold">Send broadcast</Button>
        </form>
      </Card>

      <Card className="mt-6 p-6">
        <h2 className="font-display text-lg font-semibold text-evergreen-950">Recent system notifications</h2>
        {(recent.data ?? []).length === 0 ? (
          <p className="mt-2 text-sm text-ink-soft">No broadcasts sent yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-evergreen-900/10 text-sm">
            {(recent.data ?? []).map((n) => (
              <li key={n.id} className="py-2.5">
                <span className="font-medium">{n.title}</span>
                <span className="block text-xs text-ink-soft">
                  to {(n.profiles as { email?: string } | null)?.email ?? "user"} · {fmtDateTime(n.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
