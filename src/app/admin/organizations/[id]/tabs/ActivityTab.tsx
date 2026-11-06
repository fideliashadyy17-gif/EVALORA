import { Card } from "@/components/ui";
import { createAdminClient } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/utils";
import { Table } from "../../../ui";

export async function ActivityTab({ orgId }: { orgId: string }) {
  const admin = createAdminClient();
  const [{ data: logs }, { data: sessions }] = await Promise.all([
    admin
      .from("audit_logs")
      .select("id, action, entity, created_at, metadata, profiles(email)")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(60),
    admin
      .from("quiz_sessions")
      .select("id, title, status, join_code, created_at, session_participants(id)")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  return (
    <>
      <Card className="p-5">
        <h2 className="font-display text-base font-semibold text-evergreen-950">Recent live sessions</h2>
        {(sessions ?? []).length === 0 ? (
          <p className="mt-2 text-sm text-ink-soft">No live sessions yet in this workspace.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {(sessions ?? []).map((s) => (
              <li key={s.id} className="flex flex-wrap justify-between gap-2 border-b border-evergreen-900/10 pb-2 last:border-0">
                <span>
                  <span className="font-medium text-ink">{s.title ?? "Live session"}</span>
                  <span className="text-ink-soft"> · code {s.join_code} · {(s.session_participants as unknown[])?.length ?? 0} participants</span>
                </span>
                <span className="text-xs capitalize text-ink-soft">{s.status} · {fmtDateTime(s.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <h2 className="mt-8 font-display text-lg font-semibold text-evergreen-950">Audit trail for this organization</h2>
      <p className="mt-0.5 text-sm text-ink-soft">Administrative access, subscription changes, membership operations and content lifecycle events.</p>
      <div className="mt-3">
        {(logs ?? []).length === 0 ? (
          <p className="text-sm text-ink-soft">No audit entries yet.</p>
        ) : (
          <Table head={["When", "Action", "Entity", "Actor"]}>
            {(logs ?? []).map((l) => (
              <tr key={l.id}>
                <td className="whitespace-nowrap text-xs text-ink-soft">{fmtDateTime(l.created_at)}</td>
                <td className="font-medium text-ink">{l.action}</td>
                <td className="text-ink-soft">{l.entity ?? "—"}</td>
                <td className="text-xs text-ink-soft">{(l.profiles as unknown as { email: string } | null)?.email ?? "system"}</td>
              </tr>
            ))}
          </Table>
        )}
      </div>
    </>
  );
}
