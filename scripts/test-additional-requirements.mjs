import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolveCapabilities } from "../src/lib/capability-rules.ts";
import { getEntitlement, getEntitlementFor, withinLimit } from "../src/lib/entitlements.ts";
import {
  buildInvitationText,
  examAccessAvailability,
  identityDataEqual,
  mergeEligibleClassIds,
  normalizeIdentityFields,
  normalizeUuidList,
  parseExamAccessSettings,
  sanitizeIdentityData,
} from "../src/lib/exam-access.ts";

const root = new URL("../", import.meta.url);
const results = [];
function check(name, condition) {
  results.push({ name, passed: Boolean(condition) });
  assert.ok(condition, name);
}

const file = async (p) => readFile(new URL(p, root), "utf8");
const flags = { live_quizzes: true, examinations: true, proctoring: true };

function fakeSupabase(sub, freePlan) {
  let table = "";
  const chain = {
    from(value) { table = value; return chain; },
    select() { return chain; },
    eq() { return chain; },
    in() { return chain; },
    order() { return chain; },
    limit() { return chain; },
    maybeSingle() {
      if (table === "subscriptions") return Promise.resolve({ data: sub });
      if (table === "plans") return Promise.resolve({ data: freePlan });
      return Promise.resolve({ data: null });
    },
  };
  return chain;
}

const freePlan = {
  name: "Free", slug: "free",
  limits: {
    max_quizzes: 5, max_participants_per_session: 30, max_exams: 2, max_members: 3,
    max_questions: 100, proctoring: false, advanced_reports: false, storage_mb: 100,
    institutional: false, max_classes: -1, max_students: -1, multi_class_operations: true,
    central_asset_management: false, configurable_limits: false,
  },
};
const premiumPlan = {
  name: "Premium", slug: "premium",
  limits: {
    ...freePlan.limits, max_quizzes: -1, max_participants_per_session: 500, max_exams: -1,
    max_members: 50, max_questions: -1, proctoring: true, advanced_reports: true, storage_mb: 5120,
  },
};
const institutionPlan = {
  name: "Institution", slug: "institution",
  limits: {
    ...premiumPlan.limits, max_participants_per_session: 1000, max_members: -1,
    storage_mb: 51200, institutional: true, max_classes: -1, max_students: -1,
    multi_class_operations: true, central_asset_management: true, configurable_limits: true,
  },
};
const future = new Date(Date.now() + 86400000).toISOString();
const subscription = (plan) => ({
  status: "active", source: "paid", plans: plan, limits_override: null,
  trial_ends_at: null, current_period_end: future, current_period_start: new Date().toISOString(),
});

const freeEnt = await getEntitlement(fakeSupabase(null, freePlan), "org-free");
const premiumEnt = await getEntitlement(fakeSupabase(subscription(premiumPlan), freePlan), "org-premium");
const institutionEnt = await getEntitlement(fakeSupabase(subscription(institutionPlan), freePlan), "org-institution");
const ownerEnt = await getEntitlementFor(
  { from() { throw new Error("owner bypass must not query subscriptions"); } },
  { profile: { platform_role: "super_admin", status: "active" } },
  "org-owner",
);

// Role-separated entitlements.
check("Free entitlement resolves Free plan", freeEnt.planSlug === "free");
check("Premium entitlement resolves Premium plan", premiumEnt.planSlug === "premium");
check("Institutional entitlement resolves Institution plan", institutionEnt.planSlug === "institution");
check("Super Admin owner entitlement is distinct from Institutional plan", ownerEnt.planSlug === "owner" && ownerEnt.status === "owner");
check("Super Admin owner limits are unlimited", withinLimit(ownerEnt.limits.max_exams, 9999) && ownerEnt.limits.proctoring);
check("Super Admin owner includes every institutional feature", ownerEnt.limits.institutional && ownerEnt.limits.central_asset_management && ownerEnt.limits.configurable_limits && ownerEnt.limits.multi_class_operations);
check("Super Admin owner quotas are unlimited", [ownerEnt.limits.max_quizzes, ownerEnt.limits.max_participants_per_session, ownerEnt.limits.max_exams, ownerEnt.limits.max_members, ownerEnt.limits.max_questions, ownerEnt.limits.storage_mb, ownerEnt.limits.max_classes, ownerEnt.limits.max_students].every((limit) => limit === -1));
check("Free plan keeps commercial restrictions", freeEnt.limits.max_exams === 2 && !freeEnt.limits.proctoring && !freeEnt.limits.advanced_reports);
check("Institution plan includes institutional capability keys", institutionEnt.limits.institutional && institutionEnt.limits.central_asset_management && institutionEnt.limits.configurable_limits);

const freeCaps = resolveCapabilities({ isSuperAdmin: false, planSlug: freeEnt.planSlug, limits: freeEnt.limits, featureFlags: flags });
const premiumCaps = resolveCapabilities({ isSuperAdmin: false, planSlug: premiumEnt.planSlug, limits: premiumEnt.limits, featureFlags: flags });
const institutionCaps = resolveCapabilities({ isSuperAdmin: false, planSlug: institutionEnt.planSlug, limits: institutionEnt.limits, featureFlags: flags });
const ownerCaps = resolveCapabilities({ isSuperAdmin: true, planSlug: ownerEnt.planSlug, limits: ownerEnt.limits, featureFlags: { ...flags, examinations: false, proctoring: false, live_quizzes: false } });

check("Super Admin has all capabilities even with all feature flags disabled", Object.values(ownerCaps).every(Boolean));
check("Super Admin unrestricted flag is true", ownerCaps.unrestricted_owner_access && ownerCaps.future_modules);
check("Free proctoring and advanced reports are restricted", !freeCaps.proctoring && !freeCaps.reports_analytics && !freeCaps.imports_exports);
check("Free class management remains available", freeCaps.class_management && freeCaps.student_management);
check("Premium includes proctoring and reports but not institutional administration", premiumCaps.proctoring && premiumCaps.reports_analytics && !premiumCaps.institutional_administration);
check("Institutional plan includes central resources and configurable limits", institutionCaps.institutional_administration && institutionCaps.central_asset_management && institutionCaps.configurable_limits && institutionCaps.multi_class_operations);
check("Institutional customers do not receive owner unrestricted access", !institutionCaps.unrestricted_owner_access && !institutionCaps.future_modules);
check("Ordinary Institutional customers remain subject to disabled examinations flag", !resolveCapabilities({ isSuperAdmin: false, planSlug: "institution", limits: institutionEnt.limits, featureFlags: { ...flags, examinations: false } }).examinations);

// General exam link/code and candidate workflow rules.
const defaults = parseExamAccessSettings(null);
check("Default exam access mode is shared link", defaults.accessMode === "shared_link");
check("Default attempt policy is single resume", defaults.attemptPolicy === "single_resume");
check("Default identity fields and class allowlist are empty", defaults.identityFields.length === 0 && defaults.eligibleClassIds.length === 0);

const configured = parseExamAccessSettings({
  access_mode: "registered_students_only",
  identity_fields: [
    { key: "student_id", label: "Student ID", required: true, type: "text" },
    { key: "first_name", label: "Reserved", required: true },
    { key: "guardian_email", label: "Guardian email", type: "email" },
  ],
  eligible_class_ids: ["11111111-1111-4111-8111-111111111111", "not-a-uuid"],
  attempt_policy: "read_only_reentry",
  proctoring: true,
});
check("Configured registered-students-only mode is parsed", configured.accessMode === "registered_students_only");
check("Reserved identity keys are rejected", configured.identityFields.length === 2 && configured.identityFields.every((f) => f.key !== "first_name"));
check("Invalid configured class UUIDs are ignored", configured.eligibleClassIds.length === 1);
check("Configured attempt policy and proctoring are parsed", configured.attemptPolicy === "read_only_reentry" && configured.proctoring);

const identityOk = sanitizeIdentityData(configured.identityFields, {
  student_id: " ST-900 ",
  guardian_email: "guardian@example.org",
  unexpected: "ignored",
});
check("Configured identity data is validated and whitelisted", identityOk.ok && identityOk.data.student_id === "ST-900" && !("unexpected" in identityOk.data));
check("Missing required identity field is rejected", !sanitizeIdentityData(configured.identityFields, { guardian_email: "a@b.com" }).ok);
check("Invalid email identity field is rejected", !sanitizeIdentityData(configured.identityFields, { student_id: "ST-900", guardian_email: "not-email" }).ok);
check("JSONB key order does not break identity comparison", identityDataEqual({ a: "1", b: "2" }, { b: "2", a: "1" }));
check("Different identity data is detected", !identityDataEqual({ a: "1" }, { a: "2" }));

const baseClasses = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"];
check("Class allowlist restricts eligible classes", mergeEligibleClassIds(baseClasses, configured.eligibleClassIds).length === 1);
check("Empty class allowlist preserves phase links", mergeEligibleClassIds(baseClasses, []).length === 2);
check("Normalized UUID list is unique", normalizeUuidList(["11111111-1111-4111-8111-111111111111", "11111111-1111-4111-8111-111111111111"]).length === 1);
check("Normalized identity fields cap and sanitize", normalizeIdentityFields(Array.from({ length: 20 }, (_, i) => ({ key: `f${i}`, label: `Field ${i}` }))).length === 12);

const now = new Date("2026-11-05T12:00:00Z");
const baseExam = { status: "open", starts_at: null, ends_at: null, shared_link_enabled: true, invite_expires_at: null };
check("Open exam is available", examAccessAvailability(baseExam, now).ok);
check("Closed exam is blocked", !examAccessAvailability({ ...baseExam, status: "closed" }, now).ok);
check("Future exam is blocked", !examAccessAvailability({ ...baseExam, starts_at: "2026-11-05T13:00:00Z" }, now).ok);
check("Expired exam is blocked", !examAccessAvailability({ ...baseExam, ends_at: "2026-11-05T11:00:00Z" }, now).ok);
check("Disabled link is blocked", !examAccessAvailability({ ...baseExam, shared_link_enabled: false }, now).ok);
check("Expired invitation is blocked", !examAccessAvailability({ ...baseExam, invite_expires_at: "2026-11-05T11:00:00Z" }, now).ok);

const invitation = buildInvitationText({
  title: "General Examination", shareUrl: "https://example.test/exam/join/token",
  accessCode: "ABC123", availability: "Open now", restrictions: ["First and last name required"],
});
check("Complete invitation includes title, link, code and restrictions",
  invitation.includes("General Examination") && invitation.includes("/exam/join/token") && invitation.includes("ABC123") && invitation.includes("First and last name required"));

// Static source / migration coverage.
const migrations = {
  institutional: await file("supabase/migrations/0020_institutional_entitlements.sql"),
  rls: await file("supabase/migrations/0021_super_admin_operational_rls.sql"),
  exam: await file("supabase/migrations/0022_exam_access_identity.sql"),
};
const sources = {
  entitlements: await file("src/lib/entitlements.ts"),
  capabilities: await file("src/lib/capabilities.ts"),
  platform: await file("src/lib/platform.ts"),
  operations: await file("src/app/admin/operations/page.tsx"),
  accessCard: await file("src/components/ExaminationAccessCard.tsx"),
  linkApi: await file("src/app/api/exam/link-access/route.ts"),
  joinClient: await file("src/app/exam/join/[token]/JoinClient.tsx"),
  invitations: await file("src/app/admin/examinations/invitations/page.tsx"),
  dashboardCreate: await file("src/app/dashboard/exams/actions.ts"),
  adminCreate: await file("src/app/admin/examinations/actions.ts"),
  dashboardDetail: await file("src/app/dashboard/exams/[id]/page.tsx"),
  livekit: await file("src/app/api/livekit/token/route.ts"),
};

check("Institutional migration defines institutional capabilities", migrations.institutional.includes("'institutional', true") && migrations.institutional.includes("configurable_limits"));
check("Super Admin RLS migration covers exams and quizzes", migrations.rls.includes("exam_write") && migrations.rls.includes("quiz_write") && migrations.rls.includes("is_super_admin()"));
check("Exam identity migration defines persisted access link and unique code default", migrations.exam.includes("access_link text") && migrations.exam.includes("evalora_unique_exam_code"));
check("Centralized entitlement wrapper exists", sources.entitlements.includes("getEntitlementFor") && sources.capabilities.includes("getCapabilities"));
check("Feature flags have session-aware owner bypass", sources.platform.includes("isFeatureEnabledFor") && sources.platform.includes("ownerBypass"));
check("Operational workspace includes Class Management and audited entry", sources.operations.includes("/dashboard/academics/classes") && sources.operations.includes("enterOrgWorkspace"));
check("Exam access card has all three copy actions", ["Copy link", "Copy code", "Copy complete invitation"].every((s) => sources.accessCard.includes(s)));
check("Link API enforces code hash, registered students and configured class allowlist", sources.linkApi.includes("access_code_hash") && sources.linkApi.includes("registered_students_only") && sources.linkApi.includes("mergeEligibleClassIds"));
check("Candidate client requires identity fields and registered-account notice", sources.joinClient.includes("identityFields") && sources.joinClient.includes("requiresAccount") && sources.joinClient.includes("identity,"));
check("Invitation admin configures identity and class eligibility", sources.invitations.includes("identity_fields") && sources.invitations.includes("eligible_class_ids"));
check(
  "Exam creation relies on DB-generated code and persists link",
  /status:\s*"draft",\s*settings:/.test(sources.dashboardCreate)
    && sources.dashboardCreate.includes('.select("id, access_code, invite_token, access_link")')
    && !/status:\s*"draft",\s*access_code:/.test(sources.dashboardCreate)
    && sources.adminCreate.includes("status,\n      settings:")
    && sources.adminCreate.includes('.select("id, access_code, invite_token, access_link")')
    && !sources.adminCreate.includes("status,\n      access_code:"),
);
check("Dashboard exam detail renders examination access card", sources.dashboardDetail.includes("ExaminationAccessCard"));
check("LiveKit proctoring uses owner-aware feature check and centralized entitlement", sources.livekit.includes("ownerBypass") && sources.livekit.includes("getEntitlementFor"));

const failed = results.filter((r) => !r.passed);
console.log(`Additional requirements: ${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  for (const f of failed) console.error(`FAIL ${f.name}`);
  process.exit(1);
}
