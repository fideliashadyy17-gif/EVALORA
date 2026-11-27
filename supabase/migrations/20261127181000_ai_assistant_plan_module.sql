-- ═════════════════════════════════════════════════════════════════════════════
-- AI assistant & agents — plan module matrix.
--
-- `ai_assistant` is a new catalog module (Institution tier). The differentiated
-- plan migration wrote a closed JSON object per plan, so a module that did not
-- exist then is simply absent from those objects. Absence is not "off" for the
-- resolver (`moduleEnabled` falls back to MODULE_DEFAULTS, which is enabled), so
-- the matrix has to be stated explicitly for all three tiers — otherwise a Free
-- organization would silently receive an Institution feature.
--
-- Additive only: no DROP, no DELETE, no row loss. Every plan keeps every module
-- key it already had; this only adds one key per tier.
-- ═════════════════════════════════════════════════════════════════════════════

begin;

update public.plans
set modules = coalesce(modules, '{}'::jsonb) || jsonb_build_object('ai_assistant', false)
where slug = 'free';

update public.plans
set modules = coalesce(modules, '{}'::jsonb) || jsonb_build_object('ai_assistant', false)
where slug = 'premium';

update public.plans
set modules = coalesce(modules, '{}'::jsonb) || jsonb_build_object('ai_assistant', true)
where slug = 'institution';

-- Existing subscriptions whose plan carried no explicit value inherit the plan,
-- which is now correct. A stored override for this key is the customer's own
-- decision and is deliberately left untouched.

comment on column public.plans.modules is
  'Plan-level module matrix. A key that is absent falls back to MODULE_DEFAULTS (enabled), so every new catalog module must be added here for all three tiers.';

commit;
