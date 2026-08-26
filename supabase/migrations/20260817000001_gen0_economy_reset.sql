-- ============================================================================
-- Migration: 20260817000001_gen0_economy_reset.sql
-- Description: Public Gen 0 Reset Boundary schema updates & clean slate
-- ============================================================================

-- 1. ADD ISOLATION & IDENTITY COLUMNS (If not already present)
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS username TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS is_alpha BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS season_tag TEXT DEFAULT 'gen_0';

ALTER TABLE public.gameplay_records 
  ADD COLUMN IF NOT EXISTS is_alpha BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS season_tag TEXT DEFAULT 'gen_0';

-- 2. RESET MUTABLE PLAYER CARD OWNERSHIP & RECYCLING POOLS
TRUNCATE TABLE ONLY public.vault_collections CASCADE;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_cards') THEN
    TRUNCATE TABLE public.user_cards CASCADE;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'echo_pool') THEN
    TRUNCATE TABLE public.echo_pool CASCADE;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'nft_mint_requests') THEN
    TRUNCATE TABLE public.nft_mint_requests CASCADE;
  END IF;
END $$;

-- Reset global card edition tracking counters so public players claim Edition #1
TRUNCATE TABLE ONLY public.global_supply CASCADE;

-- 3. RESET GAMEPLAY RECORDS, LEADERBOARDS & MILESTONES
TRUNCATE TABLE ONLY public.gameplay_records CASCADE;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_fragments') THEN
    TRUNCATE TABLE public.user_fragments CASCADE;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'campaign_milestone_claims') THEN
    TRUNCATE TABLE public.campaign_milestone_claims CASCADE;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'telemetry_events') THEN
    TRUNCATE TABLE public.telemetry_events CASCADE;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'play_events') THEN
    TRUNCATE TABLE public.play_events CASCADE;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'play_events_universal') THEN
    TRUNCATE TABLE public.play_events_universal CASCADE;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'bonus_code_redemptions') THEN
    TRUNCATE TABLE public.bonus_code_redemptions CASCADE;
  END IF;
END $$;

-- 4. ARCHIVE CORE CREATOR / QA PROFILES
UPDATE public.profiles
SET 
  is_alpha = TRUE,
  season_tag = 'alpha'
WHERE 
  COALESCE(display_name, '') ILIKE ANY (ARRAY['%th3scr1b3%', '%admin%', '%qa%'])
  OR COALESCE(username, '') ILIKE ANY (ARRAY['%th3scr1b3%', '%admin%', '%qa%']);

-- 5. RESET ALL NON-ARCHIVED PROFILES TO GEN 0 BASELINE
UPDATE public.profiles
SET 
  tokens = 0,
  tokens_earned_total = 0,
  tokens_spent_total = 0,
  total_pulls = 0,
  pulls_since_rare_plus = 0,
  pity_counter = 0,
  streak_count = 0,
  last_claim_day = 0,
  last_free_pack_day = 0,
  daily_standard_claims = 0,
  daily_premium_claims = 0,
  daily_standard_purchased = 0,
  daily_premium_purchased = 0,
  last_purchase_day = 0,
  total_burns = 0,
  daily_burns = 0,
  echo_pulls_received = 0,
  progression = '{"tutorialCompleted": false, "seenWelcomeModal": false, "noteGenerationSource": "manual"}'::jsonb,
  unlocked_cheats = '{"noclip": false, "iddqd": false}'::jsonb
WHERE is_alpha IS DISTINCT FROM TRUE;

-- 6. PUBLIC LEADERBOARD VIEW
CREATE OR REPLACE VIEW public.public_leaderboards AS
SELECT 
  gr.id,
  gr.user_id,
  COALESCE(p.display_name, p.username, 'ANON_' || SUBSTRING(gr.user_id::text, 1, 6)) AS display_name,
  p.avatar_url,
  p.wallet_address,
  gr.song_id,
  gr.score,
  gr.accuracy,
  gr.max_combo,
  gr.medal,
  gr.timestamp
FROM public.gameplay_records gr
JOIN public.profiles p ON gr.user_id = p.id
WHERE p.is_alpha = FALSE 
  AND gr.is_alpha = FALSE
  AND (gr.season_tag = 'gen_0' OR gr.season_tag IS NULL)
ORDER BY gr.score DESC;
