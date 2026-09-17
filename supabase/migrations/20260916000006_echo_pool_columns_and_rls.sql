-- ============================================================================
-- Fix echo_pool table schema and RLS
-- ============================================================================

-- Ensure all expected metadata columns exist on echo_pool
ALTER TABLE public.echo_pool
  ADD COLUMN IF NOT EXISTS source_card_id TEXT,
  ADD COLUMN IF NOT EXISTS echo_rarity TEXT,
  ADD COLUMN IF NOT EXISTS generation INTEGER,
  ADD COLUMN IF NOT EXISTS source_title TEXT,
  ADD COLUMN IF NOT EXISTS source_mood TEXT,
  ADD COLUMN IF NOT EXISTS source_rarity TEXT,
  ADD COLUMN IF NOT EXISTS cover_url TEXT,
  ADD COLUMN IF NOT EXISTS audio_url TEXT,
  ADD COLUMN IF NOT EXISTS energy NUMERIC(4,2),
  ADD COLUMN IF NOT EXISTS valence NUMERIC(4,2),
  ADD COLUMN IF NOT EXISTS tempo NUMERIC(6,2);

-- Set default for echo_generation
ALTER TABLE public.echo_pool 
  ALTER COLUMN echo_generation SET DEFAULT 1;

-- RLS: Allow anyone to view echo_pool (active echoes in the ecosystem)
ALTER TABLE public.echo_pool ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "echo_pool_read" ON public.echo_pool;
CREATE POLICY "echo_pool_read" ON public.echo_pool
  FOR SELECT USING (true);

-- Admins / Service role can manage echo_pool
DROP POLICY IF EXISTS "echo_pool_admin_manage" ON public.echo_pool;
CREATE POLICY "echo_pool_admin_manage" ON public.echo_pool
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

GRANT ALL ON public.echo_pool TO service_role;
GRANT SELECT ON public.echo_pool TO anon, authenticated;
