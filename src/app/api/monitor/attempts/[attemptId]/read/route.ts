import { isUuid } from "@/lib/examMessaging";
import { requireStaffSession, staffExamAccess } from "@/lib/monitorAccess";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { z } from "zod";

const NO_STORE = { "Cache-Control": "private, no-store" };
const Body = z.object({ up_to: z.string().datetime({ offset: true }) });

/** Staff have read the candidate's messages up to `up_to`. Only read times change (guarded in the database). */
export async function POST(request: Request, { params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;
  const session = await requireStaffSession();
  if (!session.ok) return session.response;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!isUuid(attemptId) || !parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400, headers: NO_STORE });
  const supabase = await createClient();
  const { data: attempt } = await supabase.from("exam_attempts").select("exam_id").eq("id", attemptId).maybeSingle();
  if (!attempt) return NextResponse.json({ error: "Attempt not found." }, { status: 404, headers: NO_STORE });
  const access = await staffExamAccess(attempt.exam_id as string);
  if (!access.ok) return access.response;

  const { data, error } = await access.supabase
    .from("exam_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("attempt_id", attemptId)
    .eq("sender_kind", "candidate")
    .is("read_at", null)
    .lte("created_at", new Date(parsed.data.up_to).toISOString())
    .select("id");
  if (error) return NextResponse.json({ error: "Read state could not be saved." }, { status: 500, headers: NO_STORE });
  return NextResponse.json({ ok: true, marked: data?.length ?? 0 }, { headers: NO_STORE });
}
