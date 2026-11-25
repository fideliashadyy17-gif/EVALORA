"use client";

import { Badge, Button, Card } from "@/components/ui";
import { useState } from "react";

interface CheckRow {
  ok: boolean;
  detail: string;
  httpStatus?: number;
  activeRooms?: number;
}

interface VerifyResponse {
  ok: boolean;
  checkedAt: string;
  latencyMs: number;
  env: {
    configured: boolean;
    present: Record<string, boolean>;
    missing: string[];
    urlValid: boolean;
    host: string | null;
  };
  checks: {
    env: CheckRow;
    tokenSigning: CheckRow;
    cloudApiAuth: CheckRow;
    candidateSignal: CheckRow;
    supervisorSignal: CheckRow;
    roomLifecycle?: CheckRow;
  };
}

export function LiveKitVerifyCard({
  initialConfigured,
  initialHost,
  initialPresent,
  initialMissing,
}: {
  initialConfigured: boolean;
  initialHost: string | null;
  initialPresent: Record<string, boolean>;
  initialMissing: string[];
}) {
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<VerifyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runVerification() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/livekit/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = (await res.json().catch(() => null)) as VerifyResponse | null;
      if (!data || typeof data.ok !== "boolean") {
        throw new Error(`Unexpected response (HTTP ${res.status})`);
      }
      setReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification request failed.");
    } finally {
      setBusy(false);
    }
  }

  const envVars = [
    "LIVEKIT_API_KEY",
    "LIVEKIT_API_SECRET",
    "NEXT_PUBLIC_LIVEKIT_URL",
  ] as const;
  const presentMap = report?.env.present ?? initialPresent;
  const host = report?.env.host ?? initialHost;
  const configured = report?.env.configured ?? initialConfigured;
  const missing = report?.env.missing ?? initialMissing;

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">
            LiveKit Cloud End-to-End Verification
          </p>
          <h3 className="mt-1 font-display text-base font-semibold text-evergreen-950">
            Video &amp; Screen-Sharing Proctoring Connectivity
          </h3>
          <p className="mt-1 text-xs text-ink-soft">
            Verifies server runtime env vars (without exposing secrets), candidate &amp; supervisor JWT
            signing, LiveKit Cloud API authentication, ephemeral room creation/cleanup, and browser
            signaling validation. Supabase incident logging, review workflows, retention policies and
            the evidence ledger remain operational independently of LiveKit.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={report ? (report.ok ? "green" : "red") : configured ? "green" : "amber"}>
            {report
              ? report.ok
                ? `Verified (${report.latencyMs}ms)`
                : "Attention needed"
              : configured
                ? "Env configured"
                : "Missing env var"}
          </Badge>
          <Button type="button" variant="outline" disabled={busy} onClick={runVerification}>
            {busy ? "Testing LiveKit Cloud…" : "Run live room & token test"}
          </Button>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {envVars.map((name) => {
          const ok = Boolean(presentMap[name]);
          return (
            <div
              key={name}
              className="flex items-center justify-between rounded-lg border border-evergreen-900/10 bg-cream/60 px-3 py-2 text-xs"
            >
              <code className="font-mono font-semibold text-evergreen-950">{name}</code>
              <Badge tone={ok ? "green" : "red"}>{ok ? "Present" : "Missing"}</Badge>
            </div>
          );
        })}
      </div>

      <p className="mt-2 text-xs text-ink-soft">
        Target host: <code className="rounded bg-cream px-1.5 py-0.5">{host ?? "Not configured"}</code>
        {missing.length > 0 && (
          <span className="ml-2 font-semibold text-red-700">
            Missing: {missing.join(", ")}
          </span>
        )}
      </p>

      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">
          {error}
        </p>
      )}

      {report && (
        <div className="mt-4 space-y-2 border-t border-evergreen-900/10 pt-3">
          {(
            [
              ["Runtime environment", report.checks.env],
              ["JWT signing & media grants", report.checks.tokenSigning],
              ["LiveKit Cloud RoomService auth", report.checks.cloudApiAuth],
              ["Candidate signaling (camera/mic/screen)", report.checks.candidateSignal],
              ["Supervisor signaling (subscribe-only)", report.checks.supervisorSignal],
              ...(report.checks.roomLifecycle
                ? ([["Ephemeral room create / list / delete", report.checks.roomLifecycle]] as const)
                : []),
            ] as const
          ).map(([label, item]) => (
            <div
              key={label}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
            >
              <div className="min-w-0 flex-1">
                <span className="font-semibold text-evergreen-950">{label}: </span>
                <span className="text-ink-soft">{item.detail}</span>
              </div>
              <Badge tone={item.ok ? "green" : "red"}>{item.ok ? "Pass" : "Fail"}</Badge>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
