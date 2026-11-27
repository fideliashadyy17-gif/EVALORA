# Notification wording consoles (Phase 5, audit item 5.7) — 2026-11-27

Branch `arena/fb70276a-evalora`, on top of `4bc2228` of `main`. Closes audit item
**5.7 — notification text hardcoded** (`docs/PLATFORM_CONTROL_CENTER_AUDIT_2026-11-26.md`).
No migration, no stored value changed, no environment variable added.

## What was true before

The `notification_templates` table, its RLS and its `notification.templates.manage`
permission key shipped in Phase 2 — and nothing read or wrote it. Every notification
the platform sends was a literal string at its call site: payment confirmations in
`src/app/admin/actions/payments.ts`, retake decisions in `src/lib/examRetakeServer.ts`,
account and invitation notices in `src/app/admin/actions/users.ts`, and so on. The
Control Center could show what the copy *was* (read-only, `src/lib/notificationService.ts`)
but could not change it, so the only way to reword "Payment received" was a deploy.

Two things also contradicted their own documentation. `notifications.sender_name`
listed three consumers in `src/lib/config/schema.ts` and reached none of them — no
notification was ever attributed. `notifications.in_app_enabled` was reported in both consoles — by
`notificationCapabilityReport` — as "Off. The bell and the notifications page are hidden
and no in-app notification is delivered.", while every call site inserted a row
regardless.

## What shipped

### One registry, and a resolver in front of every insert

`src/lib/notificationTemplates.ts` is **dependency-free on purpose** (five existing
suites compile single source files with a bare `tsc`, and an `@/…` import in one of
them breaks the harness). It holds the fifteen real events the product sends:

`payment_submitted`, `payment_request_approved`, `payment_request_rejected`,
`payment_recorded`, `payment_verified`, `payment_refunded`, `subscription_updated`,
`organization_member_added`, `account_created`, `invitation_accepted`,
`exam_retake_requested`, `exam_retake_approved`, `exam_retake_rejected`,
`super_admin_granted`, `super_admin_revoked`

Each entry carries: `title`/`body` defaults (the **exact** strings the call sites used
to hard-code — a fresh platform renders byte-identical notifications), the
`variables()` the event supplies, an `audience` label, the `link` pattern, a
`deliveryGate` of `platform` or `organization`, and an `editableAt` scope.

Resolution is one function, `resolveTemplate(db, eventKey, organizationId, locale)`,
and every insert goes through it:

1. organization row, matching locale
2. organization row, `en`
3. platform row, matching locale
4. platform row, `en`
5. built-in default

Paused rows (`is_active = false`) and rows with empty copy are skipped at every level,
so "Reset to inherit" really removes the override instead of freezing it. The channel
is read as stored and anything outside the `in_app|email|both` constraint reads as
`in_app`. Each resolution also reports `provenance` (`organization`/`platform`/`default`),
which is what both consoles print so an administrator can tell their own wording from
the platform's from the shipped default.

### Delivery: `sendNotification`, the only writer

`src/lib/notificationDelivery.ts` composes the notification and inserts it. Every
templated call site now says:

```ts
await sendNotification(admin, {
  event: "payment_submitted",
  organizationId: org.id,
  userIds: [userId],
  values: { plan_name, billing_period, transaction_ref },
});
```

Rules it enforces, all covered by `scripts/test-notification-templates.mjs`:

- **No recipient → nothing written.** `[]`, `undefined` and `null` are one branch, not
  two; `delivered: 0`, `skipped: "no_recipients"`.
- **`userIds: []` is never "everyone".** The function has no broadcast path at all.
  Broadcasting stays a deliberate, separately audited action
  (`broadcastNotification` in `src/app/admin/actions.ts`, RPC
  `admin_broadcast_notification`), and its copy is free text by definition.
- **A missing or unknown variable fails closed.** `{{not_a_variable}}` does not render
  as an empty string and does not render as itself: the insert is refused and
  `skipped: "invalid_template"`, because silently blanking a reference number is worse
  than not sending. An unmatched `{{placeholder}}` left in edited copy is caught the
  same way.
- **A template cannot move a notification's destination.** The link comes from the
  registry (`event.link`) and renders through `renderNotificationLink` →
  `safeNotificationLink`, which returns `null` for `//host`, other schemes, backslashes,
  whitespace and control characters. Copy is editable; URLs are not.
- **Platform-gated events ignore one tenant's switch.** `payment_submitted`,
  `exam_retake_requested`, `super_admin_granted` and `super_admin_revoked` are written
  for platform recipients, so they read `notifications.in_app_enabled` from the
  **platform** scope. An organization turning notifications off stops its own people
  receiving rows; it cannot silence the queue a Super Admin works from.
- **Everything else reads the tenant's configured switch, not its module.** This was
  a deliberate reversal, and it is the one place the shipped behaviour differs from the
  obvious reading of the audit. The first version gated delivery on
  `notificationsEnabledFor(orgId)`, which is *entitlement* **and** *configuration*.
  Against the live database that meant: the `platform` module is on for the
  `institution` plan and off for `free` and `premium`, so the one organization that
  would have kept receiving notifications is Oak International School (`0a400000-…`,
  `institution`) — and EVALORA DEMO ACADEMY (`de000000-…`, `premium`), every other
  live tenant, would have stopped receiving every account, member, payment-approval
  and retake-decision notification **the moment this feature deployed**. That is not a
  wording change; it is removing a customer's notifications as a side effect of one.
  So delivery answers to `notifications.in_app_enabled` only — the switch whose meaning
  the capability report both consoles print — and the module keeps gating the *surfaces*
  exactly as it did: `notificationsEnabledFor` still drives the bell, the notifications page and both
  wording consoles, and still fails closed. Deciding that a plan without the `platform`
  module should not receive notifications is a real decision; it belongs to whoever
  defines what that module means, and it should ship on its own.

  One consequence is left exactly as it was, and is worth saying out loud: the bell is
  gated by `notificationsEnabledFor`, which is the configured switch **and** the
  `platform` module, so on a plan without that module rows are written that the tenant
  cannot see. That is pre-existing behaviour (the call sites always inserted regardless);
  Phase 5 neither creates nor hides it — see "Not done".
- **`email`-only copy is honoured as the wording in force, and then nothing is
  delivered.** No email provider exists on this deployment
  (`notifications.email_delivery_available` has `writableScopes: []` precisely so nobody
  can flip it in a console). Channel is part of the author's answer, not a filter: if a
  Super Admin writes an email-only template, the console says so in the preview
  ("What an email recipient would read — and nothing is delivered on this deployment")
  and `sendNotification` reports `skipped: "email_only_template"` with `delivered: 0`.
  Substituting the built-in copy instead would have made "email only" mean "in-app
  anyway", i.e. a setting that cannot be turned on. When a provider arrives, the
  branching point is this one function.
- **`sender_name` now reaches a notification.** `composeNotification` reads it and the
  tenant's own name, and attributes the row through the existing
  `notificationSenderFor` helper, so the popover shows who sent it. This closed the
  last inert half of the namespace; `src/lib/config/schema.ts`'s `consumedBy` for both
  `in_app_enabled` and `sender_name` now names `src/lib/notificationDelivery.ts`.

### One write door

`src/lib/notificationTemplateStore.ts` is the only module that writes
`notification_templates`. `saveNotificationTemplate`, `resetNotificationTemplate` and
`sendTemplateTest` each re-read the effective row inside the same admin transaction,
which is what lets both consoles print "This changes **3** live events" or "Already the
wording in force" honestly rather than optimistically.

The table's unique index is
`(coalesce(organization_id, nil), event_key, channel, locale) WHERE is_active`, i.e.
**per channel**, so a save that changes the channel must pause the competing rows for
the same event+locale; the store does that and reports how many rows it `superseded`.

Validation before any write, in order: title ≤ `NOTIFICATION_TITLE_MAX` (160) and body
≤ `NOTIFICATION_BODY_MAX`; channel one of `in_app|email|both`; locale one of
`en|fr|es`; every variable in the copy present in the event's `variables()`
(`unknown_variable`, naming the offender); and no variable name may contain
`password|secret|token|api_key|access_token` — the same rule
`scripts/test-platform-control-center.mjs` already pinned for the read-only view, kept
here so it also holds for what an administrator *writes*.

### Two consoles, one editor

| | Platform | Organization |
|---|---|---|
| Route | `/admin/control-center/notifications` | `/dashboard/settings/notifications` |
| Gate | `requireSuperAdmin()` + `canOperate(ctx, null, "notification.templates.manage")` | `requireUser()` → `activeOrg(ctx)` → `requireModule(entitlement, "org_settings", "/dashboard?e=module")` → `canOperate(ctx, org.id, "organizations.edit", "org_settings")` |
| Writes | platform rows (`organization_id = null`) **and** any tenant's rows | its own tenant's rows only |
| Scope | `organization_id` accepted only if UUID-shaped; anything else is rejected, never coerced | read from the session, never from a URL segment |

Both render `src/components/notifications/NotificationTemplateStudio.tsx` (server) with
one `NotificationTemplateEditor.tsx` (client) per event inside
`<details open={editing === key}>`, so the page opens collapsed and the edited event
stays open. Each editor shows: the built-in default, the wording currently in force
with its provenance, every variable the event supplies, the rendered preview, the
recipient count that a test send would reach, and the audience/channel/scope facts.

**Outcomes are returned in place, not flashed through a redirect.** Every other
Control Center form sets a flash cookie and redirects — which is right for a single
field, and wrong here: a redirect on a validation refusal would throw away the draft
the administrator just typed. The actions return
`{ ok, message?, error?, eventKey? }` and the editor renders it against the form it
came from. (This is also why the org surface is `/dashboard/settings/notifications` and
not `…/templates`: `/dashboard/settings/templates` is exam-paper templates.)

### Which module owns the organization console

`org_settings` — the module that already owns Organization Settings and the Configuration
console this page sits beside, and the module a tenant uses to flip
`notifications.in_app_enabled` for itself. The first draft gated it on `platform`, which
in `MODULE_CATALOG` means "My Platform": public platform-page management, recommended
plan Institution. That would have made a tenant's own wording editable only on the top
plan, for no reason visible anywhere in the console, and it would have contradicted the
delivery rule above (a premium tenant would keep receiving notifications it may not
reword).

Picking the module is not a free choice, because `src/lib/navModules.ts` states the rule
and `scripts/test-module-sync.mjs` enforces it in both directions: every href a catalog
module lists must appear in the sidebar **and** its page must gate on that same module
key, and every sidebar destination must be registered in the catalog — otherwise the
sidebar offers a link that redirects. So the console is registered under `org_settings`
(`surface.hrefs`), rendered in `DashboardChrome.tsx` next to Configuration
(`audience: "managers"`, `nav.orgNotificationWording`, translated en/es/fr), and the
module's `workspacePath` and Plan & Module Management description now say so
("Dashboard → Organization Settings → Configuration / Notification wording").

Both consoles also offer a **test send**, which writes one real notification row to the
acting administrator through the session client — the only insert that does not use the
service role, and the one the `notif_insert_admin` RLS policy exists for. It refuses
when the acting user has no profile or when the event's own resolution would refuse.

Every save, test send and reset is audited
(`notification_template.save|test|reset`, with event key, scope and provenance) and
followed by `revalidatePath` on the affected surfaces.

### Discovery

Nav entries: `AdminShell.tsx` section H (`admin.notificationWordingNav`, `PenSquare`
icon, translated en/es/fr) and `DashboardChrome.tsx`; links from the Control Center hub
tile, `/admin/notifications` (which needed `ButtonLink` added to its `ui` import), and
`/dashboard/settings`.

## Verification

- New suite `scripts/test-notification-templates.mjs` — **55 checks**. It reuses the
  transpiling loader from `scripts/test-platform-control-center.mjs` and runs the REAL
  registry, resolver, delivery and store modules against an in-memory `db`, with only
  the config service, the entitlement reader and the Supabase factory faked. It covers:
  every registry entry's shape and its variable/secret rules; the five-level resolution
  order including paused and empty-copy rows; channel coercion; `provenance`;
  `email`-only and out-of-constraint channels; both gates (platform events ignore a
  tenant switch, and the reverse rule — `templateScope === "platform"` implies
  `deliveryGate === "platform"`, while an organization gate implies the audience is not
  `platform_admins`); delivery refusal for no recipients, unknown variables,
  unmatched placeholders, email-only; the store's supersede/pause behaviour and its
  validation order; that the two consoles' gates are the ones above; and that the
  sidebar entry, the catalog registration and the page gate all name the same module
  (`org_settings`) with a translated label in all three dictionaries, so the console
  cannot be offered to a tenant that would be redirected away from it.
- Two existing suites were updated because the behaviour they pinned moved, not because
  they were wrong: `test-exam-retake-surfaces.mjs` asserted the literal
  `` link: `/retake/${input.request.id}` `` inside `examRetakeServer.ts` — the
  destination now lives in the registry, so the suite asserts both halves
  (`link: "/retake/{{retake_request_id}}"` and `retake_request_id: input.request.id`,
  plus the composed `Retake code:` / `Reason:` clauses and `organizationId`);
  `test-platform-redesign-audit.mjs` hard-codes route counts, now **191** `page.tsx`
  (96 admin, 58 dashboard, 37 other) for the two new consoles.
- The suites that own catalog↔sidebar parity and the module pipeline were re-run after
  the module registration: `test-module-sync.mjs` **337 checks**,
  `test-plan-modules.mjs` **214**, `test-plan-module-workspace-integration.mjs` **525**,
  `test-platform-redesign-audit.mjs` **305**, `test-score-adjustment.mjs` **16** — all
  green.
- `npm test` → **192 suites passed, 0 failed, 8 skipped — 10,517 individual checks**.
  The 8 skips are the browser/cron suites that need three production servers and
  Chromium.
- `npx tsc --noEmit` exit 0; `npx next lint` clean on the new files; production
  `npm run build` exit 0.
- Live database (Supabase `nqxqisjtbfsratgztmch`) read, not written, to check the
  blast radius before choosing the delivery gate: `notification_templates` 0 rows,
  `platform_config_values` has no `notifications.*` or `localization.*` row (so
  `in_app_enabled` is its schema default everywhere), `notifications` holds 4 rows.
  Plans: `institution` has `platform` on, `free` and `premium` off; the two live
  subscriptions are Oak International School (`institution`) and EVALORA DEMO ACADEMY
  (`premium`).

## Not done

- **No role was granted `notification.templates.manage`, and that is the finding, not a
  TODO.** Read against `public.access_has_permission`
  (`supabase/migrations/20261125120000_rbac_system.sql:136-177`): the key must exist and
  be enabled, then **any active Super Admin is allowed** — the early return comes before
  the override and role-grant branches, so no per-account grant is ever consulted on the
  platform side. The key therefore acts as a platform-wide kill switch for the console,
  which is what the page's read-only notice now says (it used to claim "your account has
  been denied", which cannot happen to a Super Admin).

  On the organization side the console gates on `organizations.edit` + the `org_settings`
  module, which is exactly what its closest sibling does — the exam-paper templates
  console gates on `organizations.edit` + `exam_templates` and does not require its own
  `question.templates.manage` either. So no grant is needed for either console to work.
  Granting the key to `org_owner`/`org_admin` would write rows nothing reads unless the
  org console is also changed to require it, and *that* change has a real consequence:
  the founder ceiling (`r.slug = 'school_founder'` denies every key that is not
  `.view`/`.analytics`/`.monitor`, enforced both in the resolver and by
  `access_founder_permission_allowed`) would lock founder-only administrators out of
  their own organization's wording. Per-role wording rights are worth having; they are an
  RBAC decision with that trade-off attached, and they belong in a change that says so.
  Five other Phase 2 keys remain ungranted and unrequired
  (`dashboard.layout.manage`, `question.templates.manage`, `reports.templates.manage`,
  `workflows.manage`).
- No email or SMS provider exists, so an `email`/`both` template writes an in-app row
  only (or nothing, for `email` alone). `notifications.email_delivery_available` stays
  report-only by design.
- **The bell stays gated on the `platform` module while delivery is not.** A tenant whose
  plan excludes `platform` (every plan but Institution today) therefore has notifications
  written that it cannot see. That asymmetry is pre-existing and was left alone on
  purpose: making delivery follow the bell would have stopped those tenants receiving
  anything at all, and making the bell follow delivery would have added UI to tenants
  that have never had it. Both are decisions about what the `platform` module means, not
  about wording, and belong to whoever owns the module catalog.
- Audit items **5.8 workflows**, **5.9 report templates** and **5.10 dashboard
  layouts** remain as they were: tables + RLS + permission key, no administrative
  surface. Item **5.11 proctoring** was delivered earlier.
