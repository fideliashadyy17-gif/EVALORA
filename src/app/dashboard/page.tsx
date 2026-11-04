import { Badge, ButtonLink, Card, PageTitle, StatCard } from "@/components/ui";
import { activeOrg, requireUser } from "@/lib/auth";
import { getEntitlement } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { fmtDate, fmtDateTime } from "@/lib/utils";
import { FileCheck2, Library, PenSquare, Radio, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  const supabase = await createClient();

  const [quizzes, questions, exams, members, sessions, recentSessions, upcomingExams] =
    await Promise.all([
      supabase.from("quizzes").select("id", { count: "exact", head: true }).eq("organization_id", org.id),
      supabase.from("questions").select("id", { count: "exact", head: true }).eq("organization_id", org.id),
      supabase.from("exams").select("id", { count: "exact", head: true }).eq("organization_id", org.id),
      supabase.from("organization_members").select("id", { count: "exact", head: true }).eq("organization_id", org.id),
      supabase.from("quiz_sessions").select("id", { count: "exact", head: true }).eq("organization_id", org.id).in("status", ["lobby", "live"]),
      supabase.from("quiz_sessions").select("*, quizzes(title)").eq("organization_id", org.id).order("created_at", { ascending: false }).limit(5),
      supabase.from("exams").select("*").eq("organization_id", org.id).order("created_at", { ascending: false }).limit(5),
    ]);

  const entitlement = await getEntitlement(supabase, org.id);

  return (
    <>
      <PageTitle
        title={`Welcome, ${ctx.profile.full_name?.split(" ")[0] || "there"}`}
        subtitle={`${org.name} · Your assessment workspace at a glance.`}
        action={<ButtonLink href="/dashboard/quizzes/new">+ New quiz</ButtonLink>}
      />

      <Card className="mb-6 flex flex-wrap items-center justify-between gap-3 border-evergreen-700/30 bg-evergreen-50 p-5">
        <div className="flex items-center gap-3">
          <Badge tone="gold">{entitlement.planName} plan</Badge>
          <p className="text-sm text-ink">
            {entitlement.status === "trialing" && entitlement.trialEndsAt
              ? `Free trial until ${fmtDate(entitlement.trialEndsAt)}`
              : entitlement.status === "active" && entitlement.currentPeriodEnd
                ? `Active until ${fmtDate(entitlement.currentPeriodEnd)}`
                : "Free plan — upgrade for proctoring, bigger sessions and advanced reports."}
          </p>
        </div>
        <ButtonLink href="/dashboard/billing" variant="gold">View plan &amp; billing</ButtonLink>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Quizzes" value={quizzes.count ?? 0} icon={<PenSquare className="h-5 w-5" />} />
        <StatCard label="Questions in bank" value={questions.count ?? 0} icon={<Library className="h-5 w-5" />} />
        <StatCard label="Examinations" value={exams.count ?? 0} icon={<FileCheck2 className="h-5 w-5" />} />
        <StatCard label="Live / open sessions" value={sessions.count ?? 0} icon={<Radio className="h-5 w-5" />} />
        <StatCard label="Team members" value={members.count ?? 0} icon={<Users className="h-5 w-5" />} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-evergreen-950">Recent live sessions</h2>
            <Link href="/dashboard/reports" className="text-sm font-medium text-evergreen-700 underline-offset-2 hover:underline">All reports</Link>
          </div>
          {(recentSessions.data ?? []).length === 0 ? (
            <p className="text-sm text-ink-soft">No sessions yet. Publish a quiz, then start a live session from the Quiz Studio.</p>
          ) : (
            <ul className="divide-y divide-evergreen-900/10">
              {(recentSessions.data ?? []).map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-medium text-ink">{s.title || (s.quizzes as { title: string } | null)?.title || "Live session"}</p>
                    <p className="text-xs text-ink-soft">Code {s.join_code} · {fmtDateTime(s.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={s.status === "live" ? "amber" : s.status === "ended" ? "gray" : "green"}>{s.status}</Badge>
                    {s.status !== "ended" ? (
                      <Link href={`/dashboard/sessions/${s.id}/host`} className="text-sm font-medium text-evergreen-700 underline-offset-2 hover:underline">Host</Link>
                    ) : (
                      <Link href={`/dashboard/reports/session/${s.id}`} className="text-sm font-medium text-evergreen-700 underline-offset-2 hover:underline">Report</Link>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-evergreen-950">Examinations</h2>
            <Link href="/dashboard/exams" className="text-sm font-medium text-evergreen-700 underline-offset-2 hover:underline">Manage all</Link>
          </div>
          {(upcomingExams.data ?? []).length === 0 ? (
            <p className="text-sm text-ink-soft">No examinations yet. Create one from a published quiz and register your candidates.</p>
          ) : (
            <ul className="divide-y divide-evergreen-900/10">
              {(upcomingExams.data ?? []).map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-medium text-ink">{e.title}</p>
                    <p className="text-xs text-ink-soft">{e.duration_minutes} min · Code {e.access_code}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={e.status === "open" ? "amber" : "gray"}>{e.status}</Badge>
                    <Link href={`/dashboard/exams/${e.id}`} className="text-sm font-medium text-evergreen-700 underline-offset-2 hover:underline">Open</Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="mt-6 p-6">
        <h2 className="font-display text-lg font-semibold text-evergreen-950">Quick start</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {[
            ["1 · Add questions", "Build your bank with mathematics, media and explanations.", "/dashboard/questions/new"],
            ["2 · Assemble a quiz", "Pick questions, set timing and randomization, publish.", "/dashboard/quizzes/new"],
            ["3 · Go live or examine", "Start a live session with a join code — or schedule a formal exam.", "/dashboard/quizzes"],
          ].map(([t, b, href]) => (
            <Link key={t} href={href} className="rounded-xl border border-evergreen-900/10 bg-cream p-4 transition hover:border-evergreen-600/40 hover:shadow-[var(--shadow-card)]">
              <p className="font-semibold text-evergreen-950">{t}</p>
              <p className="mt-1 text-sm text-ink-soft">{b}</p>
            </Link>
          ))}
        </div>
      </Card>
    </>
  );
}
