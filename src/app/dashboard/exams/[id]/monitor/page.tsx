import { ButtonLink, PageTitle } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { canOperate } from "@/lib/operationalAccess";
import { loadMonitorSnapshot } from "@/lib/examMonitoring";
import { getCapabilities, requireModule } from "@/lib/capabilities";
import { moduleEnabled } from "@/lib/modules";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ExamMonitor } from "./ExamMonitor";

export const metadata: Metadata = { title: "Live monitor" };
export const dynamic = "force-dynamic";

export default async function ExamMonitorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireUser();
  const supabase = await createClient();
  // Visibility is decided by row level security for the caller; the snapshot holds no answer keys.
  const loaded = await loadMonitorSnapshot(supabase, id);
  if (!loaded) notFound();
  if (!(await canOperate(ctx, loaded.exam.organization_id, "proctoring.view"))) redirect(`/dashboard/exams/${id}`);
  const canManage = await canOperate(ctx, loaded.exam.organization_id, "proctoring.manage");
  // Live monitoring/supervision is an entitled module, enforced server-side.
  const { entitlement: monitorEnt } = await getCapabilities(supabase, ctx, loaded.exam.organization_id);
  requireModule(monitorEnt, "exam_monitoring", `/dashboard/exams/${id}?e=module`);
  const proctoringEnabled = moduleEnabled(monitorEnt.modules, "proctoring");

  return (
    <>
      <PageTitle
        eyebrow="Examinations · Real-Time Candidate Supervision"
        title={`Live monitor — ${loaded.exam.title}`}
        subtitle="Progress, connection, authorized interventions (pause/resume, extra time, session restart) and private messages for each candidate. Updates automatically."
        action={
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/dashboard/monitoring" variant="outline">All live sessions</ButtonLink>
            {proctoringEnabled && canManage && (
              <ButtonLink href={`/dashboard/exams/${id}/proctor`} variant="outline">Video proctoring</ButtonLink>
            )}
            <ButtonLink href={`/dashboard/exams/${id}`} variant="outline">← Examination</ButtonLink>
          </div>
        }
      />
      <ExamMonitor examId={id} initial={loaded.snapshot} canManage={canManage} />
    </>
  );
}
