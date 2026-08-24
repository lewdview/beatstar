-- ============================================================================
-- PIM : th3v4ult — Leaderboard public read policies
-- 
-- The profiles table previously only allowed users to read their OWN row
-- (auth.uid() = id). This meant that when leaderboards fetched profiles for
-- other players, Supabase silently filtered them out — returning only the
-- current user's own profile.
--
-- This migration adds a public SELECT policy on profiles so display names
-- and avatars are visible to all users (required for leaderboard ranking).
-- ============================================================================

-- Drop old restrictive read policy
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;

-- Public read: allows any client to read profile display data for leaderboards
CREATE POLICY "Profiles are publicly readable for leaderboards"
    ON public.profiles FOR SELECT
    USING (true);

-- ============================================================================
-- vault_collections public read
--
-- The Prestige (All-Time) leaderboard scores players by their collection size
-- and rarity spread. With a private-only RLS policy, every other player's
-- collection score was computed as 0 (no rows returned by Supabase).
-- ============================================================================

-- Drop old restrictive read policy
DROP POLICY IF EXISTS "Users can view own collection" ON public.vault_collections;

-- Public read: leaderboard prestige scoring
CREATE POLICY "Vault collections are publicly readable for leaderboards"
    ON public.vault_collections FOR SELECT
    USING (true);
