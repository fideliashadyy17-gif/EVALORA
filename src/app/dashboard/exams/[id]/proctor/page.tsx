import { Badge, Button, ButtonLink, Card, PageTitle } from "@/components/ui";
import { activeOrg, requireUser } from "@/lib/auth";
import { getCapabilities } from "@/lib/capabilities";
import { getLiveKitEnvStatus } from "@/lib/livekit";
import { canOperateMany } from "@/lib/operationalAccess";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { updateExamProctoring } from "../../actions";
import { ProctorRoom } from "./ProctorRoom";

export const metadata: Metadata = { title: "Proctoring room" };
export const dynamic = "force-dynamic";

export default async function ProctorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; e?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  const { canManageProctoring, canEditExam } = await canOperateMany(ctx, org.id, {
    canManageProctoring: { permission: "proctoring.manage", module: "proctoring" },
    canEditExam: { permission: "exams.edit", module: "examinations" },
  });
  if (!canManageProctoring) redirect(`/dashboard/exams/${id}`);
  const supabase = await createClient();
  const { capabilities } = await getCapabilities(supabase, ctx, org.id);

  const { data: exam } = await supabase
    .from("exams")
    .select("*")
    .eq("id", id)
    .eq("organization_id", org.id)
    .maybeSingle();
  if (!exam) notFound();

  const { data: candidates } = await supabase
    .from("exam_candidates")
    .select("id, full_name")
    .eq("exam_id", id)
    .order("full_name");

  const settings = (exam.settings as Record<string, unknown> | null) ?? {};
  const proctoring = Boolean(settings.proctoring);
  const requireScreenShare = Boolean(settings.require_screen_share);
  const lkStatus = getLiveKitEnvStatus();

  return (
    <>
      <PageTitle
        eyebrow="Examinations · LiveKit Video Supervision"
        title={`Proctoring — ${exam.title}`}
        subtitle="Live supervision grid (12 feeds per page). You are invisible to candidates; only their media is consumed."
        action={
          <div className="flex flex-wrap gap-2">
            <ButtonLink href={`/dashboard/exams/${id}/monitor`} variant="outline">Live monitor</ButtonLink>
            <ButtonLink href={`/dashboard/proctoring?exam=${id}`} variant="outline">Incident ledger</ButtonLink>
            <ButtonLink href={`/dashboard/exams/${id}`} variant="outline">← Examination</ButtonLink>
          </div>
        }
      />

      {sp.ok === "proctoring" && (
        <p role="status" className="mb-4 rounded-lg bg-evergreen-50 px-4 py-3 text-sm text-evergreen-900">
          Live video proctoring settings updated for this examination.
        </p>
      )}
      {sp.e && (
        <p role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">
          {sp.e === "proctoring"
            ? "Video proctoring is not enabled on this organization's current plan."
            : "Could not update proctoring settings. Please retry."}
        </p>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-evergreen-900/15 bg-white px-4 py-3 text-xs text-ink-soft">
        <span>
          <strong className="text-evergreen-950">LiveKit Server:</strong>{" "}
          {lkStatus.configured
            ? `Configured (${lkStatus.host}) · Screen sharing ${requireScreenShare ? "required" : "optional"}`
            : `Video transport pending (${lkStatus.missing.join(", ")}) — Supabase incident logging and review remain fully operational.`}
        </span>
        <Badge tone={lkStatus.configured ? "green" : "amber"}>
          {lkStatus.configured ? "LiveKit ready" : "Video infra pending"}
        </Badge>
      </div>

      {proctoring ? (
        <ProctorRoom examId={id} candidates={candidates ?? []} />
      ) : (
        <Card className="p-6">
          <h2 className="font-display text-lg font-semibold text-evergreen-950">
            Live video supervision is currently disabled for this examination
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Supabase integrity incident logging, review workflows, and evidence history remain operational.
            Enable LiveKit video supervision below to open a private camera and optional screen-sharing room for this examination.
          </p>
          {canEditExam && capabilities.proctoring ? (
            <form action={updateExamProctoring} className="mt-4 flex flex-wrap items-center gap-4">
              <input type="hidden" name="exam_id" value={id} />
              <input type="hidden" name="return_to" value={`/dashboard/exams/${id}/proctor`} />
              <input type="hidden" name="proctoring" value="on" />
              <label className="flex items-center gap-2 text-sm font-medium text-evergreen-900">
                <input
                  type="checkbox"
                  name="require_screen_share"
                  defaultChecked={requireScreenShare}
                  className="h-4 w-4 accent-evergreen-700"
                />
                Require candidate screen sharing
              </label>
              <Button type="submit" variant="gold">Enable LiveKit video proctoring</Button>
            </form>
          ) : (
            <p className="mt-3 text-xs text-amber-800">
              Enabling video proctoring requires examination edit permissions and an eligible plan entitlement.
            </p>
          )}
        </Card>
      )}
    </>
  );
}
