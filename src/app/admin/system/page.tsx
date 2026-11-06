import { Badge, Card, PageTitle, StatCard } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/utils";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Technical Monitoring" };
export const dynamic = "force-dynamic";

interface Stats {
  database_bytes: number;
  auth_users: number;
  storage_objects: number;
  storage_bytes: number;
  tables: { table: string; rows: number }[];
  generated_at: string;
}

const human = (b: number) =>
  b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(2)} GB` : b >= 1024 ** 2 ? `${(b / 1024 ** 2).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`;

export default async function AdminSystem() {
  await requireSuperAdmin();
  // Session client: the RPC verifies is_super_admin() against this JWT.
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_platform_stats");
  const stats = (error ? null : (data as unknown as Stats)) ?? null;

  const integrations: { name: string; ok: boolean; note: string }[] = [
    { name: "Supabase (database, auth, storage)", ok: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY), note: "Client configuration present" },
    { name: "Supabase service role (server)", ok: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY), note: "Required for guest flows & admin operations" },
    { name: "LiveKit Cloud (video proctoring)", ok: Boolean(process.env.NEXT_PUBLIC_LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET), note: "Tokens are minted server-side; the secret never reaches browsers" },
    { name: "Public app URL", ok: Boolean(process.env.NEXT_PUBLIC_APP_URL), note: process.env.NEXT_PUBLIC_APP_URL ?? "Not set — invite/QR links fall back to relative paths" },
  ];

  return (
    <>
      <PageTitle
        title="Technical monitoring"
        subtitle="Live database and storage figures from PostgreSQL itself. For request-level errors and function logs, use the Vercel and Supabase dashboards (linked from docs/INFRASTRUCTURE.md)."
      />

      {error || !stats ? (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">
          Platform statistics are unavailable right now ({error?.message ?? "no data"}). The statistics function may still be propagating.
        </p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Database size" value={human(stats.database_bytes)} hint="Free plan allowance: 500 MB" />
            <StatCard label="Auth accounts" value={stats.auth_users} />
            <StatCard label="Stored files" value={stats.storage_objects} hint={`${human(stats.storage_bytes)} in storage (free plan: 1 GB)`} />
            <StatCard label="Tables tracked" value={stats.tables.length} hint={`as of ${fmtDateTime(stats.generated_at)}`} />
          </div>

          <Card className="mt-6 overflow-x-auto p-0">
            <h2 className="px-5 pt-5 font-display text-lg font-semibold text-evergreen-950">Rows per table (exact)</h2>
            <table className="mt-3 w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-y border-evergreen-900/10 bg-evergreen-50 text-left">
                  <th className="px-4 py-3 font-semibold">Table</th>
                  <th className="px-4 py-3 font-semibold">Rows</th>
                </tr>
              </thead>
              <tbody>
                {[...stats.tables].sort((a, b) => b.rows - a.rows).map((t) => (
                  <tr key={t.table} className="border-b border-evergreen-900/10">
                    <td className="px-4 py-2 font-mono text-xs">{t.table}</td>
                    <td className="px-4 py-2 tabular-nums">{t.rows.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}

      <Card className="mt-6 p-6">
        <h2 className="font-display text-lg font-semibold text-evergreen-950">Integration status</h2>
        <p className="mt-1 text-sm text-ink-soft">Presence of server configuration only — secret values are never displayed.</p>
        <ul className="mt-3 divide-y divide-evergreen-900/10 text-sm">
          {integrations.map((i) => (
            <li key={i.name} className="flex flex-wrap items-center gap-2 py-2.5">
              <Badge tone={i.ok ? "green" : "red"}>{i.ok ? "Configured" : "Missing"}</Badge>
              <span className="font-medium">{i.name}</span>
              <span className="text-ink-soft">— {i.note}</span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
