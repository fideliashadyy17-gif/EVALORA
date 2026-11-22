import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "evalora-edu.online";
  const isProd = typeof window !== "undefined" && window.location.hostname.endsWith(root);
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    isProd
      ? {
          cookieOptions: {
            domain: `.${root}`,
            path: "/",
            sameSite: "lax",
            secure: true,
          },
        }
      : undefined,
  );
}
