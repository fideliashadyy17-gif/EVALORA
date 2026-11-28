/**
 * EVALORA AI CORE — agent credential material.
 *
 * Kept apart from `agents.ts` so it has no server-only boundary and can be
 * exercised directly by the regression suite. Nothing here touches the database.
 */
import { createHash, randomBytes } from "node:crypto";

/**
 * The clients an agent can be registered as. Declared here (rather than in
 * `agents.ts`) so the token shape can be validated without importing the
 * server-only credential module.
 */
export const AGENT_CLIENTS = ["chatgpt", "claude", "gemini", "mcp", "api", "custom"] as const;
export type AgentClient = (typeof AGENT_CLIENTS)[number];

/**
 * How much of a token is kept in clear text, so an admin can tell two
 * credentials apart.
 *
 * `ai_agents_token_prefix_check` permits 6–16 characters. This was 18, which no
 * client name can satisfy — `evalora_api_` alone is 12, leaving 4 — so every
 * insert was rejected by the database and agent registration could never
 * succeed. The length now comes from the column's own limit, and the boundary is
 * asserted in `test-ai-assistant-quality.mjs`.
 */
export const TOKEN_PREFIX_LENGTH = 16;

/** A token has 32 bytes of entropy, is prefixed for identification, and is
 *  hashed before storage. The prefix is what an admin sees afterwards. */
export function generateAgentToken(client: AgentClient): { token: string; digest: string; prefix: string } {
  const secret = randomBytes(32).toString("base64url");
  const token = `evalora_${client}_${secret}`;
  return {
    token,
    digest: createHash("sha256").update(token).digest("hex"),
    prefix: token.slice(0, TOKEN_PREFIX_LENGTH),
  };
}

/** Same hashing the resolver expects; exported so routes do not re-implement it. */
export function digestAgentToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

