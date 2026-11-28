-- ═════════════════════════════════════════════════════════════════════════════
-- Reconcile the agent credential constraints with the code that writes them.
--
-- Two independent defects made `ai_agents` un-writable, so no agent could ever
-- be registered through the product — the table has been empty since it was
-- created, and the AI Agents screen could only ever show an empty list.
--
--   1. `token_prefix` permitted 6–16 characters, but `generateAgentToken`
--      sliced the prefix to 18. `evalora_` plus a client name plus `_` is
--      already 12–15 characters, so EVERY insert was rejected by the check.
--      The code now slices to 16 (`TOKEN_PREFIX_LENGTH`, asserted against this
--      constraint by `test-ai-assistant-quality.mjs`).
--
--   2. This migration's original `client` check listed five clients and omitted
--      `api`, while `AGENT_CLIENTS` in `agents.ts` offers six. Choosing "api"
--      produced a 23514 violation the UI reported as a generic failure.
--
-- Both are widened/kept in step with the code rather than narrowed, because the
-- code is the contract the registry publishes. Additive only: no row is touched,
-- no column is dropped, and the 16-character ceiling is preserved so the stored
-- prefix can never grow into the secret.
-- ═════════════════════════════════════════════════════════════════════════════

begin;

alter table public.ai_agents
  drop constraint if exists ai_agents_client_check;

-- Exactly the clients `AGENT_CLIENTS` declares. If a new client is added to the
-- code, this constraint must be widened in the same change.
alter table public.ai_agents
  add constraint ai_agents_client_check
  check (client in ('chatgpt', 'claude', 'gemini', 'mcp', 'api', 'custom'));

-- The prefix ceiling is what keeps a stored prefix from ever approaching the
-- secret: 32 bytes of entropy as base64url is 43 characters, and the shortest
-- token (`evalora_mcp_`) is 55, so a 16-character prefix leaves at least 39
-- characters unrevealed.
alter table public.ai_agents
  drop constraint if exists ai_agents_token_prefix_check;

alter table public.ai_agents
  add constraint ai_agents_token_prefix_check
  check (token_prefix is null or char_length(token_prefix) between 6 and 16);

comment on constraint ai_agents_client_check on public.ai_agents is
  'Must stay in step with AGENT_CLIENTS in src/lib/ai/agentToken.ts.';

comment on constraint ai_agents_token_prefix_check on public.ai_agents is
  'Must stay in step with TOKEN_PREFIX_LENGTH in src/lib/ai/agentToken.ts.';

commit;
