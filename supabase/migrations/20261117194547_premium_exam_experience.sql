-- Premium examination experience: one umbrella entitlement plus five
-- independently configurable capabilities. Existing paid plans are
-- grandfathered in; the Free plan is explicitly off. No subscription,
-- billing, organization or examination data is changed.
--
-- The Super Admin can edit these keys in Admin → Plans & Limits, or override
-- them for one organization from its Subscription tab (the existing
-- subscriptions.limits_override path).

begin;

update public.plans
set limits = coalesce(limits, '{}'::jsonb) || jsonb_build_object(
  'premium_exam_experience', slug <> 'free',
  'exam_duplicate_protection', slug <> 'free',
  'exam_language_lock', slug <> 'free',
  'floating_calculator', slug <> 'free',
  'interactive_math_tools', slug <> 'free',
  'premium_math_interface', slug <> 'free'
)
where limits is null
   or not (limits ? 'premium_exam_experience')
   or not (limits ? 'exam_duplicate_protection')
   or not (limits ? 'exam_language_lock')
   or not (limits ? 'floating_calculator')
   or not (limits ? 'interactive_math_tools')
   or not (limits ? 'premium_math_interface');

comment on table public.plans is
  'Commercial plan catalogue. limits.premium_exam_experience is the umbrella premium-examination entitlement; the five granular keys are resolved by src/lib/examExperience.ts. -1 means unlimited.';

commit;
