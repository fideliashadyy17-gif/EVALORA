import { Badge, Button, ButtonLink, Card, Field, Input, PageTitle, Select, StatCard } from "@/components/ui";
import { activeOrg, can, MANAGER_ROLES, PROCTOR_ROLES, requireUser } from "@/lib/auth";
import {
  DECISION_LABEL,
  ROOM_EVENT_LABEL,
  describeRetention,
  getRetentionPolicy,
  isUuid,
  loadReviewHistory,
} from "@/lib/proctoring";
import { createClient } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/utils";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { reviewIncident } from "../exams/actions";

export const metadata: Metadata = { title: "Proctoring review" };
export const dynamic = "force-dynamic";

interface SP {
  exam?: string;
  candidate?: string;
  decision?: string;
  source?: string;
  from?: string;
  to?: string;
  ok?: string;
  incident_error?: string;
}

const decisionTone = (d: string) =>
  (d === "confirmed" ? "red" : d === "dismissed" ? "green" : d === "investigating" ? "amber" : "gray") as
    | "red"
    | "green"
    | "amber"
    | "gray";
const statusTone = (s: string) =>
  (s === "valid" ? "red" : s === "invalid" ? "green" : s === "investigating" ? "amber" : "gold") as
    | "red"
    | "green"
    | "amber"
    | "gold";

const isoDay = (value?: string) => (value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null);

export default async function ProctoringReviewPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  if (!org) redirect("/dashboard");
  if (!can(ctx, org.id, PROCTOR_ROLES)) redirect("/dashboard");

  const sp = await searchParams;
  const supabase = await createClient();

  const [exams, candidates] = await Promise.all([
    supabase.from("exams").select("id, title").eq("organization_id", org.id).order("created_at", { ascending: false }).limit(200),
    sp.exam && isUuid(sp.exam)
      ? supabase.from("exam_candidates").select("id, full_name").eq("exam_id", sp.exam).order("full_name").limit(500)
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
  ]);

  const history = await loadReviewHistory(supabase, {
    organizationId: org.id,
    examId: sp.exam,
    candidateId: sp.candidate,
    decision: sp.decision,
    source: sp.source === "backfilled" ? null : sp.source,
    from: isoDay(sp.from) ? `${sp.from}T00:00:00.000Z` : null,
    to: isoDay(sp.to) ? `${sp.to}T23:59:59.999Z` : null,
    limit: 200,
  });

  let pendingQuery = supabase
    .from("proctoring_incidents")
    .select("*, exams(title), exam_candidates(full_name), profiles(email)")
    .eq("organization_id", org.id)
    .in("status", ["open", "investigating"])
    .order("created_at", { ascending: false })
    .limit(50);
  if (sp.exam && isUuid(sp.exam)) pendingQuery = pendingQuery.eq("exam_id", sp.exam);
  if (sp.candidate && isUuid(sp.candidate)) pendingQuery = pendingQuery.eq("candidate_id", sp.candidate);
  const { data: pending } = await pendingQuery;

  const { data: rooms } = await supabase
    .from("proctoring_rooms")
    .select("id, room_name, exam_id, status, started_at, ended_at, last_event_at")
    .eq("organization_id", org.id)
    .order("started_at", { ascending: false })
    .limit(20);

  const roomIds = (rooms ?? []).map((r) => r.id);
  const { data: events } = roomIds.length
    ? await supabase
        .from("proctoring_room_events")
        .select("room_id, participant_identity, candidate_id, event, occurred_at")
        .in("room_id", roomIds)
        .order("occurred_at", { ascending: false })
        .limit(200)
    : { data: [] as { room_id: string; participant_identity: string; candidate_id: string | null; event: string; occurred_at: string }[] };

  const policy = await getRetentionPolicy(supabase, org.id);
  const decided = history.filter((h) => h.decision !== "reported");
  const joined = (events ?? []).filter((e) => e.event === "joined").length;

  const query = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { exam: sp.exam, candidate: sp.candidate, decision: sp.decision, source: sp.source, from: sp.from, to: sp.to, ...over };
    Object.entries(merged).forEach(([k, v]) => { if (v) p.set(k, v); });
    const s = p.toString();
    return `/dashboard/proctoring${s ? `?${s}` : ""}`;
  };

  return (
    <>
      <PageTitle
        title="Proctoring review"
        subtitle="Every observation and every reviewer decision in this workspace, with who decided, what they decided and when. Observations are reports for human review — never automatic proof of misconduct."
        action={
          <div className="flex gap-2">
            <ButtonLink href="/dashboard/exams" variant="outline">Examinations</ButtonLink>
            <ButtonLink href={query({})}>Reset filters</ButtonLink>
          </div>
        }
      />

      {sp.ok && (
        <p className="mb-4 rounded-lg bg-evergreen-50 px-4 py-3 text-sm text-evergreen-900">Review saved and added to the audit history.</p>
      )}
      {sp.incident_error && (
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">
          That decision could not be saved — the observation may have already been reviewed by someone else. Reload and retry.
        </p>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Awaiting review" value={(pending ?? []).length} hint="Observations still open or under investigation" />
        <StatCard label="Decisions recorded" value={decided.length} hint="Confirmed, dismissed and reopened decisions in view" />
        <StatCard label="Supervision rooms" value={(rooms ?? []).length} hint={`${joined} participant join event(s) recorded`} />
        <StatCard label="Evidence events" value={(events ?? []).length} hint="Join, leave and media events captured" />
      </div>

      <Card className="mb-6 p-5">
        <h2 className="mb-3 font-display text-lg font-semibold text-evergreen-950">Filter the review history</h2>
        <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <Field label="Examination">
            <Select name="exam" defaultValue={sp.exam ?? ""}>
              <option value="">All examinations</option>
              {(exams.data ?? []).map((e) => (
                <option key={e.id} value={e.id}>{e.title}</option>
              ))}
            </Select>
          </Field>
          <Field label="Candidate">
            <Select name="candidate" defaultValue={sp.candidate ?? ""}>
              <option value="">All candidates</option>
              {(candidates.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>{c.full_name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Decision">
            <Select name="decision" defaultValue={sp.decision ?? ""}>
              <option value="">All decisions</option>
              <option value="reported">Reported</option>
              <option value="confirmed">Confirmed</option>
              <option value="dismissed">Dismissed</option>
              <option value="investigating">Under investigation</option>
              <option value="reopened">Reopened</option>
            </Select>
          </Field>
          <Field label="From">
            <Input type="date" name="from" defaultValue={sp.from ?? ""} />
          </Field>
          <Field label="To">
            <Input type="date" name="to" defaultValue={sp.to ?? ""} />
          </Field>
          <div className="flex items-end gap-2">
            <Button type="submit">Apply</Button>
          </div>
        </form>
        <p className="mt-2 text-xs text-ink-soft">
          Choose an examination to narrow the candidate list. Exports respect the same filters.
        </p>
        <div className="mt-3">
          <ButtonLink
            variant="outline"
            href={`/api/proctoring/export${query({}).split("?")[1] ? `?${query({}).split("?")[1]}` : ""}`}
          >
            Export CSV
          </ButtonLink>
        </div>
      </Card>

      <h2 className="mb-3 font-display text-lg font-semibold text-evergreen-950">Observations awaiting a decision</h2>
      {(pending ?? []).length === 0 ? (
        <Card className="mb-8 p-5 text-sm text-ink-soft">
          No observations are waiting for review. When a supervisor logs an observation during an examination it appears here.
        </Card>
      ) : (
        <div className="mb-8 space-y-3">
          {(pending ?? []).map((i) => {
            const ex = i.exams as { title?: string } | null;
            const cand = i.exam_candidates as { full_name?: string } | null;
            const reporter = i.profiles as { email?: string } | null;
            return (
              <Card key={i.id} className="p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={i.severity === "high" ? "red" : i.severity === "medium" ? "amber" : "gray"}>{i.severity}</Badge>
                  <Badge tone={statusTone(i.status)}>{i.status === "open" ? "awaiting review" : i.status}</Badge>
                  <span className="font-medium text-evergreen-950">{String(i.type).replace(/_/g, " ")}</span>
                  <span className="text-sm text-ink-soft">· {cand?.full_name ?? "Unassigned candidate"}</span>
                  <span className="text-sm text-ink-soft">· {ex?.title ?? "—"}</span>
                  <span className="ml-auto text-xs text-ink-soft">{fmtDateTime(i.created_at)}</span>
                </div>
                {i.note && <p className="mt-2 rounded-lg bg-cream px-3 py-2 text-sm text-ink">{i.note}</p>}
                <p className="mt-1 text-xs text-ink-soft">Reported by {reporter?.email ?? "unknown user"}</p>
                <form action={reviewIncident} className="mt-3 grid gap-2 sm:grid-cols-[170px_1fr_auto]">
                  <input type="hidden" name="exam_id" value={i.exam_id} />
                  <input type="hidden" name="id" value={i.id} />
                  <input type="hidden" name="expected_status" value={i.status} />
                  <input type="hidden" name="return_to" value="/dashboard/proctoring" />
                  <Select name="status" defaultValue="investigating">
                    <option value="investigating">Under investigation</option>
                    <option value="valid">Confirm observation</option>
                    <option value="invalid">Dismiss observation</option>
                  </Select>
                  <Input name="review_note" placeholder="Decision rationale (recorded in the audit history)" maxLength={2000} />
                  <Button type="submit" variant="outline">Record decision</Button>
                </form>
              </Card>
            );
          })}
        </div>
      )}

      <h2 className="mb-3 font-display text-lg font-semibold text-evergreen-950">Review history</h2>
      <Card className="mb-8 overflow-x-auto p-0">
        <table className="w-full min-w-[940px] text-sm">
          <thead>
            <tr className="border-b border-evergreen-900/10 bg-evergreen-50 text-left">
              <th className="px-4 py-3 font-semibold">When</th>
              <th className="px-4 py-3 font-semibold">Decision</th>
              <th className="px-4 py-3 font-semibold">Examination / candidate</th>
              <th className="px-4 py-3 font-semibold">Reviewer</th>
              <th className="px-4 py-3 font-semibold">Source</th>
              <th className="px-4 py-3 font-semibold">Note</th>
            </tr>
          </thead>
          <tbody>
            {history.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-ink-soft">
                  No review records match these filters yet.
                </td>
              </tr>
            )}
            {history.map((h) => (
              <tr key={h.id} className="border-b border-evergreen-900/10 align-top">
                <td className="whitespace-nowrap px-4 py-2.5 text-ink-soft">{fmtDateTime(h.created_at)}</td>
                <td className="px-4 py-2.5">
                  <Badge tone={decisionTone(h.decision)}>{DECISION_LABEL[h.decision] ?? h.decision}</Badge>
                  {h.previous_status && h.previous_status !== h.new_status && (
                    <span className="ml-1 block text-[11px] text-ink-soft">{h.previous_status} → {h.new_status}</span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <span className="block">{h.exams?.title ?? "—"}</span>
                  <span className="block text-xs text-ink-soft">{h.exam_candidates?.full_name ?? "Unassigned candidate"}</span>
                </td>
                <td className="px-4 py-2.5">
                  <span className="block">{h.reviewer_email ?? "—"}</span>
                  <span className="block text-xs text-ink-soft">{h.reviewer_role ?? ""}</span>
                </td>
                <td className="px-4 py-2.5 text-xs text-ink-soft">{h.source}</td>
                <td className="max-w-xs px-4 py-2.5 text-xs text-ink">{h.note ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <h2 className="mb-3 font-display text-lg font-semibold text-evergreen-950">Supervision rooms and evidence</h2>
      <Card className="mb-8 overflow-x-auto p-0">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b border-evergreen-900/10 bg-evergreen-50 text-left">
              <th className="px-4 py-3 font-semibold">Room</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Opened</th>
              <th className="px-4 py-3 font-semibold">Closed</th>
              <th className="px-4 py-3 font-semibold">Latest evidence</th>
              <th className="px-4 py-3 font-semibold">Open</th>
            </tr>
          </thead>
          <tbody>
            {(rooms ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-ink-soft">
                  No supervision room has been opened yet. A room is registered the first time a supervisor or candidate
                  obtains video access for a proctored examination.
                </td>
              </tr>
            )}
            {(rooms ?? []).map((r) => {
              const latest = (events ?? []).find((e) => e.room_id === r.id);
              return (
                <tr key={r.id} className="border-b border-evergreen-900/10">
                  <td className="px-4 py-2.5 font-mono text-xs">{r.room_name}</td>
                  <td className="px-4 py-2.5">
                    <Badge tone={r.status === "active" ? "green" : "gray"}>{r.status}</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-ink-soft">{fmtDateTime(r.started_at)}</td>
                  <td className="px-4 py-2.5 text-ink-soft">{r.ended_at ? fmtDateTime(r.ended_at) : "—"}</td>
                  <td className="px-4 py-2.5 text-xs text-ink-soft">
                    {latest ? `${ROOM_EVENT_LABEL[latest.event] ?? latest.event} · ${fmtDateTime(latest.occurred_at)}` : "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <ButtonLink href={`/dashboard/exams/${r.exam_id}/proctor`} variant="outline">Supervise</ButtonLink>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <h2 className="mb-3 font-display text-lg font-semibold text-evergreen-950">Data retention</h2>
      <Card className="p-5">
        <p className="text-sm text-ink">{describeRetention(policy)}</p>
        {policy?.legal_hold && (
          <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Legal hold is active: no evidence may be removed for this organization.
          </p>
        )}
        <p className="mt-2 text-xs text-ink-soft">
          EVALORA does not impose a retention period. Periods are configured by this organization&apos;s administrators, and
          applying a policy never removes a decision, a reviewer identity or a timestamp — only free-text notes and media
          telemetry age out.
        </p>
        {can(ctx, org.id, MANAGER_ROLES) && (
          <div className="mt-3">
            <ButtonLink href="/dashboard/settings/proctoring" variant="outline">Configure retention</ButtonLink>
          </div>
        )}
      </Card>
    </>
  );
}
