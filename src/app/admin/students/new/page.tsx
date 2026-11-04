import { Button, ButtonLink, Card, Field, Input, PageTitle, Select, Textarea } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { saveStudent } from "../../actions/academics";
import { Notice } from "../../ui";

export const metadata: Metadata = { title: "Register student" };
export const dynamic = "force-dynamic";

export default async function NewStudentPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; e?: string }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const admin = createAdminClient();
  const { data: orgs } = await admin.from("organizations").select("id, name, type").order("name").limit(500);
  const selectedOrg = (sp.org && (orgs ?? []).find((o) => o.id === sp.org)) || (orgs ?? []).find((o) => o.type === "school") || (orgs ?? [])[0];
  // Classes are loaded for the selected school ONLY (plus its years) —
  // a class from another school can never be picked here.
  const { data: classes } = selectedOrg
    ? await admin.from("classes").select("id, name, code, academic_years(name)").eq("organization_id", selectedOrg.id).eq("status", "active").order("name")
    : { data: [] };

  return (
    <>
      <PageTitle
        title="Register a student"
        subtitle="The student joins the school roster immediately. Add an email to also enable a login account later."
        action={<ButtonLink href="/admin/students" variant="outline">← Schools & students</ButtonLink>}
      />
      <Notice e={sp.e} messages={{ name: "Full name is required.", email: "That email looks invalid.", failed: "Student could not be registered.", class_org: "That class does not belong to the selected school." }} />
      {selectedOrg && (
        <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
          <Field label="1 · Choose the school (loads its classes & years)">
            <Select name="org" defaultValue={selectedOrg.id} className="min-w-[300px]">
              {(orgs ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </Select>
          </Field>
          <Button type="submit" variant="outline">Load school</Button>
          <ButtonLink href={`/admin/classes?org=${selectedOrg.id}`} variant="outline">Create / manage classes</ButtonLink>
        </form>
      )}
      <Card className="max-w-4xl p-6">
        <form action={saveStudent} className="grid gap-4 sm:grid-cols-3">
          <input type="hidden" name="back" value="/admin/students" />
          <input type="hidden" name="organization_id" value={selectedOrg?.id ?? ""} />
          <Field label="School / organization *">
            <Input value={selectedOrg?.name ?? "No organization"} disabled readOnly />
          </Field>
          <Field label="Full name *"><Input name="full_name" required /></Field>
          <Field label="Student reference"><Input name="student_ref" placeholder="STU-2026-001" /></Field>
          <Field label="Email"><Input name="email" type="email" /></Field>
          <Field label="Gender">
            <Select name="gender" defaultValue="">
              <option value="">—</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="other">Other</option>
            </Select>
          </Field>
          <Field label="Date of birth"><Input name="date_of_birth" type="date" /></Field>
          <Field label="Guardian name"><Input name="guardian_name" /></Field>
          <Field label="Guardian contact"><Input name="guardian_contact" /></Field>
          <Field label="Enroll in class" hint={(classes ?? []).length === 0 ? "This school has no active classes yet — create one from “Create / manage classes” above." : "Only this school's active classes, with their academic year."}>
            <Select name="class_id" defaultValue="">
              <option value="">— No class —</option>
              {(classes ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}{c.code ? ` (${c.code})` : ""} · {(c.academic_years as unknown as { name: string } | null)?.name ?? "no year"}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Notes" className="sm:col-span-3"><Textarea name="notes" rows={2} /></Field>
          <div className="sm:col-span-3">
            <Button type="submit" variant="gold">Register student</Button>
          </div>
        </form>
      </Card>
    </>
  );
}
