import {
  escalationLevel,
  isEventEnabled,
  isRecordable,
  warningFor,
  type IntegrityEvent,
  type IntegrityPolicy,
  type IntegrityWarning,
} from "./integrity";
import { attachAssessmentLockdown, isApplePlatform } from "./assessmentLockdown";

/**
 * Browser-side observer for one assessment attempt.
 *
 * It is transport-agnostic on purpose: `report` is supplied by the surface
 * (examination attempt token, or any future assessment credential), so quizzes,
 * examinations and summative assessments can share exactly this monitor while
 * each keeps its own server-side authorisation. The DOM is injectable as well,
 * which is what makes the debouncing and the policy gates testable off-browser.
 *
 * The monitor never decides guilt. It detects, it reports, and it shows the
 * candidate what was recorded.
 */
type TargetLike = {
  addEventListener: (type: string, handler: (event: unknown) => void, options?: boolean | AddEventListenerOptions) => void;
  removeEventListener: (type: string, handler: (event: unknown) => void, options?: boolean | EventListenerOptions) => void;
};

export interface MonitorEnvironment {
  document: TargetLike & { visibilityState?: string };
  window: TargetLike;
  now: () => number;
  /** Override the platform check (Cmd vs Ctrl shortcuts). Defaults to the browser's platform. */
  isApple?: boolean;
}

export type IntegrityReport = (
  event: IntegrityEvent,
  detail: Record<string, unknown>,
) => Promise<{ count?: number } | null | void>;

export class IntegrityMonitor {
  private started = false;
  private violations = 0;
  private lastSentAt = new Map<IntegrityEvent, number>();
  private lastTabHiddenAt = Number.NEGATIVE_INFINITY;
  private bound: { target: TargetLike; type: string; handler: (event: unknown) => void }[] = [];
  private detachLockdown: (() => void) | null = null;

  constructor(
    private readonly env: MonitorEnvironment,
    private readonly policy: IntegrityPolicy,
    private readonly report: IntegrityReport,
    private readonly onWarning: (warning: IntegrityWarning) => void = () => {},
  ) {}

  /** Violations recorded so far in this attempt (server-confirmed when available). */
  get count(): number {
    return this.violations;
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    // Blocking follows the clipboard switch alone: it still applies when the
    // integrity recording is off, because copying is never allowed in an
    // assessment unless the assessment explicitly turns the switch off. Nothing
    // is recorded in that case (emit() checks the policy for every event).
    if (this.policy.clipboard) {
      this.detachLockdown = attachAssessmentLockdown(this.env.window, {
        isApple: this.env.isApple ?? isApplePlatform(typeof navigator === "undefined" ? undefined : navigator),
        onAction: (action) => void this.emit(action, {}),
      });
    }
    if (!this.policy.enabled) return;
    const { document, window } = this.env;

    this.on(document, "visibilitychange", () => {
      const hidden = document.visibilityState === "hidden";
      if (hidden) this.lastTabHiddenAt = this.env.now();
      void this.emit(hidden ? "tab_hidden" : "tab_visible", { visibility: document.visibilityState ?? null });
    });

    // Browsers fire blur just after the tab is hidden; collapsing the pair
    // avoids double-counting one gesture as two incidents.
    this.on(window, "blur", () => {
      if (this.env.now() - this.lastTabHiddenAt < 1000) return;
      void this.emit("focus_lost", {});
    });
    this.on(window, "focus", () => {
      void this.emit("focus_back", {});
    });

    this.on(document, "fullscreenchange", () => {
      const active = Boolean((document as { fullscreenElement?: unknown }).fullscreenElement);
      if (!active) void this.emit("fullscreen_exit", {});
    });

    this.on(window, "beforeunload", () => void this.emit("page_leave", {}));
    this.on(window, "offline", () => void this.emit("offline", {}));
    this.on(window, "online", () => void this.emit("online", {}));
  }

  stop(): void {
    for (const { target, type, handler } of this.bound) target.removeEventListener(type, handler);
    this.bound = [];
    this.detachLockdown?.();
    this.detachLockdown = null;
    this.started = false;
  }

  private on(target: TargetLike, type: string, handler: (event: unknown) => void): void {
    target.addEventListener(type, handler);
    this.bound.push({ target, type, handler });
  }

  private async emit(event: IntegrityEvent, detail: Record<string, unknown>): Promise<void> {
    if (!isEventEnabled(event, this.policy)) return;

    const now = this.env.now();
    // Same signal twice in a burst is one incident, not a flood of rows.
    const previous = this.lastSentAt.get(event) ?? Number.NEGATIVE_INFINITY;
    if (now - previous < 2500) return;
    this.lastSentAt.set(event, now);

    if (isRecordable(event)) this.violations += 1;
    const optimistic = this.violations;
    if (isRecordable(event) && escalationLevel(optimistic, this.policy) !== "none")
      this.onWarning(warningFor(event, optimistic, this.policy));

    try {
      const result = await this.report(event, detail);
      if (result && typeof result.count === "number") {
        // The server owns the count: it also sees events from a previous tab.
        this.violations = result.count;
        if (isRecordable(event)) this.onWarning(warningFor(event, result.count, this.policy));
      }
    } catch {
      // An unreachable server must never interrupt the paper; the next event
      // retries the same channel and the answer queue is unaffected.
    }
  }
}
