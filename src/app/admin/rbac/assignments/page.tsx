import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import {
  rbacListRolesAction,
  rbacListUserRolesAction,
  rbacAssignRoleAction,
  rbacRevokeRoleAction,
  rbacProvisionOrInviteFounderAction,
  rbacRevokeFounderInviteAction,
} from "../actions";
import type { RbacRole, RbacUserRole } from "@/lib/rbac";
import { Badge, Button, ButtonLink, Card, Field, Input, PageTitle, Select } from "@/components/ui";
import { Section, Table, Notice } from "@/app/admin/ui";
import type { Metadata } from "next";
import Link from "next/link";
import { requestFormatter } from "@/lib/formattingRequest";

export const metadata: Metadata = { title: "RBAC & User Role Assignments" };
export const dynamic = "force-dynamic";

export default async function RoleAssignments({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; e?: string; q?: string; org?: string; invite_email?: string }>;
}) {
  await requireSuperAdmin();
  // Configured date, time and number profile (Platform Control Center →
  // Presentation), resolved once per request from the platform-wide scope.
  const { dateTime: fmtDateTime } = await requestFormatter(null);
  const sp = await searchParams;
  const searchQ = (sp.q ?? "").trim().toLowerCase();
  const orgFilter = (sp.org ?? "").trim();

  const admin = createAdminClient();
  const client = await createClient();

  const [
    rolesResult,
    assignmentsResult,
    { data: profiles, error: profilesErr },
    { data: organizations, error: orgsErr },
    { data: memberships, error: memErr },
    { data: pendingFounderInvites },
    { data: auditEvents },
  ] = await Promise.all([
    rbacListRolesAction(),
    rbacListUserRolesAction(orgFilter || null),
    admin.from("profiles").select("id, full_name, email, platform_role, status").order("email").limit(500),
    admin.from("organizations").select("id, name, slug, status").order("name").limit(200),
    admin.from("organization_members").select("user_id, organization_id, role, status").limit(1000),
    admin
      .from("invitations")
      .select("id, organization_id, email, role, token, status, expires_at, created_at")
      .eq("role", "school_founder")
      .order("created_at", { ascending: false })
      .limit(50),
    client
      .from("access_audit_events")
      .select("id, actor_id, organization_id, action, entity, created_at, new_state")
      .order("created_at", { ascending: false })
      .limit(25),
  ]);

  if (!rolesResult.ok) throw new Error(rolesResult.error);
  if (!assignmentsResult.ok) throw new Error(assignmentsResult.error);
  if (profilesErr) throw new Error(profilesErr.message);
  if (orgsErr) throw new Error(orgsErr.message);
  if (memErr) throw new Error(memErr.message);

  const roles: RbacRole[] = rolesResult.roles;
  const allAssignments: RbacUserRole[] = assignmentsResult.assignments;
  const profileRows = profiles ?? [];
  const orgRows = organizations ?? [];
  const membershipRows = memberships ?? [];

  const profileById = new Map(profileRows.map((p) => [p.id, p]));
  const orgById = new Map(orgRows.map((o) => [o.id, o]));

  const membershipsByUser = new Map<string, { organization_id: string; role: string; status: string }[]>();
  for (const m of membershipRows) {
    const list = membershipsByUser.get(m.user_id) ?? [];
    list.push(m);
    membershipsByUser.set(m.user_id, list);
  }

  const matchedUsers = profileRows.filter((u) => {
    const matchesText =
      !searchQ ||
      `${u.email ?? ""} ${u.full_name ?? ""}`.toLowerCase().includes(searchQ);
    const matchesOrg =
      !orgFilter ||
      (membershipsByUser.get(u.id) ?? []).some((m) => m.organization_id === orgFilter);
    return matchesText && matchesOrg;
  });

  const roleNameBySlug = new Map(roles.map((r) => [r.slug, r.name]));

  const assignments = allAssignments.filter((a) => {
    if (!searchQ) return true;
    const u = profileById.get(a.userId);
    const roleName = roleNameBySlug.get(a.roleSlug) ?? a.roleSlug;
    const haystack = `${u?.email ?? ""} ${u?.full_name ?? ""} ${roleName} ${a.roleSlug}`.toLowerCase();
    return haystack.includes(searchQ);
  });

  const activeAssignments = assignments.filter((a) => a.status === "active");
  const inactiveAssignments = assignments.filter((a) => a.status !== "active");

  return (
    <>
      <PageTitle
        eyebrow="Platform Administration · RBAC & User Role Management"
        title="User Role Assignments & Founder Provisioning"
        subtitle="Search users by email, filter by organization, assign or revoke organization-scoped roles, provision School Founders safely, and inspect RBAC audit history."
        action={
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/admin/rbac/effective" variant="outline">Effective permissions</ButtonLink>
            <ButtonLink href="/admin/rbac/roles" variant="outline">Manage roles</ButtonLink>
            <ButtonLink href="/admin/rbac" variant="outline">← RBAC overview</ButtonLink>
          </div>
        }
      />

      <Notice
        ok={sp.ok}
        e={sp.e ? decodeURIComponent(sp.e) : undefined}
        messages={{
          assigned: "Role assigned and audit-logged.",
          revoked: "Role assignment revoked and audit-logged.",
          founder_assigned: "Existing account verified and assigned School Founder (read-only) for the selected organization without creating duplicates.",
          founder_invited: sp.invite_email
            ? `No existing account found for ${sp.invite_email}. A clean single-use School Founder invitation has been created below — share the invite link so the Founder can create their account and accept.`
            : "School Founder invitation created. Share the single-use invite link below.",
          invite_revoked: "Pending School Founder invitation revoked.",
        }}
      />

      {/* ── Search users by email & organization filter ── */}
      <Card className="mb-6 p-5">
        <form method="get" className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_16rem_auto_auto] sm:items-end">
          <Field label="Search users by email or name">
            <Input
              name="q"
              defaultValue={sp.q ?? ""}
              placeholder="e.g. Infos@oisbenin.bj or admin@school.edu"
            />
          </Field>
          <Field label="Filter by organization">
            <Select name="org" defaultValue={orgFilter}>
              <option value="">All organizations</option>
              {orgRows.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} ({o.slug})
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit" variant="primary">Search</Button>
          {(searchQ || orgFilter) && (
            <Link
              href="/admin/rbac/assignments"
              className="inline-flex min-h-11 items-center text-sm font-medium text-evergreen-800 underline underline-offset-2"
            >
              Clear
            </Link>
          )}
        </form>

        {(searchQ || orgFilter) && (
          <div className="mt-4 border-t border-evergreen-900/10 pt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">
              Matched accounts ({matchedUsers.length})
            </p>
            {matchedUsers.length === 0 ? (
              <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
                No existing user account matches{" "}
                <strong>{sp.q || "the selected filter"}</strong>. To onboard a new School Founder without
                creating a misassigned identity, use the <strong>School Founder Assignment &amp; Invitation</strong>{" "}
                section below.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table head={["Email & Name", "Status", "Organizations & Roles", "Inspect"]} label="Matched users">
                  {matchedUsers.slice(0, 25).map((u) => {
                    const userMems = membershipsByUser.get(u.id) ?? [];
                    return (
                      <tr key={u.id}>
                        <td>
                          <p className="font-semibold text-evergreen-950">{u.email}</p>
                          <p className="text-xs text-ink-soft">
                            {u.full_name || "—"}
                            {u.platform_role === "super_admin" && " · Platform Super Admin"}
                          </p>
                        </td>
                        <td>
                          <Badge tone={u.status === "active" ? "green" : "red"}>{u.status}</Badge>
                        </td>
                        <td className="text-xs">
                          {userMems.length === 0 ? (
                            <span className="text-ink-soft">No organization membership</span>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {userMems.map((m) => (
                                <Badge key={`${m.organization_id}-${m.role}`} tone="gray">
                                  {orgById.get(m.organization_id)?.name ?? m.organization_id}: {m.role}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="text-xs">
                          {userMems[0] ? (
                            <Link
                              href={`/admin/rbac/effective?organization=${userMems[0].organization_id}&user=${u.id}`}
                              className="font-medium text-evergreen-700 underline underline-offset-2"
                            >
                              Effective access →
                            </Link>
                          ) : (
                            <span className="text-ink-soft">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </Table>
              </div>
            )}
          </div>
        )}
      </Card>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        {/* ── Standard role assignment ── */}
        <Section
          title="Assign role to existing user"
          hint="Grants an organization-scoped RBAC role to an existing member. Effective immediately and audit-logged."
        >
          <form
            action={async (formData) => {
              "use server";
              await rbacAssignRoleAction(formData);
            }}
            className="space-y-4"
          >
            <Field label="Select existing user" hint="Choose by email address (or type email below).">
              <Select name="target_user_id" defaultValue="">
                <option value="">Choose an existing user…</option>
                {profileRows.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.email} {u.full_name ? `— ${u.full_name}` : ""}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Or enter exact user email" hint="Optional fallback if you prefer typing the email directly.">
              <Input name="user_email" type="email" placeholder="teacher@school.edu" />
            </Field>

            <Field label="Organization">
              <Select name="organization_id" required defaultValue={orgFilter}>
                <option value="">Select organization…</option>
                {orgRows.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name} ({o.slug})
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Role">
              <Select name="role_slug" required defaultValue="">
                <option value="">Select role…</option>
                {roles
                  .filter((r) => r.isActive && r.slug !== "super_admin")
                  .map((r) => (
                    <option key={r.id} value={r.slug}>
                      {r.name} ({r.slug})
                    </option>
                  ))}
              </Select>
            </Field>

            <Field label="Expiration date (optional)" hint="Leave empty for a non-expiring assignment.">
              <Input type="datetime-local" name="expires_at" />
            </Field>

            <Button type="submit" variant="primary">Assign role</Button>
          </form>
        </Section>

        {/* ── School Founder Assignment & Invitation Provisioning ── */}
        <Section
          title="School Founder assignment & invitation"
          hint="Assigns read-only School Founder access scoped to one school. If the email already exists, assigns directly without duplicates; if not yet registered, generates a single-use invitation link."
        >
          <form action={rbacProvisionOrInviteFounderAction} className="space-y-4">
            <Field
              label="Founder email address"
              hint="Verified case-insensitively against existing accounts before creating any invitation."
            >
              <Input
                name="founder_email"
                type="email"
                required
                defaultValue={sp.q?.includes("@") ? sp.q : ""}
                placeholder="Infos@oisbenin.bj"
              />
            </Field>

            <Field label="Target organization">
              <Select name="organization_id" required defaultValue={orgFilter}>
                <option value="">Select organization…</option>
                {orgRows.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name} ({o.slug})
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Expiration date (optional)" hint="Applied when assigning immediately to an existing account.">
              <Input type="datetime-local" name="expires_at" />
            </Field>

            <div className="rounded-lg bg-evergreen-50/70 p-3 text-xs text-evergreen-950">
              <strong>Strict Founder guarantees:</strong> Read-only operational dashboard visibility scoped solely to
              the selected organization, sensitive access credentials redacted, zero write/edit/delete permissions
              enforced by PostgreSQL RLS and server authorization.
            </div>

            <Button type="submit" variant="gold">Assign Founder or Create Invitation</Button>
          </form>
        </Section>
      </div>

      {/* ── Pending & Recent School Founder Invitations ── */}
      {(pendingFounderInvites ?? []).length > 0 && (
        <Section
          title="School Founder invitations"
          hint="Single-use onboarding links for Founder accounts that have not yet signed up. Accepting activates both organization membership and centralized RBAC school_founder access."
        >
          <div className="overflow-x-auto rounded-2xl border border-evergreen-900/20 bg-paper shadow-[var(--shadow-card)]">
            <Table
              head={["Email", "Organization", "Status", "Invite link", "Expires", "Action"]}
              label="School Founder invitations"
            >
              {(pendingFounderInvites ?? []).map((inv) => {
                const org = orgById.get(inv.organization_id);
                const invitePath = `/invite/${inv.token}`;
                const isPending = inv.status === "pending";
                return (
                  <tr key={inv.id}>
                    <td className="font-semibold text-evergreen-950">{inv.email}</td>
                    <td className="text-sm">{org ? `${org.name} (${org.slug})` : inv.organization_id}</td>
                    <td>
                      <Badge tone={inv.status === "accepted" ? "green" : inv.status === "pending" ? "amber" : "gray"}>
                        {inv.status}
                      </Badge>
                    </td>
                    <td className="text-xs">
                      {isPending ? (
                        <code className="rounded bg-cream px-2 py-1 text-evergreen-950">{invitePath}</code>
                      ) : (
                        <span className="text-ink-soft">—</span>
                      )}
                    </td>
                    <td className="text-xs text-ink-soft">{fmtDateTime(inv.expires_at)}</td>
                    <td>
                      {isPending ? (
                        <form action={rbacRevokeFounderInviteAction}>
                          <input type="hidden" name="invitation_id" value={inv.id} />
                          <input type="hidden" name="organization_id" value={inv.organization_id} />
                          <Button type="submit" variant="danger" className="py-1.5 text-xs">Revoke</Button>
                        </form>
                      ) : (
                        <span className="text-xs text-ink-soft">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </Table>
          </div>
        </Section>
      )}

      {/* ── Active Role Assignments ── */}
      <Section
        title={`Active role assignments (${activeAssignments.length})`}
        hint="Explicit centralized RBAC assignments currently in effect."
      >
        {activeAssignments.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-evergreen-900/30 bg-paper p-8 text-center text-sm text-ink-soft">
            No active explicit RBAC role assignments match the current filter.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-evergreen-900/20 bg-paper shadow-[var(--shadow-card)]">
            <Table
              head={["User", "Organization", "Role", "Assigned", "Expires", "Actions"]}
              label="Active role assignments"
            >
              {activeAssignments.map((a) => {
                const u = profileById.get(a.userId);
                const org = orgById.get(a.organizationId);
                return (
                  <tr key={a.id}>
                    <td>
                      <p className="font-semibold text-evergreen-950">{u?.email ?? a.userId}</p>
                      {u?.full_name && <p className="text-xs text-ink-soft">{u.full_name}</p>}
                    </td>
                    <td className="text-sm">{org ? `${org.name} (${org.slug})` : a.organizationId}</td>
                    <td>
                      <Badge tone={a.roleSlug === "school_founder" ? "gold" : "green"}>{roleNameBySlug.get(a.roleSlug) ?? a.roleSlug}</Badge>
                    </td>
                    <td className="text-xs text-ink-soft">{fmtDateTime(a.assignedAt)}</td>
                    <td className="text-xs text-ink-soft">{a.expiresAt ? fmtDateTime(a.expiresAt) : "Never"}</td>
                    <td>
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/admin/rbac/effective?organization=${a.organizationId}&user=${a.userId}`}
                          className="text-xs font-medium text-evergreen-700 underline underline-offset-2"
                        >
                          Inspect
                        </Link>
                        <form
                          action={async (formData) => {
                            "use server";
                            await rbacRevokeRoleAction(formData);
                          }}
                        >
                          <input type="hidden" name="target_user_id" value={a.userId} />
                          <input type="hidden" name="role_slug" value={a.roleSlug} />
                          <input type="hidden" name="organization_id" value={a.organizationId} />
                          <Button type="submit" variant="danger" className="py-1.5 text-xs">Revoke</Button>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </Table>
          </div>
        )}
      </Section>

      {/* ── Revoked / Historical Role Assignments ── */}
      {inactiveAssignments.length > 0 && (
        <Section title={`Historical / revoked assignments (${inactiveAssignments.length})`}>
          <div className="overflow-x-auto rounded-2xl border border-evergreen-900/20 bg-paper shadow-[var(--shadow-card)]">
            <Table head={["User", "Organization", "Role", "Status", "Assigned"]} label="Revoked role assignments">
              {inactiveAssignments.map((a) => {
                const u = profileById.get(a.userId);
                const org = orgById.get(a.organizationId);
                return (
                  <tr key={a.id}>
                    <td className="text-sm text-ink-soft">{u?.email ?? a.userId}</td>
                    <td className="text-sm text-ink-soft">{org ? org.name : a.organizationId}</td>
                    <td><Badge tone="gray">{roleNameBySlug.get(a.roleSlug) ?? a.roleSlug}</Badge></td>
                    <td><Badge tone="red">{a.status}</Badge></td>
                    <td className="text-xs text-ink-soft">{fmtDateTime(a.assignedAt)}</td>
                  </tr>
                );
              })}
            </Table>
          </div>
        </Section>
      )}

      {/* ── Recent RBAC Audit History ── */}
      <Section
        title="Recent RBAC audit history"
        hint="Immutable database trigger ledger of role definitions, permission changes, and role assignments."
      >
        {(auditEvents ?? []).length === 0 ? (
          <p className="text-sm text-ink-soft">No RBAC audit events recorded yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-evergreen-900/20 bg-paper shadow-[var(--shadow-card)]">
            <Table head={["When", "Actor", "Organization", "Action", "Entity"]} label="RBAC audit events">
              {(auditEvents ?? []).map((ev) => {
                const actor = ev.actor_id ? profileById.get(ev.actor_id) : null;
                const org = ev.organization_id ? orgById.get(ev.organization_id) : null;
                return (
                  <tr key={ev.id}>
                    <td className="text-xs text-ink-soft">{fmtDateTime(ev.created_at)}</td>
                    <td className="text-xs">{actor?.email ?? ev.actor_id ?? "System"}</td>
                    <td className="text-xs">{org ? org.name : "Global / Platform"}</td>
                    <td><Badge tone="gray">{ev.action}</Badge></td>
                    <td className="text-xs font-mono text-ink-soft">{ev.entity}</td>
                  </tr>
                );
              })}
            </Table>
          </div>
        )}
      </Section>
    </>
  );
}
