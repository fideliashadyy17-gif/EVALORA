import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/server";
import { accessCodeMatches } from "@/lib/exam-access";
import { parseLockdownSettings } from "@/lib/lockdown";
import { createLockdownChallengeNonce, LOCKDOWN_CHALLENGE_TTL_MS, validateLockdownPublicKey } from "@/lib/lockdownAttestation";

const Body = z.object({
  exam_code: z.string().trim().min(4).max(32),
  candidate_binding: z.string().regex(/^[0-9a-f]{64}$/),
  session_id: z.string().trim().min(4).max(120),
  public_key_pem: z.string().max(4096),
  platform: z.enum(["win32", "darwin", "linux"]),
  app_version: z.string().min(1).max(32),
}).strict();

const CHALLENGE_EXAM_CACHE_TTL_MS = 15_000;
const CHALLENGE_EXAM_CACHE_MAX = 128;

interface CachedChallengeExam {
  id: string;
  access_code: string | null;
  settings: Record<string, unknown> | null;
}

const challengeExamCache = new Map<string, { value: CachedChallengeExam; expiresAt: number }>();
const challengeExamInflight = new Map<string, Promise<CachedChallengeExam | null>>();

function serviceRoleScope(admin: unknown): string | null {
  if (!admin || typeof admin !== "object") return null;
  const url = (admin as { supabaseUrl?: unknown }).supabaseUrl;
  const key = (admin as { supabaseKey?: unknown }).supabaseKey;
  const serviceKey = typeof process !== "undefined" ? process.env?.SUPABASE_SERVICE_ROLE_KEY : undefined;
  return typeof url === "string" && url.length > 0 && serviceKey && key === serviceKey ? url : null;
}

async function resolveExamForChallenge(
  admin: ReturnType<typeof createAdminClient>,
  examCode: string,
): Promise<CachedChallengeExam | null> {
  const fetchUncached = async (): Promise<CachedChallengeExam | null> => {
    const { data: exact } = await admin.from("exams").select("id,access_code,settings").eq("access_code", examCode).maybeSingle();
    if (exact) return exact as CachedChallengeExam;
    const { data: rows } = await admin.from("exams").select("id,access_code,settings").not("access_code", "is", null);
    return ((rows ?? []).find((row) => accessCodeMatches(examCode, row.access_code as string | null)) as CachedChallengeExam | undefined) ?? null;
  };

  const scope = serviceRoleScope(admin);
  if (!scope) return fetchUncached();

  const cacheKey = `${scope}::${examCode}`;
  const cached = challengeExamCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) return cached.value;

  const inflight = challengeExamInflight.get(cacheKey);
  if (inflight) return inflight;

  const promise = fetchUncached()
    .then((found) => {
      if (found) {
        if (challengeExamCache.size >= CHALLENGE_EXAM_CACHE_MAX && !challengeExamCache.has(cacheKey)) {
          const oldest = challengeExamCache.keys().next().value;
          if (oldest !== undefined) challengeExamCache.delete(oldest);
        }
        challengeExamCache.set(cacheKey, { value: found, expiresAt: Date.now() + CHALLENGE_EXAM_CACHE_TTL_MS });
      }
      return found;
    })
    .finally(() => {
      challengeExamInflight.delete(cacheKey);
    });
  challengeExamInflight.set(cacheKey, promise);
  return promise;
}

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid native challenge request." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  const publicKey = validateLockdownPublicKey(parsed.data.public_key_pem);
  if (!publicKey) return NextResponse.json({ error: "Unsupported native public key." }, { status: 400, headers: { "Cache-Control": "no-store" } });

  const admin = createAdminClient();
  const examCode = parsed.data.exam_code.toUpperCase();
  const exam = await resolveExamForChallenge(admin, examCode);
  if (!exam) return NextResponse.json({ error: "Examination not found." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  const settings = (exam.settings ?? {}) as Record<string, unknown>;
  const lockdown = parseLockdownSettings(settings.lockdown);
  if (!lockdown.enabled || !lockdown.require_app)
    return NextResponse.json({ error: "This examination does not require a Secure Browser challenge." }, { status: 409, headers: { "Cache-Control": "no-store" } });
  if (parsed.data.app_version.localeCompare(lockdown.min_app_version, undefined, { numeric: true, sensitivity: "base" }) < 0)
    return NextResponse.json({ error: "Please update the EVALORA Secure Exam Browser." }, { status: 426, headers: { "Cache-Control": "no-store" } });

  const sessionHash = createHash("sha256").update(parsed.data.session_id).digest("hex");
  const now = new Date();
  const nonce = createLockdownChallengeNonce();
  const expiresAt = new Date(now.getTime() + LOCKDOWN_CHALLENGE_TTL_MS).toISOString();
  const id = randomUUID();
  const shouldPrune = Math.random() < 0.02;

  if (typeof (admin as { rpc?: unknown }).rpc === "function") {
    const { data: rpcRes, error: rpcErr } = await admin.rpc("issue_exam_lockdown_challenge", {
      p_id: id,
      p_exam_id: exam.id,
      p_exam_code: examCode,
      p_candidate_binding: parsed.data.candidate_binding,
      p_session_id_hash: sessionHash,
      p_nonce: nonce,
      p_public_key_pem: publicKey,
      p_platform: parsed.data.platform,
      p_app_version: parsed.data.app_version,
      p_expires_at: expiresAt,
      p_prune: shouldPrune,
    });
    if (!rpcErr && rpcRes && typeof rpcRes === "object") {
      const outcome = rpcRes as { ok?: boolean; reason?: string };
      if (outcome.ok) {
        return NextResponse.json({ challenge_id: id, nonce, expires_at: expiresAt, exam_code: examCode,
          candidate_binding: parsed.data.candidate_binding, session_id: parsed.data.session_id,
          platform: parsed.data.platform, app_version: parsed.data.app_version }, { headers: { "Cache-Control": "no-store" } });
      }
      if (outcome.reason === "rate_limited") {
        return NextResponse.json({ error: "Please wait briefly before requesting another Secure Browser challenge." }, { status: 429, headers: { "Cache-Control": "no-store" } });
      }
    }
  }

  const { data: recent } = await admin.from("exam_lockdown_challenges").select("id")
    .eq("exam_id", exam.id).eq("session_id_hash", sessionHash)
    .gt("created_at", new Date(now.getTime() - 10_000).toISOString()).limit(1).maybeSingle();
  if (recent) return NextResponse.json({ error: "Please wait briefly before requesting another Secure Browser challenge." }, { status: 429, headers: { "Cache-Control": "no-store" } });
  // Probabilistic opportunistic pruning (~2% of requests) avoids write-lock contention during 1,000-student start bursts.
  if (shouldPrune) {
    await admin.from("exam_lockdown_challenges").delete().lt("expires_at", new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString());
  }
  const { error } = await admin.from("exam_lockdown_challenges").insert({
    id,
    exam_id: exam.id,
    exam_code: examCode,
    candidate_binding: parsed.data.candidate_binding,
    session_id_hash: sessionHash,
    nonce,
    public_key_pem: publicKey,
    platform: parsed.data.platform,
    app_version: parsed.data.app_version,
    expires_at: expiresAt,
  });
  if (error) {
    console.error("Could not persist one-time lockdown challenge", error.message);
    return NextResponse.json({ error: "Could not start Secure Browser verification. Please retry." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json({ challenge_id: id, nonce, expires_at: expiresAt, exam_code: examCode,
    candidate_binding: parsed.data.candidate_binding, session_id: parsed.data.session_id,
    platform: parsed.data.platform, app_version: parsed.data.app_version }, { headers: { "Cache-Control": "no-store" } });
}

// A web page may obtain a challenge, but the challenge is never authorization by itself.
// Only a signature from the per-install OS-protected key can consume it; admission also
// checks the exam and candidate credentials independently.
export async function GET() {
  return NextResponse.json({ error: "POST is required." }, { status: 405, headers: { "Cache-Control": "no-store" } });
}
