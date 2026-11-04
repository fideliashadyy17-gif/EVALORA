import { Button, Card, EmptyState, Field, Input, Select, Textarea } from "@/components/ui";
import { ExportButton } from "@/components/ExportTools";
import { createAdminClient } from "@/lib/supabase/server";
import { fmtDate, toCsv } from "@/lib/utils";
import Link from "next/link";
import {
  bulkStudentOp,
  createStudentLogin,
  importStudents,
  saveStudent,
  studentOp,
} from "../actions/academics";
import { CsvImport } from "../CsvImport";
import { ConfirmField, Flash, Notice, StatusBadge, Table } from "../ui";

export interface StudentsSearchParams {
  sq?: string;
  sclass?: string;
  sstatus?: string;
  edit?: string;
  ok?: string;
  e?: string;
}

const MESSAGES: Record<string, string> = {
  student_saved: "Student saved.",
  student_updated: "Student updated.",
  bulk_done: "Bulk operation completed.",
  import_done: "Import finished — see the report above.",
  account_created: "Student login account created — see the one-time password above.",
  account_linked: "Existing account linked to this student.",
  reset_sent: "Password reset email sent.",
  name: "Full name is required.",
  email: "That email address looks invalid.",
  failed: "Student could not be saved.",
  status: "Invalid status.",
  confirm: "Tick the confirmation box to proceed.",
  class: "Choose a class first.",
  none_selected: "Select at least one student for the bulk operation.",
  empty_csv: "No CSV rows found.",
  too_many: "Import is limited to 1,000 rows per file.",
  student_email: "Add an email address to the student record before creating a login.",
  login_failed: "Login account could not be created.",
};

export async function StudentsPanel({
  organizationId,
  back,
  sp,
  preserveParams = {},
}: {
  organizationId: string;
  back: string;
  sp: StudentsSearchParams;
  preserveParams?: Record<string, string>;
}) {
  const admin = createAdminClient();

  const { data: classes } = await admin
    .from("classes")
    .select("id, name, education_levels(name)")
    .eq("organization_id", organizationId)
    .order("name");

  let query = admin
    .from("students")
    .select("*, student_enrollments(id, status, class_id, classes(name))")
    .eq("organization_id", organizationId)
    .order("full_name")
    .limit(300);
  if (sp.sq) query = query.or(`full_name.ilike.%${sp.sq}%,student_ref.ilike.%${sp.sq}%,email.ilike.%${sp.sq}%`);
  if (sp.sstatus) query = query.eq("status", sp.sstatus);
  const { data: allStudents } = await query;

  const enrolledClass = (s: NonNullable<typeof allStudents>[number]) =>
    ((s.student_enrollments as { status: string; class_id: string; classes: { name: string } | null }[]) ?? [])
      .filter((e) => e.status === "active");

  const students = (allStudents ?? []).filter(
    (s) => !sp.sclass || enrolledClass(s).some((e) => e.class_id === sp.sclass),
  );

  const editing = sp.edit ? (allStudents ?? []).find((s) => s.id === sp.edit) : undefined;
  let editHistory: { competitions: { id: string; title: string; status: string }[]; exams: { title: string; status: string; score: string }[] } | null = null;
  if (editing) {
    const [{ data: regs }, { data: cands }] = await Promise.all([
      admin.from("competition_registrations").select("status, competitions(id, title)").eq("student_id", editing.id).limit(20),
      admin
        .from("exam_candidates")
        .select("status, exams(title), exam_attempts(score, max_score, status)")
        .or(`candidate_ref.eq.${editing.student_ref ?? "__none__"},email.eq.${editing.email ?? "__none__"}`)
        .limit(20),
    ]);
    editHistory = {
      competitions: (regs ?? []).map((r) => {
        const c = r.competitions as unknown as { id: string; title: string } | null;
        return { id: c?.id ?? "", title: c?.title ?? "Competition", status: r.status };
      }),
      exams: (cands ?? []).map((c) => {
        const ex = c.exams as unknown as { title: string } | null;
        const att = (c.exam_attempts as unknown as { score: number | null; max_score: number | null }[] | null)?.[0];
        return {
          title: ex?.title ?? "Examination",
          status: c.status,
          score: att?.score != null ? `${att.score}/${att.max_score ?? "?"}` : "—",
        };
      }),
    };
  }

  const csv = toCsv([
    ["Full name", "Student ref", "Email", "Class", "Status", "Guardian", "Guardian contact"],
    ...students.map((s) => [
      s.full_name, s.student_ref ?? "", s.email ?? "",
      enrolledClass(s).map((e) => e.classes?.name ?? "").join("; "),
      s.status, s.guardian_name ?? "", s.guardian_contact ?? "",
    ]),
  ]);

  const studentForm = (student?: NonNullable<typeof allStudents>[number]) => (
    <div className="grid gap-4 sm:grid-cols-3">
      <Field label="Full name *"><Input name="full_name" required defaultValue={student?.full_name ?? ""} /></Field>
      <Field label="Student reference"><Input name="student_ref" defaultValue={student?.student_ref ?? ""} placeholder="e.g. STU-2026-001" /></Field>
      <Field label="Email (for login account)"><Input name="email" type="email" defaultValue={student?.email ?? ""} /></Field>
      <Field label="Gender">
        <Select name="gender" defaultValue={student?.gender ?? ""}>
          <option value="">—</option>
          <option value="female">Female</option>
          <option value="male">Male</option>
          <option value="other">Other</option>
        </Select>
      </Field>
      <Field label="Date of birth"><Input name="date_of_birth" type="date" defaultValue={student?.date_of_birth ?? ""} /></Field>
      <Field label="Status">
        <Select name="status" defaultValue={student?.status ?? "active"}>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="graduated">Graduated</option>
          <option value="withdrawn">Withdrawn</option>
        </Select>
      </Field>
      <Field label="Guardian name"><Input name="guardian_name" defaultValue={student?.guardian_name ?? ""} /></Field>
      <Field label="Guardian contact"><Input name="guardian_contact" defaultValue={student?.guardian_contact ?? ""} /></Field>
      <Field label={student ? "Also enroll in class" : "Enroll in class"}>
        <Select name="class_id" defaultValue="">
          <option value="">— No class —</option>
          {(classes ?? []).map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
      </Field>
      <Field label="Notes" className="sm:col-span-3"><Textarea name="notes" rows={2} defaultValue={student?.notes ?? ""} /></Field>
    </div>
  );

  return (
    <>
      <Flash />
      <Notice ok={sp.ok} e={sp.e} messages={MESSAGES} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="font-display text-base font-semibold text-evergreen-950">Register a student</h3>
          <form action={saveStudent} className="mt-3 space-y-3">
            <input type="hidden" name="organization_id" value={organizationId} />
            <input type="hidden" name="back" value={back} />
            {studentForm()}
            <Button type="submit" variant="gold">Register student</Button>
          </form>
        </Card>
        <Card className="p-5">
          <h3 className="font-display text-base font-semibold text-evergreen-950">Import students (CSV)</h3>
          <div className="mt-3">
            <CsvImport
              action={importStudents}
              label="Student roster CSV"
              template="full_name,student_ref,email,gender,date_of_birth,guardian_name,guardian_contact"
            >
              <input type="hidden" name="organization_id" value={organizationId} />
              <input type="hidden" name="back" value={back} />
              <Field label="Enroll imported students into class (optional)">
                <Select name="class_id" defaultValue="">
                  <option value="">— No class —</option>
                  {(classes ?? []).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Select>
              </Field>
            </CsvImport>
          </div>
        </Card>
      </div>

      {editing && (
        <Card className="mt-6 p-5 ring-2 ring-gold-500/60">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-base font-semibold text-evergreen-950">Editing: {editing.full_name}</h3>
            <Link href={back} className="text-sm font-medium text-evergreen-700 underline-offset-2 hover:underline">Close editor</Link>
          </div>
          <form action={saveStudent} className="mt-3 space-y-3">
            <input type="hidden" name="organization_id" value={organizationId} />
            <input type="hidden" name="back" value={back} />
            <input type="hidden" name="id" value={editing.id} />
            {studentForm(editing)}
            <div className="flex flex-wrap gap-2">
              <Button type="submit">Save changes</Button>
            </div>
          </form>

          <div className="mt-4 grid gap-4 border-t border-evergreen-900/10 pt-4 md:grid-cols-3">
            <form action={studentOp} className="space-y-2">
              <input type="hidden" name="organization_id" value={organizationId} />
              <input type="hidden" name="back" value={back} />
              <input type="hidden" name="id" value={editing.id} />
              <input type="hidden" name="op" value="move" />
              <Field label="Move to class (ends current enrollments)">
                <Select name="class_id">
                  {(classes ?? []).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Select>
              </Field>
              <Button type="submit" variant="outline">Move student</Button>
            </form>

            <div className="space-y-2">
              <p className="text-sm font-medium text-evergreen-900">Login account</p>
              <p className="text-xs text-ink-soft">
                {editing.user_id ? "This student has a login account. Send a fresh password email if they are locked out." : "Create a login account with a one-time temporary password."}
              </p>
              <form action={createStudentLogin}>
                <input type="hidden" name="organization_id" value={organizationId} />
                <input type="hidden" name="back" value={back} />
                <input type="hidden" name="id" value={editing.id} />
                <Button type="submit" variant="outline">{editing.user_id ? "Send password reset" : "Create login account"}</Button>
              </form>
            </div>

            <form action={studentOp} className="space-y-2">
              <input type="hidden" name="organization_id" value={organizationId} />
              <input type="hidden" name="back" value={back} />
              <input type="hidden" name="id" value={editing.id} />
              <input type="hidden" name="op" value="delete" />
              <p className="text-sm font-medium text-red-800">Delete student record</p>
              <ConfirmField label="Permanently delete this student and their enrollments" />
              <Button type="submit" variant="danger">Delete student</Button>
            </form>
          </div>

          {editHistory && (editHistory.competitions.length > 0 || editHistory.exams.length > 0) && (
            <div className="mt-4 grid gap-4 border-t border-evergreen-900/10 pt-4 sm:grid-cols-2">
              <div>
                <p className="text-sm font-medium text-evergreen-900">Competition history</p>
                <ul className="mt-1 space-y-1 text-sm text-ink-soft">
                  {editHistory.competitions.map((c, i) => (
                    <li key={i}>{c.id ? <Link className="text-evergreen-700 underline-offset-2 hover:underline" href={`/admin/competitions/${c.id}`}>{c.title}</Link> : c.title} — {c.status}</li>
                  ))}
                  {editHistory.competitions.length === 0 && <li>No competitions yet.</li>}
                </ul>
              </div>
              <div>
                <p className="text-sm font-medium text-evergreen-900">Examination history (matched by ref/email)</p>
                <ul className="mt-1 space-y-1 text-sm text-ink-soft">
                  {editHistory.exams.map((x, i) => (
                    <li key={i}>{x.title} — {x.status} · score {x.score}</li>
                  ))}
                  {editHistory.exams.length === 0 && <li>No examination entries yet.</li>}
                </ul>
              </div>
            </div>
          )}
        </Card>
      )}

      <form className="mb-4 mt-6 flex flex-wrap items-end gap-2" method="get">
        {Object.entries(preserveParams).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <div className="min-w-[200px] flex-1">
          <Input name="sq" placeholder="Search name, ref or email…" defaultValue={sp.sq ?? ""} aria-label="Search students" />
        </div>
        <Select name="sclass" defaultValue={sp.sclass ?? ""} className="w-48" aria-label="Filter by class">
          <option value="">All classes</option>
          {(classes ?? []).map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
        <Select name="sstatus" defaultValue={sp.sstatus ?? ""} className="w-40" aria-label="Filter by status">
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="graduated">Graduated</option>
          <option value="withdrawn">Withdrawn</option>
        </Select>
        <Button type="submit" variant="outline">Filter</Button>
        <ExportButton filename="students.csv" csv={csv} label="Export roster" />
      </form>

      {students.length === 0 ? (
        <EmptyState
          title="No students yet"
          body="Register students individually above or import a full roster by CSV. Students can then be enrolled in classes, registered for competitions and given login accounts."
        />
      ) : (
        <form action={bulkStudentOp}>
          <input type="hidden" name="organization_id" value={organizationId} />
          <input type="hidden" name="back" value={back} />
          <div className="mb-3 flex flex-wrap items-end gap-2">
            <span className="text-sm font-medium text-ink">Bulk:</span>
            <Select name="op" className="w-44" aria-label="Bulk operation">
              <option value="enroll">Enroll in class</option>
              <option value="status">Set status</option>
            </Select>
            <Select name="class_id" className="w-48" aria-label="Bulk class">
              <option value="">— class —</option>
              {(classes ?? []).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
            <Select name="status" className="w-40" aria-label="Bulk status">
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="graduated">Graduated</option>
              <option value="withdrawn">Withdrawn</option>
            </Select>
            <Button type="submit" variant="outline">Apply to selected</Button>
            <span className="text-xs text-ink-soft">{students.length} student(s) listed</span>
          </div>
          <Table head={["", "Student", "Class", "Login", "Status", "Actions"]}>
            {students.map((s) => (
              <tr key={s.id}>
                <td><input type="checkbox" name="ids" value={s.id} className="h-4 w-4 accent-evergreen-700" aria-label={`Select ${s.full_name}`} /></td>
                <td>
                  <span className="font-medium text-ink">{s.full_name}</span>
                  <span className="block text-xs text-ink-soft">
                    {[s.student_ref, s.email, s.date_of_birth ? `b. ${fmtDate(s.date_of_birth)}` : null].filter(Boolean).join(" · ") || "—"}
                  </span>
                </td>
                <td>{enrolledClass(s).map((e) => e.classes?.name).filter(Boolean).join(", ") || <span className="text-ink-soft">Unassigned</span>}</td>
                <td>{s.user_id ? <span className="text-evergreen-700">✓ account</span> : <span className="text-ink-soft">none</span>}</td>
                <td><StatusBadge status={s.status} /></td>
                <td>
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    <Link href={`${back}${back.includes("?") ? "&" : "?"}edit=${s.id}`} className="font-medium text-evergreen-700 underline-offset-2 hover:underline">Edit</Link>
                    {!s.user_id && s.email && (
                      <button formAction={createStudentLogin} name="student_btn" value={s.id} className="font-medium text-gold-800 underline-offset-2 hover:underline">
                        Create login
                      </button>
                    )}
                    {s.status === "active" ? (
                      <button formAction={studentOp} name="row_op" value={`status:${s.id}:suspended`} className="font-medium text-red-700 underline-offset-2 hover:underline">Suspend</button>
                    ) : (
                      <button formAction={studentOp} name="row_op" value={`status:${s.id}:active`} className="font-medium text-evergreen-700 underline-offset-2 hover:underline">Activate</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        </form>
      )}
    </>
  );
}
