import { Button, Card, Field, Input, PageTitle, Select, Textarea } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/utils";
import type { Metadata } from "next";
import Link from "next/link";
import { broadcastNotification, sendTargetedNotification } from "../actions";

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

  const head = { count: "exact" as const, head: true };
  const [audience, recent, { data: orgs }, pendingPayments, openTickets, openIncidents] = await Promise.all([
    admin.from("profiles").select("id", head).eq("status", "active"),
    admin
      .from("notifications")
      .select("id, title, body, link, created_at, profiles(email)")
      .eq("type", "system")
      .order("created_at", { ascending: false })
      .limit(20),
    admin.from("organizations").select("id, name").order("name").limit(500),
    admin.from("payment_requests").select("id", head).eq("status", "pending").then((r) => r.count ?? 0),
    admin.from("support_tickets").select("id", head).eq("status", "open").then((r) => r.count ?? 0),
    admin.from("proctoring_incidents").select("id", head).eq("status", "open").then((r) => r.count ?? 0),
  ]);

  const queues = [
    { label: "Payments awaiting verification", count: pendingPayments, href: "/admin/payments" },
    { label: "Open support tickets", count: openTickets, href: "/admin/support" },
    { label: "Proctoring incidents to review", count: openIncidents, href: "/admin/proctoring" },
  ];

  return (
    <>
      <PageTitle
        title="Notifications"
        subtitle="Attention queues, platform broadcasts and targeted messages. In-app delivery is immediate and audit-logged."
      />
      {sp.sent && <p className="mb-4 rounded-lg bg-evergreen-50 px-4 py-3 text-sm text-evergreen-900">Delivered to {sp.sent} user(s).</p>}
      {sp.e === "title" && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">A title is required.</p>}
      {sp.e === "send" && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">The broadcast could not be sent. Nothing was delivered.</p>}
      {sp.e === "user" && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">No account exists for that email.</p>}
      {sp.e === "empty" && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">That audience has no active members.</p>}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        {queues.map((q) => (
          <Link key={q.href} href={q.href} className="block">
            <Card className={`p-5 transition hover:shadow-md ${q.count > 0 ? "ring-2 ring-gold-500/60" : ""}`}>
              <p className="font-display text-3xl font-semibold text-evergreen-950">{q.count}</p>
              <p className="mt-1 text-sm text-ink-soft">{q.label}</p>
              <p className="mt-1 text-xs font-medium text-evergreen-700">{q.count > 0 ? "Review now →" : "All clear"}</p>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="font-display text-lg font-semibold text-evergreen-950">Broadcast to everyone</h2>
          <p className="mt-1 text-sm text-ink-soft">Goes to all {audience.count ?? 0} active user(s).</p>
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

        <Card className="p-6">
          <h2 className="font-display text-lg font-semibold text-evergreen-950">Targeted message</h2>
          <p className="mt-1 text-sm text-ink-soft">Notify one organization&apos;s members, or a single user by email.</p>
          <form action={sendTargetedNotification} className="mt-4 space-y-4">
            <Field label="Audience">
              <Select name="audience" defaultValue="org">
                <option value="org">All members of an organization</option>
                <option value="user">One user (by email)</option>
              </Select>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Organization">
                <Select name="organization_id">
                  {(orgs ?? []).map((o) => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </Select>
              </Field>
              <Field label="User email">
                <Input name="email" type="email" placeholder="user@example.com" />
              </Field>
            </div>
            <Field label="Title"><Input name="title" required maxLength={160} /></Field>
            <Field label="Message"><Textarea name="body" rows={3} maxLength={1000} /></Field>
            <Field label="Link"><Input name="link" defaultValue="/dashboard" maxLength={300} /></Field>
            <Button type="submit">Send targeted message</Button>
          </form>
        </Card>
      </div>

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
                  to {(n.profiles as unknown as { email?: string } | null)?.email ?? "user"} · {fmtDateTime(n.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
