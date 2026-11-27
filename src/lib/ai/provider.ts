/**
 * EVALORA AI CORE — model provider abstraction.
 *
 * This module does not add a fourth HTTP client. It resolves *which* credential
 * is available for the AI core and delegates the single HTTP implementation to
 * `modelJsonTransport` in `src/lib/ai-marking.ts`, which already exists, is
 * already tested and already refuses to invent output when no key is present.
 *
 * What is added here:
 *   - the `AI_CORE_*` variable family, so the core can be pointed at a model
 *     independently of AI marking,
 *   - an honest availability report per provider (never "connected" without a
 *     key),
 *   - a bounded, structured request/response envelope for tool planning.
 *
 * There is no fallback that fabricates a plan. If nothing is configured the
 * caller is told so and offered the deterministic generator instead.
 */

import { modelJsonTransport, readProviderConfig } from "../ai-marking";

export type ProviderId = "openai" | "anthropic" | "gemini";

export const PROVIDER_IDS: ProviderId[] = ["openai", "anthropic", "gemini"];

export interface CoreProviderConfig {
  provider: ProviderId;
  model: string;
  apiKey: string;
  /** Where the credential came from, for an honest admin display. */
  source: "ai_core" | "ai_marking";
}

const CORE_DEFAULTS: Record<ProviderId, string> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-sonnet-4-5",
  gemini: "gemini-2.5-flash",
};

const CORE_KEYS: Record<ProviderId, string[]> = {
  openai: ["AI_CORE_OPENAI_API_KEY", "OPENAI_API_KEY"],
  anthropic: ["AI_CORE_ANTHROPIC_API_KEY", "ANTHROPIC_API_KEY"],
  gemini: ["AI_CORE_GEMINI_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY"],
};

const read = (env: NodeJS.ProcessEnv, key: string): string | undefined => {
  const value = env[key];
  return value && value.trim() ? value.trim() : undefined;
};

/**
 * Resolve one provider configuration.
 *
 * Precedence: an explicit `AI_CORE_PROVIDER` (with a key) wins, then the
 * organization's preferred provider when it has a credential, then AI marking's
 * own configuration. Naming a provider without a key is always a mistake, never
 * a licence to pretend.
 */
export function resolveCoreProvider(
  env: NodeJS.ProcessEnv = process.env,
  preferred?: { provider?: string | null; model?: string | null } | null,
): CoreProviderConfig | null {
  const explicit = read(env, "AI_CORE_PROVIDER")?.toLowerCase();
  const coreModel = read(env, "AI_CORE_MODEL");

  const keyFor = (provider: ProviderId) => CORE_KEYS[provider].map((k) => read(env, k)).find(Boolean);

  const order: ProviderId[] = [];
  const push = (p: string | null | undefined) => {
    if (p && (PROVIDER_IDS as string[]).includes(p) && !order.includes(p as ProviderId)) order.push(p as ProviderId);
  };
  push(explicit);
  push(preferred?.provider ?? undefined);
  push("openai");
  push("anthropic");
  push("gemini");

  for (const provider of order) {
    const key = keyFor(provider);
    if (!key) continue;
    const model =
      (explicit && provider === explicit ? coreModel : undefined) ??
      (preferred?.provider === provider && preferred?.model ? preferred.model : undefined) ??
      CORE_DEFAULTS[provider];
    return { provider, model, apiKey: key, source: "ai_core" };
  }

  const marking = readProviderConfig(env);
  if (marking) {
    return { provider: marking.provider, model: marking.model, apiKey: marking.apiKey, source: "ai_marking" };
  }
  return null;
}

export type CoreAvailability =
  | { configured: true; provider: ProviderId; model: string; source: CoreProviderConfig["source"] }
  | { configured: false; reason: string };

export const CORE_NOT_CONFIGURED =
  "No model credential is configured for the AI core on this deployment. Add AI_CORE_OPENAI_API_KEY, " +
  "AI_CORE_ANTHROPIC_API_KEY or AI_CORE_GEMINI_API_KEY (or set AI_CORE_PROVIDER with a provider key), " +
  "or configure AI marking with AI_MARKING_PROVIDER / AI_MARKING_API_KEY. Until one exists, the assistant " +
  "can still build examinations with EVALORA's deterministic generator, and nothing is presented as model output.";

export function describeCoreProvider(
  env: NodeJS.ProcessEnv = process.env,
  preferred?: { provider?: string | null; model?: string | null } | null,
): CoreAvailability {
  const config = resolveCoreProvider(env, preferred);
  if (!config) return { configured: false, reason: CORE_NOT_CONFIGURED };
  return { configured: true, provider: config.provider, model: config.model, source: config.source };
}

/** Per-provider availability, for the admin model console. Honest by design. */
export function providerStatus(env: NodeJS.ProcessEnv = process.env): { provider: ProviderId; configured: boolean; reason: string }[] {
  return PROVIDER_IDS.map((provider) => {
    const key = CORE_KEYS[provider].map((k) => read(env, k)).find(Boolean);
    return {
      provider,
      configured: Boolean(key),
      reason: key
        ? `Credential present (${CORE_KEYS[provider].find((k) => read(env, k))}).`
        : `No credential configured. Set ${CORE_KEYS[provider][0]}.`,
    };
  });
}

export interface ModelCallOptions {
  env?: NodeJS.ProcessEnv;
  preferred?: { provider?: string | null; model?: string | null } | null;
  /** Injected in tests so no request leaves the process. */
  transport?: typeof modelJsonTransport;
  /** Hard limit on the model reply, enforced after the call. */
  maxChars?: number;
}

export class CoreModelError extends Error {
  code: "unconfigured" | "provider" | "invalid_response";
  constructor(code: CoreModelError["code"], message: string) {
    super(message);
    this.name = "CoreModelError";
    this.code = code;
  }
}

export interface ModelReply {
  text: string;
  provider: ProviderId;
  model: string;
}

/**
 * One call to the configured model. Never retries with a different provider: a
 * silent provider switch would make the journal's `provider` column a lie.
 */
export async function callModel(
  input: { system: string; user: string },
  options: ModelCallOptions = {},
): Promise<ModelReply> {
  const config = resolveCoreProvider(options.env ?? process.env, options.preferred ?? null);
  if (!config) throw new CoreModelError("unconfigured", CORE_NOT_CONFIGURED);

  const transport = options.transport ?? modelJsonTransport;
  let text: string;
  try {
    text = await transport({
      provider: config.provider,
      model: config.model,
      apiKey: config.apiKey,
      system: input.system,
      user: input.user,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The model provider failed.";
    throw new CoreModelError("provider", message);
  }
  if (!text || !text.trim()) throw new CoreModelError("provider", "The model provider returned an empty response.");
  const max = options.maxChars ?? 120_000;
  if (text.length > max) throw new CoreModelError("invalid_response", "The model reply was too large to be used.");
  return { text, provider: config.provider, model: config.model };
}

/** Extracts the first JSON object from a reply that may wrap it in prose. */
export function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const attempts = [trimmed];
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) attempts.push(trimmed.slice(start, end + 1));
  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt);
    } catch {
      /* try the next shape */
    }
  }
  throw new CoreModelError("invalid_response", "The model did not return usable JSON.");
}
