import { attemptDeadline } from "@/lib/exam";
import { admissionTrack, paperForTrack, trackSelectionEnabled } from "@/lib/examTrack";
import {
  accessCodeMatches,
  examAccessAvailability,
  identityDataEqual,
  mergeEligibleClassIds,
  parseExamAccessSettings,
  sanitizeIdentityData,
} from "@/lib/exam-access";
import { findUsableGrant, startRetakeAttempt, type RetakeCandidateRow } from "@/lib/examRetakeServer";
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
  const { invite_token, access_code, first_name, last_name, guest_key, class_id, identity } = parsed.data;
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
    invite_activates_at: exam.invite_activates_at,
    invite_no_expiry: exam.invite_no_expiry,
  });

  // Link expiry / manual disable stops NEW starts — it never touches an attempt
  // already in progress (the attempt routes do not read link state at all).
  //
  // An approval is a separate authorization: if this exact candidate holds a
  // valid, unused, in-window retake approval, the link-level refusal does not
  // apply to them. Nothing else is relaxed: the access code, the identity
  // fields, the candidate's class and the examination's open status are still
  // verified below.
  let retakeGrant: Awaited<ReturnType<typeof findUsableGrant>> = null;
  if (!availability.ok) {
    const { data: existingByKey } = await admin
      .from("exam_candidates")
      .select("*")
      .eq("exam_id", exam.id)
      .eq("guest_key_hash", sha256(guest_key))
      .maybeSingle();
    const sameName = Boolean(
      existingByKey &&
      String(existingByKey.first_name ?? "").trim().toLowerCase() === first_name.toLowerCase() &&
      String(existingByKey.last_name ?? "").trim().toLowerCase() === last_name.toLowerCase(),
    );
    if (!existingByKey || !sameName)
      return NextResponse.json({ error: availability.error }, { status: 403 });
    retakeGrant = await findUsableGrant(admin, exam.id, existingByKey.id);
    if (!retakeGrant)
      return NextResponse.json(
        {
          error: `${availability.error} If you have an approved retake, ask your institution for the current access window.`,
        },
        { status: 403 },
      );
    if (exam.status !== "open")
      return NextResponse.json(
        { error: "This examination is not open. Your institution must reopen it for an authorized retake." },
        { status: 403 },
      );
    if (exam.ends_at && Date.parse(exam.ends_at) < Date.now())
      return NextResponse.json(
        { error: "The examination window has closed. Your institution must extend it for an authorized retake." },
        { status: 403 },
      );
  }
  // Exact hash match first (the historical behaviour); otherwise fall back to
  // a canonical comparison against the stored code so that plausible
  // transcriptions — dropped hyphens, internal spaces, smart dashes, O/0 or
  // I/1 confusion from a touch keyboard — are still accepted. The stored code
  // is never changed; only the comparison is forgiving.
  const codeAccepted =
    exam.access_code_hash === sha256(normalizeCode(access_code)) ||
    accessCodeMatches(access_code, exam.access_code as string | null);
  if (!codeAccepted)
    return NextResponse.json(
      {
        error:
          "That access code does not match this examination. Copy-paste the code exactly as your teacher gave it, or reopen the invitation link — it fills the code in for you.",
      },
      { status: 403 },
    );

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
    .select("id,organization_id,curriculum_track")
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
  // One candidate PER PERSON PER BROWSER — never one per browser. A shared
  // device (lab, tablet cart, family phone) must admit every distinct
  // authorized student, while the same student on the same browser always
  // resumes their own record. The database unique index
  // uq_exam_candidate_shared_identity (migration 0096) enforces exactly this
  // shape, so the lookup must select the person's own row instead of assuming
  // the browser holds only one candidate (the pre-0096 code returned 409 for
  // the second student on a shared browser — the production "code works for
  // some students but not others" symptom).
  const samePerson = (row: Record<string, unknown>) =>
    String(row.first_name ?? "").trim().toLowerCase() === first_name.trim().toLowerCase() &&
    String(row.last_name ?? "").trim().toLowerCase() === last_name.trim().toLowerCase() &&
    String(row.class_id ?? "") === selectedClassId;
  const { data: browserCandidates } = await admin
    .from("exam_candidates")
    .select("*")
    .eq("exam_id", exam.id)
    .eq("guest_key_hash", guestKeyHash);
  const existingCandidate = (browserCandidates ?? []).find(samePerson) ?? null;

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
    if (error || !data) {
      // The insert can only collide with the per-person-per-browser unique
      // index when the SAME person's record was created between the lookup
      // and the insert (a double-tap or two simultaneous tabs). Re-read and
      // resume the winning row so the operation is idempotent under
      // concurrency instead of failing the student with an infrastructure
      // error. Any other failure is reported as what it is — never as an
      // invalid code.
      const { data: raced } = await admin
        .from("exam_candidates")
        .select("*")
        .eq("exam_id", exam.id)
        .eq("guest_key_hash", guestKeyHash);
      const winner = (raced ?? []).find(samePerson) ?? null;
      if (!winner) return NextResponse.json({ error: "Could not create your candidate record." }, { status: 500 });
      candidate = winner;
    } else {
      candidate = data;
    }
  }

  // One candidate can now legitimately own several attempts (each authorized
  // retake is a NEW row). Resume the active one, otherwise evaluate the latest.
  const { data: attemptRows } = await admin
    .from("exam_attempts")
    .select("*")
    .eq("exam_id", exam.id)
    .eq("candidate_id", candidate.id)
    .order("attempt_number", { ascending: false });
  const rowsForCandidate = (attemptRows ?? []) as Record<string, unknown>[];
  const activeAttempt = rowsForCandidate.find((row) => row.status === "in_progress") ?? null;
  const latestAttempt = rowsForCandidate[0] ?? null;
  let attempt: Record<string, unknown> | null = activeAttempt;

  if (!attempt && latestAttempt) {
    // A submitted paper is locked. Only an explicit approval may create another
    // attempt; `read_only_reentry` merely lets the student view the result.
    const grant = await findUsableGrant(admin, exam.id, candidate.id);
    if (!grant) {
      if (attemptPolicy === "read_only_reentry") {
        const deadline = attemptDeadline(
          exam,
          String(latestAttempt.started_at ?? ""),
          Number(latestAttempt.extension_minutes ?? 0),
        );
        return NextResponse.json({
          attempt_id: latestAttempt.id,
          access_token: latestAttempt.access_token,
          exam_id: exam.id,
          title: exam.title,
          candidate_name: candidate.full_name,
          first_name: candidate.first_name ?? first_name,
          last_name: candidate.last_name ?? last_name,
          class_id: selectedClassId,
          status: latestAttempt.status,
          attempt_number: Number(latestAttempt.attempt_number ?? 1),
          deadline: deadline.toISOString(),
          proctoring: Boolean(examSettings.proctoring),
        });
      }
      return NextResponse.json(
        {
          error:
            "This attempt has already been submitted. Duplicate attempts are not permitted. You can request a retake from your submitted examination page; only a Super Admin approval authorizes another attempt.",
        },
        { status: 409 },
      );
    }
    if (exam.status !== "open" || (exam.ends_at && Date.parse(exam.ends_at) < Date.now()))
      return NextResponse.json(
        { error: "Your retake is approved, but the examination window is closed. Ask your institution to reopen or extend it." },
        { status: 403 },
      );
    const started = await startRetakeAttempt(admin, {
      exam,
      candidate: candidate as unknown as RetakeCandidateRow,
      grant,
    });
    if (!started.ok) return NextResponse.json({ error: started.error }, { status: 409 });
    return NextResponse.json({
      attempt_id: started.attempt.id,
      access_token: started.attempt.access_token,
      exam_id: exam.id,
      title: exam.title,
      candidate_name: candidate.full_name,
      first_name: candidate.first_name ?? first_name,
      last_name: candidate.last_name ?? last_name,
      class_id: selectedClassId,
      status: started.attempt.status,
      attempt_number: started.attemptNumber,
      deadline: attemptDeadline(exam, started.attempt.started_at, Number((started.attempt as { extension_minutes?: number }).extension_minutes ?? 0)).toISOString(),
      proctoring: Boolean(examSettings.proctoring),
    });
  }

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
    // The track comes from the candidate's class in the database, never from the browser.
    const decision = admissionTrack(trackSelectionEnabled(settings), classRow);
    if (!decision.ok) return NextResponse.json({ error: decision.error }, { status: 409 });
    const track = decision.track;
    const rows0 = exam.quiz_id ? await loadQuizQuestions(admin, exam.quiz_id) : [];
    const rows = track ? paperForTrack(rows0, track) : rows0;
    const ordered = settings.randomize_questions ? seededShuffle(rows, `${exam.id}:${candidate.id}`) : rows;
    const { data, error } = await admin
      .from("exam_attempts")
      .insert({
        exam_id: exam.id,
        candidate_id: candidate.id,
        question_order: ordered.map((r) => r.id),
        // Only sent for track-selection examinations, so examinations without it
        // never reference the exam_attempts.track column.
        ...(track ? { track } : {}),
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
    if (error || !data) {
      // uq_exam_attempts_one_active allows exactly one in_progress attempt per
      // candidate. Two simultaneous joins by the SAME person (double-tap, two
      // tabs) race here; the loser must resume the winner's attempt, not fail
      // with an infrastructure error.
      const { data: racedRows } = await admin
        .from("exam_attempts")
        .select("*")
        .eq("exam_id", exam.id)
        .eq("candidate_id", candidate.id)
        .order("attempt_number", { ascending: false });
      const racedActive = (racedRows ?? []).find((row) => row.status === "in_progress") ?? null;
      if (!racedActive) return NextResponse.json({ error: "Could not start your attempt." }, { status: 500 });
      attempt = racedActive;
    } else {
      attempt = data;
    }
    await admin.from("exam_candidates").update({ status: "in_progress" }).eq("id", candidate.id);
  }

  const finalAttempt = attempt;
  if (!finalAttempt) return NextResponse.json({ error: "Could not start your attempt." }, { status: 500 });
  const deadline = attemptDeadline(
    exam,
    String(finalAttempt.started_at ?? ""),
    Number(finalAttempt.extension_minutes ?? 0),
  );
  return NextResponse.json({
    attempt_id: finalAttempt.id,
    access_token: finalAttempt.access_token,
    exam_id: exam.id,
    title: exam.title,
    candidate_name: candidate.full_name,
    first_name: candidate.first_name ?? first_name,
    last_name: candidate.last_name ?? last_name,
    class_id: selectedClassId,
    status: finalAttempt.status,
    attempt_number: Number(finalAttempt.attempt_number ?? 1),
    deadline: deadline.toISOString(),
    proctoring: Boolean(examSettings.proctoring),
  });
}
