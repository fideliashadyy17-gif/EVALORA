import { StudentImportWizard } from "@/components/StudentImportWizard";
import { PageNavigation } from "@/components/PageNavigation";
import { Badge, Button, ButtonLink, Card, EmptyState, Field, Input, PageTitle, Select } from "@/components/ui";
import { activeOrg, can, CREATOR_ROLES, MANAGER_ROLES, requireUser } from "@/lib/auth";
import { identityKey } from "@/lib/studentImport";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import Link from "next/link";
import { transferStudent } from "../academics/actions";
import { createStudentLogin, setStudentStatus } from "./actions";
import { StudentRegistrationForm } from "./StudentRegistrationForm";

export const metadata: Metadata = { title: "Students" };
export const dynamic = "force-dynamic";

interface SP { q?: string; class?: string; status?: string; ok?: string; e?: string; page?: string }

const ERR: Record<string, string> = {
  status: "That status change was not valid.", student: "Student not found in your school.",
  student_email: "Add the student's email first — it is needed for a portal login.",
  login_failed: "The login account could not be created.",
};
const OK: Record<string, string> = {
  status: "Student status updated.", transferred: "Student transferred.", unenrolled: "Student removed from class.",
  reset_sent: "Password reset email sent to the student.", login_sent: "Login created — a set-password email was sent to the student.",
};

/** Academic Management → Students: register, import, enroll, transfer. */
export default async function DashboardStudentsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  const canEdit = can(ctx, org.id, CREATOR_ROLES);
  const canManageClasses = can(ctx, org.id, MANAGER_ROLES) || canEdit;
  const supabase = await createClient();
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const pageSize = 25;

  const [{ data: years }, { data: levels }, { data: departments }, { data: classRows }, { data: members }] = await Promise.all([
    supabase.from("academic_years").select("id, name, is_current").eq("organization_id", org.id).order("created_at", { ascending: false }),
    supabase.from("education_levels").select("id, name").eq("organization_id", org.id).order("sort").order("name"),
    supabase.from("departments").select("id, name").eq("organization_id", org.id).order("sort").order("name"),
    supabase.from("classes").select("id, name, code, academic_year_id, level_id, status").eq("organization_id", org.id).order("name"),
    supabase.from("organization_members").select("user_id, role, profiles(full_name, email)").eq("organization_id", org.id).eq("status", "active"),
  ]);
  const classes = classRows ?? [];
  const activeClasses = classes.filter((c) => c.status === "active");
  const className = new Map(classes.map((c) => [c.id, c.name]));
  const teachers = (members ?? []).filter((m) => ["owner", "admin", "teacher", "organizer"].includes(m.role)).map((m) => {
    const p = m.profiles as unknown as { full_name: string | null; email: string } | null;
    return { id: m.user_id, name: p?.full_name || p?.email || "Member" };
  });

  // Student list is tenant-scoped and server-paginated. Resolve a class filter
  // to student ids first so search, status, count, and page boundaries all
  // apply to the same roster without relying on a client-side partial slice.
  const classStudentIds = sp.class
    ? ((await supabase.from("student_enrollments").select("student_id").eq("organization_id", org.id).eq("class_id", sp.class).eq("status", "active").limit(2000)).data ?? []).map((row) => row.student_id)
    : null;
  let sq = supabase
    .from("students")
    .select("*", { count: "exact" })
    .eq("organization_id", org.id)
    .order("full_name");
  if (sp.q?.trim()) sq = sq.or(`full_name.ilike.%${sp.q.trim()}%,email.ilike.%${sp.q.trim()}%,student_ref.ilike.%${sp.q.trim()}%`);
  if (sp.status) sq = sq.eq("status", sp.status);
  if (classStudentIds) sq = sq.in("id", classStudentIds);
  const studentResult = classStudentIds?.length === 0
    ? null
    : await sq.range((page - 1) * pageSize, page * pageSize - 1);
  const studentRows = studentResult?.data ?? [];
  const studentTotal = studentResult?.count ?? 0;
  const students = studentRows;

  const studentIds = students.map((s) => s.id);
  const { data: enrollmentRows } = studentIds.length
    ? await supabase.from("student_enrollments").select("student_id, class_id").eq("organization_id", org.id).in("student_id", studentIds).eq("status", "active")
    : { data: [] };
  const enrollmentByStudent = new Map<string, string>();
  for (const e of enrollmentRows ?? []) if (!enrollmentByStudent.has(e.student_id)) enrollmentByStudent.set(e.student_id, e.class_id);

  // Existing identities for import duplicate detection (this school only).
  const { data: allStudents } = await supabase.from("students")
    .select("full_name, email, student_ref, date_of_birth").eq("organization_id", org.id).limit(20000);
  const existing = {
    refs: (allStudents ?? []).map((s) => s.student_ref?.trim().toLowerCase()).filter(Boolean) as string[],
    emails: (allStudents ?? []).map((s) => s.email?.trim().toLowerCase()).filter(Boolean) as string[],
    nameDob: (allStudents ?? []).map((s) => identityKey(s.full_name, s.date_of_birth)),
  };

  const { data: batches } = await supabase.from("import_batches")
    .select("id, file_name, file_type, status, total_rows, imported_count, updated_count, skipped_count, failed_count, created_at")
    .eq("organization_id", org.id).order("created_at", { ascending: false }).limit(8);

  return (
    <>
      <PageTitle
        title="Students"
        subtitle="Register students into your school's classes, import registers from CSV, Excel, PDF or Word, and manage enrollments."
        action={<ButtonLink href="/dashboard/academics/classes" variant="outline">Manage classes</ButtonLink>}
      />
      {sp.ok && OK[sp.ok] && <p className="mb-4 rounded-lg bg-evergreen-50 px-4 py-3 text-sm text-evergreen-900">{OK[sp.ok]}</p>}
      {sp.e && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{ERR[sp.e] ?? decodeURIComponent(sp.e)}</p>}

      {(years ?? []).length === 0 ? (
        <Card className="mb-6 p-6">
          <EmptyState
            title="Set up your academic structure first"
            body="Student registration is organized by academic year and class. Create an academic year (and your education levels), then your first class — it takes a minute."
            action={<ButtonLink href="/dashboard/academics" variant="gold">Create academic year →</ButtonLink>}
          />
        </Card>
      ) : canEdit ? (
        <Card className="mb-6 p-6">
          <h2 className="font-display text-lg font-semibold text-evergreen-950">Register a student</h2>
          <p className="mb-4 mt-1 text-sm text-ink-soft">Classes are loaded from your school for the selected academic year. Need a new class? Create it inline without leaving this form.</p>
          <StudentRegistrationForm
            years={(years ?? []).map((y) => ({ id: y.id, name: y.name, is_current: y.is_current }))}
            classes={activeClasses.map((c) => ({ id: c.id, name: c.name, code: c.code, academic_year_id: c.academic_year_id, level_id: c.level_id }))}
            levels={levels ?? []} departments={departments ?? []} teachers={teachers}
            canManageClasses={canManageClasses}
          />
        </Card>
      ) : null}

      {canEdit && (
        <Card className="mb-6 p-6">
          <h2 className="font-display text-lg font-semibold text-evergreen-950">Import students</h2>
          <p className="mb-4 mt-1 text-sm text-ink-soft">Upload a register in CSV, XLS, XLSX, PDF, DOC or DOCX format — map the columns, fix anything flagged, then confirm. Every row is accounted for in the final report.</p>
          <StudentImportWizard
            organizationId={org.id}
            classes={activeClasses.map((c) => ({ id: c.id, name: c.name, code: c.code, academic_year_id: c.academic_year_id, status: c.status }))}
            years={(years ?? []).map((y) => ({ id: y.id, name: y.name, is_current: y.is_current }))}
            existing={existing}
          />
          {(batches ?? []).length > 0 && (
            <div className="mt-6 border-t border-evergreen-900/10 pt-4">
              <h3 className="font-semibold text-evergreen-950">Recent import operations</h3>
              <ul className="mt-2 divide-y divide-evergreen-900/10 text-sm">
                {(batches ?? []).map((b) => (
                  <li key={b.id} className="flex flex-wrap justify-between gap-2 py-2">
                    <span className="text-ink"><strong>{b.file_name ?? "Import"}</strong> <span className="text-ink-soft">· {new Date(b.created_at).toLocaleString()}</span></span>
                    <span className="text-ink-soft">{b.status} · {b.imported_count} imported, {b.updated_count} updated, {b.skipped_count} skipped, {b.failed_count} failed / {b.total_rows}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      <Card className="p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="font-display text-lg font-semibold text-evergreen-950">Student list</h2><span className="text-sm text-ink-soft">{studentTotal ?? 0} matching students · page {page}</span></div>
        <form method="get" className="mt-4 grid gap-3 sm:grid-cols-4">
          <Field label="Search"><Input name="q" defaultValue={sp.q ?? ""} placeholder="Name, email or reference" /></Field>
          <Field label="Class"><Select name="class" defaultValue={sp.class ?? ""}><option value="">All classes</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
          <Field label="Status"><Select name="status" defaultValue={sp.status ?? ""}><option value="">All statuses</option>{["active", "suspended", "graduated", "withdrawn"].map((s) => <option key={s} value={s}>{s}</option>)}</Select></Field>
          <div className="flex items-end gap-3"><Button type="submit" variant="outline">Apply filters</Button><Link href="/dashboard/students" className="inline-flex min-h-11 items-center text-sm font-medium text-evergreen-800 underline underline-offset-2">Clear</Link></div>
        </form>
        {students.length === 0 ? (
          <EmptyState title={sp.q || sp.class || sp.status ? "No students match these filters" : "No students yet"} body={sp.q || sp.class || sp.status ? "Try another search or clear the filters. Student records are unchanged." : "Register your first student above, or import a class register."} />
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead><tr className="border-b border-evergreen-900/15 text-left text-xs uppercase text-ink-soft">{["Student", "Reference", "Class", "Status", "Portal login", "Actions"].map((h) => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr></thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.id} className="border-b border-evergreen-900/10 align-top">
                    <td className="px-3 py-2"><strong className="text-evergreen-950">{s.full_name}</strong>{s.email ? <span className="block text-xs text-ink-soft">{s.email}</span> : null}</td>
                    <td className="px-3 py-2">{s.student_ref ?? "—"}</td>
                    <td className="px-3 py-2">{enrollmentByStudent.get(s.id) ? className.get(enrollmentByStudent.get(s.id)!) ?? "—" : "Not enrolled"}</td>
                    <td className="px-3 py-2"><Badge tone={s.status === "active" ? "green" : "gray"}>{s.status}</Badge></td>
                    <td className="px-3 py-2">{s.user_id ? "Linked" : "No login"}</td>
                    <td className="px-3 py-2">
                      {canEdit ? (
                        <div className="flex flex-wrap gap-x-3 gap-y-1">
                          <form action={transferStudent} className="flex gap-1">
                            <input type="hidden" name="back" value="/dashboard/students" /><input type="hidden" name="student_id" value={s.id} />
                            <Select name="class_id" aria-label="Move to class" className="max-w-40">
                              {activeClasses.filter((c) => c.id !== enrollmentByStudent.get(s.id)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </Select>
                            <button className="text-evergreen-800 underline underline-offset-2" type="submit">Move</button>
                          </form>
                          <form action={setStudentStatus} className="flex gap-1">
                            <input type="hidden" name="id" value={s.id} />
                            <Select name="status" aria-label="Student status" defaultValue={s.status} className="max-w-32">
                              {["active", "suspended", "graduated", "withdrawn"].map((st) => <option key={st} value={st}>{st}</option>)}
                            </Select>
                            <button className="text-evergreen-800 underline underline-offset-2" type="submit">Set</button>
                          </form>
                          <form action={createStudentLogin}>
                            <input type="hidden" name="id" value={s.id} />
                            <button className="text-evergreen-800 underline underline-offset-2" type="submit">{s.user_id ? "Reset login" : "Create login"}</button>
                          </form>
                        </div>
                      ) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <PageNavigation page={page} pageSize={pageSize} total={studentTotal ?? 0} pathname="/dashboard/students" query={{ q: sp.q, class: sp.class, status: sp.status }} label="students" />
    </>
  );
}
