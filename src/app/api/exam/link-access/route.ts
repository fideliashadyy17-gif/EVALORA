import { attemptDeadline } from "@/lib/exam";
import {
  candidateNamesMatch,
  DUPLICATE_EXAM_CANDIDATE_MESSAGE,
} from "@/lib/candidateIdentity";
import { canonicalIdentityFingerprint } from "@/lib/examSaveQueue";
import { manualPauseMs } from "@/lib/examPause";
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
import { loadQuizQuestions, randomizeQuestionRows } from "@/lib/live";
import {
  buildLockdownLaunchUrl,
  parseLockdownSettings,
  verifyLockdownAttestation,
  type LockdownAttestationPayload,
} from "@/lib/lockdown";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { genCode } from "@/lib/utils";
import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

const Body = z.object({
  invite_token: z.string().uuid().optional(),
  access_code: z.string().min(4).max(32),
  first_name: z.string().trim().min(1).max(80),
  last_name: z.string().trim().min(1).max(80),
  class_id: z.string().uuid().optional(),
  class_name: z.string().trim().max(80).optional(),
  guest_key: z.string().min(16).max(120),
  identity: z.record(z.string(), z.unknown()).optional(),
  ignore_auth_session: z.boolean().optional(),
  consent: z.literal(true),
});

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function normalizeCode(value: string) {
  return value.trim().toUpperCase();
}

function normalizePersonToken(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function matchesPersonName(
  row: { first_name?: unknown; last_name?: unknown; full_name?: unknown },
  firstName: string,
  lastName: string,
): boolean {
  const f = normalizePersonToken(firstName);
  const l = normalizePersonToken(lastName);
  const rowFirst = normalizePersonToken(row.first_name);
  const rowLast = normalizePersonToken(row.last_name);
  if (rowFirst && rowLast) return rowFirst === f && rowLast === l;
  const full = normalizePersonToken(row.full_name);
  return Boolean(full) && full === `${f} ${l}`.trim();
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
  const { invite_token, access_code, first_name, last_name, guest_key, class_id, class_name, identity, ignore_auth_session } = parsed.data;
  const admin = createAdminClient();
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let exam: any = null;
  if (invite_token) {
    const { data } = await admin
      .from("exams")
      .select("*")
      .eq("invite_token", invite_token)
      .maybeSingle();
    exam = data;
  }
  if (!exam && access_code) {
    const normalized = normalizeCode(access_code);
    const { data: byCode } = await admin
      .from("exams")
      .select("*")
      .eq("access_code", normalized)
      .maybeSingle();
    exam = byCode;
    if (!exam) {
      const { data: byHash } = await admin
        .from("exams")
        .select("*")
        .eq("access_code_hash", sha256(normalized))
        .maybeSingle();
      exam = byHash;
    }
    if (!exam) {
      const { data: codedExams } = await admin
        .from("exams")
        .select("*")
        .not("access_code", "is", null);
      exam =
        ((codedExams ?? []) as Record<string, unknown>[]).find((row) =>
          accessCodeMatches(normalized, row.access_code as string | null),
        ) ?? null;
    }
  }

  if (!exam)
    return NextResponse.json({ error: "Examination not found. Please check your access code." }, { status: 404 });

  if (exam.deleted_at || (exam.settings as Record<string, unknown> | null)?.archived)
    return NextResponse.json({ error: "This examination has been archived or removed and is no longer accessible." }, { status: 410 });

  const effectiveInviteToken = (exam.invite_token as string) || invite_token || "";
  const entryHref = effectiveInviteToken ? `/exam/join/${effectiveInviteToken}` : "/exam-access";

  const examSettings = (exam.settings ?? {}) as Record<string, unknown>;
  const lockdown = parseLockdownSettings(examSettings.lockdown);

  let lockdownVerified = false;
  let lockdownPlatform: string | null = null;
  let lockdownAppVersion: string | null = null;

  if (lockdown.enabled && lockdown.require_app) {
    // The request body is the only attestation source. User-Agent, custom
    // headers, URL parameters and browser storage are all client-controlled and
    // must never substitute for a cryptographically valid desktop assertion.
    const rawAttestation =
      (identity as { lockdown_attestation?: Partial<LockdownAttestationPayload> } | undefined)?.lockdown_attestation;

    const verification = verifyLockdownAttestation(rawAttestation, access_code, {
      minVersion: lockdown.min_app_version,
      storedExamCode: exam.access_code as string | null,
    });

    if (!verification.verified) {
      return NextResponse.json(
        {
          error: "This examination requires the EVALORA Secure Exam Application. Standard web browsers are not permitted.",
          lockdown_required: true,
          lockdown_reason: verification.reason,
          exam_id: exam.id,
          exam_title: exam.title,
          download_url: "/download/secure-browser",
          launch_url: buildLockdownLaunchUrl({
            token: effectiveInviteToken || undefined,
            path: entryHref,
            examCode: access_code,
          }),
        },
        { status: 403 },
      );
    }

    lockdownVerified = true;
    lockdownPlatform = verification.platform ?? null;
    lockdownAppVersion = verification.app_version ?? null;
  }

  const access = parseExamAccessSettings(examSettings);
  const identityResult = sanitizeIdentityData(access.identityFields, identity);
  if (!identityResult.ok)
    return NextResponse.json({ error: identityResult.error }, { status: 400 });
  const identityData = identityResult.data;

  const rawGuestKeyHash = sha256(guest_key);
  const identityFingerprint = canonicalIdentityFingerprint(identityData);
  const guestKeyHash = identityFingerprint
    ? sha256(`${guest_key}::id:${identityFingerprint}`)
    : rawGuestKeyHash;
  const candidateKeyHashes =
    guestKeyHash === rawGuestKeyHash
      ? [rawGuestKeyHash]
      : [guestKeyHash, rawGuestKeyHash];

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
  // A paused examination is a temporary organizer hold, not a closed link:
  // the candidate identity flow below still runs, and the attempt branch
  // decides — resuming an active attempt is allowed, starting a new one is
  // refused until the organizer resumes.
  const examPaused = exam.status === "paused" && availability.reason === "exam_paused";
  if (!availability.ok && !examPaused) {
    // Shared-browser safe: multiple sequential students can share a browser
    // guest_key_hash, so select all rows for this browser and match the exact
    // person (never `.maybeSingle()`, which fails once 2+ students used the
    // same browser).
    const { data: existingRows } =
      candidateKeyHashes.length === 1
        ? await admin
            .from("exam_candidates")
            .select("*")
            .eq("exam_id", exam.id)
            .eq("guest_key_hash", rawGuestKeyHash)
        : await admin
            .from("exam_candidates")
            .select("*")
            .eq("exam_id", exam.id)
            .in("guest_key_hash", candidateKeyHashes);
    const existingByPerson = ((existingRows ?? []) as Record<string, unknown>[]).find(
      (row) =>
        matchesPersonName(row, first_name, last_name) &&
        (!class_id || !row.class_id || String(row.class_id) === class_id) &&
        (Object.keys((row.identity_data ?? {}) as Record<string, unknown>).length === 0 ||
          identityDataEqual((row.identity_data ?? {}) as Record<string, unknown>, identityData)),
    ) ?? null;
    if (!existingByPerson)
      return NextResponse.json({ error: availability.error }, { status: 403 });
    retakeGrant = await findUsableGrant(admin, exam.id, String(existingByPerson.id));
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
  // I/1 confusion from a touch keyboard — are still accepted. If an organizer
  // issued personal candidate access codes on the roster (`source !== "shared_link"`),
  // a student entering their own personal candidate code + matching name on
  // this invitation link is also admitted cleanly.
  const examCodeAccepted =
    exam.access_code_hash === sha256(normalizeCode(access_code)) ||
    accessCodeMatches(access_code, exam.access_code as string | null);
  let matchedRosterCandidate: Record<string, unknown> | null = null;
  if (!examCodeAccepted) {
    const { data: rosterRows } = await admin
      .from("exam_candidates")
      .select("*")
      .eq("exam_id", exam.id);
    const codeHit = ((rosterRows ?? []) as Record<string, unknown>[]).find(
      (row) => row.source !== "shared_link" && accessCodeMatches(access_code, (row.access_code as string | null) ?? null),
    ) ?? null;
    if (!codeHit) {
      return NextResponse.json(
        {
          error:
            "That access code does not match this examination. Copy-paste the code exactly as your teacher gave it, or reopen the invitation link — it fills the code in for you.",
        },
        { status: 403 },
      );
    }
    if (!matchesPersonName(codeHit, first_name, last_name)) {
      return NextResponse.json(
        {
          error:
            "That personal candidate code belongs to a different student record. Check your first name, last name, and personal access code.",
        },
        { status: 403 },
      );
    }
    matchedRosterCandidate = codeHit;
  }

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

  // If no specific eligible classes were configured, fall back to all classes in the organization
  if (eligibleClasses.size === 0 && exam.organization_id) {
    const { data: orgClasses } = await admin
      .from("classes")
      .select("id")
      .eq("organization_id", exam.organization_id);
    for (const c of orgClasses ?? []) {
      eligibleClasses.add(c.id as string);
    }
  }

  let selectedClassId = class_id ?? null;
  if (!selectedClassId && class_name) {
    const { data: orgClasses } = await admin
      .from("classes")
      .select("id, name")
      .eq("organization_id", exam.organization_id);
    const found = (orgClasses ?? []).find(
      (c) => c.name.toLowerCase().trim() === class_name.toLowerCase().trim(),
    );
    if (found) selectedClassId = found.id as string;
  }
  if (!selectedClassId && eligibleClasses.size === 1) {
    selectedClassId = [...eligibleClasses][0];
  }
  if (!selectedClassId && exam.class_id) {
    selectedClassId = exam.class_id as string;
  }

  if (!selectedClassId || (!eligibleClasses.has(selectedClassId) && eligibleClasses.size > 0))
    return NextResponse.json({ error: "Select an eligible class for this examination." }, { status: 403 });
  const { data: classRow } = await admin
    .from("classes")
    .select("id,organization_id,curriculum_track")
    .eq("id", selectedClassId)
    .maybeSingle();
  if (!classRow || classRow.organization_id !== exam.organization_id)
    return NextResponse.json({ error: "That class does not belong to this examination." }, { status: 403 });

  // Reliable identity: only an authenticated user with a student record in
  // this organization may be linked to the student roster. On a shared device
  // (`accessMode === "shared_link"`), a lingering browser cookie from a
  // previous student must NEVER bind `student_id` to a different student or
  // reject the next student's class selection.
  let studentId: string | null = null;
  let verifiedClassId: string | null = null;
  const { data: auth } = await supabase.auth.getUser();
  if (auth.user && !ignore_auth_session) {
    const { data: student } = await admin
      .from("students")
      .select("id,full_name")
      .eq("user_id", auth.user.id)
      .eq("organization_id", exam.organization_id)
      .maybeSingle();
    if (student) {
      const { data: enrollment } = await admin
        .from("student_enrollments")
        .select("class_id")
        .eq("student_id", student.id)
        .eq("status", "active")
        .maybeSingle();
      verifiedClassId = (enrollment?.class_id as string | null) ?? null;

      if (access.accessMode === "registered_students_only") {
        studentId = student.id as string;
        if (verifiedClassId && verifiedClassId !== selectedClassId)
          return NextResponse.json({ error: "Your verified class is not eligible for this examination." }, { status: 403 });
      } else if (
        matchesPersonName({ full_name: student.full_name }, first_name, last_name) &&
        (!verifiedClassId || verifiedClassId === selectedClassId)
      ) {
        studentId = student.id as string;
      }
    }
  }

  // Registered-student-only examinations keep the institutional restriction:
  // a valid link and code alone are not sufficient authorization.
  if (access.accessMode === "registered_students_only" && (!auth.user || ignore_auth_session || !studentId || verifiedClassId !== selectedClassId))
    return NextResponse.json(
      { error: "This examination requires a verified student account in an eligible class. Sign in with your institutional account." },
      { status: 401 },
    );

  // One candidate PER PERSON PER BROWSER — never one per browser. A shared
  // device (lab, tablet cart, family phone) must admit every distinct
  // authorized student, while the same student on the same browser always
  // resumes their own record (`uq_exam_candidate_shared_identity`). When custom
  // organizer identification fields (`identity_fields`, e.g. student ID /
  // matricule / email) are present, `guestKeyHash` incorporates their canonical
  // fingerprint so even two students with the exact same full name in the same
  // class on the same browser get distinct candidate rows without browser conflict errors.
  const samePerson = (row: Record<string, unknown>) =>
    normalizePersonToken(row.first_name) === normalizePersonToken(first_name) &&
    normalizePersonToken(row.last_name) === normalizePersonToken(last_name) &&
    String(row.class_id ?? "") === selectedClassId;

  let candidateRow: Record<string, unknown> | null = matchedRosterCandidate;
  if (candidateRow) {
    if (candidateRow.class_id && String(candidateRow.class_id) !== selectedClassId) {
      return NextResponse.json(
        { error: "Selected class does not match your registered candidate record for this examination." },
        { status: 403 },
      );
    }
  } else {
    const { data: browserCandidates } =
      candidateKeyHashes.length === 1
        ? await admin
            .from("exam_candidates")
            .select("*")
            .eq("exam_id", exam.id)
            .eq("guest_key_hash", rawGuestKeyHash)
        : await admin
            .from("exam_candidates")
            .select("*")
            .eq("exam_id", exam.id)
            .in("guest_key_hash", candidateKeyHashes);

    const candidateList = (browserCandidates ?? []) as Record<string, unknown>[];
    const exactMatch =
      candidateList.find(
        (row) => samePerson(row) && identityDataEqual((row.identity_data ?? {}) as Record<string, unknown>, identityData),
      ) ??
      candidateList.find(
        (row) =>
          samePerson(row) &&
          Object.keys((row.identity_data ?? {}) as Record<string, unknown>).length === 0,
      ) ??
      null;

    candidateRow = exactMatch;

    // Cross-device duplicate protection. A browser with no matching candidate
    // record must not create a second participation under a name that already
    // exists for THIS examination. A stronger identifier may still adopt the
    // original record: a verified student account (student_id) or the matching
    // organizer-defined identity fields (e.g. student ID / matricule / email).
    if (!candidateRow) {
      const { data: examCandidates } = await admin
        .from("exam_candidates")
        .select("*")
        .eq("exam_id", exam.id);
      const rowsForExam = (examCandidates ?? []) as Record<string, unknown>[];
      const byStudent = studentId
        ? rowsForExam.find((row) => String(row.student_id ?? "") === studentId) ?? null
        : null;
      const namedRows = rowsForExam.filter((row) =>
        candidateNamesMatch(
          { first_name: row.first_name, last_name: row.last_name, full_name: row.full_name },
          { first_name, last_name },
        ),
      );
      const namedWithIdentity = namedRows.find((row) => {
        if (row.class_id && String(row.class_id) !== selectedClassId) return false;
        const stored = (row.identity_data ?? {}) as Record<string, unknown>;
        return Object.keys(stored).length > 0 && identityDataEqual(stored, identityData);
      }) ?? null;

      if (byStudent) {
        if (!candidateNamesMatch(
          { first_name: byStudent.first_name, last_name: byStudent.last_name, full_name: byStudent.full_name },
          { first_name, last_name },
        )) {
          return NextResponse.json(
            {
              error: "This student account has already joined this examination under a different name. Ask your institution to correct the candidate record before starting a new participation.",
            },
            { status: 409 },
          );
        }
        candidateRow = byStudent;
      } else if (namedWithIdentity) {
        candidateRow = namedWithIdentity;
      } else if (namedRows.length > 0) {
        // Organizer-defined identification fields disambiguate genuine
        // homonyms: two students with the same printed name but different
        // student numbers are different people. Only allow the new row when
        // EVERY existing same-name row has a non-empty identity and the new
        // identity differs from all of them. A name-only retry (or a retry
        // carrying the same identity) still resumes/refuses the original.
        const hasNewIdentity = Object.keys(identityData).length > 0;
        const allExistingDistinct = namedRows.every((row) => {
          const stored = (row.identity_data ?? {}) as Record<string, unknown>;
          return (
            Object.keys(stored).length > 0 &&
            !identityDataEqual(stored, identityData)
          );
        });
        if (!hasNewIdentity || !allExistingDistinct) {
          return NextResponse.json({ error: DUPLICATE_EXAM_CANDIDATE_MESSAGE }, { status: 409 });
        }
      }
    }

    if (candidateRow) {
      const storedIdentity = (candidateRow.identity_data ?? {}) as Record<string, unknown>;
      if (!identityDataEqual(storedIdentity, identityData) && Object.keys(storedIdentity).length === 0) {
        const { data: updated } = await admin
          .from("exam_candidates")
          .update({ identity_data: identityData })
          .eq("id", candidateRow.id)
          .select("*")
          .single();
        if (updated) candidateRow = updated;
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
          invite_token: effectiveInviteToken || null,
          source: "shared_link",
          identity_data: identityData,
        })
        .select("*")
        .single();
      if (error || !data) {
        // The database trigger is the race-safe backstop: another tab/device
        // inserted this name between our lookup and this insert. Never turn
        // that into an infrastructure error or a second attempt.
        if (`${error?.message ?? ""} ${error?.details ?? ""}`.includes("EXAM_CANDIDATE_DUPLICATE_NAME")) {
          return NextResponse.json({ error: DUPLICATE_EXAM_CANDIDATE_MESSAGE }, { status: 409 });
        }
        const { data: raced } = await admin
          .from("exam_candidates")
          .select("*")
          .eq("exam_id", exam.id)
          .eq("guest_key_hash", guestKeyHash);
        const winner = ((raced ?? []) as Record<string, unknown>[]).find(samePerson) ?? null;
        if (!winner) return NextResponse.json({ error: "Could not create your candidate record." }, { status: 500 });
        candidateRow = winner;
      } else {
        candidateRow = data;
      }
    }
  }

  if (!candidateRow) {
    return NextResponse.json({ error: "Could not resolve your candidate record." }, { status: 500 });
  }
  const candidate = candidateRow as { id: string; [key: string]: unknown };
  const resolvedCandidate = candidate;

  // One candidate can now legitimately own several attempts (each authorized
  // retake is a NEW row). Resume the active one, otherwise evaluate the latest.
  const { data: attemptRows } = await admin
    .from("exam_attempts")
    .select("*")
    .eq("exam_id", exam.id)
    .eq("candidate_id", resolvedCandidate.id)
    .order("attempt_number", { ascending: false });
  const rowsForCandidate = (attemptRows ?? []) as Record<string, unknown>[];
  const activeAttempt = rowsForCandidate.find((row) => row.status === "in_progress") ?? null;
  const latestAttempt = rowsForCandidate[0] ?? null;
  let attempt: Record<string, unknown> | null = activeAttempt;

  // Paused examination gate: only an active attempt may be resumed.
  if (exam.status === "paused" && !attempt)
    return NextResponse.json(
      { error: "This examination has been paused by the organizer and is not accepting entries right now. If you already started it, reopen this link with the same details to return to your saved attempt." },
      { status: 409 },
    );

  if (!attempt && latestAttempt) {
    // A submitted paper is locked. Only an explicit approval may create another
    // attempt; `read_only_reentry` merely lets the student view the result.
    const grant = retakeGrant ?? (await findUsableGrant(admin, exam.id, candidate.id));
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
          entry_href: entryHref,
          title: exam.title,
          candidate_name: resolvedCandidate.full_name,
          first_name: resolvedCandidate.first_name ?? first_name,
          last_name: resolvedCandidate.last_name ?? last_name,
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
      candidate: resolvedCandidate as unknown as RetakeCandidateRow,
      grant,
    });
    if (!started.ok) return NextResponse.json({ error: started.error }, { status: 409 });
    return NextResponse.json({
      attempt_id: started.attempt.id,
      access_token: started.attempt.access_token,
      exam_id: exam.id,
      entry_href: entryHref,
      title: exam.title,
      candidate_name: resolvedCandidate.full_name,
      first_name: resolvedCandidate.first_name ?? first_name,
      last_name: resolvedCandidate.last_name ?? last_name,
      class_id: selectedClassId,
      status: started.attempt.status,
      attempt_number: started.attemptNumber,
      deadline: attemptDeadline(exam, started.attempt.started_at, Number((started.attempt as { extension_minutes?: number }).extension_minutes ?? 0)).toISOString(),
      proctoring: Boolean(examSettings.proctoring),
    });
  }

  if (attempt) {
    const updates: Record<string, unknown> = {};
    if (!identityDataEqual(attempt.identity_data ?? {}, identityData)) {
      updates.identity_data = identityData;
    }
    if (lockdownVerified && !attempt.lockdown_verified) {
      updates.lockdown_verified = true;
      updates.lockdown_platform = lockdownPlatform;
      updates.lockdown_app_version = lockdownAppVersion;
      updates.lockdown_verified_at = new Date().toISOString();
    }
    if (Object.keys(updates).length > 0) {
      const { data: updatedAttempt } = await admin
        .from("exam_attempts")
        .update(updates)
        .eq("id", attempt.id)
        .select("*")
        .single();
      if (updatedAttempt) attempt = updatedAttempt;
    }
  }
  if (!attempt) {
    const settings = (exam.settings ?? {}) as Record<string, unknown>;
    // The track comes from the candidate's class in the database, never from the browser.
    const decision = admissionTrack(trackSelectionEnabled(settings), classRow);
    if (!decision.ok) return NextResponse.json({ error: decision.error }, { status: 409 });
    const track = decision.track;
    const rows0 = exam.quiz_id ? await loadQuizQuestions(admin, exam.quiz_id) : [];
    const rows = track ? paperForTrack(rows0, track) : rows0;
    const ordered = settings.randomize_questions ? randomizeQuestionRows(rows, `${exam.id}:${resolvedCandidate.id}`) : rows;
    const { data, error } = await admin
      .from("exam_attempts")
      .insert({
        exam_id: exam.id,
        candidate_id: resolvedCandidate.id,
        question_order: ordered.map((r) => r.id),
        // Only sent for track-selection examinations, so examinations without it
        // never reference the exam_attempts.track column.
        ...(track ? { track } : {}),
        first_name,
        last_name,
        class_id: selectedClassId,
        student_id: studentId,
        guest_key_hash: matchedRosterCandidate ? null : guestKeyHash,
        invite_token: effectiveInviteToken || null,
        identity_data: identityData,
        ...(lockdownVerified
          ? {
              lockdown_verified: true,
              lockdown_platform: lockdownPlatform,
              lockdown_app_version: lockdownAppVersion,
              lockdown_verified_at: new Date().toISOString(),
            }
          : {}),
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
        .eq("candidate_id", resolvedCandidate.id)
        .order("attempt_number", { ascending: false });
      const racedActive = (racedRows ?? []).find((row) => row.status === "in_progress") ?? null;
      if (!racedActive) return NextResponse.json({ error: "Could not start your attempt." }, { status: 500 });
      attempt = racedActive;
      if (lockdownVerified && !racedActive.lockdown_verified) {
        const { data: updatedRaced } = await admin
          .from("exam_attempts")
          .update({
            lockdown_verified: true,
            lockdown_platform: lockdownPlatform,
            lockdown_app_version: lockdownAppVersion,
            lockdown_verified_at: new Date().toISOString(),
          })
          .eq("id", racedActive.id)
          .select("*")
          .single();
        if (updatedRaced) attempt = updatedRaced;
      }
    } else {
      attempt = data;
    }
    await admin.from("exam_candidates").update({ status: "in_progress" }).eq("id", resolvedCandidate.id);
  }

  const finalAttempt = attempt;
  if (!finalAttempt) return NextResponse.json({ error: "Could not start your attempt." }, { status: 500 });
  // Pause-aware: a resumed attempt under an open manual pause echoes the
  // frozen deadline, never the raw one.
  const deadline = attemptDeadline(
    exam,
    String(finalAttempt.started_at ?? ""),
    Number(finalAttempt.extension_minutes ?? 0),
    manualPauseMs(finalAttempt as { pause_reasons?: string[] | null; paused_at?: string | null }, Date.now()),
  );
  return NextResponse.json({
    attempt_id: finalAttempt.id,
    access_token: finalAttempt.access_token,
    exam_id: exam.id,
    entry_href: entryHref,
    title: exam.title,
    candidate_name: resolvedCandidate.full_name,
    first_name: resolvedCandidate.first_name ?? first_name,
    last_name: resolvedCandidate.last_name ?? last_name,
    class_id: selectedClassId,
    status: finalAttempt.status,
    attempt_number: Number(finalAttempt.attempt_number ?? 1),
    deadline: deadline.toISOString(),
    proctoring: Boolean(examSettings.proctoring),
    lockdown_required: lockdown.enabled,
    lockdown_verified: Boolean(finalAttempt.lockdown_verified),
  });
}
