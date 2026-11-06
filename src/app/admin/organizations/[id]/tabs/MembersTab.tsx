import { Button, Card, Field, Input, Select } from "@/components/ui";
import { ORG_ROLES } from "@/lib/brand";
import { createAdminClient } from "@/lib/supabase/server";
import { fmtDate } from "@/lib/utils";
import Link from "next/link";
import {
  addOrgMember,
  revokeOrgInvitation,
  transferOwnership,
  updateOrgMember,
} from "../../../actions/orgs";
import { Notice, StatusBadge, Table } from "../../../ui";

export async function MembersTab({ orgId, sp }: { orgId: string; sp: { ok?: string; e?: string } }) {
  const admin = createAdminClient();
  const [{ data: members }, { data: invitations }] = await Promise.all([
    admin
      .from("organization_members")
      .select("id, role, status, created_at, user_id, profiles(full_name, email, platform_role)")
      .eq("organization_id", orgId)
      .order("created_at"),
    admin.from("invitations").select("*").eq("organization_id", orgId).eq("status", "pending").order("created_at", { ascending: false }),
  ]);

  const roleSelect = (current: string) => (
    <Select name="role" defaultValue={current} className="w-44">
      {ORG_ROLES.filter((r) => r.value !== "owner").map((r) => (
        <option key={r.value} value={r.value}>{r.label}</option>
      ))}
    </Select>
  );

  return (
    <>
      <Notice
        ok={sp.ok}
        e={sp.e}
        messages={{
          member_added: "Member added and notified.",
          invited: "Invitation created — it activates when that email signs up.",
          member_updated: "Membership updated.",
          invitation_revoked: "Invitation revoked.",
          owner_changed: "Ownership transferred. The previous owner now holds the Administrator role.",
          email: "Enter a valid email address.",
          role: "That role change is not allowed (ownership changes use the transfer form).",
          owner_remove: "Transfer ownership before removing the current owner.",
          owner: "Enter the new owner's email.",
          owner_failed: "Could not resolve that owner account.",
        }}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="font-display text-base font-semibold text-evergreen-950">Add a member</h2>
          <p className="mt-1 text-sm text-ink-soft">Existing EVALORA users are added immediately; new emails receive a pending invitation.</p>
          <form action={addOrgMember} className="mt-3 flex flex-wrap items-end gap-2">
            <input type="hidden" name="organization_id" value={orgId} />
            <Field label="Email" className="min-w-[220px] flex-1"><Input name="email" type="email" required /></Field>
            <Field label="Role">{roleSelect("teacher")}</Field>
            <Button type="submit">Add member</Button>
          </form>
        </Card>

        <Card className="p-5">
          <h2 className="font-display text-base font-semibold text-evergreen-950">Transfer ownership</h2>
          <p className="mt-1 text-sm text-ink-soft">The new owner gains full control; the previous owner keeps an Administrator seat.</p>
          <form action={transferOwnership} className="mt-3 flex flex-wrap items-end gap-2">
            <input type="hidden" name="organization_id" value={orgId} />
            <Field label="New owner email" className="min-w-[220px] flex-1"><Input name="owner_email" type="email" required /></Field>
            <Field label="Full name (if new)"><Input name="owner_name" /></Field>
            <Button type="submit" variant="gold">Transfer</Button>
          </form>
        </Card>
      </div>

      <h2 className="mt-8 font-display text-lg font-semibold text-evergreen-950">Members ({members?.length ?? 0})</h2>
      <div className="mt-3">
        {(members ?? []).length === 0 ? (
          <p className="text-sm text-ink-soft">No members yet — add the first administrator or teacher above.</p>
        ) : (
          <Table head={["Member", "Role", "Status", "Joined", "Actions"]}>
            {(members ?? []).map((m) => {
              const profile = m.profiles as unknown as { full_name: string | null; email: string; platform_role: string } | null;
              return (
                <tr key={m.id}>
                  <td>
                    <Link href={`/admin/users/${m.user_id}`} className="font-medium text-evergreen-900 hover:underline">
                      {profile?.full_name || profile?.email || "User"}
                    </Link>
                    <span className="block text-xs text-ink-soft">
                      {profile?.email}
                      {profile?.platform_role === "super_admin" ? " · platform admin" : ""}
                    </span>
                  </td>
                  <td>
                    {m.role === "owner" ? (
                      <span className="font-medium text-gold-800">Organization Owner</span>
                    ) : (
                      <form action={updateOrgMember} className="flex items-center gap-2">
                        <input type="hidden" name="organization_id" value={orgId} />
                        <input type="hidden" name="member_id" value={m.id} />
                        <input type="hidden" name="op" value="role" />
                        {roleSelect(m.role)}
                        <button className="font-medium text-evergreen-700 underline-offset-2 hover:underline">Save</button>
                      </form>
                    )}
                  </td>
                  <td><StatusBadge status={m.status} /></td>
                  <td className="text-xs text-ink-soft">{fmtDate(m.created_at)}</td>
                  <td>
                    {m.role !== "owner" && (
                      <div className="flex gap-3">
                        <form action={updateOrgMember}>
                          <input type="hidden" name="organization_id" value={orgId} />
                          <input type="hidden" name="member_id" value={m.id} />
                          <input type="hidden" name="op" value={m.status === "active" ? "suspend" : "activate"} />
                          <button className="font-medium text-evergreen-700 underline-offset-2 hover:underline">
                            {m.status === "active" ? "Suspend" : "Activate"}
                          </button>
                        </form>
                        <form action={updateOrgMember}>
                          <input type="hidden" name="organization_id" value={orgId} />
                          <input type="hidden" name="member_id" value={m.id} />
                          <input type="hidden" name="op" value="remove" />
                          <button className="font-medium text-red-700 underline-offset-2 hover:underline">Remove</button>
                        </form>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </div>

      {(invitations ?? []).length > 0 && (
        <>
          <h2 className="mt-8 font-display text-lg font-semibold text-evergreen-950">Pending invitations</h2>
          <div className="mt-3">
            <Table head={["Email", "Role", "Invited", "Expires", "Actions"]}>
              {(invitations ?? []).map((inv) => (
                <tr key={inv.id}>
                  <td className="font-medium">{inv.email}</td>
                  <td className="capitalize">{inv.role}</td>
                  <td className="text-xs text-ink-soft">{fmtDate(inv.created_at)}</td>
                  <td className="text-xs text-ink-soft">{fmtDate(inv.expires_at)}</td>
                  <td>
                    <form action={revokeOrgInvitation}>
                      <input type="hidden" name="organization_id" value={orgId} />
                      <input type="hidden" name="id" value={inv.id} />
                      <button className="font-medium text-red-700 underline-offset-2 hover:underline">Revoke</button>
                    </form>
                  </td>
                </tr>
              ))}
            </Table>
          </div>
        </>
      )}
    </>
  );
}
