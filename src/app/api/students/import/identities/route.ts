import { activeOrg, can, CREATOR_ROLES, getSessionContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { identityKey } from "@/lib/studentImport";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

/** Read only when an authorized creator requests an import preview, never as
 * part of ordinary roster navigation. Tenant comes exclusively from session. */
export async function GET() {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: "Sign in required." }, { status: 401, headers });
  const org = activeOrg(ctx);
  if (!org || (org.status !== "active" && ctx.profile.platform_role !== "super_admin") || ctx.tenantDenied || ctx.profile.status !== "active" || !can(ctx, org.id, CREATOR_ROLES)) {
    return NextResponse.json({ error: "You cannot preview imports in this workspace." }, { status: 403, headers });
  }
  const supabase = await createClient();
  const existing = { refs: [] as string[], emails: [] as string[], nameDob: [] as string[] };
  // Supabase's response row cap applies to each request. Explicit paging avoids
  // silently treating students beyond that cap as new identities.
  const pageSize = 1000;
  for (let page = 0; page <= 20; page++) {
    const { data, error } = await supabase.from("students")
      .select("id, full_name, email, student_ref, date_of_birth")
      .eq("organization_id", org.id).order("id")
      .range(page * pageSize, (page + 1) * pageSize - 1);
    if (error || !data) return NextResponse.json({ error: "Duplicate checks could not be loaded. Please retry." }, { status: 503, headers });
    if (page === 20 && data.length) return NextResponse.json({ error: "This roster exceeds the interactive preview limit. Contact support for an assisted import." }, { status: 413, headers });
    for (const student of data) {
      if (student.student_ref?.trim()) existing.refs.push(student.student_ref.trim().toLowerCase());
      if (student.email?.trim()) existing.emails.push(student.email.trim().toLowerCase());
      existing.nameDob.push(identityKey(student.full_name, student.date_of_birth));
    }
    if (data.length < pageSize) return NextResponse.json({ organization_id: org.id, existing }, { headers });
  }
  return NextResponse.json({ error: "Duplicate checks could not be completed." }, { status: 503, headers });
}
