import { Button, Card, EmptyState, Field, Input, Select } from "@/components/ui";
import { createAdminClient } from "@/lib/supabase/server";
import { fmtDate } from "@/lib/utils";
import {
  deleteAcademicYear,
  deleteClass,
  deleteStructureItem,
  saveAcademicYear,
  saveClass,
  saveStructureItem,
} from "../../../actions/academics";
import { Notice, Section, Table } from "../../../ui";

export async function AcademicsTab({ orgId, sp }: { orgId: string; sp: { ok?: string; e?: string; edit_class?: string; edit_year?: string } }) {
  const admin = createAdminClient();
  const [{ data: years }, { data: levels }, { data: departments }, { data: subjects }, { data: classes }, { data: teachers }] = await Promise.all([
    admin.from("academic_years").select("*").eq("organization_id", orgId).order("starts_on", { ascending: false }),
    admin.from("education_levels").select("*").eq("organization_id", orgId).order("sort"),
    admin.from("departments").select("*").eq("organization_id", orgId).order("name"),
    admin.from("subjects").select("*, departments(name)").eq("organization_id", orgId).order("name"),
    admin.from("classes").select("*, education_levels(name), academic_years(name), student_enrollments(id, status)").eq("organization_id", orgId).order("name"),
    admin.from("organization_members").select("user_id, role, profiles(full_name, email)").eq("organization_id", orgId).in("role", ["owner", "admin", "teacher", "supervisor"]).eq("status", "active"),
  ]);

  const editingClass = sp.edit_class ? (classes ?? []).find((c) => c.id === sp.edit_class) : undefined;
  const editingYear = sp.edit_year ? (years ?? []).find((y) => y.id === sp.edit_year) : undefined;
  const base = `/admin/organizations/${orgId}?tab=academics`;

  const structureBlock = (
    title: string,
    kind: "level" | "department" | "subject",
    rows: { id: string; name: string; extra?: string }[],
    extraField?: React.ReactNode,
  ) => (
    <Card className="p-5">
      <h3 className="font-display text-base font-semibold text-evergreen-950">{title}</h3>
      <ul className="mt-3 space-y-2">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-2 border-b border-evergreen-900/10 pb-2 text-sm last:border-0">
            <span>{r.name}{r.extra ? <span className="text-ink-soft"> · {r.extra}</span> : null}</span>
            <form action={deleteStructureItem}>
              <input type="hidden" name="organization_id" value={orgId} />
              <input type="hidden" name="kind" value={kind} />
              <input type="hidden" name="id" value={r.id} />
              <button className="font-medium text-red-700 underline-offset-2 hover:underline">Delete</button>
            </form>
          </li>
        ))}
        {rows.length === 0 && <li className="text-sm text-ink-soft">None yet.</li>}
      </ul>
      <form action={saveStructureItem} className="mt-3 flex flex-wrap items-end gap-2 border-t border-evergreen-900/10 pt-3">
        <input type="hidden" name="organization_id" value={orgId} />
        <input type="hidden" name="kind" value={kind} />
        <Field label={`New ${title.toLowerCase().replace(/s$/, "")}`} className="min-w-[180px] flex-1">
          <Input name="name" required />
        </Field>
        {extraField}
        <Button type="submit" variant="outline">Add</Button>
      </form>
    </Card>
  );

  return (
    <>
      <Notice
        ok={sp.ok}
        e={sp.e}
        messages={{
          year_saved: "Academic year saved.", year_deleted: "Academic year deleted.",
          saved: "Saved.", deleted: "Deleted.", class_saved: "Class saved.", class_deleted: "Class deleted.",
          name: "A name is required.", kind: "Unknown item type.",
        }}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="font-display text-base font-semibold text-evergreen-950">{editingYear ? "Edit academic year" : "Academic years"}</h3>
          <ul className="mt-3 space-y-2">
            {(years ?? []).map((y) => (
              <li key={y.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-evergreen-900/10 pb-2 text-sm last:border-0">
                <span>
                  <strong className="font-medium text-ink">{y.name}</strong>
                  {y.is_current && <span className="ml-2 rounded-full bg-gold-100 px-2 py-0.5 text-xs font-semibold text-gold-800">current</span>}
                  <span className="block text-xs text-ink-soft">
                    {y.starts_on ? fmtDate(y.starts_on) : "—"} → {y.ends_on ? fmtDate(y.ends_on) : "—"}
                  </span>
                </span>
                <span className="flex gap-3">
                  <a href={`${base}&edit_year=${y.id}`} className="font-medium text-evergreen-700 underline-offset-2 hover:underline">Edit</a>
                  <form action={deleteAcademicYear}>
                    <input type="hidden" name="organization_id" value={orgId} />
                    <input type="hidden" name="id" value={y.id} />
                    <button className="font-medium text-red-700 underline-offset-2 hover:underline">Delete</button>
                  </form>
                </span>
              </li>
            ))}
            {(years ?? []).length === 0 && <li className="text-sm text-ink-soft">No academic years yet — create one below.</li>}
          </ul>
          <form action={saveAcademicYear} className="mt-3 grid gap-2 border-t border-evergreen-900/10 pt-3 sm:grid-cols-2">
            <input type="hidden" name="organization_id" value={orgId} />
            {editingYear && <input type="hidden" name="id" value={editingYear.id} />}
            <Field label="Year name"><Input name="name" required placeholder="2026/2027" defaultValue={editingYear?.name ?? ""} /></Field>
            <label className="flex items-end gap-2 pb-2.5 text-sm text-ink">
              <input type="checkbox" name="is_current" defaultChecked={editingYear?.is_current} className="h-4 w-4 accent-evergreen-700" /> Current year
            </label>
            <Field label="Starts"><Input name="starts_on" type="date" defaultValue={editingYear?.starts_on ?? ""} /></Field>
            <Field label="Ends"><Input name="ends_on" type="date" defaultValue={editingYear?.ends_on ?? ""} /></Field>
            <div className="sm:col-span-2">
              <Button type="submit" variant="outline">{editingYear ? "Save year" : "Add year"}</Button>
              {editingYear && <a href={base} className="ml-3 text-sm font-medium text-evergreen-700 underline-offset-2 hover:underline">Cancel edit</a>}
            </div>
          </form>
        </Card>

        {structureBlock("Education levels", "level", (levels ?? []).map((l) => ({ id: l.id, name: l.name, extra: `order ${l.sort}` })),
          <Field label="Order"><Input name="sort" type="number" defaultValue={0} className="w-20" /></Field>)}
        {structureBlock("Departments", "department", (departments ?? []).map((d) => ({ id: d.id, name: d.name })))}
        {structureBlock("Subjects", "subject", (subjects ?? []).map((s) => ({
          id: s.id, name: s.name,
          extra: [s.code, (s.departments as unknown as { name: string } | null)?.name].filter(Boolean).join(" · ") || undefined,
        })),
          <>
            <Field label="Code"><Input name="code" className="w-24" /></Field>
            <Field label="Department">
              <Select name="department_id" defaultValue="">
                <option value="">—</option>
                {(departments ?? []).map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </Select>
            </Field>
          </>)}
      </div>

      <Section title="Classes" hint="Classes group students for enrollment, competition registration and examination candidacies.">
        <Card className="mb-5 p-5">
          <h3 className="font-display text-base font-semibold text-evergreen-950">{editingClass ? `Edit class: ${editingClass.name}` : "Create a class"}</h3>
          <form action={saveClass} className="mt-3 grid gap-3 sm:grid-cols-3">
            <input type="hidden" name="organization_id" value={orgId} />
            {editingClass && <input type="hidden" name="id" value={editingClass.id} />}
            <Field label="Class name *"><Input name="name" required placeholder="e.g. 6ème A / Grade 7 Blue" defaultValue={editingClass?.name ?? ""} /></Field>
            <Field label="Academic year">
              <Select name="academic_year_id" defaultValue={editingClass?.academic_year_id ?? ""}>
                <option value="">—</option>
                {(years ?? []).map((y) => (
                  <option key={y.id} value={y.id}>{y.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Education level">
              <Select name="level_id" defaultValue={editingClass?.level_id ?? ""}>
                <option value="">—</option>
                {(levels ?? []).map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Class teacher">
              <Select name="teacher_id" defaultValue={editingClass?.teacher_id ?? ""}>
                <option value="">— Unassigned —</option>
                {(teachers ?? []).map((t) => {
                  const p = t.profiles as unknown as { full_name: string | null; email: string } | null;
                  return <option key={t.user_id} value={t.user_id}>{p?.full_name || p?.email} ({t.role})</option>;
                })}
              </Select>
            </Field>
            <Field label="Capacity"><Input name="capacity" type="number" min={1} defaultValue={editingClass?.capacity ?? ""} /></Field>
            <Field label="Room"><Input name="room" defaultValue={editingClass?.room ?? ""} /></Field>
            <div className="sm:col-span-3">
              <Button type="submit">{editingClass ? "Save class" : "Create class"}</Button>
              {editingClass && <a href={base} className="ml-3 text-sm font-medium text-evergreen-700 underline-offset-2 hover:underline">Cancel edit</a>}
            </div>
          </form>
        </Card>

        {(classes ?? []).length === 0 ? (
          <EmptyState title="No classes yet" body="Create classes to enroll students, register whole classes into competitions and generate examination candidates in one click." />
        ) : (
          <Table head={["Class", "Level", "Year", "Enrolled", "Capacity", "Actions"]}>
            {(classes ?? []).map((c) => {
              const enrolled = ((c.student_enrollments as { status: string }[]) ?? []).filter((e) => e.status === "active").length;
              return (
                <tr key={c.id}>
                  <td className="font-medium text-ink">{c.name}{c.room ? <span className="block text-xs font-normal text-ink-soft">Room {c.room}</span> : null}</td>
                  <td>{(c.education_levels as unknown as { name: string } | null)?.name ?? "—"}</td>
                  <td>{(c.academic_years as unknown as { name: string } | null)?.name ?? "—"}</td>
                  <td>{enrolled} student(s)</td>
                  <td>{c.capacity ?? "—"}</td>
                  <td>
                    <div className="flex gap-3">
                      <a href={`${base}&edit_class=${c.id}`} className="font-medium text-evergreen-700 underline-offset-2 hover:underline">Edit</a>
                      <a href={`/admin/organizations/${orgId}?tab=students&sclass=${c.id}`} className="font-medium text-evergreen-700 underline-offset-2 hover:underline">Students</a>
                      <form action={deleteClass}>
                        <input type="hidden" name="organization_id" value={orgId} />
                        <input type="hidden" name="id" value={c.id} />
                        <button className="font-medium text-red-700 underline-offset-2 hover:underline">Delete</button>
                      </form>
                    </div>
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Section>
    </>
  );
}
