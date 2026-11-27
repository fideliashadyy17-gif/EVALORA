"use client";

/**
 * Pre-examination device check panel (candidate-facing).
 *
 * Rendered on the admission screens — `/exam/join/[token]` and `/exam-access` —
 * when the organization's `proctoring.require_camera_check`,
 * `require_microphone_check` or `require_browser_check` configuration asks for
 * it. When none of the three is switched on this component renders nothing at
 * all, so switching a setting off really does remove the check.
 *
 * HONESTY RULES THIS UI FOLLOWS
 * -----------------------------
 *   • It never claims to record anything. The camera and microphone are opened
 *     only to learn whether they work and are closed immediately; the panel says
 *     so in words, because a candidate who believes they are being filmed has
 *     been misled.
 *   • A failed check does not pretend to be a pass, and does not silently block
 *     the candidate either: it explains what could not be verified and asks the
 *     candidate to acknowledge it before starting, so the decision is theirs and
 *     the invigilator still receives the incident.
 *   • Every row reports the real probe outcome, including "could not be
 *     checked", rather than a generic green tick.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  deviceCheckSentence,
  deviceChecksRequired,
  failedDeviceChecks,
  runDeviceChecks,
  type DeviceCheckRequirements,
  type DeviceCheckResult,
} from "@/lib/deviceCheck";
import { cn } from "@/lib/utils";
import { AlertTriangle, Camera, CheckCircle2, Loader2, Mic, Monitor, RefreshCw } from "lucide-react";

export interface DeviceCheckReport {
  result: DeviceCheckResult | null;
  failures: string[];
  /** True while the candidate still has to acknowledge a failed check. */
  awaitingAcknowledgement: boolean;
  running: boolean;
}

export function DeviceCheckPanel({
  requirements,
  onReport,
  className,
}: {
  requirements: DeviceCheckRequirements | null | undefined;
  /** Called after every run so the admission form can gate its start button. */
  onReport?: (report: DeviceCheckReport) => void;
  className?: string;
}) {
  const needs = requirements ?? { camera: false, microphone: false, browser: false };
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<DeviceCheckResult | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const startedRef = useRef(false);

  const failures = result ? failedDeviceChecks(result, needs) : [];

  const report = useCallback(
    (next: DeviceCheckResult | null, isRunning: boolean, ack: boolean) => {
      onReport?.({
        result: next,
        failures: next ? failedDeviceChecks(next, needs) : [],
        awaitingAcknowledgement: Boolean(next && failedDeviceChecks(next, needs).length > 0 && !ack),
        running: isRunning,
      });
    },
    // `needs` is rebuilt each render from a prop object; depend on its parts so
    // the callback stays stable for an unchanged configuration.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onReport, needs.camera, needs.microphone, needs.browser],
  );

  const run = useCallback(async () => {
    setRunning(true);
    setAcknowledged(false);
    report(null, true, false);
    const next = await runDeviceChecks(needs);
    setResult(next);
    setRunning(false);
    report(next, false, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needs.camera, needs.microphone, needs.browser, report]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void run();
  }, [run]);

  // Keep the parent informed when the candidate ticks the acknowledgement box.
  useEffect(() => {
    if (result) report(result, running, acknowledged);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acknowledged]);

  if (!deviceChecksRequired(needs)) return null;

  const rows: Array<{
    key: string;
    label: string;
    icon: typeof Camera;
    wanted: boolean;
    ok: boolean;
    pending: boolean;
    text: string;
  }> = [];

  if (needs.camera) {
    const status = result?.camera ?? "error";
    rows.push({
      key: "camera",
      label: "Camera",
      icon: Camera,
      wanted: true,
      ok: status === "granted",
      pending: !result,
      text: deviceCheckSentence("camera", status),
    });
  }
  if (needs.microphone) {
    const status = result?.microphone ?? "error";
    rows.push({
      key: "microphone",
      label: "Microphone",
      icon: Mic,
      wanted: true,
      ok: status === "granted",
      pending: !result,
      text: deviceCheckSentence("microphone", status),
    });
  }
  if (needs.browser) {
    const browser = result?.browser ?? null;
    rows.push({
      key: "browser",
      label: "Browser and screen",
      icon: Monitor,
      wanted: true,
      ok: Boolean(browser?.supported),
      pending: !result,
      text: !browser
        ? "Checking your browser and screen…"
        : browser.supported
          ? `${browser.name}${browser.version ? ` ${browser.version}` : ""} on ${browser.platform || "this device"}, screen ${browser.screenWidth}×${browser.screenHeight}.`
          : `${browser.name}${browser.version ? ` ${browser.version}` : ""}: ${browser.reason ?? "this environment may not display the examination reliably."}`,
    });
  }

  return (
    <section
      aria-label="Device check"
      className={cn("rounded-2xl border border-evergreen-900/15 bg-white p-5 shadow-sm", className)}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-semibold text-evergreen-950">Device check</h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-ink-soft">
            Your institution asked us to confirm your device before you start. We do not record video or
            audio: the camera and microphone are opened only to check that they work, then closed
            immediately.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void run()}
          disabled={running}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-evergreen-900/20 px-3 py-1.5 text-xs font-semibold text-evergreen-900 transition hover:bg-evergreen-50 disabled:opacity-60"
        >
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Run checks again
        </button>
      </div>

      <ul className="mt-4 space-y-2">
        {rows.map((row) => {
          const Icon = row.icon;
          return (
            <li
              key={row.key}
              className={cn(
                "flex items-start gap-3 rounded-xl border px-3.5 py-3 text-sm",
                row.pending
                  ? "border-evergreen-900/12 bg-evergreen-50/50 text-evergreen-900"
                  : row.ok
                    ? "border-evergreen-700/25 bg-evergreen-50 text-evergreen-900"
                    : "border-amber-600/30 bg-amber-50 text-amber-900",
              )}
            >
              <span className="mt-0.5 shrink-0">
                {row.pending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : row.ok ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <AlertTriangle className="h-4 w-4" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 font-semibold">
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  {row.label}
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed">{row.text}</span>
              </span>
            </li>
          );
        })}
      </ul>

      {failures.length > 0 && !running && (
        <div className="mt-4 rounded-xl border border-amber-600/30 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900">
          <p className="font-semibold">
            {failures.length === 1
              ? `One check could not be completed: ${failures[0]}.`
              : `${failures.length} checks could not be completed: ${failures.join(", ")}.`}
          </p>
          <p className="mt-1">
            You can still sit this examination. Your invigilator will see that {failures.join(" and ")}{" "}
            could not be verified, and may ask you about it.
          </p>
          <label className="mt-3 flex cursor-pointer items-start gap-2.5 text-xs font-medium">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-amber-700/40 text-evergreen-800 focus:ring-evergreen-700"
            />
            <span>I understand these checks could not be completed, and I want to continue.</span>
          </label>
        </div>
      )}
    </section>
  );
}
