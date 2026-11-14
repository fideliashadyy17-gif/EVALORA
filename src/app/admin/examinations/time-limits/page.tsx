import { Badge, Button, ButtonLink, Card, Field, Input, PageTitle, Select, StatCard } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { attemptDeadline } from "@/lib/exam";
import { createAdminClient } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/utils";
import { AlarmClock, Clock3, Hourglass, Timer } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Notice, Section, Table } from "../../ui";
import { grantAttemptExtensionAsAdmin, updateExamTimingAsAdmin } from "../actions";

export const metadata: Metadata = { title: "Examination time limits" };
export const dynamic = "force-dynamic";

const MESSAGES: Record<string, string> = {
  timing_saved: "Examination duration and pass mark saved.",
  extension_saved: "Authorized extension saved. The server deadline has been recalculated immediately.",
  exam: "That examination no longer exists.",
  attempt: "That attempt no longer exists.",
  not_in_progress: "Extensions can only be changed while the attempt is still in progress.",
  minutes: "Extension must be between 0 and 1,440 minutes.",
  failed: "The timing change could not be saved.",
};

interface ExamRow {
  id: string;
  title: string;
  status: string;
  duration_minutes: number;
  ends_at: string | null;
  settings: Record<string, unknown> | null;
  organizations: { name: string } | null;
}

interface AttemptRow {
  id: string;
  exam_id: string;
  candidate_id: string;
  started_at: string;
  status: string;
  extension_minutes: number;
  exam_candidates: { full_name: string; candidate_ref: string | null } | null;
  exams: { title: string; duration_minutes: number; ends_at: string | null } | null;
  exam_answers: { count: number }[];
}

export default async function ExaminationTimeLimitsPage({
  searchParams,
}: {
  searchParams: Promise<{ exam?: string; ok?: string; e?: string }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const admin = createAdminClient();

  const { data: rawExams } = await admin
    .from("exams")
    .select("id, title, status, duration_minutes, ends_at, settings, organizations(name)")
    .order("created_at", { ascending: false })
    .limit(300);
  const exams = (rawExams ?? []) as unknown as ExamRow[];
  const selected = (sp.exam && exams.find((e) => e.id === sp.exam)) || exams.find((e) => e.status === "open") || exams[0];

  let attemptQuery = admin
    .from("exam_attempts")
    .select("id, exam_id, candidate_id, started_at, status, extension_minutes, exam_candidates(full_name, candidate_ref), exams(title, duration_minutes, ends_at), exam_answers(count)")
    .eq("status", "in_progress")
    .order("started_at", { ascending: true })
    .limit(1000);
  if (sp.exam) attemptQuery = attemptQuery.eq("exam_id", sp.exam);
  const { data: rawAttempts } = await attemptQuery;
  const attempts = (rawAttempts ?? []) as unknown as AttemptRow[];
  const now = Date.now();
  const back = sp.exam ? `/admin/examinations/time-limits?exam=${sp.exam}` : "/admin/examinations/time-limits";
  const withDeadlines = attempts.map((a) => {
    const deadline = a.exams ? attemptDeadline(a.exams, a.started_at, Number(a.extension_minutes ?? 0)) : null;
    const remainingMinutes = deadline ? Math.ceil((deadline.getTime() - now) / 60000) : null;
    return { a, deadline, remainingMinutes };
  });

  return (
    <>
      <PageTitle
        eyebrow="Examinations · Server Deadlines & Accommodations"
        title="Duration & time limits"
        subtitle="The authoritative deadline is calculated on the server from attempt start + exam duration + authorized extension, capped by the (also extended) exam window. Browser countdowns are display-only."
        action={<ButtonLink href="/admin/examinations/schedule" variant="outline">Examination schedule</ButtonLink>}
      />

      <Notice ok={sp.ok} e={sp.e} messages={MESSAGES} />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Attempts in progress" value={attempts.length} icon={<Clock3 className="h-5 w-5" />} />
        <StatCard label="With authorized extensions" value={attempts.filter((a) => Number(a.extension_minutes) > 0).length} icon={<AlarmClock className="h-5 w-5" />} />
        <StatCard label="Under 15 minutes left" value={withDeadlines.filter((x) => x.remainingMinutes !== null && x.remainingMinutes >= 0 && x.remainingMinutes <= 15).length} icon={<Timer className="h-5 w-5" />} />
        <StatCard label="Past server deadline" value={withDeadlines.filter((x) => x.remainingMinutes !== null && x.remainingMinutes < 0).length} icon={<Hourglass className="h-5 w-5" />} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <Card className="h-fit p-6">
          <h2 className="font-display text-lg font-semibold text-evergreen-950">Examination timing policy</h2>
          {!selected ? (
            <p className="mt-2 text-sm text-ink-soft">No examinations exist yet.</p>
          ) : (
            <>
              <form method="get" className="mt-4">
                <Field label="Examination">
                  <Select name="exam" defaultValue={selected.id}>
                    {exams.map((e) => <option key={e.id} value={e.id}>{e.title} — {e.organizations?.name ?? "Organization"}</option>)}
                  </Select>
                </Field>
                <Button type="submit" variant="outline" className="mt-3">Load policy & attempts</Button>
              </form>

              <form action={updateExamTimingAsAdmin} className="mt-6 space-y-4 border-t border-evergreen-900/10 pt-5">
                <input type="hidden" name="exam_id" value={selected.id} />
                <input type="hidden" name="back" value={`/admin/examinations/time-limits?exam=${selected.id}`} />
                <Field label="Standard duration (minutes)">
                  <Input name="duration_minutes" type="number" min={1} max={1440} defaultValue={selected.duration_minutes} required />
                </Field>
                <Field label="Pass mark (%)">
                  <Input name="pass_mark_percent" type="number" min={0} max={100} defaultValue={Number(selected.settings?.pass_mark_percent ?? 50)} required />
                </Field>
                <Button type="submit" variant="gold">Save timing policy</Button>
                <p className="text-xs text-ink-soft">
                  Changing duration affects server deadlines immediately, including attempts already in progress. Use per-candidate extensions below for individual accommodations.
                </p>
              </form>
            </>
          )}
        </Card>

        <div>
          <Section title={sp.exam ? "In-progress attempts for selected examination" : "All in-progress attempts"}>
            {sp.exam && <Link href="/admin/examinations/time-limits" className="mb-3 inline-block font-medium text-evergreen-700 underline-offset-2 hover:underline">Show attempts across all examinations →</Link>}
            {withDeadlines.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-evergreen-900/30 bg-paper px-6 py-10 text-center text-sm text-ink-soft">No attempts are currently in progress.</p>
            ) : (
              <Table head={["Candidate / examination", "Started", "Server deadline", "Remaining", "Saved answers", "Authorized extension"]}>
                {withDeadlines.map(({ a, deadline, remainingMinutes }) => (
                  <tr key={a.id}>
                    <td>
                      <span className="font-semibold text-evergreen-950">{a.exam_candidates?.full_name ?? "Candidate"}</span>
                      <span className="block text-xs text-ink-soft">{a.exams?.title}{a.exam_candidates?.candidate_ref ? ` · ${a.exam_candidates.candidate_ref}` : ""}</span>
                    </td>
                    <td className="text-ink-soft">{fmtDateTime(a.started_at)}<span className="block text-xs">Base {a.exams?.duration_minutes ?? "—"} min</span></td>
                    <td className="font-medium">{deadline ? fmtDateTime(deadline.toISOString()) : "—"}</td>
                    <td>
                      <Badge tone={remainingMinutes === null ? "gray" : remainingMinutes < 0 ? "red" : remainingMinutes <= 15 ? "amber" : "green"}>
                        {remainingMinutes === null ? "Unknown" : remainingMinutes < 0 ? `${Math.abs(remainingMinutes)} min overdue` : `${remainingMinutes} min left`}
                      </Badge>
                    </td>
                    <td className="tabular-nums">{a.exam_answers[0]?.count ?? 0}</td>
                    <td>
                      <p className="mb-2 text-sm">Current: <strong>+{Number(a.extension_minutes ?? 0)} min</strong></p>
                      <form action={grantAttemptExtensionAsAdmin} className="grid min-w-[270px] gap-2">
                        <input type="hidden" name="attempt_id" value={a.id} />
                        <input type="hidden" name="back" value={back} />
                        <div className="flex gap-2">
                          <Select name="mode" defaultValue="add" aria-label="Extension mode">
                            <option value="add">Add minutes</option>
                            <option value="set">Set total extension</option>
                          </Select>
                          <Input name="minutes" type="number" min={0} max={1440} defaultValue={15} required aria-label="Extension minutes" />
                        </div>
                        <Input name="reason" maxLength={500} placeholder="Reason (saved to audit log)" aria-label="Extension reason" />
                        <Button type="submit" variant="outline" className="px-3 py-2 text-xs">Apply extension</Button>
                      </form>
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          </Section>

          <Card className="mt-6 border-gold-500/40 bg-gold-500/5 p-5">
            <h3 className="font-display font-semibold text-evergreen-950">Late-submission rule</h3>
            <p className="mt-1 text-sm text-ink-soft">
              Autosave is rejected after the deadline. If a final-submit request arrives late, only previously saved answers are graded and the
              attempt is recorded as <strong>auto_submitted at the deadline</strong>, never as an on-time manual submission at the later clock time.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}
