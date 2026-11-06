/**
 * SSO provisioning guard — the server-only half of single sign-on.
 *
 * Policy (chosen deliberately): SSO never creates a workspace identity. A
 * Google account that has no EVALORA profile, or whose profile is not active,
 * is signed straight back out and told to ask their administrator for an
 * invitation. Membership, roles and organization scope stay exactly where they
 * are today: created by invitation, verified server-side.
 *
 * One honest limitation: Supabase creates the auth user during the provider
 * round trip, before this code can see it. Denying access therefore removes
 * the *session*, not the auth record — an uninvited account exists but can do
 * nothing, and gets the same denial on every later attempt.
 */
import { createAdminClient } from "./supabase/server";
import { maskEmail } from "./sso";

/** The minimum of the Supabase client this module needs. */
interface SessionLike {
  auth: {
    getUser(): Promise<{ data: { user: { id: string; email?: string | null } | null } }>;
  };
}

interface Queryable {
  from(table: string): QueryLike;
}

interface QueryLike {
  select(columns?: string): QueryLike;
  eq(column: string, value: unknown): QueryLike;
  maybeSingle(): PromiseLike<{ data: Record<string, unknown> | null; error: unknown }>;
}

export type SsoOutcome =
  | { ok: true; userId: string; email: string | null }
  | { ok: false; userId: string | null; email: string | null; reason: "no_profile" | "inactive" };

/**
 * Confirm the freshly authenticated SSO identity maps to an active profile.
 * The service-role client is preferred so the answer cannot depend on how the
 * profiles RLS policy happens to be written; without a service-role key the
 * caller's own client is used (a user may always read their own profile).
 */
export async function enforceSsoProvisioning(session: SessionLike): Promise<SsoOutcome> {
  const { data } = await session.auth.getUser();
  const user = data?.user;
  if (!user) return { ok: false, userId: null, email: null, reason: "no_profile" };
  const email = user.email ?? null;

  const reader = (process.env.SUPABASE_SERVICE_ROLE_KEY ? createAdminClient() : session) as unknown as Queryable;
  const { data: profile } = await reader
    .from("profiles")
    .select("id, status")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) return { ok: false, userId: user.id, email, reason: "no_profile" };
  if (profile.status !== "active") return { ok: false, userId: user.id, email, reason: "inactive" };
  return { ok: true, userId: user.id, email };
}

/**
 * Record the outcome of an SSO sign-in. `actorId` is null when no profile
 * exists — audit_logs.actor_id references profiles(id), so passing an auth
 * user id without a profile would be a foreign-key violation.
 */
export async function recordSsoSignIn(input: {
  provider: string;
  userId: string | null;
  email: string | null;
  actorId: string | null;
  outcome: "provisioned" | "denied_no_profile" | "denied_inactive";
}): Promise<void> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  try {
    await createAdminClient()
      .from("audit_logs")
      .insert({
        actor_id: input.actorId,
        organization_id: null,
        action: "auth.sso_signin",
        entity: "profile",
        entity_id: input.userId,
        metadata: {
          provider: input.provider,
          email: maskEmail(input.email),
          outcome: input.outcome,
        },
      });
  } catch {
    // Auditing must never block or break a sign-in.
  }
}
