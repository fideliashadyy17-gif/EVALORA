import { Button, ButtonLink, Card, Field, Input, PageTitle, Select, Textarea } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { ORG_TYPES } from "@/lib/brand";
import { createAdminClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { createOrganization } from "../../actions/orgs";
import { Notice } from "../../ui";

export const metadata: Metadata = { title: "Create organization" };
export const dynamic = "force-dynamic";

export default async function NewOrganizationPage({
  searchParams,
}: {
  searchParams: Promise<{ e?: string; suggest?: string }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const admin = createAdminClient();
  const { data: plans } = await admin.from("plans").select("id, name, trial_days").eq("is_active", true).order("sort");

  return (
    <>
      <PageTitle
        title="Create organization"
        subtitle="The organization is operational immediately — no customer checkout, no payment wall. Assign an owner now or operate it yourself."
        action={<ButtonLink href="/admin/organizations" variant="outline">← All organizations</ButtonLink>}
      />
      <Notice
        e={sp.e}
        messages={{
          name: "Organization name is required.",
          owner: "Provide the owner's email, or choose “Me (platform owner)”.",
          owner_failed: "Could not create or invite the owner account for that email.",
          failed: "Organization could not be created. Please try again.",
          subdomain: "That subdomain is reserved or invalid. Try one of the suggestions below.",
          subdomain_taken: "That subdomain is already used by another school. Try one of the suggestions below.",
        }}
      />

      {sp.suggest && <p className="mb-4 rounded-lg bg-cream px-4 py-3 text-sm text-ink">Available-style alternatives to try: <strong>{sp.suggest}</strong></p>}
      <form action={createOrganization} className="space-y-6">
        <Card className="p-6">
          <h2 className="font-display text-lg font-semibold text-evergreen-950">Organization profile</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Organization name *" className="sm:col-span-2">
              <Input name="name" required placeholder="e.g. Lycée Classique de Porto-Novo" />
            </Field>
            <Field label="School subdomain" hint="Portal address: <subdomain>.<root domain> — leave blank to generate from the name. Lowercase letters, numbers, hyphens.">
              <Input name="subdomain" placeholder="e.g. greenwood" />
            </Field>
            <Field label="Type">
              <Select name="type" defaultValue="school">
                {ORG_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Status">
              <Select name="status" defaultValue="active">
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
              </Select>
            </Field>
            <Field label="Description" className="sm:col-span-2">
              <Textarea name="description" rows={2} placeholder="What this organization is and whom it serves" />
            </Field>
            <Field label="Country"><Input name="country" placeholder="Benin" /></Field>
            <Field label="City"><Input name="city" placeholder="Porto-Novo" /></Field>
            <Field label="Address" className="sm:col-span-2"><Input name="address" /></Field>
            <Field label="Contact email"><Input name="contact_email" type="email" /></Field>
            <Field label="Contact phone"><Input name="contact_phone" /></Field>
            <Field label="Logo (optional)" hint="Image up to 2 MB. Shown in the workspace.">
              <Input name="logo" type="file" accept="image/*" />
            </Field>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="font-display text-lg font-semibold text-evergreen-950">Ownership & administrators</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Organization owner">
              <Select name="owner_mode" defaultValue="me">
                <option value="me">Me — the platform owner (operate it directly)</option>
                <option value="invite">Invite a new owner by email</option>
                <option value="create">Create the owner account (set-password email sent)</option>
              </Select>
            </Field>
            <Field label="Owner email" hint="If the email already has an EVALORA account, that account becomes owner.">
              <Input name="owner_email" type="email" placeholder="principal@school.example" />
            </Field>
            <Field label="Owner full name"><Input name="owner_name" /></Field>
            <Field label="Additional administrator email (optional)" hint="Existing users are added instantly; new emails receive an invitation.">
              <Input name="admin_email" type="email" />
            </Field>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="font-display text-lg font-semibold text-evergreen-950">Subscription arrangement</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Optional. Grants are recorded as administrative grants — never as payments.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Field label="Arrangement">
              <Select name="sub_mode" defaultValue="none">
                <option value="none">No subscription (Free plan limits)</option>
                <option value="trial">Start a free trial</option>
                <option value="grant">Grant complimentary Premium access</option>
              </Select>
            </Field>
            <Field label="Plan">
              <Select name="plan_id">
                {(plans ?? []).map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Grant length (months) / trial uses plan days">
              <Input name="grant_months" type="number" min={1} max={60} defaultValue={12} />
            </Field>
          </div>
          <Field label="Internal notes" className="mt-4">
            <Textarea name="notes" rows={2} placeholder="Visible only to administrators" />
          </Field>
        </Card>

        <div className="flex gap-3">
          <Button type="submit" variant="gold">Create organization</Button>
          <ButtonLink href="/admin/organizations" variant="ghost">Cancel</ButtonLink>
        </div>
      </form>
    </>
  );
}
