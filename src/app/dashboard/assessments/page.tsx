import { redirect } from "next/navigation";
import { activeOrg, requireUser } from "@/lib/auth";
import { authorizeAssessmentActor, loadAssessmentWorkspace } from "@/lib/assessmentContributionsServer";
import { getCapabilities, requireModule } from "@/lib/capabilities";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { AssessmentWorkspaceClient } from "@/components/assessments/AssessmentWorkspaceClient";
import { PageTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Assessment Contributions & Grade Consolidation — workspace index.
 *
 * The organization always comes from the verified session (`activeOrg`), the
 * module gate and the RBAC permission check run here server-side, and RLS grants
 * no client writes on any of these tables: hiding a control in the UI is a
 * convenience, never the authorization.
 */
export default async function AssessmentsWorkspacePage() {
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  const isSuper = ctx.profile.platform_role === "super_admin";
  if (!org || (!isSuper && org.status !== "active")) redirect("/dashboard");

  const supabase = await createClient();
  const { entitlement } = await getCapabilities(supabase, ctx, org.id);
  requireModule(entitlement, "exam_results", "/dashboard?e=module");

  const admin = createAdminClient();
  const auth = await authorizeAssessmentActor(ctx, org.id, "view");
  if (!auth.allowed) redirect("/dashboard?e=forbidden");

  const workspace = await loadAssessmentWorkspace(admin, ctx, org.id);
  if (!workspace) redirect("/dashboard");

  // Students visible to this actor: the class roster for the classes in scope.
  const classIds = workspace.classes.map((klass) => klass.id);
  const students: { id: string; name: string; className: string | null }[] = [];
  if (classIds.length > 0) {
    const { data: enrollmentRows } = await admin
      .from("student_enrollments")
      .select("student_id, status, class_id, student:students(id, full_name)")
      .in("class_id", classIds)
      .eq("status", "active")
      .limit(5000);
    const classNameById = new Map(workspace.classes.map((klass) => [klass.id, klass.name]));
    const seen = new Set<string>();
    for (const row of enrollmentRows ?? []) {
      const student = row.student as unknown as { id: string; full_name: string } | null;
      if (!student || seen.has(String(student.id))) continue;
      seen.add(String(student.id));
      students.push({
        id: String(student.id),
        name: String(student.full_name),
        className: classNameById.get(String(row.class_id)) ?? null,
      });
    }
    students.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  } else {
    const { data: studentRows } = await admin
      .from("students")
      .select("id, full_name")
      .eq("organization_id", org.id)
      .eq("status", "active")
      .order("full_name")
      .limit(2000);
    for (const row of studentRows ?? []) {
      students.push({ id: String(row.id), name: String(row.full_name), className: null });
    }
  }

  return (
    <div>
      <PageTitle
        eyebrow="Academic Assessment Layer"
        title="Assessment Contributions & Grade Consolidation"
        subtitle="Record homework, class tests, quizzes, projects and other classroom assessments, then consolidate them into examination results with a configurable, fully audited method. Examination papers, questions, attempts, answers and original marks are never modified."
      />
      <AssessmentWorkspaceClient workspace={workspace} students={students} />
    </div>
  );
}
