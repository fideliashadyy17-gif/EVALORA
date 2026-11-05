import { RichContent } from "@/components/RichContent";
import { ExaminationAccessCard } from "@/components/ExaminationAccessCard";
import { Badge, Button, ButtonLink, Card, Field, Input, PageTitle, Textarea } from "@/components/ui";
import { activeOrg, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/utils";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import {
  addCandidate, addCandidatesBulk, deleteExam, markAnswer, publishResults,
  removeCandidate, reviewIncident, setExamStatus,
} from "../actions";

export const metadata: Metadata = { title: "Examination" };
export const dynamic = "force-dynamic";

export default async function ExamDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ added?: string; ok?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "evalora-six.vercel.app";
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${host}`;
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  const supabase = await createClient();

  const { data: exam } = await supabase
    .from("exams")
    .select("*, quizzes(title)")
    .eq("id", id)
    .eq("organization_id", org.id)
    .maybeSingle();
  if (!exam) notFound();

  const settings = (exam.settings ?? {}) as Record<string, unknown>;
  const accessLink = String(
    (exam as Record<string, unknown>).access_link
      ?? `/exam/join/${String((exam as Record<string, unknown>).invite_token ?? "")}`,
  );
  const shareUrl = `${origin}${accessLink}`;

  const [{ data: candidates }, { data: attempts }, { data: incidents }] = await Promise.all([
    supabase.from("exam_candidates").select("*").eq("exam_id", id).order("full_name"),
    supabase
      .from("exam_attempts")
      .select("*, exam_candidates(full_name), exam_answers(id, is_correct, points_awarded, answer, question_id, questions(prompt, prompt_doc, points, type))")
      .eq("exam_id", id)
      .order("started_at"),
    supabase
      .from("proctoring_incidents")
      .select("*, exam_candidates(full_name)")
      .eq("exam_id", id)
      .order("created_at", { ascending: false }),
  ]);

  const awaitingMarking = (attempts ?? []).flatMap((a) =>
    ((a.exam_answers as { id: string; is_correct: boolean | null; answer: { text?: string }; questions: { prompt: string; points: number; type: string } }[]) ?? [])
      .filter((ans) => ans.is_correct === null && ans.questions.type === "open_ended" && a.status !== "in_progress")
      .map((ans) => ({ attempt: a, ans })),
  );

  return (
    <>
      <PageTitle
        title={exam.title}
        subtitle={`Paper: ${(exam.quizzes as { title: string } | null)?.title ?? "—"} · ${exam.duration_minutes} minutes · Pass mark ${String(settings.pass_mark_percent ?? 50)}%`}
        action={
          <div className="flex flex-wrap gap-2">
            {Boolean(settings.proctoring) && (
              <ButtonLink href={`/dashboard/exams/${id}/proctor`} variant="gold">🎥 Proctoring room</ButtonLink>
            )}
            <ButtonLink href={`/dashboard/reports/exam/${id}`} variant="outline">Report</ButtonLink>
          </div>
        }
      />

      {sp.added && <p className="mb-4 rounded-lg bg-evergreen-50 px-4 py-3 text-sm text-evergreen-900">Added {sp.added} candidate(s). Each has a personal access code below.</p>}
      {sp.ok === "created" && <p className="mb-4 rounded-lg bg-evergreen-50 px-4 py-3 text-sm text-evergreen-900">Examination created. Its unique link and access code are stored with the exam and shown below.</p>}

      <div className="mb-6">
        <ExaminationAccessCard
          examTitle={exam.title}
          organizationName={org.name}
          shareUrl={shareUrl}
          accessLink={accessLink}
          accessCode={exam.access_code}
          exam={{
            status: exam.status,
            starts_at: exam.starts_at,
            ends_at: exam.ends_at,
            shared_link_enabled: exam.shared_link_enabled,
            invite_expires_at: exam.invite_expires_at,
          }}
          settings={settings}
        />
      </div>

      <Card className="mb-6 p-6">
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone={exam.status === "open" ? "amber" : "gray"}>{exam.status}</Badge>
          <div className="min-w-[280px] flex-1">
            <p className="text-sm text-ink-soft">
              Legacy two-code entry: <strong>/exam-access</strong> with exam code{" "}
              <span className="font-mono text-base font-bold text-evergreen-800">{exam.access_code}</span> plus a personal candidate code.
            </p>
            <ButtonLink href={`/admin/examinations/invitations?exam=${id}`} variant="outline">Invitation settings</ButtonLink>
          </div>
          <div className="ml-auto flex flex-wrap gap-2">
            {exam.status !== "open" ? (
              <form action={setExamStatus}><input type="hidden" name="id" value={id} /><input type="hidden" name="status" value="open" /><Button type="submit">Open examination</Button></form>
            ) : (
              <form action={setExamStatus}><input type="hidden" name="id" value={id} /><input type="hidden" name="status" value="closed" /><Button type="submit" variant="danger">Close examination</Button></form>
            )}
            <form action={publishResults}>
              <input type="hidden" name="exam_id" value={id} />
              <input type="hidden" name="publish" value={settings.results_published ? "0" : "1"} />
              <Button type="submit" variant="outline">
                {settings.results_published ? "Unpublish results" : "Publish results"}
              </Button>
            </form>
            <form action={deleteExam}>
              <input type="hidden" name="id" value={id} />
              <Button type="submit" variant="ghost" className="text-red-700">Delete</Button>
            </form>
          </div>
        </div>
        <p className="mt-3 text-sm text-ink-soft">
          Results are currently <strong>{settings.results_published ? "visible to candidates" : "hidden from candidates"}</strong>.
          Objective questions are marked automatically on submission; written answers appear in the marking queue below.
        </p>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="font-display text-lg font-semibold text-evergreen-950">Candidates ({(candidates ?? []).length})</h2>
          <div className="mt-3 max-h-96 overflow-y-auto scroll-slim">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-evergreen-900/10 text-left text-ink-soft">
                  <th className="py-2 pr-2 font-medium">Candidate</th>
                  <th className="py-2 pr-2 font-medium">Personal code</th>
                  <th className="py-2 pr-2 font-medium">Status</th>
                  <th className="py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {(candidates ?? []).map((c) => (
                  <tr key={c.id} className="border-b border-evergreen-900/5">
                    <td className="py-2 pr-2">
                      <span className="font-medium">{c.full_name}</span>
                      {c.candidate_ref && <span className="block text-xs text-ink-soft">{c.candidate_ref}{c.email ? ` · ${c.email}` : ""}</span>}
                    </td>
                    <td className="py-2 pr-2 font-mono font-semibold text-evergreen-800">{c.access_code}</td>
                    <td className="py-2 pr-2"><Badge tone={c.status === "submitted" ? "green" : c.status === "in_progress" ? "amber" : "gray"}>{c.status.replace(/_/g, " ")}</Badge></td>
                    <td className="py-2">
                      <form action={removeCandidate}>
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="exam_id" value={id} />
                        <button className="text-xs text-red-700 underline-offset-2 hover:underline">Remove</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(candidates ?? []).length === 0 && <p className="py-3 text-sm text-ink-soft">No candidates registered yet.</p>}
          </div>

          <form action={addCandidate} className="mt-4 grid gap-2 border-t border-evergreen-900/10 pt-4 sm:grid-cols-3">
            <input type="hidden" name="exam_id" value={id} />
            <Input name="full_name" required placeholder="Full name" />
            <Input name="candidate_ref" placeholder="Ref / class (optional)" />
            <div className="flex gap-2">
              <Input name="email" type="email" placeholder="Email (optional)" />
              <Button type="submit">Add</Button>
            </div>
          </form>
          <form action={addCandidatesBulk} className="mt-4">
            <input type="hidden" name="exam_id" value={id} />
            <Field label="Bulk add — one per line: Full Name, email, reference">
              <Textarea name="bulk" rows={4} placeholder={"Aya Ndiaye, aya@example.com, G9-A\nben olsen, ben@example.com, G9-B"} />
            </Field>
            <Button type="submit" variant="outline" className="mt-2">Add all</Button>
          </form>
        </Card>

        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="font-display text-lg font-semibold text-evergreen-950">Attempts ({(attempts ?? []).length})</h2>
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="border-b border-evergreen-900/10 text-left text-ink-soft">
                  <th className="py-2 pr-2 font-medium">Candidate</th>
                  <th className="py-2 pr-2 font-medium">Started</th>
                  <th className="py-2 pr-2 font-medium">Status</th>
                  <th className="py-2 font-medium">Score</th>
                </tr>
              </thead>
              <tbody>
                {(attempts ?? []).map((a) => (
                  <tr key={a.id} className="border-b border-evergreen-900/5">
                    <td className="py-2 pr-2 font-medium">{(a.exam_candidates as { full_name: string } | null)?.full_name}</td>
                    <td className="py-2 pr-2 text-ink-soft">{fmtDateTime(a.started_at)}</td>
                    <td className="py-2 pr-2"><Badge tone={a.status === "in_progress" ? "amber" : "green"}>{a.status.replace(/_/g, " ")}</Badge></td>
                    <td className="py-2 tabular-nums">{a.score !== null ? `${Number(a.score)} / ${Number(a.max_score ?? 0)}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(attempts ?? []).length === 0 && <p className="py-3 text-sm text-ink-soft">No attempts yet.</p>}
          </Card>

          <Card className="p-6">
            <h2 className="font-display text-lg font-semibold text-evergreen-950">Marking queue ({awaitingMarking.length})</h2>
            {awaitingMarking.length === 0 ? (
              <p className="mt-2 text-sm text-ink-soft">No written answers awaiting a corrector. Objective questions mark themselves automatically.</p>
            ) : (
              <div className="mt-3 space-y-4">
                {awaitingMarking.map(({ attempt, ans }) => (
                  <div key={ans.id} className="rounded-xl border border-evergreen-900/10 bg-cream p-4">
                    <p className="text-xs font-medium text-ink-soft">
                      {(attempt.exam_candidates as { full_name: string } | null)?.full_name} · max {Number(ans.questions.points)} pts
                    </p>
                    <div className="mt-1 font-medium"><RichContent doc={(ans.questions as unknown as { prompt_doc?: import("@/lib/content").RichDoc | null }).prompt_doc ?? null} text={ans.questions.prompt} /></div>
                    <p className="mt-2 whitespace-pre-wrap rounded-lg bg-white p-3 text-sm">{ans.answer?.text ?? "(empty)"}</p>
                    <form action={markAnswer} className="mt-3 flex flex-wrap items-end gap-2">
                      <input type="hidden" name="answer_id" value={ans.id} />
                      <input type="hidden" name="attempt_id" value={attempt.id} />
                      <input type="hidden" name="exam_id" value={id} />
                      <Field label="Points">
                        <Input name="points" type="number" step="0.5" min={0} max={Number(ans.questions.points)} required className="w-24" />
                      </Field>
                      <Field label="Marker note">
                        <Input name="note" placeholder="Feedback…" className="w-56" />
                      </Field>
                      <Button type="submit">Save mark</Button>
                    </form>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {Boolean(settings.proctoring) && (
            <Card className="p-6">
              <h2 className="font-display text-lg font-semibold text-evergreen-950">Proctoring incidents ({(incidents ?? []).length})</h2>
              <p className="mt-1 text-xs text-ink-soft">Incidents are observations for human review — never automatic proof of misconduct.</p>
              <div className="mt-3 space-y-2">
                {(incidents ?? []).map((i) => (
                  <div key={i.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-evergreen-900/10 bg-cream px-3 py-2.5 text-sm">
                    <Badge tone={i.severity === "high" ? "red" : i.severity === "medium" ? "amber" : "gray"}>{i.severity}</Badge>
                    <span className="font-medium">{(i.exam_candidates as { full_name: string } | null)?.full_name ?? "—"}</span>
                    <span className="text-ink-soft">{i.type}{i.note ? ` — ${i.note}` : ""}</span>
                    <span className="ml-auto flex items-center gap-2">
                      <Badge tone={i.status === "open" ? "amber" : "green"}>{i.status}</Badge>
                      {i.status === "open" && (
                        <>
                          {(["valid", "invalid", "investigating"] as const).map((s) => (
                            <form key={s} action={reviewIncident}>
                              <input type="hidden" name="id" value={i.id} />
                              <input type="hidden" name="exam_id" value={id} />
                              <input type="hidden" name="status" value={s} />
                              <button className="text-xs font-medium text-evergreen-700 underline-offset-2 hover:underline">{s}</button>
                            </form>
                          ))}
                        </>
                      )}
                    </span>
                  </div>
                ))}
                {(incidents ?? []).length === 0 && <p className="text-sm text-ink-soft">No incidents recorded.</p>}
              </div>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
