-- ============================================================================
-- Migration: 20261003000000_allow_duplicate_cards_and_fusion.sql
-- Description: Drop unique_owner_card_rarity constraint from vault_collections
--              to allow players to hold duplicate cards for Duplicate Fusion,
--              pack pulls, and Forge mechanics. Replace with a non-unique index
--              for query performance.
-- ============================================================================

-- 1. Drop the constraint that prevented owning duplicate cards of the same rarity
ALTER TABLE public.vault_collections
  DROP CONSTRAINT IF EXISTS unique_owner_card_rarity;

-- 2. Create a non-unique B-tree index on (owner_id, card_id, rarity) for fast grouping/filtering
CREATE INDEX IF NOT EXISTS idx_vault_collections_owner_card_rarity
  ON public.vault_collections (owner_id, card_id, rarity);
