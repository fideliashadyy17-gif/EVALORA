import "server-only";

import { randomUUID } from "node:crypto";
import {
  AccessToken,
  RoomServiceClient,
  TokenVerifier,
  TrackSource,
} from "livekit-server-sdk";

export type LiveKitEnvVarName =
  | "LIVEKIT_API_KEY"
  | "LIVEKIT_API_SECRET"
  | "NEXT_PUBLIC_LIVEKIT_URL";

export interface LiveKitEnvStatus {
  /** True only when all 3 required env vars are non-empty and the URL is valid. */
  configured: boolean;
  present: Record<LiveKitEnvVarName, boolean>;
  missing: LiveKitEnvVarName[];
  urlValid: boolean;
  /** Public WebSocket URL for browser clients (e.g. wss://...livekit.cloud). */
  wsUrl: string | null;
  /** Public HTTP(S) URL for LiveKit server Twirp & /rtc/validate calls. */
  httpUrl: string | null;
  /** Public LiveKit hostname (no credentials, no path). */
  host: string | null;
}

export interface LiveKitCheckResult {
  ok: boolean;
  detail: string;
  httpStatus?: number;
}

export interface LiveKitVerificationReport {
  ok: boolean;
  checkedAt: string;
  latencyMs: number;
  env: LiveKitEnvStatus;
  checks: {
    env: LiveKitCheckResult;
    tokenSigning: LiveKitCheckResult;
    cloudApiAuth: LiveKitCheckResult & { activeRooms?: number };
    candidateSignal: LiveKitCheckResult;
    supervisorSignal: LiveKitCheckResult;
    roomLifecycle?: LiveKitCheckResult;
  };
}

/**
 * Normalize a configured LiveKit server URL into its WebSocket (`wss://`/`ws://`)
 * and HTTP (`https://`/`http://`) forms. Never exposes secrets.
 */
export function parseLiveKitServerUrl(raw: string | undefined | null): {
  valid: boolean;
  wsUrl: string | null;
  httpUrl: string | null;
  host: string | null;
} {
  const trimmed = (raw ?? "").trim().replace(/\/+$/, "");
  if (!trimmed) return { valid: false, wsUrl: null, httpUrl: null, host: null };
  try {
    const parsed = new URL(trimmed);
    if (!["wss:", "ws:", "https:", "http:"].includes(parsed.protocol) || !parsed.host) {
      return { valid: false, wsUrl: null, httpUrl: null, host: null };
    }
    const isSecure = parsed.protocol === "wss:" || parsed.protocol === "https:";
    const pathPart = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/+$/, "");
    const wsUrl = `${isSecure ? "wss:" : "ws:"}//${parsed.host}${pathPart}`;
    const httpUrl = `${isSecure ? "https:" : "http:"}//${parsed.host}${pathPart}`;
    return { valid: true, wsUrl, httpUrl, host: parsed.host };
  } catch {
    return { valid: false, wsUrl: null, httpUrl: null, host: null };
  }
}

/**
 * Inspect LiveKit runtime environment configuration without ever exposing
 * API keys, secrets, or tokens.
 */
export function getLiveKitEnvStatus(
  env: Record<string, string | undefined> = process.env,
): LiveKitEnvStatus {
  const key = (env.LIVEKIT_API_KEY ?? "").trim();
  const secret = (env.LIVEKIT_API_SECRET ?? "").trim();
  const rawUrl = (env.NEXT_PUBLIC_LIVEKIT_URL ?? "").trim();
  const parsedUrl = parseLiveKitServerUrl(rawUrl);

  const present: Record<LiveKitEnvVarName, boolean> = {
    LIVEKIT_API_KEY: key.length > 0,
    LIVEKIT_API_SECRET: secret.length > 0,
    NEXT_PUBLIC_LIVEKIT_URL: rawUrl.length > 0,
  };
  const missing = (Object.keys(present) as LiveKitEnvVarName[]).filter(
    (name) => !present[name],
  );

  return {
    configured: missing.length === 0 && parsedUrl.valid,
    present,
    missing,
    urlValid: parsedUrl.valid,
    wsUrl: parsedUrl.wsUrl,
    httpUrl: parsedUrl.httpUrl,
    host: parsedUrl.host,
  };
}

export function isLiveKitConfigured(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return getLiveKitEnvStatus(env).configured;
}

/**
 * Read trimmed LiveKit credentials strictly for server-side signing/SDK calls.
 * Never return the output of this function to any client or log it.
 */
export function readLiveKitCredentials(
  env: Record<string, string | undefined> = process.env,
): { apiKey: string; apiSecret: string; wsUrl: string; httpUrl: string; host: string } | null {
  const apiKey = (env.LIVEKIT_API_KEY ?? "").trim();
  const apiSecret = (env.LIVEKIT_API_SECRET ?? "").trim();
  const parsed = parseLiveKitServerUrl(env.NEXT_PUBLIC_LIVEKIT_URL);
  if (!apiKey || !apiSecret || !parsed.valid || !parsed.wsUrl || !parsed.httpUrl || !parsed.host) {
    return null;
  }
  return {
    apiKey,
    apiSecret,
    wsUrl: parsed.wsUrl,
    httpUrl: parsed.httpUrl,
    host: parsed.host,
  };
}

const CANDIDATE_PUBLISH_SOURCES: TrackSource[] = [
  TrackSource.CAMERA,
  TrackSource.MICROPHONE,
  TrackSource.SCREEN_SHARE,
  TrackSource.SCREEN_SHARE_AUDIO,
];

async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
  fetchImpl: typeof fetch,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Verify end-to-end LiveKit configuration and LiveKit Cloud interoperability
 * without leaking any credential or JWT.
 *
 * Checks:
 *  1. Environment variables present & LiveKit URL valid.
 *  2. Candidate (camera/mic/screen-share publish, no subscribe) and supervisor
 *     (subscribe-only, no publish) tokens sign and verify cleanly via SDK.
 *  3. Authenticated `RoomServiceClient.listRooms()` against LiveKit Cloud.
 *  4. Browser signaling validation (`/rtc/validate`) on LiveKit Cloud for both
 *     candidate and supervisor tokens.
 *  5. Optional ephemeral room lifecycle test (`createRoom` → `listRooms` →
 *     `deleteRoom`) when `testRoomLifecycle: true` (Super Admin diagnostic).
 */
export async function verifyLiveKitIntegration(options?: {
  testRoomLifecycle?: boolean;
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  roomService?: Pick<RoomServiceClient, "listRooms" | "createRoom" | "deleteRoom">;
}): Promise<LiveKitVerificationReport> {
  const started = Date.now();
  const envMap = options?.env ?? process.env;
  const fetchImpl = options?.fetchImpl ?? fetch;
  const envStatus = getLiveKitEnvStatus(envMap);
  const creds = readLiveKitCredentials(envMap);

  if (!envStatus.configured || !creds) {
    const envDetail = envStatus.missing.length
      ? `Missing environment variable(s): ${envStatus.missing.join(", ")}`
      : "NEXT_PUBLIC_LIVEKIT_URL is not a valid wss:// or ws:// URL";
    return {
      ok: false,
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      env: envStatus,
      checks: {
        env: { ok: false, detail: envDetail },
        tokenSigning: { ok: false, detail: "Skipped — LiveKit environment is incomplete" },
        cloudApiAuth: { ok: false, detail: "Skipped — LiveKit environment is incomplete" },
        candidateSignal: { ok: false, detail: "Skipped — LiveKit environment is incomplete" },
        supervisorSignal: { ok: false, detail: "Skipped — LiveKit environment is incomplete" },
        ...(options?.testRoomLifecycle
          ? { roomLifecycle: { ok: false, detail: "Skipped — LiveKit environment is incomplete" } }
          : {}),
      },
    };
  }

  const probeRoom = `evalora-verify-${randomUUID().slice(0, 8)}`;

  // 1. Sign & cryptographically verify both candidate and supervisor JWTs.
  let candidateJwt = "";
  let supervisorJwt = "";
  let tokenSigning: LiveKitCheckResult;
  try {
    const candidateAt = new AccessToken(creds.apiKey, creds.apiSecret, {
      identity: `candidate-verify-${randomUUID().slice(0, 8)}`,
      name: "Verification Candidate",
      ttl: 120,
    });
    candidateAt.addGrant({
      roomJoin: true,
      roomCreate: true,
      room: probeRoom,
      canPublish: true,
      canPublishSources: CANDIDATE_PUBLISH_SOURCES,
      canSubscribe: false,
      canPublishData: false,
    });
    candidateJwt = await candidateAt.toJwt();

    const supervisorAt = new AccessToken(creds.apiKey, creds.apiSecret, {
      identity: `supervisor-verify-${randomUUID().slice(0, 8)}`,
      name: "Verification Supervisor",
      ttl: 120,
    });
    supervisorAt.addGrant({
      roomJoin: true,
      roomCreate: true,
      room: probeRoom,
      canPublish: false,
      canSubscribe: true,
      canPublishData: false,
    });
    supervisorJwt = await supervisorAt.toJwt();

    const verifier = new TokenVerifier(creds.apiKey, creds.apiSecret);
    const [candClaims, supClaims] = await Promise.all([
      verifier.verify(candidateJwt),
      verifier.verify(supervisorJwt),
    ]);
    const candSources = (candClaims.video?.canPublishSources ?? []).map((s) =>
      String(s).toLowerCase(),
    );
    const hasSource = (name: string, enumVal: TrackSource) =>
      candSources.includes(name) || candSources.includes(String(enumVal));
    const grantsOk =
      candClaims.video?.room === probeRoom &&
      candClaims.video?.roomJoin === true &&
      candClaims.video?.roomCreate === true &&
      candClaims.video?.canPublish === true &&
      candClaims.video?.canSubscribe === false &&
      hasSource("camera", TrackSource.CAMERA) &&
      hasSource("microphone", TrackSource.MICROPHONE) &&
      hasSource("screen_share", TrackSource.SCREEN_SHARE) &&
      supClaims.video?.room === probeRoom &&
      supClaims.video?.roomJoin === true &&
      supClaims.video?.canPublish === false &&
      supClaims.video?.canSubscribe === true;

    tokenSigning = grantsOk
      ? {
          ok: true,
          detail:
            "Candidate (camera, mic, screen_share publish; no subscribe) and supervisor (subscribe-only) JWTs signed and verified.",
        }
      : { ok: false, detail: "Signed JWT grants did not match expected proctoring permissions." };
  } catch (err) {
    tokenSigning = {
      ok: false,
      detail: `Token signing/verification error: ${err instanceof Error ? err.message : "unknown error"}`,
    };
  }

  // 2. Authenticate to LiveKit Cloud Twirp RoomService API.
  const roomService =
    options?.roomService ?? new RoomServiceClient(creds.httpUrl, creds.apiKey, creds.apiSecret);

  let cloudApiAuth: LiveKitCheckResult & { activeRooms?: number };
  try {
    const rooms = await roomService.listRooms();
    cloudApiAuth = {
      ok: true,
      activeRooms: rooms.length,
      detail: `LiveKit Cloud authenticated RoomService API (${rooms.length} active room(s)).`,
    };
  } catch (err) {
    cloudApiAuth = {
      ok: false,
      detail: `LiveKit Cloud RoomService authentication failed: ${err instanceof Error ? err.message : "connection error"}`,
    };
  }

  // 3. Validate browser signaling handshake on LiveKit Cloud for both roles.
  const validateSignal = async (jwt: string, label: string): Promise<LiveKitCheckResult> => {
    if (!jwt) return { ok: false, detail: `Skipped — ${label} token unavailable.` };
    try {
      const validateUrl = `${creds.httpUrl}/rtc/validate?access_token=${encodeURIComponent(jwt)}&auto_subscribe=1&sdk=js&protocol=15`;
      const res = await fetchWithTimeout(validateUrl, 5000, fetchImpl);
      if (res.ok) {
        return {
          ok: true,
          httpStatus: res.status,
          detail: `LiveKit Cloud accepted ${label} WebSocket signaling token (HTTP ${res.status}).`,
        };
      }
      const errBody = (await res.text().catch(() => "")).trim().slice(0, 140);
      return {
        ok: false,
        httpStatus: res.status,
        detail: `LiveKit Cloud rejected ${label} signaling token (HTTP ${res.status}${errBody ? `: ${errBody}` : ""}).`,
      };
    } catch (err) {
      return {
        ok: false,
        detail: `Could not reach LiveKit signaling validation endpoint: ${err instanceof Error ? err.message : "network error"}`,
      };
    }
  };

  const [candidateSignal, supervisorSignal] = await Promise.all([
    validateSignal(candidateJwt, "candidate"),
    validateSignal(supervisorJwt, "supervisor"),
  ]);

  // 4. Optional ephemeral room creation + verification + cleanup test.
  let roomLifecycle: LiveKitCheckResult | undefined;
  if (options?.testRoomLifecycle) {
    try {
      const created = await roomService.createRoom({
        name: probeRoom,
        emptyTimeout: 30,
        maxParticipants: 2,
      });
      const listed = await roomService.listRooms([probeRoom]);
      const found = listed.some((r) => r.name === probeRoom);
      await roomService.deleteRoom(probeRoom);
      roomLifecycle =
        created?.name === probeRoom && found
          ? {
              ok: true,
              detail:
                "Created ephemeral LiveKit room on LiveKit Cloud, verified listing, and deleted it cleanly.",
            }
          : {
              ok: false,
              detail: "Room creation completed but the probe room was not confirmed in listRooms().",
            };
    } catch (err) {
      // Best-effort cleanup if creation succeeded before failing.
      try {
        await roomService.deleteRoom(probeRoom);
      } catch {
        // Ignore cleanup failure.
      }
      roomLifecycle = {
        ok: false,
        detail: `Room lifecycle test failed: ${err instanceof Error ? err.message : "unknown error"}`,
      };
    }
  }

  const ok =
    envStatus.configured &&
    tokenSigning.ok &&
    cloudApiAuth.ok &&
    candidateSignal.ok &&
    supervisorSignal.ok &&
    (roomLifecycle ? roomLifecycle.ok : true);

  return {
    ok,
    checkedAt: new Date().toISOString(),
    latencyMs: Date.now() - started,
    env: envStatus,
    checks: {
      env: {
        ok: true,
        detail: `All 3 LiveKit variables configured for host ${creds.host}.`,
      },
      tokenSigning,
      cloudApiAuth,
      candidateSignal,
      supervisorSignal,
      ...(roomLifecycle ? { roomLifecycle } : {}),
    },
  };
}
