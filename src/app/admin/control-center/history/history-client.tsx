"use client";

/**
 * Configuration change history and rollback.
 *
 * Client component because a rollback needs confirmation in place and the
 * result has to be shown against the row that produced it, without losing the
 * applied filters. The rows themselves are read on the server (see ./page.tsx)
 * and passed down as data — the browser never fetches configuration history
 * directly, so the Super Admin gate cannot be bypassed.
 */
import { Badge, Button, Card, DataTable, EmptyState, Select } from "@/components/ui";
import { rollbackConfig, type ActionResult } from "@/lib/config/actions";
import { fmtDateTime } from "@/lib/utils";
import { useEffect, useMemo, useState } from "react";

export interface HistoryRow {
  id: string;
  scope_level: "global" | "organization";
  scope_id: string;
  namespace: string;
  key: string;
  revision: number;
  previous_value: unknown;
  new_value: unknown;
  change_note: string | null;
  changed_by: string | null;
  changed_at: string;
  rolled_back_from: string | null;
  organization_name: string | null;
  actor_email: string | null;
  setting_label: string | null;
}

function render(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "On" : "Off";
  if (typeof value === "object") return JSON.stringify(value);
  const text = String(value);
  return text.length > 120 ? `${text.slice(0, 120)}…` : text;
}

export function HistoryClient({
  rows,
  organizations,
  namespaces,
}: {
  rows: HistoryRow[];
  organizations: { id: string; name: string }[];
  namespaces: { key: string; label: string }[];
}) {
  const [namespace, setNamespace] = useState("all");
  const [org, setOrg] = useState("all");
  const [scope, setScope] = useState("all");
  const [q, setQ] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [result, setResult] = useState<ActionResult | null>(null);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (namespace !== "all" && r.namespace !== namespace) return false;
      if (scope !== "all" && r.scope_level !== scope) return false;
      if (scope === "organization" && org === "all" && r.scope_level !== "organization") return false;
      if (org !== "all" && r.scope_id !== org) return false;
      if (!needle) return true;
      return `${r.setting_label ?? ""} ${r.key} ${r.namespace} ${r.organization_name ?? ""} ${r.change_note ?? ""}`
        .toLowerCase()
        .includes(needle);
    });
  }, [rows, namespace, org, scope, q]);

  useEffect(() => {
    setResult(null);
  }, [namespace, org, scope, q]);

  async function rollback(row: HistoryRow) {
    setPendingId(row.id);
    setResult(null);
    try {
      const formData = new FormData();
      formData.set("revision_id", row.id);
      const outcome = await rollbackConfig(formData);
      setResult(outcome);
    } catch (error) {
      setResult({ ok: false, error: error instanceof Error ? error.message : "The rollback could not be completed." });
    } finally {
      setPendingId(null);
    }
  }

  return (
    <>
      <Card className="p-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-evergreen-900">Namespace</span>
            <Select value={namespace} onChange={(e) => setNamespace(e.target.value)}>
              <option value="all">All namespaces</option>
              {namespaces.map((ns) => (
                <option key={ns.key} value={ns.key}>
                  {ns.label}
                </option>
              ))}
            </Select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-evergreen-900">Scope</span>
            <Select value={scope} onChange={(e) => setScope(e.target.value)}>
              <option value="all">Platform and organizations</option>
              <option value="global">Platform only</option>
              <option value="organization">Organizations only</option>
            </Select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-evergreen-900">Organization</span>
            <Select value={org} onChange={(e) => setOrg(e.target.value)}>
              <option value="all">All organizations</option>
              {organizations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-evergreen-900">Search</span>
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Setting, note, actor…"
              className="w-full rounded-lg border border-evergreen-900/55 bg-white px-3.5 py-2.5 text-sm shadow-sm focus:border-evergreen-700 focus:outline-none focus:ring-2 focus:ring-evergreen-600/25"
            />
          </label>
        </div>
        <p className="mt-3 text-xs text-ink-soft">
          Showing {filtered.length} of {rows.length} recent revisions. History is append-only: a rollback writes a new
          revision that restores an earlier value, it never deletes or edits the past.
        </p>
      </Card>

      {result && (
        <p
          role={result.ok ? "status" : "alert"}
          className={`mt-4 rounded-lg px-4 py-3 text-sm ${
            result.ok
              ? "bg-evergreen-50 text-evergreen-900 ring-1 ring-evergreen-600/25"
              : "bg-red-50 text-red-900 ring-1 ring-red-600/25"
          }`}
        >
          {result.ok ? result.message : result.error}
        </p>
      )}

      <div className="mt-6">
        {!filtered.length ? (
          <EmptyState
            title="No configuration changes recorded"
            body="Every save made through the Control Center appears here with the value before and after, who made it, and when. Change a setting to populate this history."
          />
        ) : (
          <DataTable head={["When", "Setting", "Scope", "Change", "By", "Note", ""]}>
            {filtered.map((row) => (
              <tr key={row.id} data-testid={`history-row-${row.namespace}-${row.key}-${row.revision}`}>
                <td className="whitespace-nowrap text-ink-soft">{fmtDateTime(row.changed_at)}</td>
                <td>
                  <span className="font-medium text-evergreen-950">{row.setting_label ?? row.key}</span>
                  <span className="block font-mono text-[11px] text-ink-soft">
                    {row.namespace}.{row.key} · rev {row.revision}
                  </span>
                </td>
                <td>
                  {row.scope_level === "global" ? (
                    <Badge tone="green">Platform</Badge>
                  ) : (
                    <Badge tone="gold">{row.organization_name ?? "Organization"}</Badge>
                  )}
                </td>
                <td className="max-w-md">
                  <span className="block text-xs text-ink-soft">
                    <span className="font-semibold">Before:</span> {render(row.previous_value)}
                  </span>
                  <span className="mt-0.5 block text-xs text-evergreen-900">
                    <span className="font-semibold">After:</span> {render(row.new_value)}
                  </span>
                  {row.rolled_back_from && (
                    <span className="mt-1 block text-[11px] text-amber-800">Produced by a rollback</span>
                  )}
                </td>
                <td className="text-xs text-ink-soft">{row.actor_email ?? "—"}</td>
                <td className="max-w-[16rem] text-xs text-ink-soft">{row.change_note ?? "—"}</td>
                <td className="whitespace-nowrap text-right">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={pendingId !== null}
                    onClick={() => {
                      const label = row.setting_label ?? row.key;
                      const confirmed = window.confirm(
                        `Roll “${label}” back to the value it had before revision ${row.revision}?\n\n` +
                          `That restores: ${render(row.previous_value)}\n\n` +
                          `This writes a new revision and is itself recorded in the audit log. ` +
                          (row.scope_level === "global"
                            ? "It changes platform-wide behaviour immediately."
                            : `It affects ${row.organization_name ?? "this organization"} only.`),
                      );
                      if (confirmed) void rollback(row);
                    }}
                  >
                    {pendingId === row.id ? "Rolling back…" : "Roll back"}
                  </Button>
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </div>
    </>
  );
}
