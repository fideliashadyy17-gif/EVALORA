import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { listPermissions } from "@/lib/rbac";
import { Badge, Button, ButtonLink, Field, Input, PageTitle, Select } from "@/components/ui";
import { Table } from "../../ui";
import { rbacSetOverride } from "../actions";
export const dynamic="force-dynamic";
export default async function Effective({searchParams}:{searchParams:Promise<{organization?:string;user?:string}>}) {
  await requireSuperAdmin();
  const query=await searchParams;
  const client=await createClient();
  const admin=createAdminClient();
  const permissions=await listPermissions();
  let effective:Record<string,boolean>|null=null;
  let overrides:{permission_id:string;granted:boolean}[]=[];
  if (query.organization && query.user) {
    const [{data,error},{data:rows,error:overrideError}]=await Promise.all([
      client.rpc("access_inspect_permissions",{p_user:query.user,p_org:query.organization}),
      admin.from("access_permission_overrides").select("permission_id,granted").eq("user_id",query.user).eq("organization_id",query.organization),
    ]);
    if (error || overrideError) throw new Error("Permission inspection failed. Verify the user and organization identifiers.");
    effective=data as Record<string,boolean>;
    overrides=rows ?? [];
  }
  return <><PageTitle eyebrow="Platform Administration · Role-Based Access Control" title="Effective permissions & overrides" subtitle="Inspect a user in one organization. Global disables and explicit denies win. An allow override never defeats a role deny or the Founder read-only ceiling." action={<ButtonLink href="/admin/rbac">Roles & permissions</ButtonLink>}/>
    <form className="mb-6 grid gap-4 sm:grid-cols-3" method="get"><Field label="Organization UUID"><Input name="organization" defaultValue={query.organization} required/></Field><Field label="User UUID"><Input name="user" defaultValue={query.user} required/></Field><Button>Inspect effective access</Button></form>
    {effective && <Table head={["Permission","Global state","User override","Effective","Change override"]}>{permissions.map(p=>{
      const override=overrides.find(o=>o.permission_id===p.id);
      return <tr key={p.id}><td><strong>{p.name}</strong><code className="block text-xs">{p.key}</code></td><td><Badge tone={p.enabled?"green":"red"}>{p.enabled?"Enabled":"Disabled"}</Badge></td><td>{override?override.granted?"Allow":"Deny":"Inherit assigned roles"}</td><td><Badge tone={effective[p.key]?"green":"gray"}>{effective[p.key]?"Allowed":"Denied"}</Badge></td><td><form className="flex gap-2" action={rbacSetOverride}><input type="hidden" name="organization_id" value={query.organization}/><input type="hidden" name="user_id" value={query.user}/><input type="hidden" name="permission_id" value={p.id}/><Select name="state" defaultValue={override?override.granted?"allow":"deny":"inherit"}><option value="inherit">Inherit</option><option value="allow">Allow</option><option value="deny">Deny</option></Select><Button variant="outline">Save</Button></form></td></tr>;
    })}</Table>}
  </>;
}
