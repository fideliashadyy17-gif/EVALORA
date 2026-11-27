import { loadAttemptContext } from "@/lib/exam";
import { DEVICE_CHECK_STATUSES, failedDeviceChecks, type DeviceCheckStatus } from "@/lib/deviceCheck";
import { resolveProctoringConfig } from "@/lib/proctoringConfig";
import { createAdminClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { z } from "zod";

const Body = z.object({
  attempt_id: z.string().uuid(),
  token: z.string().uuid(),
  camera: z.enum(DEVICE_CHECK_STATUSES).optional(),
  microphone: z.enum(DEVICE_CHECK_STATUSES).optional(),
  browser: z
    .object({
      name: z.string().max(40),
      version: z.string().max(20).default(""),
      platform: z.string().max(40).default(""),
      screen_width: z.number().int().min(0).max(100000).default(0),
      screen_height: z.number().int().min(0).max(100000).default(0),
      online: z.boolean().default(true),
      supported: z.boolean(),
      reason: z.string().max(140).optional(),
    })
    .optional(),
  checked_at: z.string().max(40).optional(),
});

const headers = { "Cache-Control": "private, no-store" };

/** One incident type covers every device-check problem, so consoles stay readable. */
const INCIDENT_TYPE = "device_check_failed";

/**
 * Records the outcome of the pre-examination device checks.
 *
 * Authorization is identical to `/api/exam/integrity`: the candidate supplies
 * only the attempt id and that attempt's own access token, and the examination,
 * candidate and organization are resolved from them server-side. A student
 * therefore cannot attach a device-check result to somebody else's attempt or
 * to another tenant's examination, and cannot read or rewrite what was stored.
 *
 * WHAT IS AUTHORITATIVE
 * ---------------------
 * The client reports what its browser observed, but it does NOT decide which
 * checks mattered. This route re-resolves the organization's proctoring
 * configuration and evaluates only the checks that configuration required, so
 * a tampered payload cannot invent an incident for a check that was switched
 * off, nor hide one: a missing field for a required check is itself a failure.
 *
 * WHAT IS STORED
 * --------------
 * Only a required check that could not be satisfied produces a row — one per
 * attempt, low severity, no media, no user-agent string, no location. When
 * every required check passed nothing is written at all: a successful admission
 * is not evidence and should not become a surveillance record.
 *
 * This endpoint never blocks a candidate. It answers honestly about what it
 * stored; the decision about an unverifiable device belongs to a supervisor
 * reviewing the incident, not to the admission path.
 */
/**
 * Reports which device checks this attempt's organization requires.
 *
 * The code-entry admission screen (`/exam-access`) cannot know the organization
 * until an access code has been verified, so it asks here — with the attempt's
 * own credentials — before opening a camera or microphone. Requiring the
 * attempt token means an anonymous caller cannot enumerate which institutions
 * switched a check on, and cannot make a candidate's browser prompt for a
 * device that was never asked for.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const attemptId = url.searchParams.get("attempt_id") ?? "";
  const token = url.searchParams.get("token") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(attemptId) || !/^[0-9a-f-]{36}$/i.test(token))
    return NextResponse.json({ error: "Invalid request." }, { status: 400, headers });

  const admin = createAdminClient();
  const ctx = await loadAttemptContext(admin, attemptId, token);
  if (!ctx) return NextResponse.json({ error: "Attempt not found." }, { status: 404, headers });
  const { exam } = ctx;
  if (!exam || !exam.organization_id)
    return NextResponse.json({ error: "Assessment data is unavailable." }, { status: 500, headers });

  const cfg = await resolveProctoringConfig(exam.organization_id as string);
  return NextResponse.json(
    {
      required: {
        camera: cfg.requireCameraCheck,
        microphone: cfg.requireMicrophoneCheck,
        browser: cfg.requireBrowserCheck,
      },
    },
    { headers },
  );
}

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400, headers });
  const { attempt_id, token, camera, microphone, browser, checked_at } = parsed.data;

  const admin = createAdminClient();
  const ctx = await loadAttemptContext(admin, attempt_id, token);
  if (!ctx) return NextResponse.json({ error: "Attempt not found." }, { status: 404, headers });
  const { attempt, exam, candidate } = ctx;
  if (!exam || !candidate || !exam.organization_id)
    return NextResponse.json({ error: "Assessment data is unavailable." }, { status: 500, headers });
  if (attempt.status !== "in_progress")
    return NextResponse.json({ ok: true, recorded: false, reason: "attempt_not_active", failures: [] }, { headers });

  const cfg = await resolveProctoringConfig(exam.organization_id as string);
  const requirements = {
    camera: cfg.requireCameraCheck,
    microphone: cfg.requireMicrophoneCheck,
    browser: cfg.requireBrowserCheck,
  };

  // A required check with no reported outcome counts as failed: silence is not
  // evidence that a device worked.
  const failures = failedDeviceChecks(
    {
      camera: (camera ?? "error") as DeviceCheckStatus,
      microphone: (microphone ?? "error") as DeviceCheckStatus,
      browser: browser
        ? {
            name: browser.name,
            version: browser.version,
            platform: browser.platform,
            screenWidth: browser.screen_width,
            screenHeight: browser.screen_height,
            online: browser.online,
            supported: browser.supported,
            ...(browser.reason ? { reason: browser.reason } : {}),
          }
        : null,
      checkedAt: checked_at ?? null,
    },
    requirements,
  );

  if (failures.length === 0)
    return NextResponse.json({ ok: true, recorded: false, reason: "all_checks_passed", failures: [] }, { headers });

  // One device-check incident per attempt: a candidate who retries admission
  // must not fill the review queue with repeats of the same problem.
  const { data: existing } = await admin
    .from("proctoring_incidents")
    .select("id")
    .eq("attempt_id", attempt_id)
    .eq("type", INCIDENT_TYPE)
    .limit(1);
  if (Array.isArray(existing) && existing.length > 0)
    return NextResponse.json({ ok: true, recorded: false, reason: "duplicate", failures }, { headers });

  // Only what the platform asked for is written down: a check that was switched
  // off does not appear in the note at all, so a reviewer never has to wonder
  // whether an absent field means "passed" or "not required".
  const notePayload: Record<string, unknown> = {
    failed: failures,
    required: Object.entries(requirements)
      .filter(([, wanted]) => wanted)
      .map(([device]) => device),
  };
  if (requirements.camera) notePayload.camera = camera ?? "not_reported";
  if (requirements.microphone) notePayload.microphone = microphone ?? "not_reported";
  if (requirements.browser) {
    notePayload.browser = browser
      ? {
          name: browser.name,
          version: browser.version,
          platform: browser.platform,
          screen: `${browser.screen_width}x${browser.screen_height}`,
          online: browser.online,
          ...(browser.supported ? {} : { reason: browser.reason ?? "unsupported environment" }),
        }
      : "not_reported";
  }
  if (checked_at) notePayload.checked_at = checked_at;
  const note = JSON.stringify(notePayload).slice(0, 400);

  const { error } = await admin.from("proctoring_incidents").insert({
    organization_id: exam.organization_id,
    exam_id: exam.id,
    candidate_id: candidate.id,
    attempt_id: attempt_id,
    type: INCIDENT_TYPE,
    severity: "low",
    note,
    status: "open",
  });

  if (error) {
    // Reported honestly: the check ran, the problem was seen, the record failed.
    return NextResponse.json(
      { ok: true, recorded: false, reason: "record_failed", failures },
      { status: 500, headers },
    );
  }

  return NextResponse.json({ ok: true, recorded: true, failures }, { headers });
}
