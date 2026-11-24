-- Plan & Module Management (additive, backward compatible).
--
-- Adds the two storage columns behind the central module catalog
-- (src/lib/modules.ts):
--   plans.modules                    — per-plan module entitlement map
--   subscriptions.modules_override   — per-organization override
--
-- BOTH columns are nullable and receive NO default value: `null` (and any
-- missing key inside a map) resolves in application code to the module
-- defaults, which are all-true. Existing plans — including the Institution
-- plan used by Oak International School — therefore keep their exact current
-- feature set until a Super Admin explicitly turns a module off.
--
-- No rows are modified, no data is dropped or reset, RLS is untouched, and
-- the columns are excluded from anonymous/public exposure by staying inside
-- the existing authenticated read paths (plans are read by entitlement
-- resolution; subscriptions are already tenant-scoped).

alter table public.plans
  add column if not exists modules jsonb;

alter table public.subscriptions
  add column if not exists modules_override jsonb;

comment on column public.plans.modules is
  'Module entitlement map ({ key: boolean }) for Plan & Module Management. null = all catalog modules default (on).';

comment on column public.subscriptions.modules_override is
  'Per-organization module override layered above plans.modules. null = inherit plan.';

-- Intentionally NOT written: any UPDATE to existing rows, any NOT NULL, any
-- DEFAULT that would change behaviour, any DROP/DELETE/RESET.
