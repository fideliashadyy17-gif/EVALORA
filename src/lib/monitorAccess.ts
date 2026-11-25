import { getSessionContext, type SessionContext } from "@/lib/auth";
import { canOperate } from "@/lib/operationalAccess";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * Authorization helper shared by every staff monitoring API route
 * (snapshot, pause/resume, messages, read receipts).
 *
 * Uses centralized effective RBAC permissions intersected with the
 * `exam_monitoring` module entitlement:
 *   - Read routes require `proctoring.view` (blocks School Founder privacy ceiling).
 *   - Mutating routes (`{ write: true }`) require `proctoring.manage`.
 */
export async function requireStaffSession(): Promise<
  | { ok: true; ctx: SessionContext }
  | { ok: false; response: NextResponse }
> {
  const ctx = await getSessionContext();
  if (!ctx) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Sign in to continue." }, { status: 401, headers: NO_STORE }),
    };
  }
  return { ok: true, ctx };
}

export async function staffExamAccess(
  examId: string,
  options?: { write?: boolean },
): Promise<
  | { ok: true; ctx: SessionContext; supabase: Awaited<ReturnType<typeof createClient>>; organization_id: string }
  | { ok: false; response: NextResponse }
> {
  const session = await requireStaffSession();
  if (!session.ok) return session;
  const supabase = await createClient();
  const { data: exam } = await supabase
    .from("exams")
    .select("id, organization_id")
    .eq("id", examId)
    .maybeSingle();
  if (!exam) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Examination not found." }, { status: 404, headers: NO_STORE }),
    };
  }
  const permission = options?.write ? "proctoring.manage" : "proctoring.view";
  if (!(await canOperate(session.ctx, exam.organization_id as string, permission, "exam_monitoring"))) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Examination not found." }, { status: 404, headers: NO_STORE }),
    };
  }
  return { ok: true, ctx: session.ctx, supabase, organization_id: exam.organization_id as string };
}
