import { AuthShell } from "@/components/AuthShell";
import { LoginForm } from "@/components/LoginForm";
import { safeLocalPath } from "@/lib/roleRouting";
import { enabledSsoProviders } from "@/lib/sso";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Sign in" };

/**
 * Staff and student sign-in.
 *
 * Resolved on the server so the page can show which institution's portal the
 * visitor came from (`?org=<slug>`), and — when the visitor explicitly asked to
 * switch accounts (`?switch=1`) — who the current browser session belongs to.
 * The institution lookup only reads public identity fields; an unknown or
 * closed portal simply renders the generic EVALORA sign-in page.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const one = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : null);

  const switching = one("switch") === "1";
  const orgParam = (one("org") ?? "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 63);

  let org: { name: string; slug: string } | null = null;
  if (orgParam) {
    const admin = createAdminClient();
    const { data } = await admin
      .from("organizations")
      .select("name, slug, status, portal_enabled")
      .eq("slug", orgParam)
      .maybeSingle();
    if (data && data.status === "active" && data.portal_enabled !== false) {
      org = { name: data.name, slug: data.slug };
    }
  }

  // Only read the existing session when the visitor asked to switch accounts
  // (otherwise middleware has already resolved them to their own dashboard).
  let signedInAs: string | null = null;
  if (switching) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    signedInAs = user?.email ?? null;
  }

  const next = safeLocalPath(one("next")) ?? (org ? "/dashboard" : null);
  const switchHref = `/login?switch=1${org ? `&org=${org.slug}` : ""}${next ? `&next=${encodeURIComponent(next)}` : ""}`;

  return (
    <AuthShell
      title={org ? `Sign in to ${org.name}` : "Welcome back"}
      subtitle={
        org
          ? "Staff and students sign in here with the account issued by your institution."
          : "Sign in to your EVALORA workspace."
      }
      footer={
        <div className="flex flex-col items-center gap-2">
          <span>
            No account yet?{" "}
            <Link href="/register" className="font-semibold text-evergreen-700 underline-offset-2 hover:underline">
              Create one free
            </Link>
          </span>
          {org ? (
            <Link href={`/portal/${org.slug}`} className="font-medium text-evergreen-700 underline-offset-2 hover:underline">
              ← Back to the {org.name} portal
            </Link>
          ) : (
            <Link href="/" className="font-medium text-evergreen-700 underline-offset-2 hover:underline">
              ← EVALORA home
            </Link>
          )}
        </div>
      }
    >
      <LoginForm
        providers={enabledSsoProviders()}
        next={next}
        error={one("error")}
        registered={Boolean(one("registered"))}
        reset={Boolean(one("reset"))}
        signedInAs={signedInAs}
        institution={org?.name ?? null}
      />
      {!switching && (
        <p className="mt-5 text-center text-xs text-ink-soft">
          Using a shared computer?{" "}
          <Link href={switchHref} className="font-semibold text-evergreen-700 underline underline-offset-2">
            Sign in as someone else
          </Link>
        </p>
      )}
      <p className="mt-4 text-center text-xs text-ink-soft">
        Joining a live quiz or an examination?{" "}
        <Link href="/join" className="font-medium text-evergreen-700 underline-offset-2 hover:underline">
          Join activity
        </Link>{" "}
        ·{" "}
        <Link href="/exam-access" className="font-medium text-evergreen-700 underline-offset-2 hover:underline">
          Enter examination
        </Link>{" "}
        — no account needed.
      </p>
    </AuthShell>
  );
}
