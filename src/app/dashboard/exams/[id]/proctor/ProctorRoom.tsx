"use client";

import { Badge, Button, Card, Field, Input, Select } from "@/components/ui";
import "@livekit/components-styles";
import { LiveKitRoom, ParticipantTile, useParticipants, useTracks } from "@livekit/components-react";
import { Track } from "livekit-client";
import { useEffect, useMemo, useState } from "react";
import { logIncident } from "../../actions";

const PAGE_SIZE = 12;

function Grid({ candidates, examId }: { candidates: { id: string; full_name: string }[]; examId: string }) {
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
        <Badge tone="amber"><span className="live-dot mr-1 inline-block h-2 w-2 rounded-full bg-red-600" /> Live</Badge>
        <span>{participants.filter((p) => p.identity.startsWith("candidate-")).length} candidate(s) connected · {candidateTracks.length} video feed(s)</span>
        {!focus && pages > 1 && (
          <span className="ml-auto flex items-center gap-2">
            <Button variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>←</Button>
            <span>Page {page + 1} / {pages}</span>
            <Button variant="outline" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>→</Button>
          </span>
        )}
        {focus && <Button variant="outline" className="ml-auto" onClick={() => setFocus(null)}>← Back to grid</Button>}
      </div>

      {candidateTracks.length === 0 ? (
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

      <Card className="mt-6 p-5">
        <h3 className="font-display text-lg font-semibold text-evergreen-950">Log an observation</h3>
        <p className="mt-1 text-xs text-ink-soft">
          Record facts only (e.g. “second person visible at 10:04”). Every incident is reviewed by an
          authorized person before any conclusion — an alert is never proof of misconduct.
        </p>
        <form action={logIncident} className="mt-3 grid gap-3 sm:grid-cols-[1fr_160px_140px_auto]">
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
            <Button type="submit">Log</Button>
          </div>
          <div className="sm:col-span-4">
            <Input name="note" placeholder="Note (what you observed, with time)…" />
          </div>
        </form>
      </Card>
    </div>
  );
}

export function ProctorRoom({ examId, candidates }: { examId: string; candidates: { id: string; full_name: string }[] }) {
  const [lk, setLk] = useState<{ token: string; serverUrl: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/livekit/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ exam_id: examId, role: "supervisor" }),
    })
      .then(async (r) => {
        const d = await r.json().catch(() => null);
        if (!r.ok) setError(d?.error ?? "Could not join the proctoring room.");
        else setLk({ token: d.token, serverUrl: d.serverUrl });
      })
      .catch(() => setError("Could not reach the video service."));
  }, [examId]);

  if (error) return <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>;
  if (!lk) return <p className="text-ink-soft">Connecting to the proctoring room (you join as a silent observer — your camera stays off)…</p>;

  return (
    <LiveKitRoom token={lk.token} serverUrl={lk.serverUrl} connect video={false} audio={false} data-lk-theme="default">
      <Grid candidates={candidates} examId={examId} />
    </LiveKitRoom>
  );
}
