import { StaticPage } from "@/components/site/StaticPage";
import { Button, Card, Field, Input, Textarea } from "@/components/ui";
import { BRAND } from "@/lib/brand";
import { createAdminClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Contact" };

async function sendMessage(formData: FormData) {
  "use server";
  const name = String(formData.get("name") ?? "").slice(0, 120);
  const email = String(formData.get("email") ?? "").slice(0, 160);
  const subject = String(formData.get("subject") ?? "").slice(0, 160);
  const message = String(formData.get("message") ?? "").slice(0, 4000);
  if (!email.includes("@") || !subject || !message) redirect("/contact?error=1");
  const admin = createAdminClient();
  await admin.from("support_tickets").insert({ name, email, subject, message });
  redirect("/contact?sent=1");
}

export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const sp = await searchParams;
  return (
    <StaticPage
      eyebrow="Contact"
      title="Talk to the EVALORA team"
      intro={`Questions about plans, examinations at scale, or an institutional contract? Write to us — or email ${BRAND.supportEmail}.`}
    >
      <Card className="p-7">
        {sp.sent ? (
          <div className="rounded-xl bg-evergreen-50 p-5 text-evergreen-900">
            <p className="font-semibold">Message received.</p>
            <p className="mt-1 text-sm">Our team will reply to your email address. Thank you for reaching out.</p>
          </div>
        ) : (
          <form action={sendMessage} className="grid gap-4 sm:grid-cols-2">
            {sp.error && (
              <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800 sm:col-span-2">
                Please provide a valid email, a subject and a message.
              </p>
            )}
            <Field label="Your name">
              <Input name="name" required placeholder="Adaeze Okafor" />
            </Field>
            <Field label="Email">
              <Input name="email" type="email" required placeholder="you@school.edu" />
            </Field>
            <Field label="Subject" className="sm:col-span-2">
              <Input name="subject" required placeholder="Institutional plan for our university" />
            </Field>
            <Field label="Message" className="sm:col-span-2">
              <Textarea name="message" required rows={6} placeholder="Tell us about your organization and what you need…" />
            </Field>
            <div className="sm:col-span-2">
              <Button type="submit" variant="gold" className="px-6">Send message</Button>
            </div>
          </form>
        )}
      </Card>
    </StaticPage>
  );
}
