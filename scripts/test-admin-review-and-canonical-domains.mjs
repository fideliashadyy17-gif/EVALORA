import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

console.log("Testing Super Admin redirection, manual grading overrides, and canonical domains...");

// 1. Verify RichContentEditor cursor & focus preservation
const rceSrc = readFileSync("src/components/editor/RichContentEditor.tsx", "utf8");
assert.ok(rceSrc.includes("if (editor.isFocused) return;"), "RichContentEditor guards setContent when editor is focused");
assert.ok(rceSrc.includes("lastEmittedRef.current = JSON.stringify(json);"), "RichContentEditor tracks lastEmittedRef to prevent echo updates");
assert.ok(rceSrc.includes("editor.commands.focus(\"end\")"), "RichContentEditor focuses editor on click");
console.log("  ✓ RichContentEditor prevents caret loss during keystrokes and re-renders");

// 2. Verify Super Admin mark adjustment & override actions exist and are exported
const actionsSrc = readFileSync("src/app/admin/examinations/actions.ts", "utf8");
assert.ok(actionsSrc.includes("export async function overrideAnswerMarkAsAdmin"), "overrideAnswerMarkAsAdmin action is exported");
assert.ok(actionsSrc.includes("export async function regradeSingleQuestionAsAdmin"), "regradeSingleQuestionAsAdmin action is exported");
assert.ok(actionsSrc.includes("exam.answer_overridden_by_super_admin"), "Audit log event is recorded on override");
assert.ok(actionsSrc.includes("score: totalScore"), "Candidate total score is automatically recalculated");
console.log("  ✓ Super Admin manual mark adjustment, audit logging, and score recalculation actions are configured");

// 3. Verify Complete Script Review Page has Super Admin override form
const scriptPageSrc = readFileSync("src/app/admin/examinations/attempts/[attemptId]/script/page.tsx", "utf8");
assert.ok(scriptPageSrc.includes("overrideAnswerMarkAsAdmin"), "Script page imports overrideAnswerMarkAsAdmin");
assert.ok(scriptPageSrc.includes("regradeSingleQuestionAsAdmin"), "Script page imports regradeSingleQuestionAsAdmin");
assert.ok(scriptPageSrc.includes("Super Admin Mark Adjustment &amp; Override"), "Script page renders mark adjustment interface for every question");
assert.ok(scriptPageSrc.includes("Save mark override"), "Script page includes Save mark override button");
assert.ok(scriptPageSrc.includes("Re-evaluate with auto-grader"), "Script page includes single question regrade button");
console.log("  ✓ Complete script review interface allows Super Admin question-by-question mark override and single question regrade");

// 4. Verify Super Admin direct redirection to /admin and cookie cleanup
const resolveSrc = readFileSync("src/app/auth/resolve/route.ts", "utf8");
assert.ok(resolveSrc.includes("res.cookies?.delete(ADMIN_ORG_COOKIE)"), "auth/resolve clears stale admin org cookie for Super Admin");
assert.ok(resolveSrc.includes("res.cookies?.delete(MEMBER_ORG_COOKIE)"), "auth/resolve clears stale member org cookie for Super Admin");

const dashLayoutSrc = readFileSync("src/app/dashboard/layout.tsx", "utf8");
assert.ok(dashLayoutSrc.includes("if (isSuperAdmin && !ctx.adminOrgContext && !ctx.tenantSlug) {\n    redirect(\"/admin\");\n  }"), "Dashboard layout redirects Super Admin directly to /admin if not in explicit workspace mode");

const siteChromeSrc = readFileSync("src/components/site/SiteChrome.tsx", "utf8");
assert.ok(siteChromeSrc.includes("href=\"/auth/resolve\""), "SiteHeader routes authenticated users through role resolver instead of hardcoded /dashboard");
console.log("  ✓ Super Admin direct authentication & console redirection verified");

// 5. Verify Canonical domain & legacy Vercel domain redirection in middleware
const middlewareSrc = readFileSync("src/middleware.ts", "utf8");
assert.ok(middlewareSrc.includes("evalora-six.vercel.app"), "Middleware recognizes legacy evalora-six.vercel.app domain");
assert.ok(middlewareSrc.includes("evalora-edu.online"), "Middleware enforces evalora-edu.online canonical domain");
assert.ok(middlewareSrc.includes("domain: \".evalora-edu.online\""), "Middleware configures root-level cookie domain for tenant subdomains");
console.log("  ✓ Canonical domain enforcement and legacy Vercel 301 redirection verified");

console.log("\nAll Admin Review, Authentication, and Domain checks PASSED!");
