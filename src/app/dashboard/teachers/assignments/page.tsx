import type { Metadata } from "next";
import { Badge, Card, PageTitle } from "@/components/ui";
import { activeOrg, requireUser } from "@/lib/auth";
import { canOperate } from "@/lib/operationalAccess";
import { createClient } from "@/lib/supabase/server";
import { getCapabilities, requireModule } from "@/lib/capabilities";
import { AssignmentEditor, type EditorAssignment, type EditorClass, type EditorSubject } from "./AssignmentEditor";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AssistantPanel } from "@/components/dashboard/AssistantPanel";

export const metadata: Metadata = { title: "Teaching assignments" };
export const dynamic = "force-dynamic";

/**
 * Teaching assignment administration.
 *
 * The security model is live in the database, but it only binds once a teacher
 * has an assignment: a teacher with none is treated as unrestricted, which is
 * what keeps 2,492 existing questions editable during the transition. That makes
 * this page load-bearing rather than cosmetic — the "unassigned" list below is
 * the set of teachers whose access is still organization-wide.
 *
 * It states that plainly instead of showing a green tick. An administration
 * screen that implied enforcement while three teachers were still unrestricted
 * would be worse than no screen.
 */
export default async function AssignmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ teacher?: string; subject?: string; class?: string; q?: string }>;
}) {
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  const sp = await searchParams;

  const supabase = await createClient();
  const { entitlement } = await getCapabilities(supabase, ctx, org.id);
  requireModule(entitlement, "teachers", "/dashboard?e=module");
  const canEdit = await canOperate(ctx, org.id, "organizations.manage_members", "teachers");
  if (org.role === "school_founder") redirect("/dashboard?e=forbidden");

  const [{ data: members }, { data: profiles }, { data: classes }, { data: subjects }, { data: assignments }, { data: coverage }] =
    await Promise.all([
      supabase.from("organization_members").select("user_id, status").eq("organization_id", org.id).eq("role", "teacher").eq("status", "active"),
      supabase.from("profiles").select("id, full_name, email"),
      supabase.from("classes").select("id, name, academic_year_id, level_id, levels(name), academic_years(name)").eq("organization_id", org.id).order("name"),
      supabase.from("subjects").select("id, name").eq("organization_id", org.id).order("name"),
      supabase.from("teaching_assignments").select("id, teacher_id, class_id, subject_id, role").eq("organization_id", org.id),
      supabase.from("assignment_coverage").select("teacher_id, subject_assignments, homeroom_assignments, unrestricted").eq("organization_id", org.id),
    ]);

  const teacherIds = new Set((members ?? []).map((row) => row.user_id));
  const profileById = new Map((profiles ?? []).map((row) => [row.id, row]));

  type ClassRow = {
    id: string;
    name: string;
    academic_year_id: string | null;
    level_id: string | null;
    levels: { name: string } | { name: string }[] | null;
    academic_years: { name: string } | { name: string }[] | null;
  };
  const one = <T,>(value: T | T[] | null): T | null => (Array.isArray(value) ? (value[0] ?? null) : value);
  const editorClasses: EditorClass[] = ((classes ?? []) as unknown as ClassRow[]).map((klass) => ({
    id: klass.id,
    name: klass.name,
    levelName: one(klass.levels)?.name ?? null,
    academicYearId: klass.academic_year_id,
    academicYearName: one(klass.academic_years)?.name ?? null,
  }));

  const editorSubjects: EditorSubject[] = (subjects ?? []).map((row) => ({ id: row.id, name: row.name }));

  const byTeacher = new Map<string, EditorAssignment[]>();
  for (const row of assignments ?? []) {
    if (!teacherIds.has(row.teacher_id)) continue;
    const list = byTeacher.get(row.teacher_id) ?? [];
    list.push({ id: row.id, classId: row.class_id, subjectId: row.subject_id, role: row.role });
    byTeacher.set(row.teacher_id, list);
  }

  const coverageByTeacher = new Map(
    ((coverage ?? []) as { teacher_id: string; subject_assignments: number; homeroom_assignments: number; unrestricted: boolean }[]).map(
      (row) => [row.teacher_id, row],
    ),
  );

  // Filters. Applied in the page rather than in SQL because the row count here is
  // a school's teaching staff, not a content corpus.
  const query = (sp.q ?? "").trim().toLowerCase();
  const teachers = [...teacherIds]
    .map((id) => profileById.get(id))
    .filter((profile): profile is { id: string; full_name: string | null; email: string | null } => Boolean(profile))
    .filter((profile) => {
      if (query && !`${profile.full_name ?? ""} ${profile.email ?? ""}`.toLowerCase().includes(query)) return false;
      const rows = byTeacher.get(profile.id) ?? [];
      if (sp.subject && !rows.some((row) => row.subjectId === sp.subject)) return false;
      if (sp.class && !rows.some((row) => row.classId === sp.class)) return false;
      return true;
    })
    .sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? ""))
    .filter((profile) => !sp.teacher || profile.id === sp.teacher);

  const unassigned = teachers.filter((profile) => coverageByTeacher.get(profile.id)?.unrestricted ?? true);
  const risky = unassigned.filter((profile) => teacherIds.has(profile.id));

  return (
    <div className="space-y-5">
      <PageTitle
        eyebrow={<Badge tone="gold">{org.name}</Badge>}
        title="Teaching assignments"
        subtitle="Who teaches what, and where. A subject assignment is authority over that subject's questions, examinations and marking in the chosen class. Homeroom is pastoral and grants no subject authority."
        action={
          <Link href="/dashboard/teachers" className="rounded-xl border border-evergreen-900/25 px-3 py-2 text-sm font-medium text-evergreen-900 hover:bg-evergreen-50">
            Teacher directory
          </Link>
        }
      />

      {/* The state of the transition, stated rather than implied. */}
      <Card className={`p-4 ${risky.length ? "border-amber-400 bg-amber-50" : "border-evergreen-600/40 bg-evergreen-50"}`}>
        <h2 className="font-display text-sm font-semibold text-evergreen-950">
          {risky.length
            ? `${risky.length} teacher${risky.length === 1 ? "" : "s"} still have organization-wide access`
            : "Every teacher has an assignment"}
        </h2>
        <p className="mt-1 text-xs text-evergreen-900">
          {risky.length ? (
            <>
              A teacher with no teaching assignment is treated as unrestricted, so the subject-level
              policy does not bind them yet. That keeps existing work editable during the transition —
              it is not enforcement. Record an assignment for each teacher below to activate it.
            </>
          ) : (
            <>Subject-level authorization is active for every teacher in this school.</>
          )}
        </p>
        {risky.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {risky.map((profile) => (
              <li key={profile.id}>
                <Link
                  href={`/dashboard/teachers/assignments?teacher=${profile.id}`}
                  className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-amber-900 shadow-sm hover:bg-amber-100"
                >
                  {profile.full_name ?? profile.email}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-4">
        <form method="get" className="flex flex-wrap items-end gap-2">
          <label className="text-xs font-medium text-evergreen-900">
            Search
            <input name="q" defaultValue={sp.q ?? ""} placeholder="Name or email" className="mt-1 block w-44 rounded-lg border border-evergreen-900/25 bg-paper px-3 py-1.5 text-xs" />
          </label>
          <label className="text-xs font-medium text-evergreen-900">
            Subject
            <select name="subject" defaultValue={sp.subject ?? ""} className="mt-1 block rounded-lg border border-evergreen-900/25 bg-paper px-3 py-1.5 text-xs">
              <option value="">Any</option>
              {editorSubjects.map((subject) => (
                <option key={subject.id} value={subject.id}>{subject.name}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-evergreen-900">
            Class
            <select name="class" defaultValue={sp.class ?? ""} className="mt-1 block rounded-lg border border-evergreen-900/25 bg-paper px-3 py-1.5 text-xs">
              <option value="">Any</option>
              {editorClasses.map((klass) => (
                <option key={klass.id} value={klass.id}>{klass.name}</option>
              ))}
            </select>
          </label>
          <button type="submit" className="rounded-lg border border-evergreen-900/25 px-3 py-1.5 text-xs font-medium text-evergreen-900 hover:bg-evergreen-50">
            Filter
          </button>
          {(sp.q || sp.subject || sp.class || sp.teacher) && (
            <Link href="/dashboard/teachers/assignments" className="text-xs text-ink-soft underline">
              Clear
            </Link>
          )}
        </form>
      </Card>

      {teachers.length === 0 ? (
        <Card className="p-5">
          <p className="text-sm text-ink-soft">No teacher matches those filters.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {teachers.map((profile) => {
            const rows = byTeacher.get(profile.id) ?? [];
            const cov = coverageByTeacher.get(profile.id);
            return (
              <div key={profile.id}>
                {cov?.unrestricted && rows.length === 0 && (
                  <p className="mb-1 text-xs font-medium text-amber-800">
                    No assignment recorded — this teacher currently has organization-wide access.
                  </p>
                )}
                <AssignmentEditor
                  teacher={{ id: profile.id, name: profile.full_name ?? profile.email ?? "Unnamed", email: profile.email ?? "" }}
                  classes={editorClasses}
                  subjects={editorSubjects}
                  initial={rows}
                  canEdit={canEdit}
                />
              </div>
            );
          })}
        </div>
      )}

      <AssistantPanel title="Teaching-assignment assistant" />
    </div>
  );
}
