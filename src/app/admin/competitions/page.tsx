import { Badge, Button, Card, Input, PageTitle } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/utils";
import type { Metadata } from "next";
import { adminEndSession } from "../actions";

export const metadata: Metadata = { title: "Competitions" };
export const dynamic = "force-dynamic";

const tone = (s: string) => (s === "live" ? "green" : s === "lobby" ? "amber" : "gray") as "green" | "amber" | "gray";

export default async function AdminCompetitions({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; saved?: string; e?: string }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const admin = createAdminClient();

  let query = admin
    .from("quiz_sessions")
    .select("*, organizations(name), quizzes(title), session_participants(count)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (sp.status) query = query.eq("status", sp.status);
  if (sp.q) query = query.or(`join_code.ilike.%${sp.q}%,title.ilike.%${sp.q}%`);
  const { data: sessions } = await query;
  const liveCount = (sessions ?? []).filter((s) => s.status === "live").length;

  return (
    <>
      <PageTitle
        title="Competitions — live sessions"
        subtitle="Every live quiz / competition session on the platform, across all organizations. Ending a session stops it for all participants immediately."
      />
      {sp.saved && <p className="mb-4 rounded-lg bg-evergreen-50 px-4 py-3 text-sm text-evergreen-900">Done — the change is in the audit log.</p>}
      {sp.e === "confirm" && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">Tick the confirmation box before ending a session.</p>}

      <form method="get" className="mb-4 flex flex-wrap gap-2">
        <Input name="q" defaultValue={sp.q} placeholder="Search join code or title…" className="max-w-sm" />
        <select name="status" defaultValue={sp.status ?? ""} className="rounded-lg border border-evergreen-900/55 bg-white px-3 py-2.5 text-sm">
          <option value="">All statuses</option>
          <option value="live">Live now</option>
          <option value="lobby">Lobby</option>
          <option value="paused">Paused</option>
          <option value="ended">Ended</option>
        </select>
        <Button type="submit" variant="outline">Filter</Button>
        <span className="ml-auto self-center text-sm text-ink-soft">{liveCount} live in this view · {(sessions ?? []).length} shown</span>
      </form>

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-evergreen-900/10 bg-evergreen-50 text-left">
              <th className="px-4 py-3 font-semibold">Session</th>
              <th className="px-4 py-3 font-semibold">Organization</th>
              <th className="px-4 py-3 font-semibold">Mode</th>
              <th className="px-4 py-3 font-semibold">Participants</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Created</th>
              <th className="px-4 py-3 font-semibold"></th>
            </tr>
          </thead>
          <tbody>
            {(sessions ?? []).map((s) => (
              <tr key={s.id} className="border-b border-evergreen-900/10">
                <td className="px-4 py-2.5">
                  <span className="font-medium">{s.title || (s.quizzes as { title?: string } | null)?.title || "Live session"}</span>
                  <span className="block font-mono text-xs text-ink-soft">code {s.join_code}</span>
                </td>
                <td className="px-4 py-2.5 text-ink-soft">{(s.organizations as { name?: string } | null)?.name ?? "—"}</td>
                <td className="px-4 py-2.5 text-ink-soft">{s.mode === "synchronized" ? "Synchronized" : "Self-paced"}</td>
                <td className="px-4 py-2.5 tabular-nums">{(s.session_participants as { count: number }[] | null)?.[0]?.count ?? 0}</td>
                <td className="px-4 py-2.5"><Badge tone={tone(s.status)}>{s.status}</Badge></td>
                <td className="px-4 py-2.5 text-ink-soft">{fmtDateTime(s.created_at)}</td>
                <td className="px-4 py-2.5">
                  {s.status !== "ended" && (
                    <form action={adminEndSession} className="flex items-center gap-2">
                      <input type="hidden" name="id" value={s.id} />
                      <label className="flex items-center gap-1 text-xs text-ink-soft">
                        <input type="checkbox" name="confirm" required className="h-4 w-4 accent-red-700" /> sure?
                      </label>
                      <button className="text-sm font-medium text-red-700 underline-offset-2 hover:underline">End</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {(sessions ?? []).length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-ink-soft">No sessions match this filter.</td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </>
  );
}
