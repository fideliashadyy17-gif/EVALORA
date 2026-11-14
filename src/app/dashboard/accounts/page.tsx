import { PageNavigation } from "@/components/PageNavigation";
import { Badge, Button, Card, DataTable, Field, Input, PageTitle, Select, StatCard } from "@/components/ui";
import { activeOrg, can, MANAGER_ROLES, requireUser } from "@/lib/auth";
import { ASSIGNABLE_STAFF_ROLES, MIN_INITIAL_PASSWORD_LENGTH } from "@/lib/organizationAccounts";
import { ORG_ROLES } from "@/lib/brand";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { fmtDate } from "@/lib/utils";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createStaffAccount, resetMemberPassword, setMemberStatus } from "./actions";
import { createStudentLogin } from "../students/actions";

export const metadata: Metadata = { title: "Accounts & permissions" };
export const dynamic = "force-dynamic";

const ROLE_LABEL = Object.fromEntries(ORG_ROLES.map((r) => [r.value, r.label]));

/**
 * Accounts & permissions for one organization.
 *
 * Managers create staff accounts, set initial passwords (stored only by
 * Supabase Auth — never in an application table), reset forgotten passwords and
 * suspend access. Every query and every action is scoped to the active
 * organization, and the platform Super Admin's account is out of reach.
 */
export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; e?: string; detail?: string; page?: string }>;
}) {
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  const sp = await searchParams;
  if (!can(ctx, org.id, MANAGER_ROLES)) redirect("/dashboard?e=forbidden");
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const pageSize = 25;

  const supabase = await createClient();
  const admin = createAdminClient();

  const [{ data: members }, { data: students }] = await Promise.all([
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
  ]);

  const userIds = (members ?? []).map((m) => m.user_id);
  const { data: profiles } = userIds.length
    ? await admin.from("profiles").select("id, email, full_name, platform_role, status").in("id", userIds)
    : { data: [] as { id: string; email: string; full_name: string | null; platform_role: string; status: string }[] };
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  const roster = students ?? [];
  const withLogin = roster.filter((s) => s.user_id).length;
  const staffCount = (members ?? []).filter((m) => !["student", "participant", "candidate", "parent"].includes(m.role)).length;

  return (
    <>
      <PageTitle
        eyebrow="Workspace Administration · Account Credentials & Access"
        title="Accounts & permissions"
        subtitle={`Create and control the accounts that belong to ${org.name}. Passwords are stored only by Supabase Auth — administrators set an initial password once and can reset it later.`}
        action={
          <Link href="/dashboard/team" className="text-sm font-medium text-evergreen-700 underline-offset-2 hover:underline">
            Roles & invitations →
          </Link>
        }
      />

      {sp.ok && (
        <p className="mb-4 rounded-lg bg-evergreen-50 px-4 py-3 text-sm text-evergreen-900">
          {sp.ok === "account_created"
            ? "Account created. Give the person their email address and the initial password you chose — ask them to change it after signing in."
            : sp.ok === "invitation_sent"
              ? "Invitation created. The person receives an email to set their password when mail delivery is configured."
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
        <p className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {sp.e === "forbidden"
            ? "Only owners and administrators can manage accounts."
            : sp.e === "owner"
              ? "The organization owner's account is managed from the platform level and cannot be changed here."
              : sp.e === "protected"
                ? "That email belongs to the EVALORA platform administrator and cannot be added to an organization."
                : sp.e === "exists"
                  ? "That person is already a member of this organization."
                  : sp.e === "email"
                    ? "Enter a valid email address."
                    : sp.e === "name"
                      ? "Enter the person's full name."
                      : sp.e === "role"
                        ? "Choose a valid staff role."
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
        <StatCard label="Staff & teachers" value={staffCount} />
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
              const isSuperAdmin = profile?.platform_role === "super_admin";
              const protectedRow = m.role === "owner" || isSuperAdmin || m.user_id === ctx.user.id;
              return (
                <tr key={m.id}>
                  <td>
                    <span className="font-medium text-evergreen-950">{profile?.full_name || profile?.email || "Member"}</span>
                    <span className="block text-xs text-ink-soft">{profile?.email}</span>
                  </td>
                  <td>
                    <Badge tone={m.role === "owner" ? "gold" : m.role === "admin" ? "green" : "gray"}>
                      {ROLE_LABEL[m.role] ?? m.role}
                    </Badge>
                    {isSuperAdmin && <span className="mt-1 block text-[11px] font-semibold text-gold-800">EVALORA platform admin</span>}
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
                        <Link
                          href="/dashboard/team"
                          className="font-medium text-evergreen-700 underline-offset-2 hover:underline"
                        >
                          Change role
                        </Link>
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
          The account is created in Supabase Auth. Choose an initial password and hand it over in person, or send an
          activation email when mail delivery is configured. Passwords are never stored in EVALORA tables.
        </p>
        <form action={createStaffAccount} className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Full name">
            <Input name="full_name" required maxLength={160} placeholder="Ada Mensah" />
          </Field>
          <Field label="Email address">
            <Input name="email" type="email" required placeholder="ada@oakinternational.edu" autoComplete="off" />
          </Field>
          <Field label="Role">
            <Select name="role" defaultValue="teacher">
              {ASSIGNABLE_STAFF_ROLES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABEL[role] ?? role}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="How to set the password">
            <Select name="mode" defaultValue="password">
              <option value="password">I set an initial password now</option>
              <option value="invite">Send an activation email</option>
            </Select>
          </Field>
          <Field
            label="Initial password (when setting one)"
            hint={`At least ${MIN_INITIAL_PASSWORD_LENGTH} characters, with letters and numbers.`}
            className="sm:col-span-2"
          >
            <Input name="password" type="text" autoComplete="new-password" placeholder="Temporary password for hand-over" />
          </Field>
          <div className="sm:col-span-2">
            <Button type="submit">Create account</Button>
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
