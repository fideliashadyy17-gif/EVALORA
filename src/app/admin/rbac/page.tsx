
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { requireSuperAdmin } from "@/lib/auth";
import { rbacListRolesAction, rbacListPermissionsAction } from "./actions";
import type { RbacRole, RbacPermission } from "@/lib/rbac";
import { Badge, Button, ButtonLink, Card, Field, Input, PageTitle } from "@/components/ui";
import { Section, Table, Notice } from "@/app/admin/ui";
import { fmtDateTime } from "@/lib/utils";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "RBAC & User Role Management" };
export const dynamic = "force-dynamic";

export default async function RbacDashboard({searchParams}: {searchParams: Promise<{q?:string;type?:string}>}) {
  const filters=await searchParams;
  await requireSuperAdmin();

  const [rolesResult, permissionsResult] = await Promise.all([
    rbacListRolesAction(),
    rbacListPermissionsAction(),
  ]);


  if (!rolesResult.ok) throw new Error(rolesResult.error);
  if (!permissionsResult.ok) throw new Error(permissionsResult.error);
  const roles: RbacRole[] = rolesResult.roles.filter(r => (!filters.q || `${r.name} ${r.slug} ${r.description ?? ""}`.toLowerCase().includes(filters.q.toLowerCase())) && (!filters.type || r.type === filters.type));
  const permissions: RbacPermission[] = permissionsResult.ok ? permissionsResult.permissions : [];

  const client = await createClient();
  const admin = createAdminClient();
  const [
    { data: history, error: auditError },
    { data: actorProfiles },
    { data: orgRows },
  ] = await Promise.all([
    client.from("access_audit_events").select("id,actor_id,organization_id,action,entity,created_at,previous_state,new_state").order("created_at",{ascending:false}).limit(50),
    admin.from("profiles").select("id, email").limit(500),
    admin.from("organizations").select("id, name").limit(200),
  ]);
  if (auditError) throw new Error(auditError.message);
  const actorEmailById = new Map((actorProfiles ?? []).map((p) => [p.id, p.email]));
  const orgNameById = new Map((orgRows ?? []).map((o) => [o.id, o.name]));
  const systemRoles = roles.filter((r) => r.isSystem);
  const customRoles = roles.filter((r) => !r.isSystem);
  const totalAssignments = roles.reduce((sum, r) => sum + r.assignedUserCount, 0);

  return (
    <>
      <PageTitle
        eyebrow="Platform Administration · Role-Based Access Control"
        title="RBAC & User Role Management"
        subtitle="Centralized RBAC: search users by email, assign or revoke organization-scoped roles, provision School Founders, inspect the permission matrix, and manage custom roles. Every change is audit-logged."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ButtonLink href="/admin/rbac/assignments" variant="primary">User role assignments</ButtonLink>
            <ButtonLink href="/admin/rbac/roles" variant="outline">Manage roles</ButtonLink>
            <ButtonLink href="/admin/rbac/permissions" variant="outline">Permission matrix</ButtonLink>
            <ButtonLink href="/admin/rbac/effective" variant="outline">Effective permissions</ButtonLink>
          </div>
        }
      />

      <Card className="mb-5 border-evergreen-700/30 bg-evergreen-50 p-4"><h2 className="font-semibold text-evergreen-950">Centralized enforcement active</h2><p className="mt-1 text-sm text-evergreen-900">Effective permissions resolved by PostgreSQL <code className="text-xs">access_has_permission</code> govern operational API routes, server actions, workspace surfaces, and the read-only institutional supervision workspace, intersected with organization module entitlements from Plan &amp; Module Management.</p></Card>
      <Notice
        ok={undefined}
        e={undefined}
        messages={{
          created: "Custom role created.",
          updated: "Custom role updated.",
          deleted: "Custom role deleted.",
          assigned: "Role assigned.",
          revoked: "Role revoked.",
        }}
      />

      <form className="mb-5 flex flex-wrap items-end gap-3" method="get"><Field label="Search roles"><Input name="q" defaultValue={filters.q}/></Field><Field label="Type"><select name="type" defaultValue={filters.type ?? ""} className="rounded-lg border p-3 text-sm"><option value="">All roles</option><option value="system">System</option><option value="custom">Custom</option></select></Field><Button>Filter</Button></form>
      <section className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-soft">Total roles</p>
          <p className="mt-1 font-display text-3xl font-semibold text-evergreen-950">{roles.length}</p>
          <p className="mt-0.5 text-xs text-ink-soft">
            {systemRoles.length} system · {customRoles.length} custom
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-soft">Active role assignments</p>
          <p className="mt-1 font-display text-3xl font-semibold text-evergreen-950">{totalAssignments}</p>
          <p className="mt-0.5 text-xs text-ink-soft">Active organization-scoped role grants</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-soft">Permissions catalogued</p>
          <p className="mt-1 font-display text-3xl font-semibold text-evergreen-950">{permissions.length}</p>
          <p className="mt-0.5 text-xs text-ink-soft">Across {new Set(permissions.map((p) => p.category)).size} categories</p>
        </Card>
      </section>

      <Section title="System roles" hint="Protected roles shipped with EVALORA. Their permission sets are defined in the database migration.">
        <div className="overflow-x-auto rounded-2xl border border-evergreen-900/20 bg-paper shadow-[var(--shadow-card)]">
          <Table
            head={["Role", "Type", "Scope", "Permissions", "Assigned users", "Status", "Protection"]}
            label="System roles"
          >
            {systemRoles.map((role) => (
              <tr key={role.id}>
                <td className="font-semibold text-evergreen-950">{role.name}<div className="mt-2 flex gap-3 text-xs"><ButtonLink href={`/admin/rbac/roles?edit=${role.slug}`} variant="ghost">Inspect</ButtonLink><ButtonLink href={`/admin/rbac/roles?duplicate=${role.slug}`} variant="ghost">Duplicate safely</ButtonLink></div></td>
                <td><Badge tone="gray">System</Badge></td>
                <td>
                  {role.organizationId ? (
                    <Badge tone="amber">Organization-scoped</Badge>
                  ) : (
                    <Badge tone="green">Reusable; org-scoped assignments</Badge>
                  )}
                </td>
                <td className="tabular-nums text-xs">{role.permissionCount}</td>
                <td className="tabular-nums text-xs">{role.assignedUserCount}</td>
                <td><Badge tone={role.isActive ? "green" : "red"}>{role.isActive ? "Active" : "Inactive"}</Badge></td>
                <td><Badge tone="red">Protected</Badge></td>
              </tr>
            ))}
          </Table>
        </div>
      </Section>

      <Section title="Custom roles" hint="Created by the Super Admin. Can be edited, duplicated, activated/deactivated and deleted. Assign them to users from Role assignments.">
        {customRoles.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-evergreen-900/30 bg-paper p-12 text-center">
            <p className="text-sm text-ink-soft">No custom roles yet. Create one from Manage roles to tailor permissions for a specific organizational need.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-evergreen-900/20 bg-paper shadow-[var(--shadow-card)]">
            <Table head={["Role", "Organization", "Permissions", "Assigned users", "Status", "Actions"]} label="Custom roles">
              {customRoles.map((role) => (
                <tr key={role.id}>
                  <td className="font-semibold text-evergreen-950">{role.name}<div className="mt-2 flex gap-3 text-xs"><ButtonLink href={`/admin/rbac/roles?edit=${role.slug}`} variant="ghost">Inspect</ButtonLink><ButtonLink href={`/admin/rbac/roles?duplicate=${role.slug}`} variant="ghost">Duplicate safely</ButtonLink></div></td>
                  <td className="text-xs text-ink-soft">{role.organizationId ? "Organization-scoped" : "Platform-wide"}</td>
                  <td className="tabular-nums text-xs">{role.permissionCount}</td>
                  <td className="tabular-nums text-xs">{role.assignedUserCount}</td>
                  <td><Badge tone={role.isActive ? "green" : "red"}>{role.isActive ? "Active" : "Inactive"}</Badge></td>
                  <td>
                    <ButtonLink
                      href={`/admin/rbac/roles?edit=${role.slug}`}
                      variant="ghost"
                      className="text-xs"
                    >
                      Edit
                    </ButtonLink>
                  </td>
                </tr>
              ))}
            </Table>
          </div>
        )}
      </Section>

      <Section title="Recent permission and assignment history" hint="Transactional audit events from the database. Ordinary users cannot modify these records."><Table head={["Time","Actor","Organization","Operation","Entity","Previous / new state"]}>{history?.map(event=><tr key={event.id}><td className="text-xs">{fmtDateTime(event.created_at)}</td><td className="text-xs">{(event.actor_id && actorEmailById.get(event.actor_id)) ?? event.actor_id ?? "Database migration"}</td><td className="text-xs">{(event.organization_id && orgNameById.get(event.organization_id)) ?? "Global / Platform"}</td><td><Badge tone="gray">{event.action}</Badge></td><td className="text-xs font-mono">{event.entity}</td><td><details><summary className="cursor-pointer text-xs">Inspect change</summary><pre className="max-w-lg overflow-auto text-xs">{JSON.stringify({before:event.previous_state,after:event.new_state},null,2)}</pre></details></td></tr>)}</Table></Section>

      <section className="mt-8">
        <h2 className="font-display text-lg font-semibold text-evergreen-950">How RBAC resolves permissions</h2>
        <p className="mt-1 text-sm text-ink-soft max-w-3xl">
          Effective permission for a user in an organization is resolved in this order:
        </p>
        <ol className="mt-3 space-y-2 text-sm text-ink-soft list-decimal list-inside max-w-3xl">
          <li><strong>Unknown or globally disabled permissions</strong> are denied first.</li>
          <li><strong>Super Admin</strong> (active platform_role) receives every permission.</li>
          <li><strong>Explicit permission override</strong> (DENY always wins; GRANT enables).</li>
          <li><strong>Union of permissions from all active roles</strong> assigned to the user in that organization (any GRANT enables; any explicit DENY disables and no grant overrides a deny).</li>
          <li>Otherwise the permission is <strong>not effective</strong>.</li>
        </ol>
      </section>
    </>
  );
}
