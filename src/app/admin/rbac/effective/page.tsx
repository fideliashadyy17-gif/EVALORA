import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { listPermissions } from "@/lib/rbac";
import { Badge, Button, ButtonLink, Field, PageTitle, Select } from "@/components/ui";
import { Table } from "../../ui";
import { rbacSetOverride } from "../actions";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Effective Permissions & Overrides" };
export const dynamic = "force-dynamic";

export default async function Effective({
  searchParams,
}: {
  searchParams: Promise<{ organization?: string; user?: string }>;
}) {
  await requireSuperAdmin();
  const query = await searchParams;
  const client = await createClient();
  const admin = createAdminClient();

  const [permissions, { data: organizations }, { data: profiles }] = await Promise.all([
    listPermissions(),
    admin.from("organizations").select("id, name, slug").order("name").limit(200),
    admin.from("profiles").select("id, email, full_name").order("email").limit(500),
  ]);

  let effective: Record<string, boolean> | null = null;
  let overrides: { permission_id: string; granted: boolean }[] = [];
  let inspectError: string | null = null;

  if (query.organization && query.user) {
    const [{ data, error }, { data: rows, error: overrideError }] = await Promise.all([
      client.rpc("access_inspect_permissions", { p_user: query.user, p_org: query.organization }),
      admin
        .from("access_permission_overrides")
        .select("permission_id, granted")
        .eq("user_id", query.user)
        .eq("organization_id", query.organization),
    ]);
    if (error || overrideError) {
      inspectError = "Permission inspection failed. Verify the selected user and organization.";
    } else {
      effective = data as Record<string, boolean>;
      overrides = rows ?? [];
    }
  }

  return (
    <>
      <PageTitle
        eyebrow="Platform Administration · RBAC & User Role Management"
        title="Effective permissions & overrides"
        subtitle="Inspect a user's effective permissions in one organization. Global disables, explicit denies, and the School Founder read-only ceiling always win."
        action={
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/admin/rbac/assignments" variant="outline">Role assignments</ButtonLink>
            <ButtonLink href="/admin/rbac" variant="outline">← RBAC overview</ButtonLink>
          </div>
        }
      />

      <form className="mb-6 grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end" method="get">
        <Field label="Organization">
          <Select name="organization" defaultValue={query.organization ?? ""} required>
            <option value="">Select organization…</option>
            {(organizations ?? []).map((o) => (
              <option key={o.id} value={o.id}>
                {o.name} ({o.slug})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="User (by email)">
          <Select name="user" defaultValue={query.user ?? ""} required>
            <option value="">Select user…</option>
            {(profiles ?? []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.email} {u.full_name ? `— ${u.full_name}` : ""}
              </option>
            ))}
          </Select>
        </Field>
        <Button type="submit">Inspect effective access</Button>
      </form>

      {inspectError && (
        <p role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">
          {inspectError}
        </p>
      )}

      {effective && (
        <Table head={["Permission", "Global state", "User override", "Effective", "Change override"]} label="Effective permissions">
          {permissions.map((p) => {
            const override = overrides.find((o) => o.permission_id === p.id);
            return (
              <tr key={p.id}>
                <td>
                  <strong>{p.name}</strong>
                  <code className="block text-xs text-ink-soft">{p.key}</code>
                </td>
                <td>
                  <Badge tone={p.enabled ? "green" : "red"}>{p.enabled ? "Enabled" : "Disabled"}</Badge>
                </td>
                <td className="text-xs">
                  {override ? (override.granted ? "Allow" : "Deny") : "Inherit assigned roles"}
                </td>
                <td>
                  <Badge tone={effective[p.key] ? "green" : "gray"}>
                    {effective[p.key] ? "Allowed" : "Denied"}
                  </Badge>
                </td>
                <td>
                  <form className="flex gap-2" action={rbacSetOverride}>
                    <input type="hidden" name="organization_id" value={query.organization} />
                    <input type="hidden" name="user_id" value={query.user} />
                    <input type="hidden" name="permission_id" value={p.id} />
                    <Select
                      name="state"
                      defaultValue={override ? (override.granted ? "allow" : "deny") : "inherit"}
                    >
                      <option value="inherit">Inherit</option>
                      <option value="allow">Allow</option>
                      <option value="deny">Deny</option>
                    </Select>
                    <Button variant="outline">Save</Button>
                  </form>
                </td>
              </tr>
            );
          })}
        </Table>
      )}
    </>
  );
}
