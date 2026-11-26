import { NextRequest, NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth";
import {
  isAttemptEligibleForPaperPdf,
  loadCandidatePaperForAttempt,
} from "@/lib/candidatePaper";
import { renderCandidateExamPaperPdf } from "@/lib/candidatePaperPdf";
import { isMypLearner } from "@/lib/mypAccess";
import { canOperate } from "@/lib/operationalAccess";
import { createAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
 * Strictly read-only teacher / administrator download endpoint for an
 * individual candidate's submitted examination paper PDF (ManageBac evidence).
 *
 * Security & tenant isolation:
 *  - Requires an active authenticated session (returns 401/403, never HTML redirect).
 *  - Super Admins may access across organizations.
 *  - Organization staff MUST hold a non-learner membership in the exam's exact
 *    organization AND satisfy `canOperate(ctx, exam.organization_id, "results.view", "exam_results")`.
 *  - Cross-tenant requests return 404 to prevent cross-school ID enumeration.
 *  - Strictly limited to submitted/completed attempts and uses the exact same
 *    candidate-safe PDF builder (zero answer keys, proctoring logs, or internal IDs).
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string; attemptId: string }> },
) {
  try {
    const { id: examId, attemptId } = await context.params;
    if (!UUID_RE.test(examId) || !UUID_RE.test(attemptId)) {
      return errorResponse(404, "Candidate examination attempt not found.");
    }

    const ctx = await getSessionContext();
    if (!ctx) {
      return errorResponse(401, "Authentication required.");
    }
    if (ctx.profile.status !== "active") {
      return errorResponse(403, "Account is not active.");
    }

    const admin = createAdminClient();
    const { data: exam, error: examError } = await admin
      .from("exams")
      .select("id, organization_id, deleted_at, settings")
      .eq("id", examId)
      .maybeSingle();

    if (examError || !exam) {
      return errorResponse(404, "Examination not found.");
    }

    const isSuperAdmin = ctx.profile.platform_role === "super_admin";
    if (!isSuperAdmin) {
      const orgId = String(exam.organization_id);
      const membership = ctx.memberships.find((m) => m.organization_id === orgId);
      if (!membership || isMypLearner(membership.role)) {
        // Uniform 404 for cross-tenant requests to prevent exam ID enumeration
        return errorResponse(404, "Examination not found.");
      }
      const allowed = await canOperate(ctx, orgId, "results.view", "exam_results");
      if (!allowed) {
        return errorResponse(403, "You do not have permission to download candidate papers for this organization.");
      }
    }

    const examSettings = (exam.settings ?? {}) as Record<string, unknown>;
    if (exam.deleted_at || examSettings.archived === true) {
      return errorResponse(410, "This examination has been archived or removed.");
    }

    const { data: attempt, error: attemptError } = await admin
      .from("exam_attempts")
      .select(
        "id, exam_id, candidate_id, student_id, class_id, question_order, status, started_at, submitted_at, score, max_score, attempt_number, first_name, last_name",
      )
      .eq("id", attemptId)
      .eq("exam_id", examId)
      .maybeSingle();

    if (attemptError || !attempt) {
      return errorResponse(404, "Candidate examination attempt not found.");
    }

    if (!isAttemptEligibleForPaperPdf(attempt.status)) {
      return errorResponse(
        409,
        "Candidate paper PDF can only be downloaded after the attempt has been submitted.",
      );
    }

    const loaded = await loadCandidatePaperForAttempt(admin, attempt as Record<string, unknown>);
    if (!loaded.ok) {
      if (loaded.reason === "archived") {
        return errorResponse(410, "This examination has been archived or removed.");
      }
      if (loaded.reason === "not_submitted") {
        return errorResponse(
          409,
          "Candidate paper PDF can only be downloaded after the attempt has been submitted.",
        );
      }
      if (loaded.reason === "not_found") {
        return errorResponse(404, "Candidate examination attempt not found.");
      }
      return errorResponse(500, "Could not prepare the candidate examination paper.");
    }

    const pdfBytes = await renderCandidateExamPaperPdf(loaded.data);
    const safeAscii = loaded.data.filename.replace(/["\\\r\n]/g, "_");
    const encoded = encodeURIComponent(safeAscii);

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safeAscii}"; filename*=UTF-8''${encoded}`,
        "Content-Length": String(pdfBytes.byteLength),
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  } catch (err) {
    console.error("[api/dashboard/exams/paper-pdf] generation error", err instanceof Error ? err.message : "unknown");
    return errorResponse(500, "Could not generate the candidate paper PDF right now. Please try again.");
  }
}
