import { Badge, Button, ButtonLink, Card, Field, Input, PageTitle, Select, StatCard } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/utils";
import { CalendarClock, CheckCircle2, Clock3, FileCheck2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Notice, Section, StatusBadge, Table } from "../../ui";
import { updateExamScheduleAsAdmin } from "../actions";

export const metadata: Metadata = { title: "Examination schedule" };
export const dynamic = "force-dynamic";

const MESSAGES: Record<string, string> = {
  schedule_saved: "Examination schedule and status saved.",
  window: "The closing time must be after the opening time.",
  exam: "That examination no longer exists.",
  failed: "The schedule could not be saved.",
};

interface ExamRow {
  id: string;
  title: string;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  duration_minutes: number;
  organizations: { name: string } | null;
  exam_candidates: { count: number }[];
  exam_attempts: { count: number }[];
}

function localInputValue(value: string | null) {
  return value ? new Date(value).toISOString().slice(0, 16) : "";
}

function phase(exam: ExamRow, now: number) {
  if (exam.status === "paused") return { label: "Paused", tone: "amber" as const };
  if (exam.status === "closed") return { label: "Closed", tone: "gray" as const };
  if (exam.ends_at && Date.parse(exam.ends_at) < now) return { label: "Window ended", tone: "red" as const };
  if (exam.starts_at && Date.parse(exam.starts_at) > now) return { label: "Upcoming", tone: "amber" as const };
  if (exam.status === "open") return { label: "Open now", tone: "green" as const };
  if (exam.status === "scheduled") return { label: "Scheduled", tone: "amber" as const };
  return { label: "Draft", tone: "gray" as const };
}

export default async function ExaminationSchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ exam?: string; org?: string; status?: string; ok?: string; e?: string }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const admin = createAdminClient();

  let query = admin
    .from("exams")
    .select("id, title, status, starts_at, ends_at, duration_minutes, organizations(name), exam_candidates(count), exam_attempts(count)")
    .order("starts_at", { ascending: true, nullsFirst: false })
    .limit(300);
  if (sp.org) query = query.eq("organization_id", sp.org);
  if (sp.status) query = query.eq("status", sp.status);

  const [{ data: rawExams }, { data: orgs }, { data: allExams }] = await Promise.all([
    query,
    admin.from("organizations").select("id, name").order("name").limit(500),
    admin.from("exams").select("id, title").order("created_at", { ascending: false }).limit(300),
  ]);
  const exams = (rawExams ?? []) as unknown as ExamRow[];
  const selected = (sp.exam && exams.find((e) => e.id === sp.exam)) || exams[0];
  const now = Date.now();
  const back = selected ? `/admin/examinations/schedule?exam=${selected.id}` : "/admin/examinations/schedule";

  return (
    <>
      <PageTitle
        title="Examination schedule"
        subtitle="Control examination windows and lifecycle status. The candidate API blocks entry before opening and after closing, independently of what any browser clock displays."
        action={<ButtonLink href="/admin/examinations/new" variant="gold">+ Schedule examination</ButtonLink>}
      />

      <Notice ok={sp.ok} e={sp.e} messages={MESSAGES} />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Examinations shown" value={exams.length} icon={<FileCheck2 className="h-5 w-5" />} />
        <StatCard label="Open now" value={exams.filter((e) => phase(e, now).label === "Open now").length} icon={<CheckCircle2 className="h-5 w-5" />} />
        <StatCard label="Upcoming / scheduled" value={exams.filter((e) => ["Upcoming", "Scheduled"].includes(phase(e, now).label)).length} icon={<CalendarClock className="h-5 w-5" />} />
        <StatCard label="No fixed window" value={exams.filter((e) => !e.starts_at && !e.ends_at).length} icon={<Clock3 className="h-5 w-5" />} />
      </div>

      <form method="get" className="mb-6 flex flex-wrap items-end gap-2">
        <Select name="exam" defaultValue={selected?.id ?? ""} className="min-w-[280px]" aria-label="Examination to schedule">
          {(allExams ?? []).map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
        </Select>
        <Select name="org" defaultValue={sp.org ?? ""} className="w-56" aria-label="Organization">
          <option value="">All organizations</option>
          {(orgs ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </Select>
        <Select name="status" defaultValue={sp.status ?? ""} className="w-44" aria-label="Status">
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="scheduled">Scheduled</option>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
        </Select>
        <Button type="submit" variant="outline">Open / filter</Button>
      </form>

      {selected && (
        <Card className="mb-8 max-w-4xl p-6">
          <h2 className="font-display text-lg font-semibold text-evergreen-950">Schedule — {selected.title}</h2>
          <p className="mt-1 text-sm text-ink-soft">Current phase: <Badge tone={phase(selected, now).tone}>{phase(selected, now).label}</Badge></p>
          <form action={updateExamScheduleAsAdmin} className="mt-5 grid gap-4 md:grid-cols-3">
            <input type="hidden" name="exam_id" value={selected.id} />
            <input type="hidden" name="back" value={back} />
            <Field label="Opens at">
              <Input name="starts_at" type="datetime-local" defaultValue={localInputValue(selected.starts_at)} />
            </Field>
            <Field label="Closes at">
              <Input name="ends_at" type="datetime-local" defaultValue={localInputValue(selected.ends_at)} />
            </Field>
            <Field label="Lifecycle status">
              <Select name="status" defaultValue={selected.status}>
                <option value="draft">Draft</option>
                <option value="scheduled">Scheduled</option>
                <option value="open">Open</option>
                <option value="paused">Paused (organizer hold)</option>
                <option value="closed">Closed</option>
              </Select>
            </Field>
            <div className="md:col-span-3 flex flex-wrap items-center gap-3">
              <Button type="submit" variant="gold">Save schedule</Button>
              <p className="text-xs text-ink-soft">Clear a date to remove that boundary. The exam must also be Open before candidates can enter.</p>
            </div>
          </form>
        </Card>
      )}

      <Section title="Platform examination timetable">
        {exams.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-evergreen-900/30 bg-paper px-6 py-10 text-center text-sm text-ink-soft">No examinations match.</p>
        ) : (
          <Table head={["Examination", "Organization", "Opens", "Closes", "Duration", "Phase", "Candidates / attempts", "Actions"]}>
            {exams.map((e) => {
              const p = phase(e, now);
              return (
                <tr key={e.id}>
                  <td className="font-medium">{e.title}</td>
                  <td className="text-ink-soft">{e.organizations?.name ?? "—"}</td>
                  <td className="text-ink-soft">{e.starts_at ? fmtDateTime(e.starts_at) : "Immediate when open"}</td>
                  <td className="text-ink-soft">{e.ends_at ? fmtDateTime(e.ends_at) : "No fixed close"}</td>
                  <td className="tabular-nums">{e.duration_minutes} min</td>
                  <td><Badge tone={p.tone}>{p.label}</Badge><span className="mt-1 block"><StatusBadge status={e.status} /></span></td>
                  <td className="tabular-nums">{e.exam_candidates[0]?.count ?? 0} / {e.exam_attempts[0]?.count ?? 0}</td>
                  <td>
                    <div className="flex flex-col gap-1">
                      <Link href={`/admin/examinations/schedule?exam=${e.id}`} className="font-medium text-evergreen-700 hover:underline">Edit schedule</Link>
                      <Link href={`/admin/examinations/time-limits?exam=${e.id}`} className="text-sm text-evergreen-700 hover:underline">Time limits</Link>
                      <Link href={`/admin/examinations/monitoring?exam=${e.id}`} className="text-sm text-evergreen-700 hover:underline">Monitor</Link>
                    </div>
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Section>
    </>
  );
}
