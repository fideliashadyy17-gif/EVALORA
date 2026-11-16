import { describeMypScope, mypAccess, parseMypFilters, safeFilename } from "@/lib/mypAccess";
import { buildMypWorkbook } from "@/lib/mypExcel";
import { renderMypCollectivePdf, renderMypIndividualPdf } from "@/lib/mypPdf";
import { loadMypResult, loadMypResults } from "@/lib/mypResults";
import { summarizeMyp } from "@/lib/myp";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Authorised PDF and Excel exports of MYP results.
 *
 * The route never computes a result itself: it loads through `loadMypResults`
 * (same engine as every screen) and hands the rows to the renderer. Tenant
 * authorization is re-checked here even though the page that links here already
 * checked it: an export link must not be a way around the results page's scope.
 *
 *   /api/myp/export/pdf?scope=collective&org=…&year=2&exam=…
 *   /api/myp/export/pdf?scope=individual&attempt=…
 *   /api/myp/export/xlsx?scope=collective&class=Grade%207%20—%20MYP%202
 *   /api/myp/export/xlsx?scope=individual&attempt=…
 *
 * A learner may only export their own RELEASED result.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ format: string }> },
) {
  const { format } = await context.params;
  if (format !== "pdf" && format !== "xlsx") {
    return new Response("Unsupported export format. Use pdf or xlsx.", { status: 404 });
  }

  const url = new URL(request.url);
  const scope = url.searchParams.get("scope") === "individual" ? "individual" : "collective";
  const attemptId = url.searchParams.get("attempt");

  try {
    const access = await mypAccess({ global: true });
    const learner = !access.isSuperAdmin && !access.canExport;

    if (scope === "individual") {
      if (!attemptId) return new Response("An attempt id is required for an individual report.", { status: 400 });

      if (learner) {
        // Students read only their own released result, and only through an
        // explicit student link — never by name or by guessing an attempt id.
        // Candidate-facing RLS deliberately does not expose `students`, so the
        // profile→student mapping is resolved with the service client and is
        // always constrained to the learner's active organization.
        if (!access.org) return new Response("Not authorised for this result.", { status: 403 });
        const admin = createAdminClient();
        const { data: student } = await admin
          .from("students")
          .select("id")
          .eq("user_id", access.ctx.profile.id)
          .eq("organization_id", access.org.id)
          .maybeSingle();
        if (!student) return new Response("Not authorised for this result.", { status: 403 });
        const result = await loadMypResult(admin, {
          attemptId,
          organizationIds: [access.org.id],
          studentId: student.id as string,
          includeUnpublished: false,
        });
        if (!result) return new Response("That result is not available.", { status: 404 });
        const pdf = await renderMypIndividualPdf(result);
        return new Response(Uint8Array.from(pdf), {
          headers: pdfHeaders(`evalora-myp-${safeFilename(result.studentName)}-${safeFilename(result.examTitle)}.pdf`),
        });
      }

      if (!access.canExport) return new Response("Not authorised to export results.", { status: 403 });
      const supabase = await createClient();
      const result = await loadMypResult(supabase, {
        attemptId,
        organizationIds: access.organizationIds,
      });
      if (!result) return new Response("That result is not in your organization's scope.", { status: 404 });

      if (format === "pdf") {
        const pdf = await renderMypIndividualPdf(result);
        return new Response(Uint8Array.from(pdf), {
          headers: pdfHeaders(`evalora-myp-${safeFilename(result.studentName)}-${safeFilename(result.examTitle)}.pdf`),
        });
      }
      const workbook = buildMypWorkbook([result], summarizeMyp([result]), {
        fileTitle: "Individual MYP result",
        scope: `${result.studentName} · ${result.examTitle}`,
      });
      return new Response(Uint8Array.from(workbook), {
        headers: xlsxHeaders(`evalora-myp-${safeFilename(result.studentName)}-${safeFilename(result.examTitle)}.xlsx`),
      });
    }

    // ── Collective exports ────────────────────────────────────────────
    if (!access.canExport) {
      return new Response("Not authorised to export collective results.", { status: 403 });
    }
    const filters = parseMypFilters(
      {
        org: url.searchParams.get("org") ?? undefined,
        exam: url.searchParams.get("exam") ?? undefined,
        class: url.searchParams.get("class") ?? undefined,
        subject: url.searchParams.get("subject") ?? undefined,
        year: url.searchParams.get("year") ?? undefined,
        criterion: url.searchParams.get("criterion") ?? undefined,
        status: url.searchParams.get("status") ?? undefined,
        from: url.searchParams.get("from") ?? undefined,
        to: url.searchParams.get("to") ?? undefined,
        q: url.searchParams.get("q") ?? undefined,
      },
      access,
    );

    const supabase = await createClient();
    const dataset = await loadMypResults(supabase, filters);
    const scopeLabel = describeMypScope(
      {
        org: url.searchParams.get("org") ?? undefined,
        year: url.searchParams.get("year") ?? undefined,
        class: url.searchParams.get("class") ?? undefined,
        subject: url.searchParams.get("subject") ?? undefined,
        exam: url.searchParams.get("exam") ?? undefined,
        status: url.searchParams.get("status") ?? undefined,
        from: url.searchParams.get("from") ?? undefined,
        to: url.searchParams.get("to") ?? undefined,
      },
      dataset,
    );

    if (format === "pdf") {
      const title = filters.examId
        ? dataset.results[0]?.examTitle ?? "Examination results"
        : filters.className
          ? `MYP results — ${filters.className}`
          : filters.mypYear
            ? `MYP ${filters.mypYear} results`
            : access.isSuperAdmin && dataset.results.length
              ? "MYP results — all organizations"
              : "MYP results";
      const pdf = await renderMypCollectivePdf({
        title,
        scope: `${scopeLabel} · ${dataset.results.length} result${dataset.results.length === 1 ? "" : "s"} · generated by ${access.ctx.profile.email}`,
        results: dataset.results,
        analytics: dataset.analytics,
      });
      return new Response(Uint8Array.from(pdf), {
        headers: pdfHeaders(`evalora-myp-collective-${safeFilename(title)}.pdf`),
      });
    }

    const workbook = buildMypWorkbook(dataset.results, dataset.analytics, {
      fileTitle: "MYP collective results",
      scope: scopeLabel,
    });
    return new Response(Uint8Array.from(workbook), {
      headers: xlsxHeaders(`evalora-myp-results-${safeFilename(scopeLabel)}.xlsx`),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Export failed.";
    return new Response(`The MYP export could not be generated: ${message}`, { status: 500 });
  }
}

function pdfHeaders(filename: string): HeadersInit {
  return {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "private, no-store",
  };
}

function xlsxHeaders(filename: string): HeadersInit {
  return {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "private, no-store",
  };
}
