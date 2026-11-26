import { ButtonLink, Card, PageTitle } from "@/components/ui";
import { Logo } from "@/components/Logo";
import { MypResultDetail } from "@/components/myp/MypResultDetail";
import { activeOrg, requireUser } from "@/lib/auth";
import { isMypLearner } from "@/lib/mypAccess";
import { loadMypResult } from "@/lib/mypResults";
import { createAdminClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MypExportButton } from "@/components/myp/MypExportButton";
import { CandidatePaperDownloadButton } from "@/components/CandidatePaperDownloadButton";

export const metadata: Metadata = { title: "My result" };
export const dynamic = "force-dynamic";

/**
 * The learner's own released MYP result.
 *
 * Authorization is explicit and narrow: the signed-in profile is mapped to its
 * student record inside the active organization, the loader is given that
 * student id, and unreleased results are excluded. The result id in the URL is
 * therefore only a lookup hint — it can never select another student's paper.
 */
export default async function StudentResultPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;
  const ctx = await requireUser();
  if (ctx.profile.platform_role === "super_admin") redirect(`/admin/myp-results/${attemptId}`);
  const org = activeOrg(ctx);
  if (!org) redirect("/onboarding");
  if (!isMypLearner(org.role)) redirect("/dashboard");

  const admin = createAdminClient();
  const { data: student } = await admin
    .from("students")
    .select("id, full_name")
    .eq("user_id", ctx.profile.id)
    .eq("organization_id", org.id)
    .maybeSingle();

  const result = student
    ? await loadMypResult(admin, {
        attemptId,
        organizationIds: [org.id],
        studentId: student.id as string,
        includeUnpublished: false,
      })
    : null;

  return (
    <main className="min-h-screen bg-cream px-4 py-5 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <Logo href="/student" />
          <div className="rounded-full border border-evergreen-900/10 bg-white px-4 py-2 text-right shadow-sm">
            <p className="max-w-[16rem] truncate text-sm font-semibold text-evergreen-950">{org.name}</p>
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-soft">Student portal</p>
          </div>
        </header>

        {!result ? (
          <Card className="p-8 text-center">
            <h1 className="font-display text-2xl font-semibold text-evergreen-950">This result is not available yet</h1>
            <p className="mx-auto mt-2 max-w-lg text-sm text-ink-soft">
              Results appear here only after your institution releases them and only for your own examination. If you have
              just submitted the paper, marking may still be in progress.
            </p>
            <div className="mt-4 flex justify-center">
              <ButtonLink href="/student" variant="outline">← Back to my workspace</ButtonLink>
            </div>
          </Card>
        ) : (
          <>
            <PageTitle
              eyebrow="My results · MYP"
              title={result.examTitle}
              subtitle={`${result.mypYearLabel ?? ""}${result.className ? ` · ${result.className}` : ""} · ${result.subjectLabel} · ${result.published ? "Released" : "Not released"}`}
              action={
                <div className="flex flex-wrap gap-2">
                  <ButtonLink href="/student" variant="outline">← My workspace</ButtonLink>
                  <CandidatePaperDownloadButton
                    mode="student"
                    attemptId={result.attemptId}
                    label="Download My Exam (PDF)"
                    variant="outline"
                  />
                  <MypExportButton format="pdf" scope="individual" attemptId={result.attemptId} label="⬇ Download PDF" variant="primary" />
                </div>
              }
            />
            <MypResultDetail result={result} />
            <p className="mt-5 text-center text-xs text-ink-soft">
              Questions about a mark? Contact your subject teacher.{" "}
              <Link href="/student" className="font-semibold text-evergreen-800 underline underline-offset-2">
                Back to your examination records
              </Link>
              .
            </p>
          </>
        )}
      </div>
    </main>
  );
}
