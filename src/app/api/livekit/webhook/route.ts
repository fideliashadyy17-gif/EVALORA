import { closeProctoringRoom, recordRoomEvents } from "@/lib/proctoring";
import { createAdminClient } from "@/lib/supabase/server";
import { WebhookReceiver } from "livekit-server-sdk";
import { NextResponse } from "next/server";

/**
 * LiveKit server webhook.
 *
 * Security model: the request is authenticated by LiveKit's signed webhook JWT
 * (verified with LIVEKIT_API_SECRET, which never leaves the server). Only after
 * that verification do we touch the database with the service role — and even
 * then the room row is resolved from OUR database by room name, so a forged or
 * mismatched payload cannot attach evidence to another organization's exam.
 *
 * Failure to record evidence is logged but never fails the webhook, because a
 * non-2xx response makes LiveKit retry and duplicate join events.
 */
export const dynamic = "force-dynamic";

const EVENT_MAP: Record<string, string> = {
  participant_joined: "joined",
  participant_left: "left",
  track_published: "track_published",
  track_unpublished: "track_unpublished",
  room_finished: "room_finished",
};

export async function POST(request: Request) {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!apiKey || !apiSecret)
    return NextResponse.json({ error: "LiveKit is not configured on this deployment." }, { status: 503 });

  const body = await request.text();
  const authHeader = request.headers.get("authorization") ?? undefined;

  let event: Awaited<ReturnType<WebhookReceiver["receive"]>>;
  try {
    event = await new WebhookReceiver(apiKey, apiSecret).receive(body, authHeader);
  } catch {
    // Unsigned or tampered payload.
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
  }

  const roomName = event.room?.name ?? "";
  if (!roomName.startsWith("exam-")) return NextResponse.json({ ok: true, ignored: "unknown_room" });

  const admin = createAdminClient();
  const { data: room } = await admin
    .from("proctoring_rooms")
    .select("id, organization_id, exam_id, status")
    .eq("room_name", roomName)
    .maybeSingle();
  // No persisted room means no token was ever issued through EVALORA.
  if (!room) return NextResponse.json({ ok: true, ignored: "room_not_registered" });

  const mapped = EVENT_MAP[event.event];
  const identity = event.participant?.identity ?? "room";

  if (mapped) {
    await recordRoomEvents(admin, [
      {
        room_id: room.id,
        organization_id: room.organization_id,
        exam_id: room.exam_id,
        participant_identity: identity,
        event: mapped,
        detail: {
          webhook_event: event.event,
          track_source: event.track?.source ?? null,
          track_type: event.track?.type ?? null,
        },
        occurred_at: event.createdAt
          ? new Date(Number(event.createdAt) * 1000).toISOString()
          : undefined,
      },
    ]);
  }

  if (event.event === "room_finished") await closeProctoringRoom(admin, room.id);

  return NextResponse.json({ ok: true });
}
