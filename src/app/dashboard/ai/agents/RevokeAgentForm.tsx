"use client";

import { useActionState, useState } from "react";
import { Button, Input } from "@/components/ui";
import {
  revokeAgentAction,
  rotateTokenAction,
  type AgentActionState,
} from "./actions";

/**
 * Revoking a credential.
 *
 * The previous version rendered a bare `<form action={revokeAgentAction}>` and
 * that was the whole feature. Two things were wrong with it, and the first one
 * made the second one invisible:
 *
 *   1. `revokeAgentAction` returned `void` and swallowed every exception, so a
 *      failure was indistinguishable from a success. The server-side cause is
 *      documented in `ai_revoke_agent`; the UI-side effect was a button that did
 *      nothing and said nothing.
 *   2. A revoke is destructive and irreversible, and it was a single click with
 *      no confirmation. An administrator could take a working integration offline
 *      by mis-clicking, with no way back except re-registering the agent.
 *
 * So this is deliberately a two-step control. The first click validates the
 * reason and opens a confirmation; the second performs the request. While the
 * request is in flight the button is disabled and says so, and when it finishes
 * the result is a sentence on the screen — success or failure, never silence.
 */
export function RevokeAgentForm({
  agentId,
  agentName,
}: {
  agentId: string;
  agentName: string;
}) {
  const [state, formAction, pending] = useActionState<AgentActionState | null, FormData>(
    revokeAgentAction,
    null,
  );
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [touched, setTouched] = useState(false);

  // An empty reason is refused here rather than at the database, because a
  // revocation without a stated cause is useless in an audit six months later.
  const reasonProblem = touched && !reason.trim() ? "Give a reason for the revocation." : null;
  const canAskToConfirm = reason.trim().length >= 4;

  if (state?.ok) {
    return (
      <p className="mt-2 rounded-lg border border-evergreen-600/40 bg-evergreen-50 px-3 py-2 text-xs text-evergreen-900" role="status">
        {state.message}
      </p>
    );
  }

  return (
    <div className="mt-2">
      {!confirming ? (
        <div className="flex flex-wrap items-start gap-2">
          <div className="w-full max-w-xs">
            <label htmlFor={`revoke-reason-${agentId}`} className="sr-only">
              Reason for revoking {agentName}
            </label>
            <Input
              id={`revoke-reason-${agentId}`}
              name="reason_display"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              onBlur={() => setTouched(true)}
              maxLength={500}
              placeholder="Reason for revocation"
              aria-invalid={Boolean(reasonProblem)}
              aria-describedby={reasonProblem ? `revoke-error-${agentId}` : undefined}
              disabled={pending}
            />
          </div>
          <Button
            type="button"
            variant="danger"
            disabled={pending}
            onClick={() => {
              setTouched(true);
              if (!canAskToConfirm) return;
              setConfirming(true);
            }}
          >
            Revoke immediately
          </Button>
        </div>
      ) : (
        <form
          action={formAction}
          className="rounded-lg border border-red-300 bg-red-50 p-3"
        >
          <input type="hidden" name="agent_id" value={agentId} />
          <input type="hidden" name="reason" value={reason.trim()} />
          <p className="text-xs text-red-900">
            Revoke the credential for <strong>{agentName}</strong>? Any client using
            it stops working immediately. The agent registration and its history are
            kept, and this cannot be undone.
          </p>
          <p className="mt-1 text-xs text-red-900/80">Reason: {reason.trim()}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button type="submit" variant="danger" disabled={pending}>
              {pending ? "Revoking…" : "Yes, revoke it"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setConfirming(false)}
            >
              Cancel
            </Button>
            {pending && (
              <span className="text-xs text-red-900/80" role="status">
                Revoking the credential…
              </span>
            )}
          </div>
        </form>
      )}

      {reasonProblem && (
        <p id={`revoke-error-${agentId}`} className="mt-1 text-xs text-red-700" role="alert">
          {reasonProblem}
        </p>
      )}
      {state && !state.ok && (
        <p className="mt-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800" role="alert">
          {state.message}
        </p>
      )}
    </div>
  );
}

/**
 * Rotating a credential.
 *
 * Shows the new token exactly once, from the action's return value — never from a
 * URL, never from a cookie-reading page pass. Rotation is not destructive (the old
 * token stops working, the agent keeps running), but it still asks for
 * confirmation because a client still holding the old token will break.
 */
export function RotateTokenForm({ agentId }: { agentId: string }) {
  const [state, formAction, pending] = useActionState<AgentActionState | null, FormData>(
    rotateTokenAction,
    null,
  );
  const [confirming, setConfirming] = useState(false);

  if (state?.ok && state.token) {
    return (
      <div className="mt-2 rounded-lg border border-amber-400 bg-amber-50 p-3">
        <p className="text-xs font-semibold text-amber-900">Copy this token now</p>
        <p className="mt-1 text-xs text-amber-900">
          It is shown once. Only a SHA-256 digest is stored, so it cannot be
          recovered — rotate again if it is lost.
        </p>
        <code className="mt-2 block break-all rounded bg-white px-2 py-1.5 font-mono text-xs text-evergreen-950">
          {state.token}
        </code>
        <p className="mt-2 text-xs text-amber-900">{state.message}</p>
      </div>
    );
  }

  if (!confirming) {
    return (
      <div className="mt-2">
        <Button type="button" variant="outline" disabled={pending} onClick={() => setConfirming(true)}>
          Rotate token
        </Button>
        {state && !state.ok && (
          <p className="mt-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800" role="alert">
            {state.message}
          </p>
        )}
      </div>
    );
  }

  return (
    <form action={formAction} className="mt-2 rounded-lg border border-evergreen-900/25 bg-cream p-3">
      <input type="hidden" name="agent_id" value={agentId} />
      <input type="hidden" name="client" value="custom" />
      <p className="text-xs text-evergreen-900">
        Replace the credential? The current token stops working as soon as the new
        one is stored.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Rotating…" : "Yes, rotate it"}
        </Button>
        <Button type="button" variant="outline" disabled={pending} onClick={() => setConfirming(false)}>
          Cancel
        </Button>
        {pending && (
          <span className="text-xs text-ink-soft" role="status">
            Rotating the credential…
          </span>
        )}
      </div>
    </form>
  );
}
