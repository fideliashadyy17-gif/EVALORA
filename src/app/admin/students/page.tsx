import { Button, ButtonLink, PageTitle, Select, StatCard } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { Building2, GraduationCap, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { StudentsPanel, type StudentsSearchParams } from "./StudentsPanel";

export const metadata: Metadata = { title: "Schools & Students" };
export const dynamic = "force-dynamic";

export default async function AdminStudents({
  searchParams,
}: {
  searchParams: Promise<StudentsSearchParams & { org?: string }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const admin = createAdminClient();

  const head = { count: "exact" as const, head: true };
  const [{ data: orgs }, schoolCount, studentTotal, classTotal] = await Promise.all([
    admin.from("organizations").select("id, name, type").order("name").limit(500),
    admin.from("organizations").select("id", head).eq("type", "school").then((r) => r.count ?? 0),
    admin.from("students").select("id", head).eq("status", "active").then((r) => r.count ?? 0),
    admin.from("classes").select("id", head).then((r) => r.count ?? 0),
  ]);

  const selected =
    (sp.org && (orgs ?? []).find((o) => o.id === sp.org)) ||
    (orgs ?? []).find((o) => o.type === "school") ||
    (orgs ?? [])[0];

  return (
    <>
      <PageTitle
        title="Schools & Students"
        subtitle="Run complete school environments: academic years, classes, rosters, imports and student accounts."
        action={<ButtonLink href="/admin/students/new" variant="gold">+ Register student</ButtonLink>}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Schools" value={schoolCount} icon={<Building2 className="h-5 w-5" />} />
        <StatCard label="Active students" value={studentTotal} icon={<GraduationCap className="h-5 w-5" />} />
        <StatCard label="Classes" value={classTotal} icon={<Users className="h-5 w-5" />} />
      </div>

      {!selected ? (
        <p className="rounded-2xl border border-dashed border-evergreen-900/30 bg-paper px-6 py-12 text-center text-sm text-ink-soft">
          Create a school first —{" "}
          <Link href="/admin/organizations/new" className="font-semibold text-evergreen-700 underline underline-offset-2">
            new organization
          </Link>
          .
        </p>
      ) : (
        <>
          <form method="get" className="mb-5 flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-evergreen-900">School / organization</span>
              <Select name="org" defaultValue={selected.id} className="min-w-[260px]">
                {(orgs ?? []).map((o) => (
                  <option key={o.id} value={o.id}>{o.name} ({o.type.replace(/_/g, " ")})</option>
                ))}
              </Select>
            </label>
            <Button type="submit" variant="outline">Open roster</Button>
            <Link
              href={`/admin/organizations/${selected.id}?tab=academics`}
              className="pb-2 text-sm font-medium text-evergreen-700 underline-offset-2 hover:underline"
            >
              Manage years, levels & classes →
            </Link>
          </form>

          <StudentsPanel
            organizationId={selected.id}
            back={`/admin/students?org=${selected.id}`}
            sp={sp}
            preserveParams={{ org: selected.id }}
          />
        </>
      )}
    </>
  );
}
