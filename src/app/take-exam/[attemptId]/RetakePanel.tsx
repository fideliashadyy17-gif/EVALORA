"use client";

import { RetakeDecisionWatcher } from "@/components/RetakeDecisionWatcher";
import { Badge, Button, Card, Textarea } from "@/components/ui";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

interface RetakeView {
  attempt_number: number;
  attempt_label: string;
  submitted: boolean;
  can_request: boolean;
  can_start: boolean;
  message: string;
  pending: { id: string; created_at: string; reason: string | null } | null;
  decision: {
    id: string;
    status: "pending" | "approved" | "rejected" | "cancelled";
    decided_at: string | null;
    decision_note: string | null;
    access_expires_at: string | null;
    message: string;
  } | null;
  grant: {
    request_id: string;
    attempts_granted: number;
    attempts_used: number;
    remaining: number;
    window_open: boolean;
    access_expires_at: string | null;
  } | null;
  history: {
    id: string;
    status: string;
    created_at: string;
    decided_at: string | null;
    reason: string | null;
    decision_note: string | null;
    access_expires_at: string | null;
  }[];
}

function when(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "—";
  // Rendered in the student's own timezone; the server always decides validity.
  return new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/**
 * The student's post-submission retake controls.
 *
 * The UI only ever *offers* what the backend already allows: every button maps
 * to an authenticated API call that re-checks the attempt's status, the pending
 * request, and the Super Admin's decision. Hiding a button is never the control.
 */
export function RetakePanel({
  attemptId,
  token,
  submitted,
}: {
  attemptId: string;
  token: string | null;
  submitted: boolean;
}) {
  const router = useRouter();
  const [view, setView] = useState<RetakeView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  const load = useCallback(async () => {
    if (!token || !submitted) return;
    try {
      const res = await fetch(`/api/exam/retake?attempt_id=${encodeURIComponent(attemptId)}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data) setView(data as RetakeView);
    } catch {
      // Retake state is supplementary: a network blip must never look like a
      // submission problem. The next render or reload retries.
    }
  }, [attemptId, token, submitted]);

  useEffect(() => { void load(); }, [load]);

  async function call(action: "request" | "cancel" | "start") {
    if (!token) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/exam/retake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, attempt_id: attemptId, token, reason: action === "request" ? reason : undefined }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError((data as { error?: string } | null)?.error ?? "The request could not be completed.");
        return;
      }
      if (action === "start") {
        const started = data as { attempt_id: string; access_token: string; exam_id: string };
        try {
          localStorage.setItem(
            `evalora-attempt-${started.attempt_id}`,
            JSON.stringify({ token: started.access_token, exam_id: started.exam_id }),
          );
        } catch {
          setError("Your browser blocked session storage, so the authorized attempt cannot be opened here.");
          return;
        }
        router.push(`/take-exam/${started.attempt_id}`);
        return;
      }
      setAskOpen(false);
      setReason("");
      setConfirmed(false);
      if (action === "request") {
        setNotice(
          (data as { duplicate?: boolean } | null)?.duplicate
            ? "Your retake request is already awaiting approval."
            : "Your retake request has been sent and is awaiting Super Admin approval.",
        );
      }
      if (action === "cancel") setNotice("Your retake request was cancelled.");
      if (data && "attempt_number" in data) setView(data as RetakeView);
      else await load();
    } catch {
      setError("Connection problem. Your request was not confirmed — try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!token || !submitted) return null;

  const pending = view?.pending ?? null;
  const decision = view?.decision ?? null;
  const approvedAvailable = Boolean(view?.can_start && view?.grant?.window_open && (view.grant?.remaining ?? 0) > 0);
  const approvedWindowClosed = Boolean(view?.grant && !view.grant.window_open && (view.grant?.remaining ?? 0) > 0);

  return (
    <div className="mt-5 text-left">
      {/* The student may be sitting on this page while an administrator
          decides. Supabase Realtime (with a polling fallback) moves them to
          the decision page without a reload. */}
      {pending && <RetakeDecisionWatcher pendingIds={[pending.id]} />}
      <Card className="border border-evergreen-900/15 bg-cream/60 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Attempt record</p>
            <p className="mt-1 font-display text-lg font-semibold text-evergreen-950">
              {view?.attempt_label ?? (submitted ? "Submitted attempt" : "Attempt in progress")}
            </p>
          </div>
          <Badge tone={pending ? "amber" : approvedAvailable ? "green" : "gray"}>
            {pending ? "Retake pending" : approvedAvailable ? "Retake approved" : "Locked after submission"}
          </Badge>
        </div>

        <p className="mt-2 text-sm text-ink-soft">
          {view?.message ??
            "This attempt is submitted and permanently locked. Requesting a retake does not grant one: a Super Admin must approve it."}
        </p>

        {approvedAvailable && (
          <div className="mt-4 rounded-xl border border-evergreen-700/30 bg-evergreen-50 p-4">
            <p className="text-sm font-semibold text-evergreen-900">Retake approved — a separate new attempt is authorized.</p>
            <p className="mt-1 text-sm text-evergreen-900">
              Start it before <strong>{when(view?.grant?.access_expires_at ?? null)}</strong>. Your original answers, score and
              submission stay unchanged.
            </p>
            <Button variant="gold" className="mt-3" disabled={busy} onClick={() => void call("start")}>
              {busy ? "Opening…" : "Start authorized attempt"}
            </Button>
          </div>
        )}

        {approvedWindowClosed && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            The access window for your approved retake has closed ({when(view?.grant?.access_expires_at ?? null)}). You may request a new retake.
          </p>
        )}

        {pending && (
          <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-amber-950">Retake request awaiting approval</p>
            <p className="mt-1 text-sm text-amber-900">Sent {when(pending.created_at)}. You will see the decision here.</p>
            {pending.reason && <p className="mt-1 text-xs text-amber-900">Your reason: {pending.reason}</p>}
            <Button variant="outline" className="mt-3 px-3 py-2 text-xs" disabled={busy} onClick={() => void call("cancel")}>
              Cancel request
            </Button>
          </div>
        )}

        {decision && decision.status === "rejected" && !pending && (
          <div className="mt-4 rounded-xl border border-red-300/60 bg-red-50 p-4">
            <p className="text-sm font-semibold text-red-900">Retake request rejected</p>
            <p className="mt-1 text-sm text-red-900">{decision.message}</p>
          </div>
        )}

        {notice && <p className="mt-3 rounded-lg bg-evergreen-50 px-3 py-2 text-sm text-evergreen-900">{notice}</p>}
        {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

        {view?.can_request && !askOpen && !pending && (
          <Button className="mt-4" variant="outline" onClick={() => setAskOpen(true)}>
            Request a retake
          </Button>
        )}

        {askOpen && !pending && (
          <div className="mt-4 rounded-xl border border-evergreen-900/20 bg-white p-4">
            <h3 className="font-display text-base font-semibold text-evergreen-950">Request a retake</h3>
            <p className="mt-1 text-sm text-ink-soft">
              This sends a request to the EVALORA Super Admin. It does <strong>not</strong> start a new attempt and does not
              change your submitted paper. Only an approval authorizes another attempt.
            </p>
            <label className="mt-3 block text-sm font-medium text-evergreen-950" htmlFor={`retake-reason-${attemptId}`}>
              Reason (optional)
            </label>
            <Textarea
              id={`retake-reason-${attemptId}`}
              rows={3}
              maxLength={2000}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="For example: I lost connection during the last ten minutes."
              className="mt-1"
            />
            <label className="mt-3 flex items-start gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
                className="mt-0.5 h-5 w-5 accent-evergreen-700"
              />
              <span>I confirm I want to send this retake request for approval. My submitted attempt stays unchanged.</span>
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="gold" disabled={busy || !confirmed} onClick={() => void call("request")}>
                {busy ? "Sending…" : "Send retake request"}
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => { setAskOpen(false); setConfirmed(false); }}
              >
                Keep my submission
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
