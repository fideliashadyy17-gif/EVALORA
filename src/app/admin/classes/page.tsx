import { Badge, Button, ButtonLink, Card, EmptyState, Field, Input, PageTitle, Select } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { archiveClass, deleteClass } from "../actions/academics";
import { Notice } from "../ui";
import { saveGlobalClass } from "./actions";

export const metadata: Metadata = { title: "Classes" };
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
  const { data: enrollments } = classIds.length
    ? await admin.from("student_enrollments").select("class_id").in("class_id", classIds).eq("status", "active")
    : { data: [] };
  const counts = new Map<string, number>();
  for (const e of enrollments ?? []) counts.set(e.class_id, (counts.get(e.class_id) ?? 0) + 1);

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

  return (
    <>
      <PageTitle title="Academic Management — Classes" subtitle="Every class on the platform. Select a school to create or edit classes in its correct academic year, level and department." />
      <Notice ok={sp.ok} e={sp.e} messages={{
        saved: "Class saved.", class_saved: "Class saved.", class_deleted: "Class deleted.", class_archived: "Class has enrollment history and was archived instead of deleted.", class_updated: "Class updated.",
        name: "Class name is required.", organization: "Choose a school first.", reference: "That year/level/department does not belong to the selected school.",
        duplicate: "A class with that name already exists for that academic year.", code: "That class code is already used in this year.", failed: "The class could not be saved.",
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
            <Field label="Description" className="sm:col-span-3"><Input name="description" defaultValue={editClass?.description ?? ""} /></Field>
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
              <thead><tr className="border-b border-evergreen-900/15 text-left text-xs uppercase text-ink-soft">{["Class", "School", "Year", "Students", "Status", "Actions"].map((h) => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr></thead>
              <tbody>
                {(classes ?? []).map((c) => (
                  <tr key={c.id} className="border-b border-evergreen-900/10">
                    <td className="px-3 py-2"><strong>{c.name}</strong>{c.code ? <span className="text-ink-soft"> · {c.code}</span> : null}</td>
                    <td className="px-3 py-2">{orgName.get(c.organization_id) ?? "—"}</td>
                    <td className="px-3 py-2">{c.academic_year_id ? yearName.get(c.academic_year_id) ?? "—" : "—"}</td>
                    <td className="px-3 py-2">{counts.get(c.id) ?? 0} / {c.capacity}</td>
                    <td className="px-3 py-2"><Badge tone={c.status === "active" ? "green" : "gray"}>{c.status}</Badge></td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-x-3">
                        <a className="text-evergreen-800 underline" href={`/admin/classes?org=${c.organization_id}&edit=${c.id}`}>Edit</a>
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
