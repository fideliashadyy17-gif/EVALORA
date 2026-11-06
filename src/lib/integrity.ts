/**
 * Assessment-integrity rules shared by every assessment surface.
 *
 * One policy shape, one event catalogue and one escalation ladder — the exam
 * client, the recording API and the teacher console all read these rules, so a
 * quiz and a summative assessment can never drift into different behaviour.
 * Pure functions only: no DOM, no database, no React, so the thresholds can be
 * unit-tested without a browser.
 *
 * Honest scope: a web page can *observe* that the tab was hidden, the window
 * lost focus, full screen was left, or a copy was attempted. It cannot prevent
 * Alt+Tab, a second device, or OS-level shortcuts. Detection + warning +
 * human review is the guarantee; "lockdown" is not.
 */

/** Browser-reported events, as they travel over the wire. */
export const INTEGRITY_EVENTS = [
  "tab_hidden",
  "tab_visible",
  "focus_lost",
  "focus_back",
  "fullscreen_exit",
  "copy",
  "paste",
  "cut",
  "context_menu",
  "page_leave",
  "offline",
  "online",
] as const;

export type IntegrityEvent = (typeof INTEGRITY_EVENTS)[number];

export interface IntegrityPolicy {
  /** Master switch: when false nothing is recorded and no warning is shown. */
  enabled: boolean;
  tabSwitch: boolean;
  focusLoss: boolean;
  fullscreen: boolean;
  clipboard: boolean;
  /** Audible warning where the browser has allowed audio (after a gesture). */
  sound: boolean;
  /** Violations after which the warning becomes persistent and prominent. */
  warnAfter: number;
  /** Violations after which the incident is escalated for invigilator review. */
  reviewAfter: number;
}

/**
 * Defaults applied to every assessment that does not carry its own policy.
 * Detection and a first, gentle warning are on; escalation needs repetition and
 * nothing is ever auto-disqualified. An assessment that set `integrity` in its
 * settings keeps exactly what it set.
 */
export const DEFAULT_INTEGRITY_POLICY: IntegrityPolicy = {
  enabled: true,
  tabSwitch: true,
  focusLoss: true,
  fullscreen: true,
  clipboard: true,
  sound: true,
  warnAfter: 3,
  reviewAfter: 5,
};

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function threshold(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(50, Math.max(1, Math.floor(parsed)));
}

/** Tolerant reader for `exams.settings.integrity`; anything unreadable falls back to the default. */
export function parseIntegrityPolicy(raw: unknown): IntegrityPolicy {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const policy: IntegrityPolicy = {
    enabled: bool(source.enabled, DEFAULT_INTEGRITY_POLICY.enabled),
    tabSwitch: bool(source.tabSwitch, DEFAULT_INTEGRITY_POLICY.tabSwitch),
    focusLoss: bool(source.focusLoss, DEFAULT_INTEGRITY_POLICY.focusLoss),
    fullscreen: bool(source.fullscreen, DEFAULT_INTEGRITY_POLICY.fullscreen),
    clipboard: bool(source.clipboard, DEFAULT_INTEGRITY_POLICY.clipboard),
    sound: bool(source.sound, DEFAULT_INTEGRITY_POLICY.sound),
    warnAfter: threshold(source.warnAfter, DEFAULT_INTEGRITY_POLICY.warnAfter),
    reviewAfter: threshold(source.reviewAfter, DEFAULT_INTEGRITY_POLICY.reviewAfter),
  };
  // A review threshold below the warning threshold would escalate silently.
  if (policy.reviewAfter < policy.warnAfter) policy.reviewAfter = policy.warnAfter;
  return policy;
}

/** Events that the candidate is told about but that are not violations. */
export function isRecordable(event: IntegrityEvent): boolean {
  return event !== "tab_visible" && event !== "focus_back" && event !== "online";
}

/** Does this assessment want this event recorded at all? */
export function isEventEnabled(event: IntegrityEvent, policy: IntegrityPolicy): boolean {
  if (!policy.enabled) return false;
  switch (event) {
    case "tab_hidden":
      return policy.tabSwitch;
    case "focus_lost":
      return policy.focusLoss;
    case "fullscreen_exit":
      return policy.fullscreen;
    case "copy":
    case "paste":
    case "cut":
    case "context_menu":
      return policy.clipboard;
    case "page_leave":
    case "offline":
    case "tab_visible":
    case "focus_back":
    case "online":
      return true;
    default:
      return false;
  }
}

/** Stored as `proctoring_incidents.type`; readable in the existing review consoles. */
export function incidentTypeFor(event: IntegrityEvent): string {
  return `integrity_${event}`;
}

export function eventFromIncidentType(type: string): IntegrityEvent | null {
  const candidate = type.replace(/^integrity_/, "");
  return (INTEGRITY_EVENTS as readonly string[]).includes(candidate) ? (candidate as IntegrityEvent) : null;
}

const SEVERITY: Record<IntegrityEvent, "low" | "medium" | "high"> = {
  tab_hidden: "medium",
  tab_visible: "low",
  focus_lost: "low",
  focus_back: "low",
  fullscreen_exit: "high",
  copy: "high",
  paste: "high",
  cut: "high",
  context_menu: "low",
  page_leave: "high",
  offline: "low",
  online: "low",
};

export function severityForEvent(event: IntegrityEvent): "low" | "medium" | "high" {
  return SEVERITY[event] ?? "low";
}

export type EscalationLevel = "none" | "warn" | "strong" | "review";

/**
 * The ladder. One accident is a warning, never a sanction: the candidate must
 * reach `warnAfter` violations before the warning becomes persistent and
 * `reviewAfter` before an invigilator is asked to look at the record.
 */
export function escalationLevel(violations: number, policy: IntegrityPolicy): EscalationLevel {
  const count = Number.isFinite(violations) ? Math.max(0, Math.floor(violations)) : 0;
  if (count <= 0) return "none";
  if (count >= policy.reviewAfter) return "review";
  if (count >= policy.warnAfter) return "strong";
  return "warn";
}

const EVENT_TEXT: Record<IntegrityEvent, string> = {
  tab_hidden: "You left the assessment tab",
  tab_visible: "You returned to the assessment tab",
  focus_lost: "The assessment window lost focus",
  focus_back: "You returned to the assessment window",
  fullscreen_exit: "You left full-screen mode",
  copy: "A copy action was detected",
  paste: "A paste action was detected",
  cut: "A cut action was detected",
  context_menu: "The right-click menu was opened",
  page_leave: "You tried to leave the assessment page",
  offline: "Your connection dropped",
  online: "Your connection came back",
};

export function eventLabel(event: IntegrityEvent): string {
  return EVENT_TEXT[event] ?? "A suspicious action was detected";
}

export interface IntegrityWarning {
  level: EscalationLevel;
  event: IntegrityEvent;
  count: number;
  title: string;
  body: string;
}

/** Copy the candidate sees. Deliberately calm: a warning, not an accusation. */
export function warningFor(event: IntegrityEvent, count: number, policy: IntegrityPolicy): IntegrityWarning {
  const level = escalationLevel(count, policy);
  const what = eventLabel(event);
  if (level === "review") {
    return {
      level,
      event,
      count,
      title: "This has been flagged for your invigilator",
      body: `${what}. That is ${count} recorded incidents in this paper. Your answers are safe; an invigilator will review the events, and you may be asked about them. Keep the assessment window in front of you until you submit.`,
    };
  }
  if (level === "strong") {
    return {
      level,
      event,
      count,
      title: "Repeated activity recorded",
      body: `${what}. That is ${count} incidents in this paper. Stay on this tab, in this window, until you submit — further incidents are reported to your invigilator.`,
    };
  }
  return {
    level,
    event,
    count,
    title: "Stay on the assessment",
    body: `${what}. This event was recorded for your invigilator. One departure is not a sanction, but repeated events are reviewed. Return to the assessment window and continue.`,
  };
}

/** Human label for the teacher console, falling back to the raw stored type. */
export function describeIncidentType(type: string): string {
  const event = eventFromIncidentType(type);
  if (!event) return type.replace(/_/g, " ");
  return eventLabel(event).replace(/^You /, "Candidate ").replace(/^The assessment/, "Assessment");
}
