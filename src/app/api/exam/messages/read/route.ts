import { loadAttemptContext } from "@/lib/exam";
import { isUuid } from "@/lib/examMessaging";
import { createAdminClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { z } from "zod";

const NO_STORE = { "Cache-Control": "private, no-store" };
const Body = z.object({ attempt_id: z.string().uuid(), up_to: z.string().datetime({ offset: true }) });

/** The candidate has read the teacher's messages up to `up_to`. Only read times change. */
export async function POST(request: Request) {
  const match = /^Bearer\s+([^\s]+)$/i.exec(request.headers.get("authorization") ?? "");
  const token = match?.[1] ?? null;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!isUuid(token) || !parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400, headers: NO_STORE });

  const admin = createAdminClient();
  const ctx = await loadAttemptContext(admin, parsed.data.attempt_id, token);
  if (!ctx) return NextResponse.json({ error: "Attempt not found." }, { status: 404, headers: NO_STORE });

  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("exam_messages")
    .update({ read_at: now })
    .eq("attempt_id", ctx.attempt.id)
    .eq("sender_kind", "staff")
    .is("read_at", null)
    .lte("created_at", new Date(parsed.data.up_to).toISOString())
    .select("id");
  if (error) return NextResponse.json({ error: "Read state could not be saved." }, { status: 500, headers: NO_STORE });
  return NextResponse.json({ ok: true, marked: data?.length ?? 0 }, { headers: NO_STORE });
}
