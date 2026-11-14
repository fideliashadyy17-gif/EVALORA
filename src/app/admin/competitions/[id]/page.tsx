import { Badge, Button, Card } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { COMPETITION_FORMATS } from "@/lib/brand";
import { publicScreenPath } from "@/lib/liveDisplayToken";
import { createAdminClient } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/utils";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  setCompetitionStatus,
  startCompetitionSession,
} from "../../actions/competitions";
import { Notice, StatusBadge } from "../../ui";
import { CodesTab } from "./tabs/CodesTab";
import { ParticipantsTab } from "./tabs/ParticipantsTab";
import { ResultsTab } from "./tabs/ResultsTab";
import { SettingsTab } from "./tabs/SettingsTab";

export const metadata: Metadata = { title: "Competition" };
export const dynamic = "force-dynamic";

const TABS = [
  { key: "overview", label: "Overview & live control" },
  { key: "codes", label: "Access codes" },
  { key: "participants", label: "Participants" },
  { key: "results", label: "Results & rankings" },
  { key: "settings", label: "Settings" },
] as const;

const FORMAT_LABELS = Object.fromEntries(COMPETITION_FORMATS.map((f) => [f.value, f.label]));

export default async function CompetitionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; ok?: string; e?: string; edit_code?: string }>;
}) {
  await requireSuperAdmin();
  const { id } = await params;
  const sp = await searchParams;
  const tab = TABS.some((t) => t.key === sp.tab) ? (sp.tab as string) : "overview";
  const admin = createAdminClient();

  const { data: comp } = await admin
    .from("competitions")
    .select("*, organizations(id, name), quizzes(id, title, status)")
    .eq("id", id)
    .maybeSingle();
  if (!comp) notFound();

  const base = `/admin/competitions/${id}`;
  const org = comp.organizations as unknown as { id: string; name: string } | null;
  const quiz = comp.quizzes as unknown as { id: string; title: string; status: string } | null;

  let monitor: {
    session: { id: string; join_code: string; status: string; mode: string; current_question_index: number; question_started_at: string | null; display_token_version?: number; created_at: string } | null;
    participants: number;
    connected: number;
    finished: number;
    answers: number;
    questions: number;
    registrations: number;
    codes: number;
  } | null = null;
  {
    const head = { count: "exact" as const, head: true };
    const sessionRes = comp.session_id
      ? await admin.from("quiz_sessions").select("id, join_code, status, mode, current_question_index, question_started_at, display_token_version, created_at").eq("id", comp.session_id).maybeSingle()
      : { data: null };
    const session = sessionRes.data;
    const [participants, finished, answers, questions, registrations, codes, connectedRes] = await Promise.all([
      session ? admin.from("session_participants").select("id", head).eq("session_id", session.id).not("status", "in", '("rejected","blocked")').then((r) => r.count ?? 0) : Promise.resolve(0),
      session ? admin.from("session_participants").select("id", head).eq("session_id", session.id).eq("status", "finished").then((r) => r.count ?? 0) : Promise.resolve(0),
      session ? admin.from("participant_answers").select("id", head).eq("session_id", session.id).then((r) => r.count ?? 0) : Promise.resolve(0),
      comp.quiz_id ? admin.from("quiz_questions").select("id", head).eq("quiz_id", comp.quiz_id).then((r) => r.count ?? 0) : Promise.resolve(0),
      admin.from("competition_registrations").select("id", head).eq("competition_id", id).neq("status", "removed").then((r) => r.count ?? 0),
      admin.from("competition_access_codes").select("id", head).eq("competition_id", id).then((r) => r.count ?? 0),
      session
        ? admin.from("session_participants").select("id", head).eq("session_id", session.id).gte("last_seen_at", new Date(Date.now() - 90_000).toISOString()).then((r) => r.count ?? 0)
        : Promise.resolve(0),
    ]);
    monitor = { session, participants, connected: connectedRes, finished, answers, questions, registrations, codes };
  }

  const statusButton = (status: string, label: string, variant: "primary" | "gold" | "outline" | "danger" = "outline") => (
    <form key={status} action={setCompetitionStatus}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <Button type="submit" variant={variant}>{label}</Button>
    </form>
  );

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm">
        <Link href="/admin/competitions" className="font-medium text-evergreen-700 underline-offset-2 hover:underline">← All competitions</Link>
        <div className="flex flex-wrap items-center gap-3 text-xs font-medium text-evergreen-800">
          <Link href={`/admin/competitions/questions?comp=${id}`} className="underline-offset-2 hover:underline">Question preview</Link>
          <span>·</span>
          <Link href="/admin/competitions/live" className="underline-offset-2 hover:underline">Live operations room</Link>
          <span>·</span>
          <Link href={`/admin/competitions/results?comp=${id}`} className="underline-offset-2 hover:underline">Rankings center →</Link>
        </div>
      </div>

      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-semibold text-evergreen-950">{comp.title}</h1>
            <p className="mt-0.5 text-sm text-ink-soft">
              {FORMAT_LABELS[comp.format] ?? comp.format} · {comp.category}
              {org && <> · hosted by <Link href={`/admin/organizations/${org.id}`} className="font-medium text-evergreen-700 underline-offset-2 hover:underline">{org.name}</Link></>}
              {quiz && <> · quiz: {quiz.title} ({quiz.status})</>}
            </p>
            <p className="mt-2 flex flex-wrap gap-2">
              <StatusBadge status={comp.status} />
              <Badge tone="gray">{comp.visibility}</Badge>
              {comp.results_published && <Badge tone="gold">results published</Badge>}
              {comp.starts_at && <span className="text-xs text-ink-soft">Starts {fmtDateTime(comp.starts_at)}</span>}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {comp.status === "draft" && statusButton("published", "Publish", "gold")}
            {comp.status === "published" && statusButton("draft", "Unpublish")}
            {["draft", "published"].includes(comp.status) && statusButton("scheduled", "Schedule")}
            {comp.status === "live" && statusButton("paused", "Pause")}
            {comp.status === "paused" && statusButton("live", "Resume", "gold")}
            {["live", "paused"].includes(comp.status) && statusButton("ended", "End competition", "danger")}
            {!["ended", "cancelled", "archived"].includes(comp.status) && statusButton("cancelled", "Cancel")}
            {comp.status === "ended" && statusButton("archived", "Archive")}
          </div>
        </div>

        {monitor && (
          <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-evergreen-900/10 pt-4 text-center sm:grid-cols-4 lg:grid-cols-7">
            {[
              ["Registered", monitor.registrations],
              ["Access codes", monitor.codes],
              ["In session", monitor.participants],
              ["Connected (90s)", monitor.connected],
              ["Finished", monitor.finished],
              ["Answers in", monitor.answers],
              ["Questions", monitor.questions],
            ].map(([label, value]) => (
              <div key={label as string}>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">{label}</dt>
                <dd className="font-display text-xl font-semibold text-evergreen-950">{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </Card>

      <nav className="mt-6 flex flex-wrap gap-1 border-b border-evergreen-900/15" aria-label="Competition sections">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`${base}?tab=${t.key}`}
            className={`rounded-t-lg px-4 py-2.5 text-sm font-medium ${
              tab === t.key ? "bg-evergreen-700 text-white shadow-sm" : "text-evergreen-800 hover:bg-evergreen-50"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <div className="pt-6">
        {tab === "overview" && (
          <>
            <Notice
              ok={sp.ok}
              e={sp.e}
              messages={{
                created: "Competition created. Attach a quiz (Settings) if needed, review the access code, then publish.",
                duplicated: "Competition duplicated as a draft with a fresh code.",
                status_published: "Competition published.",
                status_draft: "Competition unpublished (draft).",
                status_scheduled: "Competition scheduled.",
                status_live: "Competition resumed.",
                status_paused: "Competition paused — participants are held.",
                status_ended: "Competition ended. Review and publish the results.",
                status_cancelled: "Competition cancelled.",
                status_archived: "Competition archived.",
                no_quiz: "Attach a quiz in Settings before going live.",
                no_questions: "The attached quiz has no questions yet — add them in Quiz Studio.",
                session_failed: "Could not create or link the live session. Check the competition before retrying.",
                phase_closed: "Open the event phase after meeting its progression requirements before starting this competition.",
                session_mismatch: "The event session is ended or does not match this competition. Check the event links before proceeding.",
              }}
            />
            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="p-6">
                <h2 className="font-display text-lg font-semibold text-evergreen-950">Live control room</h2>
                {monitor?.session ? (
                  <>
                    <p className="mt-2 text-sm text-ink-soft">
                      Session is <strong className="capitalize text-ink">{monitor.session.status}</strong> ({monitor.session.mode === "synchronized" ? "synchronized" : "self-paced"}),
                      opened {fmtDateTime(monitor.session.created_at)}.
                      {monitor.session.current_question_index >= 0 && (
                        <> Currently on question {monitor.session.current_question_index + 1} of {monitor.questions}.</>
                      )}
                    </p>
                    <p className="mt-3 text-sm">
                      Participant join code:{" "}
                      <span className="rounded-md bg-cream px-2 py-1 font-mono text-lg font-bold tracking-widest text-evergreen-900">{monitor.session.join_code}</span>
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <form action={startCompetitionSession}>
                        <input type="hidden" name="id" value={id} />
                        <Button type="submit" variant="gold">Open host console →</Button>
                      </form>
                      <Link href={`${publicScreenPath(id, monitor.session.id, monitor.session.display_token_version ?? 1)}&host=1`} target="_blank" className="inline-flex items-center rounded-lg border border-evergreen-700/50 bg-white px-4 py-2.5 text-sm font-medium text-evergreen-800 hover:bg-evergreen-50">
                        Open Public Live Screen ↗
                      </Link>
                      <Link href={`/join?code=${monitor.session.join_code}`} target="_blank" className="inline-flex items-center rounded-lg border border-evergreen-700/50 bg-white px-4 py-2.5 text-sm font-medium text-evergreen-800 hover:bg-evergreen-50">
                        Participant join page
                      </Link>
                      <Link href={base} className="inline-flex items-center rounded-lg px-4 py-2.5 text-sm font-medium text-evergreen-800 hover:bg-evergreen-50">
                        ↻ Refresh monitor
                      </Link>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="mt-2 text-sm text-ink-soft">
                      No live session yet. Starting creates the session, generates the participant join code and
                      takes you to the host console inside {org?.name ?? "the host organization"}&apos;s workspace.
                    </p>
                    <form action={startCompetitionSession} className="mt-4">
                      <input type="hidden" name="id" value={id} />
                      <Button type="submit" variant="gold" disabled={!quiz}>
                        {quiz ? "Start live session →" : "Attach a quiz first (Settings)"}
                      </Button>
                    </form>
                  </>
                )}
              </Card>

              <Card className="p-6">
                <h2 className="font-display text-lg font-semibold text-evergreen-950">Competition brief</h2>
                <dl className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between gap-3"><dt className="text-ink-soft">Audience</dt><dd className="text-right">{comp.target_audience ?? "—"}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-ink-soft">Level</dt><dd>{comp.education_level ?? "—"}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-ink-soft">Registration window</dt><dd className="text-right">{comp.registration_opens_at ? fmtDateTime(comp.registration_opens_at) : "open"} → {comp.registration_closes_at ? fmtDateTime(comp.registration_closes_at) : "no close"}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-ink-soft">Duration</dt><dd>{comp.duration_minutes ? `${comp.duration_minutes} min` : "—"}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-ink-soft">Participant cap</dt><dd>{comp.max_participants ?? "Unlimited"}</dd></div>
                </dl>
                {comp.description && <p className="mt-3 whitespace-pre-wrap border-t border-evergreen-900/10 pt-3 text-sm text-ink">{comp.description}</p>}
                {comp.instructions && (
                  <>
                    <p className="mt-3 text-sm font-medium text-evergreen-900">Instructions</p>
                    <p className="whitespace-pre-wrap text-sm text-ink-soft">{comp.instructions}</p>
                  </>
                )}
                {comp.rules && (
                  <>
                    <p className="mt-3 text-sm font-medium text-evergreen-900">Rules</p>
                    <p className="whitespace-pre-wrap text-sm text-ink-soft">{comp.rules}</p>
                  </>
                )}
              </Card>
            </div>
          </>
        )}
        {tab === "codes" && <CodesTab comp={comp} sp={sp} />}
        {tab === "participants" && <ParticipantsTab comp={comp} sp={sp} />}
        {tab === "results" && <ResultsTab comp={comp} sp={sp} />}
        {tab === "settings" && <SettingsTab comp={comp} sp={sp} />}
      </div>
    </>
  );
}
