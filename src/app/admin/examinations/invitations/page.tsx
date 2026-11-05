import { Badge, Button, Card, Field, Input, PageTitle, Select } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { updateExamInvitation } from "../../actions/event-operations";
import { Flash, Notice, Section, StatusBadge, Table } from "../../ui";
import { CopyInvitation } from "./CopyInvitation";

export const metadata: Metadata = { title: "Exam share links & codes" };
export const dynamic = "force-dynamic";

interface Exam {
  id: string; organization_id: string; title: string; status: string;
  access_code: string; invite_token: string; shared_link_enabled: boolean;
  invite_expires_at: string | null; event_id: string | null; class_id: string | null; settings: Record<string, unknown> | null;
  organizations: { name?: string } | null;
}

export default async function ExamInvitationsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; e?: string; exam?: string }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const admin = createAdminClient();
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "evalora-six.vercel.app";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const origin = `${proto}://${host}`;

  const { data: rows } = await admin
    .from("exams")
    .select("id,organization_id,title,status,access_code,invite_token,shared_link_enabled,invite_expires_at,event_id,class_id,settings,organizations(name)")
    .order("created_at", { ascending: false })
    .limit(300);
  const exams = (rows ?? []) as unknown as Exam[];
  const selected = exams.find((e) => e.id === sp.exam) ?? exams[0] ?? null;
  const shareUrl = selected ? `${origin}/exam/join/${selected.invite_token}` : "";
  const attemptPolicy = typeof selected?.settings?.attempt_policy === "string" ? String(selected.settings.attempt_policy) : "single_resume";

  return (
    <>
      <Flash />
      <PageTitle
        title="Share links & access codes"
        subtitle="One general shareable link per examination plus a server-verified access code. No per-candidate named URL and no forced EVALORA account. Candidates enter both first and last name; class is validated server-side."
      />
      <Notice ok={sp.ok} e={sp.e} messages={{ updated: "Invitation settings updated.", not_found: "Examination not found.", update_failed: "Could not update invitation settings." }} />

      <Card className="p-5">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <Field label="Examination" className="min-w-[320px] flex-1">
            <Select name="exam" defaultValue={selected?.id ?? ""}>
              {exams.map((e) => <option key={e.id} value={e.id}>{e.title} ({e.organizations?.name ?? "—"})</option>)}
            </Select>
          </Field>
          <Button type="submit" variant="outline">Open invitation</Button>
        </form>
      </Card>

      {!selected ? (
        <p className="mt-6 rounded-2xl border border-dashed border-evergreen-900/30 bg-paper px-6 py-12 text-center text-sm text-ink-soft">No examinations exist yet.</p>
      ) : (
        <>
          <Section title={selected.title} hint={`${selected.organizations?.name ?? "Organization"} · existing Examination module · no question count or status changed`}>
            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="p-5">
                <div className="flex items-center gap-2"><Badge tone="gold">1</Badge><h3 className="font-display text-lg font-semibold">Shareable link</h3><StatusBadge status={selected.shared_link_enabled ? "open" : "closed"} /></div>
                <p className="mt-1 text-sm text-ink-soft">General link — not personalized. The link identifies the examination; the access code authorizes entry.</p>
                <div className="mt-3 flex gap-2">
                  <Input readOnly value={shareUrl} className="font-mono text-xs" />
                  <CopyInvitation text={shareUrl} label="Copy link" />
                </div>
                <a className="mt-2 inline-block text-sm text-evergreen-700 underline" href={`/exam/join/${selected.invite_token}`} target="_blank" rel="noreferrer">Open candidate access page</a>
              </Card>
              <Card className="p-5">
                <div className="flex items-center gap-2"><Badge tone="gold">2</Badge><h3 className="font-display text-lg font-semibold">Access code</h3><StatusBadge status={selected.status} /></div>
                <p className="mt-1 text-sm text-ink-soft">The candidate enters this code on the link page. It is validated server-side against a stored hash, never trusted from the client.</p>
                <div className="mt-3 flex gap-2">
                  <Input readOnly value={selected.access_code} className="text-center font-display text-xl font-bold uppercase tracking-[0.2em]" />
                  <CopyInvitation text={selected.access_code} label="Copy code" />
                </div>
              </Card>
            </div>
          </Section>

          <Section title="Invitation controls" hint="Regenerating a link or code invalidates the previous value while preserving exams, candidates, attempts, answers, scores and results.">
            <Card className="p-5">
              <div className="grid gap-4 lg:grid-cols-3">
                <form action={updateExamInvitation} className="space-y-3">
                  <input type="hidden" name="exam_id" value={selected.id} /><input type="hidden" name="action" value="new_code" />
                  <p className="text-sm font-medium">Regenerate access code</p><p className="text-xs text-ink-soft">Use when a code has been shared too widely.</p>
                  <Button type="submit" variant="outline">Generate new code</Button>
                </form>
                <form action={updateExamInvitation} className="space-y-3">
                  <input type="hidden" name="exam_id" value={selected.id} /><input type="hidden" name="action" value="new_link" />
                  <p className="text-sm font-medium">Regenerate shareable link</p><p className="text-xs text-ink-soft">Old link token stops resolving to this exam.</p>
                  <Button type="submit" variant="outline">Generate new link</Button>
                </form>
                <form action={updateExamInvitation} className="space-y-3">
                  <input type="hidden" name="exam_id" value={selected.id} /><input type="hidden" name="action" value="settings" />
                  <Field label="Link enabled"><Select name="shared_link_enabled" defaultValue={selected.shared_link_enabled ? "1" : "0"}><option value="1">Enabled</option><option value="0">Disabled</option></Select></Field>
                  <Field label="Link expiry (optional)"><Input name="invite_expires_at" type="datetime-local" defaultValue={selected.invite_expires_at ? new Date(selected.invite_expires_at).toISOString().slice(0, 16) : ""} /></Field>
                  <Field label="Re-entry / attempt policy">
                    <Select name="attempt_policy" defaultValue={attemptPolicy}>
                      <option value="single_resume">One attempt; resume while in progress</option>
                      <option value="read_only_reentry">Allow read-only return after submission</option>
                    </Select>
                  </Field>
                  <Button type="submit" variant="gold">Save invitation settings</Button>
                </form>
              </div>
            </Card>
          </Section>

          <Section title="All examination invitations" hint="Codes and links are shown to organizers only; candidates never receive private rosters.">
            <Table head={["Examination", "Organization", "Status", "Access code", "Link", "Expiry"]}>
              {exams.map((e) => (
                <tr key={e.id}>
                  <td><a className="text-evergreen-700 underline" href={`/admin/examinations/invitations?exam=${e.id}`}>{e.title}</a></td>
                  <td>{e.organizations?.name ?? "—"}</td>
                  <td><StatusBadge status={e.status} /></td>
                  <td className="font-mono text-xs">{e.access_code}</td>
                  <td>{e.shared_link_enabled ? <StatusBadge status="open" /> : <StatusBadge status="closed" />}</td>
                  <td>{e.invite_expires_at ? new Date(e.invite_expires_at).toLocaleString() : "—"}</td>
                </tr>
              ))}
            </Table>
          </Section>
        </>
      )}
    </>
  );
}
