import { PageNavigation } from "@/components/PageNavigation";
import { Badge, Button, ButtonLink, Card, EmptyState, Input, PageTitle, Select, StatCard, buttonClass } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/utils";
import { CheckCircle2, Clock3, Inbox, LifeBuoy, Mail } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { setTicketStatus } from "../actions";

export const metadata: Metadata = { title: "Support tickets" };
export const dynamic = "force-dynamic";

export default async function AdminSupport({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const statusFilter = (sp.status ?? "").trim();
  const q = (sp.q ?? "").trim();
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const pageSize = 20;
  const admin = createAdminClient();
  const head = { count: "exact" as const, head: true };

  let query = admin
    .from("support_tickets")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (statusFilter && ["open", "in_progress", "closed"].includes(statusFilter)) {
    query = query.eq("status", statusFilter);
  }
  if (q) {
    const safe = q.replace(/[,%()]/g, " ").trim();
    if (safe) query = query.or(`subject.ilike.%${safe}%,name.ilike.%${safe}%,email.ilike.%${safe}%,message.ilike.%${safe}%`);
  }

  const [{ data, count: filteredTotal }, openCount, inProgressCount, closedCount] = await Promise.all([
    query,
    admin.from("support_tickets").select("id", head).eq("status", "open").then((r) => r.count ?? 0),
    admin.from("support_tickets").select("id", head).eq("status", "in_progress").then((r) => r.count ?? 0),
    admin.from("support_tickets").select("id", head).eq("status", "closed").then((r) => r.count ?? 0),
  ]);

  const tickets = data ?? [];
  const totalAll = openCount + inProgressCount + closedCount;
  const hasFilters = Boolean(statusFilter || q);

  const tabs = [
    { key: "", label: "All tickets", count: totalAll },
    { key: "open", label: "Open", count: openCount },
    { key: "in_progress", label: "In progress", count: inProgressCount },
    { key: "closed", label: "Closed", count: closedCount },
  ];

  return (
    <>
      <PageTitle
        eyebrow="Platform Administration · Customer Operations"
        title="Support triage desk"
        subtitle="Inbound inquiries from institutions, organizers and candidates via the public contact channel. Reply directly by email and track resolution status."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Open queue" value={openCount} hint={openCount > 0 ? "Needs first response" : "Inbox zero"} icon={<LifeBuoy className="h-5 w-5" />} />
        <StatCard label="In progress" value={inProgressCount} hint="Active investigation" icon={<Clock3 className="h-5 w-5" />} />
        <StatCard label="Resolved / closed" value={closedCount} icon={<CheckCircle2 className="h-5 w-5" />} />
        <StatCard label="Total inquiries" value={totalAll} icon={<Inbox className="h-5 w-5" />} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {tabs.map((tab) => {
          const active = statusFilter === tab.key;
          const params = new URLSearchParams();
          if (tab.key) params.set("status", tab.key);
          if (q) params.set("q", q);
          const href = params.toString() ? `/admin/support?${params.toString()}` : "/admin/support";
          return (
            <Link
              key={tab.label}
              href={href}
              className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
                active
                  ? "border-evergreen-800 bg-evergreen-800 text-white"
                  : "border-evergreen-900/15 bg-paper text-evergreen-900 hover:bg-evergreen-50"
              }`}
            >
              <span>{tab.label}</span>
              <span className={`rounded-full px-2 py-0.5 tabular-nums ${active ? "bg-white/20 text-white" : "bg-cream text-ink-soft"}`}>
                {tab.count}
              </span>
            </Link>
          );
        })}
      </div>

      <form method="get" className="mb-6 flex flex-wrap items-end gap-2 rounded-2xl border border-evergreen-900/15 bg-paper p-4 shadow-[var(--shadow-card)]">
        <div className="min-w-[220px] flex-1">
          <label htmlFor="support-q" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-soft">Search tickets</label>
          <Input id="support-q" name="q" defaultValue={q} placeholder="Search subject, sender name, email or message…" />
        </div>
        <div className="w-full sm:w-48">
          <label htmlFor="support-status" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-soft">Status</label>
          <Select id="support-status" name="status" defaultValue={statusFilter}>
            <option value="">All statuses</option>
            <option value="open">Open</option>
            <option value="in_progress">In progress</option>
            <option value="closed">Closed</option>
          </Select>
        </div>
        <Button type="submit" variant="outline">Filter</Button>
        {hasFilters && (
          <Link href="/admin/support" className="inline-flex min-h-10 items-center px-3 text-sm font-medium text-evergreen-800 underline underline-offset-2">
            Clear
          </Link>
        )}
      </form>

      {tickets.length === 0 ? (
        <EmptyState
          title={hasFilters ? "No support tickets match these filters" : "No support tickets yet"}
          body={hasFilters ? "Clear the search or switch status tabs to inspect other customer inquiries." : "Messages submitted from the public contact form will appear here for triage."}
          action={hasFilters ? <ButtonLink href="/admin/support" variant="outline">Show all tickets</ButtonLink> : undefined}
        />
      ) : (
        <div className="space-y-4">
          {tickets.map((t) => {
            const isOpen = t.status === "open";
            const isProgress = t.status === "in_progress";
            return (
              <Card
                key={t.id}
                className={`p-5 sm:p-6 ${isOpen ? "border-l-4 border-l-gold-500" : isProgress ? "border-l-4 border-l-evergreen-600" : ""}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={isOpen ? "amber" : t.status === "closed" ? "gray" : "green"}>
                        {t.status.replace(/_/g, " ")}
                      </Badge>
                      <span className="text-xs text-ink-soft">Received {fmtDateTime(t.created_at)}</span>
                    </div>
                    <h2 className="mt-2 font-display text-lg font-semibold text-evergreen-950">{t.subject}</h2>
                    <p className="mt-0.5 text-sm text-ink-soft">
                      <strong className="font-medium text-ink">{t.name}</strong> ·{" "}
                      <a href={`mailto:${t.email}`} className="text-evergreen-800 underline underline-offset-2">{t.email}</a>
                    </p>
                  </div>

                  {t.email && (
                    <a
                      href={`mailto:${t.email}?subject=${encodeURIComponent(`Re: ${t.subject}`)}`}
                      className={buttonClass("outline", "text-xs")}
                    >
                      <Mail className="h-4 w-4" /> Reply by email
                    </a>
                  )}
                </div>

                <div className="mt-4 rounded-xl border border-evergreen-900/10 bg-cream/70 p-4 text-sm leading-relaxed whitespace-pre-wrap text-ink">
                  {t.message}
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-evergreen-900/10 pt-3">
                  <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">Set status:</span>
                  {(["open", "in_progress", "closed"] as const)
                    .filter((s) => s !== t.status)
                    .map((s) => (
                      <form key={s} action={setTicketStatus}>
                        <input type="hidden" name="id" value={t.id} />
                        <input type="hidden" name="status" value={s} />
                        <Button
                          type="submit"
                          variant={s === "closed" ? "primary" : "outline"}
                          className="px-3 py-1.5 text-xs"
                        >
                          Mark {s.replace(/_/g, " ")}
                        </Button>
                      </form>
                    ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <PageNavigation
        page={page}
        pageSize={pageSize}
        total={filteredTotal ?? 0}
        pathname="/admin/support"
        query={{ status: statusFilter || undefined, q: q || undefined }}
        label="support tickets"
      />
    </>
  );
}
