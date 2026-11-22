import { PageNavigation } from "@/components/PageNavigation";
import { Badge, Button, ButtonLink, Card, DataTable, Field, Input, PageTitle, Select, StatCard } from "@/components/ui";
import { activeOrg, can, MANAGER_ROLES, requireUser } from "@/lib/auth";
import { isStaffRole } from "@/lib/navAccess";
import { createClient } from "@/lib/supabase/server";
import { fmtDate } from "@/lib/utils";
import { BookOpen, CheckCircle2, GraduationCap, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createStaffAccount } from "../accounts/actions";
import { assignTeacherClasses, sendTeacherPasswordReset, setTeacherStatus, updateTeacherName } from "./actions";

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
  failed: "The account could not be updated. Please try again.",
  forbidden: "Only owners and administrators can manage teachers.",
  missing: "Teacher account not found.",
  owner: "The organization owner account cannot be suspended here.",
  no_email: "Teacher has no email address on file.",
  reset_failed: "Password reset could not be processed.",
};

const SUCCESS: Record<string, string> = {
  account_created: "Teacher account created. Share their email and initial password with them directly.",
  invitation_sent: "Teacher account created and a password-setup email was sent.",
  teacher_updated: "Teacher profile name updated successfully.",
  teacher_suspended: "Teacher account suspended — they can no longer access this institution.",
  teacher_reactivated: "Teacher account reactivated.",
  classes_assigned: "Class assignments updated for this teacher.",
  reset_sent: "Password reset email sent to the teacher.",
  reset_link: "Password reset link prepared for this teacher.",
};

export default async function TeachersPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; e?: string; detail?: string; status?: string; page?: string; assign?: string; edit?: string }>;
}) {
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  const sp = await searchParams;
  if (!isStaffRole(org.role)) redirect("/student");

  const isManager = can(ctx, org.id, MANAGER_ROLES);
  const supabase = await createClient();
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const pageSize = 20;

  let teacherQuery = supabase
    .from("organization_members")
    .select("id, user_id, role, status, created_at", { count: "exact" })
    .eq("organization_id", org.id)
    .eq("role", "teacher")
    .order("created_at", { ascending: false });
  if (sp.status) teacherQuery = teacherQuery.eq("status", sp.status);
  const { data: members, count: teacherTotal } = await teacherQuery.range((page - 1) * pageSize, page * pageSize - 1);

  const teacherIds = (members ?? []).map((m) => m.user_id);
  const [{ data: profiles }, { data: classes }, { data: exams }, { count: activeTeacherTotal }] = await Promise.all([
    teacherIds.length
      ? supabase.from("profiles").select("id, full_name, email").in("id", teacherIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null; email: string | null }[] }),
    supabase.from("classes").select("id, name, code, teacher_id").eq("organization_id", org.id).order("name"),
    teacherIds.length
      ? supabase.from("exams").select("id, created_by, status").eq("organization_id", org.id).in("created_by", teacherIds)
      : Promise.resolve({ data: [] as { id: string; created_by: string | null; status: string | null }[] }),
    supabase.from("organization_members").select("id", { count: "exact", head: true }).eq("organization_id", org.id).eq("role", "teacher").eq("status", "active"),
  ]);

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
  const classesByTeacher = new Map<string, { id: string; name: string; code: string | null }[]>();
  for (const klass of classes ?? []) {
    if (!klass.teacher_id) continue;
    const list = classesByTeacher.get(klass.teacher_id) ?? [];
    list.push(klass);
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

  const active = activeTeacherTotal ?? 0;
  const unassignedClasses = (classes ?? []).filter((k) => !k.teacher_id).length;

  // Assign class modal / panel selection
  const assigningTeacherUser = sp.assign ? (members ?? []).find((m) => m.user_id === sp.assign) : null;
  const assigningProfile = assigningTeacherUser ? profileById.get(assigningTeacherUser.user_id) : null;
  const assignedClassIds = new Set((classesByTeacher.get(sp.assign ?? "") ?? []).map((c) => c.id));

  // Edit name modal / panel selection
  const editingMember = sp.edit ? (members ?? []).find((m) => m.id === sp.edit) : null;
  const editingProfile = editingMember ? profileById.get(editingMember.user_id) : null;

  return (
    <>
      <PageTitle
        eyebrow="People & Academics · Teaching Faculty"
        title="Teachers"
        subtitle={`${teacherTotal ?? 0} matching teaching accounts · ${active} active in this institution · ${classes?.length ?? 0} classes`}
        action={
          isManager ? (
            <div className="flex flex-wrap gap-2">
              <ButtonLink href="/dashboard/academics/classes" variant="outline">Manage classes</ButtonLink>
              <ButtonLink href="/dashboard/accounts" variant="outline">Accounts &amp; Credentials</ButtonLink>
            </div>
          ) : null
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Teaching accounts" value={teacherTotal ?? 0} icon={<GraduationCap className="h-5 w-5" />} />
        <StatCard label="Active teachers" value={active} icon={<CheckCircle2 className="h-5 w-5" />} />
        <StatCard label="Total classes" value={classes?.length ?? 0} icon={<BookOpen className="h-5 w-5" />} />
        <StatCard label="Unassigned classes" value={unassignedClasses} icon={<TriangleAlert className="h-5 w-5" />} />
      </div>

      {sp.ok && SUCCESS[sp.ok] && (
        <p className="mb-4 rounded-lg bg-evergreen-50 px-4 py-3 text-sm text-evergreen-900">
          {SUCCESS[sp.ok]}
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

      {/* Class Assignment Panel */}
      {isManager && assigningTeacherUser && (
        <Card className="mb-6 border-evergreen-700/30 bg-evergreen-50/40 p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold text-evergreen-950">
                Assign classes to {assigningProfile?.full_name ?? "Teacher"}
              </h2>
              <p className="mt-1 text-sm text-ink-soft">
                Select the classes this teacher is responsible for. They will be able to manage these classes and create assessments for their cohorts.
              </p>
            </div>
            <Link href="/dashboard/teachers" className="text-sm font-medium text-evergreen-800 hover:underline">
              ✕ Close
            </Link>
          </div>
          <form action={assignTeacherClasses} className="mt-4 space-y-4">
            <input type="hidden" name="teacher_user_id" value={assigningTeacherUser.user_id} />
            {(classes ?? []).length === 0 ? (
              <p className="text-sm text-ink-soft">No classes available. Create classes first in Academics.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {(classes ?? []).map((c) => {
                  const isChecked = assignedClassIds.has(c.id);
                  const isTaughtByOther = Boolean(c.teacher_id && c.teacher_id !== assigningTeacherUser.user_id);
                  return (
                    <label
                      key={c.id}
                      className={`flex items-start gap-2.5 rounded-xl border p-3 text-sm cursor-pointer transition ${
                        isChecked
                          ? "border-evergreen-700 bg-evergreen-50/80 font-medium text-evergreen-950"
                          : "border-evergreen-900/10 bg-white text-ink hover:border-evergreen-900/30"
                      }`}
                    >
                      <input
                        type="checkbox"
                        name="class_ids"
                        value={c.id}
                        defaultChecked={isChecked}
                        className="mt-0.5 h-4 w-4 accent-evergreen-700 rounded"
                      />
                      <div className="min-w-0">
                        <p className="truncate font-medium">{c.name}</p>
                        {c.code && <p className="text-xs text-ink-soft">{c.code}</p>}
                        {isTaughtByOther && (
                          <p className="text-[11px] text-amber-700">Currently assigned to another teacher</p>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
            <div className="flex items-center gap-3 pt-2">
              <Button type="submit">Save class assignments</Button>
              <Link href="/dashboard/teachers" className="text-sm text-ink-soft hover:underline">
                Cancel
              </Link>
            </div>
          </form>
        </Card>
      )}

      {/* Edit Teacher Name Panel */}
      {isManager && editingMember && (
        <Card className="mb-6 border-evergreen-700/30 bg-cream/70 p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold text-evergreen-950">
                Edit teacher: {editingProfile?.full_name ?? "Unnamed"}
              </h2>
              <p className="mt-1 text-sm text-ink-soft">
                Update the official name displayed on class registers, examination papers, and reports.
              </p>
            </div>
            <Link href="/dashboard/teachers" className="text-sm font-medium text-evergreen-800 hover:underline">
              ✕ Close
            </Link>
          </div>
          <form action={updateTeacherName} className="mt-4 max-w-md space-y-3">
            <input type="hidden" name="member_id" value={editingMember.id} />
            <Field label="Full name">
              <Input name="full_name" defaultValue={editingProfile?.full_name ?? ""} required maxLength={160} />
            </Field>
            <div className="flex items-center gap-3 pt-1">
              <Button type="submit">Update name</Button>
              <Link href="/dashboard/teachers" className="text-sm text-ink-soft hover:underline">
                Cancel
              </Link>
            </div>
          </form>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card className="min-w-0 p-5 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold text-evergreen-950">Teaching staff</h2>
              <p className="mt-1 text-sm text-ink-soft">{teacherTotal ?? 0} teacher accounts · page {page}</p>
            </div>
            <form method="get" className="flex flex-wrap items-end gap-2">
              <label className="text-sm font-medium text-evergreen-900">Account status
                <Select name="status" defaultValue={sp.status ?? ""} className="mt-1 block min-w-36" aria-label="Filter teacher accounts by status">
                  <option value="">All statuses</option><option value="active">Active</option><option value="suspended">Suspended</option>
                </Select>
              </label>
              <Button type="submit" variant="outline">Apply</Button>
              {sp.status && <Link href="/dashboard/teachers" className="inline-flex min-h-11 items-center text-sm text-evergreen-800 underline underline-offset-2">Clear</Link>}
            </form>
          </div>
          {(members ?? []).length === 0 ? (
            <p className="mt-4 rounded-lg bg-cream px-4 py-6 text-sm text-ink-soft">
              No teacher accounts yet. {isManager ? "Add the first teacher with the form on the right." : "An owner or administrator can add teachers."}
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <DataTable head={isManager ? ["Teacher", "Status", "Classes", "Examinations", "Added", "Actions"] : ["Teacher", "Status", "Classes", "Examinations", "Added"]} label="Teaching staff">
                {(members ?? []).map((member) => {
                  const profile = profileById.get(member.user_id);
                  const teacherClasses = classesByTeacher.get(member.user_id) ?? [];
                  const teacherExams = examsByTeacher.get(member.user_id) ?? { total: 0, published: 0 };
                  const suspended = member.status === "suspended" || member.status === "inactive";
                  return (
                    <tr key={member.id} className="align-top">
                      <td>
                        <p className="font-medium text-evergreen-950">{profile?.full_name ?? "Unnamed teacher"}</p>
                        <p className="text-xs text-ink-soft">{profile?.email ?? "no email on file"}</p>
                      </td>
                      <td>
                        <Badge tone={suspended ? "red" : "gold"}>{suspended ? "suspended" : "active"}</Badge>
                      </td>
                      <td className="text-ink-soft">
                        {teacherClasses.length === 0 ? (
                          <span className="text-xs">none assigned</span>
                        ) : (
                          <>
                            <span className="font-medium text-evergreen-900">{teacherClasses.length}</span>
                            <span className="block max-w-[200px] truncate text-xs">
                              {teacherClasses.map((c) => c.name).join(", ")}
                            </span>
                          </>
                        )}
                      </td>
                      <td className="text-ink-soft">
                        <span className="font-medium text-evergreen-900">{teacherExams.total}</span>
                        {teacherExams.total > 0 && <span className="block text-xs">{teacherExams.published} published</span>}
                      </td>
                      <td className="text-xs text-ink-soft">{fmtDate(member.created_at)}</td>
                      {isManager && (
                        <td>
                          <div className="flex flex-col gap-1 text-xs">
                            <div className="flex items-center gap-2">
                              <Link
                                href={`/dashboard/teachers?assign=${member.user_id}`}
                                className="font-medium text-evergreen-700 hover:underline"
                              >
                                Classes ({teacherClasses.length})
                              </Link>
                              <span>·</span>
                              <Link
                                href={`/dashboard/teachers?edit=${member.id}`}
                                className="font-medium text-evergreen-700 hover:underline"
                              >
                                Edit
                              </Link>
                            </div>
                            <div className="flex items-center gap-2">
                              <form action={setTeacherStatus}>
                                <input type="hidden" name="member_id" value={member.id} />
                                <input type="hidden" name="status" value={suspended ? "active" : "suspended"} />
                                <button
                                  type="submit"
                                  className={suspended ? "text-evergreen-800 hover:underline" : "text-red-700 hover:underline"}
                                >
                                  {suspended ? "Reactivate" : "Suspend"}
                                </button>
                              </form>
                              <span>·</span>
                              <form action={sendTeacherPasswordReset}>
                                <input type="hidden" name="member_id" value={member.id} />
                                <button type="submit" className="text-ink-soft hover:underline">
                                  Reset pass
                                </button>
                              </form>
                            </div>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </DataTable>
            </div>
          )}
          <PageNavigation page={page} pageSize={pageSize} total={teacherTotal ?? 0} pathname="/dashboard/teachers" query={{ status: sp.status }} label="teachers" />
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
