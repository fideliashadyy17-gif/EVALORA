import { CollectionToolbar, type CollectionParams } from "@/components/dashboard/CollectionToolbar";
import { pageNumber } from "@/lib/pagination";
import { Badge, Button, ButtonLink, Card, EmptyState, Field, Input, PageTitle, Select, StatCard } from "@/components/ui";
import { activeOrg, can, CREATOR_ROLES, requireUser } from "@/lib/auth";
import { COMPETITION_FORMATS } from "@/lib/brand";
import { fmtDate } from "@/lib/utils";
import { Trophy, Users, Wifi } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createOrgCompetition, deleteDraftCompetition, setOrgCompetitionStatus } from "./actions";

export const metadata: Metadata = { title: "Live competitions" };
export const dynamic = "force-dynamic";

const FORMAT_LABELS = Object.fromEntries(COMPETITION_FORMATS.map((f) => [f.value, f.label]));

const STATUS_TONE: Record<string, "green" | "amber" | "gray" | "red" | "gold"> = {
  draft: "gray",
  published: "green",
  scheduled: "amber",
  live: "green",
  paused: "amber",
  ended: "gray",
  cancelled: "red",
  archived: "gray",
};

interface CompetitionRow {
  id: string;
  title: string;
  format: string;
  status: string;
  session_id: string | null;
  quiz_id: string | null;
  max_participants: number | null;
  created_at: string;
  results_published: boolean;
  competition_registrations?: { id: string; status: string }[] | null;
  competition_access_codes?: { id: string }[] | null;
  quizzes?: { title: string } | null;
}

/**
 * The organization's own live-competition management.
 *
 * Reads with the member's session (RLS on organization_id) and writes through
 * server actions that re-verify the caller's organization role, so an
 * administrator manages their institution's competitions without touching the
 * global console — and without any way to reach another tenant's.
 */
export default async function OrganizationCompetitionsPage({
  searchParams,
}: {
  searchParams: Promise<CollectionParams & { ok?: string; e?: string }>;
}) {
  const sp = await searchParams;
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  const canCreate = can(ctx, org.id, CREATOR_ROLES);
  const isManager = can(ctx, org.id, ["owner", "admin"]);
  const supabase = await createClient();

  const page = pageNumber(sp.page);
  const pageSize = 20;
  const statuses = Object.keys(STATUS_TONE);
  let query = supabase.from("competitions")
    .select("id, title, format, status, session_id, quiz_id, max_participants, created_at, results_published, competition_registrations(id, status), competition_access_codes(id), quizzes(title)", { count: "exact" })
    .eq("organization_id", org.id);
  if (sp.q?.trim()) query = query.ilike("title", `%${sp.q.trim().slice(0, 160).replace(/[%_\\]/g, " ")}%`);
  if (sp.status && statuses.includes(sp.status)) query = query.eq("status", sp.status);
  query = sp.sort === "title" ? query.order("title") : query.order("created_at", { ascending: sp.sort === "oldest" });
  const [{ data: comps, count, error }, { data: quizzes }] = await Promise.all([
    query.order("id").range((page - 1) * pageSize, page * pageSize - 1),
    supabase.from("quizzes").select("id, title").eq("organization_id", org.id).order("title").limit(200),
  ]);

  const rows = ((comps ?? []) as unknown as CompetitionRow[]);
  const live = rows.filter((c) => c.status === "live" || c.status === "paused");
  const participants = rows.reduce(
    (total, c) => total + (c.competition_registrations ?? []).filter((r) => r.status !== "removed").length,
    0,
  );

  return (
    <>
      <PageTitle
        title="Live competitions"
        subtitle={`Every competition hosted by ${org.name}. Join codes, participants and live rooms are the same ones used by the public competition screens.`}
        action={canCreate ? <ButtonLink href="#new-competition" variant="gold">+ New competition</ButtonLink> : undefined}
      />

      {sp.ok && (
        <p className="mb-4 rounded-lg bg-evergreen-50 px-4 py-3 text-sm text-evergreen-900">
          {sp.ok === "created" ? "Competition created with a fresh admission code." : `Competition marked ${sp.ok}.`}
        </p>
      )}
      {sp.e && (
        <p className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {sp.e === "forbidden"
            ? "Your role cannot change competitions in this organization."
            : sp.e === "title"
              ? "Give the competition a title."
              : sp.e === "quiz"
                ? "Choose a quiz that belongs to this organization."
                : sp.e === "not_draft"
                  ? "Only draft competitions can be deleted."
                  : "That competition could not be found in your organization."}
        </p>
      )}

      <CollectionToolbar path="/dashboard/competitions" params={{ q: sp.q, status: sp.status, sort: sp.sort }} statuses={statuses} page={page} pageSize={pageSize} total={count ?? 0} noun="competitions" failed={Boolean(error)} />
      <p className="mb-3 text-xs text-ink-soft">Summary for this page of competitions</p>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Competitions" value={rows.length} icon={<Trophy className="h-5 w-5" />} />
        <StatCard label="Live or paused" value={live.length} icon={<Wifi className="h-5 w-5" />} />
        <StatCard label="Registered participants" value={participants} icon={<Users className="h-5 w-5" />} />
        <StatCard label="Results published" value={rows.filter((c) => c.results_published).length} />
      </div>

      {error ? null : rows.length === 0 ? (
        <EmptyState
          title="No competitions yet"
          body="Create a competition for your institution, share its admission code, and run it from the live host console."
        />
      ) : (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-evergreen-900/20 bg-paper">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-evergreen-900/15 bg-cream text-xs uppercase tracking-wide text-ink-soft">
                <th className="px-4 py-3">Competition</th>
                <th className="px-4 py-3">Format</th>
                <th className="px-4 py-3">Participants</th>
                <th className="px-4 py-3">Admission code</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="[&_td]:px-4 [&_td]:py-3 [&_tr]:border-b [&_tr]:border-evergreen-900/10 [&_tr:last-child]:border-0">
              {rows.map((c) => {
                const codes = c.competition_access_codes ?? [];
                return (
                  <tr key={c.id}>
                    <td>
                      <span className="font-semibold text-evergreen-950">{c.title}</span>
                      <span className="block text-xs text-ink-soft">
                        {c.quizzes?.title ? `Quiz: ${c.quizzes.title} · ` : ""}created {fmtDate(c.created_at)}
                      </span>
                    </td>
                    <td className="text-xs text-ink-soft">{FORMAT_LABELS[c.format] ?? c.format}</td>
                    <td>{participants === 0 ? "—" : (c.competition_registrations ?? []).filter((r) => r.status !== "removed").length}</td>
                    <td className="text-xs">
                      {codes.length ? (
                        <Link href={`/dashboard/competitions/${c.id}`} className="font-medium text-evergreen-700 underline-offset-2 hover:underline">
                          {codes.length} code{codes.length === 1 ? "" : "s"}
                        </Link>
                      ) : (
                        <span className="text-ink-soft">none</span>
                      )}
                    </td>
                    <td><Badge tone={STATUS_TONE[c.status] ?? "gray"}>{c.status}</Badge></td>
                    <td>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        {c.session_id && (
                          <Link href={`/dashboard/sessions/${c.session_id}/host`} className="font-medium text-evergreen-700 underline-offset-2 hover:underline">
                            Host console
                          </Link>
                        )}
                        <Link href={`/dashboard/competitions/${c.id}`} className="font-medium text-evergreen-700 underline-offset-2 hover:underline">
                          Details
                        </Link>
                        {canCreate && c.status === "draft" && (
                          <form action={setOrgCompetitionStatus}>
                            <input type="hidden" name="id" value={c.id} />
                            <input type="hidden" name="status" value="published" />
                            <button className="font-medium text-evergreen-700 underline-offset-2 hover:underline">Publish</button>
                          </form>
                        )}
                        {isManager && c.status === "draft" && (
                          <form action={deleteDraftCompetition}>
                            <input type="hidden" name="id" value={c.id} />
                            <button className="font-medium text-red-700 underline-offset-2 hover:underline">Delete</button>
                          </form>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {canCreate && (
        <Card className="mt-6 scroll-mt-24 p-5 sm:p-6" id="new-competition">
          <h2 className="font-display text-lg font-semibold text-evergreen-950">Create a competition</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Competitions are always created inside {org.name}. A draft is created with its first admission code; publish it
            when you are ready for participants.
          </p>
          <form action={createOrgCompetition} className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Title" className="sm:col-span-2">
              <Input name="title" required maxLength={160} placeholder="Inter-house mathematics challenge" />
            </Field>
            <Field label="Format">
              <Select name="format" defaultValue="live_synchronous">
                {COMPETITION_FORMATS.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Quiz (optional)" hint="Questions come from the selected quiz's bank.">
              <Select name="quiz_id" defaultValue="">
                <option value="">No quiz attached</option>
                {(quizzes ?? []).map((q) => (
                  <option key={q.id} value={q.id}>{q.title}</option>
                ))}
              </Select>
            </Field>
            <Field label="Description" className="sm:col-span-2">
              <Input name="description" maxLength={1000} placeholder="Short description shown to participants" />
            </Field>
            <div className="sm:col-span-2">
              <Button type="submit">Create draft competition</Button>
            </div>
          </form>
        </Card>
      )}
    </>
  );
}
