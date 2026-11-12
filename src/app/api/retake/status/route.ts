import { getSessionContext } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Tiny, cheap state probe used by the student interface to notice a decision
 * without a reload.
 *
 * The browser also subscribes to the same rows over Supabase Realtime; this
 * endpoint is the fallback for browsers where the socket is blocked, and the
 * answer both channels produce is the same. Nothing is returned to a caller
 * who is not signed in, and only the caller's own requests are ever read.
 */
export async function GET() {
  const ctx = await getSessionContext().catch(() => null);
  if (!ctx) return NextResponse.json({ signed_in: false, pending_ids: [], decided: null });

  const admin = createAdminClient();
  const { data: students } = await admin
    .from("students")
    .select("id")
    .eq("user_id", ctx.profile.id)
    .limit(20);
  const studentIds = (students ?? []).map((s) => s.id as string);

  const columns = "id,status,decision_seen_at,decided_at";
  const [byStudent, byRequester] = await Promise.all([
    studentIds.length
      ? admin
          .from("exam_retake_requests")
          .select(columns)
          .in("student_id", studentIds)
          .in("status", ["pending", "approved", "rejected"])
          .order("created_at", { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [] as { id: string; status: string; decision_seen_at: string | null }[] }),
    admin
      .from("exam_retake_requests")
      .select(columns)
      .eq("requested_by", ctx.profile.id)
      .in("status", ["pending", "approved", "rejected"])
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const rows = new Map<string, { id: string; status: string; decision_seen_at: string | null }>();
  for (const row of [...(byStudent.data ?? []), ...(byRequester.data ?? [])]) {
    const typed = row as { id: string; status: string; decision_seen_at: string | null };
    rows.set(typed.id, typed);
  }
  const all = [...rows.values()];

  const decided = all.find(
    (row) => (row.status === "approved" || row.status === "rejected") && !row.decision_seen_at,
  );
  return NextResponse.json({
    signed_in: true,
    pending_ids: all.filter((row) => row.status === "pending").map((row) => row.id),
    decided: decided ? { id: decided.id, status: decided.status } : null,
  });
}
