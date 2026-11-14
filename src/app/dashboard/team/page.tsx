import { Badge, Button, Card, DataTable, Field, Input, PageTitle, Select, StatCard } from "@/components/ui";
import { activeOrg, can, MANAGER_ROLES, requireUser } from "@/lib/auth";
import { ORG_ROLES } from "@/lib/brand";
import { getEntitlementFor } from "@/lib/entitlements";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { fmtDate } from "@/lib/utils";
import { MailPlus, ShieldCheck, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { inviteMember, removeMember, revokeInvitation, updateMemberRole } from "./actions";

export const metadata: Metadata = { title: "Team & Roles" };
export const dynamic = "force-dynamic";

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ invited?: string; e?: string }>;
}) {
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  const sp = await searchParams;
  const isManager = can(ctx, org.id, MANAGER_ROLES);
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: members } = await supabase
    .from("organization_members")
    .select("*")
    .eq("organization_id", org.id)
    .order("created_at");
  const memberIds = (members ?? []).map((m) => m.user_id);
  const { data: profiles } = memberIds.length
    ? await admin.from("profiles").select("id, email, full_name").in("id", memberIds)
    : { data: [] };
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  const { data: invitations } = await supabase
    .from("invitations")
    .select("*")
    .eq("organization_id", org.id)
    .order("created_at", { ascending: false });

  const ent = await getEntitlementFor(supabase, ctx, org.id);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  const pendingInvitations = (invitations ?? []).filter((i) => i.status === "pending");

  return (
    <>
      <PageTitle
        eyebrow="Workspace Administration · Roles & Invitations"
        title="Team & Roles"
        subtitle={`Permissions are enforced on the server for every action — hiding a button is never the security model. Plan allows ${ent.limits.max_members === -1 ? "unlimited" : ent.limits.max_members} members.`}
        action={isManager ? <Link href="/dashboard/accounts" className="text-sm font-semibold text-evergreen-700 underline-offset-2 hover:underline">Account credentials →</Link> : undefined}
      />
      {sp.invited && <p className="mb-4 rounded-lg bg-evergreen-50 px-4 py-3 text-sm text-evergreen-900">Invitation created — copy its link below and share it with the invitee (valid 7 days).</p>}
      {sp.e === "limit" && <p className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">Your plan&apos;s member limit has been reached.</p>}
      {sp.e === "owner" && <p className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">The organization owner cannot be modified or removed here.</p>}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Workspace members" value={(members ?? []).length} icon={<Users className="h-5 w-5" />} />
        <StatCard label="Pending invitations" value={pendingInvitations.length} icon={<MailPlus className="h-5 w-5" />} />
        <StatCard label="Plan seat limit" value={ent.limits.max_members === -1 ? "Unlimited" : ent.limits.max_members} icon={<ShieldCheck className="h-5 w-5" />} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card className="p-6">
          <h2 className="mb-4 font-display text-lg font-semibold text-evergreen-950">Members ({(members ?? []).length})</h2>
          <DataTable head={isManager ? ["Member", "Role", "Joined", "Actions"] : ["Member", "Role", "Joined"]} label="Workspace members">
            {(members ?? []).map((m) => {
              const p = profileById.get(m.user_id);
              return (
                <tr key={m.id}>
                  <td>
                    <span className="font-medium text-evergreen-950">{p?.full_name || p?.email || "Member"}</span>
                    {p?.full_name && <span className="block text-xs text-ink-soft">{p.email}</span>}
                  </td>
                  <td>
                    {isManager && m.role !== "owner" ? (
                      <form action={updateMemberRole} className="flex items-center gap-1.5">
                        <input type="hidden" name="id" value={m.id} />
                        <Select name="role" defaultValue={m.role} aria-label="Member role" className="max-w-44 py-1.5 text-xs">
                          {ORG_ROLES.filter((r) => r.value !== "owner").map((r) => (
                            <option key={r.value} value={r.value}>{r.label}</option>
                          ))}
                        </Select>
                        <button className="text-xs font-medium text-evergreen-700 underline-offset-2 hover:underline">Save</button>
                      </form>
                    ) : (
                      <Badge tone={m.role === "owner" ? "gold" : "green"}>{ORG_ROLES.find((r) => r.value === m.role)?.label ?? m.role}</Badge>
                    )}
                  </td>
                  <td className="text-ink-soft">{fmtDate(m.created_at)}</td>
                  {isManager && (
                    <td>
                      {m.role !== "owner" && (
                        <form action={removeMember}>
                          <input type="hidden" name="id" value={m.id} />
                          <button className="text-xs text-red-700 underline-offset-2 hover:underline">Remove</button>
                        </form>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </DataTable>

          {pendingInvitations.length > 0 && (
            <div className="mt-6">
              <h3 className="font-semibold text-evergreen-950">Pending invitations</h3>
              <ul className="mt-2 space-y-2">
                {pendingInvitations.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-cream px-3 py-2.5 text-sm">
                    <span className="font-medium">{i.email}</span>
                    <Badge tone="gold">{ORG_ROLES.find((r) => r.value === i.role)?.label ?? i.role}</Badge>
                    <code className="max-w-full truncate text-xs text-ink-soft">{appUrl}/invite/{i.token}</code>
                    {isManager && (
                      <form action={revokeInvitation} className="ml-auto">
                        <input type="hidden" name="id" value={i.id} />
                        <button className="text-xs text-red-700 underline-offset-2 hover:underline">Revoke</button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        {isManager ? (
          <Card className="h-fit p-6">
            <h2 className="font-display text-lg font-semibold text-evergreen-950">Invite a member</h2>
            <form action={inviteMember} className="mt-4 space-y-3">
              <Field label="Email address">
                <Input name="email" type="email" required placeholder="colleague@school.edu" />
              </Field>
              <Field label="Role">
                <Select name="role" defaultValue="teacher">
                  {ORG_ROLES.filter((r) => r.value !== "owner").map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </Select>
              </Field>
              <Button type="submit" className="w-full">Create invitation link</Button>
            </form>
            <div className="mt-5 space-y-2 text-xs leading-relaxed text-ink-soft">
              <p><strong className="text-ink">Owner/Admin:</strong> settings, team, billing.</p>
              <p><strong className="text-ink">Teacher/Organizer:</strong> questions, quizzes, exams, live sessions.</p>
              <p><strong className="text-ink">Supervisor:</strong> proctoring room & incidents. <strong className="text-ink">Corrector:</strong> marking written answers.</p>
              <p><strong className="text-ink">Participant/Candidate/Parent:</strong> limited, read-focused access.</p>
            </div>
          </Card>
        ) : (
          <Card className="h-fit p-6">
            <p className="text-sm text-ink-soft">Only organization owners and administrators can manage the team.</p>
          </Card>
        )}
      </div>
    </>
  );
}
