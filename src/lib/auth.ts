import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import type { OrgRole } from "./brand";
import { getTenantSlugFromHost } from "./tenant";

/** Cookie that puts the Super Admin inside a chosen organization workspace. */
export const ADMIN_ORG_COOKIE = "evalora_admin_org";
/** Only selects an existing active membership; never grants membership. */
export const MEMBER_ORG_COOKIE = "evalora_member_org";

export interface SessionContext {
  user: { id: string; email: string };
  profile: {
    id: string;
    email: string;
    full_name: string | null;
    platform_role: string;
    is_primary?: boolean;
    status: string;
  };
  memberships: {
    organization_id: string;
    role: OrgRole;
    organizations: { id: string; name: string; slug: string; status: string; is_demo?: boolean } | null;
  }[];
  /**
   * Set when the Super Admin is operating inside an organization via
   * "Open workspace" (administrative access mode). The synthetic owner
   * membership below makes activeOrg() — and therefore the whole
   * tenant dashboard — operate on that organization. Entry and exit
   * are written to the audit log.
   */
  adminOrgContext?: { id: string; name: string } | null;
  /**
   * Tenant (school subdomain) resolution. `tenantSlug` comes from the
   * request hostname (set by middleware, re-derived from Host here).
   * It only *selects* among the user's verified memberships: when the
   * user is not a member of that tenant, `tenantDenied` is true and
   * activeOrg() returns null — another school's data can never load.
   */
  tenantSlug?: string | null;
  tenantDenied?: boolean;
  /** The tenant host or a validated membership selection identifies the workspace. */
  workspaceSelected?: boolean;
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

  const { data: memberships, error: membershipsError } = await supabase
    .from("organization_members")
    .select("organization_id, role, organizations(id, name, slug, status, is_demo)")
    .eq("user_id", user.id)
    .eq("status", "active");
  // A failed membership query is not evidence that the user has no
  // organization; never silently redirect them into onboarding.
  if (membershipsError || !memberships) return null;

  const list = memberships as unknown as SessionContext["memberships"];
  let adminOrgContext: SessionContext["adminOrgContext"] = null;
  let tenantSlug: string | null = null;
  let tenantDenied = false;
  let workspaceSelected = false;

  // ── Tenant resolution from the hostname (school subdomain portals) ──
  // The slug never grants access by itself: it must match one of the
  // user's verified organization memberships. Super Admins may enter
  // any tenant in audited administrative mode.
  try {
    const hdrs = await headers();
    tenantSlug = hdrs.get("x-evalora-tenant-slug") || getTenantSlugFromHost(hdrs.get("host"));
  } catch {
    tenantSlug = null;
  }
  if (tenantSlug) {
    const idx = list.findIndex((m) => m.organizations?.slug === tenantSlug);
    if (idx >= 0) workspaceSelected = true;
    if (idx > 0) {
      const [m] = list.splice(idx, 1);
      list.unshift(m);
    } else if (idx === -1) {
      if (profile.platform_role === "super_admin") {
        const { data: org } = await supabase
          .from("organizations")
          .select("id, name, slug, status")
          .eq("slug", tenantSlug)
          .maybeSingle();
        if (org) {
          list.unshift({
            organization_id: org.id,
            role: "owner",
            organizations: org,
          } as SessionContext["memberships"][number]);
          adminOrgContext = { id: org.id, name: org.name };
        } else {
          tenantDenied = true;
        }
      } else {
        tenantDenied = true;
      }
    }
  }

  // The ordinary workspace cookie is a selector, not an authorization
  // credential: it can only choose one of the user's active memberships.
  // A school hostname always takes precedence over any cookie.
  if (profile.platform_role !== "super_admin" && !tenantSlug) {
    const cookieStore = await cookies();
    const selected = cookieStore.get(MEMBER_ORG_COOKIE)?.value;
    const index = selected ? list.findIndex((m) => m.organization_id === selected && m.organizations?.status === "active") : -1;
    if (index >= 0) {
      const [membership] = list.splice(index, 1);
      list.unshift(membership);
      workspaceSelected = true;
    }
  }

  // Administrative workspace mode (Super Admin only). The cookie alone
  // grants nothing: the profile must be an active super_admin, and the
  // organization must exist (readable via the super-admin RLS path).
  if (profile.platform_role === "super_admin") {
    const cookieStore = await cookies();
    const targetOrgId = cookieStore.get(ADMIN_ORG_COOKIE)?.value;
    const own = targetOrgId ? list.findIndex((m) => m.organization_id === targetOrgId) : -1;
    if (own >= 0) {
      // Already a real member — make it active and always show the audited
      // workspace-mode banner, including when it was already first.
      const [m] = list.splice(own, 1);
      list.unshift(m);
      adminOrgContext = { id: m.organization_id, name: m.organizations?.name ?? "Organization" };
    } else if (targetOrgId && own === -1) {
      const { data: org } = await supabase
        .from("organizations")
        .select("id, name, slug, status")
        .eq("id", targetOrgId)
        .maybeSingle();
      if (org) {
        list.unshift({
          organization_id: org.id,
          role: "owner",
          organizations: org,
        } as SessionContext["memberships"][number]);
        adminOrgContext = { id: org.id, name: org.name };
      }
    }
  }

  return {
    user: { id: user.id, email: user.email ?? profile.email },
    profile,
    memberships: list,
    adminOrgContext,
    tenantSlug,
    tenantDenied,
    workspaceSelected,
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
  // Wrong-tenant hostname: never fall back to another school's workspace.
  if (ctx.tenantDenied) return null;
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
  if (ctx.profile.status !== "active") return false;
  if (ctx.profile.platform_role === "super_admin") return true;
  const m = ctx.memberships.find((x) => x.organization_id === orgId);
  return !!m && roles.includes(m.role);
}
