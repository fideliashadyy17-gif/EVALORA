/**
 * Parsing rules for the `/exam` entry page.
 *
 * A candidate can arrive with three different things: the invitation link their
 * teacher sent, the invitation token alone, or the access code. This module is
 * the single place that decides what they typed, so the page never has to trust
 * the raw string and the rules can be unit-tested without a browser or a
 * database.
 *
 * Only what the candidate already holds is ever echoed back into a redirect:
 * a token (which the link itself carries) or the access code (which the join
 * page re-validates server-side). No other query parameter is forwarded, so a
 * pasted link cannot smuggle a parameter into the join page, and the target is
 * always an internal `/exam/join/<uuid>` path — never an external origin.
 */
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export type ExamEntryInput =
  | { kind: "link"; token: string; code: string | null }
  | { kind: "token"; token: string }
  | { kind: "code"; code: string }
  | { kind: "empty" }
  | { kind: "invalid" };

/** Access codes are stored as SHA-256 of the trimmed, upper-cased value. */
export function normalizeAccessCode(value: string): string {
  return value.trim().toUpperCase();
}

function firstUuid(value: string): string | null {
  const match = UUID_RE.exec(value);
  return match ? match[0].toLowerCase() : null;
}

export function parseExamEntryInput(raw: string | null | undefined): ExamEntryInput {
  const value = (raw ?? "").trim();
  if (!value) return { kind: "empty" };

  if (/^https?:\/\//i.test(value)) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return { kind: "invalid" };
    }
    const joined = /\/exam\/join\/([0-9a-f-]{36})(?:\/)?$/i.exec(url.pathname);
    if (!joined || !UUID_RE.test(joined[1])) return { kind: "invalid" };
    const code = url.searchParams.get("code");
    return {
      kind: "link",
      token: joined[1].toLowerCase(),
      code: code && code.trim() ? normalizeAccessCode(code) : null,
    };
  }

  const token = firstUuid(value);
  if (token && value.length <= 64) return { kind: "token", token };

  if (value.length >= 4 && value.length <= 32 && /^[A-Za-z0-9._-]+$/.test(value)) {
    return { kind: "code", code: normalizeAccessCode(value) };
  }

  return { kind: "invalid" };
}

/** Internal destination for a parsed input, or null when the page must explain. */
export function examEntryHref(input: ExamEntryInput): string | null {
  if (input.kind === "link")
    return `/exam/join/${input.token}${input.code ? `?code=${encodeURIComponent(input.code)}` : ""}`;
  if (input.kind === "token") return `/exam/join/${input.token}`;
  return null;
}
