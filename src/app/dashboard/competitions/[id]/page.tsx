import { PageNavigation } from "@/components/PageNavigation";
import { Badge, Button, ButtonLink, Card, DataTable, Field, Input, PageTitle, Select, StatCard } from "@/components/ui";
import { activeOrg, requireUser } from "@/lib/auth";
import { COMPETITION_FORMATS } from "@/lib/brand";
import { getCapabilities, requireModule } from "@/lib/capabilities";
import { moduleEnabled } from "@/lib/modules";
import { canOperateMany } from "@/lib/operationalAccess";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  createOrgCompetitionPhase,
  deleteDraftCompetition,
  setOrgCompetitionStatus,
} from "../actions";
import { requestFormatter } from "@/lib/formattingRequest";

export const metadata: Metadata = { title: "Competition" };
export const dynamic = "force-dynamic";

const FORMAT_LABELS = Object.fromEntries(COMPETITION_FORMATS.map((f) => [f.value, f.label]));

/**
 * One competition, read inside the active organization. The query is scoped by
 * organization_id as well as id, so a guessed competition id from another
 * tenant resolves to nothing.
 */
export default async function OrganizationCompetitionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string; ok?: string; e?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const pageSize = 25;
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  // Configured date, time and number profile (Platform Control Center →
  // Presentation), resolved once per request from the session's own organization.
  const { dateTime: fmtDateTime } = await requestFormatter(org?.id ?? null);
  const supabase = await createClient();
  const { entitlement } = await getCapabilities(supabase, ctx, org.id);
  // Parent module first: a disabled competitions module closes the detail
  // route too, not just the list page.
  requireModule(entitlement, "competitions", "/dashboard?e=module");
  const codeEnabled = moduleEnabled(entitlement.modules, "competition_code");
  const participantsEnabled = moduleEnabled(entitlement.modules, "competition_participants");
  const resultsEnabled = moduleEnabled(entitlement.modules, "competition_results");
  const phasesEnabled = moduleEnabled(entitlement.modules, "competition_phases");
  const questionsEnabled = moduleEnabled(entitlement.modules, "competition_questions");
  const monitoringEnabled = moduleEnabled(entitlement.modules, "competition_monitoring");
  const reportsEnabled = moduleEnabled(entitlement.modules, "competition_reports");

  const { data: comp } = await supabase
    .from("competitions")
    .select("id, title, description, format, status, session_id, quiz_id, event_id, max_participants, results_published, created_at, quizzes(title)")
    .eq("id", id)
    .eq("organization_id", org.id)
    .maybeSingle();
  if (!comp) notFound();

  const [
    { data: codes },
    { data: registrations },
    { data: phases },
    { data: quizQuestions },
    { data: liveSession },
    { data: sessionParticipants },
  ] = await Promise.all([
    supabase
      .from("competition_access_codes")
      .select("id, code, label, is_active, max_uses, expires_at, created_at")
      .eq("competition_id", comp.id)
      .eq("organization_id", org.id)
      .order("created_at"),
    supabase
      .from("competition_registrations")
      .select("id, full_name, participant_ref, status, source, created_at")
      .eq("competition_id", comp.id)
      .eq("organization_id", org.id)
      .order("created_at", { ascending: false })
      .limit(300),
    phasesEnabled && comp.event_id
      ? supabase
          .from("competition_event_phases")
          .select("id, phase_key, phase_type, title, status, max_questions, qualification_rule, sort, created_at")
          .eq("event_id", comp.event_id)
          .order("sort")
      : Promise.resolve({ data: [] as unknown[] }),
    questionsEnabled && comp.quiz_id
      ? supabase
          .from("quiz_questions")
          .select("position, question_id, questions(id, prompt, type, points, difficulty, topic)")
          .eq("quiz_id", comp.quiz_id)
          .order("position")
          .limit(200)
      : Promise.resolve({ data: [] as unknown[] }),
    monitoringEnabled && comp.session_id
      ? supabase
          .from("quiz_sessions")
          .select("id, join_code, status, phase, mode, current_question_index, admission_open, created_at, ended_at")
          .eq("id", comp.session_id)
          .eq("organization_id", org.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    (monitoringEnabled || reportsEnabled) && comp.session_id
      ? supabase
          .from("session_participants")
          .select("id, display_name, participant_ref, score, status, joined_at, last_seen_at")
          .eq("session_id", comp.session_id)
          .order("score", { ascending: false })
          .limit(300)
      : Promise.resolve({ data: [] as unknown[] }),
  ]);

  const { canManage, isManager } = await canOperateMany(ctx, org.id, {
    canManage: { permission: "competitions.edit", module: "competitions" },
    isManager: { permission: "competitions.delete", module: "competitions" },
  });
  const active = (registrations ?? []).filter((r) => r.status !== "removed");

  const phaseRows = (phases ?? []) as unknown as {
    id: string;
    phase_type: string;
    title: string;
    status: string;
    max_questions: number | null;
    qualification_rule: { summary?: string } | null;
    sort: number;
  }[];
  const questionRows = ((quizQuestions ?? []) as unknown as {
    position: number;
    questions: { id: string; prompt: string; type: string; points: number; difficulty: string | null; topic: string | null } | null;
  }[]).filter((q) => Boolean(q.questions));
  const totalQuestionPoints = questionRows.reduce((s, r) => s + Number(r.questions?.points ?? 0), 0);

  const participantScores = (sessionParticipants ?? []) as unknown as {
    id: string;
    display_name: string;
    participant_ref: string | null;
    score: number | null;
    status: string;
    joined_at: string;
  }[];
  const numericScores = participantScores.map((p) => Number(p.score ?? 0));
  const avgScore = numericScores.length
    ? (numericScores.reduce((a, b) => a + b, 0) / numericScores.length).toFixed(1)
    : "—";
  const topScore = numericScores.length ? Math.max(...numericScores) : "—";

  return (
    <>
      <p className="mb-3 text-sm">
        <Link href="/dashboard/competitions" className="font-medium text-evergreen-700 underline-offset-2 hover:underline">
          ← All competitions
        </Link>
      </p>
      <PageTitle
        eyebrow="Live Operations · Competition Workspace"
        title={comp.title}
        subtitle={`${FORMAT_LABELS[comp.format] ?? comp.format} · created ${fmtDateTime(comp.created_at)}${comp.quizzes ? ` · quiz ${(comp.quizzes as unknown as { title: string }).title}` : ""}`}
        action={<Badge tone={comp.status === "live" ? "green" : comp.status === "draft" ? "gray" : "amber"}>{comp.status}</Badge>}
      />

      {sp.ok === "phase_created" && (
        <p role="status" className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">
          Competition phase added to this event.
        </p>
      )}
      {sp.e && (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-900">
          The competition update could not be completed. Check your permissions and try again.
        </p>
      )}

      {comp.description && <p className="mb-4 max-w-3xl text-sm text-ink-soft">{comp.description}</p>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {participantsEnabled && <StatCard label="Registered" value={active.length} hint="Excludes removed entries" />}
        {codeEnabled && <StatCard label="Admission codes" value={(codes ?? []).length} />}
        {resultsEnabled && <StatCard label="Results published" value={comp.results_published ? "Yes" : "No"} />}
        <StatCard label="Max participants" value={comp.max_participants ?? "—"} />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {monitoringEnabled && canManage && comp.session_id && (
          <ButtonLink href={`/dashboard/sessions/${comp.session_id}/host`} variant="gold">
            Open live host console
          </ButtonLink>
        )}
        {canManage && comp.status === "draft" && (
          <form action={setOrgCompetitionStatus}>
            <input type="hidden" name="id" value={comp.id} />
            <input type="hidden" name="status" value="published" />
            <Button type="submit">Publish competition</Button>
          </form>
        )}
        {canManage && comp.status !== "ended" && comp.status !== "archived" && (
          <form action={setOrgCompetitionStatus}>
            <input type="hidden" name="id" value={comp.id} />
            <input type="hidden" name="status" value="ended" />
            <Button type="submit" variant="outline">Close competition</Button>
          </form>
        )}
        {isManager && comp.status === "draft" && (
          <form action={deleteDraftCompetition}>
            <input type="hidden" name="id" value={comp.id} />
            <Button type="submit" variant="danger">Delete draft</Button>
          </form>
        )}
        {resultsEnabled && (
          <ButtonLink href="/dashboard/competitions/rankings" variant="outline">Rankings &amp; results</ButtonLink>
        )}
        {reportsEnabled && (
          <ButtonLink
            href={comp.session_id ? `/dashboard/reports/session/${comp.session_id}` : "/dashboard/reports"}
            variant="outline"
          >
            Competition report
          </ButtonLink>
        )}
      </div>

      {monitoringEnabled && (
        <Card className="mt-6 p-5 sm:p-6" data-testid="competition-monitoring-panel">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-base font-semibold text-evergreen-950">Live competition monitoring</h2>
              <p className="mt-1 text-xs text-ink-soft">
                Real-time session telemetry and host controls for this competition.
              </p>
            </div>
            {liveSession ? (
              <Badge tone={liveSession.status === "live" ? "green" : liveSession.status === "paused" ? "gold" : "gray"}>
                Session: {liveSession.status}
              </Badge>
            ) : (
              <Badge tone="gray">No live session attached</Badge>
            )}
          </div>
          {liveSession ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-4">
              <div className="rounded-xl bg-cream p-3">
                <p className="text-[11px] font-semibold uppercase text-ink-soft">Join code</p>
                <p className="mt-0.5 font-mono text-base font-bold text-evergreen-950">{liveSession.join_code}</p>
              </div>
              <div className="rounded-xl bg-cream p-3">
                <p className="text-[11px] font-semibold uppercase text-ink-soft">Phase / Question</p>
                <p className="mt-0.5 text-sm font-semibold capitalize text-evergreen-950">
                  {liveSession.phase ?? "waiting"} · Q{Number(liveSession.current_question_index ?? 0) + 1}
                </p>
              </div>
              <div className="rounded-xl bg-cream p-3">
                <p className="text-[11px] font-semibold uppercase text-ink-soft">Connected participants</p>
                <p className="mt-0.5 text-sm font-semibold text-evergreen-950">{participantScores.length}</p>
              </div>
              <div className="flex items-center justify-end">
                {canManage && (
                  <ButtonLink href={`/dashboard/sessions/${liveSession.id}/host`} variant="gold" className="text-xs">
                    Open live host console →
                  </ButtonLink>
                )}
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-ink-soft">
              Launch a live session from the attached quiz to supervise participants in real time.
            </p>
          )}
        </Card>
      )}

      {phasesEnabled && (
        <Card className="mt-6 p-5 sm:p-6" data-testid="competition-phases-panel">
          <h2 className="font-display text-base font-semibold text-evergreen-950">Event phases ({phaseRows.length})</h2>
          <p className="mt-1 text-xs text-ink-soft">
            Structure qualifiers, rounds, semifinals, and finals with progression rules for this competition event.
          </p>
          {phaseRows.length > 0 ? (
            <ol className="mt-3 space-y-2">
              {phaseRows.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-evergreen-900/10 bg-cream/60 px-4 py-3 text-sm">
                  <div>
                    <span className="font-semibold text-evergreen-950">
                      {p.sort}. {p.title}
                    </span>
                    <span className="ml-2 text-xs capitalize text-ink-soft">
                      {p.phase_type}{p.max_questions ? ` · ${p.max_questions} questions` : ""}
                    </span>
                    {p.qualification_rule?.summary && (
                      <p className="mt-0.5 text-xs text-ink-soft">Qualification: {p.qualification_rule.summary}</p>
                    )}
                  </div>
                  <Badge tone={p.status === "live" ? "green" : "gray"}>{p.status}</Badge>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-3 text-sm text-ink-soft">No event phases defined yet.</p>
          )}
          {canManage && (
            <form action={createOrgCompetitionPhase} className="mt-4 grid gap-3 border-t border-evergreen-900/10 pt-4 sm:grid-cols-4">
              <input type="hidden" name="competition_id" value={comp.id} />
              <Field label="Phase title">
                <Input name="title" placeholder="e.g. Round 1 Qualifier" required />
              </Field>
              <Field label="Type">
                <Select name="phase_type" defaultValue="qualifier">
                  <option value="qualifier">Qualifier</option>
                  <option value="round">Round</option>
                  <option value="semifinal">Semifinal</option>
                  <option value="final">Final</option>
                  <option value="tiebreaker">Tiebreaker</option>
                </Select>
              </Field>
              <Field label="Max questions">
                <Input name="max_questions" type="number" min={1} max={500} placeholder="20" />
              </Field>
              <Field label="Qualification rule">
                <Input name="qualification_rule" placeholder="e.g. Top 10 advance" />
              </Field>
              <div className="sm:col-span-4">
                <Button type="submit" variant="outline" className="text-xs">Add phase</Button>
              </div>
            </form>
          )}
        </Card>
      )}

      {questionsEnabled && (
        <Card className="mt-6 p-5 sm:p-6" data-testid="competition-questions-panel">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-base font-semibold text-evergreen-950">
                Competition questions ({questionRows.length})
              </h2>
              <p className="mt-1 text-xs text-ink-soft">
                Total value: <strong>{totalQuestionPoints} pts</strong>
              </p>
            </div>
            {comp.quiz_id && (
              <ButtonLink href={`/dashboard/quizzes/${comp.quiz_id}`} variant="outline" className="text-xs">
                Manage question set →
              </ButtonLink>
            )}
          </div>
          {questionRows.length === 0 ? (
            <p className="mt-3 text-sm text-ink-soft">
              No question set is attached to this competition yet. Link a quiz to populate competition questions.
            </p>
          ) : (
            <ol className="mt-3 space-y-2">
              {questionRows.slice(0, 20).map((row, idx) => (
                <li key={row.questions!.id} className="rounded-xl border border-evergreen-900/10 bg-cream/50 px-3 py-2 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-evergreen-950">Q{idx + 1}</span>
                    <Badge tone="green">{row.questions!.type.replace(/_/g, " ")}</Badge>
                    <Badge tone="gold">{Number(row.questions!.points)} pts</Badge>
                    {row.questions!.topic && <Badge tone="gray">{row.questions!.topic}</Badge>}
                  </div>
                  <p className="mt-1 line-clamp-2 text-ink">{row.questions!.prompt}</p>
                </li>
              ))}
            </ol>
          )}
        </Card>
      )}

      {reportsEnabled && (
        <Card className="mt-6 p-5 sm:p-6" data-testid="competition-reports-panel">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-base font-semibold text-evergreen-950">Competition reports &amp; analytics</h2>
              <p className="mt-1 text-xs text-ink-soft">
                Real score distribution and participation summary for this competition&apos;s session.
              </p>
            </div>
            {comp.session_id && (
              <ButtonLink href={`/dashboard/reports/session/${comp.session_id}`} variant="outline" className="text-xs">
                Full session report →
              </ButtonLink>
            )}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-cream p-3">
              <p className="text-[11px] font-semibold uppercase text-ink-soft">Scored participants</p>
              <p className="mt-0.5 font-display text-lg font-semibold text-evergreen-950">{participantScores.length}</p>
            </div>
            <div className="rounded-xl bg-cream p-3">
              <p className="text-[11px] font-semibold uppercase text-ink-soft">Average score</p>
              <p className="mt-0.5 font-display text-lg font-semibold text-evergreen-950">{avgScore}</p>
            </div>
            <div className="rounded-xl bg-cream p-3">
              <p className="text-[11px] font-semibold uppercase text-ink-soft">Highest score</p>
              <p className="mt-0.5 font-display text-lg font-semibold text-evergreen-950">{topScore}</p>
            </div>
          </div>
        </Card>
      )}

      {codeEnabled && (
        <Card className="mt-6 p-5 sm:p-6">
          <h2 className="font-display text-base font-semibold text-evergreen-950">Admission codes</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Participants enter a code at <span className="font-mono text-xs">/join</span> together with their name and avatar.
          </p>
          {(codes ?? []).length === 0 ? (
            <p className="mt-3 text-sm text-ink-soft">No admission code has been issued for this competition.</p>
          ) : (
            <ul className="mt-3 divide-y divide-evergreen-900/10 text-sm">
              {(codes ?? []).map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="font-mono text-base font-semibold tracking-widest text-evergreen-950">{c.code}</span>
                  <span className="text-xs text-ink-soft">
                    {c.label ?? "General admission"} · {c.is_active === false ? "inactive" : "active"}
                    {c.max_uses ? ` · max ${c.max_uses}` : ""}
                    {c.expires_at ? ` · expires ${fmtDateTime(c.expires_at)}` : ""}
                  </span>
                  <Link href={`/play/${c.code}`} target="_blank" className="text-xs font-semibold text-evergreen-700 underline underline-offset-2">
                    Preview join page
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {participantsEnabled && (
        <Card className="mt-6 p-5 sm:p-6">
          <h2 className="font-display text-base font-semibold text-evergreen-950">Participants ({active.length})</h2>
          {(registrations ?? []).length === 0 ? (
            <p className="mt-3 text-sm text-ink-soft">
              Nobody has registered yet. Share an admission code above — registrations appear here as participants join.
            </p>
          ) : (
            <div className="mt-3">
              <DataTable head={["Participant", "Reference", "Source", "Status", "Registered"]} label="Competition participants">
                {(registrations ?? []).slice((page - 1) * pageSize, page * pageSize).map((r) => (
                  <tr key={r.id}>
                    <td className="font-medium text-evergreen-950">{r.full_name ?? "—"}</td>
                    <td className="font-mono text-xs text-ink-soft">{r.participant_ref ?? "—"}</td>
                    <td className="text-xs capitalize text-ink-soft">{r.source ?? "—"}</td>
                    <td className="text-xs capitalize">{r.status}</td>
                    <td className="text-xs text-ink-soft">{fmtDateTime(r.created_at)}</td>
                  </tr>
                ))}
              </DataTable>
              <PageNavigation
                page={page}
                pageSize={pageSize}
                total={(registrations ?? []).length}
                pathname={`/dashboard/competitions/${comp.id}`}
                label="participants"
              />
            </div>
          )}
        </Card>
      )}
    </>
  );
}
