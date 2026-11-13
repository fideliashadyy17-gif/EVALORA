/**
 * Live assessment feature controls.
 *
 * An organiser can switch individual answer tools off for the participants of
 * one live session. The switches are stored under
 * `quiz_sessions.settings.live_features` (and read from `exams.settings` for an
 * examination sitting).
 *
 * One rule, applied identically by the admin screen, the server routes and the
 * candidate's editor: **a tool is unavailable only when its flag is explicitly
 * `false`**. A session that was never configured — every session created before
 * these controls existed, and every new one — therefore keeps every tool, so
 * shipping the controls changes nothing for anyone until an organiser
 * deliberately restricts something. Unknown keys and malformed values are
 * ignored rather than trusted.
 */
export const LIVE_FEATURE_KEYS = [
  "standard_keyboard",
  "math_keyboard",
  "symbols",
  "scientific_keyboard",
  "equation_editor",
  "latex",
] as const;

export type LiveFeatureKey = (typeof LIVE_FEATURE_KEYS)[number];

/** Stored / transported shape: any flag may be absent. */
export type LiveFeatureControls = Partial<Record<LiveFeatureKey, boolean>>;

/** Resolved shape: every flag is decided. */
export type ResolvedLiveFeatures = Record<LiveFeatureKey, boolean>;

export const LIVE_FEATURE_LABELS: Record<LiveFeatureKey, string> = {
  standard_keyboard: "Standard Keyboard",
  math_keyboard: "Math Keyboard",
  symbols: "Symbols",
  scientific_keyboard: "Scientific Keyboard",
  equation_editor: "Equation Editor",
  latex: "LaTeX Support",
};

/** What each switch removes from the candidate's editor when it is off. */
export const LIVE_FEATURE_HINTS: Record<LiveFeatureKey, string> = {
  standard_keyboard: "Typing and pasting ordinary text in the written answer",
  math_keyboard: "The on-screen mathematics keyboard",
  symbols: "The MathLive symbols keyboard in Math mode",
  scientific_keyboard: "The scientific groups of the mathematics keyboard (trigonometry, functions, calculus, matrices, vectors, statistics, sequences, units)",
  equation_editor: "The visual equation editor (Math mode)",
  latex: "LaTeX mode and LaTeX source editing",
};

export function isLiveFeatureKey(value: unknown): value is LiveFeatureKey {
  return typeof value === "string" && (LIVE_FEATURE_KEYS as readonly string[]).includes(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** Every tool available — the state of any session nobody has restricted. */
export function allLiveFeaturesEnabled(): ResolvedLiveFeatures {
  return {
    standard_keyboard: true,
    math_keyboard: true,
    symbols: true,
    scientific_keyboard: true,
    equation_editor: true,
    latex: true,
  };
}

/** Resolve a stored `live_features` value. Only an explicit `false` disables a tool. */
export function resolveLiveFeatures(raw: unknown): ResolvedLiveFeatures {
  const source = asRecord(raw);
  const resolved = allLiveFeaturesEnabled();
  for (const key of LIVE_FEATURE_KEYS) {
    if (source[key] === false) resolved[key] = false;
  }
  return resolved;
}

/** Resolve the controls from a `settings` JSON column (session or examination). */
export function liveFeaturesFromSettings(settings: unknown): ResolvedLiveFeatures {
  return resolveLiveFeatures(asRecord(settings).live_features);
}

/** True when two control sets resolve to the same tools. */
export function sameLiveFeatures(a: unknown, b: unknown): boolean {
  const left = resolveLiveFeatures(a);
  const right = resolveLiveFeatures(b);
  return LIVE_FEATURE_KEYS.every((key) => left[key] === right[key]);
}

/** `settings` with one switch changed; every other setting is preserved untouched. */
export function withLiveFeature(settings: unknown, key: LiveFeatureKey, enabled: boolean): Record<string, unknown> {
  const current = asRecord(settings);
  return { ...current, live_features: { ...resolveLiveFeatures(current.live_features), [key]: enabled } };
}
