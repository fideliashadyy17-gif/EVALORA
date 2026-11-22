-- Migration: 20261122120000_version_c_oak_logo_and_creator_branding.sql
-- Assigns official Oak International School logo to organization and Version C examinations.

update public.organizations
   set logo_url = '/brand/oak-logo.png'
 where id = '0a400000-0000-4000-8000-000000000001';

update public.exams
   set settings = coalesce(settings, '{}'::jsonb) || '{"logo_url": "/brand/oak-logo.png"}'::jsonb
 where id in (
   'ce000000-0000-4000-8000-000000000002', -- Grade 10 (MYP 5) Version C
   'cd000000-0000-4000-8000-000000000002'  -- Grade 9 (MYP 4) Version C
 );
