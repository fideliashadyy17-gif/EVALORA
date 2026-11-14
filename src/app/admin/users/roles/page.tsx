import { Badge, ButtonLink, Card, PageTitle, StatCard } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { ORG_ROLES } from "@/lib/brand";
import { createAdminClient } from "@/lib/supabase/server";
import { Check, ShieldCheck, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Section, Table } from "../../ui";

export const metadata: Metadata = { title: "Roles and permissions" };
export const dynamic = "force-dynamic";

const ROLE_PERMISSIONS: Record<string, string[]> = {
  owner: ["Organization administration and ownership", "Team and role management", "Billing and subscriptions", "Questions, quizzes, competitions and examinations", "Proctoring, marking and results"],
  admin: ["Team and academic administration", "Billing and subscriptions", "Questions, quizzes, competitions and examinations", "Proctoring, marking and results"],
  teacher: ["Create and manage questions and quizzes", "Create and manage examinations", "Question review", "Proctoring", "Marking and candidate results"],
  organizer: ["Create and manage quizzes and questions", "Build and host competitions", "Create examinations from authorized question content"],
  supervisor: ["Live examination supervision", "Proctoring sessions", "Candidate warnings and attempt controls"],
  corrector: ["Proctoring and integrity review", "Mark open-ended responses", "Review candidate results"],
  participant: ["Join quizzes and competitions", "Submit authorized responses", "View released personal results"],
  candidate: ["Access assigned examinations using a candidate code or enrolled candidate record", "Save and submit within the enforced deadline", "View results only after publication"],
  parent: ["Organization-linked guardian role", "Personal progress visibility where granted by the institution"],
  student: ["Take assigned quizzes, competitions and examinations", "View released personal results and progress"],
};

export default async function RolesPermissionsPage() {
  await requireSuperAdmin();
  const admin = createAdminClient();

  const [{ data: members }, { data: profiles }, { count: superCount }] = await Promise.all([
    admin.from("organization_members").select("role, status, organization_id").limit(20000),
    admin.from("profiles").select("platform_role, status").limit(20000),
    admin.from("profiles").select("id", { count: "exact", head: true }).eq("platform_role", "super_admin"),
  ]);

  const roleStats = new Map<string, { total: number; active: number; orgs: Set<string> }>();
  for (const m of members ?? []) {
    const row = roleStats.get(m.role) ?? { total: 0, active: 0, orgs: new Set<string>() };
    row.total += 1;
    if (m.status === "active") row.active += 1;
    row.orgs.add(m.organization_id);
    roleStats.set(m.role, row);
  }

  const platformStats = new Map<string, number>();
  for (const p of profiles ?? []) platformStats.set(p.platform_role, (platformStats.get(p.platform_role) ?? 0) + 1);

  return (
    <>
      <PageTitle
        eyebrow="Users & Identity · RBAC & RLS Policy Matrix"
        title="Roles and permissions"
        subtitle="EVALORA enforces access on the server and through Supabase Row Level Security. Menu visibility is never the security boundary. Change a person's role from their user record or the organization's Members tab."
        action={<ButtonLink href="/admin/users" variant="gold">Manage users</ButtonLink>}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Organization memberships" value={(members ?? []).length} icon={<Users className="h-5 w-5" />} />
        <StatCard label="Active memberships" value={(members ?? []).filter((m) => m.status === "active").length} icon={<ShieldCheck className="h-5 w-5" />} />
        <StatCard label="Platform users" value={(profiles ?? []).length} icon={<Users className="h-5 w-5" />} />
        <StatCard label="Super Admin accounts" value={superCount ?? 0} icon={<ShieldCheck className="h-5 w-5" />} />
      </div>

      <Section title="Platform roles">
        <div className="grid gap-4 md:grid-cols-3">
          {[...platformStats.entries()].sort((a, b) => b[1] - a[1]).map(([role, count]) => (
            <Card key={role} className="p-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-display font-semibold capitalize text-evergreen-950">{role.replace(/_/g, " ")}</h3>
                <Badge tone={role === "super_admin" ? "gold" : "gray"}>{count} account{count === 1 ? "" : "s"}</Badge>
              </div>
              <p className="mt-2 text-sm text-ink-soft">
                {role === "super_admin"
                  ? "Full Owner Control Center access, direct content authoring and audited administrative workspace access."
                  : "Standard authenticated account whose effective access comes from active organization memberships."}
              </p>
              <Link
                href={role === "super_admin" ? "/admin/users?role=super_admin" : "/admin/users"}
                className="mt-3 inline-block font-medium text-evergreen-700 hover:underline"
              >
                View accounts →
              </Link>
            </Card>
          ))}
        </div>
      </Section>

      <Section title="Organization roles" hint="A person can hold different roles in different organizations. Membership status and the account status both affect access.">
        <Table head={["Role", "Operational permissions", "Assignments", "Organizations", "Manage"]}>
          {ORG_ROLES.map((role) => {
            const stats = roleStats.get(role.value) ?? { total: 0, active: 0, orgs: new Set<string>() };
            const subsetHref = role.value === "teacher"
              ? "/admin/users/teachers"
              : role.value === "owner" || role.value === "admin"
                ? "/admin/organizations/admins"
                : "/admin/users";
            return (
              <tr key={role.value}>
                <td>
                  <span className="font-semibold text-evergreen-950">{role.label}</span>
                  <span className="mt-1 block font-mono text-xs text-ink-soft">{role.value}</span>
                </td>
                <td className="max-w-xl">
                  <ul className="space-y-1 text-sm text-ink-soft">
                    {(ROLE_PERMISSIONS[role.value] ?? []).map((permission) => (
                      <li key={permission} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-evergreen-600" />{permission}</li>
                    ))}
                  </ul>
                </td>
                <td className="tabular-nums">{stats.active} active<span className="block text-xs text-ink-soft">{stats.total} total</span></td>
                <td className="tabular-nums">{stats.orgs.size}</td>
                <td><Link href={subsetHref} className="font-medium text-evergreen-700 hover:underline">View people →</Link></td>
              </tr>
            );
          })}
        </Table>
      </Section>

      <Card className="border-gold-500/40 bg-gold-500/5 p-5">
        <h2 className="font-display text-base font-semibold text-evergreen-950">Security boundary</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Super Admin checks run in <code>requireSuperAdmin()</code>; organization operations use server-side role groups
          (creator, manager, marker and proctor) and database RLS. Student and candidate payloads exclude answer keys and worked
          solutions until the appropriate submission/result stage. Granting Super Admin requires a typed confirmation and the
          Primary Super Admin; the Primary account cannot be suspended, demoted or deleted by another user.
        </p>
      </Card>
    </>
  );
}
