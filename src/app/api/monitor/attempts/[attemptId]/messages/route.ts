import { attemptDeadline } from "@/lib/exam";
import { MESSAGE_CAP_PER_ATTEMPT, MESSAGE_PAGE_SIZE, isUuid, normalizeMessageBody } from "@/lib/examMessaging";
import { requireStaffSession, staffExamAccess } from "@/lib/monitorAccess";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { z } from "zod";

const NO_STORE = { "Cache-Control": "private, no-store" };
const COLUMNS = "id, client_message_id, sender_kind, body, created_at, delivered_at, read_at";
const Body = z.object({ client_message_id: z.string().uuid(), body: z.string().max(4000) });

/** Resolves an attempt the caller may monitor, with its examination's deadline inputs. */
async function monitoredAttempt(attemptId: string) {
  const supabase = await createClient();
  const { data: attempt } = await supabase
    .from("exam_attempts")
    .select("id, exam_id, status, started_at, extension_minutes")
    .eq("id", attemptId)
    .maybeSingle();
  if (!attempt) return null;
  const { data: exam } = await supabase
    .from("exams")
    .select("id, organization_id, duration_minutes, ends_at")
    .eq("id", attempt.exam_id)
    .maybeSingle();
  if (!exam) return null;
  return { supabase, attempt, exam };
}

/** Conversation with one candidate, for an authorized staff member. */
export async function GET(request: Request, { params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;
  const session = await requireStaffSession();
  if (!session.ok) return session.response;
  if (!isUuid(attemptId)) return NextResponse.json({ error: "Attempt not found." }, { status: 404, headers: NO_STORE });
  const found = await monitoredAttempt(attemptId);
  if (!found) return NextResponse.json({ error: "Attempt not found." }, { status: 404, headers: NO_STORE });
  const access = await staffExamAccess(found.exam.id as string);
  if (!access.ok) return access.response;

  const after = new URL(request.url).searchParams.get("after");
  let query = access.supabase.from("exam_messages").select(COLUMNS).eq("attempt_id", attemptId);
  if (after) {
    const time = Date.parse(after);
    if (Number.isNaN(time)) return NextResponse.json({ error: "Invalid cursor." }, { status: 400, headers: NO_STORE });
    query = query.gte("created_at", new Date(time).toISOString()).order("created_at", { ascending: true }).limit(100);
  } else {
    query = query.order("created_at", { ascending: false }).limit(MESSAGE_PAGE_SIZE);
  }
  const { data, error } = await query;
  if (error || !data) return NextResponse.json({ error: "Messages could not be loaded." }, { status: 500, headers: NO_STORE });
  return NextResponse.json({
    server_now: new Date().toISOString(),
    messages: after ? data : [...data].reverse(),
    status: found.attempt.status,
  }, { headers: NO_STORE });
}

/** Teacher message to one candidate. Idempotent by client_message_id. Only while the attempt is open. */
export async function POST(request: Request, { params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;
  const session = await requireStaffSession();
  if (!session.ok) return session.response;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!isUuid(attemptId) || !parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400, headers: NO_STORE });
  const found = await monitoredAttempt(attemptId);
  if (!found) return NextResponse.json({ error: "Attempt not found." }, { status: 404, headers: NO_STORE });
  const access = await staffExamAccess(found.exam.id as string);
  if (!access.ok) return access.response;
  const { attempt, exam, supabase } = found;
  if (attempt.status !== "in_progress") {
    return NextResponse.json({ error: "This attempt is closed. Messages can only be sent during the examination." }, { status: 409, headers: NO_STORE });
  }
  if (new Date() > attemptDeadline(exam, attempt.started_at as string, Number(attempt.extension_minutes ?? 0))) {
    return NextResponse.json({ error: "The deadline has passed. Messages can no longer be sent." }, { status: 409, headers: NO_STORE });
  }
  const normalized = normalizeMessageBody(parsed.data.body);
  if (!normalized.ok) return NextResponse.json({ error: normalized.error }, { status: 400, headers: NO_STORE });

  const { count } = await supabase.from("exam_messages").select("id", { count: "exact", head: true }).eq("attempt_id", attemptId);
  if ((count ?? 0) >= MESSAGE_CAP_PER_ATTEMPT) {
    return NextResponse.json({ error: "This conversation has reached its limit." }, { status: 429, headers: NO_STORE });
  }

  const { data: inserted, error } = await supabase
    .from("exam_messages")
    .upsert({
      organization_id: exam.organization_id,
      exam_id: exam.id,
      attempt_id: attemptId,
      sender_kind: "staff",
      sender_user_id: access.ctx.profile.id,
      client_message_id: parsed.data.client_message_id,
      body: normalized.body,
    }, { onConflict: "attempt_id,sender_kind,client_message_id", ignoreDuplicates: true })
    .select(COLUMNS);
  if (error) return NextResponse.json({ error: "The message could not be sent. Try again." }, { status: 500, headers: NO_STORE });

  let message: NonNullable<typeof inserted>[number] | null = inserted?.[0] ?? null;
  if (!message) {
    const { data: existing } = await supabase
      .from("exam_messages")
      .select(COLUMNS)
      .eq("attempt_id", attemptId)
      .eq("sender_kind", "staff")
      .eq("client_message_id", parsed.data.client_message_id)
      .maybeSingle();
    message = existing ?? null;
  }
  if (!message) return NextResponse.json({ error: "The message could not be confirmed. Try again." }, { status: 500, headers: NO_STORE });
  return NextResponse.json({ message }, { headers: NO_STORE });
}
