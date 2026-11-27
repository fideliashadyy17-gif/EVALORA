"use client";

/**
 * One configuration setting, rendered as a real form.
 *
 * This is the workhorse of the Platform Control Center. It is driven entirely
 * by the ConfigKeyDef declared in src/lib/config/schema.ts, which is why the
 * dashboard cannot offer a control the schema does not define:
 *
 *   • the input kind comes from `kind` (string, text, email, url, image,
 *     color, boolean, integer, number, enum, multi_enum, string_list,
 *     timezone, announcement_list)
 *   • the choices come from `options`, bounds from `min`/`max`
 *   • a read-only setting (no writable scope) renders as a status report, not
 *     as a control that pretends to work
 *   • an `operational` setting requires an explicit confirmation tick before
 *     the server action will accept it
 *   • provenance is shown as a badge, and an organization override gets a
 *     Reset-to-inherit button that explains what it will do first
 *
 * Submission uses useActionState, so success and validation errors come back
 * from the server action and are shown in place — no optimistic UI claiming a
 * save that was refused.
 */
import { Badge, Button, Card, Input, Select, Textarea } from "@/components/ui";
import type { ConfigKeyDef } from "@/lib/config/types";
import type { ResolvedConfigEntry } from "@/lib/config/types";
import { cn } from "@/lib/utils";
import { useActionState, useEffect, useState } from "react";

export interface ConfigFieldResult {
  ok: boolean;
  message?: string;
  error?: string;
  namespace?: string;
  key?: string;
  revision?: number;
}

type Action = (formData: FormData) => Promise<ConfigFieldResult>;

/**
 * Bind a single-argument server action into the (state, formData) shape
 * useActionState expects. Wrapping keeps the action signature honest: the
 * server decides the outcome from the payload alone, never from a value the
 * browser could seed into previous state.
 */
function bindAction(action: Action) {
  return async (_prev: ConfigFieldResult | null, formData: FormData) => action(formData);
}

function noopAction(): Promise<ConfigFieldResult> {
  return Promise.resolve({ ok: false, error: "This action is not available here." });
}

/** Current value rendered as the string a form control expects. */
function toControlValue(def: ConfigKeyDef, value: unknown): string {
  if (value == null) return "";
  if (Array.isArray(value)) {
    if (def.kind === "announcement_list") return JSON.stringify(value, null, 2);
    return value.join("\n");
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

function sourceBadge(entry: ResolvedConfigEntry | undefined, organizationName?: string | null) {
  if (!entry) return <Badge tone="gray">Not resolved</Badge>;
  if (entry.source === "default") return <Badge tone="gray">Built-in default</Badge>;
  if (entry.source === "global") return <Badge tone="green">Platform · rev {entry.revision}</Badge>;
  return (
    <Badge tone="gold">
      {organizationName ? `Override · ${organizationName}` : "Organization override"} · rev {entry.revision}
    </Badge>
  );
}

export function ConfigField({
  def,
  entry,
  action,
  scope,
  scopeId,
  organizationName,
  inheritedValue,
  resetAction,
  compact,
}: {
  def: ConfigKeyDef;
  entry?: ResolvedConfigEntry;
  action: Action;
  scope: "global" | "organization";
  scopeId?: string | null;
  organizationName?: string | null;
  /** The value this setting would fall back to if the override were removed. */
  inheritedValue?: unknown;
  resetAction?: Action;
  compact?: boolean;
}) {
  const [state, formAction, pending] = useActionState<ConfigFieldResult | null, FormData>(bindAction(action), null);
  const [resetState, resetFormAction, resetPending] = useActionState<ConfigFieldResult | null, FormData>(
    bindAction(resetAction ?? noopAction),
    null,
  );
  const [confirmed, setConfirmed] = useState(false);
  const [announcements, setAnnouncements] = useState(toControlValue(def, entry?.value));

  const readOnly = !def.writableScopes.includes(scope);
  const isOverride = entry?.source === "organization";
  const fieldName = `${def.namespace}.${def.key}`;

  // A saved change must clear the confirmation tick, otherwise a second
  // operational change could be submitted without a fresh confirmation.
  useEffect(() => {
    if (state?.ok) setConfirmed(false);
  }, [state?.ok]);

  const feedback = state?.error
    ? { text: state.error, tone: "error" as const }
    : state?.ok
      ? { text: state.message ?? "Saved.", tone: "ok" as const }
      : resetState?.error
        ? { text: resetState.error, tone: "error" as const }
        : resetState?.ok
          ? { text: resetState.message ?? "Override removed.", tone: "ok" as const }
          : null;

  return (
    <Card
      className={cn("p-5", compact && "p-4")}
      data-testid={`config-field-${fieldName}`}
      data-namespace={def.namespace}
      data-key={def.key}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-base font-semibold text-evergreen-950">{def.label}</h3>
            {sourceBadge(entry, organizationName)}
            {def.sensitivity === "operational" && <Badge tone="amber">Operational</Badge>}
            {readOnly && <Badge tone="gray">Read only</Badge>}
          </div>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{def.description}</p>
          {def.help && (
            <p className="mt-2 rounded-lg bg-cream px-3 py-2 text-xs leading-relaxed text-ink-soft">{def.help}</p>
          )}
        </div>
        <code className="shrink-0 rounded bg-cream px-2 py-1 font-mono text-[11px] text-ink-soft">{fieldName}</code>
      </div>

      {def.connectedModules?.length ? (
        <p className="mt-3 text-xs text-ink-soft">
          <span className="font-semibold">Connected modules:</span> {def.connectedModules.join(", ")}
        </p>
      ) : null}

      <details className="mt-2 text-xs text-ink-soft">
        <summary className="cursor-pointer select-none font-medium text-evergreen-800">
          Where this value is read
        </summary>
        <ul className="mt-2 space-y-1 pl-4">
          {def.consumedBy.map((consumer) => (
            <li key={consumer} className="font-mono text-[11px]">
              {consumer}
            </li>
          ))}
        </ul>
      </details>

      {readOnly ? (
        <div className="mt-4 rounded-xl bg-cream px-4 py-3 text-sm text-ink-soft">
          <span className="font-semibold text-evergreen-900">Current value: </span>
          <span className="font-mono text-xs">{toControlValue(def, entry?.value) || "—"}</span>
          <p className="mt-1.5 text-xs">
            This setting is reported so you can see the platform&rsquo;s real state. It is not editable from the dashboard
            because nothing in EVALORA can change it safely — see its description above.
          </p>
        </div>
      ) : (
        <form action={formAction} className="mt-4 space-y-3">
          <input type="hidden" name="namespace" value={def.namespace} />
          <input type="hidden" name="key" value={def.key} />
          <input type="hidden" name="scope" value={scope} />
          {scope === "organization" && scopeId ? <input type="hidden" name="scope_id" value={scopeId} /> : null}
          {scope === "organization" && scopeId ? (
            <input type="hidden" name="organization_id" value={scopeId} />
          ) : null}

          <ConfigInput def={def} fieldName={fieldName} entry={entry} announcements={announcements} setAnnouncements={setAnnouncements} />

          {def.sensitivity === "operational" && (
            <label className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-900 ring-1 ring-amber-600/25">
              <input
                type="checkbox"
                name="confirm"
                value="yes"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-amber-700"
              />
              <span>
                I understand this changes live behaviour immediately for everyone affected, and I want to apply it now.
              </span>
            </label>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="submit"
              variant="primary"
              disabled={pending || (def.sensitivity === "operational" && !confirmed)}
            >
              {pending ? "Saving…" : "Save setting"}
            </Button>
            {isOverride && resetAction && (
              <Button type="submit" form="reset" variant="outline" disabled={resetPending}>
                {resetPending ? "Resetting…" : "Reset to inherit"}
              </Button>
            )}
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
      )}

      {isOverride && resetAction && (
        <form id="reset" action={resetFormAction} className="mt-3 border-t border-evergreen-900/10 pt-3">
          <input type="hidden" name="namespace" value={def.namespace} />
          <input type="hidden" name="key" value={def.key} />
          {scopeId ? <input type="hidden" name="organization_id" value={scopeId} /> : null}
          <p className="text-xs text-ink-soft">
            <span className="font-semibold text-evergreen-900">Reset to inherit</span> removes this organization&rsquo;s
            override only. The platform value is not changed, and no other organization is affected.
            {inheritedValue !== undefined && (
              <>
                {" "}
                It will fall back to <span className="font-mono">{toControlValue(def, inheritedValue) || "the built-in default"}</span>.
              </>
            )}
          </p>
        </form>
      )}
    </Card>
  );
}

function ConfigInput({
  def,
  fieldName,
  entry,
  announcements,
  setAnnouncements,
}: {
  def: ConfigKeyDef;
  fieldName: string;
  entry?: ResolvedConfigEntry;
  announcements: string;
  setAnnouncements: (value: string) => void;
}) {
  const current = toControlValue(def, entry?.value);

  switch (def.kind) {
    case "boolean":
      return (
        <label className="flex items-center gap-3 rounded-lg border border-evergreen-900/15 bg-cream px-3 py-2.5">
          <input
            type="checkbox"
            name={fieldName}
            defaultChecked={entry?.value === true}
            className="h-5 w-5 accent-evergreen-700"
            aria-describedby={`${fieldName}-help`}
          />
          <span id={`${fieldName}-help`} className="text-sm text-evergreen-900">
            {entry?.value === true ? "On" : "Off"}
          </span>
        </label>
      );

    case "enum":
    case "timezone":
      return (
        <Select name={fieldName} defaultValue={current}>
          {(def.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
              {o.hint ? ` — ${o.hint}` : ""}
            </option>
          ))}
        </Select>
      );

    case "multi_enum": {
      const selected = Array.isArray(entry?.value) ? (entry!.value as unknown[]).map(String) : [];
      return (
        <fieldset className="rounded-lg border border-evergreen-900/15 bg-cream p-3">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">
            Select all that apply
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {(def.options ?? []).map((o) => (
              <label key={o.value} className="flex items-start gap-2 text-sm text-evergreen-900">
                <input
                  type="checkbox"
                  name={fieldName}
                  value={o.value}
                  defaultChecked={selected.includes(o.value)}
                  className="mt-0.5 h-4 w-4 accent-evergreen-700"
                />
                <span>
                  {o.label}
                  {o.hint ? <span className="block text-xs text-ink-soft">{o.hint}</span> : null}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      );
    }

    case "string_list":
      return (
        <div>
          <Textarea name={fieldName} rows={4} defaultValue={current} placeholder={"easy\nmedium\nhard"} />
          <p className="mt-1 text-xs text-ink-soft">One entry per line. Maximum 24.</p>
        </div>
      );

    case "color":
      return <ColorInput name={fieldName} label={def.label} initial={current} placeholder="#0a5c36" />;

    case "integer":
    case "number":
      return (
        <Input
          name={fieldName}
          type="number"
          defaultValue={current}
          min={def.min}
          max={def.max}
          step={def.step ?? (def.kind === "integer" ? 1 : "any")}
          placeholder={def.placeholder}
          className="max-w-[14rem]"
        />
      );

    case "text":
      return <Textarea name={fieldName} rows={3} defaultValue={current} placeholder={def.placeholder} maxLength={def.maxLength} />;

    case "announcement_list":
      return (
        <div>
          <Textarea
            name={fieldName}
            rows={8}
            value={announcements}
            onChange={(e) => setAnnouncements(e.target.value)}
            placeholder='[{ "title": "Results published", "body": "Term 1 results are now visible.", "tone": "info", "enabled": true }]'
          />
          <p className="mt-1 text-xs text-ink-soft">
            JSON list. Each entry: title, body, tone (info · success · warning · critical), href, enabled, starts_at,
            ends_at. Maximum 12 entries. Text is escaped on render, so markup has no effect.
          </p>
        </div>
      );

    case "email":
    case "url":
    case "image":
    case "string":
    default:
      return <Input name={fieldName} defaultValue={current} placeholder={def.placeholder} maxLength={def.maxLength} />;
  }
}

/**
 * Colour input: a native picker and a hex text field kept in sync, submitting
 * one authoritative value. The picker is not decorative — either control can
 * drive the other, and only the hex field is submitted.
 */
function ColorInput({
  name,
  label,
  initial,
  placeholder,
}: {
  name: string;
  label: string;
  initial: string;
  placeholder?: string;
}) {
  const [value, setValue] = useState(initial || "");
  const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
  const normalized = HEX.test(value.trim()) ? value.trim() : "#0a5c36";
  return (
    <div className="flex flex-wrap items-center gap-3">
      <input
        type="color"
        value={normalized}
        onChange={(e) => setValue(e.target.value)}
        className="h-11 w-16 cursor-pointer rounded-lg border border-evergreen-900/25 bg-white p-1"
        aria-label={`${label} colour picker`}
      />
      <Input
        name={name}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="max-w-[12rem] font-mono"
        aria-label={`${label} hex value`}
      />
      <p className="text-xs text-ink-soft">
        {HEX.test(value.trim()) ? "Valid hex colour." : "Enter a hex colour such as #0a5c36."}
      </p>
    </div>
  );
}
