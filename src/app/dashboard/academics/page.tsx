import { Button, ButtonLink, Card, EmptyState, Field, Input, PageTitle, Select, StatCard } from "@/components/ui";
import { activeOrg, can, MANAGER_ROLES, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { BookOpen, Calendar, Layers, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { deleteAcademicYear, deleteStructureItem, saveAcademicYear, saveStructureItem } from "./actions";

export const metadata: Metadata = { title: "Academic Structure" };
export const dynamic = "force-dynamic";

const OK: Record<string, string> = {
  year_saved: "Academic year saved.", year_deleted: "Academic year deleted.", saved: "Saved.", deleted: "Deleted.",
};
const ERR: Record<string, string> = {
  forbidden: "Only school owners/administrators can change the academic structure.",
  year_name: "Academic year name is required.", year_failed: "That academic year could not be saved.",
  year_in_use: "That year still has classes — move or archive them first.",
  in_use: "That item is still used by classes and cannot be deleted.",
  name: "A name is required.", save_failed: "That item could not be saved.",
};

/** Academic Management → Academic Structure: years, education levels,
 *  departments/streams and subjects — all configurable per school. */
export default async function AcademicStructurePage({ searchParams }: { searchParams: Promise<{ ok?: string; e?: string; editYear?: string }> }) {
  const sp = await searchParams;
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  const isManager = can(ctx, org.id, MANAGER_ROLES);
  const supabase = await createClient();

  const [{ data: years }, { data: levels }, { data: departments }, { data: subjects }, { count: classCount }, { count: studentCount }] = await Promise.all([
    supabase.from("academic_years").select("*").eq("organization_id", org.id).order("starts_on", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }),
    supabase.from("education_levels").select("*").eq("organization_id", org.id).order("sort").order("name"),
    supabase.from("departments").select("*").eq("organization_id", org.id).order("sort").order("name"),
    supabase.from("subjects").select("*").eq("organization_id", org.id).order("sort").order("name"),
    supabase.from("classes").select("id", { count: "exact", head: true }).eq("organization_id", org.id).eq("status", "active"),
    supabase.from("students").select("id", { count: "exact", head: true }).eq("organization_id", org.id).eq("status", "active"),
  ]);
  const editYear = sp.editYear ? (years ?? []).find((y) => y.id === sp.editYear) : null;

  const structureCard = (
    title: string, kind: "level" | "department" | "subject",
    items: { id: string; name: string; code: string | null }[] | null,
    hint: string,
  ) => (
    <Card className="p-6">
      <h2 className="font-display text-lg font-semibold text-evergreen-950">{title}</h2>
      <p className="mt-1 text-sm text-ink-soft">{hint}</p>
      {(items ?? []).length === 0 ? (
        <p className="mt-3 text-sm text-ink-soft">None yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-evergreen-900/10">
          {(items ?? []).map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="text-ink"><strong>{item.name}</strong>{item.code ? <span className="text-ink-soft"> · {item.code}</span> : null}</span>
              {isManager && (
                <form action={deleteStructureItem}>
                  <input type="hidden" name="kind" value={kind} /><input type="hidden" name="id" value={item.id} />
                  <button className="text-red-700 underline underline-offset-2" type="submit">Delete</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
      {isManager && (
        <form action={saveStructureItem} className="mt-4 grid gap-3 border-t border-evergreen-900/10 pt-4 sm:grid-cols-[1fr_auto_auto]">
          <input type="hidden" name="kind" value={kind} />
          <Field label={`New ${title.replace(/s$/, "").toLowerCase()}`}><Input name="name" required placeholder={kind === "level" ? "e.g. JSS, Collège, Grade band" : kind === "department" ? "e.g. Science, Arts" : "e.g. Mathematics"} /></Field>
          <Field label="Code"><Input name="code" placeholder="Optional" /></Field>
          <div className="flex items-end"><Button type="submit">Add</Button></div>
          {kind === "subject" && (
            <>
              <Field label="Level (optional)"><Select name="level_id"><option value="">All levels</option>{(levels ?? []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</Select></Field>
              <Field label="Department (optional)"><Select name="department_id"><option value="">None</option>{(departments ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
            </>
          )}
        </form>
      )}
    </Card>
  );

  return (
    <>
      <PageTitle
        eyebrow="People & Academics · Institutional Hierarchy"
        title="Academic Structure"
        subtitle="Your school's academic years, education levels, departments and subjects. Naming follows your own education system — nothing is hardcoded."
        action={<ButtonLink href="/dashboard/academics/classes" variant="gold">Manage classes →</ButtonLink>}
      />
      {sp.ok && OK[sp.ok] && <p className="mb-4 rounded-lg bg-evergreen-50 px-4 py-3 text-sm text-evergreen-900">{OK[sp.ok]}</p>}
      {sp.e && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{ERR[sp.e] ?? sp.e}</p>}
      {!isManager && <p className="mb-4 rounded-lg bg-cream px-4 py-3 text-sm text-ink">You can view the academic structure. Ask a school administrator to make changes.</p>}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active classes" value={classCount ?? 0} icon={<BookOpen className="h-5 w-5" />} />
        <StatCard label="Active students" value={studentCount ?? 0} icon={<Users className="h-5 w-5" />} />
        <StatCard label="Current year" value={(years ?? []).find((y) => y.is_current)?.name ?? "—"} icon={<Calendar className="h-5 w-5" />} />
        <StatCard label="Subjects configured" value={(subjects ?? []).length} hint={`${(levels ?? []).length} level(s) · ${(departments ?? []).length} stream(s)`} icon={<Layers className="h-5 w-5" />} />
      </div>

      <Card className="p-6">
        <h2 className="font-display text-lg font-semibold text-evergreen-950">Academic years</h2>
        {(years ?? []).length === 0 ? (
          <EmptyState title="No academic year yet" body="Create your first academic year (for example 2025/2026), then create classes inside it." />
        ) : (
          <ul className="mt-3 divide-y divide-evergreen-900/10">
            {(years ?? []).map((y) => (
              <li key={y.id} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
                <span className="text-ink"><strong>{y.name}</strong>{y.is_current ? <span className="ml-2 rounded-full bg-evergreen-100 px-2 py-0.5 text-xs font-semibold text-evergreen-900">current</span> : null}
                  <span className="text-ink-soft"> {y.starts_on ? `· ${y.starts_on}` : ""}{y.ends_on ? ` → ${y.ends_on}` : ""}</span></span>
                {isManager && (
                  <span className="flex gap-3">
                    <Link className="text-evergreen-800 underline underline-offset-2" href={`/dashboard/academics?editYear=${y.id}`}>Edit</Link>
                    <form action={deleteAcademicYear}><input type="hidden" name="id" value={y.id} /><button className="text-red-700 underline underline-offset-2" type="submit">Delete</button></form>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {isManager && (
          <form action={saveAcademicYear} className="mt-4 grid gap-3 border-t border-evergreen-900/10 pt-4 sm:grid-cols-4">
            <input type="hidden" name="id" value={editYear?.id ?? ""} />
            <Field label={editYear ? "Edit academic year" : "New academic year"}><Input name="name" required defaultValue={editYear?.name ?? ""} placeholder="2025/2026" /></Field>
            <Field label="Starts"><Input type="date" name="starts_on" defaultValue={editYear?.starts_on ?? ""} /></Field>
            <Field label="Ends"><Input type="date" name="ends_on" defaultValue={editYear?.ends_on ?? ""} /></Field>
            <div className="flex items-end gap-3">
              <label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" name="is_current" defaultChecked={editYear?.is_current} /> Current</label>
              <Button type="submit">{editYear ? "Save year" : "Add year"}</Button>
            </div>
          </form>
        )}
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {structureCard("Education levels", "level", levels, "Your own bands — Primary/JSS/SSS, Collège/Lycée, Grades, Forms…")}
        {structureCard("Departments / streams", "department", departments, "Optional groupings such as Science, Arts or Commercial.")}
        {structureCard("Subjects", "subject", subjects, "Subjects taught at your school, optionally per level/department.")}
      </div>
    </>
  );
}
