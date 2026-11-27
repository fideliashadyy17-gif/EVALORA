import { createServerClient } from "@supabase/ssr";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
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

/**
 * A server client authenticated as a REAL user, without a browser.
 *
 * The external-agent path has no cookies: `createClient()` would hand back an
 * anonymous client, so every RLS read returned nothing and every service-level
 * `canOperate` resolved false. An agent then looked authenticated at the token
 * boundary and powerless underneath it — a silent half-failure.
 *
 * Supabase's admin API can mint a one-time magic-link token for a user, and the
 * public client can exchange it for a genuine session. That session carries the
 * owner's real claims, so RLS evaluates exactly as it would in that person's
 * browser: the agent is the owner, not a service role wearing their name.
 *
 * The token is single-use and never leaves this function. On any failure the
 * caller must treat the request as unauthenticated rather than fall back to the
 * service role.
 */
export async function createUserSessionClient(admin: SupabaseClient, userId: string, email: string) {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const hashed = data?.properties?.hashed_token;
  if (error || !hashed) return null;

  const client = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      db: SERVER_DB_OPTIONS,
      global: { fetch: createTimeoutFetch() },
    },
  );
  const { data: verified, error: verifyError } = await client.auth.verifyOtp({ token_hash: hashed, type: "magiclink" });
  const session = verified?.session;
  if (verifyError || !session) return null;
  // The minted token must belong to the person we are acting for. A mismatch
  // here would mean the agent was about to act as somebody else.
  if (session.user?.id !== userId) return null;
  await client.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
  return client;
}
