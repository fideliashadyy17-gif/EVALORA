import { Button, ButtonLink, PageTitle, Select } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import Link from "next/link";
import { ParticipantsTab } from "../[id]/tabs/ParticipantsTab";
import { StatusBadge } from "../../ui";

export const metadata: Metadata = { title: "Competition registration" };
export const dynamic = "force-dynamic";

export default async function CompetitionRegistrationPage({
  searchParams,
}: {
  searchParams: Promise<{ comp?: string; ok?: string; e?: string }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const admin = createAdminClient();
  const { data: comps } = await admin
    .from("competitions")
    .select("id, title, status, organization_id, session_id, organizations(name)")
    .order("created_at", { ascending: false })
    .limit(300);

  const selected =
    (sp.comp && (comps ?? []).find((c) => c.id === sp.comp)) ||
    (comps ?? []).find((c) => !["ended", "cancelled", "archived"].includes(c.status)) ||
    (comps ?? [])[0];

  return (
    <>
      <PageTitle
        title="Participant registration"
        subtitle="Register participants individually, import a CSV roster (Excel can be saved as CSV), or enroll an entire class. Registrations are persisted against the selected competition."
        action={<ButtonLink href="/admin/competitions/new" variant="gold">+ Create competition</ButtonLink>}
      />

      {!selected ? (
        <p className="rounded-2xl border border-dashed border-evergreen-900/30 bg-paper px-6 py-12 text-center text-sm text-ink-soft">
          No competitions exist yet. <Link href="/admin/competitions/new" className="font-semibold text-evergreen-700 underline underline-offset-2">Create one first</Link>.
        </p>
      ) : (
        <>
          <form method="get" className="mb-6 flex flex-wrap items-end gap-3">
            <label className="block min-w-[320px] flex-1">
              <span className="mb-1.5 block text-sm font-medium text-evergreen-900">Competition</span>
              <Select name="comp" defaultValue={selected.id}>
                {(comps ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.title} — {(c.organizations as unknown as { name?: string } | null)?.name} ({c.status})</option>
                ))}
              </Select>
            </label>
            <Button type="submit" variant="outline">Open registration desk</Button>
            <Link href={`/admin/competitions/${selected.id}`} className="pb-2 font-medium text-evergreen-700 underline-offset-2 hover:underline">Competition overview →</Link>
          </form>

          <div className="mb-5 flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold text-evergreen-950">{selected.title}</span>
            <StatusBadge status={selected.status} />
            <span className="text-ink-soft">Hosted by {(selected.organizations as unknown as { name?: string } | null)?.name}</span>
          </div>

          <ParticipantsTab
            comp={{ id: selected.id, organization_id: selected.organization_id, session_id: selected.session_id }}
            sp={sp}
          />
        </>
      )}
    </>
  );
}
