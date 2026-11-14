import { PageNavigation } from "@/components/PageNavigation";
import { Badge, Button, ButtonLink, Card, DataTable, PageTitle, StatCard } from "@/components/ui";
import { activeOrg, can, CREATOR_ROLES, MANAGER_ROLES, requireUser } from "@/lib/auth";
import { COMPETITION_FORMATS } from "@/lib/brand";
import { createClient } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/utils";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteDraftCompetition, setOrgCompetitionStatus } from "../actions";

export const metadata: Metadata = { title: "Competition" };
export const dynamic = "force-dynamic";

const FORMAT_LABELS = Object.fromEntries(COMPETITION_FORMATS.map((f) => [f.value, f.label]));

/**
 * One competition, read inside the active organization. The query is scoped by
 * organization_id as well as id, so a guessed competition id from another
 * tenant resolves to nothing.
 */
export default async function OrganizationCompetitionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const pageSize = 25;
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  const supabase = await createClient();

  const { data: comp } = await supabase
    .from("competitions")
    .select("id, title, description, format, status, session_id, quiz_id, max_participants, results_published, created_at, quizzes(title)")
    .eq("id", id)
    .eq("organization_id", org.id)
    .maybeSingle();
  if (!comp) notFound();

  const [{ data: codes }, { data: registrations }] = await Promise.all([
    supabase
      .from("competition_access_codes")
      .select("id, code, label, is_active, max_uses, expires_at, created_at")
      .eq("competition_id", comp.id)
      .eq("organization_id", org.id)
      .order("created_at"),
    supabase
      .from("competition_registrations")
      .select("id, full_name, participant_ref, status, source, created_at")
      .eq("competition_id", comp.id)
      .eq("organization_id", org.id)
      .order("created_at", { ascending: false })
      .limit(300),
  ]);

  const canManage = can(ctx, org.id, CREATOR_ROLES);
  const isManager = can(ctx, org.id, MANAGER_ROLES);
  const active = (registrations ?? []).filter((r) => r.status !== "removed");

  return (
    <>
      <p className="mb-3 text-sm">
        <Link href="/dashboard/competitions" className="font-medium text-evergreen-700 underline-offset-2 hover:underline">
          ← All competitions
        </Link>
      </p>
      <PageTitle
        eyebrow="Live Operations · Competition Workspace"
        title={comp.title}
        subtitle={`${FORMAT_LABELS[comp.format] ?? comp.format} · created ${fmtDateTime(comp.created_at)}${comp.quizzes ? ` · quiz ${(comp.quizzes as unknown as { title: string }).title}` : ""}`}
        action={<Badge tone={comp.status === "live" ? "green" : comp.status === "draft" ? "gray" : "amber"}>{comp.status}</Badge>}
      />

      {comp.description && <p className="mb-4 max-w-3xl text-sm text-ink-soft">{comp.description}</p>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Registered" value={active.length} hint="Excludes removed entries" />
        <StatCard label="Admission codes" value={(codes ?? []).length} />
        <StatCard label="Results published" value={comp.results_published ? "Yes" : "No"} />
        <StatCard label="Max participants" value={comp.max_participants ?? "—"} />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {comp.session_id && (
          <ButtonLink href={`/dashboard/sessions/${comp.session_id}/host`} variant="gold">
            Open live host console
          </ButtonLink>
        )}
        {canManage && comp.status === "draft" && (
          <form action={setOrgCompetitionStatus}>
            <input type="hidden" name="id" value={comp.id} />
            <input type="hidden" name="status" value="published" />
            <Button type="submit">Publish competition</Button>
          </form>
        )}
        {canManage && comp.status !== "ended" && comp.status !== "archived" && (
          <form action={setOrgCompetitionStatus}>
            <input type="hidden" name="id" value={comp.id} />
            <input type="hidden" name="status" value="ended" />
            <Button type="submit" variant="outline">Close competition</Button>
          </form>
        )}
        {isManager && comp.status === "draft" && (
          <form action={deleteDraftCompetition}>
            <input type="hidden" name="id" value={comp.id} />
            <Button type="submit" variant="danger">Delete draft</Button>
          </form>
        )}
        <ButtonLink href="/dashboard/reports" variant="outline">Results &amp; reports</ButtonLink>
      </div>

      <Card className="mt-6 p-5 sm:p-6">
        <h2 className="font-display text-base font-semibold text-evergreen-950">Admission codes</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Participants enter a code at <span className="font-mono text-xs">/join</span> together with their name and avatar.
        </p>
        {(codes ?? []).length === 0 ? (
          <p className="mt-3 text-sm text-ink-soft">No admission code has been issued for this competition.</p>
        ) : (
          <ul className="mt-3 divide-y divide-evergreen-900/10 text-sm">
            {(codes ?? []).map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="font-mono text-base font-semibold tracking-widest text-evergreen-950">{c.code}</span>
                <span className="text-xs text-ink-soft">
                  {c.label ?? "General admission"} · {c.is_active === false ? "inactive" : "active"}
                  {c.max_uses ? ` · max ${c.max_uses}` : ""}
                  {c.expires_at ? ` · expires ${fmtDateTime(c.expires_at)}` : ""}
                </span>
                <Link href={`/play/${c.code}`} target="_blank" className="text-xs font-semibold text-evergreen-700 underline underline-offset-2">
                  Preview join page
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="mt-6 p-5 sm:p-6">
        <h2 className="font-display text-base font-semibold text-evergreen-950">Participants ({active.length})</h2>
        {(registrations ?? []).length === 0 ? (
          <p className="mt-3 text-sm text-ink-soft">
            Nobody has registered yet. Share an admission code above — registrations appear here as participants join.
          </p>
        ) : (
          <div className="mt-3">
            <DataTable head={["Participant", "Reference", "Source", "Status", "Registered"]} label="Competition participants">
              {(registrations ?? []).slice((page - 1) * pageSize, page * pageSize).map((r) => (
                <tr key={r.id}>
                  <td className="font-medium text-evergreen-950">{r.full_name ?? "—"}</td>
                  <td className="font-mono text-xs text-ink-soft">{r.participant_ref ?? "—"}</td>
                  <td className="text-xs capitalize text-ink-soft">{r.source ?? "—"}</td>
                  <td className="text-xs capitalize">{r.status}</td>
                  <td className="text-xs text-ink-soft">{fmtDateTime(r.created_at)}</td>
                </tr>
              ))}
            </DataTable>
            <PageNavigation
              page={page}
              pageSize={pageSize}
              total={(registrations ?? []).length}
              pathname={`/dashboard/competitions/${comp.id}`}
              label="participants"
            />
          </div>
        )}
      </Card>
    </>
  );
}
