import { Card } from "@/components/ui";
import {
  examAccessAvailability,
  mergeEligibleClassIds,
  parseExamAccessSettings,
  validUuid,
} from "@/lib/exam-access";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { ExamJoinClient } from "./JoinClient";

export const metadata: Metadata = { title: "Examination access" };
export const dynamic = "force-dynamic";

interface ClassOption { id: string; name: string }

export default async function SharedExamJoinPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ code?: string }>;
}) {
  const { token } = await params;
  const { code } = await searchParams;
  if (!validUuid(token))
    return <Shell title="This examination link is invalid." body="Ask your institution for the current shareable link and access code." />;

  const admin = createAdminClient();
  const { data: exam } = await admin
    .from("exams")
    .select("id,organization_id,title,description,instructions,status,starts_at,ends_at,shared_link_enabled,invite_expires_at,event_id,class_id,settings")
    .eq("invite_token", token)
    .maybeSingle();
  if (!exam)
    return <Shell title="This examination link is invalid." body="It may have been regenerated. Ask your institution for the current link." />;

  const examSettings = (exam.settings ?? {}) as Record<string, unknown>;
  const access = parseExamAccessSettings(examSettings);
  const availability = examAccessAvailability({
    status: exam.status,
    starts_at: exam.starts_at,
    ends_at: exam.ends_at,
    shared_link_enabled: exam.shared_link_enabled,
    invite_expires_at: exam.invite_expires_at,
  });
  if (!availability.ok)
    return <Shell title={availability.label} body={availability.error ?? exam.title} />;

  // Restrict class options to this exam's own class, direct links, unassigned
  // links for the same stage, and any explicit configured allowlist. Later-phase
  // links must not expose another class's examination through a shared link.
  const stage = typeof examSettings.stage === "string" ? examSettings.stage : "elimination";
  const linkRows: { class_id: string | null; exam_id: string | null }[] = [];
  if (exam.event_id) {
    const { data: phases } = await admin
      .from("competition_event_phases")
      .select("id")
      .eq("event_id", exam.event_id)
      .eq("phase_key", stage);
    const phaseIds = (phases ?? []).map((p) => p.id as string);
    if (phaseIds.length) {
      const { data: stageLinks } = await admin
        .from("competition_phase_classes")
        .select("class_id,exam_id")
        .in("phase_id", phaseIds)
        .is("exam_id", null);
      linkRows.push(...((stageLinks ?? []) as { class_id: string | null; exam_id: string | null }[]));
    }
  }
  const { data: directLinks } = await admin
    .from("competition_phase_classes")
    .select("class_id,exam_id")
    .eq("exam_id", exam.id);
  linkRows.push(...((directLinks ?? []) as { class_id: string | null; exam_id: string | null }[]));
  const baseEligibleClassIds = new Set<string>();
  for (const row of linkRows) {
    if (row.class_id && (!row.exam_id || row.exam_id === exam.id)) baseEligibleClassIds.add(row.class_id);
  }
  if (exam.class_id) baseEligibleClassIds.add(exam.class_id);
  for (const id of access.linkedClassIds) baseEligibleClassIds.add(id);
  const eligibleClassIds = mergeEligibleClassIds([...baseEligibleClassIds], access.eligibleClassIds);
  const { data: classRows } = eligibleClassIds.length
    ? await admin.from("classes").select("id,name,organization_id").in("id", eligibleClassIds)
    : { data: [] };
  const classes: ClassOption[] = ((classRows ?? []) as { id: string; name: string; organization_id: string }[])
    .filter((c) => c.organization_id === exam.organization_id)
    .map((c) => ({ id: c.id, name: c.name }));
  if (classes.length === 0)
    return <Shell title="No eligible class is configured." body="Contact the organizer; this examination cannot be started yet." />;

  let verifiedClassId: string | null = null;
  let verifiedStudentName: string | null = null;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (auth.user) {
    const { data: student } = await admin
      .from("students")
      .select("id,full_name")
      .eq("user_id", auth.user.id)
      .eq("organization_id", exam.organization_id)
      .maybeSingle();
    if (student) {
      verifiedStudentName = (student.full_name as string | null) ?? null;
      const { data: enrollment } = await admin
        .from("student_enrollments")
        .select("class_id")
        .eq("student_id", student.id)
        .eq("status", "active")
        .maybeSingle();
      const enrolled = (enrollment?.class_id as string | null) ?? null;
      if (enrolled && classes.some((c) => c.id === enrolled)) verifiedClassId = enrolled;
    }
  }
  const defaultClassId = verifiedClassId ?? (classes.length === 1 ? classes[0].id : null);
  const requiresAccount = access.accessMode === "registered_students_only" && (!auth.user || !verifiedStudentName);

  return (
    <ExamJoinClient
      token={token}
      title={exam.title}
      description={exam.description}
      instructions={exam.instructions}
      classes={classes}
      defaultClassId={defaultClassId}
      verifiedClassId={verifiedClassId}
      verifiedStudentName={verifiedStudentName}
      initialCode={(code ?? "").trim().toUpperCase()}
      accessMode={access.accessMode}
      identityFields={access.identityFields}
      requiresAccount={requiresAccount}
    />
  );
}

function Shell({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-cream px-4">
      <Card className="w-full max-w-lg p-8 text-center">
        <h1 className="font-display text-2xl font-semibold text-evergreen-950">{title}</h1>
        <p className="mt-2 text-sm text-ink-soft">{body}</p>
      </Card>
    </div>
  );
}
