// Issues a fresh agent credential ON A RUNNER, and publishes only its digest.
//
// Why this shape. The raw token cannot be handed to the development sandbox —
// there is no secure channel for it, and emailing one or pasting it into a chat
// is precisely the practice that left `evalora_api_NTyj` unusable and unrecorded.
// But the runner does not need a database connection to mint a token: the token
// is just random bytes plus a hash. So the runner mints it, writes the SHA-256 to
// the file that becomes an annotation, and never reveals the secret. The operator
// then applies that digest through the audited SQL channel. The credential exists
// in exactly one place — the runner's memory — and is consumed there.
//
// Usage: node scripts/issue-agent-credential.mjs <output-file> [client]
// Prints nothing secret. Writes: {"digest": "...", "prefix": "..."} only.

import { createHash, randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";

const outPath = process.argv[2];
const client = process.argv[3] ?? "api";
if (!outPath) {
  console.error("usage: node scripts/issue-agent-credential.mjs <output-file> [client]");
  process.exit(1);
}

// 32 bytes of entropy, the same construction `generateAgentToken` uses, so the
// credential issued here is indistinguishable from one the dashboard would issue.
const secret = randomBytes(32).toString("base64url");
const token = `evalora_${client}_${secret}`;
const digest = createHash("sha256").update(token).digest("hex");
const prefix = token.slice(0, 16);

// The only thing that leaves this process. A digest cannot be turned back into a
// token, so publishing it in a job annotation leaks nothing: it is already stored
// in Postgres in exactly this form, and `ai_resolve_agent` is granted to
// service_role alone.
writeFileSync(outPath, JSON.stringify({ digest, prefix, length: token.length, client }));

console.log("An agent credential has been minted on this runner.");
console.log(`  prefix      ${prefix}`);
console.log(`  digest      ${digest}`);
console.log(`  token length ${token.length} characters`);
console.log("");
console.log("The token itself is NOT printed and NOT written anywhere. Apply the digest");
console.log("to ai_agents.token_digest, then run scripts/live-ai-verification.mjs in the");
console.log("SAME job so the token is consumed in the process that created it.");
