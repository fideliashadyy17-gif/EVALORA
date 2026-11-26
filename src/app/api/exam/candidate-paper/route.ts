import { NextRequest, NextResponse } from "next/server";
import { activeOrg, getSessionContext } from "@/lib/auth";
import {
  isAttemptEligibleForPaperPdf,
  loadCandidatePaperForAttempt,
} from "@/lib/candidatePaper";
import { renderCandidateExamPaperPdf } from "@/lib/candidatePaperPdf";
import { createAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function extractCandidateToken(request: NextRequest): string | null {
  const authHeader = request.headers.get("authorization") ?? "";
  if (/^Bearer\s+/i.test(authHeader)) {
    const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (bearer) return bearer;
  }
  const queryToken = request.nextUrl.searchParams.get("token")?.trim() ?? "";
  return queryToken || null;
}

function pdfResponse(bytes: Uint8Array, filename: string): NextResponse {
  const safeAscii = filename.replace(/["\\\r\n]/g, "_");
  const encoded = encodeURIComponent(safeAscii);
  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safeAscii}"; filename*=UTF-8''${encoded}`,
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

function errorResponse(status: number, message: string): NextResponse {
  return NextResponse.json(
    { error: message },
    {
      status,
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

/**
 * Strictly read-only candidate self-download endpoint for an individual
 * submitted examination paper PDF (ManageBac evidence).
 *
 * Authorization modes (strictly server-enforced — never trusts client candidateId):
 *  1. Candidate Link token (`Authorization: Bearer <access_token>` or `?token=<access_token>`):
 *     Bound cryptographically to ONE `exam_attempts.access_token`. If `attempt_id`
 *     is also passed, it MUST match the token's attempt or the request is rejected.
 *  2. Authenticated learner session (`?attempt_id=<uuid>` with no token):
 *     Requires an active signed-in user mapped via `students.user_id` inside the
 *     active organization, and requires `attempt.student_id` to belong to that user.
 */
export async function GET(request: NextRequest) {
  try {
    const token = extractCandidateToken(request);
    const attemptIdParam = request.nextUrl.searchParams.get("attempt_id")?.trim() ?? "";
    const admin = createAdminClient();

    let attemptRow: Record<string, unknown> | null = null;

    if (token) {
      // Path 1: Candidate Link token (128-bit UUID unique to one attempt)
      if (!UUID_RE.test(token)) {
        return errorResponse(404, "Examination paper link not found.");
      }
      if (attemptIdParam && !UUID_RE.test(attemptIdParam)) {
        return errorResponse(404, "Examination paper link not found.");
      }

      const { data: attempt, error } = await admin
        .from("exam_attempts")
        .select(
          "id, exam_id, candidate_id, student_id, class_id, question_order, status, started_at, submitted_at, score, max_score, attempt_number, first_name, last_name",
        )
        .eq("access_token", token)
        .maybeSingle();

      if (error || !attempt) {
        return errorResponse(404, "Examination paper link not found.");
      }
      // Anti-IDOR guard: if attempt_id was supplied alongside the token, it MUST match
      if (attemptIdParam && attempt.id !== attemptIdParam) {
        return errorResponse(404, "Examination paper link not found.");
      }
      attemptRow = attempt as Record<string, unknown>;
    } else {
      // Path 2: Signed-in learner self-download (?attempt_id=<uuid>)
      if (!attemptIdParam || !UUID_RE.test(attemptIdParam)) {
        return errorResponse(401, "Authorization required to download this examination paper.");
      }
      const ctx = await getSessionContext();
      if (!ctx) {
        return errorResponse(401, "Sign in or open your personal Candidate Link to download this paper.");
      }
      if (ctx.profile.status !== "active") {
        return errorResponse(403, "Account is not active.");
      }
      const org = activeOrg(ctx);
      if (!org) {
        return errorResponse(403, "No active organization context.");
      }

      const { data: studentRows } = await admin
        .from("students")
        .select("id")
        .eq("user_id", ctx.profile.id)
        .eq("organization_id", org.id);
      const studentIds = new Set((studentRows ?? []).map((r: { id: string }) => String(r.id)));
      if (studentIds.size === 0) {
        return errorResponse(403, "No linked candidate record for this account.");
      }

      const { data: attempt, error } = await admin
        .from("exam_attempts")
        .select(
          "id, exam_id, candidate_id, student_id, class_id, question_order, status, started_at, submitted_at, score, max_score, attempt_number, first_name, last_name",
        )
        .eq("id", attemptIdParam)
        .maybeSingle();

      if (error || !attempt || !attempt.student_id || !studentIds.has(String(attempt.student_id))) {
        return errorResponse(404, "Examination paper not found.");
      }

      // Enforce strict organization boundary
      const { data: examOrg } = await admin
        .from("exams")
        .select("organization_id")
        .eq("id", attempt.exam_id as string)
        .maybeSingle();
      if (!examOrg || examOrg.organization_id !== org.id) {
        return errorResponse(404, "Examination paper not found.");
      }

      attemptRow = attempt as Record<string, unknown>;
    }

    if (!isAttemptEligibleForPaperPdf(attemptRow.status)) {
      return errorResponse(
        403,
        "Your examination paper PDF becomes available once your examination has been submitted.",
      );
    }

    const loaded = await loadCandidatePaperForAttempt(admin, attemptRow);
    if (!loaded.ok) {
      if (loaded.reason === "not_submitted") {
        return errorResponse(
          403,
          "Your examination paper PDF becomes available once your examination has been submitted.",
        );
      }
      if (loaded.reason === "archived") {
        return errorResponse(410, "This examination is no longer available for download.");
      }
      if (loaded.reason === "not_found") {
        return errorResponse(404, "Examination paper not found.");
      }
      return errorResponse(500, "Could not prepare the examination paper right now. Please try again.");
    }

    const pdfBytes = await renderCandidateExamPaperPdf(loaded.data);
    return pdfResponse(pdfBytes, loaded.data.filename);
  } catch (err) {
    console.error("[api/exam/candidate-paper] generation error", err instanceof Error ? err.message : "unknown");
    return errorResponse(500, "Could not generate the examination paper PDF right now. Please try again.");
  }
}
