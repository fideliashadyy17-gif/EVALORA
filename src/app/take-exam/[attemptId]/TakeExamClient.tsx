"use client";

import { Logo } from "@/components/Logo";
import { QuestionRunner, type PublicQuestion } from "@/components/QuestionRunner";
import { Badge, Button, Card } from "@/components/ui";
import { cn, mmss } from "@/lib/utils";
import "@livekit/components-styles";
import { LiveKitRoom, VideoTrack, useLocalParticipant, useTracks } from "@livekit/components-react";
import { Track } from "livekit-client";
import { Flag } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

interface ExamState {
  server_now: string;
  exam: { id: string; title: string; description: string | null; instructions: string | null; proctoring: boolean; require_screen_share: boolean; pass_mark_percent: number };
  candidate: { name: string; ref: string | null };
  attempt: { id: string; status: string; deadline: string; flagged: string[]; score: number | null; max_score: number | null; results_published: boolean };
  questions: (PublicQuestion & {
    saved_answer: Record<string, unknown> | null;
    result: { is_correct: boolean | null; points_awarded: number | null; explanation: string | null } | null;
  })[];
}

function LocalCamera() {
  const tracks = useTracks([Track.Source.Camera]);
  const local = tracks.find((t) => t.participant.isLocal);
  if (!local) return <div className="flex h-28 items-center justify-center rounded-xl bg-evergreen-950 text-xs text-white">Starting camera…</div>;
  return (
    <div className="overflow-hidden rounded-xl border-2 border-gold-500">
      <VideoTrack trackRef={local} className="h-28 w-full object-cover" />
    </div>
  );
}

function ScreenShareButton() {
  const { localParticipant } = useLocalParticipant();
  const [sharing, setSharing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function toggle() {
    try {
      await localParticipant.setScreenShareEnabled(!sharing);
      setSharing(!sharing);
      setErr(null);
    } catch {
      setErr("Screen sharing was not granted.");
    }
  }
  return (
    <div>
      <Button variant="outline" className="w-full text-xs" onClick={toggle}>
        {sharing ? "Stop sharing screen" : "Share my screen"}
      </Button>
      {err && <p className="mt-1 text-xs text-red-700">{err}</p>}
    </div>
  );
}

export function TakeExamClient({ attemptId }: { attemptId: string }) {
  const [token, setToken] = useState<string | null>(null);
  const [state, setState] = useState<ExamState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [flagged, setFlagged] = useState<string[]>([]);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [lk, setLk] = useState<{ token: string; serverUrl: string } | null>(null);
  const offset = useRef(0);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`evalora-attempt-${attemptId}`);
      if (raw) setToken(JSON.parse(raw).token);
      else setError("We couldn't verify this session. Please go through the examination entry page again.");
    } catch {
      setError("We couldn't verify this session.");
    }
  }, [attemptId]);

  const load = useCallback(async () => {
    if (!token) return;
    const res = await fetch(`/api/exam/state?attempt_id=${attemptId}&token=${token}`);
    const data = await res.json().catch(() => null);
    if (!res.ok) { setError(data?.error ?? "Could not load the examination."); return; }
    offset.current = new Date(data.server_now).getTime() - Date.now();
    setState(data);
    setFlagged(data.attempt.flagged ?? []);
    setSavedIds(new Set(data.questions.filter((q: ExamState["questions"][0]) => q.saved_answer).map((q: ExamState["questions"][0]) => q.question_id)));
  }, [attemptId, token]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  // LiveKit candidate connection
  useEffect(() => {
    if (!state?.exam.proctoring || !token || state.attempt.status !== "in_progress") return;
    fetch("/api/livekit/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ exam_id: state.exam.id, attempt_id: attemptId, token, role: "candidate" }),
    })
      .then((r) => r.json())
      .then((d) => { if (d.token) setLk({ token: d.token, serverUrl: d.serverUrl }); })
      .catch(() => {});
  }, [state?.exam.proctoring, state?.exam.id, state?.attempt.status, token, attemptId]);

  async function save(questionId: string, quizQuestionId: string, payload: Record<string, unknown>, newFlagged = flagged) {
    if (!token) return;
    setSaving(true);
    const res = await fetch("/api/exam/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attempt_id: attemptId, token, question_id: questionId, quiz_question_id: quizQuestionId, answer: payload, flagged: newFlagged }),
    });
    setSaving(false);
    if (res.ok) setSavedIds((p) => new Set(p).add(questionId));
  }

  async function submit() {
    if (!token) return;
    await fetch("/api/exam/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attempt_id: attemptId, token }),
    });
    load();
  }

  if (error) {
    return (
      <Centered>
        <h1 className="font-display text-2xl font-semibold text-evergreen-950">Examination unavailable</h1>
        <p className="mt-2 text-ink-soft">{error}</p>
        <a href="/exam-access" className="mt-4 inline-block font-semibold text-evergreen-700 underline underline-offset-2">Go to examination entry</a>
      </Centered>
    );
  }
  if (!state) return <Centered><p className="text-ink-soft">Loading your examination paper…</p></Centered>;

  const { exam, attempt, questions } = state;
  const submitted = attempt.status !== "in_progress";
  const remaining = Math.max(0, (new Date(attempt.deadline).getTime() - (now + offset.current)) / 1000);
  const current = questions[index];

  const pct = attempt.score !== null && attempt.max_score ? (attempt.score / attempt.max_score) * 100 : null;

  const examBody = (
    <div className="min-h-screen bg-cream">
      <header className="sticky top-0 z-40 border-b border-evergreen-900/15 bg-paper">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <Logo href={null} iconOnly />
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-lg font-semibold text-evergreen-950">{exam.title}</p>
            <p className="text-xs text-ink-soft">{state.candidate.name}{state.candidate.ref ? ` · ${state.candidate.ref}` : ""}</p>
          </div>
          {!submitted && (
            <div className={`rounded-xl px-4 py-2 text-center ${remaining <= 300 ? "bg-red-700 text-white" : "border border-evergreen-900/15 bg-evergreen-50 text-evergreen-950"}`}>
              <p className={`text-[10px] uppercase tracking-wider ${remaining <= 300 ? "text-white" : "text-ink-soft"}`}>Time remaining</p>
              <p className="font-display text-2xl font-bold tabular-nums leading-none">{mmss(Math.ceil(remaining))}</p>
            </div>
          )}
          <Badge tone={submitted ? "green" : "gold"}>{submitted ? attempt.status.replace(/_/g, " ") : "In progress"}</Badge>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:grid-cols-[240px_1fr]">
        <aside className="space-y-4 lg:sticky lg:top-24 lg:h-fit">
          {exam.proctoring && !submitted && (
            <Card className="space-y-2 p-3">
              <p className="flex items-center gap-2 text-xs font-semibold text-evergreen-900">
                <span className="live-dot inline-block h-2 w-2 rounded-full bg-red-600" /> Live supervision active
              </p>
              {lk ? <LocalCamera /> : <p className="text-xs text-ink-soft">Connecting camera… if prompted, please allow camera &amp; microphone access.</p>}
              {exam.require_screen_share && lk && <ScreenShareButton />}
            </Card>
          )}
          <Card className="p-4">
            <p className="mb-3 text-sm font-semibold text-evergreen-950">Questions</p>
            <div className="flex flex-wrap gap-1.5">
              {questions.map((q, i) => (
                <button
                  key={q.question_id}
                  onClick={() => setIndex(i)}
                  className={cn(
                    "relative flex h-9 w-9 items-center justify-center rounded-lg text-sm font-medium transition",
                    i === index ? "bg-evergreen-700 text-white" : savedIds.has(q.question_id) ? "bg-evergreen-100 text-evergreen-900" : "bg-white text-ink border border-evergreen-900/15",
                  )}
                >
                  {i + 1}
                  {flagged.includes(q.question_id) && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-gold-500 ring-2 ring-white" />}
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs text-ink-soft">{savedIds.size} of {questions.length} answered{saving ? " · saving…" : " · all changes autosaved"}</p>
          </Card>
          {exam.instructions && (
            <Card className="p-4">
              <p className="text-sm font-semibold text-evergreen-950">Instructions</p>
              <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-ink-soft">{exam.instructions}</p>
            </Card>
          )}
        </aside>

        <section>
          {submitted ? (
            <Card className="p-7 text-center">
              <p className="text-5xl">📋</p>
              <h1 className="mt-3 font-display text-3xl font-semibold text-evergreen-950">
                {attempt.status === "auto_submitted" ? "Time expired — paper submitted automatically" : "Your paper has been submitted"}
              </h1>
              {attempt.results_published && attempt.score !== null ? (
                <div className="mt-4">
                  <p className="text-lg">Score: <strong className="text-evergreen-800">{attempt.score} / {attempt.max_score}</strong> ({pct?.toFixed(1)}%)</p>
                  <Badge tone={(pct ?? 0) >= exam.pass_mark_percent ? "green" : "red"} className="mt-2 px-3 py-1">
                    {(pct ?? 0) >= exam.pass_mark_percent ? "PASS" : "Below pass mark"} · pass mark {exam.pass_mark_percent}%
                  </Badge>
                  <p className="mt-3 text-sm text-ink-soft">Use the question navigator to review each question with its result and explanation.</p>
                </div>
              ) : (
                <p className="mt-3 text-ink-soft">Results will appear here once your institution publishes them. You can safely close this page.</p>
              )}
            </Card>
          ) : null}

          {current && (
            <Card className={`${submitted ? "mt-5" : ""} p-6 sm:p-7`}>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <Badge tone="green">Question {index + 1} of {questions.length}</Badge>
                <Badge tone="gold">{current.points} point(s)</Badge>
                <button
                  disabled={submitted}
                  onClick={() => {
                    const next = flagged.includes(current.question_id)
                      ? flagged.filter((f) => f !== current.question_id)
                      : [...flagged, current.question_id];
                    setFlagged(next);
                    if (current.saved_answer) save(current.question_id, current.quiz_question_id, current.saved_answer, next);
                  }}
                  className={cn("ml-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium", flagged.includes(current.question_id) ? "bg-gold-100 text-gold-700" : "text-ink-soft hover:bg-cream")}
                >
                  <Flag className="h-4 w-4" /> {flagged.includes(current.question_id) ? "Flagged for review" : "Flag for review"}
                </button>
              </div>

              <QuestionRunner
                key={current.question_id}
                question={current}
                initial={current.saved_answer}
                disabled={submitted}
                submitLabel="Save answer"
                onAnswer={(payload) => save(current.question_id, current.quiz_question_id, payload)}
              />

              {current.result && (
                <div className={`mt-5 rounded-xl p-4 text-sm ${current.result.is_correct === true ? "bg-evergreen-50 text-evergreen-900" : current.result.is_correct === false ? "bg-red-50 text-red-900" : "bg-amber-50 text-amber-900"}`}>
                  <p className="font-semibold">
                    {current.result.is_correct === null
                      ? "Awaiting manual marking by your examiner."
                      : `${current.result.is_correct ? "Correct" : "Incorrect"} · ${current.result.points_awarded ?? 0} / ${current.points} points`}
                  </p>
                  {current.result.explanation && <p className="mt-1">{current.result.explanation}</p>}
                </div>
              )}

              <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-evergreen-900/10 pt-4">
                <Button variant="outline" disabled={index === 0} onClick={() => setIndex(index - 1)}>← Previous</Button>
                <Button variant="outline" disabled={index === questions.length - 1} onClick={() => setIndex(index + 1)}>Next →</Button>
                {!submitted && (
                  <Button variant="danger" className="ml-auto" onClick={() => setConfirmSubmit(true)}>Submit examination</Button>
                )}
              </div>
            </Card>
          )}

          {confirmSubmit && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-evergreen-950/70 px-4">
              <Card className="w-full max-w-md p-6">
                <h2 className="font-display text-xl font-semibold text-evergreen-950">Submit your paper?</h2>
                <p className="mt-2 text-sm text-ink-soft">
                  You have answered {savedIds.size} of {questions.length} questions
                  {flagged.length ? ` and flagged ${flagged.length} for review` : ""}.
                  After submission you cannot change any answer.
                </p>
                <div className="mt-4 flex gap-2">
                  <Button variant="danger" className="flex-1" onClick={() => { setConfirmSubmit(false); submit(); }}>Yes, submit now</Button>
                  <Button variant="outline" className="flex-1" onClick={() => setConfirmSubmit(false)}>Keep working</Button>
                </div>
              </Card>
            </div>
          )}
        </section>
      </main>
    </div>
  );

  if (exam.proctoring && lk && !submitted) {
    return (
      <LiveKitRoom token={lk.token} serverUrl={lk.serverUrl} connect video audio data-lk-theme="default">
        {examBody}
      </LiveKitRoom>
    );
  }
  return examBody;
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-cream px-4 py-10 text-center">
      <Logo className="mb-6" />
      <Card className="w-full max-w-md p-7">{children}</Card>
    </div>
  );
}
