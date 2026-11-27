import type { Metadata } from "next";
import { Badge, Card, DataTable, PageTitle } from "@/components/ui";
import { activeOrg, requireUser } from "@/lib/auth";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getCapabilities, requireModule } from "@/lib/capabilities";
import { requestFormatter } from "@/lib/formattingRequest";

export const metadata: Metadata = { title: "AI operation log" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "green" | "amber" | "red" | "gray"> = {
  succeeded: "green",
  started: "gray",
  failed: "red",
  denied: "red",
  awaiting_approval: "amber",
};

/**
 * The AI operation journal.
 *
 * Arguments and results are stored as digests plus a bounded summary, never as
 * raw candidate answers. This page therefore shows what happened without
 * becoming a second copy of the marking data.
 */
export default async function AiActivityPage({ searchParams }: { searchParams: Promise<{ tool?: string; status?: string }> }) {
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  // Server-side module gate: the sidebar hides the entry, this refuses the URL.
  const { entitlement } = await getCapabilities(await createClient(), ctx, org.id);
  requireModule(entitlement, "ai_assistant", "/dashboard?e=module");
  const { dateTime: fmtDateTime } = await requestFormatter(org.id);
  const sp = await searchParams;
  const admin = createAdminClient();

  let query = admin
    .from("ai_executions")
    .select("id, tool_name, risk, status, surface, actor_kind, agent_name, actor_email, error_code, error_message, latency_ms, created_at, arguments_summary", { count: "exact" })
    .eq("organization_id", org.id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (sp.tool) query = query.eq("tool_name", sp.tool);
  if (sp.status) query = query.eq("status", sp.status);
  const { data, error } = await query;

  if (error) {
    return (
      <div className="space-y-4">
        <PageTitle title="AI operation log" />
        <Card className="p-6">
          <p className="text-sm text-ink-soft">
            The journal could not be read ({error.message}). Nothing is shown rather than an incomplete picture presented as
            complete.
          </p>
        </Card>
      </div>
    );
  }

  const rows = data ?? [];

  return (
    <div className="space-y-5">
      <PageTitle
        eyebrow={<Badge tone="green">{rows.length} shown</Badge>}
        title="AI operation log"
        subtitle="Every AI call in this workspace: who asked, through which surface, which operation, its risk class and its outcome. Arguments are stored as digests, never as raw candidate data."
      />
      <Card className="p-0">
        <DataTable head={["When", "Operation", "Risk", "Actor", "Surface", "Status", "Latency"]} label="AI operation log">
          {rows.length === 0 && (
            <tr>
              <td colSpan={7} className="px-4 py-6 text-center text-sm text-ink-soft">
                No AI call has been made in this workspace yet.
              </td>
            </tr>
          )}
          {rows.map((row) => (
            <tr key={row.id as string}>
              <td className="whitespace-nowrap text-xs text-ink-soft">{fmtDateTime(row.created_at as string)}</td>
              <td>
                <span className="font-mono text-xs text-evergreen-800">{row.tool_name as string}</span>
                {row.error_message && <p className="mt-0.5 max-w-md text-xs text-red-700">{row.error_message as string}</p>}
              </td>
              <td>
                <Badge tone={row.risk === "sensitive" ? "amber" : "gray"}>{row.risk as string}</Badge>
              </td>
              <td className="text-xs text-ink-soft">
                {row.actor_kind as string}
                {row.agent_name ? ` · ${row.agent_name as string}` : ""}
                {row.actor_email ? <div className="max-w-[16rem] truncate">{row.actor_email as string}</div> : null}
              </td>
              <td className="text-xs">{row.surface as string}</td>
              <td>
                <Badge tone={STATUS_TONE[row.status as string] ?? "gray"}>{row.status as string}</Badge>
              </td>
              <td className="text-xs text-ink-soft">{row.latency_ms ? `${row.latency_ms} ms` : "—"}</td>
            </tr>
          ))}
        </DataTable>
      </Card>
    </div>
  );
}
