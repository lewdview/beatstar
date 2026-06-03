-- Clean up card collections, echo pool, and NFT requests
TRUNCATE TABLE public.vault_collections CASCADE;
TRUNCATE TABLE public.echo_pool CASCADE;
TRUNCATE TABLE public.nft_mint_requests CASCADE;

-- Reset edition numbers by emptying supply history
TRUNCATE TABLE public.global_supply CASCADE;

-- Reset telemetry logs and play event logs
TRUNCATE TABLE public.telemetry_events CASCADE;
TRUNCATE TABLE public.play_events CASCADE;
TRUNCATE TABLE public.play_events_universal CASCADE;

-- Reset user profile states (tokens, streaks, pulls) to 0/clean slate
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
  echo_pulls_received = 0;
