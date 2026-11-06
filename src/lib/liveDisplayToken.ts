import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed, session-scoped public-display tokens.
 *
 * The raw token is never stored. `quiz_sessions.display_token_version`
 * is embedded in the signature payload: the organizer revokes every
 * outstanding screen link by incrementing that version. The signing
 * secret is server-only environment material (a dedicated secret when
 * configured, otherwise the existing Supabase service-role secret).
 */

interface DisplayTokenPayload {
  sid: string;
  v: number;
  exp: number;
}

const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

function secret() {
  const value = process.env.LIVE_DISPLAY_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!value) throw new Error("Live display token secret is not configured.");
  return value;
}

function encode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(body: string) {
  return createHmac("sha256", secret()).update(body).digest("base64url");
}

export function createDisplayToken(
  sessionId: string,
  version: number,
  now = new Date(),
): string {
  const payload: DisplayTokenPayload = {
    sid: sessionId,
    v: Math.max(1, Math.floor(version) || 1),
    exp: Math.floor(now.getTime() / 1000) + TOKEN_TTL_SECONDS,
  };
  const body = encode(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

export function verifyDisplayToken(
  token: string | null | undefined,
  sessionId: string,
  expectedVersion: number,
  now = new Date(),
): boolean {
  if (!token) return false;
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra) return false;

  let expected: string;
  try {
    expected = sign(body);
  } catch {
    return false;
  }
  const givenBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (givenBuffer.length !== expectedBuffer.length || !timingSafeEqual(givenBuffer, expectedBuffer)) {
    return false;
  }

  try {
    const payload = JSON.parse(decode(body)) as DisplayTokenPayload;
    return (
      payload.sid === sessionId &&
      payload.v === Math.max(1, Math.floor(expectedVersion) || 1) &&
      Number.isFinite(payload.exp) &&
      payload.exp > Math.floor(now.getTime() / 1000)
    );
  } catch {
    return false;
  }
}

export function publicScreenPath(publicId: string, sessionId: string, version: number) {
  return `/live/${publicId}/screen?token=${createDisplayToken(sessionId, version)}`;
}
