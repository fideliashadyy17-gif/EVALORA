-- 0020 — Institutional / Enterprise entitlement.
-- The existing `plans` table remains the single source of truth for plans,
-- limits, subscriptions and overrides. No second entitlement system is added.
-- Existing subscriptions and customer organizations are not modified.

-- Free and Premium keep their commercial limits. Institutional-only capability
-- keys are explicitly false for ordinary plans; class/student operations that
-- already exist remain available to customers.
update public.plans
set limits = limits || jsonb_build_object(
      'institutional', false,
      'multi_class_operations', true,
      'central_asset_management', false,
      'configurable_limits', false,
      'max_classes', -1,
      'max_students', -1
    )
where slug in ('free', 'premium');

-- The existing Institution plan gains the complete institutional feature set,
-- configurable quotas, centralized resources, advanced examinations,
-- proctoring, analytics and Super Admin inspection / management capability.
update public.plans
set limits = limits || jsonb_build_object(
      'institutional', true,
      'multi_class_operations', true,
      'central_asset_management', true,
      'configurable_limits', true,
      'max_classes', -1,
      'max_students', -1,
      'max_exams', -1,
      'max_quizzes', -1,
      'max_questions', -1,
      'max_members', -1,
      'max_participants_per_session', 1000,
      'proctoring', true,
      'advanced_reports', true,
      'storage_mb', 51200
    ),
    features = coalesce(features, '[]'::jsonb) || '[
      "Institutional class and student management",
      "Multi-class and multi-user operational workflows",
      "Centralized question, quiz, examination and competition resources",
      "Configurable institutional limits and quotas",
      "Advanced examinations and competitions",
      "Video proctoring and advanced reporting / analytics"
    ]'::jsonb
where slug = 'institution';
