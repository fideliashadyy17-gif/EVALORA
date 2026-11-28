# AI assistant — live verification against production data

Date: 2026-11-28
Project: `EVALORA` — Supabase `nqxqisjtbfsratgztmch`
Production: `evalora-edu.online` on deployment `dpl_DBhFZ4ktaXDfcWr36DsBFuBZ4zMy`
(commit `15a119f` — the merge of PR #121).

This records what was **read from the live database**, not what was reasoned about.
Where the brief asked for proof, this is the proof; where it could not be
obtained, this says so plainly rather than substituting a claim.

---

## 1. The false success was real, and it happened to a real user

`ai_executions` held five rows, all in **Oak International School**, all by
`ayofajemirokun@gmail.com` (`platform_role: user`), all on surface `native`:

| tool | status | result_summary |
| --- | --- | --- |
| `create_examination` | `succeeded` | `{errors: array(6), totals: …, warnings: array(0)}` |
| `create_examination` | `succeeded` | `{errors: array(6), totals: …, warnings: array(0)}` |
| `generate_question` | `failed` | `{}` (`invalid_arguments`) |
| `generate_question` | `failed` | `{}` (`invalid_arguments`) |
| `get_org_context` | `succeeded` | — |

The content tables agree with the journal, not with what the teacher was told:

```sql
select count(*) from exams     where created_at >= '2026-11-27';  -- 0
select count(*) from questions where created_at >= '2026-11-27';  -- 0
```

Two papers were reported created. Nothing was created. This is the exact failure
Part 1C describes, caught in production rather than in a thought experiment.

**Fixed** in `302c71e` (merged as PR #121): the engine now branches on
`result.ok === false`, journals `failed`/`denied` with the tool's own code, and
returns `ok: false` instead of `ok: true`. `ToolResult` is now a union so a
handler cannot launder a refusal through a cast — the earlier `ok: true`-only
type is why this was possible, and why both refusing handlers used
`as unknown as ToolResult`.

**The same instruction, replayed against the fixed generator:**

> Create a Grade 9 MYP Mathematics examination on algebraic expressions, linear
> equations and sequences, 90 minutes, 2 sections, 100 marks

→ 20 questions, 100 marks exactly, `validateProposedExam` returns `ok: true` with
`errors: []`, sections 66 + 34 marks, difficulty 7 easy / 8 medium / 5 hard.
The six errors were the topic-drift and mark-distribution defects already fixed;
the engine fix is what makes any future failure honest instead of silent.

---

## 2. Agent registration: infrastructure is sound, data prerequisites are not

Everything the brief asks to verify about the *mechanism* checks out:

- Tables present: `ai_agents`, `ai_approvals`, `ai_executions`,
  `ai_marking_proposals`, `ai_org_settings`.
- RLS **enabled on all five** (`relrowsecurity = true`), 2–5 policies each;
  `ai_agents_select` = `is_org_member(organization_id) OR is_super_admin()`,
  `ai_agents_write` = `can_manage_org(organization_id) OR is_super_admin()`.
- Auth primitives present as `security definer`:
  `ai_resolve_agent(p_token_digest)`, `ai_revoke_agent`, `ai_claim_approval`,
  `ai_expire_approvals`, `ai_guard_approval_status`.
- `rowToAgent` whitelists fields and never returns `token_digest`.
- Tokens are `evalora_<client>_<32 random bytes base64url>`, stored only as
  SHA-256 digest plus an 18-char prefix; delivery is a one-time httpOnly cookie
  (`evalora_ai_token_once`, 120 s, path-scoped) — never a URL, never the chat.

**But no agent exists, and none can be created by a holder of the module today:**

```sql
select count(*) from ai_agents;  -- 0
```

Two independent configurations block it.

### Blocker A — the safe test organization is not entitled

`EVALORA DEMO ACADEMY` (`is_demo = true`, 9 active members) is the only org that
may be used for testing. It holds an active **Premium** subscription
(`source: complimentary`, `modules_override: null`), and:

```
plans.modules->>'ai_assistant' = false
```

This is not a bug. `20261127181000_ai_assistant_plan_module.sql` set
`ai_assistant` **false for premium** and **true only for institution**, as a
deliberate tiering decision. Oak International School is Institution and does
have it, but Oak is live customer data.

### Blocker B — no organization has an owner with any permission

```sql
select o.name, count(ur.user_id) as role_assignments, count(distinct m.user_id) as members
from organizations o … group by o.name;
```

| org | role assignments | active members |
| --- | --- | --- |
| EVALORA DEMO ACADEMY | **0** | 9 |
| EVALORA Platform | **0** | 1 |
| Oak International School | 2 | 4 |

`access_user_roles` is empty for the demo owner
(`de000000-0000-4000-8000-000000000065`, `admin@demo.evalora.example`), so:

```sql
select access_has_permission('de000000-…-000000000065',
                             'de000000-…-000000000001', 'dashboard.view');  -- false
select access_has_permission(…, 'ai.manage_agents');                       -- false
select access_has_permission(…, 'exams.create');                           -- false
```

The role definitions are correct — `org_owner` and `org_admin` *do* hold
`ai.manage_agents` and `ai.use` — but the demo users were never assigned roles.
That is a demo-seeding gap, not an AI defect, and it is org-wide: the demo owner
cannot open the dashboard at all, so it is not specific to this feature.

---

## 3. What is required, exactly

Per the standing constraint: name the dependency, do not change pricing to make a
test account work, and never mutate live customer data.

**To finish Part 3/4 verification, one of these two is needed:**

1. **An entitled, permissioned test account.** Either grant
   EVALORA DEMO ACADEMY an `ai_assistant` module override — the audited path
   exists at `/admin/plans/modules` (`saveSubscriptionModules`), which writes
   only explicit keys and therefore preserves the other 40 modules
   (`entitlements` merges `{...planModules, ...overrideModules}`) — **and**
   assign `admin@demo.evalora.example` the `org_owner` role in that organization;
   **or** supply credentials for an existing Oak owner and approve plainly-scoped
   writes there, which is not recommended because Oak is live data.

2. **Explicit authorisation** to perform those two writes myself through the
   real admin paths. I have not done either, because both are commercial and
   role-configuration decisions rather than code fixes.

Once either is in place the sequence is already built and requires no code:
`/dashboard/ai/agents` → register (least-privilege defaults, or through the
`register_ai_agent` tool from the assistant) → approve → the token is shown once
→ a safe read-only tool call (`get_org_context`) proves auth, permission
filtering and activity logging, which is already wired through `executeTool`.

---

## 4. Honest status

| Requirement | State |
| --- | --- |
| Refusals no longer reported as success | **Done, deployed** (`302c71e`) |
| Generated papers validate (marks, topics, parts) | **Done, deployed** (`f09d712`) |
| Fractions rendered as mathematics; no duplicate correct option | **Done, deployed** (`e01697b`) |
| AI tables, RLS, auth functions, journal | **Verified in production** |
| Agent registered and visible in AI Agents | **Blocked** — blockers A and B |
| Agent auth / permitted tools / activity proven end-to-end | **Blocked** — needs a registered agent |
| Safe test question and exam persisted | **Blocked** for the same reason; the code path is exercised and green in CI |

No agent has been registered and no test content has been written to production by
this work. That is deliberately the honest outcome rather than a fabricated one.
