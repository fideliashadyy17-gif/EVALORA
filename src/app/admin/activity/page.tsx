import { Badge, Button, ButtonLink, EmptyState, Input, PageTitle, Select, StatCard } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { fmtDateTime, money } from "@/lib/utils";
import { Activity, CreditCard, Layers, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Section, Table } from "../ui";

export const metadata: Metadata = { title: "Recent operations" };
export const dynamic = "force-dynamic";

interface EventRow {
  at: string;
  kind: string;
  label: string;
  detail: string;
  href: string;
  tone: "green" | "gold" | "gray" | "amber";
}

const asName = (value: unknown) => {
  if (value && typeof value === "object" && "name" in value) return String((value as { name?: string }).name ?? "—");
  return "—";
};

export default async function RecentOperationsPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; q?: string }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const kindFilter = (sp.kind ?? "").trim();
  const q = (sp.q ?? "").trim().toLowerCase();
  const admin = createAdminClient();

  const [audit, users, orgs, students, questions, quizzes, competitions, exams, payments, notifications, tickets] = await Promise.all([
    admin.from("audit_logs").select("*, profiles(email), organizations(name)").order("created_at", { ascending: false }).limit(40),
    admin.from("profiles").select("id, email, full_name, platform_role, created_at").order("created_at", { ascending: false }).limit(12),
    admin.from("organizations").select("id, name, type, status, created_at").order("created_at", { ascending: false }).limit(12),
    admin.from("students").select("id, full_name, status, created_at, updated_at, organizations(name)").order("updated_at", { ascending: false }).limit(12),
    admin.from("questions").select("id, prompt, type, status, updated_at, organizations(name)").order("updated_at", { ascending: false }).limit(12),
    admin.from("quizzes").select("id, title, status, updated_at, organization_id, organizations(name)").order("updated_at", { ascending: false }).limit(12),
    admin.from("competitions").select("id, title, status, updated_at, organizations(name)").order("updated_at", { ascending: false }).limit(12),
    admin.from("exams").select("id, title, status, created_at, organizations(name)").order("created_at", { ascending: false }).limit(12),
    admin.from("payment_requests").select("id, amount_cents, currency, status, transaction_ref, created_at, organizations(name)").order("created_at", { ascending: false }).limit(12),
    admin.from("notifications").select("id, title, type, created_at").order("created_at", { ascending: false }).limit(8),
    admin.from("support_tickets").select("id, subject, status, created_at").order("created_at", { ascending: false }).limit(8),
  ]);

  const allEvents: EventRow[] = [
    ...((users.data ?? []).map((u) => ({ at: u.created_at, kind: "User", label: u.full_name || u.email, detail: `${u.email} · ${u.platform_role}`, href: `/admin/users/${u.id}`, tone: "green" as const }))),
    ...((orgs.data ?? []).map((o) => ({ at: o.created_at, kind: "Organization", label: o.name, detail: `${String(o.type).replace(/_/g, " ")} · ${o.status}`, href: `/admin/organizations/${o.id}`, tone: "green" as const }))),
    ...((students.data ?? []).map((s) => ({ at: s.updated_at ?? s.created_at, kind: "Student", label: s.full_name, detail: `${asName(s.organizations)} · ${s.status}`, href: "/admin/students", tone: "gray" as const }))),
    ...((questions.data ?? []).map((row) => ({ at: row.updated_at, kind: "Question", label: String(row.prompt).slice(0, 90), detail: `${asName(row.organizations)} · ${String(row.type).replace(/_/g, " ")} · ${row.status}`, href: `/admin/questions/${row.id}`, tone: "gold" as const }))),
    ...((quizzes.data ?? []).map((row) => ({ at: row.updated_at, kind: "Quiz", label: row.title, detail: `${asName(row.organizations)} · ${row.status}`, href: "/admin/quizzes", tone: "gray" as const }))),
    ...((competitions.data ?? []).map((c) => ({ at: c.updated_at, kind: "Competition", label: c.title, detail: `${asName(c.organizations)} · ${c.status}`, href: `/admin/competitions/${c.id}`, tone: "gold" as const }))),
    ...((exams.data ?? []).map((e) => ({ at: e.created_at, kind: "Examination", label: e.title, detail: `${asName(e.organizations)} · ${e.status}`, href: "/admin/examinations", tone: "amber" as const }))),
    ...((payments.data ?? []).map((p) => ({
      at: p.created_at,
      kind: "Payment",
      label: p.transaction_ref,
      detail: `${asName(p.organizations)} · ${money(Number(p.amount_cents), p.currency)} · ${p.status}`,
      href: `/admin/payments/${p.id}`,
      tone: p.status === "approved" ? "green" as const : "amber" as const,
    }))),
    ...((notifications.data ?? []).map((n) => ({ at: n.created_at, kind: "Notification", label: n.title, detail: n.type, href: "/admin/notifications", tone: "gray" as const }))),
    ...((tickets.data ?? []).map((t) => ({ at: t.created_at, kind: "Support", label: t.subject, detail: t.status, href: "/admin/support", tone: "amber" as const }))),
  ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

  const events = allEvents
    .filter((e) => (!kindFilter || e.kind === kindFilter) && (!q || `${e.label} ${e.detail} ${e.kind}`.toLowerCase().includes(q)))
    .slice(0, 60);

  const kinds = ["Organization", "User", "Student", "Examination", "Competition", "Quiz", "Question", "Payment", "Support", "Notification"];

  return (
    <>
      <PageTitle
        eyebrow="Overview · Operational Pulse"
        title="Recent operations"
        subtitle="Unified chronological feed of entity changes across institutions, assessments and commerce, paired with the latest privileged operator actions."
        action={<ButtonLink href="/admin/audit" variant="outline">Full security audit log</ButtonLink>}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Recent stream items" value={allEvents.length} hint={`${events.length} shown`} icon={<Layers className="h-5 w-5" />} />
        <StatCard label="Audited operator actions" value={(audit.data ?? []).length} hint="Latest 40 entries" icon={<ShieldCheck className="h-5 w-5" />} />
        <StatCard label="Recent assessments" value={(exams.data?.length ?? 0) + (competitions.data?.length ?? 0) + (quizzes.data?.length ?? 0)} icon={<Activity className="h-5 w-5" />} />
        <StatCard label="Recent commerce & support" value={(payments.data?.length ?? 0) + (tickets.data?.length ?? 0)} icon={<CreditCard className="h-5 w-5" />} />
      </div>

      <form method="get" className="mb-5 flex flex-wrap items-end gap-2 rounded-2xl border border-evergreen-900/15 bg-paper p-4 shadow-[var(--shadow-card)]">
        <div className="min-w-[220px] flex-1">
          <label htmlFor="activity-q" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-soft">Filter stream</label>
          <Input id="activity-q" name="q" defaultValue={sp.q ?? ""} placeholder="Filter by title, school, email or status…" />
        </div>
        <div className="w-full sm:w-52">
          <label htmlFor="activity-kind" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-soft">Module</label>
          <Select id="activity-kind" name="kind" defaultValue={kindFilter}>
            <option value="">All modules</option>
            {kinds.map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </Select>
        </div>
        <Button type="submit" variant="outline">Filter</Button>
        {(kindFilter || q) && (
          <Link href="/admin/activity" className="inline-flex min-h-10 items-center px-3 text-sm font-medium text-evergreen-800 underline underline-offset-2">
            Clear
          </Link>
        )}
      </form>

      <Section title="Latest platform records" hint="Merged across all multi-tenant operational tables in reverse chronological order.">
        {events.length === 0 ? (
          <EmptyState
            title="No matching operational records"
            body="Clear your stream filters or create an organization, assessment or payment to populate the timeline."
          />
        ) : (
          <Table head={["Time", "Module", "Record", "Detail", "Open"]}>
            {events.map((e, i) => (
              <tr key={`${e.kind}-${e.at}-${i}`}>
                <td className="whitespace-nowrap text-xs text-ink-soft">{fmtDateTime(e.at)}</td>
                <td><Badge tone={e.tone}>{e.kind}</Badge></td>
                <td className="max-w-sm font-medium text-evergreen-950">{e.label}</td>
                <td className="text-ink-soft">{e.detail}</td>
                <td><Link href={e.href} className="font-medium text-evergreen-700 hover:underline">Open →</Link></td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <Section title="Latest audited actions" hint="Privileged actions executed by Super Admins and workspace administrators.">
        {(audit.data ?? []).length === 0 ? (
          <EmptyState title="No audit events yet" body="Privileged operator actions are recorded automatically." />
        ) : (
          <Table head={["Time", "Actor", "Action", "Entity", "Organization"]}>
            {(audit.data ?? []).map((a) => (
              <tr key={a.id}>
                <td className="whitespace-nowrap text-xs text-ink-soft">{fmtDateTime(a.created_at)}</td>
                <td className="text-ink-soft">{(a.profiles as unknown as { email?: string } | null)?.email ?? "System / operator"}</td>
                <td><Badge tone="gray" className="font-mono text-[11px]">{a.action}</Badge></td>
                <td className="text-ink-soft">{a.entity ?? "—"}</td>
                <td className="text-ink-soft">{(a.organizations as unknown as { name?: string } | null)?.name ?? "Platform"}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
    </>
  );
}
