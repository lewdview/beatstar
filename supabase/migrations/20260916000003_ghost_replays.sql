-- ============================================================================
-- GHOST REPLAY SYSTEM (Task 4E)
-- Stores the top-scoring replay per song as a compressed input event array.
-- Only one ghost (the current record holder) is stored per song.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ghost_replays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  song_id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  display_name TEXT,
  score INTEGER NOT NULL,
  accuracy NUMERIC(5,2) NOT NULL,
  medal TEXT NOT NULL CHECK (medal IN ('BRONZE','SILVER','GOLD','PLATINUM')),
  replay_data TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- One ghost per song (top score replaces previous)
CREATE UNIQUE INDEX IF NOT EXISTS idx_ghost_replays_song_id ON public.ghost_replays(song_id);

-- RLS: anyone can read ghosts, authenticated users can insert/update their record
ALTER TABLE public.ghost_replays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ghost_read_all" ON public.ghost_replays;
CREATE POLICY "ghost_read_all" ON public.ghost_replays
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "ghost_upsert_own" ON public.ghost_replays;
CREATE POLICY "ghost_upsert_own" ON public.ghost_replays
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "ghost_update_own" ON public.ghost_replays;
CREATE POLICY "ghost_update_own" ON public.ghost_replays
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
