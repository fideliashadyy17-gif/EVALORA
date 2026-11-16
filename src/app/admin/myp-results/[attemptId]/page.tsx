import { Badge, ButtonLink, PageTitle } from "@/components/ui";
import { MypResultDetail } from "@/components/myp/MypResultDetail";
import { requireSuperAdmin } from "@/lib/auth";
import { mypAccess } from "@/lib/mypAccess";
import { loadMypHistory, loadMypResult } from "@/lib/mypResults";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const metadata: Metadata = { title: "MYP student result — platform" };
export const dynamic = "force-dynamic";

export default async function AdminMypResultPage({ params }: { params: Promise<{ attemptId: string }> }) {
  await requireSuperAdmin();
  const { attemptId } = await params;
  const access = await mypAccess({ global: true });
  const supabase = await createClient();
  const result = await loadMypResult(supabase, {
    attemptId,
    organizationIds: access.organizationIds,
  });
  if (!result) notFound();
  const history = await loadMypHistory(supabase, attemptId);

  return (
    <>
      <PageTitle
        eyebrow="Platform · MYP result"
        title={result.studentName}
        subtitle={`${result.organizationName} · ${result.examTitle}${result.mypYearLabel ? ` · ${result.mypYearLabel}` : ""}${result.className ? ` · ${result.className}` : ""} · ${result.subjectLabel}`}
        action={
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/admin/myp-results" variant="outline">← All MYP results</ButtonLink>
            <ButtonLink href={`/api/myp/export/pdf?scope=individual&attempt=${result.attemptId}`}>⬇ PDF report</ButtonLink>
            <ButtonLink href={`/api/myp/export/xlsx?scope=individual&attempt=${result.attemptId}`} variant="outline">⬇ Excel</ButtonLink>
          </div>
        }
        meta={
          <>
            <Badge tone={result.overallGrade === null ? "amber" : "green"}>
              {result.overallGrade === null ? result.gradeStatusLabel : `Overall grade ${result.overallGrade} / 7`}
            </Badge>
            <span>{result.publicationLabel}</span>
            <span>·</span>
            <span>Attempt: {result.attemptStatus.replace(/_/g, " ")}</span>
          </>
        }
      />
      <MypResultDetail result={result} history={history} showOrganization />
    </>
  );
}
