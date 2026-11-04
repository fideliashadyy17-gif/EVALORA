import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import type { OrgRole } from "./brand";

export interface SessionContext {
  user: { id: string; email: string };
  profile: {
    id: string;
    email: string;
    full_name: string | null;
    platform_role: string;
    status: string;
  };
  memberships: {
    organization_id: string;
    role: OrgRole;
    organizations: { id: string; name: string; slug: string; status: string } | null;
  }[];
}

/** Full session context or null. Server components / actions only. */
export async function getSessionContext(): Promise<SessionContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  if (!profile) return null;

  const { data: memberships } = await supabase
    .from("organization_members")
    .select("organization_id, role, organizations(id, name, slug, status)")
    .eq("user_id", user.id)
    .eq("status", "active");

  return {
    user: { id: user.id, email: user.email ?? profile.email },
    profile,
    memberships: (memberships ?? []) as unknown as SessionContext["memberships"],
  };
}

export async function requireUser() {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  if (ctx.profile.status === "suspended") redirect("/login?error=suspended");
  return ctx;
}

export async function requireSuperAdmin() {
  const ctx = await requireUser();
  if (ctx.profile.platform_role !== "super_admin") redirect("/dashboard");
  return ctx;
}

/** The user's active organization (first membership). Multi-org switcher-ready. */
export function activeOrg(ctx: SessionContext) {
  const m = ctx.memberships[0];
  if (!m?.organizations) return null;
  return { ...m.organizations, role: m.role };
}

export const CREATOR_ROLES: OrgRole[] = ["owner", "admin", "teacher", "organizer"];
export const MANAGER_ROLES: OrgRole[] = ["owner", "admin"];
export const MARKER_ROLES: OrgRole[] = ["owner", "admin", "teacher", "corrector"];
export const PROCTOR_ROLES: OrgRole[] = ["owner", "admin", "teacher", "supervisor", "corrector"];

/** Explicit permission checks (never rely on the UI hiding a button). */
export function can(ctx: SessionContext, orgId: string, roles: OrgRole[]) {
  if (ctx.profile.platform_role === "super_admin") return true;
  const m = ctx.memberships.find((x) => x.organization_id === orgId);
  return !!m && roles.includes(m.role);
}
