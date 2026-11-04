import { Button, Card, Field, Input, Select, Textarea } from "@/components/ui";
import { ORG_TYPES } from "@/lib/brand";
import { tenantPortalLabel } from "@/lib/tenant";
import { setOrgStatus } from "../../../actions";
import { deleteOrganization, enterOrgWorkspace, updateOrganization } from "../../../actions/orgs";
import { ConfirmField, Notice, Section } from "../../../ui";

interface OrgRow {
  id: string;
  name: string;
  slug: string;
  type: string;
  status: string;
  description: string | null;
  country: string | null;
  city: string | null;
  address: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  logo_url: string | null;
  settings: Record<string, unknown> | null;
  is_demo?: boolean;
  portal_enabled?: boolean;
}

export function OverviewTab({ org, sp }: { org: OrgRow; sp: { ok?: string; e?: string } }) {
  const notes = (org.settings?.notes as string | undefined) ?? "";
  const shortcuts: [string, string][] = [
    ["/dashboard", "Organization overview"],
    ["/dashboard/quizzes/new", "Create a quiz"],
    ["/dashboard/questions/new", "Add questions"],
    ["/dashboard/exams/new", "Create an examination"],
    ["/dashboard/reports", "Reports & results"],
    ["/dashboard/team", "Team & roles"],
  ];

  return (
    <>
      <Notice
        ok={sp.ok}
        e={sp.e}
        messages={{
          saved: "Organization profile saved.",
          created: "Organization created — it is fully operational. Open the workspace to start building content.",
          confirm: "Tick the confirmation box to delete.",
          archive_first: "Archive the organization before permanent deletion.",
          demo_protected: "The EVALORA DEMO organization is protected: its subdomain cannot change and it cannot be deleted.",
          subdomain: "That subdomain is reserved or invalid.",
          subdomain_taken: "That subdomain is already used by another school.",
          save_failed: "The organization could not be saved.",
        }}
      />

      <Card className="p-5">
        <h2 className="font-display text-base font-semibold text-evergreen-950">Operate this organization</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Administrative workspace mode gives you the full organization toolset — quizzes, question bank,
          examinations, live hosting, proctoring, reports — with every entry and exit audit-logged.
          As platform owner you are never limited by this organization&apos;s plan while operating it.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {shortcuts.map(([next, label]) => (
            <form key={next} action={enterOrgWorkspace}>
              <input type="hidden" name="organization_id" value={org.id} />
              <input type="hidden" name="next" value={next} />
              <Button type="submit" variant="outline">{label} →</Button>
            </form>
          ))}
        </div>
      </Card>

      <Section title="Organization profile">
        <Card className="p-6">
          <form action={updateOrganization} className="space-y-4">
            <input type="hidden" name="id" value={org.id} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Organization name *"><Input name="name" required defaultValue={org.name} /></Field>
              <Field label="Type">
                <Select name="type" defaultValue={org.type}>
                  {ORG_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Description" className="sm:col-span-2">
                <Textarea name="description" rows={2} defaultValue={org.description ?? ""} />
              </Field>
              <Field label="Country"><Input name="country" defaultValue={org.country ?? ""} /></Field>
              <Field label="City"><Input name="city" defaultValue={org.city ?? ""} /></Field>
              <Field label="Address" className="sm:col-span-2"><Input name="address" defaultValue={org.address ?? ""} /></Field>
              <Field label="Contact email"><Input name="contact_email" type="email" defaultValue={org.contact_email ?? ""} /></Field>
              <Field label="Contact phone"><Input name="contact_phone" defaultValue={org.contact_phone ?? ""} /></Field>
              <Field label="Replace logo">
                <Input name="logo" type="file" accept="image/*" />
              </Field>
              <Field label="School subdomain / portal" hint={`Portal: ${tenantPortalLabel(org.slug)} · path: /portal/${org.slug}`}>
                <Input name="slug" defaultValue={org.slug} disabled={Boolean(org.is_demo)} readOnly={Boolean(org.is_demo)} />
              </Field>
              <label className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" name="portal_enabled" className="h-4 w-4 accent-evergreen-700" defaultChecked={org.portal_enabled !== false} /> Public school portal enabled
              </label>
              {org.is_demo && <p className="text-sm font-semibold text-gold-800 sm:col-span-2">DEMONSTRATION ORGANIZATION — protected from deletion and subdomain changes.</p>}
              <Field label="Internal notes (admins only)" className="sm:col-span-2">
                <Textarea name="notes" rows={2} defaultValue={notes} />
              </Field>
              {org.logo_url && (
                <label className="flex items-center gap-2 text-sm text-ink">
                  <input type="checkbox" name="remove_logo" className="h-4 w-4 accent-evergreen-700" /> Remove current logo
                </label>
              )}
            </div>
            <Button type="submit">Save profile</Button>
          </form>
        </Card>
      </Section>

      <Section title="Lifecycle & danger zone" hint="Suspension locks members out instantly. Archiving is the reversible step before permanent deletion.">
        <Card className="space-y-5 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium text-ink">{org.status === "active" ? "Suspend workspace" : "Reactivate workspace"}</p>
              <p className="text-sm text-ink-soft">Current status: <strong className="capitalize">{org.status}</strong></p>
            </div>
            <div className="flex gap-2">
              {org.status !== "active" ? (
                <form action={setOrgStatus}>
                  <input type="hidden" name="id" value={org.id} />
                  <input type="hidden" name="status" value="active" />
                  <Button type="submit">Reactivate</Button>
                </form>
              ) : (
                <>
                  <form action={setOrgStatus}>
                    <input type="hidden" name="id" value={org.id} />
                    <input type="hidden" name="status" value="suspended" />
                    <Button type="submit" variant="outline">Suspend</Button>
                  </form>
                  <form action={setOrgStatus}>
                    <input type="hidden" name="id" value={org.id} />
                    <input type="hidden" name="status" value="archived" />
                    <Button type="submit" variant="outline">Archive</Button>
                  </form>
                </>
              )}
            </div>
          </div>

          {org.is_demo && <p className="border-t border-evergreen-900/10 pt-4 text-sm text-ink">This permanent demonstration school cannot be deleted. Use “Reset DEMO” in the organization tools to restore its sample data.</p>}
          {org.status === "archived" && !org.is_demo && (
            <form action={deleteOrganization} className="space-y-3 border-t border-red-200 pt-4">
              <input type="hidden" name="id" value={org.id} />
              <p className="font-medium text-red-800">Permanently delete this organization</p>
              <p className="text-sm text-ink-soft">
                This removes the organization and cascades to its members, students, classes, quizzes,
                examinations, competitions, subscriptions and payment records. The action itself is
                preserved in the platform audit log. This cannot be undone.
              </p>
              <ConfirmField label={`Yes — permanently delete “${org.name}” and all of its data`} />
              <Button type="submit" variant="danger">Delete organization permanently</Button>
            </form>
          )}
        </Card>
      </Section>
    </>
  );
}
