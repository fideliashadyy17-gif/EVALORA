import { Badge, Button, Card, Field, Input, Select } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { ORG_ROLES } from "@/lib/brand";
import { createAdminClient } from "@/lib/supabase/server";
import { fmtDate, fmtDateTime } from "@/lib/utils";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { setUserStatus } from "../../actions";
import {
  deleteUserAccount,
  sendPasswordResetAdmin,
  setSuperAdminRole,
  updateUserAdmin,
  userMembershipOp,
} from "../../actions/users";
import { ConfirmField, Flash, Notice, Section, StatusBadge, Table } from "../../ui";

export const metadata: Metadata = { title: "User" };
export const dynamic = "force-dynamic";

export default async function UserDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; e?: string }>;
}) {
  const ctx = await requireSuperAdmin();
  const { id } = await params;
  const sp = await searchParams;
  const admin = createAdminClient();

  const [{ data: user }, { data: memberships }, { data: orgs }, { data: student }, { data: activity }] = await Promise.all([
    admin.from("profiles").select("*").eq("id", id).maybeSingle(),
    admin.from("organization_members").select("id, role, status, created_at, organizations(id, name, status)").eq("user_id", id).order("created_at"),
    admin.from("organizations").select("id, name").order("name").limit(500),
    admin.from("students").select("id, organization_id, student_ref, organizations(name)").eq("user_id", id).maybeSingle(),
    admin.from("audit_logs").select("action, entity, created_at").eq("actor_id", id).order("created_at", { ascending: false }).limit(25),
  ]);
  if (!user) notFound();

  const memberOrgIds = new Set((memberships ?? []).map((m) => (m.organizations as unknown as { id: string } | null)?.id));
  const isPrimaryActor = Boolean(ctx.profile.is_primary);
  const back = `/admin/users/${id}`;

  return (
    <>
      <p className="mb-3 text-sm">
        <Link href="/admin/users" className="font-medium text-evergreen-700 underline-offset-2 hover:underline">← All users</Link>
      </p>
      <Flash />
      <Notice
        ok={sp.ok}
        e={sp.e}
        messages={{
          created: "Account created.",
          saved: "Profile saved.",
          reset_sent: "Password reset email sent to the user.",
          admin_granted: "Super Admin access granted. The user was notified.",
          admin_revoked: "Super Admin access revoked.",
          membership_updated: "Memberships updated.",
          exists: "That email already has an account — you are looking at it.",
          confirm: "Tick the confirmation box to proceed.",
          primary_protected: "The Primary Super Admin account is protected.",
          primary_only: "Only the Primary Super Admin can manage administrator privileges.",
          self: "You cannot change your own administrator status.",
          role: "That role change is not allowed.",
          reset_failed: "The reset email could not be sent.",
          delete_failed: "The account could not be deleted.",
        }}
      />

      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-semibold text-evergreen-950">{user.full_name || user.email}</h1>
            <p className="mt-0.5 text-sm text-ink-soft">{user.email} · joined {fmtDate(user.created_at)}</p>
            <p className="mt-2 flex flex-wrap items-center gap-2">
              {user.platform_role === "super_admin" ? (
                <Badge tone="gold">{user.is_primary ? "Primary Super Admin" : "Super Admin"}</Badge>
              ) : (
                <Badge tone="gray">User</Badge>
              )}
              <StatusBadge status={user.status} />
              {student && (
                <Link href={`/admin/organizations/${student.organization_id}?tab=students&edit=${student.id}`} className="text-sm font-medium text-evergreen-700 underline-offset-2 hover:underline">
                  Student record at {(student.organizations as unknown as { name: string } | null)?.name}
                </Link>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {!user.is_primary && (
              <form action={setUserStatus}>
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="status" value={user.status === "active" ? "suspended" : "active"} />
                <Button type="submit" variant={user.status === "active" ? "danger" : "primary"}>
                  {user.status === "active" ? "Suspend account" : "Reactivate account"}
                </Button>
              </form>
            )}
            <form action={sendPasswordResetAdmin}>
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="back" value={back} />
              <Button type="submit" variant="outline">Send password reset</Button>
            </form>
          </div>
        </div>

        <form action={updateUserAdmin} className="mt-5 flex flex-wrap items-end gap-2 border-t border-evergreen-900/10 pt-4">
          <input type="hidden" name="id" value={id} />
          <Field label="Full name" className="min-w-[240px]">
            <Input name="full_name" defaultValue={user.full_name ?? ""} />
          </Field>
          <Button type="submit" variant="outline">Save profile</Button>
        </form>
      </Card>

      {isPrimaryActor && !user.is_primary && id !== ctx.user.id && (
        <Section title="Platform administrator access" hint="Super Admins control the whole platform. Grants and revocations are audit-logged and the user is notified.">
          <Card className="p-5">
            <form action={setSuperAdminRole} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="grant" value={user.platform_role === "super_admin" ? "0" : "1"} />
              <ConfirmField
                label={user.platform_role === "super_admin"
                  ? "Revoke this user's Super Admin access"
                  : "Grant this user full Super Admin access to EVALORA"}
              />
              <Button type="submit" variant={user.platform_role === "super_admin" ? "danger" : "gold"}>
                {user.platform_role === "super_admin" ? "Revoke Super Admin" : "Grant Super Admin"}
              </Button>
            </form>
          </Card>
        </Section>
      )}

      <Section title="Organization memberships">
        <Card className="mb-4 p-5">
          <form action={userMembershipOp} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="user_id" value={id} />
            <input type="hidden" name="op" value="add" />
            <Field label="Organization">
              <Select name="organization_id" className="min-w-[220px]">
                {(orgs ?? []).filter((o) => !memberOrgIds.has(o.id)).map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Role">
              <Select name="role" defaultValue="teacher">
                {ORG_ROLES.filter((r) => r.value !== "owner").map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </Select>
            </Field>
            <Button type="submit">Add membership</Button>
          </form>
        </Card>

        {(memberships ?? []).length === 0 ? (
          <p className="text-sm text-ink-soft">No organization memberships.</p>
        ) : (
          <Table head={["Organization", "Role", "Status", "Since", "Actions"]}>
            {(memberships ?? []).map((m) => {
              const org = m.organizations as unknown as { id: string; name: string } | null;
              return (
                <tr key={m.id}>
                  <td>
                    {org ? (
                      <Link href={`/admin/organizations/${org.id}?tab=members`} className="font-medium text-evergreen-900 hover:underline">{org.name}</Link>
                    ) : "—"}
                  </td>
                  <td>
                    {m.role === "owner" ? (
                      <span className="font-medium capitalize text-gold-800">Owner</span>
                    ) : (
                      <form action={userMembershipOp} className="flex items-center gap-2">
                        <input type="hidden" name="user_id" value={id} />
                        <input type="hidden" name="member_id" value={m.id} />
                        <input type="hidden" name="op" value="role" />
                        <Select name="role" defaultValue={m.role} className="w-44">
                          {ORG_ROLES.filter((r) => r.value !== "owner").map((r) => (
                            <option key={r.value} value={r.value}>{r.label}</option>
                          ))}
                        </Select>
                        <button className="font-medium text-evergreen-700 underline-offset-2 hover:underline">Save</button>
                      </form>
                    )}
                  </td>
                  <td><StatusBadge status={m.status} /></td>
                  <td className="text-xs text-ink-soft">{fmtDate(m.created_at)}</td>
                  <td>
                    {m.role !== "owner" && (
                      <form action={userMembershipOp}>
                        <input type="hidden" name="user_id" value={id} />
                        <input type="hidden" name="member_id" value={m.id} />
                        <input type="hidden" name="op" value="remove" />
                        <button className="font-medium text-red-700 underline-offset-2 hover:underline">Remove</button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Section>

      <Section title="Recent account activity" hint="Actions this account performed that were written to the audit log.">
        {(activity ?? []).length === 0 ? (
          <p className="text-sm text-ink-soft">No audited activity recorded for this account.</p>
        ) : (
          <Table head={["When", "Action", "Entity"]}>
            {(activity ?? []).map((a, i) => (
              <tr key={i}>
                <td className="whitespace-nowrap text-xs text-ink-soft">{fmtDateTime(a.created_at)}</td>
                <td className="font-medium">{a.action}</td>
                <td className="text-ink-soft">{a.entity ?? "—"}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      {!user.is_primary && id !== ctx.user.id && (
        <Section title="Danger zone">
          <Card className="p-5">
            <form action={deleteUserAccount} className="space-y-3">
              <input type="hidden" name="id" value={id} />
              <p className="text-sm text-ink-soft">
                Permanently deletes the authentication account and profile (memberships cascade). Content they
                created keeps its organization ownership. Prefer suspension for reversible cases.
              </p>
              <ConfirmField label="Permanently delete this user account" />
              <Button type="submit" variant="danger">Delete account</Button>
            </form>
          </Card>
        </Section>
      )}
    </>
  );
}
