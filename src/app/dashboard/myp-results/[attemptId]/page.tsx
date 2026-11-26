import { Badge, Button, ButtonLink, PageTitle, Select } from "@/components/ui";
import { MypResultDetail } from "@/components/myp/MypResultDetail";
import { isMypLearner, mypAccess } from "@/lib/mypAccess";
import { loadMypHistory, loadMypResult } from "@/lib/mypResults";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { recordMypSnapshot } from "../actions";
import { MypExportButton } from "@/components/myp/MypExportButton";
import { CandidatePaperDownloadButton } from "@/components/CandidatePaperDownloadButton";
import { isAttemptEligibleForPaperPdf } from "@/lib/candidatePaper";

export const metadata: Metadata = { title: "MYP student result" };
export const dynamic = "force-dynamic";

const MESSAGES: Record<string, string> = {
  snapshot: "Result snapshot archived. The criterion levels and overall grade are now preserved as they stood at this moment.",
  attempt: "That result could not be identified.",
  scope: "That result is not inside your organization.",
  snapshot_failed: "The snapshot could not be archived.",
};

export default async function MypResultPage({
  params,
  searchParams,
}: {
  params: Promise<{ attemptId: string }>;
  searchParams: Promise<{ ok?: string; e?: string }>;
}) {
  const { attemptId } = await params;
  const { ok, e } = await searchParams;
  const access = await mypAccess();
  if (!access.org) redirect("/dashboard");
  if (isMypLearner(access.org.role)) redirect("/student");
  if (!access.organizationIds.length) redirect("/dashboard");

  const supabase = await createClient();
  const result = await loadMypResult(supabase, {
    attemptId,
    organizationIds: access.organizationIds,
  });
  if (!result) notFound();
  const history = await loadMypHistory(supabase, attemptId);
  const returnTo = `/dashboard/myp-results/${attemptId}`;

  return (
    <>
      <PageTitle
        eyebrow="Assessment · MYP result"
        title={result.studentName}
        subtitle={`${result.examTitle}${result.mypYearLabel ? ` · ${result.mypYearLabel}` : ""}${result.className ? ` · ${result.className}` : ""} · ${result.subjectLabel}`}
        action={
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/dashboard/myp-results" variant="outline">← All MYP results</ButtonLink>
            {isAttemptEligibleForPaperPdf(result.attemptStatus) && (
              <CandidatePaperDownloadButton
                mode="staff"
                examId={result.examId}
                attemptId={result.attemptId}
                label="Download Candidate Paper (PDF)"
                variant="outline"
              />
            )}
            {access.canExport && (
              <>
                <MypExportButton format="pdf" scope="individual" attemptId={result.attemptId} label="⬇ PDF report" variant="primary" />
                <MypExportButton format="xlsx" scope="individual" attemptId={result.attemptId} label="⬇ Excel" />
              </>
            )}
          </div>
        }
        meta={
          <>
            <Badge tone={result.overallGrade === null ? "amber" : "green"}>
              {result.overallGrade === null ? result.gradeStatusLabel : `Overall grade ${result.overallGrade} / 7`}
            </Badge>
            <span>Attempt: {result.attemptStatus.replace(/_/g, " ")}</span>
            <span>·</span>
            <span>{result.publicationLabel}</span>
          </>
        }
      />

      {(ok || e) && (
        <div className={`mb-5 rounded-xl px-4 py-3 text-sm ${ok ? "bg-evergreen-50 text-evergreen-900" : "bg-red-50 text-red-800"}`}>
          {ok ? MESSAGES[ok] ?? "Saved." : MESSAGES[e ?? ""] ?? "That action could not be completed."}
        </div>
      )}

      <MypResultDetail
        result={result}
        history={history}
        snapshotSlot={
          <form action={recordMypSnapshot} className="mt-3 flex flex-wrap items-end gap-2 rounded-xl border border-evergreen-900/15 bg-cream p-3">
            <input type="hidden" name="attemptId" value={result.attemptId} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Reason</span>
              <Select name="reason" defaultValue="publication" className="text-xs">
                <option value="publication">Publication / release</option>
                <option value="moderation">Moderation</option>
                <option value="regrade">Regrade</option>
                <option value="snapshot">Manual snapshot</option>
                <option value="configuration_change">Grading configuration change</option>
              </Select>
            </label>
            <label className="block min-w-[240px] flex-1">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Note (optional)</span>
              <input
                name="note"
                maxLength={2000}
                placeholder="e.g. Criterion B moderated after second marking"
                className="w-full rounded-lg border border-evergreen-900/20 bg-white px-3 py-2 text-xs text-ink outline-none focus:border-evergreen-600"
              />
            </label>
            <Button type="submit" className="text-xs">Archive current result</Button>
          </form>
        }
      />
    </>
  );
}
