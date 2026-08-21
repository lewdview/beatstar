-- ============================================================================
-- PIM : th3v4ult — Core Tables Migration
-- Creates the 3 foundational tables that were previously created via
-- Supabase Dashboard and had no source-controlled migration:
--   1. public.profiles
--   2. public.vault_collections
--   3. public.global_supply
--
-- Also creates the increment_supply() RPC function and handle_new_user()
-- trigger for automatic profile creation on auth signup.
-- ============================================================================

-- ============================================================================
-- 1. PROFILES
-- Extends auth.users with player progression, economy, and customization data.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    wallet_address TEXT,
    display_name TEXT,
    username TEXT UNIQUE,
    avatar_url TEXT,
    is_alpha BOOLEAN DEFAULT FALSE,
    season_tag TEXT DEFAULT 'gen_0',

    -- Token economy
    tokens INTEGER DEFAULT 0,
    tokens_earned_total INTEGER DEFAULT 0,
    tokens_spent_total INTEGER DEFAULT 0,

    -- Gacha pull tracking & pity
    total_pulls INTEGER DEFAULT 0,
    pulls_since_rare_plus INTEGER DEFAULT 0,
    pity_counter INTEGER DEFAULT 0,

    -- Streak & daily limits
    streak_count INTEGER DEFAULT 0,
    last_claim_day INTEGER DEFAULT 0,
    last_free_pack_day INTEGER DEFAULT 0,
    daily_standard_claims INTEGER DEFAULT 0,
    daily_premium_claims INTEGER DEFAULT 0,
    daily_standard_purchased INTEGER DEFAULT 0,
    daily_premium_purchased INTEGER DEFAULT 0,
    last_purchase_day INTEGER DEFAULT 0,

    -- Burn tracking
    total_burns INTEGER DEFAULT 0,
    daily_burns INTEGER DEFAULT 0,
    last_burn_day INTEGER DEFAULT 0,

    -- Echo system
    echo_pulls_received INTEGER DEFAULT 0,

    -- Onboarding & progression
    has_onboarded BOOLEAN DEFAULT FALSE,
    unlocked_skins TEXT[] DEFAULT '{}'::text[],
    settings JSONB DEFAULT '{}'::jsonb,
    progression JSONB DEFAULT '{"tutorialCompleted": false, "seenWelcomeModal": false, "noteGenerationSource": "manual"}'::jsonb,
    unlocked_cheats JSONB DEFAULT '{}'::jsonb,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: Users can read and update their own profile
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
    ON public.profiles FOR INSERT
    WITH CHECK (auth.uid() = id);

-- Trigger: Auto-create profile row when a new user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id)
    VALUES (NEW.id)
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if it already exists to make this idempotent
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ============================================================================
-- 2. VAULT_COLLECTIONS
-- Holds the inventory of collectible cards owned by players.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.vault_collections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    card_id TEXT NOT NULL,
    rarity TEXT NOT NULL CHECK (rarity IN ('common', 'uncommon', 'rare', 'legendary', 'mythic')),
    source TEXT CHECK (source IN (
        'daily_claim', 'pack_free', 'pack_taste', 'pack_light', 'pack_dark',
        'pack_month', 'pack_miss_out', 'pack_special_picks', 'pack_prophecy',
        'pack_alpha', 'vault_token', 'targeted_pull', 'fusion',
        'pack_bombshell', 'pack_bombshell_deluxe', 'stripe_purchase'
    )),
    is_echo BOOLEAN DEFAULT FALSE,
    echo_generation INTEGER DEFAULT 0,
    echo_source_day INTEGER,
    edition INTEGER DEFAULT 1,
    max_supply INTEGER,
    proof JSONB,
    ultra_reward JSONB,
    blockchain_status TEXT DEFAULT 'off-chain',
    mint_hash TEXT,
    fingerprint TEXT,
    claimed_at TIMESTAMPTZ DEFAULT NOW(),

    -- Prevent duplicate cards of the same rarity for the same owner
    CONSTRAINT unique_owner_card_rarity UNIQUE (owner_id, card_id, rarity)
);

-- Index for fast collection lookups by owner
CREATE INDEX IF NOT EXISTS idx_vault_collections_owner_id
    ON public.vault_collections(owner_id);

-- RLS: Users can view their own collection; modifications via Edge Functions (service role)
ALTER TABLE public.vault_collections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own collection"
    ON public.vault_collections FOR SELECT
    USING (auth.uid() = owner_id);

CREATE POLICY "Service role can manage collections"
    ON public.vault_collections FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');


-- ============================================================================
-- 3. GLOBAL_SUPPLY
-- Tracks edition numbers and total supply minted per card_id + rarity combo.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.global_supply (
    card_id_rarity TEXT PRIMARY KEY,
    supply INTEGER DEFAULT 0
);

-- RLS: Publicly readable, write-only via Edge Functions
ALTER TABLE public.global_supply ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read global supply"
    ON public.global_supply FOR SELECT
    USING (true);

CREATE POLICY "Service role can manage supply"
    ON public.global_supply FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');

-- RPC: Atomically increment supply and return the assigned edition number
CREATE OR REPLACE FUNCTION public.increment_supply(p_card_id_rarity TEXT)
RETURNS INTEGER AS $$
DECLARE
    new_supply INTEGER;
BEGIN
    INSERT INTO public.global_supply (card_id_rarity, supply)
    VALUES (p_card_id_rarity, 1)
    ON CONFLICT (card_id_rarity)
    DO UPDATE SET supply = public.global_supply.supply + 1
    RETURNING supply INTO new_supply;

    RETURN new_supply;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
