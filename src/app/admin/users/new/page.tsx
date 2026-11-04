import { Button, ButtonLink, Card, Field, Input, PageTitle, Select } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { ORG_ROLES } from "@/lib/brand";
import { createAdminClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { createUserAccount } from "../../actions/users";
import { Notice } from "../../ui";

export const metadata: Metadata = { title: "Create user" };
export const dynamic = "force-dynamic";

export default async function NewUserPage({
  searchParams,
}: {
  searchParams: Promise<{ e?: string }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const admin = createAdminClient();
  const { data: orgs } = await admin.from("organizations").select("id, name").order("name").limit(500);

  return (
    <>
      <PageTitle
        title="Create user / invite administrator"
        subtitle="Accounts are created through Supabase Auth. Invite mode emails a secure set-password link; password mode shows you a one-time temporary password."
        action={<ButtonLink href="/admin/users" variant="outline">← All users</ButtonLink>}
      />
      <Notice
        e={sp.e}
        messages={{
          email: "Enter a valid email address.",
          failed: "The account could not be created (the email may already exist).",
        }}
      />
      <Card className="max-w-3xl p-6">
        <form action={createUserAccount} className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name"><Input name="full_name" /></Field>
          <Field label="Email *"><Input name="email" type="email" required /></Field>
          <Field label="Access method">
            <Select name="mode" defaultValue="invite">
              <option value="invite">Email invitation (user sets their own password)</option>
              <option value="password">Generate a temporary password (shown once)</option>
            </Select>
          </Field>
          <Field label="Add to organization (optional)">
            <Select name="organization_id" defaultValue="">
              <option value="">— None —</option>
              {(orgs ?? []).map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Organization role">
            <Select name="role" defaultValue="teacher">
              {ORG_ROLES.filter((r) => r.value !== "owner").map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </Select>
          </Field>
          <div className="flex items-end gap-2 sm:col-span-2">
            <Button type="submit" variant="gold">Create user</Button>
            <p className="pb-2 text-xs text-ink-soft">
              Platform administrator (Super Admin) privileges are granted separately from the user&apos;s page — by the Primary Super Admin only.
            </p>
          </div>
        </form>
      </Card>
    </>
  );
}
