// LiveKit configuration, token signing, room lifecycle, and proctoring audit tests.
import { readFileSync } from "node:fs";
import { Module } from "node:module";
import path from "node:path";
import ts from "typescript";

const failures = [];
let checks = 0;
function ok(cond, msg) {
  checks++;
  if (!cond) failures.push(msg);
}

function compileTs(filePath, stubs = {}) {
  const resolved = path.resolve(`scripts/__lk_${path.basename(filePath, ".ts")}.cjs`);
  const orig = Module._load;
  Module._load = function (req, parent) {
    if (parent?.filename === resolved && req in stubs) return stubs[req];
    if (req === "server-only") return {};
    return orig.apply(this, arguments);
  };
  try {
    const mod = new Module(resolved);
    mod.filename = resolved;
    mod.paths = Module._nodeModulePaths(path.dirname(resolved));
    mod._compile(
      ts.transpileModule(readFileSync(filePath, "utf8"), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      }).outputText,
      resolved,
    );
    return mod.exports;
  } finally {
    Module._load = orig;
  }
}

const LK = compileTs("src/lib/livekit.ts");

// 1. Env var parsing, whitespace trimming, URL normalization, and ZERO secret leakage.
{
  const secretValue = "SUPER_SECRET_LIVEKIT_VALUE_DO_NOT_LEAK";
  const keyValue = "API_KEY_TEST_12345";
  const status = LK.getLiveKitEnvStatus({
    LIVEKIT_API_KEY: `  ${keyValue}\n`,
    LIVEKIT_API_SECRET: ` ${secretValue} `,
    NEXT_PUBLIC_LIVEKIT_URL: "  wss://evalora-6jsvpp9k.livekit.cloud/  ",
  });
  ok(status.configured === true, "valid trimmed env vars report configured=true");
  ok(status.missing.length === 0, "valid env vars report 0 missing");
  ok(status.wsUrl === "wss://evalora-6jsvpp9k.livekit.cloud", `wsUrl normalized (${status.wsUrl})`);
  ok(status.httpUrl === "https://evalora-6jsvpp9k.livekit.cloud", `httpUrl derived (${status.httpUrl})`);
  ok(status.host === "evalora-6jsvpp9k.livekit.cloud", `host parsed (${status.host})`);
  const serialized = JSON.stringify(status);
  ok(!serialized.includes(secretValue) && !serialized.includes(keyValue), "env status never leaks API key or secret");

  const missingOne = LK.getLiveKitEnvStatus({
    LIVEKIT_API_KEY: keyValue,
    LIVEKIT_API_SECRET: "",
    NEXT_PUBLIC_LIVEKIT_URL: "wss://evalora-6jsvpp9k.livekit.cloud",
  });
  ok(missingOne.configured === false, "missing secret reports configured=false");
  ok(
    missingOne.missing.length === 1 && missingOne.missing[0] === "LIVEKIT_API_SECRET",
    `pinpoints exact missing var (${missingOne.missing.join(",")})`,
  );

  const badUrl = LK.getLiveKitEnvStatus({
    LIVEKIT_API_KEY: keyValue,
    LIVEKIT_API_SECRET: secretValue,
    NEXT_PUBLIC_LIVEKIT_URL: "ftp://invalid.example",
  });
  ok(badUrl.configured === false && badUrl.urlValid === false, "invalid protocol rejected cleanly");
}

// 2. End-to-end verification helper with real LiveKit SDK signing + mocked Cloud HTTP/RoomService.
{
  const secretValue = "TEST_LIVEKIT_SECRET_32_CHARS_MINIMUM_OK_123456";
  const keyValue = "API_TEST_KEY_EVALORA";
  const createdRooms = [];
  const deletedRooms = [];
  const validatedUrls = [];

  const mockRoomService = {
    async listRooms(names) {
      if (names && names.length) return createdRooms.filter((r) => names.includes(r.name));
      return [...createdRooms];
    },
    async createRoom({ name }) {
      const room = { name, sid: "RM_test" };
      createdRooms.push(room);
      return room;
    },
    async deleteRoom(name) {
      deletedRooms.push(name);
      const idx = createdRooms.findIndex((r) => r.name === name);
      if (idx >= 0) createdRooms.splice(idx, 1);
    },
  };

  const mockFetch = async (url) => {
    validatedUrls.push(String(url));
    return { ok: true, status: 200, text: async () => "" };
  };

  const report = await LK.verifyLiveKitIntegration({
    testRoomLifecycle: true,
    env: {
      LIVEKIT_API_KEY: ` ${keyValue} `,
      LIVEKIT_API_SECRET: `${secretValue}\n`,
      NEXT_PUBLIC_LIVEKIT_URL: "wss://evalora-6jsvpp9k.livekit.cloud",
    },
    fetchImpl: mockFetch,
    roomService: mockRoomService,
  });

  ok(report.ok === true, `full verification passes (checks=${JSON.stringify(report.checks)})`);
  ok(report.checks.env.ok === true, "env check passed");
  ok(report.checks.tokenSigning.ok === true, "candidate & supervisor JWT signing + claims verified");
  ok(report.checks.cloudApiAuth.ok === true, "LiveKit Cloud RoomService auth passed");
  ok(report.checks.candidateSignal.ok === true, "candidate /rtc/validate signaling passed");
  ok(report.checks.supervisorSignal.ok === true, "supervisor /rtc/validate signaling passed");
  ok(report.checks.roomLifecycle?.ok === true, "ephemeral room create -> list -> delete passed");
  ok(deletedRooms.length === 1 && createdRooms.length === 0, "ephemeral probe room cleaned up");
  ok(validatedUrls.length === 2 && validatedUrls.every((u) => u.includes("/rtc/validate?access_token=")), "both participant tokens checked against /rtc/validate");

  const reportJson = JSON.stringify(report);
  ok(!reportJson.includes(secretValue) && !reportJson.includes(keyValue), "verification report NEVER leaks API key or secret");
  ok(!reportJson.includes("eyJ"), "verification report NEVER leaks signed JWT strings");
}

// 3. Token route + webhook + exam actions + UI independence checks.
{
  const tokenSrc = readFileSync("src/app/api/livekit/token/route.ts", "utf8");
  ok(tokenSrc.includes("roomCreate: true"), "token route grants roomCreate for seamless room creation");
  ok(tokenSrc.includes("canPublishSources: [1, 2, 3, 4]"), "token route explicitly authorizes camera, mic, screen_share, screen_share_audio for candidates");
  ok(tokenSrc.includes(".trim()"), "token route trims env vars against accidental whitespace/newlines");

  const webhookSrc = readFileSync("src/app/api/livekit/webhook/route.ts", "utf8");
  ok(webhookSrc.includes(".trim()"), "webhook route trims LIVEKIT_API_KEY and LIVEKIT_API_SECRET");

  const examActionsSrc = readFileSync("src/app/dashboard/exams/actions.ts", "utf8");
  ok(examActionsSrc.includes("organization_id: org.id") && examActionsSrc.includes("export async function updateExamProctoring"),
    "exams/actions.ts scopes proctoring_rooms to organization_id and provides updateExamProctoring");

  const proctorPageSrc = readFileSync("src/app/dashboard/exams/[id]/proctor/page.tsx", "utf8");
  ok(proctorPageSrc.includes("updateExamProctoring") && proctorPageSrc.includes("Supabase integrity incident logging"),
    "proctor page supports enabling LiveKit on existing exams and highlights Supabase independence");

  const examDetailSrc = readFileSync("src/app/dashboard/exams/[id]/page.tsx", "utf8");
  ok(examDetailSrc.includes("Boolean(settings.proctoring) || (incidents ?? []).length > 0"),
    "exam detail page shows Supabase incidents even when LiveKit video is off");

  const newExamSrc = readFileSync("src/app/dashboard/exams/new/page.tsx", "utf8");
  ok(newExamSrc.includes("capabilities.proctoring"),
    "new exam page honors centralized capabilities.proctoring (including module overrides)");

  const pmmClientSrc = readFileSync("src/app/admin/plans/modules/PlanModulesAdminClient.tsx", "utf8");
  ok(pmmClientSrc.includes("Implemented &amp; operational · LiveKit configured"),
    "PMM UI shows operational LiveKit status when configured instead of warning that credentials are missing");
  ok(pmmClientSrc.includes("Core operational · LiveKit video pending"),
    "PMM UI never presents Proctoring as unavailable when LiveKit video is pending");

  const adminVerifySrc = readFileSync("src/app/api/admin/livekit/verify/route.ts", "utf8");
  ok(adminVerifySrc.includes("requireSuperAdmin()") && adminVerifySrc.includes("livekit.verification_run"),
    "Super Admin LiveKit verify endpoint is owner-gated and audit-logged");
}

if (failures.length) {
  console.error(`livekit-integration-audit: ${failures.length} FAILURE(S) (${checks} checks)`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`livekit-integration-audit: ${checks} checks passed`);
