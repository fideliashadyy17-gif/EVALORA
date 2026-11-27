"use client";

/**
 * One notification event's wording editor.
 *
 * The client half of the template console, and the reason an author never has
 * to save to find out what they wrote. It imports the SAME pure registry the
 * server resolves with (`@/lib/notificationTemplates`), so the preview below the
 * fields is produced by the very function that renders a recipient's
 * notification — not by a browser-side approximation of it.
 *
 *   • the preview updates as you type, with the event's sample values;
 *   • a variable this event does not supply is flagged before you submit, and
 *     the server refuses it again, because a token that renders literally is a
 *     defect a user would read;
 *   • submission uses useActionState, so a refusal comes back with its reason
 *     and the draft stays on screen instead of being lost to a redirect;
 *   • "Send myself a test" delivers one real notification to your own bell
 *     through the production code path, which is the only preview that can
 *     answer "what will this actually look like to someone?".
 */
import { Badge, Button, Field, Input, Select, Textarea } from "@/components/ui";
import {
  NOTIFICATION_BODY_MAX,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_TITLE_MAX,
  NOTIFICATION_VARIABLES,
  extractTemplateVariables,
  previewTemplate,
  renderNotificationLink,
  type NotificationEventDef,
  type NotificationTemplateRow,
  type ResolvedNotificationTemplate,
} from "@/lib/notificationTemplates";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";

export interface NotificationTemplateResult {
  ok: boolean;
  message?: string;
  error?: string;
  eventKey?: string;
}

type Action = (formData: FormData) => Promise<NotificationTemplateResult>;

/**
 * Bind a single-argument server action into the (state, formData) shape
 * useActionState expects. The server decides the outcome from the payload alone,
 * never from state the browser could seed.
 */
function bindAction(action: Action) {
  return async (_prev: NotificationTemplateResult | null, formData: FormData) => action(formData);
}

function noopAction(): Promise<NotificationTemplateResult> {
  return Promise.resolve({ ok: false, error: "This action is not available here." });
}

export function NotificationTemplateEditor({
  event,
  saved,
  resolved,
  locale,
  organizationId,
  saveAction,
  testAction,
  resetAction,
}: {
  event: NotificationEventDef;
  saved: NotificationTemplateRow | null;
  resolved: ResolvedNotificationTemplate;
  locale: string;
  organizationId: string | null;
  saveAction: Action;
  testAction?: Action;
  resetAction?: Action;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(saved?.title ?? event.title);
  const [body, setBody] = useState(saved?.body ?? event.body);
  const [channel, setChannel] = useState<string>(saved?.channel ?? "in_app");
  const [isActive, setIsActive] = useState(saved ? saved.is_active !== false : true);
  const [confirmed, setConfirmed] = useState(false);

  const [state, formAction, pending] = useActionState<NotificationTemplateResult | null, FormData>(
    bindAction(saveAction),
    null,
  );
  const [testState, testFormAction, testPending] = useActionState<NotificationTemplateResult | null, FormData>(
    bindAction(testAction ?? noopAction),
    null,
  );
  const [resetState, resetFormAction, resetPending] = useActionState<NotificationTemplateResult | null, FormData>(
    bindAction(resetAction ?? noopAction),
    null,
  );

  // A saved change re-reads the resolved state so the provenance badge, the
  // "what a recipient reads now" panel and the fallback wording all follow the
  // write instead of waiting for a manual reload.
  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state?.ok, router]);

  useEffect(() => {
    if (resetState?.ok) {
      setConfirmed(false);
      router.refresh();
    }
  }, [resetState?.ok, router]);

  const preview = previewTemplate(event.key, title, body);
  const previewLink = renderNotificationLink(event.key);
  const used = extractTemplateVariables(title, body);
  const supplied = event.variables as readonly string[];
  const unknown = used.filter((name) => !supplied.includes(name));
  const variables = supplied
    .map((name) => NOTIFICATION_VARIABLES.find((variable) => variable.name === name))
    .filter((variable) => Boolean(variable));

  const titleTooLong = title.length > NOTIFICATION_TITLE_MAX;
  const bodyTooLong = body.length > NOTIFICATION_BODY_MAX;
  const blocked = unknown.length > 0 || titleTooLong || bodyTooLong || !title.trim() || !body.trim();

  const feedback = state?.error
    ? { text: state.error, tone: "error" as const }
    : state?.ok
      ? { text: state.message ?? "Saved. This wording is now in force.", tone: "ok" as const }
      : testState?.error
        ? { text: testState.error, tone: "error" as const }
        : testState?.ok
          ? { text: testState.message ?? "Test delivered to your own notifications.", tone: "ok" as const }
          : resetState?.error
            ? { text: resetState.error, tone: "error" as const }
            : resetState?.ok
              ? { text: resetState.message ?? "Wording deleted.", tone: "ok" as const }
              : null;

  const testId = `notification-template-${event.key}`;

  return (
    <div className="mt-4 border-t border-evergreen-900/10 pt-4" data-testid={testId}>
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="event_key" value={event.key} />
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="organization_id" value={organizationId ?? ""} />

        <Field
          label="Title"
          hint={`${title.length}/${NOTIFICATION_TITLE_MAX} characters. Shown in the bell and on the notifications page.`}
        >
          <Input
            name="title"
            required
            maxLength={NOTIFICATION_TITLE_MAX + 40}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-label={`Title for ${event.label}`}
          />
        </Field>

        <Field
          label="Message"
          hint={`${body.length}/${NOTIFICATION_BODY_MAX} characters. Variables in double braces are replaced with the real values listed below.`}
        >
          <Textarea
            name="body"
            required
            rows={3}
            maxLength={NOTIFICATION_BODY_MAX + 200}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            aria-label={`Message for ${event.label}`}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Channel" hint="Email wording can be authored and previewed; this deployment has no email provider to send it.">
            <Select name="channel" value={channel} onChange={(e) => setChannel(e.target.value)}>
              {NOTIFICATION_CHANNELS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status">
            <label className="flex items-start gap-2.5 rounded-xl border border-evergreen-900/10 bg-cream/70 px-3 py-2.5 text-sm text-ink">
              <input
                type="checkbox"
                name="is_active"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="mt-0.5 h-5 w-5 shrink-0 accent-evergreen-700"
              />
              <span>
                In force. Unchecked keeps the wording saved but hands delivery back to{" "}
                {organizationId ? "the EVALORA default" : "the copy shipped in code"}.
              </span>
            </label>
          </Field>
        </div>

        <div className="rounded-xl bg-cream/70 px-4 py-3 ring-1 ring-evergreen-900/10">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-evergreen-700">
            Live preview — sample values
          </p>
          <p className="mt-1.5 font-semibold text-evergreen-950">{preview.title || "(no title yet)"}</p>
          <p className="mt-0.5 whitespace-pre-line text-sm text-ink">{preview.body || "(no message yet)"}</p>
          {previewLink && <p className="mt-1.5 font-mono text-[11px] text-ink-soft">opens {previewLink}</p>}
        </div>

        {variables.length > 0 ? (
          <details className="rounded-xl bg-white px-4 py-3 ring-1 ring-evergreen-900/10">
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.18em] text-evergreen-700">
              Variables this notification supplies ({variables.length})
            </summary>
            <ul className="mt-2 space-y-2">
              {variables.map((variable) => variable && (
                <li key={variable.name} className="text-xs text-ink">
                  <button
                    type="button"
                    onClick={() => setBody((current) => `${current}${variable.token}`)}
                    className="rounded bg-cream px-1.5 py-0.5 font-mono text-[11px] text-evergreen-900 ring-1 ring-evergreen-900/10 hover:bg-evergreen-50"
                    title="Append to the message"
                  >
                    {variable.token}
                  </button>{" "}
                  <span className="font-medium">{variable.label}</span>
                  <span className="text-ink-soft"> — {variable.source}.</span>
                  {variable.clause && (
                    <span className="text-ink-soft">
                      {" "}
                      A whole optional sentence, empty when it does not apply, so the message can never read
                      “code: .”
                    </span>
                  )}
                  <span className="block text-ink-soft">
                    Example: <span className="font-mono">{variable.example || "(empty)"}</span>
                  </span>
                </li>
              ))}
            </ul>
          </details>
        ) : (
          <p className="rounded-xl bg-white px-4 py-3 text-xs text-ink-soft ring-1 ring-evergreen-900/10">
            This notification supplies no variables — the wording is the whole message.
          </p>
        )}

        {unknown.length > 0 && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-900 ring-1 ring-red-600/25">
            {unknown.map((name) => `{{${name}}}`).join(", ")} is not available for “{event.label}”.{" "}
            {supplied.length
              ? `This notification supplies: ${supplied.map((name) => `{{${name}}}`).join(", ")}.`
              : "It supplies no variables."}{" "}
            Saving is refused so a mistyped variable cannot reach a recipient.
          </p>
        )}
        {channel === "email" && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-600/25">
            Email only: nothing is delivered on this deployment, because no email provider is connected. Save it to
            have the wording ready, but a recipient will not receive this notification in-app either.
          </p>
        )}
        {!isActive && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-600/25">
            Paused: this wording is stored but not in force. Recipients get{" "}
            {organizationId ? "the EVALORA default" : "the copy shipped in code"} instead.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={pending || blocked}>
            {pending ? "Saving…" : "Save wording"}
          </Button>
          <Button type="submit" form={`${testId}-test`} variant="outline" disabled={testPending || blocked}>
            {testPending ? "Sending…" : "Send myself a test"}
          </Button>
          {saved && resetAction && (
            <Button type="submit" form={`${testId}-reset`} variant="ghost" disabled={resetPending || !confirmed}>
              {resetPending ? "Deleting…" : "Reset to inherit"}
            </Button>
          )}
          <span className="text-xs text-ink-soft">
            {resolved.isCustomized ? "Editing saved wording." : "No wording saved yet — the fallback is in force."}
          </span>
        </div>

        {feedback && (
          <p
            role={feedback.tone === "error" ? "alert" : "status"}
            className={cn(
              "rounded-lg px-3 py-2 text-sm",
              feedback.tone === "error"
                ? "bg-red-50 text-red-900 ring-1 ring-red-600/25"
                : "bg-evergreen-50 text-evergreen-900 ring-1 ring-evergreen-600/25",
            )}
          >
            {feedback.text}
          </p>
        )}
      </form>

      <form id={`${testId}-test`} action={testFormAction} className="hidden">
        <input type="hidden" name="event_key" value={event.key} />
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="title" value={title} />
        <input type="hidden" name="body" value={body} />
        <input type="hidden" name="channel" value={channel} />
      </form>

      {saved && resetAction && (
        <form id={`${testId}-reset`} action={resetFormAction} className="mt-3 border-t border-red-200 pt-3">
          <input type="hidden" name="event_key" value={event.key} />
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="organization_id" value={organizationId ?? ""} />
          <p className="text-xs text-ink-soft">
            <span className="font-semibold text-red-900">Reset to inherit</span> deletes this wording for{" "}
            <span className="font-mono">{event.key}</span> in {locale.toUpperCase()} — it is not paused, it is removed.{" "}
            {organizationId
              ? "The EVALORA default takes over; with none saved, the copy shipped in code does."
              : "The copy shipped in code takes over."}{" "}
            Notifications already delivered are untouched.
          </p>
          <label className="mt-2 flex items-start gap-2 text-xs text-red-900">
            <input
              type="checkbox"
              name="confirm"
              value="on"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-red-700"
            />
            <span>I understand this wording will be deleted.</span>
          </label>
          {resetState?.error && !resetState.ok && (
            <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-900 ring-1 ring-red-600/25">
              {resetState.error}
            </p>
          )}
        </form>
      )}

      {saved && (
        <p className="mt-3 text-[11px] text-ink-soft">
          Saved wording · channel <span className="font-mono">{saved.channel}</span> ·{" "}
          {saved.is_active === false ? "paused" : "in force"} · updated{" "}
          <span className="font-mono">{String(saved.updated_at ?? "").slice(0, 16).replace("T", " ")}</span>
          {saved.variables && saved.variables.length > 0 && (
            <>
              {" "}
              · variables <span className="font-mono">{saved.variables.join(", ")}</span>
            </>
          )}
          {" "}
          <Badge tone="gray">{saved.locale}</Badge>
        </p>
      )}
    </div>
  );
}
