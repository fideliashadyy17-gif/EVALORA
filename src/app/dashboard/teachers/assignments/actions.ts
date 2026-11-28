"use server";

/**
 * Teaching assignment administration.
 *
 * Writes go through `setTeachingAssignments`, the same service the rest of the
 * application uses, so the tenant checks and the diff-based replace are not
 * reimplemented here. This module only adds what an administration surface
 * needs: authorization, audit, and a truthful result rather than a silent
 * redirect.
 *
 * Assignments are NOT inferred. Nothing here derives a responsibility from
 * question ownership, examination authorship or anything else — a guessed
 * assignment would grant or remove real access on the strength of an inference,
 * which is precisely what the brief forbids.
 */

import { revalidatePath } from "next/cache";
import { activeOrg, requireUser } from "@/lib/auth";
import { canOperate } from "@/lib/operationalAccess";
import { audit } from "@/lib/admin";
import { createClient } from "@/lib/supabase/server";
import { setTeachingAssignments, type TeachingRole } from "@/lib/teachingAssignments";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AssignmentActionState {
  ok: boolean;
  message: string;
}

async function authorize() {
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  if (!org) return null;
  // The same permission that already gates the teacher directory.
  if (!(await canOperate(ctx, org.id, "organizations.manage_members", "teachers"))) return null;
  return { ctx, org };
}

/**
 * Saves one teacher's full responsibility set.
 *
 * The form submits the complete desired state rather than individual add/remove
 * operations, so a partially applied edit is impossible: `setTeachingAssignments`
 * diffs against what is stored and writes both sides in one pass.
 */
export async function saveAssignmentsAction(
  _prev: AssignmentActionState | null,
  formData: FormData,
): Promise<AssignmentActionState> {
  const auth = await authorize();
  if (!auth) return { ok: false, message: "You do not have permission to manage teaching assignments." };

  const teacherId = String(formData.get("teacher_id") ?? "");
  if (!UUID.test(teacherId)) return { ok: false, message: "Choose a teacher first." };

  // Entries are "role|classId|subjectId". The class may be empty for a
  // subject-only assignment; the subject may not.
  const desired: { classId: string | null; subjectId: string | null; role: TeachingRole }[] = [];
  const seen = new Set<string>();
  for (const raw of formData.getAll("assignment")) {
    if (typeof raw !== "string") continue;
    const [role, classId, subjectId] = raw.split("|");
    if (role !== "class_teacher" && role !== "subject_teacher") continue;
    if (classId && !UUID.test(classId)) continue;
    if (subjectId && !UUID.test(subjectId)) continue;
    if (role === "class_teacher" && (!classId || subjectId)) continue;
    if (role === "subject_teacher" && !subjectId) continue;
    const key = `${role}|${classId ?? ""}|${subjectId ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    desired.push({ role, classId: classId || null, subjectId: subjectId || null });
  }

  // One homeroom per class. The database enforces this too; catching it here
  // produces a sentence instead of a constraint violation.
  const homeroomClasses = desired.filter((row) => row.role === "class_teacher").map((row) => row.classId);
  if (new Set(homeroomClasses).size !== homeroomClasses.length) {
    return { ok: false, message: "A class can have only one homeroom teacher." };
  }

  const supabase = await createClient();
  try {
    const result = await setTeachingAssignments(supabase, {
      organizationId: auth.org.id,
      teacherId,
      assignedBy: auth.ctx.user.id,
      desired,
    });
    await audit(auth.ctx, "teacher.assignments_saved", "teaching_assignments", teacherId, auth.org.id, {
      total: desired.length,
      added: result.added,
      removed: result.removed,
    });
    revalidatePath("/dashboard/teachers/assignments");
    return {
      ok: true,
      message:
        result.added === 0 && result.removed === 0
          ? "No changes were needed — the saved responsibilities already matched."
          : `Saved: ${result.added} added, ${result.removed} removed.`,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "The assignments could not be saved.",
    };
  }
}
