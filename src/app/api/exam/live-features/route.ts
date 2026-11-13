import { isUuid } from "@/lib/examMessaging";
import { liveFeaturesFromSettings } from "@/lib/liveFeatures";
import { createAdminClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * Which answer tools the organiser allows for one examination sitting.
 *
 * Same security model as every other candidate route: the random attempt token
 * in the Authorization header proves which attempt is speaking, and the answer
 * is read from that attempt's own examination — never from an id in the query
 * string, and never from another examination, organisation or live session.
 *
 *  · Read-only: it writes nothing, touches no timer, records no incident and
 *    can never submit, extend or close an attempt.
 *  · It returns six booleans and nothing else — no question, answer, mark or
 *    candidate data.
 *
 * The switches are stored in `exams.settings.live_features`. An examination
 * nobody configured resolves to every tool (see @/lib/liveFeatures), and the
 * examination page keeps its last confirmed answer when this route cannot be
 * reached, so a network fault never takes a tool away from a candidate.
 */
const NO_STORE = { "Cache-Control": "private, no-store" };

function bearer(request: Request): string | null {
  const match = /^Bearer\s+([^\s]+)$/i.exec(request.headers.get("authorization") ?? "");
  return match?.[1] ?? null;
}

export async function GET(request: Request) {
  const token = bearer(request);
  const attemptId = new URL(request.url).searchParams.get("attempt_id");
  if (!isUuid(token) || !isUuid(attemptId)) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400, headers: NO_STORE });
  }

  const admin = createAdminClient();
  const { data: attempt } = await admin
    .from("exam_attempts")
    .select("id, exam_id")
    .eq("id", attemptId)
    .eq("access_token", token)
    .maybeSingle();
  if (!attempt) return NextResponse.json({ error: "Attempt not found." }, { status: 404, headers: NO_STORE });

  const { data: exam } = await admin.from("exams").select("settings").eq("id", attempt.exam_id).maybeSingle();
  if (!exam) return NextResponse.json({ error: "Examination data is unavailable." }, { status: 500, headers: NO_STORE });

  return NextResponse.json({ features: liveFeaturesFromSettings(exam.settings) }, { headers: NO_STORE });
}
