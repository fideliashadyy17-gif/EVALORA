
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import {
  rbacListRolesAction,
  rbacListPermissionsAction,
  rbacCreateCustomRoleAction,
  rbacUpdateCustomRoleAction,
  rbacDeleteCustomRoleAction,
  rbacGetRoleAction,
} from "../actions";
import type { RbacRole, RbacPermission } from "@/lib/rbac";
import { Badge, Button, ButtonLink, PageTitle, Field, Input, Textarea } from "@/components/ui";
import { Section, Table, Notice } from "@/app/admin/ui";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Manage Roles" };
export const dynamic = "force-dynamic";

export default async function ManageRoles({
  searchParams,
}: { searchParams: Promise<{ edit?: string; duplicate?: string; ok?: string }> }) {
  await requireSuperAdmin();
  const admin = createAdminClient();

  const [rolesResult, permissionsResult, editResult] =
    await Promise.all([
      rbacListRolesAction(),
      rbacListPermissionsAction(),
      rbacGetRoleAction(String((await searchParams).edit ?? (await searchParams).duplicate ?? "")),
    ]);

  const { data: organizations, error: orgError } = await admin.from("organizations").select("id,name").order("name");
  if (orgError) throw new Error(orgError.message);
  const sp = await searchParams;

  if (!rolesResult.ok) throw new Error(rolesResult.error);
  if (!permissionsResult.ok) throw new Error(permissionsResult.error);
  const roles: RbacRole[] = rolesResult.ok ? rolesResult.roles : [];
  const permissions: RbacPermission[] = permissionsResult.ok ? permissionsResult.permissions : [];
  const editing = editResult.ok ? editResult.role : null;
  const isDuplicating = Boolean(sp.duplicate);
  const isEditing = Boolean(editing && !isDuplicating);

  // Load current permissions for the role being edited.
  let currentPermKeys: string[] = [];
  if (editing) {
    try {
      const { data: rp, error: permissionError } = await admin
        .from("access_role_permissions")
        .select("access_permissions (key), granted")
        .eq("role_id", editing.id);
      if (permissionError) throw new Error(permissionError.message);
      currentPermKeys = (rp as unknown as {granted:boolean;access_permissions:{key:string}|null}[] ?? [])
        .filter((row) => row.granted && row.access_permissions?.key)
        .map((row) => row.access_permissions!.key);
    } catch {
      throw new Error("Role permissions could not be loaded safely.");
    }
  }

  // Group permissions by category for the checkboxes.
  const byCategory = new Map<string, RbacPermission[]>();
  for (const p of permissions) {
    const arr = byCategory.get(p.category) ?? [];
    arr.push(p);
    byCategory.set(p.category, arr);
  }

  const isSystemRole = Boolean(isEditing && editing?.isSystem && editing.slug !== "school_founder");

  return (
    <>
      <PageTitle
        eyebrow="Platform Administration · Role-Based Access Control"
        title={isEditing ? `Edit role: ${editing?.name}` : "Create custom role"}
        subtitle={isEditing
          ? "Edit a custom role's name, description, active state and permissions. System roles are protected."
          : "Create a new custom role with a tailored permission set. Assign it to users from Role assignments."}
        action={<ButtonLink href="/admin/rbac" variant="outline">← Back to RBAC dashboard</ButtonLink>}
      />

      <Notice
        ok={sp.ok}
        e={undefined}
        messages={{
          created: "Custom role created.",
          updated: "Custom role updated.",
          deleted: "Custom role deleted.",
        }}
      />

      {isSystemRole && editing && (
        <div className="mb-6 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-900 ring-1 ring-red-600/30">
          {editing.name} is a system role. Its name, activation state and permissions are protected by the platform
          and cannot be changed from this console.
        </div>
      )}

      <form action={async (formData) => { "use server"; const result = await (isEditing ? rbacUpdateCustomRoleAction : rbacCreateCustomRoleAction)(formData); if (!result.ok) throw new Error(result.error); }} className="space-y-6">
        {isEditing && <input type="hidden" name="slug" value={editing?.slug} />}

        <Section title="Role details" hint="The slug is the stable identifier used in URLs, audit logs and the database.">
          <Field label="Display name">
            <Input name="name" defaultValue={isDuplicating ? `${editing?.name} (copy)` : editing?.name ?? ""} required disabled={Boolean(isEditing && editing?.isSystem)} />
          </Field>
          <Field label="Slug" hint="Lowercase, hyphenated. Reserved slugs cannot be used.">
            <Input name="slug" defaultValue={isDuplicating ? `${editing?.slug}-copy` : editing?.slug ?? ""} required disabled={isEditing} />
          </Field>
          <Field label="Description">
            <Textarea name="description" rows={3} defaultValue={editing?.description ?? ""} disabled={Boolean(isEditing && editing?.isSystem)} />
          </Field>
          {isEditing && editing && !editing.isSystem && (
            <Field label="Organization scope" hint="Leave empty for a platform-wide role; select an organization to scope this role to one tenant.">
              <select name="organization_id" defaultValue={editing?.organizationId ?? ""} disabled={isEditing} className="w-full rounded-lg border border-evergreen-900/55 bg-white px-3.5 py-2.5 text-sm text-ink shadow-sm focus:border-evergreen-700 focus:outline-none focus:ring-2 focus:ring-evergreen-600/25">
                <option value="">Reusable role (assignments still require an organization)</option>
                {(organizations ?? []).map(org => <option key={org.id} value={org.id}>{org.name}</option>)}
              </select>
              <p className="mt-1 text-xs text-ink-soft">Organization-scoped roles can only be assigned within that tenant.</p>
            </Field>
          )}
          {!isSystemRole && !isEditing && (
            <Field label="Organization scope" hint="Leave empty for a platform-wide role; select an organization to scope this role to one tenant.">
              <select name="organization_id" defaultValue={editing?.organizationId ?? ""} disabled={isEditing} className="w-full rounded-lg border border-evergreen-900/55 bg-white px-3.5 py-2.5 text-sm text-ink shadow-sm focus:border-evergreen-700 focus:outline-none focus:ring-2 focus:ring-evergreen-600/25">
                <option value="">Reusable role (assignments still require an organization)</option>
                {(organizations ?? []).map(org => <option key={org.id} value={org.id}>{org.name}</option>)}
              </select>
            </Field>
          )}
          {isEditing && !editing?.isSystem && (
            <label className="flex items-center gap-2 text-sm font-medium text-ink">
              <input type="checkbox" name="is_active" defaultChecked={editing?.isActive} className="h-5 w-5 accent-evergreen-700" />
              Active role (can be assigned to users)
            </label>
          )}
        </Section>

        <Section title="Permissions" hint="Select the permissions this role grants. A permission not selected here is not granted by this role.">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[...byCategory.entries()].map(([category, perms]) => (
              <div key={category} className="rounded-xl border border-evergreen-900/20 bg-paper p-4">
                <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-evergreen-700">{category}</h4>
                <div className="space-y-2">
                  {perms.map((perm) => {
                    const checked = currentPermKeys.includes(perm.key);
                    const disabled = isSystemRole || (isEditing && editing?.slug === "school_founder" && (!/\.(view|analytics|monitor)$/.test(perm.key) || /^(users|students|roles|permissions|proctoring)\./.test(perm.key)));
                    return (
                      <label key={perm.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-evergreen-50/50 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                        <input
                          type="checkbox"
                          name="permission_keys"
                          value={perm.key}
                          defaultChecked={checked}
                          className="mt-1 h-5 w-5 accent-evergreen-700"
                          disabled={disabled}
                        />
                        <div>
                          <span className="text-sm font-medium text-ink block">{perm.name}</span>
                          <span className="text-xs text-ink-soft">{perm.description ?? ""}</span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </Section>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button type="submit" variant={isSystemRole ? "outline" : "gold"} disabled={isSystemRole}>
            {isEditing ? "Save role" : "Create role"}
          </Button>
        </div>
      </form>

      {isEditing && editing && !editing.isSystem && <form className="mt-5" action={async formData => { "use server"; if (formData.get("confirm") !== "on") throw new Error("Confirm deletion first."); const result=await rbacDeleteCustomRoleAction(formData); if (!result.ok) throw new Error(result.error); }}><input type="hidden" name="slug" value={editing.slug}/><label className="mr-4 text-sm"><input type="checkbox" name="confirm" required/> Permanently delete this custom role and revoke its assignments</label><Button variant="danger">Delete role</Button></form>}
      {!isEditing && (
        <section className="mt-8">
          <h2 className="font-display text-lg font-semibold text-evergreen-950">Existing custom roles</h2>
          <p className="mt-1 text-sm text-ink-soft">Custom roles already created. Edit or inspect them below.</p>
          {roles.filter((r) => !r.isSystem).length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-evergreen-900/30 bg-paper p-8 text-center">
              <p className="text-sm text-ink-soft">No custom roles yet. Use the form above to create one.</p>
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-xl border border-evergreen-900/20 bg-paper shadow-[var(--shadow-card)]">
              <Table head={["Role", "Scope", "Permissions", "Assigned users", "Status"]} label="Custom roles">
                {roles.filter((r) => !r.isSystem).map((role) => (
                  <tr key={role.id}>
                    <td className="font-semibold text-evergreen-950">{role.name}</td>
                    <td>
                      {role.organizationId ? (
                        <Badge tone="amber">Organization-scoped</Badge>
                      ) : (
                        <Badge tone="green">Platform-wide</Badge>
                      )}
                    </td>
                    <td className="tabular-nums text-xs">{role.permissionCount}</td>
                    <td className="tabular-nums text-xs">{role.assignedUserCount}</td>
                    <td><Badge tone={role.isActive ? "green" : "red"}>{role.isActive ? "Active" : "Inactive"}</Badge></td>
                  </tr>
                ))}
              </Table>
            </div>
          )}
        </section>
      )}
    </>
  );
}
