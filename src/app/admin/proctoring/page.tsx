import { Badge, Card, PageTitle, StatCard } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { fmtDate, fmtDateTime } from "@/lib/utils";
import type { Metadata } from "next";
import { adminReviewIncident } from "../actions";

export const metadata: Metadata = { title: "Proctoring" };
export const dynamic = "force-dynamic";

const sevTone = (s: string) => (s === "high" ? "red" : s === "medium" ? "amber" : "gray") as "red" | "amber" | "gray";
const stTone = (s: string) =>
  (s === "valid" ? "red" : s === "invalid" ? "green" : s === "investigating" ? "amber" : "gray") as "red" | "green" | "amber" | "gray";

export default async function AdminProctoring({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const admin = createAdminClient();

  const [incidents, rooms, recordings, openCount, roomsCount] = await Promise.all([
    admin
      .from("proctoring_incidents")
      .select("*, exams(title, organizations(name))")
      .order("created_at", { ascending: false })
      .limit(100),
    admin.from("proctoring_rooms").select("*, exams(title)").order("created_at", { ascending: false }).limit(20),
    admin.from("proctoring_recordings").select("*").order("created_at", { ascending: false }).limit(20),
    admin.from("proctoring_incidents").select("id", { count: "exact", head: true }).eq("status", "open"),
    admin.from("proctoring_rooms").select("id", { count: "exact", head: true }),
  ]);

  return (
    <>
      <PageTitle
        title="Proctoring oversight"
        subtitle="Platform-wide view of video-proctoring rooms, supervisor incident reports and recording metadata. Incidents are observations for human review — never automatic proof of misconduct."
      />
      {sp.saved && <p className="mb-4 rounded-lg bg-evergreen-50 px-4 py-3 text-sm text-evergreen-900">Review saved and audit-logged.</p>}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Open incidents" value={openCount.count ?? 0} />
        <StatCard label="Proctoring rooms created" value={roomsCount.count ?? 0} />
        <StatCard label="Recordings (metadata)" value={(recordings.data ?? []).length} hint="Egress recording activates once storage + retention are configured" />
      </div>

      <h2 className="mb-3 font-display text-lg font-semibold text-evergreen-950">Incident reports</h2>
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[920px] text-sm">
          <thead>
            <tr className="border-b border-evergreen-900/10 bg-evergreen-50 text-left">
              <th className="px-4 py-3 font-semibold">Incident</th>
              <th className="px-4 py-3 font-semibold">Examination / Organization</th>
              <th className="px-4 py-3 font-semibold">Severity</th>
              <th className="px-4 py-3 font-semibold">Reported</th>
              <th className="px-4 py-3 font-semibold">Review</th>
              <th className="px-4 py-3 font-semibold">Set review</th>
            </tr>
          </thead>
          <tbody>
            {(incidents.data ?? []).map((i) => {
              const ex = i.exams as { title?: string; organizations?: { name?: string } | null } | null;
              return (
                <tr key={i.id} className="border-b border-evergreen-900/10">
                  <td className="max-w-xs px-4 py-2.5">
                    <span className="font-medium">{i.type}</span>
                    {i.note && <span className="block text-xs text-ink-soft" title={i.note}>{i.note}</span>}
                  </td>
                  <td className="px-4 py-2.5 text-ink-soft">{ex?.title ?? "—"}{ex?.organizations?.name ? ` · ${ex.organizations.name}` : ""}</td>
                  <td className="px-4 py-2.5"><Badge tone={sevTone(i.severity)}>{i.severity}</Badge></td>
                  <td className="px-4 py-2.5 text-ink-soft">{fmtDateTime(i.created_at)}</td>
                  <td className="px-4 py-2.5"><Badge tone={stTone(i.status)}>{i.status}</Badge></td>
                  <td className="px-4 py-2.5">
                    <form action={adminReviewIncident} className="flex items-center gap-1.5">
                      <input type="hidden" name="id" value={i.id} />
                      <select name="status" defaultValue={i.status} className="rounded-lg border border-evergreen-900/55 bg-white px-2 py-1.5 text-xs">
                        <option value="open">open</option>
                        <option value="investigating">investigating</option>
                        <option value="valid">valid</option>
                        <option value="invalid">invalid</option>
                      </select>
                      <button className="text-xs font-medium text-evergreen-700 underline-offset-2 hover:underline">Apply</button>
                    </form>
                  </td>
                </tr>
              );
            })}
            {(incidents.data ?? []).length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-ink-soft">No incidents reported yet.</td></tr>
            )}
          </tbody>
        </table>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="font-display text-lg font-semibold text-evergreen-950">Recent rooms</h2>
          {(rooms.data ?? []).length === 0 ? (
            <p className="mt-2 text-sm text-ink-soft">No proctoring rooms yet.</p>
          ) : (
            <ul className="mt-2 divide-y divide-evergreen-900/10 text-sm">
              {(rooms.data ?? []).map((r) => (
                <li key={r.id} className="flex items-center justify-between py-2">
                  <span className="font-mono text-xs">{r.room_name}</span>
                  <span className="text-ink-soft">{(r.exams as { title?: string } | null)?.title ?? ""} · {fmtDate(r.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="p-5">
          <h2 className="font-display text-lg font-semibold text-evergreen-950">Recordings</h2>
          {(recordings.data ?? []).length === 0 ? (
            <p className="mt-2 text-sm text-ink-soft">
              No recordings stored. LiveKit egress is intentionally not enabled until an S3-compatible
              target and a retention policy are chosen (see docs/INFRASTRUCTURE.md).
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-evergreen-900/10 text-sm">
              {(recordings.data ?? []).map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 py-2">
                  <Badge tone="gray">{r.status}</Badge>
                  <span className="font-mono text-xs">{r.room_name}</span>
                  <span className="ml-auto text-xs text-ink-soft">
                    {fmtDate(r.created_at)}{r.retention_until ? ` · retain until ${fmtDate(r.retention_until)}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
