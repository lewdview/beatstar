-- ============================================================================
-- PIM : th3v4ult — Canonical Database Schema
-- Full reference schema for all Supabase PostgreSQL tables.
-- 
-- This file is the authoritative source of truth for the database structure.
-- Generated from live Supabase instance analysis + source-controlled migrations.
--
-- To apply from scratch:
--   1. Run all migrations in supabase/migrations/ in timestamp order
--   2. Or use: supabase db reset (applies migrations automatically)
--
-- Last updated: 2026-08-20
-- ============================================================================


-- ============================================================================
-- CORE TABLES
-- ============================================================================

-- 1. Profiles — Player identity, economy, progression, and customization
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    wallet_address TEXT,
    display_name TEXT,
    username TEXT UNIQUE,
    avatar_url TEXT,
    is_alpha BOOLEAN DEFAULT FALSE,
    season_tag TEXT DEFAULT 'gen_0',
    tokens INTEGER DEFAULT 0 CHECK (tokens >= 0),
    tokens_earned_total INTEGER DEFAULT 0,
    tokens_spent_total INTEGER DEFAULT 0,
    total_pulls INTEGER DEFAULT 0,
    pulls_since_rare_plus INTEGER DEFAULT 0,
    pity_counter INTEGER DEFAULT 0,
    streak_count INTEGER DEFAULT 0,
    last_claim_day INTEGER DEFAULT 0,
    last_free_pack_day INTEGER DEFAULT 0,
    daily_standard_claims INTEGER DEFAULT 0,
    daily_premium_claims INTEGER DEFAULT 0,
    daily_standard_purchased INTEGER DEFAULT 0,
    daily_premium_purchased INTEGER DEFAULT 0,
    last_purchase_day INTEGER DEFAULT 0,
    total_burns INTEGER DEFAULT 0,
    daily_burns INTEGER DEFAULT 0,
    last_burn_day INTEGER DEFAULT 0,
    echo_pulls_received INTEGER DEFAULT 0,
    has_onboarded BOOLEAN DEFAULT FALSE,
    unlocked_skins TEXT[] DEFAULT '{}'::text[],
    settings JSONB DEFAULT '{}'::jsonb,
    progression JSONB DEFAULT '{"tutorialCompleted": false, "seenWelcomeModal": false, "noteGenerationSource": "manual"}'::jsonb,
    unlocked_cheats JSONB DEFAULT '{}'::jsonb,
    telemetry_data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Vault Collections — Owned collectible cards inventory
CREATE TABLE public.vault_collections (
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
    CONSTRAINT unique_owner_card_rarity UNIQUE (owner_id, card_id, rarity)
);

CREATE INDEX idx_vault_collections_owner_id ON public.vault_collections(owner_id);

-- 3. Global Supply — Edition tracking with hard caps
CREATE TABLE public.global_supply (
    card_id_rarity TEXT PRIMARY KEY,
    supply INTEGER DEFAULT 0
);

-- 4. Gameplay Records — Score history and reward tracking
CREATE TABLE public.gameplay_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    song_id TEXT NOT NULL,
    score INTEGER NOT NULL,
    accuracy NUMERIC(5,2) NOT NULL,
    max_combo INTEGER NOT NULL,
    medal TEXT NOT NULL CHECK (medal IN ('NONE', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM')),
    pack_rewarded BOOLEAN DEFAULT FALSE,
    reward_tier TEXT CHECK (reward_tier IN ('common', 'enhanced', 'rare', 'epic', 'legendary', 'mythic')),
    timestamp TIMESTAMPTZ DEFAULT NOW()
);


-- ============================================================================
-- PROGRESSION & REWARDS
-- ============================================================================

-- 5. User Cards — Card sync table
CREATE TABLE public.user_cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    card_id TEXT NOT NULL,
    rarity TEXT NOT NULL DEFAULT 'common',
    source TEXT DEFAULT 'gameplay',
    acquired_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_user_card UNIQUE (user_id, card_id, rarity)
);

-- 6. Campaign Milestone Claims — Track which milestone rewards have been claimed
CREATE TABLE public.campaign_milestone_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    chapter TEXT NOT NULL,
    milestone_index INTEGER NOT NULL,
    claimed_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_milestone_claim UNIQUE (user_id, chapter, milestone_index)
);

-- 7. User Fragments — Collectible fragment tracking
CREATE TABLE public.user_fragments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    fragment_id TEXT NOT NULL,
    amount INTEGER DEFAULT 1,
    acquired_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Bonus Codes & Redemptions
CREATE TABLE public.bonus_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,
    reward_type TEXT NOT NULL,
    reward_data JSONB DEFAULT '{}'::jsonb,
    max_uses INTEGER DEFAULT 1,
    current_uses INTEGER DEFAULT 0,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.bonus_code_redemptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    code_id UUID NOT NULL REFERENCES public.bonus_codes(id),
    redeemed_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_user_code UNIQUE (user_id, code_id)
);


-- ============================================================================
-- CONTENT & ECOSYSTEM
-- ============================================================================

-- 9. Releases — Song catalog metadata
CREATE TABLE public.releases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    day INTEGER UNIQUE NOT NULL,
    title TEXT NOT NULL,
    artist TEXT DEFAULT 'th3scr1b3',
    genre TEXT[],
    tags TEXT[],
    bpm INTEGER,
    key TEXT,
    energy NUMERIC(4,3),
    valence NUMERIC(4,3),
    cover_url TEXT,
    audio_url TEXT,
    release_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. Echo Pool — Pending echo cards awaiting a gacha pull
CREATE TABLE public.echo_pool (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    card_id TEXT NOT NULL,
    rarity TEXT NOT NULL,
    echo_generation INTEGER DEFAULT 0,
    source_day INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. NFT Mint Requests — Tracks on-chain minting requests
CREATE TABLE public.nft_mint_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    card_id TEXT NOT NULL,
    rarity TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'minting', 'minted', 'failed')),
    tx_hash TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. Admin Config — Global economy toggles and limits
CREATE TABLE public.admin_config (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);


-- ============================================================================
-- PAYMENTS
-- ============================================================================

-- 13. Stripe Orders — Purchase tracking
CREATE TABLE public.stripe_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stripe_session_id TEXT UNIQUE NOT NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    pack_category TEXT NOT NULL,
    tier TEXT NOT NULL,
    card_count INTEGER NOT NULL,
    amount_cents INTEGER NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'fulfilled', 'failed')),
    cards_minted JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    fulfilled_at TIMESTAMPTZ
);


-- ============================================================================
-- ANALYTICS & TELEMETRY
-- ============================================================================

-- 14. Telemetry Events — Raw event log
CREATE TABLE public.telemetry_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL,
    event_data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 15. Play Counters — Aggregated play statistics
CREATE TABLE public.play_counter_global (
    id TEXT PRIMARY KEY DEFAULT 'global',
    total_plays BIGINT DEFAULT 0
);

CREATE TABLE public.play_counter_daily (
    day_key TEXT PRIMARY KEY,
    plays BIGINT DEFAULT 0
);

CREATE TABLE public.play_counter_release (
    song_id TEXT PRIMARY KEY,
    plays BIGINT DEFAULT 0
);

CREATE TABLE public.play_counter_release_daily (
    id TEXT PRIMARY KEY,
    song_id TEXT NOT NULL,
    day_key TEXT NOT NULL,
    plays BIGINT DEFAULT 0
);

CREATE TABLE public.play_counter_source (
    source TEXT PRIMARY KEY,
    plays BIGINT DEFAULT 0
);

CREATE TABLE public.play_counter_source_daily (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    day_key TEXT NOT NULL,
    plays BIGINT DEFAULT 0
);


-- ============================================================================
-- MESSAGING & NOTIFICATIONS
-- ============================================================================

-- 16. Message/Notification System (from migration 20260817000002)
CREATE TABLE public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT,
    data JSONB DEFAULT '{}'::jsonb,
    read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_id ON public.notifications(user_id);


-- ============================================================================
-- AUTH SECURITY
-- ============================================================================

-- 17. Auth Nonces — One-time nonces for wallet signature challenge-response (C2 audit fix)
CREATE TABLE IF NOT EXISTS public.auth_nonces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nonce TEXT UNIQUE NOT NULL,
    wallet_address TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '5 minutes')
);

CREATE INDEX IF NOT EXISTS idx_auth_nonces_wallet ON public.auth_nonces(wallet_address);


-- ============================================================================
-- RPC FUNCTIONS
-- ============================================================================

-- Atomically increment supply with cap enforcement, returning edition or -1 if cap reached
CREATE OR REPLACE FUNCTION public.increment_supply(p_card_id_rarity TEXT, p_max_supply INTEGER DEFAULT 2147483647)
RETURNS INTEGER AS $$
DECLARE
    new_supply INTEGER;
BEGIN
    -- Attempt to insert or increment, but only if under the cap
    INSERT INTO public.global_supply (card_id_rarity, supply)
    VALUES (p_card_id_rarity, 1)
    ON CONFLICT (card_id_rarity)
    DO UPDATE SET supply = public.global_supply.supply + 1
      WHERE public.global_supply.supply < p_max_supply
    RETURNING supply INTO new_supply;

    -- If no row was inserted/updated (cap reached), return -1
    IF new_supply IS NULL THEN
        RETURN -1;
    END IF;

    RETURN new_supply;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Auto-create profile on auth signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id)
    VALUES (NEW.id)
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ============================================================================
-- LEADERBOARD INDEXES (from migration 20260814000000)
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_gameplay_records_song_score
    ON public.gameplay_records(song_id, score DESC);
CREATE INDEX IF NOT EXISTS idx_gameplay_records_user_song
    ON public.gameplay_records(user_id, song_id);
