import { Badge, Button, ButtonLink, Card, EmptyState, Field, Input, PageTitle, Select, Textarea } from "@/components/ui";
import { activeOrg, can, CREATOR_ROLES, MANAGER_ROLES, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { classLifecycle, saveClassForm, transferStudent, withdrawEnrollment } from "../actions";

export const metadata: Metadata = { title: "Classes" };
export const dynamic = "force-dynamic";

interface SP { q?: string; year?: string; level?: string; status?: string; sort?: string; edit?: string; roster?: string; ok?: string; e?: string }

/** Academic Management → Classes: full class lifecycle for one school. */
export default async function ClassesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  const canEdit = can(ctx, org.id, CREATOR_ROLES);
  const isManager = can(ctx, org.id, MANAGER_ROLES);
  const supabase = await createClient();

  const [{ data: years }, { data: levels }, { data: departments }, { data: members }] = await Promise.all([
    supabase.from("academic_years").select("id, name, is_current").eq("organization_id", org.id).order("created_at", { ascending: false }),
    supabase.from("education_levels").select("id, name").eq("organization_id", org.id).order("sort").order("name"),
    supabase.from("departments").select("id, name").eq("organization_id", org.id).order("sort").order("name"),
    supabase.from("organization_members").select("user_id, role, profiles(full_name, email)").eq("organization_id", org.id).eq("status", "active"),
  ]);
  const teachers = (members ?? [])
    .filter((m) => ["owner", "admin", "teacher", "organizer"].includes(m.role))
    .map((m) => {
      const p = m.profiles as unknown as { full_name: string | null; email: string } | null;
      return { id: m.user_id, name: p?.full_name || p?.email || "Member" };
    });
  const yearName = new Map((years ?? []).map((y) => [y.id, y.name]));
  const levelName = new Map((levels ?? []).map((l) => [l.id, l.name]));
  const deptName = new Map((departments ?? []).map((d) => [d.id, d.name]));
  const teacherName = new Map(teachers.map((t) => [t.id, t.name]));

  const status = sp.status === "archived" ? "archived" : sp.status === "all" ? "all" : "active";
  let query = supabase.from("classes").select("*").eq("organization_id", org.id);
  if (status !== "all") query = query.eq("status", status);
  if (sp.year) query = query.eq("academic_year_id", sp.year);
  if (sp.level) query = query.eq("level_id", sp.level);
  if (sp.q) query = query.or(`name.ilike.%${sp.q}%,code.ilike.%${sp.q}%`);
  query = sp.sort === "capacity" ? query.order("capacity", { ascending: false })
    : sp.sort === "recent" ? query.order("created_at", { ascending: false })
    : query.order("name");
  const { data: classes } = await query.limit(500);
  const classIds = (classes ?? []).map((c) => c.id);

  const { data: enrollments } = classIds.length
    ? await supabase.from("student_enrollments").select("id, class_id, student_id, status").eq("organization_id", org.id).in("class_id", classIds).eq("status", "active")
    : { data: [] };
  const enrolledCount = new Map<string, number>();
  for (const e of enrollments ?? []) enrolledCount.set(e.class_id, (enrolledCount.get(e.class_id) ?? 0) + 1);

  const editClass = sp.edit ? (classes ?? []).find((c) => c.id === sp.edit) : null;
  const rosterClass = sp.roster ? (classes ?? []).find((c) => c.id === sp.roster) : null;
  let roster: { enrollment_id: string; student: { id: string; full_name: string; email: string | null; student_ref: string | null; status: string } }[] = [];
  if (rosterClass) {
    const { data } = await supabase.from("student_enrollments")
      .select("id, students(id, full_name, email, student_ref, status)")
      .eq("organization_id", org.id).eq("class_id", rosterClass.id).eq("status", "active").order("created_at");
    roster = (data ?? []).map((e) => ({
      enrollment_id: e.id,
      student: e.students as unknown as { id: string; full_name: string; email: string | null; student_ref: string | null; status: string },
    })).filter((r) => r.student);
  }

  const backUrl = "/dashboard/academics/classes";

  return (
    <>
      <PageTitle
        title="Classes"
        subtitle="Create and manage your school's classes by academic year and education level, view rosters and move students between classes."
        action={<ButtonLink href="/dashboard/academics" variant="outline">Academic structure</ButtonLink>}
      />
      {sp.ok && <p className="mb-4 rounded-lg bg-evergreen-50 px-4 py-3 text-sm text-evergreen-900">Done — classes updated.</p>}
      {sp.e && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{decodeURIComponent(sp.e)}</p>}

      {(years ?? []).length === 0 && (
        <p className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
          No academic year exists yet. <a className="font-semibold underline" href="/dashboard/academics">Create your academic year and levels first</a> — classes and student registration are organized by year.
        </p>
      )}

      {canEdit && (
        <Card className="mb-6 p-6">
          <h2 className="font-display text-lg font-semibold text-evergreen-950">{editClass ? `Edit class — ${editClass.name}` : "Create a class"}</h2>
          <form action={saveClassForm} className="mt-4 grid gap-4 sm:grid-cols-3">
            <input type="hidden" name="back" value={backUrl} />
            <input type="hidden" name="id" value={editClass?.id ?? ""} />
            <Field label="Class name *"><Input name="name" required defaultValue={editClass?.name ?? ""} placeholder="e.g. JSS 1A, Form 2 East, 6ème B" /></Field>
            <Field label="Class code"><Input name="code" defaultValue={editClass?.code ?? ""} placeholder="Optional, unique per year" /></Field>
            <Field label="Academic year">
              <Select name="academic_year_id" defaultValue={editClass?.academic_year_id ?? (years ?? []).find((y) => y.is_current)?.id ?? ""}>
                <option value="">No year</option>
                {(years ?? []).map((y) => <option key={y.id} value={y.id}>{y.name}{y.is_current ? " (current)" : ""}</option>)}
              </Select>
            </Field>
            <Field label="Education level">
              <Select name="level_id" defaultValue={editClass?.level_id ?? ""}>
                <option value="">None</option>{(levels ?? []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </Select>
            </Field>
            <Field label="Department / stream">
              <Select name="department_id" defaultValue={editClass?.department_id ?? ""}>
                <option value="">None</option>{(departments ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </Select>
            </Field>
            <Field label="Class teacher">
              <Select name="teacher_id" defaultValue={editClass?.teacher_id ?? ""}>
                <option value="">Unassigned</option>{teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            </Field>
            <Field label="Capacity"><Input type="number" name="capacity" min={1} max={1000} defaultValue={editClass?.capacity ?? 40} /></Field>
            <Field label="Status">
              <Select name="status" defaultValue={editClass?.status ?? "active"}>
                <option value="active">Active</option><option value="archived">Archived</option>
              </Select>
            </Field>
            <Field label="Description" className="sm:col-span-3"><Textarea name="description" rows={2} defaultValue={editClass?.description ?? ""} placeholder="Optional notes about this class" /></Field>
            <div className="flex gap-3 sm:col-span-3">
              <Button type="submit" variant="gold">{editClass ? "Save changes" : "Create class"}</Button>
              {editClass && <ButtonLink href={backUrl} variant="ghost">Cancel editing</ButtonLink>}
            </div>
          </form>
        </Card>
      )}

      <Card className="p-6">
        <form method="get" className="grid gap-3 sm:grid-cols-5">
          <Field label="Search"><Input name="q" defaultValue={sp.q ?? ""} placeholder="Name or code" /></Field>
          <Field label="Academic year"><Select name="year" defaultValue={sp.year ?? ""}><option value="">All years</option>{(years ?? []).map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}</Select></Field>
          <Field label="Level"><Select name="level" defaultValue={sp.level ?? ""}><option value="">All levels</option>{(levels ?? []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</Select></Field>
          <Field label="Status"><Select name="status" defaultValue={status}><option value="active">Active</option><option value="archived">Archived</option><option value="all">All</option></Select></Field>
          <Field label="Sort"><Select name="sort" defaultValue={sp.sort ?? "name"}><option value="name">Name A–Z</option><option value="capacity">Capacity</option><option value="recent">Recently created</option></Select></Field>
          <div className="sm:col-span-5"><Button type="submit" variant="outline">Apply filters</Button></div>
        </form>

        {(classes ?? []).length === 0 ? (
          <EmptyState title="No classes found" body={canEdit ? "Create your first class above — students can then be registered and enrolled into it." : "No classes match these filters."} />
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead><tr className="border-b border-evergreen-900/15 text-left text-xs uppercase text-ink-soft">
                {["Class", "Year", "Level", "Dept.", "Teacher", "Students / capacity", "Status", "Actions"].map((h) => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}
              </tr></thead>
              <tbody>
                {(classes ?? []).map((c) => {
                  const n = enrolledCount.get(c.id) ?? 0;
                  return (
                    <tr key={c.id} className="border-b border-evergreen-900/10 align-top">
                      <td className="px-3 py-2"><strong className="text-evergreen-950">{c.name}</strong>{c.code ? <span className="text-ink-soft"> · {c.code}</span> : null}</td>
                      <td className="px-3 py-2">{c.academic_year_id ? yearName.get(c.academic_year_id) ?? "—" : "—"}</td>
                      <td className="px-3 py-2">{c.level_id ? levelName.get(c.level_id) ?? "—" : "—"}</td>
                      <td className="px-3 py-2">{c.department_id ? deptName.get(c.department_id) ?? "—" : "—"}</td>
                      <td className="px-3 py-2">{c.teacher_id ? teacherName.get(c.teacher_id) ?? "—" : "—"}</td>
                      <td className="px-3 py-2">{n} / {c.capacity}{n > c.capacity ? <span className="ml-1 text-amber-700">(over capacity)</span> : null}</td>
                      <td className="px-3 py-2"><Badge tone={c.status === "active" ? "green" : "gray"}>{c.status}</Badge></td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-x-3 gap-y-1">
                          <a className="text-evergreen-800 underline underline-offset-2" href={`${backUrl}?roster=${c.id}`}>Roster</a>
                          {canEdit && <a className="text-evergreen-800 underline underline-offset-2" href={`${backUrl}?edit=${c.id}`}>Edit</a>}
                          {canEdit && (
                            <form action={classLifecycle} className="inline">
                              <input type="hidden" name="back" value={backUrl} /><input type="hidden" name="id" value={c.id} />
                              <input type="hidden" name="op" value={c.status === "active" ? "archive" : "restore"} />
                              <button className="text-evergreen-800 underline underline-offset-2" type="submit">{c.status === "active" ? "Archive" : "Restore"}</button>
                            </form>
                          )}
                          {isManager && (
                            <details>
                              <summary className="cursor-pointer text-red-700 underline underline-offset-2">Delete</summary>
                              <form action={classLifecycle} className="mt-2 space-y-2 rounded-lg bg-red-50 p-3">
                                <input type="hidden" name="back" value={backUrl} /><input type="hidden" name="id" value={c.id} /><input type="hidden" name="op" value="delete" />
                                <label className="flex items-start gap-2 text-xs text-red-900"><input type="checkbox" name="confirm" className="mt-0.5" /> Permanently delete this class (blocked if it has enrollment history — archive instead).</label>
                                <Button type="submit" variant="danger">Delete class</Button>
                              </form>
                            </details>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {rosterClass && (
        <Card className="mt-6 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-lg font-semibold text-evergreen-950">Roster — {rosterClass.name} ({roster.length} student(s))</h2>
            <ButtonLink href="/dashboard/students" variant="outline">Register students</ButtonLink>
          </div>
          {roster.length === 0 ? (
            <EmptyState title="No students enrolled" body="Register students and enroll them into this class, or import a class register from the Students page." />
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead><tr className="border-b border-evergreen-900/15 text-left text-xs uppercase text-ink-soft">{["Student", "Reference", "Email", "Transfer to", ""].map((h) => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr></thead>
                <tbody>
                  {roster.map(({ enrollment_id, student }) => (
                    <tr key={enrollment_id} className="border-b border-evergreen-900/10">
                      <td className="px-3 py-2"><strong>{student.full_name}</strong></td>
                      <td className="px-3 py-2">{student.student_ref ?? "—"}</td>
                      <td className="px-3 py-2">{student.email ?? "—"}</td>
                      <td className="px-3 py-2">
                        {canEdit ? (
                          <form action={transferStudent} className="flex gap-2">
                            <input type="hidden" name="back" value={`${backUrl}?roster=${rosterClass.id}`} />
                            <input type="hidden" name="student_id" value={student.id} />
                            <Select name="class_id" aria-label="Destination class">
                              {(classes ?? []).filter((c) => c.id !== rosterClass.id && c.status === "active").map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </Select>
                            <Button type="submit" variant="outline">Transfer</Button>
                          </form>
                        ) : "—"}
                      </td>
                      <td className="px-3 py-2">
                        {canEdit && (
                          <form action={withdrawEnrollment}>
                            <input type="hidden" name="back" value={`${backUrl}?roster=${rosterClass.id}`} />
                            <input type="hidden" name="enrollment_id" value={enrollment_id} />
                            <button className="text-red-700 underline underline-offset-2" type="submit">Remove from class</button>
                          </form>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </>
  );
}
