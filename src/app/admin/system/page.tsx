import { Badge, ButtonLink, Card, PageTitle, StatCard } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/utils";
import { Activity, Database, HardDrive, ShieldCheck, Users } from "lucide-react";
import type { Metadata } from "next";
import { Section, Table } from "../ui";

export const metadata: Metadata = { title: "System Health" };
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

  const integrations: { name: string; scope: string; ok: boolean; note: string }[] = [
    {
      name: "Supabase PostgREST, Auth & Storage",
      scope: "Primary data plane",
      ok: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      note: "Public endpoint and anon key configured",
    },
    {
      name: "Supabase Service Role (Server-only)",
      scope: "Privileged server operations",
      ok: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      note: "Required for candidate token verification & Super Admin control plane",
    },
    {
      name: "LiveKit Cloud Real-Time Video",
      scope: "Online proctoring rooms",
      ok: Boolean(process.env.NEXT_PUBLIC_LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET),
      note: "Room tokens minted server-side; signing secret never leaves the server",
    },
    {
      name: "Canonical Public App Origin",
      scope: "Portal, invite & QR URLs",
      ok: Boolean(process.env.NEXT_PUBLIC_APP_URL),
      note: process.env.NEXT_PUBLIC_APP_URL ?? "Not set — invite/QR links fall back to relative paths",
    },
  ];

  const sortedTables = stats ? [...stats.tables].sort((a, b) => b.rows - a.rows) : [];
  const totalRows = sortedTables.reduce((sum, t) => sum + t.rows, 0);
  const maxRows = Math.max(1, sortedTables[0]?.rows ?? 1);

  return (
    <>
      <PageTitle
        eyebrow="Platform Administration · Infrastructure & Telemetry"
        title="System health & technical monitoring"
        subtitle="Live PostgreSQL storage footprint, authentication volume, table row distribution and server-side integration readiness."
        action={
          <>
            <ButtonLink href="/api/health" variant="outline">Health JSON</ButtonLink>
            <ButtonLink href="/admin/modules" variant="outline">Feature switches</ButtonLink>
          </>
        }
      />

      {error || !stats ? (
        <Card className="border-red-300 bg-red-50 p-5 text-sm text-red-900" role="alert">
          <p className="font-semibold">Live database telemetry is temporarily unavailable</p>
          <p className="mt-1">{error?.message ?? "No statistics payload returned."} Core application routes and examination services continue operating normally.</p>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Database footprint" value={human(stats.database_bytes)} hint="PostgreSQL live relation size" icon={<Database className="h-5 w-5" />} />
            <StatCard label="Auth identities" value={stats.auth_users.toLocaleString()} hint="Supabase Auth accounts" icon={<Users className="h-5 w-5" />} />
            <StatCard label="Object storage" value={stats.storage_objects.toLocaleString()} hint={`${human(stats.storage_bytes)} stored media & assets`} icon={<HardDrive className="h-5 w-5" />} />
            <StatCard label="Tracked tables" value={stats.tables.length} hint={`${totalRows.toLocaleString()} total rows · ${fmtDateTime(stats.generated_at)}`} icon={<Activity className="h-5 w-5" />} />
          </div>

          <Section title="Environment & service integrations" hint="Verifies presence of server runtime configuration without exposing secret values.">
            <div className="grid gap-4 md:grid-cols-2">
              {integrations.map((i) => (
                <Card key={i.name} className="flex items-start justify-between gap-4 p-5">
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">{i.scope}</p>
                    <h3 className="mt-1 font-display text-base font-semibold text-evergreen-950">{i.name}</h3>
                    <p className="mt-1 break-all text-xs text-ink-soft">{i.note}</p>
                  </div>
                  <Badge tone={i.ok ? "green" : "red"} className="shrink-0">
                    <ShieldCheck className="h-3.5 w-3.5" /> {i.ok ? "Configured" : "Missing"}
                  </Badge>
                </Card>
              ))}
            </div>
          </Section>

          <Section title="PostgreSQL table cardinality" hint="Exact live row counts sorted by volume to highlight storage and indexing hotspots.">
            <Table head={["Relation / Table", "Exact rows", "Share of tracked rows", "Relative volume"]}>
              {sortedTables.map((t) => {
                const share = totalRows > 0 ? ((t.rows / totalRows) * 100).toFixed(1) : "0.0";
                const barWidth = Math.max(2, Math.round((t.rows / maxRows) * 100));
                return (
                  <tr key={t.table}>
                    <td className="font-mono text-xs font-semibold text-evergreen-950">{t.table}</td>
                    <td className="font-semibold tabular-nums text-ink">{t.rows.toLocaleString()}</td>
                    <td className="tabular-nums text-xs text-ink-soft">{share}%</td>
                    <td className="w-56">
                      <div className="h-2 overflow-hidden rounded-full bg-evergreen-900/10">
                        <div className="h-full rounded-full bg-evergreen-600" style={{ width: `${barWidth}%` }} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </Table>
          </Section>
        </>
      )}
    </>
  );
}
