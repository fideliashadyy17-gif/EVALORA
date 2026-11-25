import { cn } from "@/lib/utils";

import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { rbacListRolesAction, rbacListPermissionsAction, rbacSetPermissionEnabled } from "../actions";
import type { RbacRole, RbacPermission } from "@/lib/rbac";
import { Badge, Button, ButtonLink, PageTitle } from "@/components/ui";
import { Section, Table, Notice } from "@/app/admin/ui";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Permission Matrix" };
export const dynamic = "force-dynamic";

const CATEGORY_ORDER = [
  "Dashboard and analytics",
  "User accounts and authentication",
  "Organizations and memberships",
  "Classes and academic structures",
  "Question bank and question management",
  "Paper Builder and assessment design",
  "Examination management",
  "Quizzes and live competitions",
  "Marking and grading",
  "Results management and publication",
  "Candidate admission links and exam access",
  "Students and candidate records",
  "Proctoring and monitoring",
  "Reports and analytics",
  "Subscription and billing",
  "System configuration",
  "Security and audit logs",
  "Role and permission administration",
];

export default async function PermissionMatrix() {
  await requireSuperAdmin();
  const admin = createAdminClient();

  const [rolesResult, permissionsResult] = await Promise.all([
    rbacListRolesAction(),
    rbacListPermissionsAction(),
  ]);


  if (!rolesResult.ok) throw new Error(rolesResult.error);
  if (!permissionsResult.ok) throw new Error(permissionsResult.error);
  const roles: RbacRole[] = rolesResult.ok ? rolesResult.roles : [];
  const permissions: RbacPermission[] = permissionsResult.ok ? permissionsResult.permissions : [];

  // Load role-permission grants from the DB for the matrix.
  const rolePerms: Record<string, Set<string>> = {};
  try {
    const { data: rp, error: permissionError } = await admin
      .from("access_role_permissions")
      .select("role_id, granted, access_permissions (key)");
    if (permissionError) throw new Error(permissionError.message);
    if (rp) {
      for (const row of rp as unknown as {role_id: string; granted: boolean; access_permissions: {key: string} | null}[]) {
        if (!rolePerms[row.role_id]) rolePerms[row.role_id] = new Set();
        if (row.granted && row.access_permissions?.key) {
          rolePerms[row.role_id].add(row.access_permissions.key);
        }
      }
    }
  } catch {
    throw new Error("Permission matrix unavailable.");
  }

  // Group permissions by category.
  const byCategory = new Map<string, RbacPermission[]>();
  for (const cat of CATEGORY_ORDER) byCategory.set(cat, []);
  for (const p of permissions) {
    const arr = byCategory.get(p.category) ?? [];
    arr.push(p);
    byCategory.set(p.category, arr);
  }

  return (
    <>
      <PageTitle
        eyebrow="Platform Administration · Role-Based Access Control"
        title="Permission Matrix"
        subtitle="Every permission, organized by category, with which roles grant it. Edit role permissions from Manage roles. System roles are protected."
        action={
          <ButtonLink href="/admin/rbac/roles" variant="outline">← Back to roles</ButtonLink>
        }
      />

      <Notice
        ok={undefined}
        e={undefined}
        messages={{
          updated: "Role permissions updated.",
          created: "Custom role created.",
          deleted: "Custom role deleted.",
        }}
      />

      <p className="mb-4 text-sm text-ink-soft">
        Green = granted by the role · gray = not granted · red shield = system role (protected).{" "}
        <span className="font-semibold">DENY always wins:</span> an explicit deny in any assigned role overrides grants.
      </p>

      <div className="space-y-6">
        {[...byCategory.entries()].map(([category, perms]) => {
          if (perms.length === 0) return null;
          return (
            <Section key={category} title={category} hint={`${perms.length} permission${perms.length !== 1 ? "s" : ""}`}>
              <div className="overflow-x-auto rounded-xl border border-evergreen-900/20 bg-paper shadow-[var(--shadow-card)]">
                <Table
                  head={["Permission", "Scope", "Global state", ...roles.map((r) => r.name)]}
                  label={`Permission matrix — ${category}`}
                >
                  {perms.map((perm) => (
                    <tr key={perm.id}>
                      <td className="text-evergreen-950"><strong>{perm.name}</strong><code className="block text-xs">{perm.key}</code><p className="text-xs text-ink-soft">{perm.description}</p></td>
                      <td>
                        <Badge tone={perm.scope === "system" ? "red" : "green"}>{perm.scope}</Badge>
                      </td>
                      <td><form action={rbacSetPermissionEnabled}><input type="hidden" name="permission_key" value={perm.key}/><input type="hidden" name="enabled" value={String(!perm.enabled)}/><Badge tone={perm.enabled ? "green" : "red"}>{perm.enabled ? "Enabled" : "Disabled — all grants ineffective"}</Badge><Button variant="outline">{perm.enabled ? "Disable" : "Enable"}</Button></form></td>
                      {roles.map((role) => {
                        const granted = rolePerms[role.id]?.has(perm.key) ?? false;
                        const isSystem = role.isSystem;
                        return (
                          <td key={role.id}>
                            <button
                              disabled
                              className={cnPermBadge(granted, isSystem)}

                              title={isSystem ? "System role — permission fixed by migration" : `Toggle ${perm.key} for ${role.name}`}
                            >
                              {granted ? "✓" : "—"}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </Table>
              </div>
            </Section>
          );
        })}
      </div>

      <div className="mt-8 rounded-xl border border-evergreen-900/20 bg-paper p-5 shadow-[var(--shadow-card)]">
        <h3 className="font-display text-lg font-semibold text-evergreen-950">Legend</h3>
        <div className="mt-3 flex flex-wrap gap-4 text-sm">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-evergreen-600" /> Granted</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-stone-400" /> Not granted</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-500" /> System role (protected)</span>
        </div>
        <p className="mt-3 text-xs text-ink-soft">
          To change permissions on a custom role, open Manage roles and edit that role. System roles
          ({roles.filter((r) => r.isSystem).map((r) => r.name).join(", ")}) have fixed permission sets defined by the platform.
        </p>
      </div>
    </>
  );
}

function cnPermBadge(granted: boolean, isSystem: boolean): string {
  const base =
    "inline-flex items-center justify-center w-8 h-8 rounded-lg text-xs font-mono font-semibold transition border";
  if (isSystem) {
    return cn(base, "border-stone-400/30 bg-stone-100/50 text-stone-500 cursor-not-allowed");
  }
  return granted
    ? cn(base, "border-evergreen-600/30 bg-evergreen-50 text-evergreen-700")
    : cn(base, "border-stone-200/50 bg-white/50 text-stone-400");
}
