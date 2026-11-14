import { PageNavigation } from "@/components/PageNavigation";
import { Badge, Button, ButtonLink, Card, Field, Input, PageTitle, Select, StatCard } from "@/components/ui";
import { describeIncidentType } from "@/lib/integrity";
import { requireSuperAdmin } from "@/lib/auth";
import {
  DECISION_LABEL,
  describeRetention,
  getRetentionPolicy,
  isUuid,
  loadPlatformReviewHistory,
} from "@/lib/proctoring";
import { createAdminClient } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/utils";
import type { Metadata } from "next";
import { adminReviewIncident } from "../actions";
import { Section, Table } from "../ui";

export const metadata: Metadata = { title: "Proctoring" };
export const dynamic = "force-dynamic";

const sevTone = (s: string) => (s === "high" ? "red" : s === "medium" ? "amber" : "gray") as "red" | "amber" | "gray";
const stTone = (s: string) =>
  (s === "valid" ? "red" : s === "invalid" ? "green" : s === "investigating" ? "amber" : "gold") as
    | "red"
    | "green"
    | "amber"
    | "gold";
const decisionTone = (d: string) =>
  (d === "confirmed" ? "red" : d === "dismissed" ? "green" : d === "investigating" ? "amber" : "gray") as
    | "red"
    | "green"
    | "amber"
    | "gray";

interface SP {
  org?: string;
  exam?: string;
  candidate?: string;
  decision?: string;
  from?: string;
  to?: string;
  saved?: string;
  page?: string;
}

const isoDay = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

export default async function AdminProctoring({ searchParams }: { searchParams: Promise<SP> }) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const pageSize = 25;
  const admin = createAdminClient();

  const [orgs, exams, candidates] = await Promise.all([
    admin.from("organizations").select("id, name, slug").order("name").limit(500),
    sp.org && isUuid(sp.org)
      ? admin.from("exams").select("id, title").eq("organization_id", sp.org).order("title").limit(300)
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    sp.exam && isUuid(sp.exam)
      ? admin.from("exam_candidates").select("id, full_name").eq("exam_id", sp.exam).order("full_name").limit(500)
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
  ]);

  let incidentQuery = admin
    .from("proctoring_incidents")
    .select("*, exams(title, organizations(name)), exam_candidates(full_name), profiles(email)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (sp.org && isUuid(sp.org)) incidentQuery = incidentQuery.eq("organization_id", sp.org);
  if (sp.exam && isUuid(sp.exam)) incidentQuery = incidentQuery.eq("exam_id", sp.exam);
  if (sp.candidate && isUuid(sp.candidate)) incidentQuery = incidentQuery.eq("candidate_id", sp.candidate);

  const [incidents, rooms, recordings, openCount, retainedCount] = await Promise.all([
    incidentQuery,
    admin.from("proctoring_rooms").select("*, exams(title)").order("created_at", { ascending: false }).limit(20),
    admin.from("proctoring_recordings").select("*").order("created_at", { ascending: false }).limit(20),
    admin.from("proctoring_incidents").select("id", { count: "exact", head: true }).in("status", ["open", "investigating"]),
    admin.from("proctoring_incidents").select("id", { count: "exact", head: true }).eq("retention_state", "anonymized"),
  ]);

  const history = await loadPlatformReviewHistory(admin, {
    organizationId: sp.org,
    examId: sp.exam,
    candidateId: sp.candidate,
    decision: sp.decision,
    from: isoDay(sp.from) ? `${sp.from}T00:00:00.000Z` : null,
    to: isoDay(sp.to) ? `${sp.to}T23:59:59.999Z` : null,
    limit: 150,
  });

  const { data: orgRows } = await admin.from("proctoring_retention_policies").select("organization_id, legal_hold");
  const retentionConfigured = (orgRows ?? []).length;
  const selectedPolicy = sp.org && isUuid(sp.org) ? await getRetentionPolicy(admin, sp.org) : null;

  const query = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { org: sp.org, exam: sp.exam, candidate: sp.candidate, decision: sp.decision, from: sp.from, to: sp.to, ...over };
    Object.entries(merged).forEach(([k, v]) => { if (v) p.set(k, v); });
    const s = p.toString();
    return `/admin/proctoring${s ? `?${s}` : ""}`;
  };

  return (
    <>
      <PageTitle
        eyebrow="Examinations · Proctoring Oversight & Human Review"
        title="Proctoring oversight"
        subtitle="Platform-wide view of supervised examinations, observations, reviewer decisions and evidence retention. Observations are reports for human review — never automatic proof of misconduct."
        action={<ButtonLink href="/admin/proctoring/retention">Retention policies</ButtonLink>}
      />
      {sp.saved && <p className="mb-4 rounded-lg bg-evergreen-50 px-4 py-3 text-sm text-evergreen-900">Review saved and audit-logged.</p>}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Awaiting review" value={openCount.count ?? 0} hint="Observations open or under investigation" />
        <StatCard label="Supervision rooms" value={(rooms.data ?? []).length} hint={`${(recordings.data ?? []).length} recording(s)`} />
        <StatCard label="Decisions recorded" value={history.filter((h) => h.decision !== "reported").length} hint="Decisions in the current filter" />
        <StatCard label="Retention policies" value={`${retentionConfigured} / ${(orgs.data ?? []).length}`} hint={`${retainedCount.count ?? 0} observation(s) redacted by policy`} />
      </div>

      <Card className="mb-6 p-5">
        <h2 className="mb-3 font-display text-lg font-semibold text-evergreen-950">Filter</h2>
        <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <Field label="Organization">
            <Select name="org" defaultValue={sp.org ?? ""}>
              <option value="">All organizations</option>
              {(orgs.data ?? []).map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </Select>
          </Field>
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
          <div className="flex gap-2 lg:col-span-6">
            <Button type="submit">Apply filters</Button>
            <ButtonLink href={query({})} variant="outline">Reset</ButtonLink>
          </div>
        </form>
        <p className="mt-2 text-xs text-ink-soft">Select an organization to narrow the examination and candidate lists.</p>
      </Card>

      {sp.org && isUuid(sp.org) && (
        <Card className="mb-6 p-5">
          <h2 className="mb-1 font-display text-lg font-semibold text-evergreen-950">Retention for this organization</h2>
          <p className="text-sm text-ink">{describeRetention(selectedPolicy)}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {selectedPolicy?.legal_hold && <Badge tone="amber">Legal hold active</Badge>}
            <ButtonLink href={`/admin/proctoring/retention?org=${sp.org}`} variant="outline">Manage policy</ButtonLink>
          </div>
        </Card>
      )}

      <Section title="Observations">
        <Table head={["Observation", "Examination / organization", "Candidate", "Severity", "Reported", "State", "Record a decision"]}>
          {(incidents.data ?? []).length === 0 && (
            <tr>
              <td colSpan={7} className="px-4 py-6 text-center text-ink-soft">No observations match these filters.</td>
            </tr>
          )}
          {(incidents.data ?? []).slice((page - 1) * pageSize, page * pageSize).map((i) => {
            const ex = i.exams as { title?: string; organizations?: { name?: string } | null } | null;
            const cand = i.exam_candidates as { full_name?: string } | null;
            const reporter = i.profiles as { email?: string } | null;
            return (
              <tr key={i.id} className="align-top">
                <td className="max-w-xs">
                  <span className="font-medium">{describeIncidentType(String(i.type))}</span>
                  {i.note && (
                    <span className="block text-xs text-ink-soft" title={i.note}>
                      {i.retention_state === "anonymized" ? "[redacted by retention policy]" : i.note}
                    </span>
                  )}
                  <span className="block text-[11px] text-ink-soft">by {reporter?.email ?? "unknown"}</span>
                </td>
                <td className="text-ink-soft">
                  {ex?.title ?? "—"}
                  {ex?.organizations?.name ? ` · ${ex.organizations.name}` : ""}
                </td>
                <td className="text-ink-soft">{cand?.full_name ?? "—"}</td>
                <td><Badge tone={sevTone(i.severity)}>{i.severity}</Badge></td>
                <td className="whitespace-nowrap text-ink-soft">{fmtDateTime(i.created_at)}</td>
                <td>
                  <Badge tone={stTone(i.status)}>{i.status}</Badge>
                  {i.reviewed_at && <span className="mt-1 block text-[11px] text-ink-soft">reviewed {fmtDateTime(i.reviewed_at)}</span>}
                </td>
                <td>
                  <form action={adminReviewIncident} className="flex flex-col gap-1.5">
                    <input type="hidden" name="id" value={i.id} />
                    <div className="flex items-center gap-1.5">
                      <Select name="status" defaultValue={i.status} className="rounded-lg border border-evergreen-900/55 bg-white px-2 py-1.5 text-xs">
                        <option value="open">open</option>
                        <option value="investigating">investigating</option>
                        <option value="valid">confirm</option>
                        <option value="invalid">dismiss</option>
                      </Select>
                      <Button type="submit" variant="outline">Save</Button>
                    </div>
                    <Input name="review_note" placeholder="Decision rationale (audited)" className="text-xs" maxLength={2000} />
                  </form>
                </td>
              </tr>
            );
          })}
        </Table>
        <PageNavigation
          page={page}
          pageSize={pageSize}
          total={(incidents.data ?? []).length}
          pathname="/admin/proctoring"
          query={{ org: sp.org, exam: sp.exam, candidate: sp.candidate, decision: sp.decision, from: sp.from, to: sp.to }}
          label="observations"
        />
      </Section>

      <Section title="Review history (immutable)">
        <Table head={["When", "Decision", "Organization / examination", "Reviewer", "Source", "Note"]}>
          {history.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-6 text-center text-ink-soft">No review records match these filters.</td>
            </tr>
          )}
          {history.map((h) => (
            <tr key={h.id} className="align-top">
              <td className="whitespace-nowrap text-ink-soft">{fmtDateTime(h.created_at)}</td>
              <td>
                <Badge tone={decisionTone(h.decision)}>{DECISION_LABEL[h.decision] ?? h.decision}</Badge>
                {h.previous_status && h.previous_status !== h.new_status && (
                  <span className="ml-1 block text-[11px] text-ink-soft">{h.previous_status} → {h.new_status}</span>
                )}
              </td>
              <td>
                <span className="block">{h.organizations?.name ?? "—"}</span>
                <span className="block text-xs text-ink-soft">{h.exams?.title ?? "—"}</span>
              </td>
              <td>
                <span className="block">{h.reviewer_email ?? "—"}</span>
                <span className="block text-xs text-ink-soft">{h.reviewer_role ?? ""}</span>
              </td>
              <td className="text-xs text-ink-soft">{h.source}</td>
              <td className="max-w-xs text-xs text-ink">{h.note ?? "—"}</td>
            </tr>
          ))}
        </Table>
      </Section>

      <Section title="Rooms and evidence events">
        <Table head={["Room", "Examination", "Status", "Opened", "Closed", "Latest evidence"]}>
          {(rooms.data ?? []).length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-6 text-center text-ink-soft">
                No supervision room has been registered yet.
              </td>
            </tr>
          )}
          {(rooms.data ?? []).map((r) => {
            const ex = r.exams as { title?: string } | null;
            return (
              <tr key={r.id}>
                <td className="font-mono text-xs">{r.room_name}</td>
                <td className="text-ink-soft">{ex?.title ?? "—"}</td>
                <td><Badge tone={r.status === "active" ? "green" : "gray"}>{r.status}</Badge></td>
                <td className="text-ink-soft">{fmtDateTime(r.started_at ?? r.created_at)}</td>
                <td className="text-ink-soft">{r.ended_at ? fmtDateTime(r.ended_at) : "—"}</td>
                <td className="text-xs text-ink-soft">
                  {r.last_event_at ? fmtDateTime(r.last_event_at) : "—"}
                </td>
              </tr>
            );
          })}
        </Table>
      </Section>
    </>
  );
}
