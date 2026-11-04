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
  const [{ data: orgs }, { data: classes }] = await Promise.all([
    admin.from("organizations").select("id, name, type").order("name").limit(500),
    admin.from("classes").select("id, name, organization_id, organizations(name)").order("name").limit(1000),
  ]);

  return (
    <>
      <PageTitle
        title="Register a student"
        subtitle="The student joins the school roster immediately. Add an email to also enable a login account later."
        action={<ButtonLink href="/admin/students" variant="outline">← Schools & students</ButtonLink>}
      />
      <Notice e={sp.e} messages={{ name: "Full name is required.", email: "That email looks invalid.", failed: "Student could not be registered." }} />
      <Card className="max-w-4xl p-6">
        <form action={saveStudent} className="grid gap-4 sm:grid-cols-3">
          <input type="hidden" name="back" value="/admin/students" />
          <Field label="School / organization *">
            <Select name="organization_id" defaultValue={sp.org ?? ""}>
              {(orgs ?? []).map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </Select>
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
          <Field label="Enroll in class" hint="Classes are grouped by organization — pick one from the chosen school.">
            <Select name="class_id" defaultValue="">
              <option value="">— No class —</option>
              {(classes ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {(c.organizations as unknown as { name: string } | null)?.name}
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
