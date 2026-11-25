import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { listRoles, listUserRoles } from "@/lib/rbac";
import { Badge, Button, ButtonLink, Card, Field, Input, PageTitle, Select } from "@/components/ui";
import { Table } from "../../ui";
import { rbacAssignRoleAction, rbacRevokeRoleAction } from "../actions";
export const dynamic = "force-dynamic";
export default async function Assignments({ searchParams }: { searchParams: Promise<{organization?: string}> }) {
  await requireSuperAdmin();
  const admin = createAdminClient();
  const { data: organizations, error } = await admin.from("organizations").select("id,name").eq("status","active").order("name");
  if (error) throw new Error(error.message);
  const selected = (await searchParams).organization;
  const organizationId = organizations?.find(o => o.id === selected)?.id;
  const [roles, assignments, members] = await Promise.all([
    listRoles(organizationId), listUserRoles(organizationId),
    organizationId ? admin.from("organization_members").select("user_id,role,profiles!organization_members_user_id_fkey(email,full_name)").eq("organization_id",organizationId).eq("status","active") : Promise.resolve({data: [], error: null}),
  ]);
  if (members.error) throw new Error(members.error.message);
  return <>
    <PageTitle eyebrow="Platform Administration · Role-Based Access Control" title="Organization role assignments" subtitle="Select a verified organization membership. Assignments never create platform administrators or grant access to another school." action={<ButtonLink href="/admin/rbac">Roles & permissions</ButtonLink>} />
    <form method="get" className="mb-6 flex gap-3"><Select name="organization" defaultValue={organizationId ?? ""} required><option value="">Select organization</option>{organizations?.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</Select><Button>Inspect</Button></form>
    {organizationId && <Card className="mb-6 space-y-4 p-5">
      <h2 className="text-lg font-semibold">Assign a role</h2>
      <p className="text-sm text-ink-soft">School Founder / Institutional Supervisor is read-only. Use a dedicated account without an operational staff membership. Existing academic records and memberships are not modified by this form.</p>
      <form className="space-y-4" action={async form => { "use server"; const result = await rbacAssignRoleAction(form); if (!result.ok) throw new Error(result.error); }}>
        <input type="hidden" name="organization_id" value={organizationId}/>
        <Field label="Active organization member"><Select name="target_user_id"><option value="">Select verified member</option>{members.data?.map(m=><option key={m.user_id} value={m.user_id}>{m.user_id} · {m.role}</option>)}</Select></Field>
        <Field label="Existing Founder account email (optional)" hint="For a registered account not yet in this organization. Requires the explicit supervision-only membership confirmation below."><Input type="email" name="founder_email" /></Field>
        <label className="block text-sm"><input type="checkbox" name="provision_founder_membership"/> Create a supervision-only membership for this exact account if absent. Do not alter an existing membership.</label>
        <Field label="Role"><Select name="role_slug" required>{roles.filter(r=>r.isActive && r.slug !== "super_admin").map(r=><option key={r.id} value={r.slug}>{r.name}</option>)}</Select></Field>
        <Field label="Expiry (optional)"><Input name="expires_at" type="datetime-local" /></Field>
        <Button>Assign within selected organization</Button>
      </form>
    </Card>}
    <Table head={["User", "Role", "Organization", "Status", "Assigned", "Action"]}>{assignments.map(a=><tr key={a.id}><td>{a.userEmail || a.userId}<ButtonLink href={`/admin/rbac/effective?organization=${a.organizationId}&user=${a.userId}`} variant="ghost">Effective permissions</ButtonLink></td><td>{a.roleSlug}</td><td>{a.organizationName}</td><td><Badge>{a.status}</Badge></td><td>{a.assignedAt}</td><td>{a.status === "active" && <form action={async form=>{ "use server"; const result=await rbacRevokeRoleAction(form); if (!result.ok) throw new Error(result.error); }}><input type="hidden" name="target_user_id" value={a.userId}/><input type="hidden" name="role_slug" value={a.roleSlug}/><input type="hidden" name="organization_id" value={a.organizationId}/><Button variant="danger">Revoke</Button></form>}</td></tr>)}</Table>
  </>;
}
