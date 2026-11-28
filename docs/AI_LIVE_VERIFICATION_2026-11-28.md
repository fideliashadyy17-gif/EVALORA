# AI assistant — live verification against production

Date: 2026-11-28
Project: `EVALORA` — Supabase `nqxqisjtbfsratgztmch`
Production: `evalora-edu.online`
**Status: partially verified.** What was genuinely completed is stated as done,
with the measurement that establishes it. What remains blocked is stated as
blocked, with the precise reason. Nothing in this document is inferred from a
green test suite.

---

## 1. Why the previous attempt produced a false record

The earlier verification wrote its `ai_executions` row directly in SQL. That is
not evidence of anything: a journal row that no application code produced proves
that SQL can insert rows. The brief is right to call it out.

This round therefore verifies through **actual protocol calls against the deployed
application**, executed on a **GitHub Actions runner** — the only environment in
this setup with egress to production. The development sandbox returns `000` for
both `evalora-edu.online` and `nqxqisjtbfsratgztmch.supabase.co`, so every claim
it could make about the deployment would be a claim.

---

## 2. What was measured about reachability

| Probe | Result | Meaning |
| --- | --- | --- |
| sandbox → `evalora-edu.online` | `000` | no egress; sandbox cannot verify production |
| sandbox → `…supabase.co` | `000` | no egress to the database either |
| runner → `evalora-edu.online/api/mcp` (GET) | `405`, `server=evalora`, protocol `2025-06-18` | runner reaches the deployed app |
| runner → `…supabase.co/auth/v1/health` | `401` | runner reaches the database API |
| runner → `…supabase.co/rest/v1/` | `401` | reached, but **no key is available** |
| `secrets.NEXT_PUBLIC_SUPABASE_URL` in the repo | `url_present=false` | the secret does not exist |
| `secrets.SUPABASE_SERVICE_ROLE_KEY` in the repo | `key_present=false` | the secret does not exist |
| runner → MCP `tools/list` with no credential | `401`, `-32001` | anonymous access is refused |

The absence of the repository secrets is the reason no database assertion could
be made from a runner. It is a real blocker, and it is recorded as one in §6.

---

## 3. Credential rotation — completed, genuinely

The previous credential prefix `evalora_api_NTyj` (digest `39c891ea…a15fa7`) is
**no longer the active credential**.

The rotation was not simulated. The runner minted 32 random bytes, published only
their SHA-256, and that digest was applied to `ai_agents` through the audited SQL
channel. The token itself was never printed, never written to a file, never
uploaded, and never left the runner's memory — which is the only way to rotate a
credential without creating a second copy of the problem.

| Step | Evidence |
| --- | --- |
| digest published by the runner | `20ec6feff8200f72c3d23371f721c77eda97e05de069a103c56eaeb39727ebb4` |
| applied to `ai_agents` | `token_prefix` now `evalora_api_BV0v`, `token_last_rotated_at` `2026-11-28 08:01:42 UTC` |
| previous digest no longer resolves | `ai_resolve_agent('39c891ea…a15fa7')` → **0 rows** |
| new digest resolves to this agent | `ai_resolve_agent('20ec6fef…27ebb4')` → this agent |
| the endpoint refused the token *before* the digest existed | `HTTP 401` |
| the endpoint accepted it *after* | `HTTP 200`, and the job's own poll observed the transition |

The last two rows are the ones that matter: they prove the credential is validated
by the **live database**, not by anything the harness asserted about itself.

---

## 4. MCP — completed, genuinely

A real streamable-HTTP MCP client on the runner, against `https://evalora-edu.online/api/mcp`.
No stub, no replayed fixture, no constructed response.

| Check | Result |
| --- | --- |
| `initialize` | **PASS** — `protocol 2025-06-18`, `server evalora v1.0.0` |
| `capabilities.tools` advertised | **PASS** — `{tools:{listChanged:false}}` |
| `notifications/initialized` | **PASS** — `HTTP 202`, no body |
| `ping` | **PASS** — empty result object |
| unauthenticated `tools/list` | **PASS** — refused `401` / `-32001` |
| unknown but well-formed token | **PASS** — refused `401` |
| `tools/list` | **FAIL** — `0 tools offered to this credential` |
| `tools/call get_org_context` | **FAIL** — `You do not have the "exams.view" permission` |
| `tools/call list_examinations` | **FAIL** — same refusal |

The protocol layer is sound. The **authorization layer was broken for every
external agent**, and the first two failures are the discovery of this round.

### 4.1 The defect behind it (D12)

`permissionResolver` in `src/lib/ai/authz.ts` asked:

```sql
select access_has_permission(...)
```

whose definition opens with

```sql
if auth.uid() is distinct from p_user_id and not public.is_super_admin()
then return false; end if;
```

That is an identity guard for callers holding a session cookie. The resolver runs
on the **service-role client**, where `auth.uid()` is `NULL`; the guard is
therefore always true and the function returned **false for every permission and
every user**.

Measured directly on production:

| permission | `_access_eval_permission` (pure) | `access_has_permission` (guarded) |
| --- | --- | --- |
| `dashboard.view` | `true` | `false` |
| `exams.view` | `true` | `false` |
| `questions.create` | `true` | `false` |

The consequence was total, not partial: **an approved external agent could not
discover or invoke a single tool**, while the same person's browser worked
normally. The Native Assistant was unaffected because it resolves permissions
through `canOperate`, which has a real session; the agent surfaces were not.

**Fix**: the resolver now calls `_access_eval_permission`. Identity is not
inferred from the request — `authenticateAgent` resolves it from the agent's own
row and its owner, and the permission question names that resolved id explicitly.
The module half of the check (`moduleEnabled`) is unchanged, so a plan without
`ai_assistant` still refuses.

**The change was proven not to loosen isolation** before it was made. The
evaluator was asked the questions that must fail, and answered `false` to all:

| case | result |
| --- | --- |
| `nonsense.permission` | `false` |
| demo owner, **Oak** organization, `exams.edit` | `false` |
| **Oak** admin, demo organization, `exams.edit` | `false` |
| unknown user id | `false` |

---

## 5. What is verified, and how

| Area | State | Basis |
| --- | --- | --- |
| Code | **verified** | `tsc --noEmit` clean, `eslint` clean, 199 suites / 10,735 checks before this round; the new assertions fail against the pre-fix code |
| Tests | **verified** | `scripts/test-ai-assistant-quality.mjs` grew from 39 to 41 checks, including a regression test for D12 |
| Production deployment | **verified** | `evalora-edu.online/api/mcp` answers on the deployed build with the expected protocol version |
| MCP protocol | **verified** | §4 — real handshake from a runner |
| Agent authentication | **verified** | §3 — the live token resolver refused the old digest and accepted the new one |
| Permission enforcement (discovery) | **verified broken, now fixed** | §4.1 — the fix is committed; **the post-fix handshake has not yet been re-run** |
| Live database writes through the assistant | **not verified** | no key reaches a runner; see §6 |
| Native Assistant (real UI turn) | **not verified** | needs the demo password or a session; see §6 |
| Dashboard visibility of a created object | **not verified** | follows from the two rows above |
| Oak untouched | **verified by absence of writes** | no write path was exercised at all this round; Oak stands at 50 examinations / 2,479 questions / 308 attempts, unchanged |

---

## 6. Blockers, precisely

Each of these is a real restriction, not a workaround that was skipped.

**B1 — No repository secrets.** `NEXT_PUBLIC_SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` do not exist on the repository (`url_present=false`,
`key_present=false`). Without them a runner cannot read or write Postgres, so no
database-level assertion about an assistant-created object can be made from the
only environment with egress.
*Minimum action:* add those two secrets at Settings → Secrets → Actions. The
values are the project URL and the service role key already present in Vercel.

**B2 — The demo password is not held anywhere.** The Native Assistant creates
objects as an authenticated human, and the demo owner's session cannot be minted
from the service-role key without the project's JWT secret.
*Minimum action:* set one of — the `admin@demo.evalora.example` password, or the
project's JWT secret, or add `AI_VERIFY_DEMO_PASSWORD` as a repository secret.

**B3 — Post-fix handshake outstanding.** The D12 fix is committed but the
verification run that discovered it predates the fix. Re-running
`.github/workflows/live-mcp-verification.yml` against a deployment containing the
fix is what turns §4.1 from "fixed" into "verified fixed".

With B1 and B2 resolved, `scripts/live-ai-verification.mjs` already performs the
full matrix: question, examination, quiz, modification, idempotency, journal,
Oak isolation. It has never been able to execute, because it has never been given
a database credential.

---

## 7. What did not happen, stated plainly

- No question was created through the Native Assistant in production this round.
- No examination, quiz or modification was made in production this round.
- No dashboard page was opened to confirm an object appears in it.
- The `ai_executions` rows exercised here were written by the engine during the
  MCP calls above — that part is genuinely application-written — but they are
  reads and a refused write, not the content writes the brief asks about.

The earlier document in this repository claimed more than this one does. That was
the failure mode the brief identifies, and the correction is to say less and prove
more, not to say the same thing more confidently.
