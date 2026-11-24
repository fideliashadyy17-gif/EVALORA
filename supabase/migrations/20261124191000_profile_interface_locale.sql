-- Per-user interface locale (additive): the language of the application
-- interface, authored by the user through LanguageSwitcher.
--
-- `profiles.interface_locale` lets a signed-in user keep their interface
-- language across devices; anonymous visitors persist via the
-- `evalora_locale` cookie only. NULL = no stored preference (cookie or
-- default applies). No rows are modified, no policies change, no data is
-- dropped — RLS (prof_select / prof_update) stays exactly as it is.
--
-- This column is NEVER examination content language: exam papers keep their
-- authored language in exams.settings.language (src/lib/examLanguage.ts).

alter table public.profiles
  add column if not exists interface_locale text;

comment on column public.profiles.interface_locale is
  'Preferred interface locale (en/fr/es) for this user. Not exam content language.';
