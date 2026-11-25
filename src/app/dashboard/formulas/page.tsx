import { activeOrg, requireUser } from "@/lib/auth";
import { canOperate } from "@/lib/operationalAccess";
import { createClient } from "@/lib/supabase/server";
import { getCapabilities, requireModule } from "@/lib/capabilities";
import { groupLibraryEntries, type FormulaLibraryEntry } from "@/lib/formulaLibrary";
import { PageTitle, Card } from "@/components/ui";
import { FormulaLibraryClient } from "@/components/formulas/FormulaLibraryClient";
import { isOperationalRole } from "@/lib/navAccess";
import { Sigma } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Formula Library" };
export const dynamic = "force-dynamic";

/**
 * Formula Library — the reusable formula sheet source for Mathematics,
 * Physics, Chemistry and every other subject. Teachers organize formulas by
 * subject → topic → chapter here, then attach the exact set they want to an
 * examination from the examination workspace (enable/disable is per exam).
 */
export default async function FormulasPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; e?: string }>;
}) {
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  const sp = await searchParams;
  if (!isOperationalRole(org.role)) redirect("/student");

  const [supabase, canEdit] = await Promise.all([
    createClient(),
    canOperate(ctx, org.id, "exams.edit", "examinations"),
  ]);
  const { entitlement } = await getCapabilities(supabase, ctx, org.id);
  requireModule(entitlement, "examinations", "/dashboard?e=module");
  const [{ data: subjects }, { data: rows }] = await Promise.all([
    supabase.from("subjects").select("id, name").eq("organization_id", org.id).order("name"),
    supabase
      .from("formula_library")
      .select("*")
      .eq("organization_id", org.id)
      .order("topic")
      .order("chapter")
      .order("title"),
  ]);

  const entries = (rows ?? []) as FormulaLibraryEntry[];
  const grouped = groupLibraryEntries(entries);

  return (
    <div className="space-y-6">
      <PageTitle
        eyebrow="Examinations · Reusable Reference"
        title="Formula Library"
        subtitle="Organize formulas by subject, topic and chapter once — then attach the exact set to any examination. Candidates see the attached sheet inside their paper without ever leaving the question."
      />
      {sp.ok && (
        <p role="status" className="rounded-lg bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">
          {sp.ok === "deleted" ? "Formula removed from the library." : "Formula saved to the library."}
        </p>
      )}
      {sp.e && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-900">
          That formula could not be saved ({sp.e}). Check the topic, title and LaTeX length and try again.
        </p>
      )}
      <Card className="p-6">
        <div className="mb-4 flex items-center gap-2.5 border-b border-evergreen-900/10 pb-3">
          <Sigma className="h-5 w-5 text-evergreen-700" aria-hidden="true" />
          <h2 className="font-display text-lg font-semibold text-evergreen-950">Library</h2>
          <span className="ml-auto text-xs font-medium text-ink-soft">{entries.length} formula(s)</span>
        </div>
        <FormulaLibraryClient
          subjects={(subjects ?? []) as { id: string; name: string }[]}
          grouped={grouped}
          canEdit={canEdit}
        />
      </Card>
    </div>
  );
}
