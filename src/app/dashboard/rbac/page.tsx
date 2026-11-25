import { Badge, Button, ButtonLink, Card, DataTable, Field, Input, PageTitle, Select, StatCard } from "@/components/ui";
import { activeOrg, requireUser } from "@/lib/auth";
import { getCapabilities, requireModule } from "@/lib/capabilities";
import { canOperateMany } from "@/lib/operationalAccess";
import { checkPermissions } from "@/lib/rbac";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/utils";
import { KeyRound, ShieldCheck, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { orgAssignRoleAction, orgRevokeRoleAction } from "./actions";

export const metadata: Metadata = { title: "Role & Access Management" };
export const dynamic = "force-dynamic";

interface MemberRow {
  user_id: string;
  role: string;
  status: string;
  created_at: string;
}

interface RoleRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  is_system: boolean;
  is_active: boolean;
  organization_id: string | null;
}

interface AssignmentRow {
  id: string;
  user_id: string;
  role_id: string;
  organization_id: string;
  status: string;
  assigned_at: string;
  expires_at: string | null;
  access_roles: { name: string; slug: string } | { name: string; slug: string }[] | null;
}

interface AuditRow {
  id: string;
  actor_id: string | null;
  action: string;
  entity: string;
  created_at: string;
}

const PROTECTED_SLUGS = new Set(["super_admin", "school_founder"]);

export default async function OrgRbacPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; e?: string; q?: string; inspect?: string }>;
}) {
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  if (!org) redirect("/workspaces");

  const supabase = await createClient();
  const { entitlement } = await getCapabilities(supabase, ctx, org.id);
  requireModule(entitlement, "accounts", "/dashboard?e=module");

  const { canView, canAssign } = await canOperateMany(ctx, org.id, {
    canView: { permission: "roles.view", module: "accounts" },
    canAssign: { permission: "roles.assign", module: "accounts" },
  });
  if (!canView) redirect("/dashboard?e=forbidden");

  const sp = await searchParams;
  const searchQ = (sp.q ?? "").trim().toLowerCase();
  const inspectUserId = (sp.inspect ?? "").trim();
  const isSuperAdmin = ctx.profile.platform_role === "super_admin";
  const isOwnerOrSA = isSuperAdmin || org.role === "owner";

  // Load ONLY this organization's members, assignments, permitted roles, and org audit trail.
  const admin = createAdminClient();
  const [
    { data: members },
    { data: allRoles },
    { data: rolePerms },
    { data: orgAssignments },
    { data: orgAudit },
  ] = await Promise.all([
    supabase
      .from("organization_members")
      .select("user_id, role, status, created_at")
      .eq("organization_id", org.id)
      .order("created_at", { ascending: false })
      .limit(300),
    supabase
      .from("access_roles")
      .select("id, name, slug, description, is_system, is_active, organization_id")
      .eq("is_active", true)
      .or(`organization_id.is.null,organization_id.eq.${org.id}`)
      .order("name"),
    supabase
      .from("access_role_permissions")
      .select("role_id, granted, access_permissions(key, enabled)")
      .eq("granted", true),
    supabase
      .from("access_user_roles")
      .select("id, user_id, role_id, organization_id, status, assigned_at, expires_at, access_roles(name, slug)")
      .eq("organization_id", org.id)
      .order("assigned_at", { ascending: false })
      .limit(200),
    supabase.rpc("access_org_get_audit_events", { p_organization_id: org.id, p_limit: 25 }),
  ]);

  const memberRows = (members ?? []) as MemberRow[];
  const memberIds = [...new Set(memberRows.map((m) => m.user_id))];

  // Resolve member names & emails ONLY for users who belong to THIS organization.
  const { data: memberProfiles } = memberIds.length
    ? await admin
        .from("profiles")
        .select("id, full_name, email, platform_role, status")
        .in("id", memberIds)
    : { data: [] as { id: string; full_name: string | null; email: string | null; platform_role: string; status: string }[] };

  const profileById = new Map((memberProfiles ?? []).map((p) => [p.id, p]));

  // Map role_id -> list of enabled granted permission keys.
  const permsByRole = new Map<string, string[]>();
  const allReferencedPermKeys = new Set<string>();
  for (const row of (rolePerms ?? []) as unknown as {
    role_id: string;
    granted: boolean;
    access_permissions: { key: string; enabled: boolean } | { key: string; enabled: boolean }[] | null;
  }[]) {
    const p = Array.isArray(row.access_permissions) ? row.access_permissions[0] : row.access_permissions;
    if (!row.granted || !p?.enabled) continue;
    const list = permsByRole.get(row.role_id) ?? [];
    list.push(p.key);
    permsByRole.set(row.role_id, list);
    allReferencedPermKeys.add(p.key);
  }

  // Evaluate caller's own effective permissions in this organization so the UI
  // only presents roles the caller is strictly authorized to assign (mirrored by DB RPC).
  const callerEffective = allReferencedPermKeys.size
    ? await checkPermissions(ctx, org.id, [...allReferencedPermKeys])
    : {};

  const roles = (allRoles ?? []) as RoleRow[];
  const assignableRoles = roles.filter((r) => {
    if (PROTECTED_SLUGS.has(r.slug)) return false;
    if (r.slug === "org_owner" && !isSuperAdmin) return false;
    if (r.slug === "org_admin" && !isOwnerOrSA) return false;
    if (r.organization_id && r.organization_id !== org.id) return false;
    if (isSuperAdmin) return true;
    const granted = permsByRole.get(r.id) ?? [];
    return granted.every((k) => callerEffective[k] === true);
  });

  const assignments = (orgAssignments ?? []) as unknown as AssignmentRow[];
  const activeAssignments = assignments.filter((a) => a.status === "active");

  const filteredMembers = memberRows.filter((m) => {
    if (!searchQ) return true;
    const p = profileById.get(m.user_id);
    return `${p?.email ?? ""} ${p?.full_name ?? ""} ${m.role}`.toLowerCase().includes(searchQ);
  });

  const eligibleTargets = memberRows.filter((m) => {
    if (m.status !== "active") return false;
    const p = profileById.get(m.user_id);
    if (!isSuperAdmin) {
      if (p?.platform_role === "super_admin") return false;
      if (m.role === "school_founder") return false;
      if (m.role === "owner" && !isOwnerOrSA) return false;
      if (m.user_id === ctx.user.id) return false;
    }
    return true;
  });

  // Optional inline effective permission inspection (strictly for a member of org.id).
  let inspectedEffective: Record<string, boolean> | null = null;
  let inspectedMember: { id: string; email: string | null; full_name: string | null; role: string } | null = null;
  if (inspectUserId && memberIds.includes(inspectUserId)) {
    const { data: eff } = await supabase.rpc("access_org_inspect_permissions", {
      p_organization_id: org.id,
      p_user_id: inspectUserId,
    });
    if (eff && typeof eff === "object") {
      inspectedEffective = eff as Record<string, boolean>;
      const p = profileById.get(inspectUserId);
      const m = memberRows.find((r) => r.user_id === inspectUserId);
      inspectedMember = {
        id: inspectUserId,
        email: p?.email ?? null,
        full_name: p?.full_name ?? null,
        role: m?.role ?? "member",
      };
    }
  }

  const auditRows = (orgAudit ?? []) as AuditRow[];

  return (
    <>
      <PageTitle
        eyebrow={`Organization Access Control · ${org.name}`}
        title="Role & Access Management"
        subtitle={`Manage centralized RBAC role assignments for members of ${org.name}. All actions are strictly scoped to this organization and verified server-side.`}
        action={
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/dashboard/accounts" variant="outline">Accounts &amp; staff</ButtonLink>
            <ButtonLink href="/dashboard/team" variant="outline">Team &amp; invitations</ButtonLink>
          </div>
        }
      />

      {sp.ok === "assigned" && (
        <p role="status" className="mb-4 rounded-lg bg-evergreen-50 px-4 py-3 text-sm font-medium text-evergreen-900">
          Role assignment saved for {org.name} and logged to the organization access history.
        </p>
      )}
      {sp.ok === "revoked" && (
        <p role="status" className="mb-4 rounded-lg bg-evergreen-50 px-4 py-3 text-sm font-medium text-evergreen-900">
          Role assignment revoked and logged to the organization access history.
        </p>
      )}
      {sp.e && (
        <p role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-900 ring-1 ring-red-600/25">
          {decodeURIComponent(sp.e)}
        </p>
      )}

      <Card className="mb-6 border-evergreen-700/25 bg-evergreen-50/70 p-4 text-sm text-evergreen-950">
        <strong>Organization scope boundaries:</strong> Changes here apply exclusively to{" "}
        <strong>{org.name}</strong>. You can only assign roles whose permissions do not exceed your own
        authority. Platform Super Admin roles, School Founder appointments, other organizations, and global
        RBAC catalog definitions remain protected at the platform level.
      </Card>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Organization members" value={memberRows.length} icon={<Users className="h-5 w-5" />} />
        <StatCard label="Active RBAC assignments" value={activeAssignments.length} icon={<ShieldCheck className="h-5 w-5" />} />
        <StatCard label="Roles you may assign" value={assignableRoles.length} icon={<KeyRound className="h-5 w-5" />} />
      </div>

      {/* ── Assign permitted role within this organization ── */}
      {canAssign && (
        <Card className="mb-6 p-6">
          <h2 className="font-display text-lg font-semibold text-evergreen-950">
            Assign role to a member of {org.name}
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Select an active member of your organization and a permitted role. Protected platform roles and
            roles granting permissions above your authority cannot be assigned.
          </p>
          {eligibleTargets.length === 0 ? (
            <p className="mt-4 rounded-lg bg-cream px-4 py-3 text-sm text-ink-soft">
              No other eligible active members are currently available for role reassignment. Invite or add staff
              under <Link href="/dashboard/accounts" className="font-semibold text-evergreen-700 underline">Accounts &amp; Permissions</Link> first.
            </p>
          ) : (
            <form action={orgAssignRoleAction} className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 sm:items-end">
              <Field label="Organization member">
                <Select name="user_id" required defaultValue="">
                  <option value="">Select member…</option>
                  {eligibleTargets.map((m) => {
                    const p = profileById.get(m.user_id);
                    return (
                      <option key={m.user_id} value={m.user_id}>
                        {p?.email ?? m.user_id} {p?.full_name ? `(${p.full_name})` : ""} — {m.role}
                      </option>
                    );
                  })}
                </Select>
              </Field>
              <Field label="Permitted role">
                <Select name="role_slug" required defaultValue="">
                  <option value="">Select role…</option>
                  {assignableRoles.map((r) => (
                    <option key={r.id} value={r.slug}>
                      {r.name} ({(permsByRole.get(r.id) ?? []).length} permissions)
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Expiration (optional)">
                <Input type="datetime-local" name="expires_at" />
              </Field>
              <div>
                <Button type="submit" variant="primary" className="w-full">Assign role</Button>
              </div>
            </form>
          )}
        </Card>
      )}

      {/* ── Organization Members & Effective Access Inspector ── */}
      <Card className="mb-6 p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-evergreen-950">
              Members &amp; active role assignments
            </h2>
            <p className="mt-1 text-sm text-ink-soft">
              Search members of {org.name} by email or name and inspect their effective organization permissions.
            </p>
          </div>
          <form method="get" className="flex flex-wrap items-center gap-2">
            <Input
              name="q"
              defaultValue={sp.q ?? ""}
              placeholder="Search member email or name…"
              className="w-60"
            />
            <Button type="submit" variant="outline">Filter</Button>
            {searchQ && (
              <Link href="/dashboard/rbac" className="text-sm font-medium text-evergreen-800 underline">
                Clear
              </Link>
            )}
          </form>
        </div>

        <div className="mt-4">
          <DataTable
            head={["Member", "Workspace role", "Explicit RBAC grants", "Status", "Actions"]}
            label="Organization members and RBAC grants"
          >
            {filteredMembers.map((m) => {
              const p = profileById.get(m.user_id);
              const userGrants = activeAssignments.filter((a) => a.user_id === m.user_id);
              const isProtectedMember =
                p?.platform_role === "super_admin" ||
                m.role === "school_founder" ||
                (m.role === "owner" && !isOwnerOrSA);
              return (
                <tr key={m.user_id}>
                  <td>
                    <p className="font-semibold text-evergreen-950">{p?.full_name || p?.email || m.user_id}</p>
                    <p className="text-xs text-ink-soft">{p?.email ?? "—"}</p>
                  </td>
                  <td>
                    <Badge tone={m.role === "school_founder" ? "gold" : m.role === "owner" || m.role === "admin" ? "green" : "gray"}>
                      {m.role}
                    </Badge>
                  </td>
                  <td>
                    {userGrants.length === 0 ? (
                      <span className="text-xs text-ink-soft">Inherited via workspace role</span>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {userGrants.map((g) => {
                          const roleObj = Array.isArray(g.access_roles) ? g.access_roles[0] : g.access_roles;
                          const slug = roleObj?.slug ?? "";
                          const canRevokeThis =
                            canAssign &&
                            !isProtectedMember &&
                            !PROTECTED_SLUGS.has(slug) &&
                            m.user_id !== ctx.user.id;
                          return (
                            <span
                              key={g.id}
                              className="inline-flex items-center gap-1.5 rounded-full border border-evergreen-900/20 bg-cream px-2.5 py-1 text-xs"
                            >
                              <span className="font-medium text-evergreen-950">{roleObj?.name ?? slug}</span>
                              {canRevokeThis && (
                                <form action={orgRevokeRoleAction} className="inline">
                                  <input type="hidden" name="assignment_id" value={g.id} />
                                  <button
                                    type="submit"
                                    className="font-semibold text-red-700 hover:underline"
                                    title="Revoke this RBAC role"
                                  >
                                    ×
                                  </button>
                                </form>
                              )}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </td>
                  <td>
                    <Badge tone={m.status === "active" ? "green" : "red"}>{m.status}</Badge>
                  </td>
                  <td className="text-xs">
                    <Link
                      href={`/dashboard/rbac?inspect=${m.user_id}${sp.q ? `&q=${encodeURIComponent(sp.q)}` : ""}`}
                      className="font-medium text-evergreen-700 underline underline-offset-2"
                    >
                      Inspect permissions
                    </Link>
                  </td>
                </tr>
              );
            })}
          </DataTable>
        </div>
      </Card>

      {/* ── Effective Permissions Inspection Panel (scoped to org.id) ── */}
      {inspectedMember && inspectedEffective && (
        <Card className="mb-6 border-evergreen-700/30 p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-lg font-semibold text-evergreen-950">
                Effective permissions: {inspectedMember.full_name || inspectedMember.email}
              </h2>
              <p className="text-xs text-ink-soft">
                {inspectedMember.email} · Workspace role: {inspectedMember.role} · Organization: {org.name}
              </p>
            </div>
            <Link href="/dashboard/rbac" className="text-xs font-medium text-evergreen-700 underline">
              Close inspector
            </Link>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(inspectedEffective)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([key, allowed]) => (
                <div
                  key={key}
                  className="flex items-center justify-between rounded-lg border border-evergreen-900/10 bg-paper px-3 py-2 text-xs"
                >
                  <code className="text-ink">{key}</code>
                  <Badge tone={allowed ? "green" : "gray"}>{allowed ? "Allowed" : "Denied"}</Badge>
                </div>
              ))}
          </div>
        </Card>
      )}

      {/* ── Permitted Roles Reference (Read-Only) ── */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="font-display text-lg font-semibold text-evergreen-950">
            Permitted roles in {org.name}
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Centralized role catalog available for assignment within your authority. Global role definitions
            are read-only here.
          </p>
          <ul className="mt-4 divide-y divide-evergreen-900/10">
            {assignableRoles.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <div>
                  <p className="font-semibold text-evergreen-950">{r.name}</p>
                  <p className="text-xs text-ink-soft">{r.description || r.slug}</p>
                </div>
                <Badge tone="gray">{(permsByRole.get(r.id) ?? []).length} perms</Badge>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-6">
          <h2 className="font-display text-lg font-semibold text-evergreen-950">
            Organization access audit trail
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Recent RBAC changes recorded strictly for {org.name}.
          </p>
          {auditRows.length === 0 ? (
            <p className="mt-4 text-sm text-ink-soft">No RBAC events logged for this organization yet.</p>
          ) : (
            <ul className="mt-4 divide-y divide-evergreen-900/10">
              {auditRows.map((ev) => {
                const actor = ev.actor_id ? profileById.get(ev.actor_id) : null;
                return (
                  <li key={ev.id} className="flex items-center justify-between gap-3 py-2.5 text-xs">
                    <div>
                      <Badge tone="gray">{ev.action}</Badge>{" "}
                      <span className="font-mono text-ink-soft">{ev.entity}</span>
                      <p className="mt-0.5 text-ink-soft">
                        By {actor?.email ?? (ev.actor_id ? "Platform admin" : "System")}
                      </p>
                    </div>
                    <span className="text-ink-soft">{fmtDateTime(ev.created_at)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
