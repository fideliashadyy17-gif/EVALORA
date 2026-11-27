import { PageNavigation } from "@/components/PageNavigation";
import { Badge, Button, Card, DataTable, Field, Input, PageTitle, Select, StatCard } from "@/components/ui";
import { activeOrg, requireUser } from "@/lib/auth";
import { formatOrganizationRoleLabel } from "@/lib/accountCreationPolicy";
import { loadAccountCreationRoles } from "@/lib/accountCreationRoles";
import { getCapabilities, requireModule } from "@/lib/capabilities";
import { canOperateMany } from "@/lib/operationalAccess";
import { MIN_INITIAL_PASSWORD_LENGTH } from "@/lib/organizationAccounts";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createStaffAccount, resetMemberPassword, setMemberStatus } from "./actions";
import { createStudentLogin } from "../students/actions";
import { requestFormatter } from "@/lib/formattingRequest";

export const metadata: Metadata = { title: "Accounts & permissions" };
export const dynamic = "force-dynamic";

/**
 * Accounts & permissions for one organization.
 *
 * Managers create staff, administrator, teacher, and School Founder accounts
 * using the centralized RBAC role catalog (`access_roles`), request password
 * setup/reset links (stored only by Supabase Auth — never in an application
 * table), and suspend access. Every query and every action is scoped to the
 * active organization, and the platform Super Admin's account is out of reach.
 */
export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; e?: string; detail?: string; page?: string }>;
}) {
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  // Configured date, time and number profile (Platform Control Center →
  // Presentation), resolved once per request from the session's own organization.
  const { date: fmtDate } = await requestFormatter(org?.id ?? null);
  const sp = await searchParams;
  const { canManageMembers, canViewRoles } = await canOperateMany(ctx, org.id, {
    canManageMembers: { permission: "organizations.manage_members", module: "accounts" },
    canViewRoles: { permission: "roles.view", module: "accounts" },
  });
  if (!canManageMembers) redirect("/dashboard?e=forbidden");
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const pageSize = 25;

  const supabase = await createClient();
  const { entitlement } = await getCapabilities(supabase, ctx, org.id);
  requireModule(entitlement, "accounts", "/dashboard?e=module");
  const admin = createAdminClient();

  const [{ data: members }, { data: students }, { data: rbacAssignments }, assignableRoles] = await Promise.all([
    supabase
      .from("organization_members")
      .select("id, user_id, role, status, created_at")
      .eq("organization_id", org.id)
      .order("created_at"),
    supabase
      .from("students")
      .select("id, full_name, email, status, user_id")
      .eq("organization_id", org.id)
      .order("full_name")
      .limit(500),
    supabase
      .from("access_user_roles")
      .select("user_id, status, access_roles(slug, name)")
      .eq("organization_id", org.id)
      .eq("status", "active"),
    loadAccountCreationRoles(ctx, org.id),
  ]);

  const rbacRoleByUser = new Map<string, { slug: string; name: string }>();
  for (const row of (rbacAssignments ?? []) as unknown as {
    user_id: string;
    access_roles: { slug: string; name: string } | { slug: string; name: string }[] | null;
  }[]) {
    const roleObj = Array.isArray(row.access_roles) ? row.access_roles[0] : row.access_roles;
    if (roleObj?.slug) rbacRoleByUser.set(row.user_id, roleObj);
  }

  const userIds = (members ?? []).map((m) => m.user_id);
  const { data: profiles } = userIds.length
    ? await admin.from("profiles").select("id, email, full_name, platform_role, status").in("id", userIds)
    : { data: [] as { id: string; email: string; full_name: string | null; platform_role: string; status: string }[] };
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  const roster = students ?? [];
  const withLogin = roster.filter((s) => s.user_id).length;
  const staffCount = (members ?? []).filter((m) => !["student", "participant", "candidate", "parent"].includes(m.role)).length;
  const defaultRoleValue = assignableRoles.find((r) => r.slug === "teacher")?.slug ?? assignableRoles[0]?.slug ?? "";

  return (
    <>
      <PageTitle
        eyebrow="Workspace Administration · Account Credentials & Access"
        title="Accounts & permissions"
        subtitle={`Create and control the accounts that belong to ${org.name}. Roles are loaded from the centralized RBAC catalog, and passwords are stored only by Supabase Auth.`}
        action={
          <div className="flex flex-wrap items-center gap-4">
            {canViewRoles && (
              <Link href="/dashboard/rbac" className="text-sm font-medium text-evergreen-700 underline-offset-2 hover:underline">
                Role &amp; Access Management →
              </Link>
            )}
            <Link href="/dashboard/team" className="text-sm font-medium text-evergreen-700 underline-offset-2 hover:underline">
              Roles &amp; invitations →
            </Link>
          </div>
        }
      />

      {sp.ok && (
        <p role="status" className="mb-4 rounded-lg bg-evergreen-50 px-4 py-3 text-sm text-evergreen-900">
          {sp.ok === "account_created"
            ? "Account created with its centralized RBAC role. Share the account email and temporary initial password securely out-of-band, and ask the user to change it after signing in."
            : sp.ok === "account_created_reconciled"
              ? "Account created with its centralized RBAC role, and the existing pending invitation for that email was reconciled automatically (no duplicate invitation remains)."
              : sp.ok === "invitation_sent"
                ? "Account provisioned and activation / password-setup email requested. The user sets their own password privately via email."
                : sp.ok === "invitation_sent_reconciled"
                  ? "Account provisioned, activation / password-setup email requested, and the existing pending invitation for that email was reconciled cleanly."
                  : sp.ok === "account_created_recovery"
                    ? "Account created with its centralized RBAC role in secure password-setup state. Automated mail delivery could not be queued in this deployment — the account holder can set their password using Forgot Password or a Supabase Auth recovery link."
                    : sp.ok === "account_created_recovery_reconciled"
                      ? "Account created with its centralized RBAC role and the existing pending invitation was reconciled cleanly. Automated mail delivery could not be queued — the account holder can set their password via Forgot Password or a Supabase Auth recovery link."
                      : sp.ok === "reset_sent"
                        ? "Password reset email requested for that account."
                        : sp.ok === "reset_link"
                          ? "A reset email could not be queued (mail delivery is not configured in this deployment). The account exists — use Supabase → Authentication → Users to generate a recovery link."
                          : sp.ok === "active"
                            ? "Account reactivated."
                            : sp.ok === "suspended"
                              ? "Account suspended — the person can no longer enter this organization."
                              : "Saved."}
        </p>
      )}
      {sp.e && (
        <p role="alert" className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {sp.e === "forbidden"
            ? "Only organization owners and administrators can manage accounts."
            : sp.e === "owner"
              ? "The organization owner's account is managed from the platform level and cannot be changed here."
              : sp.e === "protected"
                ? "That email belongs to the EVALORA platform administrator and cannot be modified or added from an organization."
                : sp.e === "exists"
                  ? "That person is already a member of this organization. Existing accounts and memberships were left untouched."
                  : sp.e === "founder_conflict"
                    ? "School Founder / Institutional Supervisor requires a dedicated read-only account and cannot be combined with an existing administrator, owner, or operational staff membership."
                    : sp.e === "email"
                      ? "Enter a valid email address."
                      : sp.e === "name"
                        ? "Enter the person's full name."
                        : sp.e === "role"
                          ? "Choose a valid, authorized organization role from the centralized RBAC catalog."
                          : sp.e === "password"
                            ? `The initial password is not strong enough. ${sp.detail ?? ""}`
                            : sp.e === "limit"
                              ? "Your plan's member limit has been reached."
                              : sp.e === "no_email"
                                ? "That account has no email address, so a reset cannot be sent."
                                : "That action could not be completed."}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Staff, admins & supervision" value={staffCount} />
        <StatCard label="Student accounts" value={withLogin} hint={`${roster.length} students on the roster`} />
        <StatCard label="Students without a login" value={roster.length - withLogin} />
        <StatCard label="Suspended members" value={(members ?? []).filter((m) => m.status !== "active").length} />
      </div>

      <Card className="mt-6 p-5 sm:p-6">
        <h2 className="font-display text-lg font-semibold text-evergreen-950">Staff, teachers and members</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Role determines what a person can do inside {org.name}. Suspending a member blocks their access immediately
          without deleting their work.
        </p>
        <div className="mt-4">
          <DataTable head={["Member", "Role", "Access", "Since", "Account"]} label="Staff, teachers and members">
            {(members ?? []).map((m) => {
              const profile = profileById.get(m.user_id);
              const rbacRole = rbacRoleByUser.get(m.user_id);
              const isSuperAdmin = profile?.platform_role === "super_admin";
              const protectedRow = m.role === "owner" || isSuperAdmin || m.user_id === ctx.user.id;
              const roleBadgeTone =
                m.role === "owner" || m.role === "school_founder"
                  ? "gold"
                  : m.role === "admin"
                    ? "green"
                    : "gray";
              const displayRoleLabel = formatOrganizationRoleLabel(
                rbacRole?.slug ?? m.role,
                rbacRole?.name,
              );
              return (
                <tr key={m.id}>
                  <td>
                    <span className="font-medium text-evergreen-950">{profile?.full_name || profile?.email || "Member"}</span>
                    <span className="block text-xs text-ink-soft">{profile?.email}</span>
                  </td>
                  <td>
                    <Badge tone={roleBadgeTone}>{displayRoleLabel}</Badge>
                    {isSuperAdmin && <span className="mt-1 block text-[11px] font-semibold text-gold-800">EVALORA platform admin</span>}
                    {m.role === "school_founder" && (
                      <span className="mt-1 block text-[11px] font-medium text-evergreen-800">Read-only institutional supervision</span>
                    )}
                  </td>
                  <td>
                    <Badge tone={m.status === "active" ? "green" : "red"}>{m.status}</Badge>
                  </td>
                  <td className="text-xs text-ink-soft">{fmtDate(m.created_at)}</td>
                  <td>
                    {protectedRow ? (
                      <span className="text-xs text-ink-soft">
                        {m.role === "owner" ? "Owner account" : isSuperAdmin ? "Platform-level account" : "Your account"}
                      </span>
                    ) : (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <form action={resetMemberPassword}>
                          <input type="hidden" name="member_id" value={m.id} />
                          <button className="font-medium text-evergreen-700 underline-offset-2 hover:underline">
                            Reset password
                          </button>
                        </form>
                        <form action={setMemberStatus}>
                          <input type="hidden" name="member_id" value={m.id} />
                          <input type="hidden" name="status" value={m.status === "active" ? "suspended" : "active"} />
                          <button
                            className={`font-medium underline-offset-2 hover:underline ${m.status === "active" ? "text-red-700" : "text-evergreen-700"}`}
                          >
                            {m.status === "active" ? "Suspend" : "Reactivate"}
                          </button>
                        </form>
                        {canViewRoles && (
                          <Link
                            href={`/dashboard/rbac?inspect=${m.user_id}`}
                            className="font-medium text-evergreen-700 underline-offset-2 hover:underline"
                          >
                            Inspect permissions
                          </Link>
                        )}
                        {m.role !== "school_founder" && (
                          <Link
                            href="/dashboard/team"
                            className="font-medium text-evergreen-700 underline-offset-2 hover:underline"
                          >
                            Change role
                          </Link>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </DataTable>
        </div>
      </Card>

      <Card className="mt-6 p-5 sm:p-6">
        <h2 className="font-display text-lg font-semibold text-evergreen-950">Create a staff or teacher account</h2>
        <p className="mt-1 text-sm text-ink-soft">
          The account is provisioned in Supabase Auth and assigned its role from EVALORA&apos;s centralized RBAC catalog
          for {org.name}. Prefer sending an activation email so the user sets their own password securely; passwords are
          never stored in EVALORA tables or exposed in logs.
        </p>
        <form action={createStaffAccount} className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Full name">
            <Input name="full_name" required maxLength={160} placeholder="Ada Mensah" />
          </Field>
          <Field label="Email address">
            <Input name="email" type="email" required placeholder="ada@oakinternational.edu" autoComplete="off" />
          </Field>
          <Field
            label="Role"
            hint="Loaded from the centralized RBAC catalog for your organization. School Founder / Institutional Supervisor grants read-only dashboard supervision and reconciles any pending invitation for that email."
          >
            <Select name="role" defaultValue={defaultRoleValue} required>
              {assignableRoles.map((role) => (
                <option key={role.id} value={role.slug}>
                  {role.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="How to set the password">
            <Select name="mode" defaultValue="invite">
              <option value="invite">Send an activation / password-setup email (recommended)</option>
              <option value="password">Set a temporary initial password now</option>
            </Select>
          </Field>
          <Field
            label="Temporary initial password (only when setting a password manually)"
            hint={`At least ${MIN_INITIAL_PASSWORD_LENGTH} characters, with letters and numbers. Leave blank when using the recommended activation email flow.`}
            className="sm:col-span-2"
          >
            <Input name="password" type="password" autoComplete="new-password" placeholder="Optional — leave blank for activation email" />
          </Field>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={assignableRoles.length === 0}>Create account</Button>
          </div>
        </form>
      </Card>

      <Card className="mt-6 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="font-display text-lg font-semibold text-evergreen-950">Student accounts</h2>
            <p className="mt-1 text-sm text-ink-soft">
              Student logins are attached to the roster. Create a login for a student, or reset an existing one.
            </p>
          </div>
          <Link href="/dashboard/students" className="text-sm font-medium text-evergreen-700 underline-offset-2 hover:underline">
            Full student management →
          </Link>
        </div>
        {roster.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-evergreen-900/25 px-4 py-6 text-center text-sm text-ink-soft">
            No students on the roster yet.{" "}
            <Link href="/dashboard/students" className="font-semibold text-evergreen-700 underline underline-offset-2">
              Add students
            </Link>
            .
          </p>
        ) : (
          <div className="mt-4">
            <DataTable head={["Student", "Login", "Action"]} label="Student portal accounts">
              {roster.slice((page - 1) * pageSize, page * pageSize).map((s) => (
                <tr key={s.id}>
                  <td>
                    <span className="font-medium text-evergreen-950">{s.full_name}</span>
                    <span className="block text-xs text-ink-soft">{s.email ?? "no email on file"}</span>
                  </td>
                  <td>
                    <Badge tone={s.user_id ? "green" : "gray"}>{s.user_id ? "active login" : "no login"}</Badge>
                  </td>
                  <td>
                    <form action={createStudentLogin}>
                      <input type="hidden" name="id" value={s.id} />
                      <button className="text-xs font-medium text-evergreen-700 underline-offset-2 hover:underline disabled:opacity-50" disabled={!s.email}>
                        {s.user_id ? "Reset password" : "Create login"}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </DataTable>
            <PageNavigation
              page={page}
              pageSize={pageSize}
              total={roster.length}
              pathname="/dashboard/accounts"
              label="student accounts"
            />
          </div>
        )}
      </Card>
    </>
  );
}
