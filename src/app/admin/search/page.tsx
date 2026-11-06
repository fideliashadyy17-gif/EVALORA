import { Card, EmptyState, PageTitle } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { fmtDate, money } from "@/lib/utils";
import type { Metadata } from "next";
import Link from "next/link";
import { StatusBadge } from "../ui";

export const metadata: Metadata = { title: "Search" };
export const dynamic = "force-dynamic";

export default async function AdminSearch({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const admin = createAdminClient();

  if (q.length < 2) {
    return (
      <>
        <PageTitle title="Global search" subtitle="Type at least two characters in the top-bar search to sweep the whole platform." />
        <EmptyState title="Search everything" body="Users, organizations, schools, students, competitions, quizzes, examinations and payment references — one query." />
      </>
    );
  }

  const like = `%${q}%`;
  const [users, orgs, students, comps, quizzes, exams, payments] = await Promise.all([
    admin.from("profiles").select("id, full_name, email, platform_role, status").or(`full_name.ilike.${like},email.ilike.${like}`).limit(10),
    admin.from("organizations").select("id, name, type, status, country, city").ilike("name", like).limit(10),
    admin.from("students").select("id, full_name, student_ref, status, organizations(name)").or(`full_name.ilike.${like},student_ref.ilike.${like},email.ilike.${like}`).limit(10),
    admin.from("competitions").select("id, title, status, category").ilike("title", like).limit(10),
    admin.from("quizzes").select("id, title, status, organizations(name)").ilike("title", like).limit(10),
    admin.from("exams").select("id, title, status, organizations(name)").ilike("title", like).limit(10),
    admin.from("payment_requests").select("id, transaction_ref, payer_name, amount_cents, currency, status").or(`transaction_ref.ilike.${like},payer_name.ilike.${like}`).limit(10),
  ]);

  const group = (title: string, rows: React.ReactNode[], empty: string) => (
    <Card className="p-5">
      <h2 className="font-display text-base font-semibold text-evergreen-950">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-ink-soft">{empty}</p>
      ) : (
        <ul className="mt-2 divide-y divide-evergreen-900/10 text-sm">{rows}</ul>
      )}
    </Card>
  );
  const row = (key: string, href: string, main: React.ReactNode, sub?: React.ReactNode) => (
    <li key={key} className="py-2">
      <Link href={href} className="font-medium text-evergreen-900 hover:underline">{main}</Link>
      {sub && <span className="block text-xs text-ink-soft">{sub}</span>}
    </li>
  );

  return (
    <>
      <PageTitle title={`Results for “${q}”`} subtitle="Across people, institutions, events and money." />
      <div className="grid gap-4 lg:grid-cols-2">
        {group(
          "Users",
          (users.data ?? []).map((u) =>
            row(u.id, `/admin/users/${u.id}`, u.full_name || u.email, <>{u.email} · {u.platform_role} · {u.status}</>),
          ),
          "No matching users.",
        )}
        {group(
          "Organizations & schools",
          (orgs.data ?? []).map((o) =>
            row(o.id, `/admin/organizations/${o.id}`, o.name, <>{o.type.replace(/_/g, " ")} · {[o.city, o.country].filter(Boolean).join(", ") || "—"} · {o.status}</>),
          ),
          "No matching organizations.",
        )}
        {group(
          "Students",
          (students.data ?? []).map((s) =>
            row(s.id, `/admin/students`, s.full_name, <>{s.student_ref ?? "no ref"} · {(s.organizations as unknown as { name: string } | null)?.name} · {s.status}</>),
          ),
          "No matching students.",
        )}
        {group(
          "Competitions",
          (comps.data ?? []).map((c) =>
            row(c.id, `/admin/competitions/${c.id}`, c.title, <>{c.category} · {c.status}</>),
          ),
          "No matching competitions.",
        )}
        {group(
          "Quizzes",
          (quizzes.data ?? []).map((z) =>
            row(z.id, `/admin/quizzes`, z.title, <>{(z.organizations as unknown as { name: string } | null)?.name} · {z.status}</>),
          ),
          "No matching quizzes.",
        )}
        {group(
          "Examinations",
          (exams.data ?? []).map((e) =>
            row(e.id, `/admin/examinations`, e.title, <>{(e.organizations as unknown as { name: string } | null)?.name} · {e.status}</>),
          ),
          "No matching examinations.",
        )}
        <Card className="p-5 lg:col-span-2">
          <h2 className="font-display text-base font-semibold text-evergreen-950">Payments</h2>
          {(payments.data ?? []).length === 0 ? (
            <p className="mt-2 text-sm text-ink-soft">No matching payment references.</p>
          ) : (
            <ul className="mt-2 divide-y divide-evergreen-900/10 text-sm">
              {(payments.data ?? []).map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <Link href={`/admin/payments/${p.id}`} className="font-medium text-evergreen-900 hover:underline">
                    {p.transaction_ref} — {money(p.amount_cents, p.currency)}
                  </Link>
                  <span className="flex items-center gap-2 text-xs text-ink-soft">
                    {p.payer_name} <StatusBadge status={p.status} /> {fmtDate((p as { created_at?: string }).created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
