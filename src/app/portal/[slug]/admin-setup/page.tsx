import { AuthShell } from "@/components/AuthShell";
import { Button, Field, Input } from "@/components/ui";
import { MIN_INITIAL_PASSWORD_LENGTH } from "@/lib/organizationAccounts";
import { hashSetupCode, setupRecordState, setupStateMessage } from "@/lib/orgAdminSetup";
import { createAdminClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { provisionOrganizationAdmin } from "./actions";

export const metadata: Metadata = { title: "Institution administrator setup" };
export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  name: "Enter the administrator's full name.",
  email: "Enter a valid email address.",
  password: `Choose a stronger password — at least ${MIN_INITIAL_PASSWORD_LENGTH} characters with letters and numbers.`,
  confirm: "The two passwords do not match.",
  protected: "That email belongs to the EVALORA platform administrator and cannot be used here.",
  create_failed: "The account could not be created. Please try again or contact the EVALORA team.",
  membership_failed: "The account was created but could not be attached to the institution. Contact the EVALORA team.",
  organization: "This institution's portal is not currently available.",
  used: "This setup link has already been used.",
  expired: "This setup link has expired.",
  missing: "This setup link is not valid.",
};

/**
 * Public, one-time owner provisioning for a single institution.
 *
 * The page never shows the setup code back to the browser and never reveals
 * whether an email already exists in EVALORA — only the plain form, the
 * institution's name, and a specific error for an unusable link.
 */
export default async function OrganizationAdminSetupPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ code?: string; e?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const clean = String(slug ?? "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "");

  const admin = createAdminClient();
  const { data: org } = await admin
    .from("organizations")
    .select("id, name, slug, status, portal_enabled")
    .eq("slug", clean)
    .maybeSingle();
  if (!org) notFound();

  const code = String(sp.code ?? "").trim();
  let state = setupRecordState(null);
  if (code) {
    const { data: setup } = await admin
      .from("organization_admin_setup")
      .select("used_at, expires_at")
      .eq("organization_id", org.id)
      .eq("code_hash", hashSetupCode(code))
      .maybeSingle();
    state = setupRecordState(setup);
  }

  const blocked = org.status !== "active" || org.portal_enabled === false;
  const errorKey = sp.e && ERRORS[sp.e] ? sp.e : null;
  const unusable = !code ? "missing" : state !== "usable" ? state : null;

  return (
    <AuthShell
      title={`${org.name} administrator setup`}
      subtitle="Create the first Organization Owner account for your institution. This link works once."
      footer={
        <Link href={`/portal/${org.slug}`} className="font-medium text-evergreen-700 underline-offset-2 hover:underline">
          ← Back to the {org.name} portal
        </Link>
      }
    >
      {errorKey && (
        <p role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">
          {ERRORS[errorKey]}
        </p>
      )}

      {blocked ? (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
          This institution&apos;s portal is currently unavailable. Contact the EVALORA team.
        </p>
      ) : unusable ? (
        <>
          <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">{setupStateMessage(unusable)}</p>
          <Link
            href={`/login?org=${org.slug}&switch=1&next=/dashboard`}
            className="mt-4 inline-block text-sm font-semibold text-evergreen-700 underline underline-offset-2"
          >
            Go to the sign-in page
          </Link>
        </>
      ) : (
        <form action={provisionOrganizationAdmin} className="space-y-4">
          <input type="hidden" name="org" value={org.slug} />
          <input type="hidden" name="code" value={code} />
          <p className="rounded-lg bg-cream px-4 py-3 text-sm text-ink-soft">
            This creates the <strong>Organization Owner</strong> account for {org.name}. It can manage this
            institution&apos;s students, teachers, staff, classes, examinations, quizzes, competitions, questions,
            results and settings — and nothing on the EVALORA platform or any other school.
          </p>
          <Field label="Full name">
            <Input name="full_name" required maxLength={160} autoComplete="name" placeholder="Ada Mensah" />
          </Field>
          <Field label="Email address">
            <Input name="email" type="email" required autoComplete="email" placeholder="admin@institution.edu" />
          </Field>
          <Field label="Password" hint={`At least ${MIN_INITIAL_PASSWORD_LENGTH} characters, with letters and numbers.`}>
            <Input name="password" type="password" required autoComplete="new-password" minLength={MIN_INITIAL_PASSWORD_LENGTH} />
          </Field>
          <Field label="Confirm password">
            <Input name="confirm" type="password" required autoComplete="new-password" minLength={MIN_INITIAL_PASSWORD_LENGTH} />
          </Field>
          <Button type="submit" className="w-full py-3">Create administrator account</Button>
          <p className="text-center text-xs text-ink-soft">
            Your password is stored only by Supabase Auth as a one-way hash. EVALORA never keeps it.
          </p>
        </form>
      )}
    </AuthShell>
  );
}
