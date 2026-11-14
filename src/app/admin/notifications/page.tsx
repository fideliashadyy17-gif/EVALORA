import { PageNavigation } from "@/components/PageNavigation";
import { Badge, Button, Card, EmptyState, Field, Input, PageTitle, Select, StatCard, Textarea } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/utils";
import { Bell, CreditCard, LifeBuoy, ShieldAlert, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { broadcastNotification, sendTargetedNotification } from "../actions";
import { Section, Table } from "../ui";

export const metadata: Metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";

export default async function AdminNotifications({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; e?: string; page?: string }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const pageSize = 25;
  const admin = createAdminClient();

  const head = { count: "exact" as const, head: true };
  const [audience, recent, { data: orgs }, pendingPayments, openTickets, openIncidents] = await Promise.all([
    admin.from("profiles").select("id", head).eq("status", "active"),
    admin
      .from("notifications")
      .select("id, title, body, link, read_at, created_at, profiles(email)", { count: "exact" })
      .eq("type", "system")
      .order("created_at", { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1),
    admin.from("organizations").select("id, name").order("name").limit(500),
    admin.from("payment_requests").select("id", head).eq("status", "pending").then((r) => r.count ?? 0),
    admin.from("support_tickets").select("id", head).eq("status", "open").then((r) => r.count ?? 0),
    admin.from("proctoring_incidents").select("id", head).eq("status", "open").then((r) => r.count ?? 0),
  ]);

  const queues = [
    { label: "Payments awaiting verification", count: pendingPayments, href: "/admin/payments", icon: CreditCard },
    { label: "Open support tickets", count: openTickets, href: "/admin/support", icon: LifeBuoy },
    { label: "Proctoring incidents to review", count: openIncidents, href: "/admin/proctoring", icon: ShieldAlert },
  ];

  const rows = recent.data ?? [];

  return (
    <>
      <PageTitle
        eyebrow="Platform Administration · Alerts & Communications"
        title="Notifications & broadcast center"
        subtitle="Monitor operational attention queues and dispatch immediate, audit-logged in-app announcements to every user, an entire institution or an individual account."
      />
      {sp.sent && (
        <p role="status" className="mb-4 rounded-xl bg-evergreen-50 px-4 py-3 text-sm font-medium text-evergreen-900 ring-1 ring-evergreen-600/30">
          Delivered to {sp.sent} recipient(s).
        </p>
      )}
      {sp.e === "title" && <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">A notification title is required.</p>}
      {sp.e === "send" && <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">The broadcast could not be sent. Nothing was delivered.</p>}
      {sp.e === "user" && <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">No account exists for that email address.</p>}
      {sp.e === "empty" && <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">That target audience currently has no active members.</p>}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active audience" value={audience.count ?? 0} hint="Reachable platform accounts" icon={<Users className="h-5 w-5" />} />
        {queues.map((q) => (
          <Link key={q.href} href={q.href} className="block">
            <StatCard
              label={q.label}
              value={q.count}
              hint={q.count > 0 ? "Open queue →" : "All clear"}
              icon={<q.icon className="h-5 w-5" />}
            />
          </Link>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-6">
          <div className="flex items-center justify-between gap-2">
            <Badge tone="gold">Platform-wide announcement</Badge>
            <span className="text-xs text-ink-soft">{audience.count ?? 0} active users</span>
          </div>
          <h2 className="mt-2 font-display text-lg font-semibold text-evergreen-950">Broadcast to everyone</h2>
          <p className="mt-1 text-sm text-ink-soft">Delivers an immediate in-app alert to every active account on EVALORA.</p>
          <form action={broadcastNotification} className="mt-4 space-y-4">
            <Field label="Title">
              <Input name="title" required maxLength={140} placeholder="e.g. Scheduled maintenance window this Sunday" />
            </Field>
            <Field label="Message" hint="Plain text shown in every user's notification popover and inbox.">
              <Textarea name="body" rows={4} maxLength={1000} placeholder="Clear, concise details for your institutions and learners…" />
            </Field>
            <Field label="Destination link (optional)" hint="Internal path such as /dashboard or /pricing.">
              <Input name="link" maxLength={300} placeholder="/dashboard" />
            </Field>
            <label className="flex items-start gap-2.5 rounded-xl border border-evergreen-900/10 bg-cream/70 p-3 text-sm text-ink">
              <input type="checkbox" required className="mt-0.5 h-5 w-5 shrink-0 accent-evergreen-700" />
              <span>I confirm this announcement should be delivered immediately to every active user.</span>
            </label>
            <Button type="submit" variant="gold">Send platform broadcast</Button>
          </form>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between gap-2">
            <Badge tone="green">Scoped delivery</Badge>
            <Bell className="h-4 w-4 text-evergreen-700" />
          </div>
          <h2 className="mt-2 font-display text-lg font-semibold text-evergreen-950">Targeted message</h2>
          <p className="mt-1 text-sm text-ink-soft">Notify all members of a specific institution, or a single account by email.</p>
          <form action={sendTargetedNotification} className="mt-4 space-y-4">
            <Field label="Target audience">
              <Select name="audience" defaultValue="org">
                <option value="org">All members of an organization</option>
                <option value="user">Single user (by email)</option>
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
              <Field label="User email (when single user)">
                <Input name="email" type="email" placeholder="user@institution.org" />
              </Field>
            </div>
            <Field label="Title"><Input name="title" required maxLength={160} placeholder="Subject line…" /></Field>
            <Field label="Message"><Textarea name="body" rows={3} maxLength={1000} placeholder="Message details…" /></Field>
            <Field label="Destination link"><Input name="link" defaultValue="/dashboard" maxLength={300} /></Field>
            <Button type="submit">Send targeted message</Button>
          </form>
        </Card>
      </div>

      <Section title="Dispatched system notifications" hint="Paginated log of system notifications delivered to platform accounts.">
        {rows.length === 0 ? (
          <EmptyState title="No system notifications dispatched yet" body="Broadcasts and targeted messages sent from this console appear here." />
        ) : (
          <Table head={["Sent", "Recipient", "Title & Message", "Link", "Status"]}>
            {rows.map((n) => (
              <tr key={n.id}>
                <td className="whitespace-nowrap text-xs text-ink-soft">{fmtDateTime(n.created_at)}</td>
                <td className="text-xs font-medium text-evergreen-900">
                  {(n.profiles as unknown as { email?: string } | null)?.email ?? "User"}
                </td>
                <td className="max-w-md">
                  <p className="font-semibold text-evergreen-950">{n.title}</p>
                  {n.body && <p className="mt-0.5 line-clamp-2 text-xs text-ink-soft">{n.body}</p>}
                </td>
                <td className="font-mono text-xs text-ink-soft">{n.link || "—"}</td>
                <td>
                  <Badge tone={n.read_at ? "gray" : "gold"}>{n.read_at ? "Read" : "Unread"}</Badge>
                </td>
              </tr>
            ))}
          </Table>
        )}
        <PageNavigation
          page={page}
          pageSize={pageSize}
          total={recent.count ?? 0}
          pathname="/admin/notifications"
          label="notifications"
        />
      </Section>
    </>
  );
}
