import { Badge, Button, Card, Field, Input, Select } from "@/components/ui";
import {
  NotificationTemplateEditor,
  type NotificationTemplateResult,
} from "@/components/notifications/NotificationTemplateEditor";
import type { NotificationEventState } from "@/lib/notificationDelivery";
import type { NotificationChannelCapability } from "@/lib/notificationService";
import type { TemplateProvenance } from "@/lib/notificationTemplates";

/**
 * The notification template console, shared by the platform console and the
 * organization console.
 *
 * Both surfaces render the same truth: every notification EVALORA generates,
 * the copy in force for this scope, where that copy came from, and — when the
 * viewer is allowed to change it — an editor that saves to
 * `notification_templates` and a test that delivers a real notification to the
 * editor's own bell.
 *
 * This half is a server component: the "what a recipient reads now" panel is the
 * server's own resolution (organization template → EVALORA default → the copy
 * shipped in code), read from the database in the same request that renders it.
 * The editor below it is the client half, and it previews with the same pure
 * functions rather than with its own idea of what they do.
 */

type Action = (formData: FormData) => Promise<NotificationTemplateResult>;

const PROVENANCE_BADGE: Record<TemplateProvenance, { tone: "green" | "gold" | "gray"; label: string }> = {
  organization: { tone: "green", label: "This organization's wording" },
  platform: { tone: "gold", label: "EVALORA default wording" },
  built_in: { tone: "gray", label: "Shipped copy" },
};

export interface NotificationTemplateStudioProps {
  /** Named scope the editor writes to, e.g. "Platform default" or the organization. */
  scopeLabel: string;
  scopeHint: string;
  /** `null` writes platform defaults; an id writes that organization's own. */
  organizationId: string | null;
  locale: string;
  locales: readonly { value: string; label: string }[];
  states: NotificationEventState[];
  canEdit: boolean;
  /** Shown instead of the editors when the viewer may read but not change. */
  readOnlyNote?: string;
  saveAction: Action;
  testAction: Action;
  resetAction?: Action;
  /** Which channels actually deliver, reported rather than offered as switches. */
  capability: NotificationChannelCapability[];
  /** Event key to open, from `?edit=`. */
  editing?: string | null;
  /** Filter, from `?q=`. */
  query?: string;
  /** Platform console only: choose which organization's wording you are editing. */
  scopeOptions?: { id: string; name: string }[];
}

export function NotificationTemplateStudio({
  scopeLabel,
  scopeHint,
  organizationId,
  locale,
  locales,
  states,
  canEdit,
  readOnlyNote,
  saveAction,
  testAction,
  resetAction,
  capability,
  editing = null,
  query = "",
  scopeOptions,
}: NotificationTemplateStudioProps) {
  const needle = query.trim().toLowerCase();
  const visible = needle
    ? states.filter((state) =>
        [state.event.key, state.event.label, state.event.description, state.resolved.title, state.resolved.body]
          .join(" ")
          .toLowerCase()
          .includes(needle),
      )
    : states;

  const groups = [...new Set(visible.map((state) => state.event.group))];
  const emailReport = capability.find((entry) => entry.key === "email" && !entry.operational);
  const customized = states.filter((state) => state.resolved.isCustomized).length;
  const paused = states.filter((state) => state.saved && state.saved.is_active === false).length;

  return (
    <>
      <Card className="mb-6 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-evergreen-700">{scopeLabel}</p>
            <p className="mt-1 max-w-3xl text-sm text-ink-soft">{scopeHint}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="font-display text-2xl font-semibold text-evergreen-950">
              {customized}
              <span className="text-base font-normal text-ink-soft"> / {states.length}</span>
            </p>
            <p className="text-xs text-ink-soft">
              events carrying edited wording{paused > 0 ? ` · ${paused} paused` : ""}
            </p>
          </div>
        </div>

        <form method="get" className="mt-4 flex flex-wrap items-end gap-3">
          {scopeOptions && (
            <Field label="Wording you are editing" className="min-w-64 flex-1">
              <Select name="org" defaultValue={organizationId ?? ""}>
                <option value="">Platform default — inherited by every organization</option>
                {scopeOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Search events" className="min-w-56 flex-1">
            <Input name="q" defaultValue={query} placeholder="payment, retake, invitation…" />
          </Field>
          <Field label="Language">
            <Select name="locale" defaultValue={locale}>
              {locales.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          {editing && <input type="hidden" name="edit" value={editing} />}
          <Button type="submit" variant="outline">
            Apply
          </Button>
        </form>

        {emailReport && (
          <p className="mt-4 rounded-xl bg-cream/80 px-4 py-3 text-xs text-ink-soft ring-1 ring-evergreen-900/10">
            <span className="font-semibold text-evergreen-900">
              {emailReport.label}: {emailReport.status}
            </span>{" "}
            {emailReport.explanation}
          </p>
        )}
      </Card>

      {visible.length === 0 && (
        <Card className="p-6 text-sm text-ink-soft">
          No notification event matches “{query}”. Clear the search to see all {states.length}.
        </Card>
      )}

      {groups.map((group) => (
        <section key={group} className="mt-8">
          <h2 className="font-display text-lg font-semibold text-evergreen-950">{group}</h2>
          <p className="mt-0.5 text-sm text-ink-soft">
            {visible.filter((state) => state.event.group === group).length} event(s) in this group.
          </p>
          <div className="mt-3 space-y-4">
            {visible
              .filter((state) => state.event.group === group)
              .map((state) => (
                <TemplateCard
                  key={state.event.key}
                  state={state}
                  organizationId={organizationId}
                  locale={locale}
                  canEdit={canEdit}
                  readOnlyNote={readOnlyNote}
                  open={editing === state.event.key}
                  saveAction={saveAction}
                  testAction={testAction}
                  resetAction={resetAction}
                />
              ))}
          </div>
        </section>
      ))}
    </>
  );
}

function TemplateCard({
  state,
  organizationId,
  locale,
  canEdit,
  readOnlyNote,
  open,
  saveAction,
  testAction,
  resetAction,
}: {
  state: NotificationEventState;
  organizationId: string | null;
  locale: string;
  canEdit: boolean;
  readOnlyNote?: string;
  open: boolean;
  saveAction: Action;
  testAction: Action;
  resetAction?: Action;
}) {
  const { event, resolved, saved, inherited, preview } = state;
  const provenance = PROVENANCE_BADGE[resolved.provenance];
  const isPaused = Boolean(saved && saved.is_active === false);

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-base font-semibold text-evergreen-950">{event.label}</h3>
          <p className="mt-1 max-w-3xl text-sm text-ink-soft">{event.description}</p>
          <p className="mt-2 text-xs text-ink-soft">
            <span className="font-mono">{event.key}</span> · sent to {event.audienceLabel.toLowerCase()} · stored as{" "}
            <span className="font-mono">{event.type}</span> · opens{" "}
            <span className="font-mono">{preview.link ?? event.link}</span>
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <Badge tone={provenance.tone}>{provenance.label}</Badge>
          {isPaused && <Badge tone="amber">Paused — not in force</Badge>}
          {resolved.channel === "email" && <Badge tone="red">Email only — nothing is delivered</Badge>}
          {resolved.channel === "both" && <Badge tone="gray">In-app and email</Badge>}
        </div>
      </div>

      <div className="mt-4 rounded-xl bg-cream/70 px-4 py-3 ring-1 ring-evergreen-900/10">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-evergreen-700">
          {resolved.channel === "email"
            ? "What an email recipient would read — and nothing is delivered on this deployment"
            : "What a recipient reads now — sample values"}
        </p>
        <p className="mt-1.5 font-semibold text-evergreen-950">{preview.title}</p>
        <p className="mt-0.5 whitespace-pre-line text-sm text-ink">{preview.body}</p>
        {organizationId && inherited && (
          <p className="mt-2 border-t border-evergreen-900/10 pt-2 text-xs text-ink-soft">
            EVALORA default this falls back to: <span className="font-medium text-evergreen-900">{inherited.title}</span>{" "}
            — {inherited.body}
          </p>
        )}
      </div>

      {canEdit ? (
        <details open={open}>
          <summary className="mt-4 cursor-pointer text-sm font-semibold text-evergreen-800 hover:text-evergreen-950">
            {saved ? "Edit this wording" : "Write your own wording"}
          </summary>
          <NotificationTemplateEditor
            event={event}
            saved={saved}
            resolved={resolved}
            locale={locale}
            organizationId={organizationId}
            saveAction={saveAction}
            testAction={testAction}
            resetAction={resetAction}
          />
        </details>
      ) : (
        <p className="mt-3 text-xs text-ink-soft">
          {readOnlyNote ?? "You can read this wording but not change it."}
        </p>
      )}
    </Card>
  );
}
