import { NextResponse } from "next/server";
import { can, getSessionContext, PROCTOR_ROLES, type SessionContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const MONITOR_ROLES = PROCTOR_ROLES;

/**
 * Staff access to one examination's monitoring surface. The signed-in session is required,
 * the examination must be visible under the caller's row level security, and the caller's
 * role in that examination's organization must allow monitoring (super admins are platform-wide).
 */
const NO_STORE = { "Cache-Control": "private, no-store" };

/** First gate of every staff route: a signed-in session, checked before any attempt is read. */
export async function requireStaffSession(): Promise<
  | { ok: true; ctx: SessionContext }
  | { ok: false; response: NextResponse }
> {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, response: NextResponse.json({ error: "Sign in to continue." }, { status: 401, headers: NO_STORE }) };
  return { ok: true, ctx };
}

export async function staffExamAccess(examId: string): Promise<
  | { ok: true; ctx: SessionContext; supabase: Awaited<ReturnType<typeof createClient>>; organization_id: string }
  | { ok: false; response: NextResponse }
> {
  const session = await requireStaffSession();
  if (!session.ok) return session;
  const { ctx } = session;
  const supabase = await createClient();
  const { data: exam } = await supabase.from("exams").select("id, organization_id").eq("id", examId).maybeSingle();
  if (!exam || !can(ctx, exam.organization_id as string, MONITOR_ROLES)) {
    return { ok: false, response: NextResponse.json({ error: "Examination not found." }, { status: 404, headers: { "Cache-Control": "private, no-store" } }) };
  }
  return { ok: true, ctx, supabase, organization_id: exam.organization_id as string };
}
