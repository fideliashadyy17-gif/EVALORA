import { PageNavigation } from "@/components/PageNavigation";
import { Badge, Button, ButtonLink, Card, Field, Input, PageTitle, Select, Textarea } from "@/components/ui";
import { ExaminationAccessCard } from "@/components/ExaminationAccessCard";
import { parseExamAccessSettings } from "@/lib/exam-access";
import { examLinkLifecycle } from "@/lib/examLink";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { updateExamInvitation } from "../../actions/event-operations";
import { Flash, Notice, Section, StatusBadge, Table } from "../../ui";

export const metadata: Metadata = { title: "Exam share links & codes" };
export const dynamic = "force-dynamic";

interface Exam {
  id: string; organization_id: string; title: string; status: string;
  access_code: string; invite_token: string; access_link: string;
  shared_link_enabled: boolean; invite_expires_at: string | null;
  starts_at: string | null; ends_at: string | null;
  event_id: string | null; class_id: string | null;
  settings: Record<string, unknown> | null;
  organizations: { name?: string } | null;
}

export default async function ExamInvitationsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; e?: string; exam?: string; page?: string }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const pageSize = 25;
  const admin = createAdminClient();
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "evalora-six.vercel.app";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const origin = `${proto}://${host}`;

  const { data: rows } = await admin
    .from("exams")
    .select("id,organization_id,title,status,access_code,invite_token,access_link,shared_link_enabled,invite_expires_at,starts_at,ends_at,event_id,class_id,settings,organizations(name)")
    .order("created_at", { ascending: false })
    .limit(300);
  const exams = (rows ?? []) as unknown as Exam[];
  const selected = exams.find((e) => e.id === sp.exam) ?? exams[0] ?? null;
  const accessLink = selected?.access_link || (selected ? `/exam/join/${selected.invite_token}` : "");
  const shareUrl = selected ? `${origin}${accessLink}` : "";
  const access = parseExamAccessSettings(selected?.settings);
  const { data: classRows } = selected
    ? await admin
      .from("classes")
      .select("id,name,organization_id")
      .eq("organization_id", selected.organization_id)
      .order("name")
      .limit(500)
    : { data: [] };
  const classes = (classRows ?? []) as { id: string; name: string; organization_id: string }[];

  return (
    <>
      <Flash />
      <PageTitle
        eyebrow="Examinations · Shareable Links & Identity Policy"
        title="Examination access: links, codes & candidate workflow"
        subtitle="Every examination has a persisted unique link and access code. Display both, copy the link, the code or the complete invitation, and configure availability, identity, class eligibility and attempt policy."
      />
      <Notice
        ok={sp.ok}
        e={sp.e}
        messages={{
          created: "Examination created. Its unique link and access code are persisted and ready below.",
          updated: "Invitation settings updated.",
          not_found: "Examination not found.",
          update_failed: "Could not update invitation settings.",
          json: "Additional identity fields must be a valid JSON array.",
        }}
      />

      <Card className="p-5">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <Field label="Examination" className="min-w-[320px] flex-1">
            <Select name="exam" defaultValue={selected?.id ?? ""}>
              {exams.map((e) => <option key={e.id} value={e.id}>{e.title} ({e.organizations?.name ?? "—"})</option>)}
            </Select>
          </Field>
          <Button type="submit" variant="outline">Open examination access</Button>
        </form>
      </Card>

      {!selected ? (
        <p className="mt-6 rounded-2xl border border-dashed border-evergreen-900/30 bg-paper px-6 py-12 text-center text-sm text-ink-soft">No examinations exist yet.</p>
      ) : (
        <>
          <div className="mt-6">
            <ExaminationAccessCard
              examTitle={selected.title}
              organizationName={selected.organizations?.name ?? "Organization"}
              shareUrl={shareUrl}
              accessLink={accessLink}
              accessCode={selected.access_code}
              exam={{
                status: selected.status,
                starts_at: selected.starts_at,
                ends_at: selected.ends_at,
                shared_link_enabled: selected.shared_link_enabled,
                invite_expires_at: selected.invite_expires_at,
                invite_activates_at: (selected as unknown as { invite_activates_at?: string | null }).invite_activates_at ?? null,
                invite_no_expiry: (selected as unknown as { invite_no_expiry?: boolean | null }).invite_no_expiry ?? false,
              }}
              settings={selected.settings}
            />
          </div>

          <Section title="Access controls" hint="These settings are enforced server-side on the shared-link page and admission API. Regenerating a link or code invalidates the previous value while preserving exams, candidates, attempts, answers, scores and results. Expiration presets, disable/reactivate and the full lifecycle live on the Link expiration page.">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge tone={examLinkLifecycle(selected).status === "active" ? "green" : "gray"}>
                Link {examLinkLifecycle(selected).label}
              </Badge>
              <ButtonLink href="/admin/examinations/links" variant="outline" className="px-3 py-2 text-xs">
                Edit link expiration, disable or reactivate
              </ButtonLink>
            </div>
            <Card className="p-5">
              <div className="grid gap-4 lg:grid-cols-3">
                <form action={updateExamInvitation} className="space-y-3">
                  <input type="hidden" name="exam_id" value={selected.id} /><input type="hidden" name="action" value="new_code" />
                  <p className="text-sm font-medium">Regenerate access code</p>
                  <p className="text-xs text-ink-soft">Use when a code has been shared too widely. The exam and all existing results stay intact.</p>
                  <Button type="submit" variant="outline">Generate new code</Button>
                </form>
                <form action={updateExamInvitation} className="space-y-3">
                  <input type="hidden" name="exam_id" value={selected.id} /><input type="hidden" name="action" value="new_link" />
                  <p className="text-sm font-medium">Regenerate shareable link</p>
                  <p className="text-xs text-ink-soft">The persisted access-link path is regenerated from the new token; the old token stops resolving.</p>
                  <Button type="submit" variant="outline">Generate new link</Button>
                </form>
                <form action={updateExamInvitation} className="space-y-3">
                  <input type="hidden" name="exam_id" value={selected.id} /><input type="hidden" name="action" value="settings" />
                  <Field label="Link enabled">
                    <Select name="shared_link_enabled" defaultValue={selected.shared_link_enabled ? "1" : "0"}>
                      <option value="1">Enabled</option><option value="0">Disabled</option>
                    </Select>
                  </Field>
                  <Field label="Link expiry (UTC)" hint="Entered in UTC. Leave empty to keep the current expiration unchanged; use the Link expiration page for 24 h / 7 d / 30 d presets, scheduled activation and no-expiry policy exemptions.">
                    <Input name="invite_expires_at" type="datetime-local" defaultValue={selected.invite_expires_at ? new Date(selected.invite_expires_at).toISOString().slice(0, 16) : ""} />
                  </Field>
                  <Field label="Candidate access mode" hint="Shared link needs no account; registered students only requires a verified student record.">
                    <Select name="access_mode" defaultValue={access.accessMode}>
                      <option value="shared_link">Shared link (no account required)</option>
                      <option value="registered_students_only">Registered students only</option>
                    </Select>
                  </Field>
                  <Field label="Re-entry / attempt policy">
                    <Select name="attempt_policy" defaultValue={access.attemptPolicy}>
                      <option value="single_resume">One attempt; resume while in progress</option>
                      <option value="read_only_reentry">Allow read-only return after submission</option>
                    </Select>
                  </Field>
                  <Field label="Additional identity fields (JSON array)" hint='Example: [{"key":"student_id","label":"Student ID","required":true,"type":"text"}]'>
                    <Textarea name="identity_fields" rows={4} className="font-mono text-xs" defaultValue={JSON.stringify(access.identityFields, null, 2)} />
                  </Field>
                  <Field label="Eligible classes (optional)" hint="Leave unselected to use the examination / same-stage phase class links.">
                    <Select name="eligible_class_ids" multiple defaultValue={access.eligibleClassIds} className="h-32">
                      {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </Select>
                  </Field>
                  <Button type="submit" variant="gold">Save access settings</Button>
                </form>
              </div>
            </Card>
          </Section>

          <Section title="All examination invitations" hint="Codes and links are shown to organizers only; candidates never receive private rosters or stored hashes.">
            <Table head={["Examination", "Organization", "Status", "Access code", "Persisted link", "Link status", "Expiry"]}>
              {exams.slice((page - 1) * pageSize, page * pageSize).map((e) => (
                <tr key={e.id}>
                  <td><Link className="text-evergreen-700 underline" href={`/admin/examinations/invitations?exam=${e.id}`}>{e.title}</Link></td>
                  <td>{e.organizations?.name ?? "—"}</td>
                  <td><StatusBadge status={e.status} /></td>
                  <td className="font-mono text-xs">{e.access_code}</td>
                  <td className="font-mono text-xs">{e.access_link || `/exam/join/${e.invite_token}`}</td>
                  <td>
                    <Badge tone={examLinkLifecycle(e).status === "active" ? "green" : "gray"}>{examLinkLifecycle(e).label}</Badge>
                  </td>
                  <td>{e.invite_expires_at ? new Date(e.invite_expires_at).toLocaleString() : "—"}</td>
                </tr>
              ))}
            </Table>
            <PageNavigation
              page={page}
              pageSize={pageSize}
              total={exams.length}
              pathname="/admin/examinations/invitations"
              query={{ exam: sp.exam }}
              label="invitations"
            />
          </Section>
        </>
      )}
    </>
  );
}
