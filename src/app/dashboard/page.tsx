import { PlatformUrlActions } from "@/components/platform/PlatformUrlActions";
import { Badge, ButtonLink, Card, StatCard } from "@/components/ui";
import { activeOrg, requireUser } from "@/lib/auth";
import { getEntitlementFor } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { organizationPlatformAccess } from "@/lib/tenant";
import { fmtDate, fmtDateTime } from "@/lib/utils";
import { FileCheck2, Library, PenSquare, Radio, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  const sp = await searchParams;
  const supabase = await createClient();

  type Overview = {
    counts: { quizzes: number; questions: number; exams: number; members: number; sessions: number };
    recentSessions: {
      id: string; title: string | null; join_code: string; created_at: string; status: string;
      quizzes: { title: string } | null;
    }[];
    recentExams: {
      id: string; title: string; duration_minutes: number; access_code: string; status: string;
    }[];
    platform: {
      slug: string; name: string; status: string; portal_enabled: boolean | null;
      custom_domain: string | null; platform_domain_status: string | null;
    } | null;
  };

  const emptyOverview: Overview = {
    counts: { quizzes: 0, questions: 0, exams: 0, members: 0, sessions: 0 },
    recentSessions: [],
    recentExams: [],
    platform: null,
  };

  // One SECURITY DEFINER RPC returns the whole dashboard payload (counts,
  // recent sessions/exams, platform row). It validates the caller's active
  // membership of `org.id` and scopes every aggregate to that organisation.
  // The old path issued 8 parallel REST queries plus a ninth subscription
  // query, and each exact count evaluated per-row RLS predicates.
  let degradedMetrics = false;
  const [overviewResult, entitlement] = await Promise.all([
    supabase.rpc("workspace_overview", { p_org: org.id }),
    getEntitlementFor(supabase, ctx, org.id).catch(() => ({
      planName: "Standard",
      status: "active" as const,
      trialEndsAt: null,
      currentPeriodEnd: null,
    })),
  ]);

  let overview: Overview | null = overviewResult.error
    ? null
    : (overviewResult.data as Overview | null);

  // The signed-in teacher's subject specializations for THIS organization
  // (teacher_subjects). Shown on the workspace home so the platform treats
  // teachers as subject specialists rather than generic accounts.
  const { data: mySubjectRows } = await supabase
    .from("teacher_subjects")
    .select("subjects(id, name)")
    .eq("organization_id", org.id)
    .eq("profile_id", ctx.user.id)
    .order("created_at");
  const mySubjects = (mySubjectRows ?? [])
    .map((row) => (row.subjects as unknown as { id: string; name: string } | null) ?? null)
    .filter((subject): subject is { id: string; name: string } => Boolean(subject));

  if (!overview) {
    // Backward-compatible fallback: if the migration has not reached the
    // database yet, render the same dashboard from direct, tenant-scoped reads
    // rather than showing empty metrics.
    degradedMetrics = true;
    const [quizCount, questionCount, examCount, memberCount, sessionCount, recent, upcoming, platformRow] =
      await Promise.all([
        supabase.from("quizzes").select("id", { count: "exact", head: true }).eq("organization_id", org.id),
        supabase.from("questions").select("id", { count: "exact", head: true }).eq("organization_id", org.id),
        supabase.from("exams").select("id", { count: "exact", head: true }).eq("organization_id", org.id),
        supabase.from("organization_members").select("id", { count: "exact", head: true }).eq("organization_id", org.id),
        supabase.from("quiz_sessions").select("id", { count: "exact", head: true }).eq("organization_id", org.id).in("status", ["lobby", "live"]),
        supabase.from("quiz_sessions").select("*, quizzes(title)").eq("organization_id", org.id).order("created_at", { ascending: false }).limit(5),
        supabase.from("exams").select("*").eq("organization_id", org.id).order("created_at", { ascending: false }).limit(5),
        supabase
          .from("organizations")
          .select("slug, name, status, portal_enabled, custom_domain, platform_domain_status")
          .eq("id", org.id)
          .maybeSingle(),
      ]);
    overview = {
      counts: {
        quizzes: quizCount.count ?? 0,
        questions: questionCount.count ?? 0,
        exams: examCount.count ?? 0,
        members: memberCount.count ?? 0,
        sessions: sessionCount.count ?? 0,
      },
      recentSessions: (recent.data ?? []) as Overview["recentSessions"],
      recentExams: (upcoming.data ?? []) as Overview["recentExams"],
      platform: (platformRow.data ?? null) as Overview["platform"],
    };
  }

  const data = overview ?? emptyOverview;
  const quizzes = { count: data.counts.quizzes };
  const questions = { count: data.counts.questions };
  const exams = { count: data.counts.exams };
  const members = { count: data.counts.members };
  const sessions = { count: data.counts.sessions };
  const recentSessions = { data: data.recentSessions };
  const upcomingExams = { data: data.recentExams };

  const platform = organizationPlatformAccess(
    data.platform ?? { slug: org.slug, status: org.status },
  );

  return (
    <>
      {sp?.e === "module" && (
        <p role="alert" className="mb-6 rounded-lg bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
          That module is disabled for this organization. Its page, navigation entry and direct links are all
          restricted by the current plan configuration — a Super Admin can enable it in Plan &amp; Module Management.
        </p>
      )}
      <section className="workspace-dashboard-hero mb-6 flex flex-wrap items-center justify-between gap-5 rounded-[1.6rem] p-6 sm:p-8">
        <div className="max-w-2xl">
          <p className="workspace-dashboard-kicker">Assessment workspace</p>
          <h1 className="mt-2 font-display text-3xl font-semibold leading-tight tracking-tight text-evergreen-950 sm:text-4xl">
            Welcome, {ctx.profile.full_name?.split(" ")[0] || "there"}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft sm:text-base">{org.name} · Your workspace at a glance.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/dashboard/questions/new" variant="outline">+ New question</ButtonLink>
          <ButtonLink href="/dashboard/quizzes/new" variant="gold">+ New quiz</ButtonLink>
          <ButtonLink href="/dashboard/exams/new" variant="outline">Schedule an exam</ButtonLink>
        </div>
      </section>

      {degradedMetrics && (
        <div role="status" className="mb-5 rounded-xl border border-amber-500/40 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Some workspace summary counters are still refreshing. Examinations and live monitoring remain accessible from the sidebar.
        </div>
      )}

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

      {mySubjects.length > 0 && (
        <Card className="mt-6 p-5" data-testid="my-subjects">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold text-evergreen-950">My subjects</h2>
              <p className="mt-1 text-sm text-ink-soft">
                Your teaching specializations in {org.name}. These preselect the subject when you author questions and
                examinations.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {mySubjects.map((subject) => (
                <Badge key={subject.id} tone="green">{subject.name}</Badge>
              ))}
            </div>
          </div>
        </Card>
      )}

      <Card className="mt-6 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-base font-semibold text-evergreen-950">My Institution&apos;s Platform</h2>
            <p className="mt-1 text-sm text-ink-soft">
              Your institution&apos;s official platform address — share it with students, teachers and parents.
            </p>
            {platform.url ? (
              <a
                href={platform.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 block max-w-xl break-all rounded-lg border border-evergreen-900/15 bg-cream px-3 py-2 font-mono text-sm text-evergreen-900 underline-offset-2 hover:underline"
              >
                {platform.url}
              </a>
            ) : (
              <p className="mt-2 text-sm text-ink-soft">{platform.detail}</p>
            )}
          </div>
          <Badge tone={platform.tone}>{platform.label}</Badge>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <PlatformUrlActions
            url={platform.url}
            size="sm"
            openLabel="Open My Platform"
            copyLabel="Copy Platform Link"
            shareLabel="Share Platform Link"
          />
          <Link href="/dashboard/platform" className="text-sm font-medium text-evergreen-700 underline-offset-2 hover:underline">
            Platform details →
          </Link>
        </div>
      </Card>

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
