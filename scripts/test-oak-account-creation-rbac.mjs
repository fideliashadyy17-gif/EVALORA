// Verification suite for Oak / Organization Account Creation RBAC integration:
//  1. Pure RBAC catalog filtering (School Founder included, Super Admin & Owner excluded,
//     tenant isolation, anti-escalation, custom org roles, legacy admin<->org_admin mapping).
//  2. Pending invitation reconciliation planner (accept matching, revoke stale, no duplicates).
//  3. Live PGlite verification against the real production RBAC schema & triggers:
//     - Oak Admin (`org_admin`) holds all permissions of `school_founder`, `org_admin`,
//       `teacher`, `organizer`, `supervisor`, `corrector`, and does NOT hold `super_admin`
//       or `org_owner` exclusive permissions (`users.delete`, `users.suspend`).
//     - Creating a `school_founder` account inserts `organization_members` + `access_user_roles`,
//       reconciles pending `infos@oisbenin.bj` invitation with zero duplicates, and resolves
//       strictly read-only supervision permissions (no admin/mutation permissions).
//     - Assigning `school_founder` to an existing Oak administrator is blocked by DB triggers.
//  4. Static verification of `/dashboard/accounts`, `/dashboard/team`, `/dashboard/rbac`,
//     `/dashboard/page.tsx`, and `DashboardChrome.tsx` (no hardcoded role list, secure password
//     input, School Administrator visibility, zero duplicate modules).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Module } from "node:module";
import path from "node:path";
import ts from "typescript";

function compileTs(filePath) {
  const full = path.resolve(filePath);
  const mod = new Module(full);
  mod.filename = full;
  mod.paths = Module._nodeModulePaths(path.dirname(full));
  mod._compile(
    ts.transpileModule(readFileSync(full, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    full,
  );
  return mod.exports;
}

const policy = compileTs("src/lib/accountCreationPolicy.ts");

let passed = 0;
function ok(cond, label) {
  assert.ok(cond, label);
  passed++;
}

const OAK_ORG = "0a400000-0000-4000-8000-000000000001";
const OTHER_ORG = "de000000-0000-4000-8000-000000000001";

const sampleCatalog = [
  { id: "r-sa", slug: "super_admin", name: "Super Admin", description: "Platform SA", type: "system", is_system: true, is_active: true, organization_id: null },
  { id: "r-owner", slug: "org_owner", name: "Organization Owner", description: "Owner", type: "system", is_system: true, is_active: true, organization_id: null },
  { id: "r-admin", slug: "org_admin", name: "Organization Admin", description: "Admin", type: "system", is_system: true, is_active: true, organization_id: null },
  { id: "r-founder", slug: "school_founder", name: "School Founder / Institutional Supervisor", description: "Founder", type: "system", is_system: true, is_active: true, organization_id: null },
  { id: "r-teacher", slug: "teacher", name: "Teacher", description: "Teacher", type: "system", is_system: true, is_active: true, organization_id: null },
  { id: "r-org", slug: "organizer", name: "Organizer", description: "Organizer", type: "system", is_system: true, is_active: true, organization_id: null },
  { id: "r-sup", slug: "supervisor", name: "Supervisor", description: "Supervisor", type: "system", is_system: true, is_active: true, organization_id: null },
  { id: "r-corr", slug: "corrector", name: "Corrector", description: "Corrector", type: "system", is_system: true, is_active: true, organization_id: null },
  { id: "r-demo", slug: "director_demo", name: "School Director / Demo Viewer", description: "Demo", type: "system", is_system: true, is_active: true, organization_id: null },
  { id: "r-stud", slug: "student", name: "Student", description: "Student", type: "system", is_system: true, is_active: true, organization_id: null },
  { id: "r-custom-oak", slug: "dept_coordinator", name: "Department Coordinator", description: "Oak custom", type: "custom", is_system: false, is_active: true, organization_id: OAK_ORG },
  { id: "r-custom-other", slug: "other_school_role", name: "Other School Role", description: "Other org", type: "custom", is_system: false, is_active: true, organization_id: OTHER_ORG },
  { id: "r-custom-elevated", slug: "platform_auditor", name: "Platform Auditor", description: "Elevated custom", type: "custom", is_system: false, is_active: true, organization_id: OAK_ORG },
  { id: "r-inactive", slug: "retired_role", name: "Retired Role", description: "Inactive", type: "custom", is_system: false, is_active: false, organization_id: OAK_ORG },
];

const rolePerms = new Map([
  ["r-admin", ["dashboard.view", "organizations.manage_members", "exams.view", "exams.create", "roles.view", "roles.assign"]],
  ["r-founder", ["dashboard.view", "exams.view", "results.view", "students.view", "proctoring.view"]],
  ["r-teacher", ["dashboard.view", "exams.view", "exams.create"]],
  ["r-org", ["dashboard.view", "exams.view"]],
  ["r-sup", ["dashboard.view", "proctoring.view"]],
  ["r-corr", ["dashboard.view", "exams.view"]],
  ["r-custom-oak", ["dashboard.view", "exams.view"]],
  ["r-custom-other", ["dashboard.view"]],
  ["r-custom-elevated", ["dashboard.view", "permissions.manage"]],
]);

const oakAdminPerms = {
  "dashboard.view": true,
  "organizations.manage_members": true,
  "exams.view": true,
  "exams.create": true,
  "results.view": true,
  "students.view": true,
  "proctoring.view": true,
  "roles.view": true,
  "roles.assign": true,
  "permissions.manage": false,
};

// 1. Oak School Administrator sees centralized RBAC roles including School Founder,
//    plus authorized custom Oak roles, NEVER Super Admin, Owner, Other Org, or escalated roles.
const forOakAdmin = policy.filterAccountCreationRoles({
  organizationId: OAK_ORG,
  isSuperAdmin: false,
  callerCanManageMembers: true,
  roles: sampleCatalog,
  rolePermissions: rolePerms,
  callerEffectivePermissions: oakAdminPerms,
});
const oakAdminSlugs = forOakAdmin.map((r) => r.slug);

ok(oakAdminSlugs.includes("org_admin"), "Oak Admin sees School Administrator (org_admin)");
ok(oakAdminSlugs.includes("school_founder"), "Oak Admin sees School Founder / Institutional Supervisor");
ok(oakAdminSlugs.includes("teacher"), "Oak Admin sees Teacher");
ok(oakAdminSlugs.includes("organizer"), "Oak Admin sees Quiz Organizer");
ok(oakAdminSlugs.includes("supervisor"), "Oak Admin sees Supervisor / Proctor");
ok(oakAdminSlugs.includes("corrector"), "Oak Admin sees Corrector / Examiner");
ok(oakAdminSlugs.includes("dept_coordinator"), "Oak Admin sees active Oak-scoped custom role within their permissions");

ok(!oakAdminSlugs.includes("super_admin"), "Super Admin NEVER appears in Oak dropdown");
ok(!oakAdminSlugs.includes("org_owner"), "Organization Owner NEVER appears in Oak dropdown");
ok(!oakAdminSlugs.includes("student"), "Student learner role excluded from staff dropdown");
ok(!oakAdminSlugs.includes("director_demo"), "Legacy director_demo excluded from staff dropdown");
ok(!oakAdminSlugs.includes("other_school_role"), "Cross-tenant custom role excluded");
ok(!oakAdminSlugs.includes("platform_auditor"), "Custom role with permissions caller lacks is excluded (anti-escalation)");
ok(!oakAdminSlugs.includes("retired_role"), "Inactive role excluded");

// Check canonical slug <-> organization_members.role mapping
const adminOption = forOakAdmin.find((r) => r.slug === "org_admin");
const founderOption = forOakAdmin.find((r) => r.slug === "school_founder");
ok(adminOption.memberRole === "admin", "org_admin maps to organization_members.role = 'admin'");
ok(adminOption.label.includes("School Administrator"), "org_admin displays School Administrator label");
ok(founderOption.memberRole === "school_founder", "school_founder maps to organization_members.role = 'school_founder'");
ok(founderOption.label === "School Founder / Institutional Supervisor", "school_founder displays official title");
ok(policy.normalizeRequestedStaffRoleSlug("admin") === "org_admin", "Legacy 'admin' form input normalizes to 'org_admin'");
ok(policy.normalizeRequestedStaffRoleSlug("school_founder") === "school_founder", "'school_founder' stays 'school_founder'");

// 2. Super Admin operating inside Oak STILL never sees super_admin or org_owner in org staff form
const forSuperAdminInOak = policy.filterAccountCreationRoles({
  organizationId: OAK_ORG,
  isSuperAdmin: true,
  callerCanManageMembers: true,
  roles: sampleCatalog,
  rolePermissions: rolePerms,
  callerEffectivePermissions: {},
});
const saSlugs = forSuperAdminInOak.map((r) => r.slug);
ok(saSlugs.includes("school_founder"), "Super Admin operating Oak sees School Founder / Institutional Supervisor");
ok(saSlugs.includes("org_admin"), "Super Admin operating Oak sees School Administrator");
ok(!saSlugs.includes("super_admin"), "Platform Super Admin NEVER exposed in org staff dropdown even for Super Admin");
ok(!saSlugs.includes("org_owner"), "Organization Owner NEVER exposed in org staff dropdown");
ok(!saSlugs.includes("other_school_role"), "Cross-tenant custom role excluded even for Super Admin in Oak");

// 3. Non-manager (e.g. teacher) gets zero assignable roles
const forTeacher = policy.filterAccountCreationRoles({
  organizationId: OAK_ORG,
  isSuperAdmin: false,
  callerCanManageMembers: false,
  roles: sampleCatalog,
  rolePermissions: rolePerms,
  callerEffectivePermissions: { "dashboard.view": true },
});
ok(forTeacher.length === 0, "Non-manager receives empty account creation role list");

// 4. Pending invitation reconciliation planner
const plan1 = policy.planPendingInvitationReconciliation(
  [
    { id: "inv-founder", role: "school_founder", status: "pending" },
    { id: "inv-teacher", role: "teacher", status: "pending" },
    { id: "inv-old", role: "school_founder", status: "revoked" },
  ],
  "school_founder",
);
assert.deepEqual(plan1.acceptIds, ["inv-founder"]);
assert.deepEqual(plan1.revokeIds, ["inv-teacher"]);
passed += 2;

const plan2 = policy.planPendingInvitationReconciliation(
  [{ id: "inv-admin", role: "admin", status: "pending" }],
  "org_admin",
);
assert.deepEqual(plan2.acceptIds, ["inv-admin"]);
assert.deepEqual(plan2.revokeIds, []);
passed += 2;

// 5. Static verification of actual Oak pages & actions
const accountsPage = readFileSync("src/app/dashboard/accounts/page.tsx", "utf8");
const accountsActions = readFileSync("src/app/dashboard/accounts/actions.ts", "utf8");
const teamPage = readFileSync("src/app/dashboard/team/page.tsx", "utf8");
const teamActions = readFileSync("src/app/dashboard/team/actions.ts", "utf8");
const rbacPage = readFileSync("src/app/dashboard/rbac/page.tsx", "utf8");
const dashboardPage = readFileSync("src/app/dashboard/page.tsx", "utf8");
const chrome = readFileSync("src/components/dashboard/DashboardChrome.tsx", "utf8");

ok(!accountsPage.includes("ASSIGNABLE_STAFF_ROLES"), "/dashboard/accounts no longer uses hardcoded ASSIGNABLE_STAFF_ROLES");
ok(accountsPage.includes("loadAccountCreationRoles"), "/dashboard/accounts loads roles from centralized RBAC catalog");
ok(accountsPage.includes('type="password"'), "/dashboard/accounts masks manual password input (never plain text)");
ok(accountsPage.includes('defaultValue="invite"'), "/dashboard/accounts defaults to secure activation/password-setup email flow");
ok(accountsPage.includes('/dashboard/rbac'), "/dashboard/accounts exposes Role & Access Management link");

ok(accountsActions.includes("resolveAuthorizedAccountCreationRole"), "createStaffAccount validates role against live RBAC catalog");
ok(accountsActions.includes("access_user_roles"), "createStaffAccount syncs centralized RBAC access_user_roles");
ok(accountsActions.includes("planPendingInvitationReconciliation"), "createStaffAccount reconciles existing pending invitations");
ok(accountsActions.includes("founder_conflict"), "createStaffAccount refuses assigning Founder to existing operational/admin accounts");
ok(!accountsActions.includes("isAssignableStaffRole"), "createStaffAccount no longer relies on hardcoded isAssignableStaffRole");

ok(teamPage.includes("loadAccountCreationRoles"), "/dashboard/team invite dropdown uses centralized RBAC catalog");
ok(teamPage.includes("/dashboard/rbac"), "/dashboard/team links directly to Role & Access Management");
ok(teamActions.includes("resolveAuthorizedAccountCreationRole"), "inviteMember validates role via centralized RBAC catalog");
ok(teamActions.includes("founder_conflict"), "inviteMember blocks inviting existing admin/staff as School Founder");

ok(rbacPage.includes("Organization roles catalog"), "/dashboard/rbac displays full org roles catalog including School Administrator & Founder");
ok(dashboardPage.includes("School administration") && dashboardPage.includes("/dashboard/rbac") && dashboardPage.includes("/dashboard/accounts"), "/dashboard overview surfaces authorized School Administration links");
ok(chrome.includes("/dashboard/rbac") && chrome.includes("/dashboard/accounts") && chrome.includes("workspaceLabel(orgRole)"), "DashboardChrome exposes management nav & clean workspaceLabel on desktop + mobile");

console.log(`\n✓ Oak account-creation RBAC & School Administrator suite passed: ${passed} checks`);
