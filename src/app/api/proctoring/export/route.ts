import { activeOrg, can, getSessionContext, PROCTOR_ROLES } from "@/lib/auth";
import { isUuid, loadReviewHistory, reviewHistoryCsv } from "@/lib/proctoring";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * Audit-history export for one workspace.
 *
 * Authorization is resolved from the verified session and the active workspace:
 * the organization is never taken from the query string, so a caller cannot
 * export another tenant's review history by editing the URL. Row-level security
 * applies as a second layer because the request uses the session client.
 */
export const dynamic = "force-dynamic";

const isoDay = (value: string | null) => (value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null);

export async function GET(request: Request) {
  const ctx = await getSessionContext();
  if (!ctx || ctx.profile.status !== "active")
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const org = activeOrg(ctx);
  if (!org) return NextResponse.json({ error: "No active workspace." }, { status: 403 });
  if (!can(ctx, org.id, PROCTOR_ROLES))
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const url = new URL(request.url);
  const supabase = await createClient();

  const rows = await loadReviewHistory(supabase, {
    organizationId: org.id,
    examId: url.searchParams.get("exam"),
    candidateId: url.searchParams.get("candidate"),
    decision: url.searchParams.get("decision"),
    source: url.searchParams.get("source"),
    from: isoDay(url.searchParams.get("from")) ? `${url.searchParams.get("from")}T00:00:00.000Z` : null,
    to: isoDay(url.searchParams.get("to")) ? `${url.searchParams.get("to")}T23:59:59.999Z` : null,
    limit: 500,
  });

  // Sensitive administrative action: record who exported what.
  await supabase.from("audit_logs").insert({
    actor_id: ctx.user.id,
    organization_id: org.id,
    action: "proctoring.review_history_exported",
    entity: "proctoring_incident_reviews",
    entity_id: org.id,
    metadata: {
      rows: rows.length,
      exam_id: isUuid(url.searchParams.get("exam")) ? url.searchParams.get("exam") : null,
      candidate_id: isUuid(url.searchParams.get("candidate")) ? url.searchParams.get("candidate") : null,
      decision: url.searchParams.get("decision"),
      from: url.searchParams.get("from"),
      to: url.searchParams.get("to"),
    },
  });

  const csv = reviewHistoryCsv(rows);
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(`\uFEFF${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="proctoring-review-${org.slug}-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
