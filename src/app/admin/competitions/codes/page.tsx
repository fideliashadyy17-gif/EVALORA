import { PageNavigation } from "@/components/PageNavigation";
import { Badge, Button, ButtonLink, Input, PageTitle, Select, StatCard } from "@/components/ui";
import { ExportButton } from "@/components/ExportTools";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { fmtDateTime, toCsv } from "@/lib/utils";
import { KeyRound, ShieldCheck, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { accessCodeOp } from "../../actions/competitions";
import { ConfirmField, Section, StatusBadge, Table } from "../../ui";

export const metadata: Metadata = { title: "Competition access codes" };
export const dynamic = "force-dynamic";

interface Usage {
  id: string;
  full_name: string;
  participant_ref: string | null;
  status: string;
  created_at: string;
}

export default async function CompetitionCodesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; comp?: string; state?: string; page?: string }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const pageSize = 25;
  const admin = createAdminClient();

  let query = admin
    .from("competition_access_codes")
    .select("*, competitions(id, title, status, organization_id, organizations(name)), organizations(name), classes(name, organizations(name)), competition_registrations(id, full_name, participant_ref, status, created_at)")
    .order("created_at", { ascending: false })
    .limit(500);
  if (sp.comp) query = query.eq("competition_id", sp.comp);
  if (sp.q) query = query.or(`code.ilike.%${sp.q}%,label.ilike.%${sp.q}%`);

  const [{ data: codes }, { data: comps }, { data: compSessions }] = await Promise.all([
    query,
    admin.from("competitions").select("id, title").order("created_at", { ascending: false }).limit(300),
    admin.from("competitions").select("id, title, status, session_id").not("session_id", "is", null).limit(300),
  ]);

  const sessionIds = (compSessions ?? []).map((c) => c.session_id).filter(Boolean) as string[];
  const { data: sessions } = sessionIds.length
    ? await admin.from("quiz_sessions").select("id, join_code, status, mode, created_at").in("id", sessionIds)
    : { data: [] };
  const sessionById = new Map((sessions ?? []).map((s) => [s.id, s]));
  const now = Date.now();

  const decorated = (codes ?? []).map((c) => {
    const usages = ((c.competition_registrations as Usage[]) ?? []).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    const activeUses = usages.filter((u) => u.status !== "removed").length;
    const expired = c.expires_at ? Date.parse(c.expires_at) <= now : false;
    const exhausted = c.max_uses != null && activeUses >= c.max_uses;
    const state = !c.is_active ? "disabled" : expired ? "expired" : exhausted ? "exhausted" : "active";
    return { c, usages, activeUses, expired, exhausted, state };
  }).filter(({ state }) => !sp.state || state === sp.state);

  const csv = toCsv([
    ["Code", "Label", "Competition", "Restricted organization", "Restricted class", "Active uses", "Max uses", "Expires", "State"],
    ...decorated.map(({ c, activeUses, state }) => [
      c.code, c.label ?? "",
      (c.competitions as unknown as { title?: string } | null)?.title ?? "",
      (c.organizations as unknown as { name?: string } | null)?.name ?? "Any eligible organization",
      (c.classes as unknown as { name?: string } | null)?.name ?? "Any class",
      activeUses, c.max_uses ?? "Unlimited", c.expires_at ? fmtDateTime(c.expires_at) : "Never", state,
    ]),
  ]);

  const pagedCodes = decorated.slice((page - 1) * pageSize, page * pageSize);

  return (
    <>
      <PageTitle
        eyebrow="Live Competitions · Eligibility & Session Credentials"
        title="Competition access codes"
        subtitle="Eligibility codes are stored per competition, can be restricted to an organization or class, capped by uses, expired, disabled, regenerated or revoked. The live-session join code is a separate short-lived credential."
        action={<ExportButton filename="competition-access-codes.csv" csv={csv} label="Export codes" />}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Codes shown" value={decorated.length} icon={<KeyRound className="h-5 w-5" />} />
        <StatCard label="Currently usable" value={decorated.filter((d) => d.state === "active").length} icon={<ShieldCheck className="h-5 w-5" />} />
        <StatCard label="Disabled / expired / exhausted" value={decorated.filter((d) => d.state !== "active").length} icon={<TriangleAlert className="h-5 w-5" />} />
        <StatCard label="Recorded uses" value={decorated.reduce((sum, d) => sum + d.activeUses, 0)} icon={<KeyRound className="h-5 w-5" />} />
      </div>

      <form method="get" className="mb-5 flex flex-wrap items-end gap-2">
        <div className="min-w-[220px] flex-1"><Input name="q" defaultValue={sp.q} placeholder="Search code or label…" aria-label="Search access codes" /></div>
        <Select name="comp" defaultValue={sp.comp ?? ""} className="w-64" aria-label="Competition">
          <option value="">All competitions</option>
          {(comps ?? []).map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </Select>
        <Select name="state" defaultValue={sp.state ?? ""} className="w-48" aria-label="Code state">
          <option value="">All code states</option>
          <option value="active">Usable</option>
          <option value="disabled">Disabled</option>
          <option value="expired">Expired</option>
          <option value="exhausted">Use limit reached</option>
        </Select>
        <Button type="submit" variant="outline">Filter</Button>
        {(sp.q || sp.comp || sp.state) && (
          <Link href="/admin/competitions/codes" className="inline-flex min-h-10 items-center px-2.5 text-sm font-medium text-evergreen-800 underline underline-offset-2">
            Reset
          </Link>
        )}
      </form>

      {decorated.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-evergreen-900/30 bg-paper px-6 py-12 text-center text-sm text-ink-soft">No competition access codes match.</p>
      ) : (
        <>
          <Table head={["Code", "Competition", "Eligibility restriction", "Usage", "Expiry", "State", "Actions"]}>
            {pagedCodes.map(({ c, usages, activeUses, state }) => {
            const comp = c.competitions as unknown as { id: string; title: string; status: string; organizations: { name: string } | null } | null;
            const restrictedOrg = (c.organizations as unknown as { name: string } | null)?.name;
            const restrictedClass = c.classes as unknown as { name: string; organizations: { name: string } | null } | null;
            return (
              <tr key={c.id}>
                <td><span className="font-mono text-base font-bold tracking-wider">{c.code}</span><span className="block text-xs text-ink-soft">{c.label || "No label"}</span></td>
                <td>{comp ? <Link href={`/admin/competitions/${comp.id}?tab=codes`} className="font-medium text-evergreen-800 hover:underline">{comp.title}</Link> : "—"}<span className="block text-xs text-ink-soft">{comp?.organizations?.name} · {comp?.status}</span></td>
                <td className="text-ink-soft">{restrictedOrg ?? "Any eligible organization"}<span className="block text-xs">{restrictedClass ? `${restrictedClass.name}${restrictedClass.organizations?.name ? ` · ${restrictedClass.organizations.name}` : ""}` : "Any class"}</span></td>
                <td>
                  <span className="tabular-nums">{activeUses}{c.max_uses != null ? ` / ${c.max_uses}` : " uses"}</span>
                  {usages.length > 0 && (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-xs font-medium text-evergreen-700">Usage history</summary>
                      <ul className="mt-1 max-h-32 space-y-1 overflow-y-auto text-xs text-ink-soft">
                        {usages.slice(0, 20).map((u) => <li key={u.id}>{u.full_name}{u.participant_ref ? ` (${u.participant_ref})` : ""} · {u.status} · {fmtDateTime(u.created_at)}</li>)}
                      </ul>
                    </details>
                  )}
                </td>
                <td className="text-ink-soft">{c.expires_at ? fmtDateTime(c.expires_at) : "Never"}</td>
                <td><Badge tone={state === "active" ? "green" : state === "disabled" ? "gray" : "red"}>{state}</Badge></td>
                <td>
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {comp && <Link href={`/admin/competitions/${comp.id}?tab=codes&edit_code=${c.id}`} className="font-medium text-evergreen-700 hover:underline">Edit</Link>}
                    <form action={accessCodeOp}>
                      <input type="hidden" name="competition_id" value={c.competition_id} />
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="op" value="toggle" />
                      <button className="font-medium text-evergreen-700 hover:underline">{c.is_active ? "Disable" : "Activate"}</button>
                    </form>
                    <form action={accessCodeOp}>
                      <input type="hidden" name="competition_id" value={c.competition_id} />
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="op" value="regenerate" />
                      <button className="font-medium text-gold-800 hover:underline">Regenerate</button>
                    </form>
                  </div>
                  <form action={accessCodeOp} className="mt-2 flex items-center gap-2">
                    <input type="hidden" name="competition_id" value={c.competition_id} />
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="op" value="revoke" />
                    <ConfirmField label="Revoke" />
                    <button className="font-medium text-red-700 hover:underline">Revoke</button>
                  </form>
                </td>
              </tr>
            );
          })}
          </Table>
          <PageNavigation
            page={page}
            pageSize={pageSize}
            total={decorated.length}
            pathname="/admin/competitions/codes"
            query={{ q: sp.q, comp: sp.comp, state: sp.state }}
            label="access codes"
          />
        </>
      )}

      <Section title="Live-session join codes" hint="These admit participants into an already-open session and can be regenerated from the competition's Codes tab.">
        {(compSessions ?? []).length === 0 ? (
          <p className="text-sm text-ink-soft">No competition has a linked live session yet.</p>
        ) : (
          <Table head={["Competition", "Session join code", "Session status", "Mode", "Opened", "Manage"]}>
            {(compSessions ?? []).map((c) => {
              const s = c.session_id ? sessionById.get(c.session_id) : undefined;
              return (
                <tr key={c.id}>
                  <td className="font-medium">{c.title}</td>
                  <td className="font-mono font-bold tracking-widest">{s?.join_code ?? "—"}</td>
                  <td>{s ? <StatusBadge status={s.status} /> : "—"}</td>
                  <td className="capitalize">{s?.mode.replace(/_/g, " ") ?? "—"}</td>
                  <td className="text-ink-soft">{s ? fmtDateTime(s.created_at) : "—"}</td>
                  <td><Link href={`/admin/competitions/${c.id}?tab=codes`} className="font-medium text-evergreen-700 hover:underline">Codes →</Link></td>
                </tr>
              );
            })}
          </Table>
        )}
        <ButtonLink href="/admin/competitions/live" variant="outline" className="mt-4">Open live monitoring</ButtonLink>
      </Section>
    </>
  );
}
