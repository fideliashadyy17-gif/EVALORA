import { Button, ButtonLink, Card, PageTitle, Select } from "@/components/ui";
import { ExportButton } from "@/components/ExportTools";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { toCsv } from "@/lib/utils";
import type { Metadata } from "next";
import { StudentsPanel, type StudentsSearchParams } from "../StudentsPanel";

export const metadata: Metadata = { title: "Student registration" };
export const dynamic = "force-dynamic";

const TEMPLATE = toCsv([
  ["full_name", "email", "student_ref", "gender", "date_of_birth", "guardian_name", "guardian_contact"],
]);

export default async function StudentRegistrationPage({
  searchParams,
}: {
  searchParams: Promise<StudentsSearchParams & { org?: string }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const admin = createAdminClient();
  const { data: orgs } = await admin.from("organizations").select("id, name, type").order("name").limit(500);
  const selected =
    (sp.org && (orgs ?? []).find((o) => o.id === sp.org)) ||
    (orgs ?? []).find((o) => o.type === "school") ||
    (orgs ?? [])[0];

  return (
    <>
      <PageTitle
        title="Individual & bulk student registration"
        subtitle="Register one student at a time or import a complete class roster. Students can be assigned to the current academic year and class during import."
        action={
          <div className="flex flex-wrap gap-2">
            <ExportButton filename="evalora-student-import-template.csv" csv={TEMPLATE} label="Download CSV template" />
            <ButtonLink href="/admin/students/access" variant="outline">Student access</ButtonLink>
          </div>
        }
      />

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <Card className="p-5">
          <span className="font-display text-2xl font-bold text-evergreen-600">1</span>
          <h2 className="mt-1 font-display font-semibold text-evergreen-950">Choose the institution</h2>
          <p className="mt-1 text-sm text-ink-soft">Registration is always organization-scoped so RLS, classes, competitions and examination candidate lists remain correctly separated.</p>
        </Card>
        <Card className="p-5">
          <span className="font-display text-2xl font-bold text-evergreen-600">2</span>
          <h2 className="mt-1 font-display font-semibold text-evergreen-950">Add or import students</h2>
          <p className="mt-1 text-sm text-ink-soft">Use <strong>full_name, email, student_ref, gender, date_of_birth, guardian_name, guardian_contact</strong>. Dates must be YYYY-MM-DD. Excel files can be saved as CSV before import.</p>
        </Card>
        <Card className="p-5">
          <span className="font-display text-2xl font-bold text-evergreen-600">3</span>
          <h2 className="mt-1 font-display font-semibold text-evergreen-950">Give access</h2>
          <p className="mt-1 text-sm text-ink-soft">Create linked student logins from Student Access, or register students directly into competitions and examinations using controlled access codes.</p>
        </Card>
      </div>

      {!selected ? (
        <p className="rounded-2xl border border-dashed border-evergreen-900/30 bg-paper px-6 py-12 text-center text-sm text-ink-soft">
          Create an organization before registering students.
        </p>
      ) : (
        <>
          <form method="get" className="mb-5 flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-evergreen-900">School / organization</span>
              <Select name="org" defaultValue={selected.id} className="min-w-[280px]">
                {(orgs ?? []).map((o) => (
                  <option key={o.id} value={o.id}>{o.name} ({o.type.replace(/_/g, " ")})</option>
                ))}
              </Select>
            </label>
            <Button type="submit" variant="outline">Open registration roster</Button>
          </form>

          <StudentsPanel
            organizationId={selected.id}
            back={`/admin/students/bulk?org=${selected.id}`}
            sp={sp}
            preserveParams={{ org: selected.id }}
          />
        </>
      )}
    </>
  );
}
