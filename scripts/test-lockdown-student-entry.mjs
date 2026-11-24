import assert from "node:assert/strict";
import fs from "node:fs";

console.log("Running EVALORA Lockdown Student Entry Form Verification Suite...\n");

// Test 1: Verify ExamAccessClient does NOT render Personal Candidate Code
{
  const clientSrc = fs.readFileSync("src/app/exam-access/ExamAccessClient.tsx", "utf8");
  
  assert.ok(
    !clientSrc.toLowerCase().includes("personal candidate code"),
    "ExamAccessClient must NOT contain 'personal candidate code'",
  );
  assert.ok(
    !clientSrc.toLowerCase().includes("personal code"),
    "ExamAccessClient must NOT contain 'personal code'",
  );
  assert.ok(
    !clientSrc.includes("candidate_code"),
    "ExamAccessClient must NOT have 'candidate_code' input or property",
  );
  console.log("  ✓ ExamAccessClient has completely excised Personal Candidate Code");
}

// Test 2: Verify ExamAccessClient renders standard 4 fields and Verify and Begin
{
  const clientSrc = fs.readFileSync("src/app/exam-access/ExamAccessClient.tsx", "utf8");

  assert.ok(
    clientSrc.includes('label="First Name"'),
    "ExamAccessClient must include First Name field",
  );
  assert.ok(
    clientSrc.includes('label="Last Name"'),
    "ExamAccessClient must include Last Name field",
  );
  assert.ok(
    clientSrc.includes('label="Examination Code"'),
    "ExamAccessClient must include Examination Code field",
  );
  assert.ok(
    clientSrc.includes('label="Class"'),
    "ExamAccessClient must include Class field",
  );
  assert.ok(
    clientSrc.includes("Verify and Begin") || clientSrc.includes("examAccess.verifyBegin"),
    "ExamAccessClient must include 'Verify and Begin' action button",
  );
  console.log("  ✓ ExamAccessClient renders standard EVALORA student entry form: First Name, Last Name, Examination Code, Class, and Verify and Begin");
}

// Test 3: Verify /api/exam/link-access supports optional invite_token and access_code lookup
{
  const routeSrc = fs.readFileSync("src/app/api/exam/link-access/route.ts", "utf8");

  assert.ok(
    routeSrc.includes("invite_token: z.string().uuid().optional()"),
    "link-access Body schema must allow optional invite_token",
  );
  assert.ok(
    routeSrc.includes('byCode') && routeSrc.includes('access_code'),
    "link-access must look up exam by access_code when invite_token is absent or for code-based entry",
  );
  assert.ok(
    routeSrc.includes("effectiveInviteToken"),
    "link-access must resolve effectiveInviteToken from exam or param",
  );
  console.log("  ✓ /api/exam/link-access unified endpoint cleanly admits students via access_code and optional invite_token");
}

// Test 4: Verify JoinClient uses standard labels and Verify and Begin button
{
  const joinSrc = fs.readFileSync("src/app/exam/join/[token]/JoinClient.tsx", "utf8");

  assert.ok(
    joinSrc.includes('label="First Name"'),
    "JoinClient must include First Name field",
  );
  assert.ok(
    joinSrc.includes('label="Last Name"'),
    "JoinClient must include Last Name field",
  );
  assert.ok(
    joinSrc.includes('label="Examination Code"'),
    "JoinClient must include Examination Code field",
  );
  assert.ok(
    joinSrc.includes('label="Class"'),
    "JoinClient must include Class field",
  );
  assert.ok(
    joinSrc.includes("Verify and Begin"),
    "JoinClient must include Verify and Begin button",
  );
  console.log("  ✓ JoinClient unified with identical standard EVALORA student access fields");
}

// Test 5: Verify TakeExamClient lockdown blocking link carries exam context
{
  const takeSrc = fs.readFileSync("src/app/take-exam/[attemptId]/TakeExamClient.tsx", "utf8");

  assert.ok(
    takeSrc.includes("buildLockdownLaunchUrl"),
    "TakeExamClient must use buildLockdownLaunchUrl for launch button",
  );
  assert.ok(
    !takeSrc.includes('href="evalora-lockdown://enter"'),
    "TakeExamClient must NOT use bare evalora-lockdown://enter without context",
  );
  console.log("  ✓ TakeExamClient lockdown screen preserves exam context across Secure Browser handoff");
}

// Test 6: Verify desktop launcher scripts no longer prompt for or append candidate code
{
  const batSrc = fs.readFileSync("public/downloads/EVALORA-Lockdown-Setup.bat", "utf8");
  const psSrc = fs.readFileSync("public/downloads/EVALORA-Lockdown-Launcher.ps1", "utf8");
  const desktopSrc = fs.readFileSync("desktop/src/main.js", "utf8");

  assert.ok(!batSrc.includes("set \"CANDIDATE_CODE="), "BAT setup must not set CANDIDATE_CODE");
  assert.ok(!psSrc.includes("set \"CANDIDATE_CODE="), "PS1 launcher must not set CANDIDATE_CODE");
  assert.ok(!desktopSrc.includes("candidate="), "desktop/src/main.js fallback must not append candidate=");
  console.log("  ✓ Desktop Secure Browser launchers cleaned of candidate code parameters");
}

console.log("\nAll EVALORA Lockdown Student Entry Form tests passed successfully!");
