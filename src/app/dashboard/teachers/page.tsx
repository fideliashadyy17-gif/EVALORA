import { Badge, Button, Card, Field, Input, PageTitle, Select } from "@/components/ui";
import { activeOrg, can, MANAGER_ROLES, requireUser } from "@/lib/auth";
import { isStaffRole } from "@/lib/navAccess";
import { createClient } from "@/lib/supabase/server";
import { fmtDate } from "@/lib/utils";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createStaffAccount } from "../accounts/actions";

export const metadata: Metadata = { title: "Teachers" };
export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  email: "Enter a valid email address.",
  name: "Enter the teacher's full name.",
  role: "Choose a valid staff role.",
  password: "The initial password does not meet the requirements.",
  limit: "Your plan's member limit has been reached. Upgrade or remove a member first.",
  exists: "That person is already a member of this institution.",
  protected: "That account belongs to the EVALORA platform administrator.",
  failed: "The account could not be created. Please try again.",
  forbidden: "Only owners and administrators can add teachers.",
};

/**
 * Teachers — the teaching staff of this institution.
 *
 * Every row is a real `organization_members` record for the active
 * organization, joined to its profile, its classes (`classes.teacher_id`) and
 * the examinations it authored (`exams.created_by`). No counts are estimated.
 */
export default async function TeachersPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; e?: string; detail?: string }>;
}) {
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  const sp = await searchParams;
  if (!isStaffRole(org.role)) redirect("/student");

  const isManager = can(ctx, org.id, MANAGER_ROLES);
  const supabase = await createClient();

  const { data: members } = await supabase
    .from("organization_members")
    .select("id, user_id, role, status, created_at")
    .eq("organization_id", org.id)
    .eq("role", "teacher")
    .order("created_at");

  const teacherIds = (members ?? []).map((m) => m.user_id);
  const [{ data: profiles }, { data: classes }, { data: exams }] = await Promise.all([
    teacherIds.length
      ? supabase.from("profiles").select("id, full_name, email").in("id", teacherIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null; email: string | null }[] }),
    supabase.from("classes").select("id, name, teacher_id").eq("organization_id", org.id),
    teacherIds.length
      ? supabase.from("exams").select("id, created_by, status").eq("organization_id", org.id).in("created_by", teacherIds)
      : Promise.resolve({ data: [] as { id: string; created_by: string | null; status: string | null }[] }),
  ]);

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
  const classesByTeacher = new Map<string, string[]>();
  for (const klass of classes ?? []) {
    if (!klass.teacher_id) continue;
    const list = classesByTeacher.get(klass.teacher_id) ?? [];
    list.push(klass.name);
    classesByTeacher.set(klass.teacher_id, list);
  }
  const examsByTeacher = new Map<string, { total: number; published: number }>();
  for (const exam of exams ?? []) {
    if (!exam.created_by) continue;
    const entry = examsByTeacher.get(exam.created_by) ?? { total: 0, published: 0 };
    entry.total += 1;
    if (exam.status === "published" || exam.status === "closed") entry.published += 1;
    examsByTeacher.set(exam.created_by, entry);
  }

  const active = (members ?? []).filter((m) => m.status !== "suspended" && m.status !== "inactive").length;
  const unassignedClasses = (classes ?? []).filter((k) => !k.teacher_id).length;

  return (
    <>
      <PageTitle
        title="Teachers"
        subtitle={`${members?.length ?? 0} teaching accounts · ${active} active · ${classes?.length ?? 0} classes in this institution`}
        action={
          isManager ? (
            <Link href="/dashboard/accounts" className="text-sm font-semibold text-evergreen-700 underline-offset-2 hover:underline">
              Manage all accounts →
            </Link>
          ) : null
        }
      />

      {sp.ok === "account_created" && (
        <p className="mb-4 rounded-lg bg-evergreen-50 px-4 py-3 text-sm text-evergreen-900">
          Teacher account created. Share the email address and the initial password with them directly — they can change
          it after signing in.
        </p>
      )}
      {sp.ok === "invitation_sent" && (
        <p className="mb-4 rounded-lg bg-evergreen-50 px-4 py-3 text-sm text-evergreen-900">
          Teacher account created and a password-setup email was requested. Ask them to check their inbox.
        </p>
      )}
      {sp.e && (
        <p role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">
          {ERRORS[sp.e] ?? "That request could not be completed."}
          {sp.detail ? ` (${sp.detail})` : ""}
        </p>
      )}
      {unassignedClasses > 0 && (
        <p className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {unassignedClasses} {unassignedClasses === 1 ? "class has" : "classes have"} no teacher assigned.{" "}
          <Link href="/dashboard/academics/classes" className="font-semibold underline underline-offset-2">
            Assign a teacher
          </Link>
          .
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card className="overflow-x-auto p-6">
          <h2 className="font-display text-lg font-semibold text-evergreen-950">Teaching staff</h2>
          {(members ?? []).length === 0 ? (
            <p className="mt-4 rounded-lg bg-cream px-4 py-6 text-sm text-ink-soft">
              No teacher accounts yet. {isManager ? "Add the first teacher with the form on the right." : "An owner or administrator can add teachers."}
            </p>
          ) : (
            <table className="mt-4 w-full text-sm">
              <thead>
                <tr className="border-b border-evergreen-900/10 text-left text-ink-soft">
                  <th className="py-2 pr-3 font-medium">Teacher</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3 font-medium">Classes</th>
                  <th className="py-2 pr-3 font-medium">Examinations</th>
                  <th className="py-2 pr-3 font-medium">Added</th>
                </tr>
              </thead>
              <tbody>
                {(members ?? []).map((member) => {
                  const profile = profileById.get(member.user_id);
                  const teacherClasses = classesByTeacher.get(member.user_id) ?? [];
                  const teacherExams = examsByTeacher.get(member.user_id) ?? { total: 0, published: 0 };
                  const suspended = member.status === "suspended" || member.status === "inactive";
                  return (
                    <tr key={member.id} className="border-b border-evergreen-900/5 align-top">
                      <td className="py-3 pr-3">
                        <p className="font-medium text-evergreen-950">{profile?.full_name ?? "Unnamed teacher"}</p>
                        <p className="text-xs text-ink-soft">{profile?.email ?? "no email on file"}</p>
                      </td>
                      <td className="py-3 pr-3">
                        <Badge tone={suspended ? "red" : "gold"}>{suspended ? "suspended" : "active"}</Badge>
                      </td>
                      <td className="py-3 pr-3 text-ink-soft">
                        {teacherClasses.length === 0 ? (
                          <span className="text-xs">none assigned</span>
                        ) : (
                          <>
                            <span className="font-medium text-evergreen-900">{teacherClasses.length}</span>
                            <span className="block max-w-[220px] truncate text-xs">{teacherClasses.join(", ")}</span>
                          </>
                        )}
                      </td>
                      <td className="py-3 pr-3 text-ink-soft">
                        <span className="font-medium text-evergreen-900">{teacherExams.total}</span>
                        {teacherExams.total > 0 && <span className="block text-xs">{teacherExams.published} published</span>}
                      </td>
                      <td className="py-3 pr-3 text-xs text-ink-soft">{fmtDate(member.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>

        {isManager ? (
          <Card className="h-fit p-6">
            <h2 className="font-display text-lg font-semibold text-evergreen-950">Add a teacher</h2>
            <p className="mt-1 text-sm text-ink-soft">
              The account belongs to this institution only. EVALORA stores the password as a one-way hash in Supabase
              Auth — nobody, including platform staff, can read it back.
            </p>
            <form action={createStaffAccount} className="mt-4 space-y-3">
              <input type="hidden" name="role" value="teacher" />
              <input type="hidden" name="back" value="/dashboard/teachers" />
              <Field label="Full name">
                <Input name="full_name" required maxLength={160} placeholder="Grace Owusu" />
              </Field>
              <Field label="Email address">
                <Input name="email" type="email" required placeholder="grace@institution.edu" />
              </Field>
              <Field label="Setup method">
                <Select name="mode" defaultValue="password">
                  <option value="password">Set an initial password now</option>
                  <option value="invite">Send a password-setup email</option>
                </Select>
              </Field>
              <Field label="Initial password" hint="At least 10 characters, with letters and numbers. Used only when setting a password.">
                <Input name="password" type="password" autoComplete="new-password" minLength={10} />
              </Field>
              <Button type="submit" className="w-full">Create teacher account</Button>
            </form>
          </Card>
        ) : (
          <Card className="h-fit p-6">
            <h2 className="font-display text-lg font-semibold text-evergreen-950">Adding teachers</h2>
            <p className="mt-2 text-sm text-ink-soft">
              Only an organization owner or administrator can create teaching accounts. Ask your administrator if a
              colleague is missing from this list.
            </p>
          </Card>
        )}
      </div>
    </>
  );
}
