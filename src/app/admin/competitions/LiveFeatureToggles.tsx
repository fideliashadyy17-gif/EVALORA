"use client";

import { Button } from "@/components/ui";
import {
  LIVE_FEATURE_HINTS,
  LIVE_FEATURE_KEYS,
  LIVE_FEATURE_LABELS,
  resolveLiveFeatures,
  type LiveFeatureControls,
} from "@/lib/liveFeatures";
import { useFormStatus } from "react-dom";
import { setLiveFeature } from "../actions/competitions";

/**
 * Live assessment feature controls for one live session.
 *
 * Each switch is its own small form posting to the `setLiveFeature` server
 * action. The action re-checks the super-admin session, writes that single
 * flag and revalidates the page, so the state shown here is always the state
 * that is stored — and the state participants receive on their next poll.
 *
 * `features` is the raw `settings.live_features` value of the session; it is
 * resolved with the same rule the participant's editor uses (a tool is off only
 * when explicitly switched off), so the two can never disagree.
 */
export function LiveFeatureToggles({
  sessionId,
  competitionId,
  features,
  compact = false,
}: {
  sessionId: string;
  competitionId?: string;
  features: LiveFeatureControls | null | undefined;
  /** Dense layout for table cells. */
  compact?: boolean;
}) {
  const resolved = resolveLiveFeatures(features);
  return (
    <div className={compact ? "flex flex-wrap gap-1" : "grid grid-cols-2 gap-3 md:grid-cols-3"}>
      {LIVE_FEATURE_KEYS.map((key) => (
        <form
          key={key}
          action={setLiveFeature}
          className={
            compact
              ? "flex items-center justify-between gap-1.5 rounded-lg border border-evergreen-900/10 bg-white p-1 text-[10px]"
              : "flex items-center justify-between gap-2 rounded-lg border border-evergreen-900/10 bg-white p-2"
          }
        >
          <input type="hidden" name="session_id" value={sessionId} />
          {competitionId && <input type="hidden" name="competition_id" value={competitionId} />}
          <input type="hidden" name="feature" value={key} />
          {/* The value to store: the opposite of what is stored now. */}
          <input type="hidden" name="enabled" value={resolved[key] ? "0" : "1"} />
          <span className={compact ? "font-medium text-evergreen-950" : "text-sm font-medium text-evergreen-950"}>
            {LIVE_FEATURE_LABELS[key]}
          </span>
          <ToggleSubmit label={LIVE_FEATURE_LABELS[key]} hint={LIVE_FEATURE_HINTS[key]} enabled={resolved[key]} compact={compact} />
        </form>
      ))}
    </div>
  );
}

/** Submit button of one switch; disabled while its own form is being saved. */
function ToggleSubmit({ label, hint, enabled, compact }: { label: string; hint: string; enabled: boolean; compact: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant={enabled ? "gold" : "outline"}
      disabled={pending}
      aria-pressed={enabled}
      aria-label={`${label}: ${enabled ? "enabled" : "disabled"}. Press to ${enabled ? "disable" : "enable"}.`}
      title={`${hint}. Currently ${enabled ? "enabled" : "disabled"} — press to ${enabled ? "disable" : "enable"}.`}
      className={compact ? "px-2 py-1 text-[10px]" : "px-3 py-1.5 text-xs"}
    >
      {pending ? "Saving…" : enabled ? "Enabled" : "Disabled"}
    </Button>
  );
}
