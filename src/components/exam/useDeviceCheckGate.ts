"use client";

/**
 * Shared client-side gate for the pre-examination device checks.
 *
 * Both admission screens — `/exam/join/[token]` and `/exam-access` — use this so
 * that the proctoring configuration resolved on the server produces identical
 * behaviour in either flow: run the checks the platform asked for, show the
 * candidate what happened, hold the start button until any failure has been
 * acknowledged, and report the outcome to `/api/exam/device-check` once an
 * attempt exists.
 *
 * The gate never blocks admission on its own. A candidate whose camera could
 * not be verified still sits the examination; the incident is what an
 * invigilator reviews afterwards.
 */
import { useCallback, useMemo, useState } from "react";
import {
  deviceChecksRequired,
  deviceCheckWirePayload,
  type DeviceCheckRequirements,
} from "@/lib/deviceCheck";
import type { DeviceCheckReport } from "./DeviceCheckPanel";

/**
 * Coerce an untrusted payload (an API response, a server prop) into
 * requirements. Anything that is not explicitly `true` stays off, so a malformed
 * response can never switch a check on and prompt a candidate for their camera.
 */
export function normalizeDeviceCheckRequirements(value: unknown): DeviceCheckRequirements | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const requirements: DeviceCheckRequirements = {
    camera: raw.camera === true,
    microphone: raw.microphone === true,
    browser: raw.browser === true,
  };
  return deviceChecksRequired(requirements) ? requirements : null;
}

export function useDeviceCheckGate(initial?: DeviceCheckRequirements | null) {
  const [requirements, setRequirementsState] = useState<DeviceCheckRequirements | null>(
    () => normalizeDeviceCheckRequirements(initial),
  );
  const [report, setReport] = useState<DeviceCheckReport | null>(null);

  /** Learn the requirements later, e.g. from the admission response. */
  const setRequirements = useCallback((value: unknown) => {
    const next = normalizeDeviceCheckRequirements(value);
    if (next) setRequirementsState(next);
  }, []);

  const panelProps = useMemo(
    () => ({ requirements, onReport: setReport }),
    [requirements],
  );

  const required = Boolean(requirements && deviceChecksRequired(requirements));
  /** True while a required check has not reported yet, or is still running. */
  const running = required && (!report || report.running);
  /** True when the checks finished and a failure is waiting for the candidate. */
  const awaitingAcknowledgement = Boolean(report?.awaitingAcknowledgement);

  /**
   * True while a required check has not finished, or while the candidate has not
   * yet acknowledged a failure. False whenever the platform asked for nothing,
   * so organizations that switch the checks off are never delayed.
   */
  const blocking = running || awaitingAcknowledgement;

  /**
   * Which of the two the blocking is, because they read completely differently
   * to a candidate. `running` is the platform working; `acknowledge` needs the
   * candidate to tick a box, and a button that claims the check is still
   * completing while nothing runs looks like a hang — which is exactly how a
   * desktop with no camera used to present itself at admission.
   */
  const state: DeviceCheckGateState = !required
    ? "none"
    : running
      ? "running"
      : awaitingAcknowledgement
        ? "acknowledge"
        : "clear";

  /**
   * Ask the server which checks this attempt's organization requires. Used by
   * the code-entry screen, where the organization is unknown until an access
   * code has been verified. Returns true when at least one check is required.
   * A failed lookup yields false, so a candidate is never prompted for a device
   * the platform did not ask for and is never blocked by telemetry.
   */
  const loadRequirementsForAttempt = useCallback(async (attemptId: unknown, token: unknown) => {
    if (typeof attemptId !== "string" || typeof token !== "string") return false;
    try {
      const params = new URLSearchParams({ attempt_id: attemptId, token });
      const res = await fetch(`/api/exam/device-check?${params.toString()}`, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (!res.ok) return false;
      const data = (await res.json().catch(() => null)) as { required?: unknown } | null;
      const next = normalizeDeviceCheckRequirements(data?.required);
      if (!next) return false;
      setRequirementsState(next);
      return true;
    } catch {
      return false;
    }
  }, []);

  /**
   * Report the outcome against the freshly admitted attempt. Fire-and-forget by
   * design: telemetry must never stop a candidate from reaching their paper.
   */
  const submit = useCallback(
    async (attemptId: unknown, token: unknown) => {
      if (typeof attemptId !== "string" || typeof token !== "string") return;
      const payload = deviceCheckWirePayload(report?.result ?? null, requirements);
      if (!payload) return;
      try {
        await fetch("/api/exam/device-check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ attempt_id: attemptId, token, ...payload }),
        });
      } catch {
        /* the examination proceeds regardless */
      }
    },
    [report, requirements],
  );

  return {
    requirements,
    report,
    running,
    awaitingAcknowledgement,
    blocking,
    state,
    panelProps,
    setRequirements,
    loadRequirementsForAttempt,
    submit,
  };
}

export type DeviceCheckGate = ReturnType<typeof useDeviceCheckGate>;
/** `none` = the platform asked for no check; `clear` = every required check passed. */
export type DeviceCheckGateState = "none" | "running" | "acknowledge" | "clear";
