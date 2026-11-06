import { AuthShell } from "@/components/AuthShell";
import { LoginForm } from "@/components/LoginForm";
import { safeLocalPath } from "@/lib/roleRouting";
import { enabledSsoProviders } from "@/lib/sso";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Sign in" };

/**
 * Server component so the SSO provider list is resolved from the deployment
 * environment, not from anything the browser can send. When no provider is
 * configured the page is what it always was: email and password only.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const one = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : null);

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to your EVALORA workspace."
      footer={
        <>
          No account yet?{" "}
          <Link href="/register" className="font-semibold text-evergreen-700 underline-offset-2 hover:underline">
            Create one free
          </Link>
        </>
      }
    >
      <LoginForm
        providers={enabledSsoProviders()}
        next={safeLocalPath(one("next"))}
        error={one("error")}
        registered={Boolean(one("registered"))}
        reset={Boolean(one("reset"))}
      />
    </AuthShell>
  );
}
