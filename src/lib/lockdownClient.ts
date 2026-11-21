/** Client-side hints for the Secure Browser UI. Admission never trusts these hints. */
export function isSecureBrowserEnvironment(): boolean {
  if (typeof window === "undefined") return false;
  const api = (window as unknown as { __EVALORA_SECURE_LOCKDOWN__?: { getAttestation?: unknown } }).__EVALORA_SECURE_LOCKDOWN__;
  return Boolean(api && typeof api.getAttestation === "function");
}

export type LockdownCandidateContext = {
  first_name?: string;
  last_name?: string;
  class_id?: string;
  class_name?: string;
  guest_key?: string;
  candidate_code?: string;
  identity?: Record<string, unknown>;
};

function normalized(value: unknown): string {
  return typeof value === "string" ? value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase() : "";
}

function canonicalCandidateContext(context: LockdownCandidateContext): string {
  const identity = Object.fromEntries(
    Object.entries(context.identity ?? {})
      .filter(([key]) => key !== "lockdown_attestation")
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => [key, normalized(value)]),
  );
  return JSON.stringify([
    "EVALORA-CANDIDATE-V2",
    normalized(context.first_name), normalized(context.last_name), normalized(context.class_id),
    normalized(context.class_name), normalized(context.guest_key), normalized(context.candidate_code), identity,
  ]);
}

export async function createLockdownCandidateBinding(context: LockdownCandidateContext): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalCandidateContext(context)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function persistSecureBrowserState(): void {
  // UI-only compatibility shim. No storage/cookie marker is written or treated as proof.
}

export function extractCleanExamCode(searchParams?: URLSearchParams | null): string {
  const sp = searchParams || (typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null);
  if (!sp) return "";
  return (sp.get("code") || sp.get("^code") || sp.get("exam") || sp.get("^exam") || "")
    .replace(/\^+$/, "").trim().toUpperCase();
}
