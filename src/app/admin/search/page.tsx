import { Badge, Button, Card, EmptyState, Input, PageTitle, Select } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { fmtDate, money } from "@/lib/utils";
import { Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { StatusBadge } from "../ui";

export const metadata: Metadata = { title: "Search" };
export const dynamic = "force-dynamic";

export default async function AdminSearch({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; scope?: string }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const scope = (sp.scope ?? "").trim();
  const admin = createAdminClient();

  const searchBar = (
    <form method="get" className="mb-6 flex flex-wrap items-end gap-2 rounded-2xl border border-evergreen-900/15 bg-paper p-4 shadow-[var(--shadow-card)]">
      <div className="min-w-[240px] flex-1">
        <label htmlFor="global-search-input" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-soft">
          Search query
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
          <Input
            id="global-search-input"
            name="q"
            defaultValue={q}
            placeholder="Name, email, student ref, institution, exam, competition or payment reference…"
            className="pl-9"
          />
        </div>
      </div>
      <div className="w-full sm:w-52">
        <label htmlFor="global-search-scope" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-soft">
          Domain filter
        </label>
        <Select id="global-search-scope" name="scope" defaultValue={scope}>
          <option value="">All 7 domains</option>
          <option value="users">Users</option>
          <option value="organizations">Organizations</option>
          <option value="students">Students</option>
          <option value="competitions">Competitions</option>
          <option value="quizzes">Quizzes</option>
          <option value="exams">Examinations</option>
          <option value="payments">Payments</option>
        </Select>
      </div>
      <Button type="submit" variant="gold">Search platform</Button>
      {(q || scope) && (
        <Link href="/admin/search" className="inline-flex min-h-10 items-center px-3 text-sm font-medium text-evergreen-800 underline underline-offset-2">
          Clear
        </Link>
      )}
    </form>
  );

  if (q.length < 2) {
    return (
      <>
        <PageTitle
          eyebrow="Control Plane · Cross-Tenant Discovery"
          title="Global command search"
          subtitle="Sweep users, organizations, students, competitions, quizzes, formal examinations and payment references in a single query."
        />
        {searchBar}
        <EmptyState
          title="Enter at least 2 characters to search"
          body="Search by email address, candidate or student ID, school name, assessment title or payment transaction reference."
        />
      </>
    );
  }

  const safe = q.replace(/[,%()]/g, " ").trim();
  const like = `%${safe}%`;
  const [users, orgs, students, comps, quizzes, exams, payments] = await Promise.all([
    admin.from("profiles").select("id, full_name, email, platform_role, status").or(`full_name.ilike.${like},email.ilike.${like}`).limit(15),
    admin.from("organizations").select("id, name, type, status, country, city").ilike("name", like).limit(15),
    admin.from("students").select("id, full_name, student_ref, status, organizations(name)").or(`full_name.ilike.${like},student_ref.ilike.${like},email.ilike.${like}`).limit(15),
    admin.from("competitions").select("id, title, status, category").ilike("title", like).limit(15),
    admin.from("quizzes").select("id, title, status, organizations(name)").ilike("title", like).limit(15),
    admin.from("exams").select("id, title, status, organizations(name)").ilike("title", like).limit(15),
    admin.from("payment_requests").select("id, transaction_ref, payer_name, amount_cents, currency, status, created_at").or(`transaction_ref.ilike.${like},payer_name.ilike.${like}`).limit(15),
  ]);

  const counts = [
    { key: "users", label: "Users", n: users.data?.length ?? 0 },
    { key: "organizations", label: "Organizations", n: orgs.data?.length ?? 0 },
    { key: "students", label: "Students", n: students.data?.length ?? 0 },
    { key: "competitions", label: "Competitions", n: comps.data?.length ?? 0 },
    { key: "quizzes", label: "Quizzes", n: quizzes.data?.length ?? 0 },
    { key: "exams", label: "Examinations", n: exams.data?.length ?? 0 },
    { key: "payments", label: "Payments", n: payments.data?.length ?? 0 },
  ];
  const totalMatches = counts.reduce((sum, c) => sum + c.n, 0);
  const show = (key: string) => !scope || scope === key;

  const group = (title: string, count: number, rows: React.ReactNode[], empty: string) => (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-base font-semibold text-evergreen-950">{title}</h2>
        <Badge tone={count > 0 ? "green" : "gray"}>{count}</Badge>
      </div>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-ink-soft">{empty}</p>
      ) : (
        <ul className="mt-3 divide-y divide-evergreen-900/10 text-sm">{rows}</ul>
      )}
    </Card>
  );
  const row = (key: string, href: string, main: React.ReactNode, sub?: React.ReactNode, status?: string) => (
    <li key={key} className="flex items-start justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <Link href={href} className="font-medium text-evergreen-900 hover:underline">{main}</Link>
        {sub && <span className="block text-xs text-ink-soft">{sub}</span>}
      </div>
      {status && <StatusBadge status={status} />}
    </li>
  );

  return (
    <>
      <PageTitle
        eyebrow="Control Plane · Cross-Tenant Discovery"
        title={`Results for “${q}”`}
        subtitle={`${totalMatches} matching record(s) across people, institutions, assessments and payments.`}
        meta={counts.map((c) => (
          <Badge key={c.key} tone={c.n > 0 ? "gold" : "gray"}>
            {c.label}: {c.n}
          </Badge>
        ))}
      />
      {searchBar}

      <div className="grid gap-4 lg:grid-cols-2">
        {show("users") && group(
          "Users",
          users.data?.length ?? 0,
          (users.data ?? []).map((u) =>
            row(u.id, `/admin/users/${u.id}`, u.full_name || u.email, <>{u.email} · {u.platform_role}</>, u.status),
          ),
          "No matching users.",
        )}
        {show("organizations") && group(
          "Organizations & schools",
          orgs.data?.length ?? 0,
          (orgs.data ?? []).map((o) =>
            row(o.id, `/admin/organizations/${o.id}`, o.name, <>{o.type.replace(/_/g, " ")} · {[o.city, o.country].filter(Boolean).join(", ") || "—"}</>, o.status),
          ),
          "No matching organizations.",
        )}
        {show("students") && group(
          "Students",
          students.data?.length ?? 0,
          (students.data ?? []).map((s) =>
            row(s.id, `/admin/students?q=${encodeURIComponent(q)}`, s.full_name, <>{s.student_ref ?? "no ref"} · {(s.organizations as unknown as { name: string } | null)?.name}</>, s.status),
          ),
          "No matching students.",
        )}
        {show("competitions") && group(
          "Competitions",
          comps.data?.length ?? 0,
          (comps.data ?? []).map((c) =>
            row(c.id, `/admin/competitions/${c.id}`, c.title, <>{c.category || "General"}</>, c.status),
          ),
          "No matching competitions.",
        )}
        {show("quizzes") && group(
          "Quizzes",
          quizzes.data?.length ?? 0,
          (quizzes.data ?? []).map((z) =>
            row(z.id, `/admin/quizzes?q=${encodeURIComponent(q)}`, z.title, <>{(z.organizations as unknown as { name: string } | null)?.name}</>, z.status),
          ),
          "No matching quizzes.",
        )}
        {show("exams") && group(
          "Examinations",
          exams.data?.length ?? 0,
          (exams.data ?? []).map((e) =>
            row(e.id, `/admin/examinations?q=${encodeURIComponent(q)}`, e.title, <>{(e.organizations as unknown as { name: string } | null)?.name}</>, e.status),
          ),
          "No matching examinations.",
        )}
        {show("payments") && (
          <Card className="p-5 lg:col-span-2">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-base font-semibold text-evergreen-950">Payments</h2>
              <Badge tone={(payments.data?.length ?? 0) > 0 ? "green" : "gray"}>{payments.data?.length ?? 0}</Badge>
            </div>
            {(payments.data ?? []).length === 0 ? (
              <p className="mt-3 text-sm text-ink-soft">No matching payment references.</p>
            ) : (
              <ul className="mt-3 divide-y divide-evergreen-900/10 text-sm">
                {(payments.data ?? []).map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <Link href={`/admin/payments/${p.id}`} className="font-medium text-evergreen-900 hover:underline">
                      {p.transaction_ref} — {money(p.amount_cents, p.currency)}
                    </Link>
                    <span className="flex items-center gap-2 text-xs text-ink-soft">
                      {p.payer_name} <StatusBadge status={p.status} /> {fmtDate(p.created_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>
    </>
  );
}
