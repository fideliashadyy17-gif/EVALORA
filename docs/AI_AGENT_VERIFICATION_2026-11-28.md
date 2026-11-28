# AI agent — registration and verification evidence

Date: 2026-11-28
Project: `EVALORA` — Supabase `nqxqisjtbfsratgztmch`
Safe test organization: **EVALORA DEMO ACADEMY** (`de000000-0000-4000-8000-000000000001`, `is_demo = true`)

Every statement below was read back from the live database after the change.
Nothing here is inferred from a passing test or a successful compilation.

---

## 1. Two defects made an agent impossible to store

`ai_agents` had never contained a row, and the AI Agents screen could only render
an empty list. Both causes were found by attempting a real insert, not by reading
the code.

### The prefix could never satisfy its own column

```
ai_agents_token_prefix_check: char_length(token_prefix) between 6 and 16
generateAgentToken (before):  token.slice(0, Math.min(18, token.length))
```

`evalora_` + client + `_` is already 12–15 characters, so **every** client
produced an 18-character prefix and every insert was rejected — chatgpt, claude,
gemini, mcp, api and custom alike. Fixed: `TOKEN_PREFIX_LENGTH = 16`, with the
constant asserted against the constraint parsed from the migration, for all six
clients (`test-ai-assistant-quality.mjs`).

### The client list had drifted from the schema

```
migration:  client in ('chatgpt','claude','gemini','mcp','custom')
code:       AGENT_CLIENTS = chatgpt, claude, gemini, mcp, api, custom
```

Choosing "api" raised a 23514 that the UI could only report as a generic
failure. Fixed by `20261128120000_ai_agent_credential_constraints.sql`, applied to
production; a test now compares the two sets in both directions so neither can
drift again.

---

## 2. Configuration prerequisites (authorised, then applied)

Both were blocking verification and both were changed in the safe test org only.

| Change | Before | After |
| --- | --- | --- |
| `access_user_roles` for `admin@demo.evalora.example` | no rows — the owner had **no** permission at all, not even `dashboard.view` | `org_owner` assigned (row `ceec7429-7a13-48ee-8f3e-5ba928259227`) |
| `subscriptions.modules_override` for DEMO | `null`; Premium has `ai_assistant: false` by design | `{"ai_assistant": true}` |

The module override is a merge, and that was verified rather than assumed:
**42 module keys before, 42 after**, with only `ai_assistant` flipped. Oak keeps
Institution tiering; Premium keeps `false` at plan level — no pricing or plan
definition was altered.

---

## 3. The registered agent

```
id            9a415c16-eb6e-4486-bc34-8bc0a1e52e5d
name          EVALORA Assistant (API)
client        api
status        approved
organization  EVALORA DEMO ACADEMY
owner / creator / approver   de000000-…-000000000065 (admin@demo.evalora.example)
token_prefix  evalora_api_NTyj   (16 chars — inside the constraint)
token_digest  64 hex chars (SHA-256); the plaintext was never written anywhere
allowed       9 permissions: dashboard.view, exams.view, questions.view,
              quizzes.view, grading.view, reports.view, exams.create,
              questions.create, quizzes.create
denied        none
limits        60 calls/min, 2000 calls/day
```

### Authentication resolves

```sql
select * from ai_resolve_agent('<correct digest>');
```

Returns exactly that agent: id, organization, owner, status `approved`, the nine
permissions, the limits. A wrong digest (`repeat('0',64)`) and a fabricated one
(`repeat('f',64)`) both return **0 rows** — an unapproved or unknown credential
cannot resolve.

### Least privilege is enforced by data, not by trust

The owner holds more than the agent was given. Effective rights are the
intersection of "in the agent's narrowing list" and "the owner actually holds":

| permission | in agent list | owner holds | effective |
| --- | --- | --- | --- |
| `exams.view` | yes | yes | **yes** |
| `questions.create` | yes | yes | **yes** |
| `exams.edit` | no | yes | no |
| `results.publish` | no | yes | no |
| `grading.validate` | no | yes | no |
| `ai.manage_agents` | no | yes | no |

So the agent cannot publish, mark, adjust grades, or register further agents —
even though its owner could.

### Activity is journalled

```
id 7273d717-8f4a-4bb4-bb58-b92bdd5152bf
tool get_org_context   status succeeded   risk ordinary
actor_kind agent   agent_name "EVALORA Assistant (API)"   surface api
```

### Tenant boundaries hold

| org | agent ops | human ops |
| --- | --- | --- |
| EVALORA DEMO ACADEMY | 1 | 0 |
| Oak International School | 0 | 5 |

Content counts are unchanged for the live school: Oak still has **50 exams** and
**2479 questions**, exactly as before any of this work. No Oak exam, candidate,
attempt, answer, mark, result or publication state was touched.

---

## 4. Schema and security verified in place

- Five tables present: `ai_agents`, `ai_approvals`, `ai_executions`,
  `ai_marking_proposals`, `ai_org_settings`.
- RLS enabled on all five (2–5 policies each). `ai_agents_select` =
  `is_org_member(organization_id) OR is_super_admin()`; `ai_agents_write` =
  `can_manage_org(organization_id) OR is_super_admin()`.
- `security definer` primitives present: `ai_resolve_agent`, `ai_revoke_agent`,
  `ai_claim_approval`, `ai_expire_approvals`, `ai_guard_approval_status`.
- `ai_executions.agent_id` is a real FK to `ai_agents(id)`; agent rows carry both
  `actor_user_id` (the owning human) and `agent_id`, so every agent action is
  attributable to a person.
- `rowToAgent` whitelists fields and never returns `token_digest`.

---

## 5. Correction to the earlier note

`access_has_permission` begins with
`if auth.uid() is distinct from p_user_id and not is_super_admin() then return false`.
My first permission probe called it from the SQL console, where `auth.uid()` is
null, so its `false` results were meaningless. Re-evaluating through
`_access_eval_permission` showed the real grants. The conclusion in the earlier
document — "no owner has any permission" — was true for `access_user_roles` being
empty, but the probe that "confirmed" it was invalid, and that is worth recording
rather than quietly correcting.

---

## 6. Still open

- No **question** or **examination** has been created in a safe organization
  through the assistant yet. The generator and persistence path are green in CI
  (20-question, 100-mark paper validating with `errors: []`), but writing demo
  content is a separate step and was not part of the authorised changes.
- The plaintext token for the registered agent was generated, hashed and
  discarded. `evalora_api_NTyj…` will never authenticate. Anything that needs to
  call the API must rotate the credential from `/dashboard/ai/agents`, which
  writes the new token to a one-time httpOnly cookie rather than exposing it.
- `npm test` — 199 suites, 0 failed, 10,719 checks. `tsc --noEmit`, `eslint` and
  `next build` are clean.

---

## 7. A real question and examination, end to end

Written into **EVALORA DEMO ACADEMY** only, through the same tables and
constraints the product itself uses. Nothing was fabricated: each step was
rejected until it satisfied the real rules, which is how the paper → publish →
exam dependency was found.

### The question

```
id            f36d3943-f06a-4c04-8935-138a92723ecb
type          short_answer          difficulty medium
topic         Probability / Single-event probability
prompt        A bag contains 6 counters. 2 of them are red. One counter is
              chosen at random. Write the probability that it is red, in
              simplest form.
points        1        status draft        creation_method ai_generated
options       3, of which exactly 1 is correct
```

The explanation and every option use inline LaTeX. This was verified **as
stored**, not as echoed in the JSON response: `position(chr(92)||'dfrac' in
label) = 2` and `position(chr(92)||chr(92)||'dfrac') = 0`, so the column holds
single backslashes and KaTeX renders a fraction rather than printing source.

Options are 1/3 (correct), 2/6 and 4/6 — three distinct labels with exactly one
correct, which is the duplicate-answer bug fixed in `e01697b`.

### The examination

The `lock_exam_paper_on_attach` trigger enforces a real product rule: *a new
examination requires a published paper containing only same-organization
questions*. So the chain was built in order — paper, then item, then exam:

```
quiz    d456a37c-b34b-4e18-8bbe-af9940bb06de   published   (1 item)
exam    833a3cf7-38b9-4d36-92fe-3731c63b0c05   draft
title   AI Assistant Verification — Grade 9 Probability Check
marks   1        duration 20 minutes
access  9F78EEF108, generated by evalora_unique_exam_code; hash derived by a
        trigger, 64 characters
```

Joined back through the real relationships, the question is reachable from the
exam and vice versa:

| question | paper | paper status | exam | exam status |
| --- | --- | --- | --- | --- |
| `f36d3943` (draft, 3 options, 1 correct) | `d456a37c` | published | `833a3cf7` | draft |

DEMO's exam list now holds `draft: 1` alongside its pre-existing `closed: 1`,
which is what an Exams screen showing Drafts renders.

### Oak remains untouched

```
Oak International School   50 exams   2479 questions   0 agents
```

Identical to the counts taken before any of this work. No Oak examination,
question, candidate, attempt, answer, mark, result or publication state was
modified.
