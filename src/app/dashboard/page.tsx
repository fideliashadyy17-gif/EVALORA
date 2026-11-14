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

export default async function DashboardPage() {
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  const supabase = await createClient();

  let degradedMetrics = false;
  const safeQuery = async <T,>(query: PromiseLike<T & { error?: unknown }>, fallback: T): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    try {
      const res = await Promise.race<T & { error?: unknown }>([
        Promise.resolve(query),
        new Promise<T & { error?: unknown }>((resolve) => {
          timer = setTimeout(() => {
            degradedMetrics = true;
            resolve(fallback as T & { error?: unknown });
          }, 5_500);
        }),
      ]);
      if (res?.error) {
        degradedMetrics = true;
        return fallback;
      }
      return res;
    } catch {
      degradedMetrics = true;
      return fallback;
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  const [quizzes, questions, exams, members, sessions, recentSessions, upcomingExams, platformRow] =
    await Promise.all([
      safeQuery<{ count: number | null }>(supabase.from("quizzes").select("id", { count: "exact", head: true }).eq("organization_id", org.id), { count: 0 }),
      safeQuery<{ count: number | null }>(supabase.from("questions").select("id", { count: "exact", head: true }).eq("organization_id", org.id), { count: 0 }),
      safeQuery<{ count: number | null }>(supabase.from("exams").select("id", { count: "exact", head: true }).eq("organization_id", org.id), { count: 0 }),
      safeQuery<{ count: number | null }>(supabase.from("organization_members").select("id", { count: "exact", head: true }).eq("organization_id", org.id), { count: 0 }),
      safeQuery<{ count: number | null }>(supabase.from("quiz_sessions").select("id", { count: "exact", head: true }).eq("organization_id", org.id).in("status", ["lobby", "live"]), { count: 0 }),
      safeQuery<{ data: { id: string; title: string | null; join_code: string; created_at: string; status: string; quizzes: { title: string } | null }[] | null }>(supabase.from("quiz_sessions").select("*, quizzes(title)").eq("organization_id", org.id).order("created_at", { ascending: false }).limit(5), { data: [] }),
      safeQuery<{ data: { id: string; title: string; duration_minutes: number; access_code: string; status: string }[] | null }>(supabase.from("exams").select("*").eq("organization_id", org.id).order("created_at", { ascending: false }).limit(5), { data: [] }),
      safeQuery<{
        data: {
          slug: string;
          name: string;
          status: string;
          portal_enabled: boolean | null;
          custom_domain: string | null;
          platform_domain_status: string | null;
        } | null;
      }>(
        supabase
          .from("organizations")
          .select("slug, name, status, portal_enabled, custom_domain, platform_domain_status")
          .eq("id", org.id)
          .maybeSingle(),
        { data: null },
      ),
    ]);

  const platform = organizationPlatformAccess(
    platformRow.data ?? { slug: org.slug, status: org.status },
  );

  const entitlement = await getEntitlementFor(supabase, ctx, org.id).catch(() => ({
    planName: "Standard",
    status: "active" as const,
    trialEndsAt: null,
    currentPeriodEnd: null,
  }));

  return (
    <>
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
