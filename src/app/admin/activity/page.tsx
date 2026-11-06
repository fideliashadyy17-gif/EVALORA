import { Badge, PageTitle } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { fmtDateTime, money } from "@/lib/utils";
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

export default async function RecentOperationsPage() {
  await requireSuperAdmin();
  const admin = createAdminClient();

  const [audit, users, orgs, students, questions, quizzes, competitions, exams, payments, notifications, tickets] = await Promise.all([
    admin.from("audit_logs").select("*, profiles(email), organizations(name)").order("created_at", { ascending: false }).limit(40),
    admin.from("profiles").select("id, email, full_name, platform_role, created_at").order("created_at", { ascending: false }).limit(10),
    admin.from("organizations").select("id, name, type, status, created_at").order("created_at", { ascending: false }).limit(10),
    admin.from("students").select("id, full_name, status, created_at, updated_at, organizations(name)").order("updated_at", { ascending: false }).limit(10),
    admin.from("questions").select("id, prompt, type, status, updated_at, organizations(name)").order("updated_at", { ascending: false }).limit(10),
    admin.from("quizzes").select("id, title, status, updated_at, organization_id, organizations(name)").order("updated_at", { ascending: false }).limit(10),
    admin.from("competitions").select("id, title, status, updated_at, organizations(name)").order("updated_at", { ascending: false }).limit(10),
    admin.from("exams").select("id, title, status, created_at, organizations(name)").order("created_at", { ascending: false }).limit(10),
    admin.from("payment_requests").select("id, amount_cents, currency, status, transaction_ref, created_at, organizations(name)").order("created_at", { ascending: false }).limit(10),
    admin.from("notifications").select("id, title, type, created_at").order("created_at", { ascending: false }).limit(5),
    admin.from("support_tickets").select("id, subject, status, created_at").order("created_at", { ascending: false }).limit(5),
  ]);

  const events: EventRow[] = [
    ...((users.data ?? []).map((u) => ({ at: u.created_at, kind: "User", label: u.full_name || u.email, detail: `${u.email} · ${u.platform_role}`, href: `/admin/users/${u.id}`, tone: "green" as const }))),
    ...((orgs.data ?? []).map((o) => ({ at: o.created_at, kind: "Organization", label: o.name, detail: `${String(o.type).replace(/_/g, " ")} · ${o.status}`, href: `/admin/organizations/${o.id}`, tone: "green" as const }))),
    ...((students.data ?? []).map((s) => ({ at: s.updated_at ?? s.created_at, kind: "Student", label: s.full_name, detail: `${asName(s.organizations)} · ${s.status}`, href: "/admin/students", tone: "gray" as const }))),
    ...((questions.data ?? []).map((q) => ({ at: q.updated_at, kind: "Question", label: String(q.prompt).slice(0, 90), detail: `${asName(q.organizations)} · ${String(q.type).replace(/_/g, " ")} · ${q.status}`, href: `/admin/questions/${q.id}`, tone: "gold" as const }))),
    ...((quizzes.data ?? []).map((q) => ({ at: q.updated_at, kind: "Quiz", label: q.title, detail: `${asName(q.organizations)} · ${q.status}`, href: "/admin/quizzes", tone: "gray" as const }))),
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
  ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 60);

  return (
    <>
      <PageTitle
        title="Recent operations"
        subtitle="A cross-module operational timeline, followed by the latest authenticated administrative actions from the audit trail."
      />

      <Section title="Latest platform records">
        {events.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-evergreen-900/30 bg-paper px-6 py-12 text-center text-sm text-ink-soft">No platform records yet.</p>
        ) : (
          <Table head={["Time", "Module", "Record", "Detail", "Open"]}>
            {events.map((e, i) => (
              <tr key={`${e.kind}-${e.at}-${i}`}>
                <td className="whitespace-nowrap text-ink-soft">{fmtDateTime(e.at)}</td>
                <td><Badge tone={e.tone}>{e.kind}</Badge></td>
                <td className="max-w-sm font-medium text-evergreen-950">{e.label}</td>
                <td className="text-ink-soft">{e.detail}</td>
                <td><Link href={e.href} className="font-medium text-evergreen-700 hover:underline">Open →</Link></td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <Section title="Latest audited actions" hint="Activity Monitoring contains the full searchable audit log.">
        {(audit.data ?? []).length === 0 ? (
          <p className="rounded-2xl border border-dashed border-evergreen-900/30 bg-paper px-6 py-12 text-center text-sm text-ink-soft">No audit events yet.</p>
        ) : (
          <Table head={["Time", "Actor", "Action", "Entity", "Organization"]}>
            {(audit.data ?? []).map((a) => (
              <tr key={a.id}>
                <td className="whitespace-nowrap text-ink-soft">{fmtDateTime(a.created_at)}</td>
                <td className="text-ink-soft">{(a.profiles as unknown as { email?: string } | null)?.email ?? "System / operator"}</td>
                <td><span className="font-mono text-xs">{a.action}</span></td>
                <td className="text-ink-soft">{a.entity ?? "—"}</td>
                <td className="text-ink-soft">{(a.organizations as unknown as { name?: string } | null)?.name ?? "Platform"}</td>
              </tr>
            ))}
          </Table>
        )}
        <Link href="/admin/audit" className="mt-4 inline-block font-medium text-evergreen-700 underline-offset-2 hover:underline">
          Open full Activity Monitoring / Audit Logs →
        </Link>
      </Section>
    </>
  );
}
