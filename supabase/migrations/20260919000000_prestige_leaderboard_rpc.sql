-- ============================================================================
-- Migration: 20260919000000_prestige_leaderboard_rpc.sql
-- Description: 
--   1. Server-side prestige leaderboard RPC with SECURITY DEFINER to bypass
--      client-side RLS filtering on vault_collections.
--   2. Clean up corrupted/duplicate zero-score gameplay_records from syncMedal bugs.
-- ============================================================================

-- 1. Create Prestige Leaderboard RPC Function
CREATE OR REPLACE FUNCTION public.get_prestige_leaderboard(limit_count INT DEFAULT 100)
RETURNS TABLE (
    id UUID,
    name TEXT,
    avatar_url TEXT,
    unique_cards BIGINT,
    total_cards BIGINT,
    rarity_score BIGINT,
    top_rarity TEXT,
    rank BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    WITH card_scores AS (
        SELECT 
            vc.owner_id,
            COUNT(DISTINCT vc.card_id) AS u_cards,
            COUNT(vc.id) AS t_cards,
            SUM(
                CASE LOWER(COALESCE(vc.rarity, 'common'))
                    WHEN 'common' THEN 10
                    WHEN 'uncommon' THEN 25
                    WHEN 'rare' THEN 60
                    WHEN 'legendary' THEN 350
                    WHEN 'mythic' THEN 800
                    ELSE 10
                END +
                CASE WHEN vc.edition = 1 THEN 500 ELSE 0 END +
                CASE WHEN vc.proof IS NOT NULL AND vc.proof != 'none' THEN 200 ELSE 0 END +
                CASE WHEN COALESCE(vc.is_echo, FALSE) THEN 400 ELSE 0 END
            )::BIGINT AS collection_score,
            MAX(
                CASE LOWER(COALESCE(vc.rarity, 'common'))
                    WHEN 'mythic' THEN 5
                    WHEN 'legendary' THEN 4
                    WHEN 'rare' THEN 3
                    WHEN 'uncommon' THEN 2
                    ELSE 1
                END
            ) AS max_rarity_val
        FROM public.vault_collections vc
        GROUP BY vc.owner_id
    ),
    scored_profiles AS (
        SELECT 
            p.id,
            UPPER(
                COALESCE(
                    NULLIF(TRIM(p.username), ''),
                    NULLIF(TRIM(p.display_name), ''),
                    CASE 
                        WHEN p.wallet_address IS NOT NULL AND LENGTH(p.wallet_address) >= 10 THEN
                            SUBSTRING(p.wallet_address FROM 1 FOR 6) || '...' || SUBSTRING(p.wallet_address FROM LENGTH(p.wallet_address) - 3)
                        ELSE 'PILOT'
                    END
                )
            ) AS display_name,
            p.avatar_url,
            COALESCE(cs.u_cards, 0)::BIGINT AS u_cards,
            COALESCE(cs.t_cards, 0)::BIGINT AS t_cards,
            (
                COALESCE(p.streak_count, 0) * 120 +
                COALESCE(p.total_pulls, 0) * 15 +
                COALESCE(cs.collection_score, 0)
            )::BIGINT AS total_prestige_score,
            CASE COALESCE(cs.max_rarity_val, 1)
                WHEN 5 THEN 'mythic'
                WHEN 4 THEN 'legendary'
                WHEN 3 THEN 'rare'
                WHEN 2 THEN 'uncommon'
                ELSE 'common'
            END AS highest_rarity,
            p.streak_count,
            p.total_pulls
        FROM public.profiles p
        LEFT JOIN card_scores cs ON cs.owner_id = p.id
        WHERE p.username IS NOT NULL OR p.display_name IS NOT NULL OR p.wallet_address IS NOT NULL
    ),
    ranked_profiles AS (
        SELECT 
            sp.id,
            sp.display_name AS name,
            sp.avatar_url,
            sp.u_cards AS unique_cards,
            sp.t_cards AS total_cards,
            sp.total_prestige_score AS rarity_score,
            sp.highest_rarity AS top_rarity,
            DENSE_RANK() OVER (
                ORDER BY 
                    sp.total_prestige_score DESC,
                    sp.u_cards DESC,
                    sp.t_cards DESC,
                    sp.streak_count DESC,
                    sp.total_pulls DESC
            )::BIGINT AS player_rank
        FROM scored_profiles sp
    )
    SELECT 
        rp.id,
        rp.name,
        rp.avatar_url,
        rp.unique_cards,
        rp.total_cards,
        rp.rarity_score,
        rp.top_rarity,
        rp.player_rank AS rank
    FROM ranked_profiles rp
    ORDER BY rp.player_rank ASC, rp.name ASC
    LIMIT limit_count;
END;
$$;

-- Grant execute permissions to anon and authenticated clients
GRANT EXECUTE ON FUNCTION public.get_prestige_leaderboard(INT) TO anon, authenticated, service_role;

-- 2. Cleanup corrupted / duplicate score: 0 records in gameplay_records where medals exist
DELETE FROM public.gameplay_records
WHERE score = 0 
  AND medal IN ('PLATINUM', 'GOLD', 'SILVER') 
  AND accuracy = 0 
  AND max_combo = 0;
