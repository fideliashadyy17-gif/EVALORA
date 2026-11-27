import { Badge, Button, ButtonLink, Card, DataTable, Field, Input, PageTitle, Select, StatCard } from "@/components/ui";
import { activeOrg, requireUser } from "@/lib/auth";
import { getCapabilities, requireModule } from "@/lib/capabilities";
import { attemptDeadline } from "@/lib/exam";
import { manualPauseMs } from "@/lib/examPause";
import { describeIncidentType } from "@/lib/integrity";
import { getLiveKitEnvStatus } from "@/lib/livekit";
import { moduleEnabled } from "@/lib/modules";
import { canOperateMany } from "@/lib/operationalAccess";
import { presenceConnection } from "@/lib/presence";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { Activity, Clock, Eye, ShieldAlert, Users, Video } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  authorizeOrgRetake,
  decideOrgRetakeRequest,
  grantOrgAttemptExtension,
  pauseOrgAttemptFromMonitor,
  pauseOrgExamFromMonitor,
  sendOrgMonitorMessage,
} from "./actions";
import { requestFormatter } from "@/lib/formattingRequest";

export const metadata: Metadata = { title: "Live Monitoring & Examination Supervision" };
export const dynamic = "force-dynamic";

interface SearchParams {
  exam?: string;
  status?: string;
  ok?: string;
  e?: string;
  code?: string;
}

const OK_MESSAGES: Record<string, string> = {
  extension_saved: "Extra time granted and server deadline updated. The intervention has been recorded in the audit history.",
  exam_paused: "Examination paused. Active candidates' timers are frozen and saved answers remain protected.",
  exam_resumed: "Examination resumed. Frozen pause duration has been credited to each candidate's deadline.",
  student_paused: "Candidate session paused individually. Other candidates continue unaffected.",
  student_resumed: "Candidate session resumed with preserved remaining time.",
  retake_authorized: "Authorized session restart / retake issued with a single-use retake code (original attempt preserved).",
  retake_approved: "Retake request approved and single-use retake code issued.",
  retake_rejected: "Retake request declined and logged.",
  already_decided: "This retake request was already decided.",
  message_sent: "Private supervision message delivered to the candidate.",
};

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "Your role does not permit examination supervision interventions (requires proctoring.manage).",
  attempt: "Candidate session not found in this organization.",
  exam: "Examination not found in this organization.",
  not_in_progress: "That intervention applies only to an in-progress candidate session.",
  not_open: "Only an open examination can be paused.",
  not_paused: "This examination is not currently paused.",
  minutes: "Specify a valid extension between 0 and 1440 minutes.",
  access_window: "Select a valid retake access window.",
  request: "Retake request not found in this organization.",
  message_empty: "Enter a message before sending.",
  failed: "The intervention could not be completed. Reload and retry.",
};

function formatRemaining(deadlineMs: number, nowMs: number, closed: boolean): string {
  if (closed) return "—";
  const sec = Math.floor((deadlineMs - nowMs) / 1000);
  if (sec <= 0) return "Overdue";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}:${String(s).padStart(2, "0")}`;
}

export default async function OrganizationMonitoringPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  // Configured date, time and number profile (Platform Control Center →
  // Presentation), resolved once per request from the session's own organization.
  const { dateTime: fmtDateTime } = await requestFormatter(org?.id ?? null);
  if (!org) redirect("/dashboard");

  const supabase = await createClient();
  const { entitlement } = await getCapabilities(supabase, ctx, org.id);
  // Server-side module enforcement (Premium / Institution or explicit ON override).
  requireModule(entitlement, "exam_monitoring", "/dashboard?e=module");

  const { canView, canManage } = await canOperateMany(ctx, org.id, {
    canView: { permission: "proctoring.view", module: "exam_monitoring" },
    canManage: { permission: "proctoring.manage", module: "exam_monitoring" },
  });
  if (!canView) redirect("/dashboard");

  const sp = (await searchParams) ?? {};
  const isFounder = org.role === "school_founder";
  const proctoringModuleEnabled = moduleEnabled(entitlement.modules, "proctoring");
  const livekitStatus = getLiveKitEnvStatus();
  const livekitConfigured = livekitStatus.configured;

  // Use admin client ONLY for verified org-scoped supervision tables where
  // staff RLS might otherwise hide audit_logs / retake requests, ALWAYS pinned
  // strictly to `organization_id = org.id`.
  const admin = createAdminClient();

  const { data: examsData } = await supabase
    .from("exams")
    .select("id, title, status, paused_at, duration_minutes, starts_at, ends_at, quiz_id, settings, created_at")
    .eq("organization_id", org.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(200);
  const exams = examsData ?? [];
  const examMap = new Map(exams.map((e) => [e.id as string, e]));
  const examIds = exams.map((e) => e.id as string);
  const selectedExamId = sp.exam && examMap.has(sp.exam) ? sp.exam : "";

  const targetExamIds = selectedExamId ? [selectedExamId] : examIds;
  const quizIds = [...new Set(exams.map((e) => e.quiz_id as string | null).filter((id): id is string => Boolean(id)))];

  const [
    attemptsRes,
    incidentsRes,
    roomsRes,
    recordingsRes,
    retakesRes,
    pauseEventsRes,
    interventionLogsRes,
    quizQuestionCountsRes,
  ] = await Promise.all([
    targetExamIds.length
      ? supabase
          .from("exam_attempts")
          .select("id, exam_id, candidate_id, status, started_at, submitted_at, extension_minutes, pause_reasons, paused_at, attempt_number, lockdown_verified, lockdown_platform, exam_candidates(full_name, candidate_ref, class_id), exam_answers(count)")
          .in("exam_id", targetExamIds)
          .order("started_at", { ascending: false })
          .limit(300)
      : Promise.resolve({ data: [] as unknown[] }),
    targetExamIds.length
      ? supabase
          .from("proctoring_incidents")
          .select("id, exam_id, candidate_id, type, severity, status, note, created_at, exam_candidates(full_name)")
          .eq("organization_id", org.id)
          .in("exam_id", targetExamIds)
          .order("created_at", { ascending: false })
          .limit(100)
      : Promise.resolve({ data: [] as unknown[] }),
    supabase
      .from("proctoring_rooms")
      .select("id, exam_id, room_name, status, started_at, ended_at")
      .eq("organization_id", org.id)
      .order("started_at", { ascending: false })
      .limit(30),
    supabase
      .from("proctoring_recordings")
      .select("id, exam_id, room_name, status, file_url, retention_until, created_at")
      .eq("organization_id", org.id)
      .order("created_at", { ascending: false })
      .limit(30),
    admin
      .from("exam_retake_requests")
      .select("id, exam_id, candidate_id, status, reason, decision_note, granted_attempts, access_expires_at, retake_code, created_at, decided_at, exam_candidates(full_name), exams(title)")
      .eq("organization_id", org.id)
      .order("created_at", { ascending: false })
      .limit(50),
    admin
      .from("exam_pause_events")
      .select("id, exam_id, attempt_id, scope, action, reason, credited_minutes, created_at, actor:profiles!exam_pause_events_actor_id_fkey(full_name, email), exams(title)")
      .eq("organization_id", org.id)
      .order("created_at", { ascending: false })
      .limit(50),
    admin
      .from("audit_logs")
      .select("id, action, target_type, target_id, details, created_at, actor:profiles!audit_logs_actor_id_fkey(full_name, email)")
      .eq("organization_id", org.id)
      .in("action", [
        "exam.extension_granted",
        "exam.paused",
        "exam.resumed",
        "exam.attempt_paused",
        "exam.attempt_resumed",
        "exam.retake_authorized",
        "exam.retake_approved",
        "exam.retake_rejected",
        "exam.monitor_message_sent",
      ])
      .order("created_at", { ascending: false })
      .limit(50),
    quizIds.length
      ? supabase.from("quiz_questions").select("quiz_id").in("quiz_id", quizIds)
      : Promise.resolve({ data: [] as { quiz_id: string }[] }),
  ]);

  type AttemptRow = {
    id: string;
    exam_id: string;
    candidate_id: string;
    status: string;
    started_at: string;
    submitted_at: string | null;
    extension_minutes: number | null;
    pause_reasons: string[] | null;
    paused_at: string | null;
    attempt_number: number | null;
    lockdown_verified?: boolean;
    lockdown_platform?: string | null;
    exam_candidates: { full_name: string; candidate_ref: string | null; class_id: string | null } | null;
    exam_answers: { count: number }[];
  };
  const attempts = (attemptsRes.data ?? []) as unknown as AttemptRow[];
  const activeAttemptIds = attempts.filter((a) => a.status === "in_progress").map((a) => a.id);
  const classIds = [
    ...new Set(attempts.map((a) => a.exam_candidates?.class_id).filter((id): id is string => Boolean(id))),
  ];

  const [presenceRes, classesRes] = await Promise.all([
    activeAttemptIds.length
      ? supabase
          .from("exam_presence")
          .select("attempt_id, last_seen_at, current_question, pending_saves, unconfirmed_lost_at")
          .in("attempt_id", activeAttemptIds)
      : Promise.resolve({ data: [] as unknown[] }),
    classIds.length
      ? supabase.from("classes").select("id, name").eq("organization_id", org.id).in("id", classIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  const presenceBy = new Map(
    ((presenceRes.data ?? []) as {
      attempt_id: string;
      last_seen_at: string | null;
      current_question: number | null;
      pending_saves: number | null;
      unconfirmed_lost_at: string | null;
    }[]).map((p) => [p.attempt_id, p]),
  );
  const classNameBy = new Map((classesRes.data ?? []).map((c) => [c.id as string, c.name as string]));
  const questionCountByQuiz = new Map<string, number>();
  for (const row of (quizQuestionCountsRes.data ?? []) as { quiz_id: string }[]) {
    questionCountByQuiz.set(row.quiz_id, (questionCountByQuiz.get(row.quiz_id) ?? 0) + 1);
  }

  const incidents = (incidentsRes.data ?? []) as unknown as {
    id: string;
    exam_id: string;
    candidate_id: string | null;
    type: string;
    severity: string;
    status: string;
    note: string | null;
    created_at: string;
    exam_candidates: { full_name?: string } | null;
  }[];
  const openIncidentsByCandidate = new Map<string, number>();
  for (const inc of incidents) {
    if (inc.candidate_id && (inc.status === "open" || inc.status === "investigating")) {
      openIncidentsByCandidate.set(inc.candidate_id, (openIncidentsByCandidate.get(inc.candidate_id) ?? 0) + 1);
    }
  }

  const nowMs = Date.now();
  const activeExams = exams.filter((e) => e.status === "open" || e.status === "paused");

  const enrichedAttempts = attempts.map((a) => {
    const exam = examMap.get(a.exam_id);
    const totalQ = exam?.quiz_id ? questionCountByQuiz.get(exam.quiz_id as string) ?? 0 : 0;
    const answered = a.exam_answers?.[0]?.count ?? 0;
    const extMin = Number(a.extension_minutes ?? 0);
    const deadlineDate = exam
      ? attemptDeadline(
          {
            duration_minutes: Number(exam.duration_minutes ?? 60),
            ends_at: (exam.ends_at as string | null) ?? null,
          },
          a.started_at,
          extMin,
          manualPauseMs(a, nowMs),
        )
      : null;
    const deadlineMs = deadlineDate?.getTime() ?? nowMs;
    const overdue = a.status === "in_progress" && deadlineMs < nowMs;
    const paused = a.status === "in_progress" && Array.isArray(a.pause_reasons) && a.pause_reasons.length > 0;
    const presence = presenceBy.get(a.id);
    const conn =
      a.status === "in_progress"
        ? presenceConnection(presence?.last_seen_at ?? null, nowMs)
        : "offline";
    return {
      ...a,
      examTitle: (exam?.title as string) ?? "Examination",
      examStatus: (exam?.status as string) ?? "draft",
      examProctored: Boolean((exam?.settings as Record<string, unknown> | null)?.proctoring),
      className: a.exam_candidates?.class_id ? classNameBy.get(a.exam_candidates.class_id) ?? null : null,
      answered,
      totalQ,
      progressPct: totalQ > 0 ? Math.min(100, Math.round((answered / totalQ) * 100)) : 0,
      extMin,
      deadlineIso: deadlineDate?.toISOString() ?? null,
      deadlineMs,
      overdue,
      paused,
      connection: conn,
      currentQuestion: presence?.current_question ?? null,
      openIncidents: openIncidentsByCandidate.get(a.candidate_id) ?? 0,
    };
  });

  const inProgressCount = enrichedAttempts.filter((a) => a.status === "in_progress").length;
  const onlineCount = enrichedAttempts.filter((a) => a.status === "in_progress" && a.connection === "online").length;
  const pausedCount = enrichedAttempts.filter((a) => a.paused).length;
  const overdueCount = enrichedAttempts.filter((a) => a.overdue).length;
  const completedCount = enrichedAttempts.filter((a) => a.status !== "in_progress").length;
  const openIncidentCount = incidents.filter((i) => i.status === "open" || i.status === "investigating").length;
  const retakes = (retakesRes.data ?? []) as unknown as {
    id: string;
    exam_id: string;
    candidate_id: string;
    status: string;
    reason: string | null;
    decision_note: string | null;
    granted_attempts: number | null;
    access_expires_at: string | null;
    retake_code: string | null;
    created_at: string;
    decided_at: string | null;
    exam_candidates: { full_name?: string } | null;
    exams: { title?: string } | null;
  }[];
  const pendingRetakes = retakes.filter((r) => r.status === "pending");

  const statusFilter = sp.status ?? "all";
  const visibleAttempts = enrichedAttempts.filter((a) => {
    if (statusFilter === "in_progress") return a.status === "in_progress";
    if (statusFilter === "paused") return a.paused;
    if (statusFilter === "overdue") return a.overdue;
    if (statusFilter === "submitted") return a.status !== "in_progress";
    return true;
  });

  const backHref = `/dashboard/monitoring${
    selectedExamId || statusFilter !== "all"
      ? `?${new URLSearchParams({
          ...(selectedExamId ? { exam: selectedExamId } : {}),
          ...(statusFilter !== "all" ? { status: statusFilter } : {}),
        }).toString()}`
      : ""
  }`;

  const pauseEvents = (pauseEventsRes.data ?? []) as unknown as {
    id: string;
    scope: string;
    action: string;
    reason: string | null;
    credited_minutes: number | null;
    created_at: string;
    actor: { full_name?: string; email?: string } | null;
    exams: { title?: string } | null;
  }[];
  const auditInterventions = (interventionLogsRes.data ?? []) as unknown as {
    id: string;
    action: string;
    details: Record<string, unknown> | null;
    created_at: string;
    actor: { full_name?: string; email?: string } | null;
  }[];
  const recordings = (recordingsRes.data ?? []) as unknown as {
    id: string;
    exam_id: string;
    room_name: string;
    status: string;
    file_url: string | null;
    retention_until: string | null;
    created_at: string;
  }[];

  return (
    <>
      <PageTitle
        eyebrow="Assessment · Live Examination Supervision"
        title="Live Monitoring & Supervision"
        subtitle="Real-time examination sessions, candidate progress, remaining time, authorized interventions, proctoring incidents and audit history for this organization."
        action={
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/dashboard/exams" variant="outline">Examinations</ButtonLink>
            {proctoringModuleEnabled && (
              <ButtonLink href="/dashboard/proctoring" variant="outline">Proctoring ledger</ButtonLink>
            )}
          </div>
        }
      />

      {sp.ok && OK_MESSAGES[sp.ok] && (
        <div role="status" className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">
          {OK_MESSAGES[sp.ok]}
          {sp.code && (
            <span className="ml-2 inline-block rounded bg-emerald-900 px-2 py-0.5 font-mono text-xs text-white">
              Retake code: {sp.code}
            </span>
          )}
        </div>
      )}
      {sp.e && ERROR_MESSAGES[sp.e] && (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-900">
          {ERROR_MESSAGES[sp.e]}
        </p>
      )}

      {!canManage && (
        <div className="mb-5 rounded-xl border border-evergreen-900/15 bg-cream px-4 py-3 text-sm text-ink">
          <strong>{isFounder ? "Institutional Supervision (Read-Only):" : "Read-only monitoring view:"}</strong>{" "}
          You can inspect live examination summaries, candidate progress, incidents, and intervention history.
          Privileged interventions (extra time, pause/resume, retake authorization, and live video rooms) require the{" "}
          <code className="rounded bg-white px-1.5 py-0.5 text-xs">proctoring.manage</code> permission.
        </div>
      )}

      {proctoringModuleEnabled && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-evergreen-900/15 bg-white px-4 py-3 text-sm">
          <div className="flex items-center gap-2.5">
            <Video className="h-4 w-4 text-evergreen-700" />
            <span>
              <strong>LiveKit Video Proctoring Infrastructure:</strong>{" "}
              {livekitConfigured
                ? `Configured (${livekitStatus.host}) and ready for authorized proctors on proctored examinations. Live monitoring, interventions, messaging and Supabase incident review remain independently operational.`
                : `Live video transport is pending on this environment (${livekitStatus.missing.length ? `missing: ${livekitStatus.missing.join(", ")}` : "invalid NEXT_PUBLIC_LIVEKIT_URL"}). Live progress tracking, interventions, messaging and Supabase incident review remain fully operational.`}
            </span>
          </div>
          <Badge tone={livekitConfigured ? "green" : "amber"}>
            {livekitConfigured ? "LiveKit ready" : "Core operational · Video pending"}
          </Badge>
        </div>
      )}

      {/* ── KPI Strip ─────────────────────────────────────────────── */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Active examinations"
          value={activeExams.length}
          hint={`${exams.length} total in this workspace`}
          icon={<Activity className="h-5 w-5" />}
        />
        <StatCard
          label="Live candidates"
          value={inProgressCount}
          hint={`${onlineCount} online · ${pausedCount} paused · ${completedCount} completed`}
          icon={<Users className="h-5 w-5" />}
        />
        <StatCard
          label="Overdue / Pending retakes"
          value={`${overdueCount} / ${pendingRetakes.length}`}
          hint="Server-computed deadlines & restart requests"
          icon={<Clock className="h-5 w-5" />}
        />
        <StatCard
          label="Open proctoring incidents"
          value={openIncidentCount}
          hint={`${(roomsRes.data ?? []).length} supervision rooms · ${recordings.length} recordings`}
          icon={<ShieldAlert className="h-5 w-5" />}
        />
      </div>

      {/* ── Active Examinations Control Strip ─────────────────────── */}
      <Card className="mb-6 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-evergreen-950">Active &amp; recent examinations</h2>
            <p className="text-xs text-ink-soft">
              Launch per-examination real-time monitoring, video supervision rooms, or pause/resume an active paper.
            </p>
          </div>
          <form method="get" className="flex flex-wrap items-end gap-2">
            <Field label="Examination">
              <Select name="exam" defaultValue={selectedExamId} className="min-w-52">
                <option value="">All examinations ({exams.length})</option>
                {exams.map((ex) => (
                  <option key={ex.id as string} value={ex.id as string}>
                    {ex.title as string} ({ex.status as string})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Session filter">
              <Select name="status" defaultValue={statusFilter}>
                <option value="all">All sessions</option>
                <option value="in_progress">In progress</option>
                <option value="paused">Paused</option>
                <option value="overdue">Overdue</option>
                <option value="submitted">Completed / submitted</option>
              </Select>
            </Field>
            <Button type="submit" variant="outline">Filter</Button>
          </form>
        </div>

        {activeExams.length === 0 ? (
          <p className="mt-4 rounded-lg bg-cream px-4 py-3 text-sm text-ink-soft">
            No examinations are currently open or paused. Open an examination from{" "}
            <Link href="/dashboard/exams" className="font-semibold text-evergreen-800 underline">
              Examinations
            </Link>{" "}
            to begin live candidate supervision; historical sessions and interventions remain visible below.
          </p>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {activeExams.map((ex) => {
              const exId = ex.id as string;
              const exAttempts = enrichedAttempts.filter((a) => a.exam_id === exId);
              const liveNow = exAttempts.filter((a) => a.status === "in_progress").length;
              const doneNow = exAttempts.filter((a) => a.status !== "in_progress").length;
              const exProctored = Boolean((ex.settings as Record<string, unknown> | null)?.proctoring);
              return (
                <div key={exId} className="rounded-xl border border-evergreen-900/15 bg-cream/60 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link href={`/dashboard/exams/${exId}`} className="font-semibold text-evergreen-950 hover:underline">
                      {ex.title as string}
                    </Link>
                    <Badge tone={ex.status === "paused" ? "gold" : "green"}>{ex.status as string}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-ink-soft">
                    {liveNow} in progress · {doneNow} completed · {Number(ex.duration_minutes ?? 60)} min
                    {exProctored ? " · Video proctoring enabled" : ""}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <ButtonLink href={`/dashboard/exams/${exId}/monitor`} variant="primary" className="text-xs">
                      <Eye className="h-3.5 w-3.5" /> Live Monitor
                    </ButtonLink>
                    {proctoringModuleEnabled && exProctored && canManage && (
                      <ButtonLink href={`/dashboard/exams/${exId}/proctor`} variant="outline" className="text-xs">
                        <Video className="h-3.5 w-3.5" /> Video Room
                      </ButtonLink>
                    )}
                    {canManage && (ex.status === "open" || ex.status === "paused") && (
                      <form action={pauseOrgExamFromMonitor}>
                        <input type="hidden" name="exam_id" value={exId} />
                        <input type="hidden" name="back" value={backHref} />
                        <input type="hidden" name="pause_action" value={ex.status === "paused" ? "resume" : "pause"} />
                        <Button type="submit" variant="outline" className="text-xs">
                          {ex.status === "paused" ? "▶ Resume exam" : "⏸ Pause exam"}
                        </Button>
                      </form>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* ── Live Candidate Sessions & Interventions ───────────────── */}
      <h2 className="mb-3 font-display text-lg font-semibold text-evergreen-950">
        Candidate sessions ({visibleAttempts.length})
      </h2>
      <div className="mb-8">
        <DataTable
          head={[
            "Candidate",
            "Examination",
            "Status & Connection",
            "Progress",
            "Remaining / Extension",
            "Integrity",
            canManage ? "Authorized Interventions" : "Monitor",
          ]}
          label="Live candidate examination sessions"
        >
          {visibleAttempts.length === 0 && (
            <tr>
              <td colSpan={7} className="px-4 py-6 text-center text-ink-soft">
                No candidate sessions match this filter.
              </td>
            </tr>
          )}
          {visibleAttempts.slice(0, 100).map((a) => {
            const isLive = a.status === "in_progress";
            const studentPaused = Array.isArray(a.pause_reasons) && a.pause_reasons.includes("student");
            return (
              <tr key={a.id} className="align-top">
                <td>
                  <p className="font-semibold text-evergreen-950">{a.exam_candidates?.full_name ?? "Candidate"}</p>
                  <p className="text-xs text-ink-soft">
                    {[a.exam_candidates?.candidate_ref, a.className].filter(Boolean).join(" · ") || "—"}
                    {Number(a.attempt_number ?? 1) > 1 ? ` · Attempt #${a.attempt_number}` : ""}
                  </p>
                </td>
                <td>
                  <Link href={`/dashboard/exams/${a.exam_id}/monitor`} className="font-medium text-evergreen-800 hover:underline">
                    {a.examTitle}
                  </Link>
                  <p className="text-xs text-ink-soft">Started {fmtDateTime(a.started_at)}</p>
                </td>
                <td>
                  <div className="flex flex-wrap gap-1">
                    <Badge tone={isLive ? (a.paused ? "gold" : "green") : "gray"}>
                      {a.paused ? "Paused" : a.status.replace(/_/g, " ")}
                    </Badge>
                    {isLive && (
                      <Badge
                        tone={
                          a.connection === "online"
                            ? "green"
                            : a.connection === "idle"
                              ? "amber"
                              : "red"
                        }
                      >
                        {a.connection}
                      </Badge>
                    )}
                  </div>
                </td>
                <td>
                  <p className="text-sm font-medium tabular-nums">
                    {a.answered} / {a.totalQ || "?"} ({a.progressPct}%)
                  </p>
                  {a.currentQuestion != null && isLive && (
                    <p className="text-xs text-ink-soft">On Q{a.currentQuestion}</p>
                  )}
                </td>
                <td>
                  <p className={`text-sm font-semibold tabular-nums ${a.overdue ? "text-red-700" : "text-evergreen-950"}`}>
                    {formatRemaining(a.deadlineMs, nowMs, !isLive)}
                  </p>
                  {a.extMin > 0 && <Badge tone="gold">+{a.extMin} min</Badge>}
                </td>
                <td>
                  <div className="flex flex-wrap gap-1">
                    {a.openIncidents > 0 ? (
                      <Badge tone="red">{a.openIncidents} incident(s)</Badge>
                    ) : (
                      <Badge tone="gray">Clear</Badge>
                    )}
                    {a.lockdown_verified && <Badge tone="green">Lockdown</Badge>}
                  </div>
                </td>
                <td>
                  {canManage ? (
                    <details className="text-xs">
                      <summary className="cursor-pointer font-semibold text-evergreen-800 hover:underline">
                        Intervene / supervise
                      </summary>
                      <div className="mt-2 min-w-64 space-y-3 rounded-xl border border-evergreen-900/15 bg-cream/70 p-3">
                        <div className="flex flex-wrap gap-1.5">
                          <Link
                            href={`/dashboard/exams/${a.exam_id}/monitor`}
                            className="font-semibold text-evergreen-800 underline"
                          >
                            Open exam monitor
                          </Link>
                          {proctoringModuleEnabled && a.examProctored && (
                            <>
                              <span>·</span>
                              <Link
                                href={`/dashboard/exams/${a.exam_id}/proctor`}
                                className="font-semibold text-evergreen-800 underline"
                              >
                                Video room
                              </Link>
                            </>
                          )}
                        </div>

                        {isLive && (
                          <>
                            <form action={grantOrgAttemptExtension} className="space-y-1.5 border-t border-evergreen-900/10 pt-2">
                              <input type="hidden" name="attempt_id" value={a.id} />
                              <input type="hidden" name="mode" value="add" />
                              <input type="hidden" name="back" value={backHref} />
                              <p className="font-semibold text-evergreen-950">Grant extra time</p>
                              <div className="flex gap-1.5">
                                <Select name="minutes" defaultValue="10" className="w-24 text-xs">
                                  <option value="5">+5 min</option>
                                  <option value="10">+10 min</option>
                                  <option value="15">+15 min</option>
                                  <option value="30">+30 min</option>
                                  <option value="60">+60 min</option>
                                </Select>
                                <Input name="reason" placeholder="Reason (audited)" maxLength={200} className="text-xs" />
                              </div>
                              <Button type="submit" variant="outline" className="text-xs">Add time</Button>
                            </form>

                            <form action={pauseOrgAttemptFromMonitor} className="border-t border-evergreen-900/10 pt-2">
                              <input type="hidden" name="attempt_id" value={a.id} />
                              <input type="hidden" name="back" value={backHref} />
                              <input type="hidden" name="pause_action" value={studentPaused ? "resume" : "pause"} />
                              <Button type="submit" variant="outline" className="text-xs">
                                {studentPaused ? "▶ Resume candidate" : "⏸ Pause candidate"}
                              </Button>
                            </form>

                            <form action={sendOrgMonitorMessage} className="space-y-1.5 border-t border-evergreen-900/10 pt-2">
                              <input type="hidden" name="attempt_id" value={a.id} />
                              <input type="hidden" name="back" value={backHref} />
                              <p className="font-semibold text-evergreen-950">Private message</p>
                              <Input name="body" placeholder="Message candidate…" maxLength={500} className="text-xs" />
                              <Button type="submit" variant="outline" className="text-xs">Send message</Button>
                            </form>
                          </>
                        )}

                        <form action={authorizeOrgRetake} className="space-y-1.5 border-t border-evergreen-900/10 pt-2">
                          <input type="hidden" name="attempt_id" value={a.id} />
                          <input type="hidden" name="back" value={backHref} />
                          <p className="font-semibold text-evergreen-950">Authorize session restart / retake</p>
                          <div className="flex gap-1.5">
                            <Select name="access_preset" defaultValue="24h" className="w-28 text-xs">
                              <option value="24h">Valid 24h</option>
                              <option value="7d">Valid 7 days</option>
                              <option value="30d">Valid 30 days</option>
                            </Select>
                            <Input name="reason" placeholder="Restart reason" maxLength={200} className="text-xs" />
                          </div>
                          <Button type="submit" variant="outline" className="text-xs">Issue retake code</Button>
                        </form>
                      </div>
                    </details>
                  ) : (
                    <Link href={`/dashboard/exams/${a.exam_id}/monitor`} className="text-xs font-semibold text-evergreen-800 hover:underline">
                      Inspect →
                    </Link>
                  )}
                </td>
              </tr>
            );
          })}
        </DataTable>
      </div>

      {/* ── Retake / Restart Requests ─────────────────────────────── */}
      <h2 className="mb-3 font-display text-lg font-semibold text-evergreen-950">
        Retake &amp; session restart authorizations ({retakes.length})
      </h2>
      <div className="mb-8">
        <DataTable
          head={["When", "Candidate", "Examination", "Status", "Code / Window", "Reason & Decision"]}
          label="Examination retake and restart authorizations"
        >
          {retakes.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-6 text-center text-ink-soft">
                No retake or restart authorizations recorded for this organization yet.
              </td>
            </tr>
          )}
          {retakes.slice(0, 25).map((r) => (
            <tr key={r.id} className="align-top">
              <td className="whitespace-nowrap text-xs text-ink-soft">{fmtDateTime(r.created_at)}</td>
              <td className="font-medium text-evergreen-950">{r.exam_candidates?.full_name ?? "Candidate"}</td>
              <td className="text-sm">{r.exams?.title ?? "—"}</td>
              <td>
                <Badge
                  tone={
                    r.status === "approved"
                      ? "green"
                      : r.status === "pending"
                        ? "amber"
                        : r.status === "rejected"
                          ? "red"
                          : "gray"
                  }
                >
                  {r.status}
                </Badge>
              </td>
              <td className="text-xs">
                {canManage && r.retake_code ? (
                  <span className="font-mono font-semibold text-evergreen-950">{r.retake_code}</span>
                ) : r.status === "approved" ? (
                  <span className="text-ink-soft">Issued (restricted)</span>
                ) : (
                  "—"
                )}
                {r.access_expires_at && (
                  <span className="block text-[11px] text-ink-soft">Until {fmtDateTime(r.access_expires_at)}</span>
                )}
              </td>
              <td className="text-xs">
                <p className="text-ink">{r.reason || r.decision_note || "—"}</p>
                {canManage && r.status === "pending" && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <form action={decideOrgRetakeRequest}>
                      <input type="hidden" name="request_id" value={r.id} />
                      <input type="hidden" name="decision" value="approved" />
                      <input type="hidden" name="back" value={backHref} />
                      <Button type="submit" variant="primary" className="text-xs">Approve &amp; issue code</Button>
                    </form>
                    <form action={decideOrgRetakeRequest}>
                      <input type="hidden" name="request_id" value={r.id} />
                      <input type="hidden" name="decision" value="rejected" />
                      <input type="hidden" name="back" value={backHref} />
                      <Button type="submit" variant="outline" className="text-xs">Decline</Button>
                    </form>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </DataTable>
      </div>

      {/* ── Recorded Intervention History ─────────────────────────── */}
      <h2 className="mb-3 font-display text-lg font-semibold text-evergreen-950">
        Recorded intervention history
      </h2>
      <div className="mb-8">
        <DataTable
          head={["When", "Intervention", "Actor", "Details"]}
          label="Recorded examination supervision interventions"
        >
          {auditInterventions.length === 0 && pauseEvents.length === 0 && (
            <tr>
              <td colSpan={4} className="px-4 py-6 text-center text-ink-soft">
                No supervision interventions have been logged yet. Extra time grants, pause/resume transitions,
                retake authorizations and supervision messages appear here automatically.
              </td>
            </tr>
          )}
          {auditInterventions.slice(0, 30).map((log) => (
            <tr key={log.id} className="align-top">
              <td className="whitespace-nowrap text-xs text-ink-soft">{fmtDateTime(log.created_at)}</td>
              <td>
                <Badge tone="gold">{log.action.replace(/^exam\./, "").replace(/_/g, " ")}</Badge>
              </td>
              <td className="text-xs text-ink-soft">
                {log.actor?.full_name || log.actor?.email || "Staff"}
              </td>
              <td className="text-xs text-ink">
                {[
                  log.details?.exam_title ? `Exam: ${String(log.details.exam_title)}` : null,
                  log.details?.candidate_name ? `Candidate: ${String(log.details.candidate_name)}` : null,
                  log.details?.extension_minutes != null
                    ? `Extension: +${String(log.details.extension_minutes)} min`
                    : null,
                  log.details?.reason ? `Reason: ${String(log.details.reason)}` : null,
                  log.details?.note ? `Note: ${String(log.details.note)}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || "Recorded"}
              </td>
            </tr>
          ))}
        </DataTable>
      </div>

      {/* ── Proctoring Incidents & Recordings Summary ─────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-lg font-semibold text-evergreen-950">Recent proctoring incidents</h2>
            {proctoringModuleEnabled && (
              <Link href="/dashboard/proctoring" className="text-xs font-semibold text-evergreen-800 hover:underline">
                Full review ledger →
              </Link>
            )}
          </div>
          {incidents.length === 0 ? (
            <p className="mt-3 text-sm text-ink-soft">No proctoring observations logged for this selection.</p>
          ) : (
            <ul className="mt-3 divide-y divide-evergreen-900/10 text-sm">
              {incidents.slice(0, 8).map((inc) => (
                <li key={inc.id} className="py-2.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone={inc.severity === "high" ? "red" : inc.severity === "medium" ? "amber" : "gray"}>
                      {inc.severity}
                    </Badge>
                    <Badge tone={inc.status === "open" ? "gold" : "gray"}>{inc.status}</Badge>
                    <span className="font-medium text-evergreen-950">{describeIncidentType(inc.type)}</span>
                    <span className="ml-auto text-xs text-ink-soft">{fmtDateTime(inc.created_at)}</span>
                  </div>
                  <p className="mt-1 text-xs text-ink-soft">
                    {inc.exam_candidates?.full_name ?? "Unassigned candidate"}
                    {inc.note ? ` — ${inc.note}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-lg font-semibold text-evergreen-950">Authorized session recordings</h2>
            <Badge tone={recordings.length > 0 ? "green" : "gray"}>{recordings.length} recorded</Badge>
          </div>
          {recordings.length === 0 ? (
            <p className="mt-3 text-sm text-ink-soft">
              No proctoring recordings are stored for this organization. Recordings appear here automatically when
              LiveKit Egress is configured and recording is enabled for a proctored examination.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-evergreen-900/10 text-sm">
              {recordings.slice(0, 8).map((rec) => (
                <li key={rec.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <div>
                    <p className="font-mono text-xs font-semibold text-evergreen-950">{rec.room_name}</p>
                    <p className="text-xs text-ink-soft">
                      {fmtDateTime(rec.created_at)}
                      {rec.retention_until ? ` · retained until ${fmtDateTime(rec.retention_until)}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={rec.status === "ready" || rec.status === "completed" ? "green" : "amber"}>
                      {rec.status}
                    </Badge>
                    {canManage && rec.file_url && (
                      <a
                        href={rec.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-semibold text-evergreen-800 underline"
                      >
                        Review
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
