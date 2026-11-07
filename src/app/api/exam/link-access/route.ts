import { attemptDeadline } from "@/lib/exam";
import { EXAM_TRACKS, paperForTrack, parseTrack, trackSelectionEnabled } from "@/lib/examTrack";
import {
  examAccessAvailability,
  identityDataEqual,
  mergeEligibleClassIds,
  parseExamAccessSettings,
  sanitizeIdentityData,
} from "@/lib/exam-access";
import { loadQuizQuestions, seededShuffle } from "@/lib/live";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { genCode } from "@/lib/utils";
import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

const Body = z.object({
  invite_token: z.string().uuid(),
  access_code: z.string().min(4).max(32),
  first_name: z.string().trim().min(1).max(80),
  last_name: z.string().trim().min(1).max(80),
  class_id: z.string().uuid().optional(),
  guest_key: z.string().min(16).max(120),
  identity: z.record(z.string(), z.unknown()).optional(),
  consent: z.literal(true),
  track: z.enum(EXAM_TRACKS).optional(),
});

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function normalizeCode(value: string) {
  return value.trim().toUpperCase();
}

/**
 * Shared-link examination admission. The persisted link token identifies ONE
 * existing examination; the separately-distributed access code is compared
 * against that exam's server-stored SHA-256 hash. First and last name are
 * mandatory. A verified logged-in student is associated only through
 * students.user_id — never by matching a duplicated name. Guest identity is
 * a browser key whose hash prevents duplicate/conflicting attempts.
 */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Enter the access code, first name, last name and a valid class." }, { status: 400 });
  const { invite_token, access_code, first_name, last_name, guest_key, class_id, identity, track: rawTrack } = parsed.data;
  const admin = createAdminClient();
  const supabase = await createClient();

  const { data: exam } = await admin
    .from("exams")
    .select("*")
    .eq("invite_token", invite_token)
    .maybeSingle();
  if (!exam)
    return NextResponse.json({ error: "This examination link is invalid or has been regenerated." }, { status: 404 });

  const examSettings = (exam.settings ?? {}) as Record<string, unknown>;
  const access = parseExamAccessSettings(examSettings);
  const availability = examAccessAvailability({
    status: exam.status,
    starts_at: exam.starts_at,
    ends_at: exam.ends_at,
    shared_link_enabled: exam.shared_link_enabled,
    invite_expires_at: exam.invite_expires_at,
  });
  if (!availability.ok)
    return NextResponse.json({ error: availability.error }, { status: 403 });
  if (exam.access_code_hash !== sha256(normalizeCode(access_code)))
    return NextResponse.json({ error: "That access code is not correct for this examination." }, { status: 403 });

  const identityResult = sanitizeIdentityData(access.identityFields, identity);
  if (!identityResult.ok)
    return NextResponse.json({ error: identityResult.error }, { status: 400 });
  const identityData = identityResult.data;

  // Eligible classes are restricted to this exam's own class, direct
  // phase-class links, unassigned links for the same stage only, and any
  // explicit allowlist configured for this examination. Later-phase links
  // with no exam_id must not make another class's examination available here.
  const stage = typeof examSettings.stage === "string" ? examSettings.stage : "elimination";
  const attemptPolicy = access.attemptPolicy;
  const linkRows: { class_id: string | null; exam_id: string | null }[] = [];
  if (exam.event_id) {
    const { data: phases } = await admin
      .from("competition_event_phases")
      .select("id")
      .eq("event_id", exam.event_id)
      .eq("phase_key", stage);
    const phaseIds = (phases ?? []).map((p) => p.id as string);
    if (phaseIds.length) {
      const { data: stageLinks } = await admin
        .from("competition_phase_classes")
        .select("class_id,exam_id")
        .in("phase_id", phaseIds)
        .is("exam_id", null);
      linkRows.push(...((stageLinks ?? []) as { class_id: string | null; exam_id: string | null }[]));
    }
  }
  const { data: directLinks } = await admin
    .from("competition_phase_classes")
    .select("class_id,exam_id")
    .eq("exam_id", exam.id);
  linkRows.push(...((directLinks ?? []) as { class_id: string | null; exam_id: string | null }[]));
  const baseEligibleClasses = new Set<string>();
  for (const row of linkRows) {
    if (row.class_id && (!row.exam_id || row.exam_id === exam.id)) baseEligibleClasses.add(row.class_id);
  }
  if (exam.class_id) baseEligibleClasses.add(exam.class_id);
  for (const id of access.linkedClassIds) baseEligibleClasses.add(id);
  const eligibleClasses = new Set(mergeEligibleClassIds([...baseEligibleClasses], access.eligibleClassIds));
  if (eligibleClasses.size === 0)
    return NextResponse.json({ error: "No eligible class is configured for this examination." }, { status: 409 });

  const selectedClassId = class_id ?? (eligibleClasses.size === 1 ? [...eligibleClasses][0] : null);
  if (!selectedClassId || !eligibleClasses.has(selectedClassId))
    return NextResponse.json({ error: "Select an eligible class for this examination." }, { status: 403 });
  const { data: classRow } = await admin
    .from("classes")
    .select("id,organization_id")
    .eq("id", selectedClassId)
    .maybeSingle();
  if (!classRow || classRow.organization_id !== exam.organization_id)
    return NextResponse.json({ error: "That class does not belong to this examination." }, { status: 403 });

  // Reliable identity: only an authenticated user with a student record in
  // this organization may be linked to the student roster. Names are never
  // used to merge two candidates or student records.
  let studentId: string | null = null;
  let verifiedClassId: string | null = null;
  const { data: auth } = await supabase.auth.getUser();
  if (auth.user) {
    const { data: student } = await admin
      .from("students")
      .select("id")
      .eq("user_id", auth.user.id)
      .eq("organization_id", exam.organization_id)
      .maybeSingle();
    if (student) {
      studentId = student.id as string;
      const { data: enrollment } = await admin
        .from("student_enrollments")
        .select("class_id")
        .eq("student_id", student.id)
        .eq("status", "active")
        .maybeSingle();
      verifiedClassId = (enrollment?.class_id as string | null) ?? null;
      if (verifiedClassId && verifiedClassId !== selectedClassId)
        return NextResponse.json({ error: "Your verified class is not eligible for this examination." }, { status: 403 });
    }
  }

  // Registered-student-only examinations keep the institutional restriction:
  // a valid link and code alone are not sufficient authorization.
  if (access.accessMode === "registered_students_only" && (!auth.user || !studentId || verifiedClassId !== selectedClassId))
    return NextResponse.json(
      { error: "This examination requires a verified student account in an eligible class. Sign in with your institutional account." },
      { status: 401 },
    );

  const guestKeyHash = sha256(guest_key);
  const { data: existingCandidate } = await admin
    .from("exam_candidates")
    .select("*")
    .eq("exam_id", exam.id)
    .eq("guest_key_hash", guestKeyHash)
    .maybeSingle();
  if (existingCandidate) {
    const sameName =
      String(existingCandidate.first_name ?? "").trim().toLowerCase() === first_name.toLowerCase() &&
      String(existingCandidate.last_name ?? "").trim().toLowerCase() === last_name.toLowerCase();
    if (!sameName || String(existingCandidate.class_id ?? "") !== selectedClassId)
      return NextResponse.json({ error: "This browser already has an attempt under different candidate details. Ask the organizer for help." }, { status: 409 });
  }

  let candidate = existingCandidate;
  if (candidate) {
    const storedIdentity = (candidate.identity_data ?? {}) as Record<string, unknown>;
    if (!identityDataEqual(storedIdentity, identityData)) {
      if (Object.keys(storedIdentity).length === 0) {
        const { data: updated } = await admin
          .from("exam_candidates")
          .update({ identity_data: identityData })
          .eq("id", candidate.id)
          .select("*")
          .single();
        if (updated) candidate = updated;
      } else {
        return NextResponse.json({ error: "This browser already has an attempt under different identity details. Ask the organizer for help." }, { status: 409 });
      }
    }
  } else {
    const { data, error } = await admin
      .from("exam_candidates")
      .insert({
        exam_id: exam.id,
        full_name: `${first_name} ${last_name}`.trim(),
        first_name,
        last_name,
        class_id: selectedClassId,
        student_id: studentId,
        access_code: genCode(10),
        status: "registered",
        guest_key_hash: guestKeyHash,
        invite_token,
        source: "shared_link",
        identity_data: identityData,
      })
      .select("*")
      .single();
    if (error || !data) return NextResponse.json({ error: "Could not create your candidate record." }, { status: 500 });
    candidate = data;
  }

  const { data: existingAttempt } = await admin
    .from("exam_attempts")
    .select("*")
    .eq("exam_id", exam.id)
    .eq("candidate_id", candidate.id)
    .maybeSingle();
  let attempt = existingAttempt;
  if (attempt && attempt.status !== "in_progress" && attemptPolicy !== "read_only_reentry")
    return NextResponse.json({ error: "This attempt has already been submitted. Duplicate attempts are not permitted." }, { status: 409 });
  if (attempt && !identityDataEqual(attempt.identity_data ?? {}, identityData)) {
    const { data: updatedAttempt } = await admin
      .from("exam_attempts")
      .update({ identity_data: identityData })
      .eq("id", attempt.id)
      .select("*")
      .single();
    if (updatedAttempt) attempt = updatedAttempt;
  }
  if (!attempt) {
    const settings = (exam.settings ?? {}) as Record<string, unknown>;
    const tracked = trackSelectionEnabled(settings);
    const track = parseTrack(rawTrack);
    if (tracked && !track)
      return NextResponse.json(
        { error: "Choose Calculus AB or Calculus BC to start this examination.", requires_track: true },
        { status: 409 },
      );
    const rows0 = exam.quiz_id ? await loadQuizQuestions(admin, exam.quiz_id) : [];
    const rows = tracked && track ? paperForTrack(rows0, track) : rows0;
    const ordered = settings.randomize_questions ? seededShuffle(rows, `${exam.id}:${candidate.id}`) : rows;
    const { data, error } = await admin
      .from("exam_attempts")
      .insert({
        exam_id: exam.id,
        candidate_id: candidate.id,
        question_order: ordered.map((r) => r.id),
        track: tracked && track ? track : null,
        first_name,
        last_name,
        class_id: selectedClassId,
        student_id: studentId,
        guest_key_hash: guestKeyHash,
        invite_token,
        identity_data: identityData,
      })
      .select("*")
      .single();
    if (error || !data) return NextResponse.json({ error: "Could not start your attempt." }, { status: 500 });
    attempt = data;
    await admin.from("exam_candidates").update({ status: "in_progress" }).eq("id", candidate.id);
  }

  const deadline = attemptDeadline(exam, attempt.started_at, Number(attempt.extension_minutes ?? 0));
  return NextResponse.json({
    attempt_id: attempt.id,
    access_token: attempt.access_token,
    exam_id: exam.id,
    title: exam.title,
    candidate_name: candidate.full_name,
    first_name: candidate.first_name ?? first_name,
    last_name: candidate.last_name ?? last_name,
    class_id: selectedClassId,
    status: attempt.status,
    deadline: deadline.toISOString(),
    proctoring: Boolean(examSettings.proctoring),
  });
}
