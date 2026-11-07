"use client";

import "@livekit/components-styles";
import { LiveKitRoom, VideoTrack, useConnectionState, useLocalParticipant, useTracks } from "@livekit/components-react";
import { Track } from "livekit-client";
import { useState } from "react";
import { Button } from "@/components/ui";

function LocalCamera() {
  const tracks = useTracks([Track.Source.Camera]);
  const local = tracks.find((track) => track.participant.isLocal);
  if (!local) return <div className="flex h-28 items-center justify-center rounded-xl bg-evergreen-950 text-xs text-white">Starting camera…</div>;
  return <div className="overflow-hidden rounded-xl border-2 border-gold-500"><VideoTrack trackRef={local} className="h-28 w-full object-cover" /></div>;
}

function ScreenShareButton() {
  const { localParticipant, isScreenShareEnabled } = useLocalParticipant();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function toggle() {
    setBusy(true);
    try {
      await localParticipant.setScreenShareEnabled(!isScreenShareEnabled);
      setError(null);
    } catch {
      setError("Screen sharing could not be changed. Contact your invigilator if it is required.");
    } finally { setBusy(false); }
  }
  return <div>
    <Button variant="outline" className="w-full text-xs" disabled={busy} onClick={toggle}>
      {isScreenShareEnabled ? "Stop sharing screen" : "Share my screen"}
    </Button>
    {error && <p role="alert" className="mt-1 text-xs text-red-700">{error}</p>}
  </div>;
}

function CandidateVideoStatus({ onRetry, mediaError }: { onRetry: () => void; mediaError: string | null }) {
  const connection = useConnectionState();
  const { isCameraEnabled, isMicrophoneEnabled } = useLocalParticipant();
  const connected = connection === "connected";
  const status = connected ? "Video room connected" : connection === "reconnecting" || connection === "signalReconnecting"
    ? "Video room reconnecting" : connection === "connecting" ? "Connecting to video room" : "Video room disconnected";
  return <div className="space-y-2" aria-live="polite">
    <p className="text-xs font-semibold text-evergreen-900">{status}</p>
    {connected && <p className="text-xs text-ink-soft">Camera {isCameraEnabled ? "enabled" : "not enabled"} · Microphone {isMicrophoneEnabled ? "enabled" : "not enabled"} on this device.</p>}
    {mediaError && <p role="alert" className="text-xs text-red-700">{mediaError}</p>}
    {(connection === "disconnected" || mediaError) && <Button variant="outline" className="w-full text-xs" onClick={onRetry}>Retry video connection</Button>}
    <LocalCamera />
  </div>;
}

/** Isolate the large LiveKit SDK and styles from non-proctored exam sessions. */
export function ProctoredExamRoom({ token, serverUrl, requireScreenShare, onRetry }: {
  token: string;
  serverUrl: string;
  requireScreenShare: boolean;
  onRetry: () => void;
}) {
  const [mediaError, setMediaError] = useState<string | null>(null);
  return <LiveKitRoom token={token} serverUrl={serverUrl} connect video audio data-lk-theme="default"
    onError={() => setMediaError("Video connection failed. Retry or contact your invigilator.")}
    onMediaDeviceFailure={() => setMediaError("Camera or microphone could not be enabled. Check permissions and contact your invigilator.")}>
    <CandidateVideoStatus onRetry={onRetry} mediaError={mediaError} />
    {requireScreenShare && <ScreenShareButton />}
  </LiveKitRoom>;
}
