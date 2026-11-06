import { NextResponse } from "next/server";

/**
 * Retired legacy endpoint. A participant join code must never double
 * as public-screen authorization. Use /api/live/screen with the
 * organizer-issued, revocable display token instead.
 */
export async function GET() {
  return NextResponse.json(
    {
      error:
        "This legacy public-screen endpoint has been retired. Open the secure screen link from the organizer console.",
    },
    { status: 410 },
  );
}
