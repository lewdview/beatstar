-- Leaderboard performance indexes for PIM : th3v4ult
-- Supports daily gameplay aggregation and per-song ranking queries

-- Index for daily leaderboard: filter by date, sort by score
CREATE INDEX IF NOT EXISTS idx_gameplay_records_timestamp
  ON public.gameplay_records (timestamp DESC);

-- Composite index for per-user daily aggregation
CREATE INDEX IF NOT EXISTS idx_gameplay_records_user_timestamp
  ON public.gameplay_records (user_id, timestamp DESC);

-- Index for per-song queries (future per-song tab)
CREATE INDEX IF NOT EXISTS idx_gameplay_records_song_score
  ON public.gameplay_records (song_id, score DESC);
