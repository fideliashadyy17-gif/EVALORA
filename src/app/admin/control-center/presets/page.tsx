import { Badge, Button, Card, DataTable, EmptyState, PageTitle, Select, Textarea, Input, Field } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { applyPreset, createOrUpdatePreset, removePreset } from "./actions";
import { Flash } from "../../ui";
import { getConfigDef, organizationWritableConfigs } from "@/lib/config/schema";
import { fmtDateTime } from "@/lib/utils";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Configuration presets" };
export const dynamic = "force-dynamic";

interface PresetRow {
  id: string;
  name: string;
  description: string | null;
  namespace: string | null;
  values: Record<string, Record<string, unknown>>;
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
}

interface OrgRow {
  id: string;
  name: string;
  slug: string;
}

/**
 * Configuration presets: named bundles of organization-scope settings that a
 * Super Admin can apply to a tenant in one audited step.
 *
 * Applying a preset writes through exactly the same validated path as a manual
 * edit — key by key, with the schema's rules, bounds and organization-only
 * restriction — so a preset can never become a way to smuggle in a
 * platform-wide value or an undeclared setting. Each written setting produces
 * its own revision row and is therefore individually reversible.
 */
export default async function PresetsPage({ searchParams }: { searchParams: Promise<{ ok?: string; e?: string }> }) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const admin = createAdminClient();

  const [{ data: rawPresets }, { data: rawOrgs }] = await Promise.all([
    admin.from("platform_config_presets").select("*").order("name").limit(200),
    admin.from("organizations").select("id, name, slug").is("deleted_at", null).order("name").limit(500),
  ]);

  const presets = (rawPresets ?? []) as unknown as PresetRow[];
  const orgs = (rawOrgs ?? []) as unknown as OrgRow[];
  const writable = organizationWritableConfigs();

  const MESSAGES: Record<string, string> = {
    saved: "Preset saved.",
    applied: "Preset applied to the selected organization.",
    deleted: "Preset deleted.",
  };

  return (
    <>
      <PageTitle
        eyebrow="Platform Control Center"
        title="Configuration presets"
        subtitle="Reusable bundles of organization-level settings. Apply one to onboard a tenant consistently, then adjust individual settings afterwards — every applied value is versioned and reversible."
        action={
          <>
            <Link href="/admin/control-center" className="inline-flex items-center justify-center gap-2 rounded-lg border border-evergreen-700/50 bg-white px-4 py-2.5 text-sm font-medium text-evergreen-800 hover:bg-evergreen-50">
              Platform configuration
            </Link>
            <Link href="/admin/control-center/organizations" className="inline-flex items-center justify-center gap-2 rounded-lg bg-gold-500 px-4 py-2.5 text-sm font-semibold text-evergreen-950 shadow-sm hover:bg-gold-400">
              Organizations
            </Link>
          </>
        }
      />

      <Flash />

      {sp.ok && MESSAGES[sp.ok] && (
        <p role="status" className="mb-4 rounded-lg bg-evergreen-50 px-4 py-3 text-sm font-medium text-evergreen-900 ring-1 ring-evergreen-600/30">
          {MESSAGES[sp.ok]}
        </p>
      )}
      {sp.e && MESSAGES[sp.e] && (
        <p role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-900 ring-1 ring-red-600/30">
          {MESSAGES[sp.e]}
        </p>
      )}

      <Card className="p-5">
        <h2 className="font-display text-base font-semibold text-evergreen-950">Create a preset</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Values are JSON keyed by namespace, then by setting key. Only settings an organization is allowed to override
          are accepted; the server refuses anything else, including platform-wide keys.
        </p>
        <form action={createOrUpdatePreset} className="mt-4 grid gap-4 lg:grid-cols-2">
          <Field label="Preset name">
            <Input name="name" required minLength={2} maxLength={120} placeholder="Secondary school default" />
          </Field>
          <Field label="Description">
            <Input name="description" maxLength={500} placeholder="What this preset is for" />
          </Field>
          <div className="lg:col-span-2">
            <Field
              label="Values (JSON)"
              hint='Example: { "assessment": { "default_pass_percent": 60 }, "examination": { "default_duration_minutes": 90 } }'
            >
              <Textarea
                name="values"
                rows={8}
                required
                className="font-mono text-xs"
                defaultValue={'{\n  "assessment": {\n    "default_pass_percent": 50\n  },\n  "examination": {\n    "default_duration_minutes": 60\n  }\n}'}
              />
            </Field>
          </div>
          <div className="lg:col-span-2">
            <details className="rounded-lg bg-cream px-4 py-3">
              <summary className="cursor-pointer text-sm font-semibold text-evergreen-900">
                Settings a preset may contain ({writable.length})
              </summary>
              <ul className="mt-3 grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
                {writable.map((def) => (
                  <li key={`${def.namespace}.${def.key}`} className="text-xs text-ink-soft">
                    <code className="font-mono text-[11px] text-evergreen-900">
                      {def.namespace}.{def.key}
                    </code>
                    <span className="block">{def.label}</span>
                  </li>
                ))}
              </ul>
            </details>
          </div>
          <div className="lg:col-span-2">
            <Button type="submit" variant="primary">
              Save preset
            </Button>
          </div>
        </form>
      </Card>

      <div className="mt-8">
        {!presets.length ? (
          <EmptyState
            title="No presets yet"
            body="Create one above to onboard organizations with a consistent starting configuration. Presets write through the same validated, audited path as editing a setting by hand."
          />
        ) : (
          <DataTable head={["Preset", "Settings", "Namespaces", "Updated", "Apply to organization", ""]}>
            {presets.map((preset) => {
              const entries = Object.entries(preset.values ?? {});
              const keys = entries.flatMap(([ns, vals]) => Object.keys(vals ?? {}).map((k) => `${ns}.${k}`));
              return (
                <tr key={preset.id} data-testid={`preset-row-${preset.id}`}>
                  <td>
                    <span className="font-medium text-evergreen-950">{preset.name}</span>
                    {!preset.is_active && (
                      <span className="ml-2">
                        <Badge tone="gray">Inactive</Badge>
                      </span>
                    )}
                    {preset.description && <span className="block text-xs text-ink-soft">{preset.description}</span>}
                  </td>
                  <td>
                    <details>
                      <summary className="cursor-pointer text-sm text-evergreen-800">{keys.length} settings</summary>
                      <ul className="mt-2 space-y-1">
                        {keys.map((id) => {
                          const [ns, key] = id.split(".");
                          const def = getConfigDef(ns, key);
                          return (
                            <li key={id} className="text-xs text-ink-soft">
                              <span className="font-medium text-evergreen-900">{def?.label ?? id}</span>
                              <code className="ml-1.5 font-mono text-[11px]">{id}</code>
                            </li>
                          );
                        })}
                      </ul>
                    </details>
                  </td>
                  <td className="text-xs text-ink-soft">{entries.map(([ns]) => ns).join(", ") || "—"}</td>
                  <td className="whitespace-nowrap text-xs text-ink-soft">
                    {preset.updated_at ? fmtDateTime(preset.updated_at) : "—"}
                  </td>
                  <td>
                    <form action={applyPreset} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="preset_id" value={preset.id} />
                      <Select name="organization_id" required className="min-w-[12rem]">
                        <option value="">Choose organization…</option>
                        {orgs.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name}
                          </option>
                        ))}
                      </Select>
                      <Button type="submit" variant="outline" disabled={!preset.is_active}>
                        Apply
                      </Button>
                    </form>
                  </td>
                  <td className="text-right">
                    <form action={removePreset}>
                      <input type="hidden" name="id" value={preset.id} />
                      <Button type="submit" variant="danger">
                        Delete
                      </Button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </DataTable>
        )}
      </div>

      <Card className="mt-6 border-amber-600/30 bg-amber-50/60 p-5">
        <h2 className="font-display text-base font-semibold text-amber-900">What applying a preset does — and does not do</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-amber-900">
          <li>
            It writes organization-scope overrides only. Platform configuration, other organizations, Super Admin
            permissions and platform-wide security settings are untouched.
          </li>
          <li>
            Each setting is validated against the schema before it is written; an invalid or non-overridable key is
            refused and reported, and the rest of the preset still applies.
          </li>
          <li>
            Every written setting gets its own revision row and audit entry, so any single one can be rolled back from
            Configuration history without disturbing the others.
          </li>
          <li>
            Existing examinations, papers, questions and results are never rewritten. Assessment defaults only fill
            gaps for future work; stored per-examination values continue to win.
          </li>
        </ul>
      </Card>
    </>
  );
}
