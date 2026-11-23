-- Restore Oak's organization-level examination identity without touching exams,
-- questions, candidate attempts, answers, access settings or identifiers.
-- The supplied artwork's existing shield + Oak International School wordmark
-- is published as an app-static WebP asset, making it publicly readable on all
-- exam entry/result interfaces. Other organizations remain unchanged.
update public.organizations
set name = 'Oak International School',
    logo_url = '/brand/oak-international-school-logo.webp'
where id = '0a400000-0000-4000-8000-000000000001'::uuid;
