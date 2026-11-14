import { PageNavigation } from "@/components/PageNavigation";
import { Badge, Button, ButtonLink, Input, PageTitle, Select, StatCard } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { COMPETITION_FORMATS } from "@/lib/brand";
import { createAdminClient } from "@/lib/supabase/server";
import { fmtDate, fmtDateTime } from "@/lib/utils";
import { Trophy, Users, Wifi } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { adminEndSession } from "../actions";
import { Notice, Section, StatusBadge, Table } from "../ui";

export const metadata: Metadata = { title: "Competitions" };
export const dynamic = "force-dynamic";

const FORMAT_LABELS = Object.fromEntries(COMPETITION_FORMATS.map((f) => [f.value, f.label]));

export default async function AdminCompetitions({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; org?: string; sstatus?: string; page?: string; ok?: string; e?: string; saved?: string }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const pageSize = 25;
  const admin = createAdminClient();

  let compQuery = admin
    .from("competitions")
    .select("*, organizations(name), quizzes(title), competition_registrations(id, status), competition_access_codes(id)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (sp.q) compQuery = compQuery.ilike("title", `%${sp.q}%`);
  if (sp.status) compQuery = compQuery.eq("status", sp.status);
  if (sp.org) compQuery = compQuery.eq("organization_id", sp.org);

  let sessionQuery = admin
    .from("quiz_sessions")
    .select("*, organizations(name), quizzes(title), session_participants(count)")
    .order("created_at", { ascending: false })
    .limit(50);
  if (sp.sstatus) sessionQuery = sessionQuery.eq("status", sp.sstatus);

  const head = { count: "exact" as const, head: true };
  const [{ data: comps }, { data: sessions }, { data: orgs }, totalComps, liveNow, regTotal] = await Promise.all([
    compQuery,
    sessionQuery,
    admin.from("organizations").select("id, name").order("name").limit(500),
    admin.from("competitions").select("id", head).then((r) => r.count ?? 0),
    admin.from("quiz_sessions").select("id", head).eq("status", "live").then((r) => r.count ?? 0),
    admin.from("competition_registrations").select("id", head).neq("status", "removed").then((r) => r.count ?? 0),
  ]);

  const pagedComps = (comps ?? []).slice((page - 1) * pageSize, page * pageSize);

  return (
    <>
      <PageTitle
        eyebrow="Live Competitions · Global Registry & Sessions"
        title="Competitions"
        subtitle="Create and run live competitions end-to-end: configuration, access codes, registrations, live control and published results."
        action={
          <>
            <ButtonLink href="/admin/competitions/events" variant="outline">Multi-phase events</ButtonLink>
            <ButtonLink href="/admin/competitions/live" variant="outline">Live operations</ButtonLink>
            <ButtonLink href="/admin/competitions/new" variant="gold">+ Create competition</ButtonLink>
          </>
        }
      />
      <Notice
        ok={sp.ok}
        e={sp.e}
        messages={{
          deleted: "Competition deleted.",
          confirm: "Tick the confirmation box before ending a session.",
        }}
      />
      {sp.saved && <p className="mb-4 rounded-lg bg-evergreen-50 px-4 py-3 text-sm text-evergreen-900">Done — the change is in the audit log.</p>}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Competitions" value={totalComps} icon={<Trophy className="h-5 w-5" />} />
        <StatCard label="Live right now" value={liveNow} icon={<Wifi className="h-5 w-5" />} />
        <StatCard label="Registrations" value={regTotal} icon={<Users className="h-5 w-5" />} />
      </div>

      <form method="get" className="mb-5 flex flex-wrap items-end gap-2">
        <div className="min-w-[220px] flex-1">
          <Input name="q" defaultValue={sp.q} placeholder="Search competitions…" aria-label="Search competitions" />
        </div>
        <Select name="org" defaultValue={sp.org ?? ""} className="w-56" aria-label="Filter by organization">
          <option value="">All organizations</option>
          {(orgs ?? []).map((o) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </Select>
        <Select name="status" defaultValue={sp.status ?? ""} className="w-44" aria-label="Filter by status">
          <option value="">All statuses</option>
          {["draft", "published", "scheduled", "live", "paused", "ended", "cancelled", "archived"].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </Select>
        <Button type="submit" variant="outline">Filter</Button>
        {(sp.q || sp.org || sp.status) && (
          <Link href="/admin/competitions" className="inline-flex min-h-10 items-center px-2.5 text-sm font-medium text-evergreen-800 underline underline-offset-2">
            Reset
          </Link>
        )}
      </form>

      {(comps ?? []).length === 0 ? (
        <p className="rounded-2xl border border-dashed border-evergreen-900/30 bg-paper px-6 py-12 text-center text-sm text-ink-soft">
          No competitions yet.{" "}
          <Link href="/admin/competitions/new" className="font-semibold text-evergreen-700 underline underline-offset-2">
            Create the first competition
          </Link>{" "}
          — pick a quiz, set the window, share a code.
        </p>
      ) : (
        <>
          <Table head={["Competition", "Host organization", "Format", "Schedule", "Participants", "Status", "Actions"]}>
            {pagedComps.map((c) => {
            const regs = ((c.competition_registrations as { status: string }[]) ?? []).filter((r) => r.status !== "removed").length;
            return (
              <tr key={c.id}>
                <td>
                  <Link href={`/admin/competitions/${c.id}`} className="font-semibold text-evergreen-900 hover:underline">{c.title}</Link>
                  <span className="block text-xs text-ink-soft">
                    {c.category} · {(c.quizzes as unknown as { title: string } | null)?.title ?? "no quiz attached"} · {(c.competition_access_codes as unknown[])?.length ?? 0} code(s)
                  </span>
                </td>
                <td className="text-ink-soft">{(c.organizations as unknown as { name: string } | null)?.name ?? "—"}</td>
                <td className="text-xs">{FORMAT_LABELS[c.format] ?? c.format}</td>
                <td className="text-xs text-ink-soft">
                  {c.starts_at ? fmtDate(c.starts_at) : "unscheduled"}
                  {c.ends_at ? ` → ${fmtDate(c.ends_at)}` : ""}
                </td>
                <td className="tabular-nums">{regs}</td>
                <td><StatusBadge status={c.status} /></td>
                <td>
                  <div className="flex gap-3">
                    <Link href={`/admin/competitions/${c.id}`} className="font-medium text-evergreen-700 underline-offset-2 hover:underline">Manage</Link>
                    <Link href={`/admin/competitions/${c.id}?tab=codes`} className="font-medium text-gold-800 underline-offset-2 hover:underline">Codes</Link>
                    <Link href={`/admin/competitions/${c.id}?tab=results`} className="font-medium text-evergreen-700 underline-offset-2 hover:underline">Results</Link>
                  </div>
                </td>
              </tr>
            );
          })}
          </Table>
          <PageNavigation
            page={page}
            pageSize={pageSize}
            total={(comps ?? []).length}
            pathname="/admin/competitions"
            query={{ q: sp.q, org: sp.org, status: sp.status, sstatus: sp.sstatus }}
            label="competitions"
          />
        </>
      )}

      <Section
        title="Live session operations"
        hint="Every running session on the platform — including ad-hoc quizzes launched by organizations. Ending stops play immediately for everyone."
      >
        <form method="get" className="mb-4 flex gap-2">
          <Select name="sstatus" defaultValue={sp.sstatus ?? ""} className="w-48" aria-label="Filter sessions by status">
            <option value="">All sessions</option>
            <option value="live">Live now</option>
            <option value="lobby">Lobby</option>
            <option value="paused">Paused</option>
            <option value="ended">Ended</option>
          </Select>
          <Button type="submit" variant="outline">Filter sessions</Button>
        </form>
        <Table head={["Session", "Organization", "Mode", "Participants", "Status", "Created", "Emergency control"]}>
          {(sessions ?? []).map((s) => (
            <tr key={s.id}>
              <td>
                <span className="font-medium">{s.title || (s.quizzes as unknown as { title?: string } | null)?.title || "Live session"}</span>
                <span className="block font-mono text-xs text-ink-soft">code {s.join_code}</span>
              </td>
              <td className="text-ink-soft">{(s.organizations as unknown as { name?: string } | null)?.name ?? "—"}</td>
              <td className="text-ink-soft">{s.mode === "synchronized" ? "Synchronized" : "Self-paced"}</td>
              <td className="tabular-nums">{(s.session_participants as unknown as { count: number }[] | null)?.[0]?.count ?? 0}</td>
              <td><Badge tone={s.status === "live" ? "green" : s.status === "lobby" ? "amber" : "gray"}>{s.status}</Badge></td>
              <td className="text-ink-soft">{fmtDateTime(s.created_at)}</td>
              <td>
                {s.status !== "ended" && (
                  <form action={adminEndSession} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={s.id} />
                    <label className="flex items-center gap-1 text-xs text-ink-soft">
                      <input type="checkbox" name="confirm" required className="h-4 w-4 accent-red-700" /> sure?
                    </label>
                    <button className="font-medium text-red-700 underline-offset-2 hover:underline">End</button>
                  </form>
                )}
              </td>
            </tr>
          ))}
          {(sessions ?? []).length === 0 && (
            <tr><td colSpan={7} className="px-4 py-8 text-center text-ink-soft">No sessions match this filter.</td></tr>
          )}
        </Table>
      </Section>
    </>
  );
}
