import { CopyInvitation } from "@/components/CopyInvitation";
import { LocalTime } from "@/components/LocalTime";
import { Badge, Button, ButtonLink, Card, Input, PageTitle, Select, StatCard } from "@/components/ui";
import { activeOrg, requireUser } from "@/lib/auth";
import { getCapabilities, requireModule } from "@/lib/capabilities";
import {
  EXAM_LINK_DURATION_PRESETS,
  examLinkLifecycle,
  linkPolicyLabel,
  type ExamLinkStatus,
} from "@/lib/examLink";
import { loadExamLinkPolicy, loadLinkAttemptCounts } from "@/lib/examLinkServer";
import { canOperateMany } from "@/lib/operationalAccess";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  disableOrgExamLink,
  reactivateOrgExamLink,
  updateOrgExamLinkSettings,
} from "../link-actions";

export const metadata: Metadata = { title: "Exam Links & Access Codes" };
export const dynamic = "force-dynamic";

interface ExamRow {
  id: string;
  organization_id: string;
  title: string;
  status: string;
  access_code: string;
  invite_token: string;
  access_link: string | null;
  shared_link_enabled: boolean;
  invite_expires_at: string | null;
  invite_activates_at: string | null;
  invite_disabled_at: string | null;
  invite_no_expiry: boolean;
  invite_expiry_policy: string | null;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
}

const OK_MESSAGES: Record<string, string> = {
  link_updated: "Link expiration settings saved. The link URL and examination code were preserved.",
  link_disabled: "Link disabled. New starts are blocked while attempts already in progress continue normally.",
  link_reactivated: "Examination link reactivated with a valid expiration window.",
  link_already_disabled: "That link is already disabled.",
};

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "Your role does not permit modifying examination link lifecycle settings.",
  exam: "Examination not found in this organization.",
  expiry: "Choose a valid future expiration date/time or duration preset.",
  activation: "The scheduled activation time must be earlier than the expiration time.",
  reactivate_expiry: "Provide a valid future expiration window to reactivate this link.",
  failed: "The link setting could not be updated. Reload and retry.",
};

function utcInput(iso: string | null): string {
  if (!iso) return "";
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 16) : "";
}

function statusTone(status: ExamLinkStatus): "green" | "amber" | "gray" | "red" {
  if (status === "active") return "green";
  if (status === "scheduled") return "amber";
  if (status === "disabled") return "red";
  return "gray";
}

export default async function OrgExamLinksPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; link?: string; ok?: string; e?: string }>;
}) {
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  if (!org) redirect("/dashboard");

  const supabase = await createClient();
  const { entitlement } = await getCapabilities(supabase, ctx, org.id);
  requireModule(entitlement, "examinations", "/dashboard?e=module");
  requireModule(entitlement, "exam_links", "/dashboard/exams?e=module");

  const { canView, canEdit, canViewCredentials } = await canOperateMany(ctx, org.id, {
    canView: { permission: "exams.view", module: "exam_links" },
    canEdit: { permission: "exams.edit", module: "exam_links" },
    canViewCredentials: { permission: "candidate_links.edit", module: "exam_share_codes" },
  });
  if (!canView) redirect("/dashboard/exams");

  const sp = (await searchParams) ?? {};
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "evalora-edu.online";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const origin = `${proto}://${host}`;

  const admin = createAdminClient();
  const [{ data: rows }, policy] = await Promise.all([
    supabase
      .from("exams")
      .select("id,organization_id,title,status,access_code,invite_token,access_link,shared_link_enabled,invite_expires_at,invite_activates_at,invite_disabled_at,invite_no_expiry,invite_expiry_policy,starts_at,ends_at,created_at")
      .eq("organization_id", org.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(200),
    loadExamLinkPolicy(admin),
  ]);

  const exams = ((rows ?? []) as unknown as ExamRow[]).filter(
    (ex) =>
      !sp.q ||
      ex.title.toLowerCase().includes(sp.q.toLowerCase()) ||
      ex.access_code.toLowerCase().includes(sp.q.toLowerCase()),
  );
  const counts = await loadLinkAttemptCounts(admin, exams.map((e) => e.id));
  const withLifecycle = exams.map((exam) => ({ exam, lifecycle: examLinkLifecycle(exam) }));
  const filtered = sp.link ? withLifecycle.filter((r) => r.lifecycle.status === sp.link) : withLifecycle;

  const totals = {
    active: withLifecycle.filter((r) => r.lifecycle.status === "active").length,
    scheduled: withLifecycle.filter((r) => r.lifecycle.status === "scheduled").length,
    expired: withLifecycle.filter((r) => r.lifecycle.status === "expired").length,
    disabled: withLifecycle.filter((r) => r.lifecycle.status === "disabled").length,
  };

  const backHref = `/dashboard/exams/links${
    sp.q || sp.link
      ? `?${new URLSearchParams({
          ...(sp.q ? { q: sp.q } : {}),
          ...(sp.link ? { link: sp.link } : {}),
        }).toString()}`
      : ""
  }`;

  return (
    <>
      <PageTitle
        eyebrow="Examinations · Admission Links & Access Codes"
        title="Exam Links, Codes & Expiration"
        subtitle="Manage examination invitation links, access codes, scheduled activation windows, and link expiration for this organization. Expiration blocks only new starts — candidates already sitting keep their timer."
        action={
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/dashboard/exams" variant="outline">← Examinations</ButtonLink>
            <ButtonLink href="/dashboard/monitoring" variant="outline">Live Monitoring</ButtonLink>
          </div>
        }
      />

      {sp.ok && OK_MESSAGES[sp.ok] && (
        <p role="status" className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">
          {OK_MESSAGES[sp.ok]}
        </p>
      )}
      {sp.e && ERROR_MESSAGES[sp.e] && (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-900">
          {ERROR_MESSAGES[sp.e]}
        </p>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Active links" value={totals.active} hint="Open for new candidate admissions" />
        <StatCard label="Scheduled" value={totals.scheduled} hint="Awaiting activation timestamp" />
        <StatCard label="Expired" value={totals.expired} hint="Past expiry window" />
        <StatCard label="Disabled" value={totals.disabled} hint="Manually closed to new starts" />
      </div>

      <form method="get" className="mb-6 flex flex-wrap items-end gap-3 rounded-2xl border border-evergreen-900/10 bg-paper p-4">
        <label className="min-w-52 flex-1 text-sm font-medium text-evergreen-900">
          Search examinations or access code
          <Input name="q" defaultValue={sp.q ?? ""} placeholder="Title or exam code…" className="mt-1" />
        </label>
        <label className="w-44 text-sm font-medium text-evergreen-900">
          Link status
          <Select name="link" defaultValue={sp.link ?? ""} className="mt-1">
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="scheduled">Scheduled</option>
            <option value="expired">Expired</option>
            <option value="disabled">Disabled</option>
          </Select>
        </label>
        <Button type="submit" variant="outline">Apply</Button>
      </form>

      {filtered.length === 0 ? (
        <Card className="p-6 text-sm text-ink-soft">
          No examination links match this filter.
        </Card>
      ) : (
        <div className="space-y-4">
          {filtered.map(({ exam, lifecycle }) => {
            const shareUrl = `${origin}/exam/join/${exam.invite_token}`;
            const count = counts.get(exam.id) ?? { started: 0, submitted: 0, inProgress: 0 };
            return (
              <Card key={exam.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/dashboard/exams/${exam.id}`} className="font-display text-lg font-semibold text-evergreen-950 hover:underline">
                        {exam.title}
                      </Link>
                      <Badge tone={statusTone(lifecycle.status)}>{lifecycle.label}</Badge>
                      <Badge tone="gray">Exam: {exam.status}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-ink-soft">
                      Policy: {linkPolicyLabel(exam.invite_expiry_policy)} · {count.started} attempt(s) ({count.inProgress} in progress)
                      {exam.invite_activates_at && (
                        <> · Activates <LocalTime iso={exam.invite_activates_at} /></>
                      )}
                      {exam.invite_expires_at && !exam.invite_no_expiry && (
                        <> · Expires <LocalTime iso={exam.invite_expires_at} /></>
                      )}
                      {exam.invite_no_expiry && " · No expiration"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {canViewCredentials ? (
                      <>
                        <span className="rounded-lg bg-cream px-2.5 py-1 font-mono text-xs font-bold text-evergreen-900">
                          Code: {exam.access_code}
                        </span>
                        <CopyInvitation
                          text={`${exam.title} (${org.name})\nLink: ${shareUrl}\nCode: ${exam.access_code}`}
                          label="Copy invite"
                        />
                      </>
                    ) : (
                      <Badge tone="gray">Credentials protected (read-only)</Badge>
                    )}
                    <ButtonLink href={`/dashboard/exams/${exam.id}`} variant="outline" className="text-xs">
                      Manage exam →
                    </ButtonLink>
                  </div>
                </div>

                {canEdit && (
                  <div className="mt-4 grid gap-4 border-t border-evergreen-900/10 pt-4 lg:grid-cols-[1fr_auto]">
                    <form action={updateOrgExamLinkSettings} className="flex flex-wrap items-end gap-2.5">
                      <input type="hidden" name="exam_id" value={exam.id} />
                      <input type="hidden" name="back" value={backHref} />
                      <label className="text-xs font-medium text-evergreen-900">
                        Expiration mode
                        <Select name="expiry_mode" defaultValue="preset" className="mt-1 text-xs">
                          <option value="preset">Duration preset</option>
                          <option value="custom">Custom UTC date</option>
                          {policy.allowNoExpiry && <option value="none">No expiration</option>}
                        </Select>
                      </label>
                      <label className="text-xs font-medium text-evergreen-900">
                        Preset
                        <Select name="expiry_preset" defaultValue="24h" className="mt-1 text-xs">
                          {EXAM_LINK_DURATION_PRESETS.map((p) => (
                            <option key={p.key} value={p.key}>{p.label}</option>
                          ))}
                        </Select>
                      </label>
                      <label className="text-xs font-medium text-evergreen-900">
                        Custom expiry (UTC)
                        <Input
                          type="datetime-local"
                          name="expiry_custom"
                          defaultValue={utcInput(exam.invite_expires_at)}
                          className="mt-1 text-xs"
                        />
                      </label>
                      <label className="text-xs font-medium text-evergreen-900">
                        Activate at (UTC, optional)
                        <Input
                          type="datetime-local"
                          name="invite_activates_at"
                          defaultValue={utcInput(exam.invite_activates_at)}
                          className="mt-1 text-xs"
                        />
                      </label>
                      <Button type="submit" variant="primary" className="text-xs">Save link window</Button>
                    </form>

                    <div className="flex items-end gap-2">
                      {lifecycle.status !== "disabled" ? (
                        <form action={disableOrgExamLink}>
                          <input type="hidden" name="exam_id" value={exam.id} />
                          <input type="hidden" name="back" value={backHref} />
                          <Button type="submit" variant="outline" className="text-xs">Disable link</Button>
                        </form>
                      ) : (
                        <form action={reactivateOrgExamLink}>
                          <input type="hidden" name="exam_id" value={exam.id} />
                          <input type="hidden" name="expiry_mode" value="preset" />
                          <input type="hidden" name="expiry_preset" value="24h" />
                          <input type="hidden" name="back" value={backHref} />
                          <Button type="submit" variant="gold" className="text-xs">Reactivate (24h)</Button>
                        </form>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
