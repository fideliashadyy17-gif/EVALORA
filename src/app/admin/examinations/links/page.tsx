import { PageNavigation } from "@/components/PageNavigation";
import { Badge, Button, ButtonLink, Card, Input, PageTitle, Select, StatCard } from "@/components/ui";
import { CopyInvitation } from "@/components/CopyInvitation";
import { LocalTime } from "@/components/LocalTime";
import { requireSuperAdmin } from "@/lib/auth";
import {
  EXAM_LINK_DURATION_PRESETS,
  examLinkLifecycle,
  linkPolicyLabel,
  type ExamLinkStatus,
} from "@/lib/examLink";
import { loadExamLinkPolicy, loadLinkAttemptCounts } from "@/lib/examLinkServer";
import { createAdminClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { Flash, Notice, Section } from "../../ui";
import {
  disableExamLinkAsAdmin,
  reactivateExamLinkAsAdmin,
  updateExamLinkPolicyAsAdmin,
  updateExamLinkSettingsAsAdmin,
} from "../link-actions";

export const metadata: Metadata = { title: "Examination link expiration" };
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
  organizations: { name?: string } | null;
}

const MESSAGES: Record<string, string> = {
  link_updated: "Link expiration settings saved. The link URL and examination code were preserved.",
  link_disabled: "Link disabled. New attempts cannot start; attempts already in progress continue normally.",
  link_reactivated: "Link reactivated with a valid expiration.",
  policy_updated: "Platform link policy updated.",
  exam: "That examination no longer exists.",
  expiry: "That expiration is not valid. Choose a future date and time.",
  activation: "The activation time must be readable and earlier than the expiration.",
  reactivate_expiry: "Set a valid future expiration before reactivating this link.",
  failed: "The change could not be saved.",
  link_already_disabled: "That link is already disabled.",
};

/** UTC value for a datetime-local input (the field is labelled as UTC). */
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

export default async function ExamLinksPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; link?: string; ok?: string; e?: string; page?: string }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const pageSize = 15;
  const admin = createAdminClient();
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "evalora-six.vercel.app";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const origin = `${proto}://${host}`;

  const [{ data: rows }, policy] = await Promise.all([
    admin
      .from("exams")
      .select("id,organization_id,title,status,access_code,invite_token,access_link,shared_link_enabled,invite_expires_at,invite_activates_at,invite_disabled_at,invite_no_expiry,invite_expiry_policy,starts_at,ends_at,created_at,organizations(name)")
      .order("created_at", { ascending: false })
      .limit(300),
    loadExamLinkPolicy(admin),
  ]);
  const exams = ((rows ?? []) as unknown as ExamRow[]).filter((exam) =>
    !sp.q || exam.title.toLowerCase().includes(sp.q.toLowerCase()) || exam.access_code.toLowerCase().includes(sp.q.toLowerCase()),
  );
  const counts = await loadLinkAttemptCounts(admin, exams.map((exam) => exam.id));

  const withLifecycle = exams.map((exam) => ({ exam, lifecycle: examLinkLifecycle(exam) }));
  const filtered = sp.link
    ? withLifecycle.filter((row) => row.lifecycle.status === sp.link)
    : withLifecycle;
  const totals = {
    active: withLifecycle.filter((r) => r.lifecycle.status === "active").length,
    scheduled: withLifecycle.filter((r) => r.lifecycle.status === "scheduled").length,
    expired: withLifecycle.filter((r) => r.lifecycle.status === "expired").length,
    disabled: withLifecycle.filter((r) => r.lifecycle.status === "disabled").length,
  };

  return (
    <>
      <Flash />
      <PageTitle
        eyebrow="Examinations · Link Expiration & Lifecycle Governance"
        title="Examination link expiration & lifecycle"
        subtitle="Every examination link has an explicit expiration, a status and a full audit trail. Expiration only stops NEW starts — a candidate who has already begun keeps their timer, answers and deadline."
        action={<ButtonLink href="/admin/examinations/invitations" variant="outline">Share links & access codes</ButtonLink>}
      />
      <Notice ok={sp.ok} e={sp.e} messages={MESSAGES} />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active links" value={totals.active} />
        <StatCard label="Scheduled links" value={totals.scheduled} />
        <StatCard label="Expired links" value={totals.expired} />
        <StatCard label="Disabled links" value={totals.disabled} />
      </div>

      <form method="get" className="mb-5 flex flex-wrap items-end gap-2">
        <div className="min-w-[240px] flex-1">
          <Input name="q" defaultValue={sp.q} placeholder="Search examination title or access code…" aria-label="Search examinations" />
        </div>
        <Select name="link" defaultValue={sp.link ?? ""} className="w-48" aria-label="Link status">
          <option value="">All link statuses</option>
          <option value="active">Active</option>
          <option value="scheduled">Scheduled</option>
          <option value="expired">Expired</option>
          <option value="disabled">Disabled</option>
        </Select>
        <Button type="submit" variant="outline">Filter</Button>
        {(sp.q || sp.link) && (
          <Link href="/admin/examinations/links" className="inline-flex min-h-10 items-center px-2.5 text-sm font-medium text-evergreen-800 underline underline-offset-2">
            Reset
          </Link>
        )}
      </form>

      <Section
        title="Link lifecycle"
        hint="Status is computed from the server clock: an expired link is never shown as active merely because nobody disabled it. Editing settings preserves the link URL and the examination code."
      >
        {filtered.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-evergreen-900/30 bg-paper px-6 py-10 text-center text-sm text-ink-soft">
            No examination links match this filter.
          </p>
        ) : (
          <>
            <div className="space-y-4">
              {filtered.slice((page - 1) * pageSize, page * pageSize).map(({ exam, lifecycle }) => {
              const linkPath = exam.access_link || `/exam/join/${exam.invite_token}`;
              const shareUrl = `${origin}${linkPath}`;
              const examCounts = counts.get(exam.id) ?? { started: 0, submitted: 0, inProgress: 0 };
              return (
                <Card key={exam.id} className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-display text-lg font-semibold text-evergreen-950">{exam.title}</p>
                      <p className="text-sm text-ink-soft">
                        {exam.organizations?.name ?? "Organization"} · examination status <strong>{exam.status}</strong>
                      </p>
                      <p className="mt-1 break-all font-mono text-xs text-ink-soft">{linkPath} · code {exam.access_code}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={statusTone(lifecycle.status)}>{lifecycle.label}</Badge>
                      <Badge tone="gray">{linkPolicyLabel(exam.invite_expiry_policy)}</Badge>
                    </div>
                  </div>

                  <p className="mt-2 text-sm text-ink">{lifecycle.detail}</p>

                  <dl className="mt-4 grid gap-3 rounded-xl border border-evergreen-900/10 bg-cream/60 p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Created</dt>
                      <dd className="mt-0.5"><LocalTime iso={exam.created_at} /></dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Activation</dt>
                      <dd className="mt-0.5">
                        {exam.invite_activates_at ? <LocalTime iso={exam.invite_activates_at} /> : "Immediate"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Expiration</dt>
                      <dd className="mt-0.5">
                        {exam.invite_no_expiry ? (
                          <span className="font-medium text-amber-800">No expiration (policy exemption)</span>
                        ) : (
                          <LocalTime iso={exam.invite_expires_at} fallback="Not set" />
                        )}
                        {exam.invite_disabled_at && (
                          <span className="block text-xs text-ink-soft">Disabled <LocalTime iso={exam.invite_disabled_at} /></span>
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Students started / submitted</dt>
                      <dd className="mt-0.5 tabular-nums">
                        {examCounts.started} / {examCounts.submitted}
                        <span className="block text-xs text-ink-soft">{examCounts.inProgress} in progress</span>
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <CopyInvitation text={shareUrl} label="Copy link" />
                    <CopyInvitation text={exam.access_code} label="Copy code" />
                    <ButtonLink href={`/admin/examinations/invitations?exam=${exam.id}`} variant="outline" className="px-3 py-2 text-xs">
                      View examination access
                    </ButtonLink>
                    <ButtonLink href={`/admin/examinations/candidates?exam=${exam.id}`} variant="outline" className="px-3 py-2 text-xs">
                      View candidates
                    </ButtonLink>
                  </div>

                  <details className="mt-4 rounded-xl border border-evergreen-900/15 bg-white p-4">
                    <summary className="cursor-pointer text-sm font-semibold text-evergreen-900">Edit link settings</summary>
                    <div className="mt-3 grid gap-4 lg:grid-cols-2">
                      <form action={updateExamLinkSettingsAsAdmin} className="space-y-3">
                        <input type="hidden" name="exam_id" value={exam.id} />
                        <input type="hidden" name="back" value="/admin/examinations/links" />
                        <p className="text-sm font-medium">Expiration</p>
                        <Select name="expiry_mode" defaultValue="preset" aria-label="Expiration mode">
                          <option value="preset">Duration preset</option>
                          <option value="custom">Custom date &amp; time</option>
                          {policy.allowNoExpiry && <option value="none">No expiration (policy exemption)</option>}
                        </Select>
                        <Select name="expiry_preset" defaultValue="30d" aria-label="Expiration duration">
                          {EXAM_LINK_DURATION_PRESETS.map((preset) => (
                            <option key={preset.key} value={preset.key}>{preset.label}</option>
                          ))}
                        </Select>
                        <div>
                          <Input
                            name="expiry_custom"
                            type="datetime-local"
                            defaultValue={utcInput(exam.invite_expires_at)}
                            aria-label="Custom expiration (UTC)"
                          />
                          <p className="mt-1 text-xs text-ink-soft">Custom values are entered in UTC; the saved instant is displayed in your local timezone.</p>
                        </div>
                        <div>
                          <Input
                            name="invite_activates_at"
                            type="datetime-local"
                            defaultValue={utcInput(exam.invite_activates_at)}
                            aria-label="Scheduled activation (UTC)"
                          />
                          <p className="mt-1 text-xs text-ink-soft">Optional scheduled activation (UTC). Leave empty to make the link usable immediately.</p>
                        </div>
                        <Button type="submit" variant="gold">Save link settings</Button>
                      </form>

                      <div className="space-y-4">
                        <div className="rounded-lg bg-cream/70 p-3 text-xs text-ink-soft">
                          Regenerating the link or code is a separate action on the share-links page. Editing expiration here never changes the URL students already hold, and never deletes or modifies an examination or an attempt.
                        </div>
                        {exam.shared_link_enabled ? (
                          <form action={disableExamLinkAsAdmin} className="space-y-2">
                            <input type="hidden" name="exam_id" value={exam.id} />
                            <input type="hidden" name="back" value="/admin/examinations/links" />
                            <p className="text-sm font-medium">Disable link</p>
                            <label className="flex items-start gap-2 text-xs text-ink">
                              <input type="checkbox" name="confirm" className="mt-0.5 h-4 w-4 accent-evergreen-700" />
                              <span>I understand new attempts cannot start. Attempts already in progress continue.</span>
                            </label>
                            <Button type="submit" variant="outline">Disable link</Button>
                          </form>
                        ) : (
                          <form action={reactivateExamLinkAsAdmin} className="space-y-2">
                            <input type="hidden" name="exam_id" value={exam.id} />
                            <input type="hidden" name="back" value="/admin/examinations/links" />
                            <p className="text-sm font-medium">Reactivate link</p>
                            <Select name="expiry_mode" defaultValue="preset" aria-label="Reactivation expiration mode">
                              <option value="preset">Duration preset</option>
                              <option value="custom">Custom date &amp; time</option>
                              {policy.allowNoExpiry && <option value="none">No expiration (policy exemption)</option>}
                            </Select>
                            <Select name="expiry_preset" defaultValue="30d" aria-label="Reactivation duration">
                              {EXAM_LINK_DURATION_PRESETS.map((preset) => (
                                <option key={preset.key} value={preset.key}>{preset.label}</option>
                              ))}
                            </Select>
                            <Input name="expiry_custom" type="datetime-local" aria-label="Reactivation custom expiration (UTC)" />
                            <p className="text-xs text-ink-soft">A reactivated link always needs a valid future expiration (UTC for custom values).</p>
                            <Button type="submit" variant="gold">Reactivate with valid expiration</Button>
                          </form>
                        )}
                      </div>
                    </div>
                  </details>
                </Card>
              );
            })}
            </div>
            <PageNavigation
              page={page}
              pageSize={pageSize}
              total={filtered.length}
              pathname="/admin/examinations/links"
              query={{ q: sp.q, link: sp.link }}
              label="examination links"
            />
          </>
        )}
      </Section>

      <Section
        title="Platform link policy"
        hint="Permanent examination links are not created silently. They are only possible when this policy explicitly permits them, and every change is audited."
      >
        <Card className="p-5">
          <form action={updateExamLinkPolicyAsAdmin} className="flex flex-wrap items-end gap-4">
            <input type="hidden" name="back" value="/admin/examinations/links" />
            <label className="flex items-start gap-2 text-sm text-ink">
              <input type="checkbox" name="allow_no_expiry" value="1" defaultChecked={policy.allowNoExpiry} className="mt-0.5 h-5 w-5 accent-evergreen-700" />
              <span>Permit administrators to choose “No expiration” for a link</span>
            </label>
            <div className="w-40">
              <Input name="default_days" type="number" min={1} max={365} defaultValue={policy.defaultDays} aria-label="Default expiration in days" />
              <p className="mt-1 text-xs text-ink-soft">Default duration (days)</p>
            </div>
            <Button type="submit" variant="outline">Save policy</Button>
          </form>
          <p className="mt-3 text-xs text-ink-soft">
            Current policy: {policy.allowNoExpiry ? "permanent links permitted by explicit exemption" : "every link must expire"} · default {policy.defaultDays} days.
          </p>
        </Card>
      </Section>

      <Section title="Expiration vs. active attempts" hint="The rule the backend enforces.">
        <Card className="p-5 text-sm text-ink">
          <ul className="list-disc space-y-2 pl-5">
            <li>Expiration and manual disable stop <strong>new</strong> examination starts only.</li>
            <li>An attempt that was started before expiration keeps its server timer, deadline, answers, autosave and submission rights.</li>
            <li>Submitted attempts remain readable exactly as the examination&apos;s publication settings allow.</li>
            <li>The server clock decides. A candidate changing their device clock or timezone cannot reopen a link.</li>
            <li>An approved retake keeps working through its own Super Admin-defined access window; starting it still requires the examination to be open.</li>
          </ul>
        </Card>
      </Section>
    </>
  );
}
