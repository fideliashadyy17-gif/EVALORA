import { activeOrg, requireUser, type SessionContext } from "./auth";
import { canOperateMany } from "./operationalAccess";
import { createClient } from "./supabase/server";
import type { MypFilters, MypStatusFilter } from "./mypResults";

/**
 * Authorization for every MYP results surface and export.
 *
 * Two independent guarantees:
 *  · Organization staff (owner, admin, teacher, organizer, corrector) see and
 *    export only their own organization's results.
 *  · The Super Admin keeps the platform's global authorization model and can
 *    read across every organization, optionally narrowed to one organization.
 *
 * A learner is never given the staff scope: their own result is loaded through
 * a student-scoped read that also requires the result to be released.
 */

export const MYP_STAFF_ROLES = ["owner", "admin", "teacher", "organizer", "corrector"] as const;
export const MYP_LEARNER_ROLES = ["student", "candidate", "participant", "parent"] as const;

export interface MypAccess {
  ctx: SessionContext;
  isSuperAdmin: boolean;
  /** Organizations this caller may read. Never empty for a staff caller. */
  organizationIds: string[];
  /** The active organization for a staff caller, null for the global console. */
  org: ReturnType<typeof activeOrg>;
  canExport: boolean;
  canManage: boolean;
}

export async function mypAccess(options: { global?: boolean } = {}): Promise<MypAccess> {
  const ctx = await requireUser();
  const isSuperAdmin = ctx.profile.platform_role === "super_admin";
  const org = activeOrg(ctx);

  if (isSuperAdmin) {
    const supabase = await createClient();
    const { data } = await supabase.from("organizations").select("id").order("name");
    const organizationIds = (data ?? []).map((row) => row.id as string);
    // A Super Admin operating inside a workspace sees that workspace unless the
    // global console explicitly asks for every organization.
    const scoped = !options.global && ctx.adminOrgContext ? [ctx.adminOrgContext.id] : organizationIds;
    return {
      ctx,
      isSuperAdmin,
      organizationIds: scoped.length ? scoped : organizationIds,
      org,
      canExport: true,
      canManage: true,
    };
  }

  const role = org?.role ?? "";
  if (!org || isMypLearner(role) || role === "school_founder") {
    return {
      ctx,
      isSuperAdmin,
      organizationIds: [],
      org,
      canExport: false,
      canManage: false,
    };
  }
  const perms = await canOperateMany(ctx, org.id, {
    view: { permission: "results.view", module: "exam_results" },
    export: { permission: "reports.export", module: "exam_reports" },
    manage: { permission: "results.validate", module: "exam_results" },
  });
  return {
    ctx,
    isSuperAdmin,
    organizationIds: perms.view ? [org.id] : [],
    org,
    canExport: perms.export,
    canManage: perms.manage,
  };
}

/** True when a learner (student/candidate/participant/parent) is signed in. */
export function isMypLearner(role: string | null | undefined): boolean {
  return (MYP_LEARNER_ROLES as readonly string[]).includes(role ?? "");
}

function text(value: string | null | undefined): string | undefined {
  const trimmed = (value ?? "").trim();
  return trimmed.length ? trimmed : undefined;
}

const STATUS_VALUES: MypStatusFilter[] = [
  "all",
  "published",
  "unpublished",
  "complete",
  "provisional",
  "incomplete",
  "pending",
];

export interface RawMypQuery {
  org?: string;
  organization?: string;
  exam?: string;
  class?: string;
  subject?: string;
  year?: string;
  student?: string;
  criterion?: string;
  status?: string;
  from?: string;
  to?: string;
  q?: string;
  attempt?: string;
}

/** Parse the result filter controls into loader filters. */
export function parseMypFilters(query: RawMypQuery, access: MypAccess): MypFilters {
  const requestedOrg = text(query.org) ?? text(query.organization);
  const organizationId = access.isSuperAdmin
    ? requestedOrg && access.organizationIds.includes(requestedOrg)
      ? requestedOrg
      : undefined
    : access.org?.id;
  const status = STATUS_VALUES.includes((query.status ?? "") as MypStatusFilter)
    ? ((query.status ?? "all") as MypStatusFilter)
    : "all";
  const year = Number(query.year);
  return {
    organizationIds: access.organizationIds,
    organizationId,
    examId: text(query.exam),
    className: text(query.class),
    subjectId: text(query.subject),
    mypYear: Number.isFinite(year) && year >= 1 && year <= 5 ? year : undefined,
    search: text(query.q) ?? text(query.student),
    criterion: text(query.criterion),
    status,
    from: text(query.from),
    to: text(query.to),
    attemptId: text(query.attempt),
    includeUnpublished: true,
  };
}

/** A short human label for the active filter set (used in exports). */
export function describeMypScope(query: RawMypQuery, dataset: { results: { organizationName: string }[] }): string {
  const parts: string[] = [];
  if (query.org || query.organization) parts.push(query.org ?? query.organization ?? "");
  if (query.year) parts.push(`MYP ${query.year}`);
  if (query.class) parts.push(query.class);
  if (query.subject) parts.push("Selected subject");
  if (query.exam) parts.push("Selected examination");
  if (query.status && query.status !== "all") parts.push(`${query.status} results`);
  if (query.from || query.to) parts.push(`${query.from ?? "start"} to ${query.to ?? "today"}`);
  const orgs = [...new Set(dataset.results.map((result) => result.organizationName))];
  if (!parts.length) parts.push(orgs.length === 1 ? orgs[0] : orgs.length ? `${orgs.length} organizations` : "All results");
  return parts.join(" · ");
}

/** A filesystem-safe export filename base. */
export function safeFilename(value: string): string {
  return (
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || "evalora-myp-results"
  );
}
