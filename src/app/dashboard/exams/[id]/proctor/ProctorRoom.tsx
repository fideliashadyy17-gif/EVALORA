"use client";

import { Badge, Button, Card, Field, Input, Select } from "@/components/ui";
import "@livekit/components-styles";
import { LiveKitRoom, ParticipantTile, useConnectionState, useParticipants, useTracks } from "@livekit/components-react";
import { Track } from "livekit-client";
import { useEffect, useMemo, useState } from "react";
import { logIncident } from "../../actions";

const PAGE_SIZE = 12;

function Grid({ candidates, onRetry, connectionError }: { candidates: { id: string; full_name: string }[]; onRetry: () => void; connectionError: string | null }) {
  const connection = useConnectionState();
  const participants = useParticipants();
  const tracks = useTracks([Track.Source.Camera, Track.Source.ScreenShare]);
  const [page, setPage] = useState(0);
  const [focus, setFocus] = useState<string | null>(null);

  const candidateTracks = useMemo(
    () => tracks.filter((t) => t.participant.identity.startsWith("candidate-")),
    [tracks],
  );
  const pages = Math.max(1, Math.ceil(candidateTracks.length / PAGE_SIZE));
  const visible = focus
    ? candidateTracks.filter((t) => t.participant.identity === focus)
    : candidateTracks.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const byIdentity = useMemo(() => {
    const m = new Map<string, string>();
    candidates.forEach((c) => m.set(`candidate-${c.id}`, c.full_name));
    return m;
  }, [candidates]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-ink-soft">
        <Badge tone="amber">{connection === "connected" ? "Video room connected" : connection === "connecting" ? "Connecting" : connection === "reconnecting" || connection === "signalReconnecting" ? "Reconnecting" : "Disconnected"}</Badge>
        {connection === "connected" && <span>{participants.filter((p) => p.identity.startsWith("candidate-")).length} candidate(s) connected · {candidateTracks.length} video feed(s)</span>}
        {(connection === "disconnected" || connectionError) && <Button variant="outline" onClick={onRetry}>Retry video connection</Button>}
        {!focus && pages > 1 && (
          <span className="ml-auto flex items-center gap-2">
            <Button variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>←</Button>
            <span>Page {page + 1} / {pages}</span>
            <Button variant="outline" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>→</Button>
          </span>
        )}
        {focus && <Button variant="outline" className="ml-auto" onClick={() => setFocus(null)}>← Back to grid</Button>}
      </div>

      {connectionError && <p role="alert" className="mb-3 text-sm text-red-700">{connectionError}</p>}
      {connection !== "connected" ? (
        <p role="status" className="rounded-xl bg-cream p-6 text-center text-sm text-ink-soft">Candidate feeds cannot be verified while the room is not connected. Retry if necessary.</p>
      ) : candidateTracks.length === 0 ? (
        <p className="rounded-xl bg-cream p-6 text-center text-sm text-ink-soft">
          No candidate cameras yet. Feeds appear automatically when candidates enter the examination with proctoring enabled.
        </p>
      ) : (
        <div className={`grid gap-3 ${focus ? "grid-cols-1" : "sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"}`}>
          {visible.map((t) => (
            <div key={`${t.participant.identity}-${t.source}`} className="group relative">
              <div className="overflow-hidden rounded-xl border border-evergreen-900/15 bg-evergreen-950">
                <ParticipantTile trackRef={t} className={focus ? "h-[55vh]" : "h-44"} />
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-2 px-0.5">
                <span className="truncate text-sm font-medium">
                  {byIdentity.get(t.participant.identity) ?? t.participant.name ?? t.participant.identity}
                  <span className="ml-1 text-xs text-ink-soft">({t.source === Track.Source.ScreenShare ? "screen" : "camera"})</span>
                </span>
                <button className="shrink-0 text-xs font-medium text-evergreen-700 underline-offset-2 hover:underline" onClick={() => setFocus(focus === t.participant.identity ? null : t.participant.identity)}>
                  {focus === t.participant.identity ? "Grid" : "Focus"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}

function IncidentForm({ examId, candidates }: { examId: string; candidates: { id: string; full_name: string }[] }) {
  const [message, setMessage] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, setPending] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    setPending(true);
    setMessage(null);
    try {
      const result = await logIncident(new FormData(form));
      if (result.ok) form.reset();
      setMessage(result);
    } catch {
      setMessage({ ok: false, message: "The observation could not be confirmed. Check the incident list before retrying; your draft is preserved." });
    } finally { setPending(false); }
  }
  return (
      <Card className="mt-6 p-5">
        <h3 className="font-display text-lg font-semibold text-evergreen-950">Log an observation</h3>
        <p className="mt-1 text-xs text-ink-soft">
          Record facts only (e.g. “second person visible at 10:04”). Every incident is reviewed by an
          authorized person before any conclusion — an alert is never proof of misconduct.
        </p>
        {message && <p role={message.ok ? "status" : "alert"} className={`mt-3 text-sm ${message.ok ? "text-evergreen-800" : "text-red-700"}`}>{message.message}</p>}
        <form onSubmit={submit} className="mt-3 grid gap-3 sm:grid-cols-[1fr_160px_140px_auto]">
          <input type="hidden" name="exam_id" value={examId} />
          <Field label="Candidate">
            <Select name="candidate_id">
              <option value="">Select candidate…</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>{c.full_name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Type">
            <Select name="type">
              <option value="observation">Observation</option>
              <option value="second_person">Second person visible</option>
              <option value="left_seat">Left seat / camera covered</option>
              <option value="phone_detected">Phone detected</option>
              <option value="talking">Talking</option>
              <option value="connection">Connection issue</option>
              <option value="other">Other</option>
            </Select>
          </Field>
          <Field label="Severity">
            <Select name="severity">
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </Select>
          </Field>
          <div className="flex items-end">
            <Button type="submit" disabled={pending}>{pending ? "Recording…" : "Log"}</Button>
          </div>
          <div className="sm:col-span-4">
            <Input name="note" placeholder="Note (what you observed, with time)…" />
          </div>
        </form>
      </Card>
  );
}

export function ProctorRoom({ examId, candidates }: { examId: string; candidates: { id: string; full_name: string }[] }) {
  const [lk, setLk] = useState<{ token: string; serverUrl: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  function retryConnection() { setLk(null); setError(null); setConnectionError(null); setRetry((n) => n + 1); }

  useEffect(() => {
    let cancelled = false;
    setError(null);
    fetch("/api/livekit/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ exam_id: examId, role: "supervisor" }),
    })
      .then(async (r) => {
        const d = await r.json().catch(() => null);
        if (!r.ok || typeof d?.token !== "string" || !d.token || typeof d?.serverUrl !== "string" || !d.serverUrl)
          throw new Error("Video access unavailable");
        if (!cancelled) setLk({ token: d.token, serverUrl: d.serverUrl });
      })
      .catch(() => { if (!cancelled) setError("Could not request video access. Retry or contact your administrator."); });
    return () => { cancelled = true; };
  }, [examId, retry]);

  return <>
    {lk ? <LiveKitRoom token={lk.token} serverUrl={lk.serverUrl} connect video={false} audio={false} data-lk-theme="default"
      onError={() => setConnectionError("Video connection failed. Retry or contact your administrator.")}
      onConnected={() => setConnectionError(null)}>
      <Grid candidates={candidates} onRetry={retryConnection} connectionError={connectionError} />
    </LiveKitRoom> : error ? <div role="alert" className="space-y-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">
      <p>{error}</p><Button variant="outline" onClick={retryConnection}>Retry video connection</Button>
    </div> : <p className="text-ink-soft">Requesting video access (you join as a silent observer — your camera stays off)…</p>}
    <IncidentForm examId={examId} candidates={candidates} />
  </>;
}
