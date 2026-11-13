-- Extend quiz_sessions.settings to include live_features JSONB
-- Live features: standard_keyboard, math_keyboard, symbols, scientific_keyboard, equation_editor, latex
-- Default: standard_keyboard=true, others=false

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'quiz_sessions' AND column_name = 'settings'
  ) THEN
    ALTER TABLE public.quiz_sessions ADD COLUMN settings jsonb DEFAULT '{}'::jsonb;
  END IF;

  -- Ensure live_features object exists in settings for existing sessions
  UPDATE public.quiz_sessions
  SET settings = jsonb_set(
    COALESCE(settings, '{}'::jsonb),
    '{live_features}',
    COALESCE(
      settings->'live_features',
      '{"standard_keyboard": true, "math_keyboard": false, "symbols": false, "scientific_keyboard": false, "equation_editor": false, "latex": false}'::jsonb
    )
  )
  WHERE settings IS NULL OR settings->'live_features' IS NULL;
END $$;

-- Add RLS policy for realtime broadcasts if needed (already handled in 0009/0010, but we can ensure schema is ready)
COMMENT ON COLUMN public.quiz_sessions.settings IS 'Contains configuration for the assessment session, including live_features (JSONB) for real-time student tool toggles.';
