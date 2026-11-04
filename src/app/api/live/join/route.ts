import { createAdminClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { z } from "zod";

const Body = z.object({
  code: z.string().min(4).max(12),
  display_name: z.string().min(1).max(60),
  participant_ref: z.string().max(60).optional(),
});

/** Guest join for a live quiz. Identity = unguessable access token. */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const { code, display_name, participant_ref } = parsed.data;

  const admin = createAdminClient();
  const { data: session } = await admin
    .from("quiz_sessions")
    .select("*")
    .eq("join_code", code.trim().toUpperCase())
    .maybeSingle();

  if (!session) return NextResponse.json({ error: "We couldn't find a session with that code." }, { status: 404 });
  if (session.status === "ended")
    return NextResponse.json({ error: "This session has already ended." }, { status: 410 });

  const maxP = Number((session.settings as Record<string, unknown>)?.max_participants ?? 200);
  const { count } = await admin
    .from("session_participants")
    .select("id", { count: "exact", head: true })
    .eq("session_id", session.id)
    .neq("status", "rejected");
  if ((count ?? 0) >= maxP)
    return NextResponse.json({ error: "This session is full." }, { status: 403 });

  const { data: participant, error } = await admin
    .from("session_participants")
    .insert({ session_id: session.id, display_name, participant_ref: participant_ref || null })
    .select("id, access_token")
    .single();
  if (error || !participant)
    return NextResponse.json({ error: "Could not join the session." }, { status: 500 });

  return NextResponse.json({
    participant_id: participant.id,
    access_token: participant.access_token,
    session_id: session.id,
    title: session.title,
  });
}
