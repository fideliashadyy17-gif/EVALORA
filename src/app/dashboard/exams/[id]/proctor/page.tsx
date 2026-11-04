import { PageTitle } from "@/components/ui";
import { activeOrg, can, PROCTOR_ROLES, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ProctorRoom } from "./ProctorRoom";

export const metadata: Metadata = { title: "Proctoring room" };
export const dynamic = "force-dynamic";

export default async function ProctorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  if (!can(ctx, org.id, PROCTOR_ROLES)) redirect(`/dashboard/exams/${id}`);
  const supabase = await createClient();

  const { data: exam } = await supabase.from("exams").select("*").eq("id", id).eq("organization_id", org.id).maybeSingle();
  if (!exam) notFound();

  const { data: candidates } = await supabase
    .from("exam_candidates")
    .select("id, full_name")
    .eq("exam_id", id)
    .order("full_name");

  const proctoring = Boolean((exam.settings as Record<string, unknown>)?.proctoring);

  return (
    <>
      <PageTitle
        title={`Proctoring — ${exam.title}`}
        subtitle="Live supervision grid (12 feeds per page). You are invisible to candidates; only their media is consumed."
      />
      {proctoring ? (
        <ProctorRoom examId={id} candidates={candidates ?? []} />
      ) : (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Video proctoring is not enabled for this examination. Enable it when creating the exam (requires a Premium entitlement).
        </p>
      )}
    </>
  );
}
