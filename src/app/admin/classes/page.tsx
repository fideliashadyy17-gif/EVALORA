import { Badge, Button, ButtonLink, Card, EmptyState, Field, Input, PageTitle, Select } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { archiveClass, deleteClass } from "../actions/academics";
import { Notice } from "../ui";
import { saveGlobalClass } from "./actions";

export const metadata: Metadata = { title: "Class Management" };
export const dynamic = "force-dynamic";

interface SP { org?: string; q?: string; status?: string; edit?: string; ok?: string; e?: string }

/** Super Admin → Academic Management: every school's classes, with
 *  per-school creation in the correct organization/year/level. */
export default async function AdminClassesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  await requireSuperAdmin();
  const admin = createAdminClient();

  const { data: orgs } = await admin.from("organizations").select("id, name, slug").order("name");
  const orgId = sp.org && (orgs ?? []).some((o) => o.id === sp.org) ? sp.org : "";
  const orgName = new Map((orgs ?? []).map((o) => [o.id, o.name]));

  let query = admin.from("classes").select("*").order("name").limit(500);
  if (orgId) query = query.eq("organization_id", orgId);
  const status = sp.status === "archived" ? "archived" : sp.status === "all" ? "all" : "active";
  if (status !== "all") query = query.eq("status", status);
  if (sp.q) query = query.or(`name.ilike.%${sp.q}%,code.ilike.%${sp.q}%`);
  const { data: classes } = await query;
  const classIds = (classes ?? []).map((c) => c.id);
  // Exact HEAD counts avoid the PostgREST row cap; unknown counts remain visibly unknown.
  const classCounts = await Promise.all(classIds.map(async (id) => {
    const [students, questions] = await Promise.all([
      admin.from("student_enrollments").select("id", { count: "exact", head: true }).eq("class_id", id).eq("status", "active"),
      admin.from("questions").select("id", { count: "exact", head: true }).eq("class_id", id),
    ]);
    return { id, students: students.count, questions: questions.count };
  }));
  const counts = new Map(classCounts.map((c) => [c.id, c.students]));
  const qCounts = new Map(classCounts.map((c) => [c.id, c.questions]));

  const scoped = async (table: string) => orgId
    ? (await admin.from(table).select("id, name").eq("organization_id", orgId).order("name")).data ?? []
    : [];
  const [years, levels, departments] = await Promise.all([scoped("academic_years"), scoped("education_levels"), scoped("departments")]);
  const yearName = new Map<string, string>();
  if (!orgId && classIds.length) {
    const { data: allYears } = await admin.from("academic_years").select("id, name");
    for (const y of allYears ?? []) yearName.set(y.id, y.name);
  } else {
    for (const y of years) yearName.set(y.id, y.name);
  }
  const { data: members } = orgId
    ? await admin.from("organization_members").select("user_id, role, profiles(full_name, email)").eq("organization_id", orgId).eq("status", "active")
    : { data: [] };
  const teachers = (members ?? []).filter((m) => ["owner", "admin", "teacher", "organizer"].includes(m.role)).map((m) => {
    const p = m.profiles as unknown as { full_name: string | null; email: string } | null;
    return { id: m.user_id, name: p?.full_name || p?.email || "Member" };
  });
  const editClass = sp.edit ? (classes ?? []).find((c) => c.id === sp.edit) : null;
  const backUrl = `/admin/classes${orgId ? `?org=${orgId}` : ""}`;

  // Question-bank footprint per class + association data for the editor.
  const [subjectsResult, programmesResult, editSubjectsResult, editCurrResult] = await Promise.all([
    orgId ? admin.from("subjects").select("id, name", { count: "exact" }).eq("organization_id", orgId).order("name") : Promise.resolve({ data: [], error: null, count: 0 }),
    orgId ? admin.from("curriculum_programmes").select("id, name", { count: "exact" }).eq("organization_id", orgId).order("name") : Promise.resolve({ data: [], error: null, count: 0 }),
    editClass ? admin.from("class_subjects").select("subject_id", { count: "exact" }).eq("class_id", editClass.id) : Promise.resolve({ data: [], error: null, count: 0 }),
    editClass ? admin.from("class_curricula").select("programme_id, course_label, needs_review", { count: "exact" }).eq("class_id", editClass.id) : Promise.resolve({ data: [], error: null, count: 0 }),
  ]);
  const orgSubjects = subjectsResult.data ?? [];
  const orgProgrammes = programmesResult.data ?? [];
  const editSubjects = editSubjectsResult.data ?? [];
  const editCurr = editCurrResult.data ?? [];
  const associationLoadFailed = Boolean(
    [subjectsResult, programmesResult, editSubjectsResult, editCurrResult].some((result) =>
      result.error || result.count === null || result.count !== (result.data ?? []).length) ||
    editSubjects.some((link) => !orgSubjects.some((item) => item.id === link.subject_id)) ||
    editCurr.some((link) => !orgProgrammes.some((item) => item.id === link.programme_id)),
  );
  const editSubjectIds = new Set((editSubjects ?? []).map((s) => s.subject_id));
  const editCurrByProgramme = new Map((editCurr ?? []).map((c) => [c.programme_id, c]));
  const bandLabel = (b: string | null) =>
    b === "early_years_primary" ? "Early Years & Primary" : b === "myp_secondary" ? "Secondary — MYP" : b === "advanced_secondary" ? "Advanced Secondary" : b ? "Other" : "—";

  return (
    <>
      <PageTitle title="Class Management" subtitle="Every class on the platform, grouped by school and academic year. Classes drive student enrollment, the class-based Question Bank, quizzes, examinations and live competitions." />
      <Notice ok={sp.ok} e={sp.e} messages={{
        saved: "Class saved.", class_saved: "Class saved.", class_deleted: "Class deleted.", class_archived: "Class has enrollment history and was archived instead of deleted.", class_updated: "Class updated.",
        name: "Class name is required.", organization: "Choose a school first.", reference: "That year/level/department does not belong to the selected school.",
        duplicate: "A class with that name already exists for that academic year.", code: "That class code is already used in this year.", failed: "The class could not be saved.", associations_failed: "Class details were saved, but subjects and curriculum links were not changed. Reload and retry.",
      }} />

      <Card className="mb-6 p-5">
        <form method="get" className="grid gap-3 sm:grid-cols-4">
          <Field label="School"><Select name="org" defaultValue={orgId}><option value="">All organizations</option>{(orgs ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select></Field>
          <Field label="Search"><Input name="q" defaultValue={sp.q ?? ""} placeholder="Class name or code" /></Field>
          <Field label="Status"><Select name="status" defaultValue={status}><option value="active">Active</option><option value="archived">Archived</option><option value="all">All</option></Select></Field>
          <div className="flex items-end"><Button type="submit" variant="outline">Apply</Button></div>
        </form>
      </Card>

      {orgId && (
        <Card className="mb-6 p-6">
          <h2 className="font-display text-lg font-semibold text-evergreen-950">{editClass ? `Edit class — ${editClass.name}` : `Create class in ${orgName.get(orgId)}`}</h2>
          <form action={saveGlobalClass} className="mt-4 grid gap-4 sm:grid-cols-3">
            <input type="hidden" name="organization_id" value={orgId} />
            <input type="hidden" name="id" value={editClass?.id ?? ""} />
            <Field label="Class name *"><Input name="name" required defaultValue={editClass?.name ?? ""} /></Field>
            <Field label="Code"><Input name="code" defaultValue={editClass?.code ?? ""} /></Field>
            <Field label="Room"><Input name="room" defaultValue={editClass?.room ?? ""} /></Field>
            <Field label="Academic year"><Select name="academic_year_id" defaultValue={editClass?.academic_year_id ?? ""}><option value="">None</option>{years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}</Select></Field>
            <Field label="Education level"><Select name="level_id" defaultValue={editClass?.level_id ?? ""}><option value="">None</option>{levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</Select></Field>
            <Field label="Department / stream"><Select name="department_id" defaultValue={editClass?.department_id ?? ""}><option value="">None</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
            <Field label="Class teacher"><Select name="teacher_id" defaultValue={editClass?.teacher_id ?? ""}><option value="">Unassigned</option>{teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
            <Field label="Capacity"><Input type="number" name="capacity" min={1} max={1000} defaultValue={editClass?.capacity ?? 40} /></Field>
            <Field label="Status"><Select name="status" defaultValue={editClass?.status ?? "active"}><option value="active">Active</option><option value="archived">Archived</option></Select></Field>
            <Field label="Level band"><Select name="level_band" defaultValue={editClass?.level_band ?? ""}><option value="">Not set</option><option value="early_years_primary">Early Years &amp; Primary (KG–CM1)</option><option value="myp_secondary">Secondary — MYP (Grade 6/CM2–Grade 10)</option><option value="advanced_secondary">Advanced Secondary — AP (Grade 11–13)</option><option value="other">Other</option></Select></Field>
            <Field label="Grade order (0 = KG … 13)"><Input type="number" name="grade_order" min={0} max={30} defaultValue={editClass?.grade_order ?? ""} /></Field>
            <Field label="Description" className="sm:col-span-3"><Input name="description" defaultValue={editClass?.description ?? ""} /></Field>
            {associationLoadFailed && <p role="alert" className="sm:col-span-3 text-sm text-red-700">Subjects and curriculum links could not be loaded. They will not be changed; reload to edit them.</p>}
            {!associationLoadFailed && (orgSubjects.length > 0 || orgProgrammes.length > 0) && (
              <div className="grid gap-4 rounded-xl border border-evergreen-900/15 bg-cream p-4 sm:col-span-3 sm:grid-cols-2">
                <input type="hidden" name="associations_present" value="1" />
                <div>
                  <p className="text-sm font-semibold text-evergreen-950">Subjects taught in this class</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {orgSubjects.map((s) => (
                      <label key={s.id} className="inline-flex items-center gap-1.5 rounded-full border border-evergreen-900/20 bg-white px-3 py-1.5 text-sm">
                        <input type="checkbox" name="subject_ids" value={s.id} defaultChecked={editSubjectIds.has(s.id)} className="h-4 w-4 accent-emerald-700" /> {s.name}
                      </label>
                    ))}
                    {orgSubjects.length === 0 && <span className="text-sm text-ink-soft">No subjects yet for this school.</span>}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-semibold text-evergreen-950">Curriculum programmes</p>
                  <div className="mt-2 space-y-2">
                    {orgProgrammes.map((p) => {
                      const link = editCurrByProgramme.get(p.id);
                      return (
                        <div key={p.id} className="rounded-lg border border-evergreen-900/15 bg-white p-3">
                          <label className="inline-flex items-center gap-1.5 text-sm font-medium">
                            <input type="checkbox" name="programme_ids" value={p.id} defaultChecked={Boolean(link)} className="h-4 w-4 accent-emerald-700" /> {p.name}
                          </label>
                          <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
                            <Input name={`course_${p.id}`} defaultValue={link?.course_label ?? ""} placeholder="Course label e.g. MYP 3 Mathematics / AP Calculus AB" />
                            <label className="inline-flex items-center gap-1.5 text-xs text-ink-soft">
                              <input type="checkbox" name={`review_${p.id}`} value="1" defaultChecked={Boolean(link?.needs_review)} className="h-4 w-4 accent-amber-600" /> mapping needs review
                            </label>
                          </div>
                        </div>
                      );
                    })}
                    {orgProgrammes.length === 0 && <span className="text-sm text-ink-soft">No curriculum programmes configured for this school.</span>}
                  </div>
                </div>
              </div>
            )}
            <div className="flex gap-3 sm:col-span-3"><Button type="submit" variant="gold">{editClass ? "Save class" : "Create class"}</Button>{editClass && <ButtonLink href={backUrl} variant="ghost">Cancel</ButtonLink>}</div>
          </form>
        </Card>
      )}

      <Card className="p-6">
        {(classes ?? []).length === 0 ? (
          <EmptyState title="No classes found" body={orgId ? "Create this school's first class above. Registration and imports will enroll into it." : "Select a school to create its first class, or adjust the filters."} />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead><tr className="border-b border-evergreen-900/15 text-left text-xs uppercase text-ink-soft">{["Class", "School", "Year", "Band", "Students", "Questions", "Status", "Actions"].map((h) => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr></thead>
              <tbody>
                {(classes ?? []).map((c) => (
                  <tr key={c.id} className="border-b border-evergreen-900/10">
                    <td className="px-3 py-2"><strong>{c.name}</strong>{c.code ? <span className="text-ink-soft"> · {c.code}</span> : null}</td>
                    <td className="px-3 py-2">{orgName.get(c.organization_id) ?? "—"}</td>
                    <td className="px-3 py-2">{c.academic_year_id ? yearName.get(c.academic_year_id) ?? "—" : "—"}</td>
                    <td className="px-3 py-2">{bandLabel(c.level_band)}</td>
                    <td className="px-3 py-2">{counts.get(c.id) ?? "—"} / {c.capacity}</td>
                    <td className="px-3 py-2">{qCounts.get(c.id) ?? "—"}</td>
                    <td className="px-3 py-2"><Badge tone={c.status === "active" ? "green" : "gray"}>{c.status}</Badge></td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-x-3">
                        <a className="text-evergreen-800 underline" href={`/admin/classes?org=${c.organization_id}&edit=${c.id}`}>Edit</a>
                        <a className="text-evergreen-800 underline" href={`/admin/questions?org=${c.organization_id}&class=${c.id}`}>Questions</a>
                        <a className="text-evergreen-800 underline" href={`/admin/questions/generate?org=${c.organization_id}&class=${c.id}`}>Generate</a>
                        <a className="text-evergreen-800 underline" href={`/admin/students?org=${c.organization_id}&sclass=${c.id}`}>Students</a>
                        <a className="text-evergreen-800 underline" href={`/admin/organizations/${c.organization_id}?tab=academics`}>School hub</a>
                        <form action={archiveClass} className="inline"><input type="hidden" name="organization_id" value={c.organization_id} /><input type="hidden" name="id" value={c.id} /><input type="hidden" name="op" value={c.status === "active" ? "archive" : "restore"} /><input type="hidden" name="back" value={backUrl} /><button className="text-evergreen-800 underline" type="submit">{c.status === "active" ? "Archive" : "Restore"}</button></form>
                        <form action={deleteClass} className="inline"><input type="hidden" name="organization_id" value={c.organization_id} /><input type="hidden" name="id" value={c.id} /><input type="hidden" name="back" value={backUrl} /><button className="text-red-700 underline" type="submit">Delete</button></form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
