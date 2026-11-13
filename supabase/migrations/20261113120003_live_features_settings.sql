-- Live assessment feature controls — storage.
--
-- The switches are stored in the existing JSONB column
-- public.quiz_sessions.settings, under the key "live_features":
--
--   { "standard_keyboard": bool, "math_keyboard": bool, "symbols": bool,
--     "scientific_keyboard": bool, "equation_editor": bool, "latex": bool }
--
-- NO SCHEMA CHANGE IS REQUIRED. quiz_sessions.settings has existed since
-- 0001_evalora_foundation.sql (jsonb NOT NULL). The guarded ADD COLUMN below
-- only matters for a database that somehow lacks the column, and then creates
-- it exactly as the foundation migration defines it.
--
-- THERE IS DELIBERATELY NO DATA BACKFILL.
-- The application treats a missing "live_features" object, or a missing key
-- inside it, as "tool available": a tool is disabled only by an explicit
-- `false` (src/lib/liveFeatures.ts). Existing sessions must therefore be left
-- exactly as they are.
--
-- The first draft of this file wrote
--   math_keyboard / symbols / scientific_keyboard / equation_editor / latex = false
-- into every existing session. It was never applied to production (verified on
-- 2026-11-13: no row carried the key, and the migration is absent from the
-- recorded history). Had it run, every open session would have lost its
-- mathematics tools the moment the controls shipped. Do not reintroduce it.
--
-- Idempotent and non-destructive: no row is read or written, and running the
-- file any number of times leaves the database in the same state.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'quiz_sessions' AND column_name = 'settings'
  ) THEN
    ALTER TABLE public.quiz_sessions
      ADD COLUMN settings jsonb NOT NULL DEFAULT '{"show_leaderboard":true,"max_participants":200}'::jsonb;
  END IF;
END $$;

COMMENT ON COLUMN public.quiz_sessions.settings IS
  'Configuration of the live session. Optional key live_features holds the organiser''s answer-tool switches (standard_keyboard, math_keyboard, symbols, scientific_keyboard, equation_editor, latex); a tool is disabled only by an explicit false, so a missing key means the tool is available.';
