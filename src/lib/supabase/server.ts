import { createServerClient } from "@supabase/ssr";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const SUPABASE_SERVER_TIMEOUT_MS = 10_000;

function createTimeoutFetch(timeoutMs = SUPABASE_SERVER_TIMEOUT_MS): typeof fetch {
  return async (input, init) => {
    const controller = new AbortController();
    const upstreamSignal = init?.signal;
    const onUpstreamAbort = () => controller.abort();
    if (upstreamSignal) {
      if (upstreamSignal.aborted) controller.abort();
      else upstreamSignal.addEventListener("abort", onUpstreamAbort, { once: true });
    }
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
      if (upstreamSignal) upstreamSignal.removeEventListener("abort", onUpstreamAbort);
    }
  };
}

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        fetch: createTimeoutFetch(),
      },
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Server Component render — cookie updates are best-effort outside Route Handlers / Server Actions.
          }
        },
      },
    },
  );
}

/** Service-role client for server-only operations (live scoring, exam grading, webhooks). Never import in client code. */
export function createAdminClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: createTimeoutFetch() },
    },
  );
}
