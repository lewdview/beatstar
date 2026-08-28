-- ============================================================================
-- Migration: Security Fixes from Full Audit (Phase 1)
-- C2: auth_nonces table for wallet auth replay protection
-- H6: atomic supply cap enforcement in increment_supply
-- H8: non-negative token balance constraint
-- ============================================================================

-- C2: Auth nonces table for wallet signature challenge-response
CREATE TABLE IF NOT EXISTS public.auth_nonces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nonce TEXT UNIQUE NOT NULL,
    wallet_address TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '5 minutes')
);

-- Index for fast nonce lookup by wallet
CREATE INDEX IF NOT EXISTS idx_auth_nonces_wallet ON public.auth_nonces(wallet_address);

-- Auto-cleanup expired nonces (run via pg_cron or periodic job)
CREATE OR REPLACE FUNCTION public.cleanup_expired_nonces()
RETURNS void AS $$
BEGIN
    DELETE FROM public.auth_nonces WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- H8: Add non-negative constraint to existing profiles (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.check_constraints 
        WHERE constraint_name = 'profiles_tokens_check'
    ) THEN
        ALTER TABLE public.profiles ADD CONSTRAINT profiles_tokens_check CHECK (tokens >= 0);
    END IF;
END $$;

-- H6: Update increment_supply to enforce max_supply atomically
CREATE OR REPLACE FUNCTION public.increment_supply(p_card_id_rarity TEXT, p_max_supply INTEGER DEFAULT 2147483647)
RETURNS INTEGER AS $$
DECLARE
    new_supply INTEGER;
BEGIN
    INSERT INTO public.global_supply (card_id_rarity, supply)
    VALUES (p_card_id_rarity, 1)
    ON CONFLICT (card_id_rarity)
    DO UPDATE SET supply = public.global_supply.supply + 1
      WHERE public.global_supply.supply < p_max_supply
    RETURNING supply INTO new_supply;

    IF new_supply IS NULL THEN
        RETURN -1;
    END IF;

    RETURN new_supply;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC to generate a nonce for wallet auth
CREATE OR REPLACE FUNCTION public.generate_auth_nonce(p_wallet_address TEXT)
RETURNS TEXT AS $$
DECLARE
    new_nonce TEXT;
BEGIN
    -- Clean up any existing nonces for this wallet first
    DELETE FROM public.auth_nonces WHERE wallet_address = LOWER(p_wallet_address);
    
    new_nonce := gen_random_uuid()::TEXT;
    INSERT INTO public.auth_nonces (nonce, wallet_address, expires_at)
    VALUES (new_nonce, LOWER(p_wallet_address), NOW() + INTERVAL '5 minutes');
    
    RETURN new_nonce;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
