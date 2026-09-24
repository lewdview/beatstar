-- ============================================================================
-- Migration: 20260923000000_production_hardening.sql
-- Description: Production Hardening:
--   1. Secure gameplay_records (read-only for clients, writes via vault-engine service role)
--   2. Add missing indexes (profiles.wallet_address, vault_collections mint lookup)
--   3. Enable RLS on remaining tables: telemetry_events, admin_config, nft_mint_requests, notifications
--   4. Opportunistic cleanup of expired auth_nonces on generation
-- ============================================================================

-- 1. Secure gameplay_records: clients can read for leaderboards, but CANNOT directly INSERT/UPDATE/DELETE.
-- All gameplay records must be submitted via vault-engine Edge Function with server-side validation.
ALTER TABLE public.gameplay_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gameplay_own" ON public.gameplay_records;
DROP POLICY IF EXISTS "Gameplay records are readable for leaderboards" ON public.gameplay_records;
DROP POLICY IF EXISTS "gameplay_records_read_all" ON public.gameplay_records;

CREATE POLICY "gameplay_records_read_all" ON public.gameplay_records
  FOR SELECT USING (true);
-- Notice: No INSERT, UPDATE, or DELETE policy for anon/authenticated roles.
-- Writes are exclusively permitted via service_role in vault-engine.

-- 2. Indexes for performance and security lookups
CREATE INDEX IF NOT EXISTS idx_profiles_wallet_address_lower
  ON public.profiles(LOWER(wallet_address));

CREATE INDEX IF NOT EXISTS idx_vault_collections_mint_lookup
  ON public.vault_collections(card_id, rarity, blockchain_status);

-- 3. RLS on telemetry_events: clients write via RPC or vault-engine; no public reads
ALTER TABLE public.telemetry_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "telemetry_events_service_only" ON public.telemetry_events;
-- No public policies: accessible only by service_role and internal SECURITY DEFINER functions.

-- 4. RLS on admin_config: public read-only for basic frontend tuning, writes restricted to service_role
ALTER TABLE public.admin_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_config_public_read" ON public.admin_config;
CREATE POLICY "admin_config_public_read" ON public.admin_config
  FOR SELECT USING (true);

-- 5. RLS on nft_mint_requests: users can only see their own mint requests
ALTER TABLE public.nft_mint_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "nft_mint_requests_own_select" ON public.nft_mint_requests;
CREATE POLICY "nft_mint_requests_own_select" ON public.nft_mint_requests
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- 6. RLS on notifications (if table exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'notifications'
  ) THEN
    ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "notifications_own" ON public.notifications;
    CREATE POLICY "notifications_own" ON public.notifications
      FOR ALL TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- 7. Update generate_auth_nonce to opportunistically clean up expired nonces on every call
CREATE OR REPLACE FUNCTION public.generate_auth_nonce(p_wallet_address TEXT)
RETURNS TEXT AS $$
DECLARE
    new_nonce TEXT;
BEGIN
    -- Opportunistic cleanup of all expired nonces across the table
    DELETE FROM public.auth_nonces WHERE expires_at < NOW();

    -- Clean up any existing active nonces for this wallet
    DELETE FROM public.auth_nonces WHERE wallet_address = LOWER(p_wallet_address);
    
    new_nonce := gen_random_uuid()::TEXT;
    INSERT INTO public.auth_nonces (nonce, wallet_address, expires_at)
    VALUES (new_nonce, LOWER(p_wallet_address), NOW() + INTERVAL '5 minutes');
    
    RETURN new_nonce;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
