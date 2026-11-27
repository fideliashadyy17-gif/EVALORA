import { createServerClient } from "@supabase/ssr";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const SUPABASE_SERVER_TIMEOUT_MS = 10_000;

/**
 * Server-side reads never retry.
 *
 * postgrest-js retries an idempotent request up to three times with exponential
 * backoff (1s, 2s, 4s) whenever the fetch rejects, so an unreachable database
 * costs about seven seconds *per query*. A public page reads branding,
 * announcements, formatting and the locale in sequence, which turned a closed
 * database port into a ~21 s render with the CPU idle and no socket open — the
 * page was not waiting for the database, it was waiting out the backoff before
 * reaching the fallback it was always going to use.
 *
 * Every server-side read in this codebase has a documented fallback (compiled-in
 * brand defaults, schema-default configuration, the platform-wide profile), so
 * failing fast is strictly better than making a candidate, an invigilator or a
 * serverless function's billed duration wait it out. Retries stay enabled in the
 * browser client, where a flaky connection on a candidate's own device is exactly
 * what they are for.
 */
const SERVER_DB_OPTIONS = { retry: false } as const;

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
      return await fetch(input, { cache: "no-store", ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
      if (upstreamSignal) upstreamSignal.removeEventListener("abort", onUpstreamAbort);
    }
  };
}

export async function createClient() {
  const cookieStore = await cookies();
  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "evalora-edu.online";
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: SERVER_DB_OPTIONS,
      global: {
        fetch: createTimeoutFetch(),
      },
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              const mergedOptions = options?.domain?.includes(root)
                ? options
                : { ...options, path: "/", sameSite: "lax" as const };
              cookieStore.set(name, value, mergedOptions);
            });
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
      db: SERVER_DB_OPTIONS,
      global: { fetch: createTimeoutFetch() },
    },
  );
}
