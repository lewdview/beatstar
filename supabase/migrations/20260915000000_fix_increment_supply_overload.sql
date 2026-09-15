-- Migration: Fix increment_supply ambiguity and sync global_supply
-- 1. Drop the single-parameter overload which causes PostgREST ambiguity PGRST203
DROP FUNCTION IF EXISTS public.increment_supply(TEXT);

-- 2. Ensure atomic supply increment function with max_supply constraint exists
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

-- 3. Backfill global_supply from vault_collections to ensure all existing claims are counted
INSERT INTO public.global_supply (card_id_rarity, supply)
SELECT 
    REPLACE(card_id, 'card-', '') || '-' || rarity AS card_id_rarity,
    COUNT(*)::INTEGER AS supply
FROM public.vault_collections
WHERE card_id IS NOT NULL AND rarity IS NOT NULL
GROUP BY REPLACE(card_id, 'card-', '') || '-' || rarity
ON CONFLICT (card_id_rarity)
DO UPDATE SET supply = GREATEST(public.global_supply.supply, EXCLUDED.supply);
