"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { safeLocalPath } from "@/lib/roleRouting";
import { isSsoProviderId, requestOrigin, ssoCallbackUrl, ssoProviderConfigured } from "@/lib/sso";
import { createClient } from "@/lib/supabase/server";

/**
 * Begin a third-party sign-in. Provider availability is re-checked here rather
 * than trusted from the form: a hidden field is user input, and the deployment
 * flag is the only thing that decides whether the round trip can succeed.
 *
 * The callback origin comes from the request's own host, so a sign-in started
 * on a school subdomain returns there instead of the apex.
 */
export async function startSsoSignIn(formData: FormData): Promise<void> {
  const provider = String(formData.get("provider") ?? "");
  if (!isSsoProviderId(provider) || !ssoProviderConfigured(provider)) {
    redirect("/login?error=sso_unavailable");
  }

  // A destination hint is only ever a local path; anything else is dropped.
  const next = safeLocalPath(String(formData.get("next") ?? ""));

  const headerList = await headers();
  const origin = requestOrigin({
    host: headerList.get("x-forwarded-host") ?? headerList.get("host"),
    rootDomain: process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? null,
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? null,
  });
  if (!origin) redirect("/login?error=sso");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: ssoCallbackUrl(origin, next, provider) },
  });
  if (error || !data?.url) redirect("/login?error=sso");

  redirect(data.url);
}
