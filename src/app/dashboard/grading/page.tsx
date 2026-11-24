import { activeOrg, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isStaffRole } from "@/lib/navAccess";
import { PageTitle, Card } from "@/components/ui";
import { GradingSystemsClient } from "@/components/grading/GradingSystemsClient";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Grading Systems" };
export const dynamic = "force-dynamic";

/**
 * Grading Systems — the organization's configurable grading engine:
 * Beninese /20 with coefficients, custom letter/boundary rules, AP course
 * section weights, and MYP pointers (conversion data lives in MYP Results
 * settings). Systems are reusable and attachable per examination.
 */
export default async function GradingSystemsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; e?: string }>;
}) {
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  const sp = await searchParams;
  if (!isStaffRole(org.role)) redirect("/student");

  const supabase = await createClient();
  const [{ data: systems }, { data: subjects }] = await Promise.all([
    supabase
      .from("grading_systems")
      .select("*")
      .eq("organization_id", org.id)
      .order("curriculum")
      .order("name"),
    supabase.from("subjects").select("id, name").eq("organization_id", org.id).order("name"),
  ]);

  const isManager = ["owner", "admin"].includes(org.role);

  return (
    <div className="space-y-6">
      <PageTitle
        eyebrow="Assessment · Configurable Grading"
        title="Grading Systems"
        subtitle="Create reusable grading rules per curriculum — marks out of 20 with coefficients, letter boundaries, AP section weights, custom ranges — then attach one to any examination. Reference curricula stay separate from your own configurations."
      />
      {sp.ok === "saved" && (
        <p role="status" className="rounded-lg bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">
          Grading system saved.
        </p>
      )}
      {(sp.ok === "archived" || sp.ok === "restored") && (
        <p role="status" className="rounded-lg bg-evergreen-50 px-4 py-3 text-sm font-medium text-evergreen-900">
          Grading system {sp.ok === "archived" ? "archived" : "restored"}.
        </p>
      )}
      {sp.e && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-900">
          That grading system could not be saved ({sp.e}). Check the name, curriculum and rule values.
        </p>
      )}
      <Card className="p-6">
        <GradingSystemsClient
          systems={(systems ?? []) as Record<string, unknown>[]}
          subjects={(subjects ?? []) as { id: string; name: string }[]}
          canEdit={isManager}
        />
      </Card>
    </div>
  );
}
