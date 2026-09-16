-- Consolidate dual unique constraints on campaign_milestone_claims
-- The table had two overlapping unique constraints from schema drift.
-- We keep only the canonical (user_id, chapter, milestone_index) constraint.

ALTER TABLE public.campaign_milestone_claims
  DROP CONSTRAINT IF EXISTS unique_user_milestone;

-- Ensure the canonical constraint exists (may already exist as unique_milestone_claim)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'unique_milestone_claim'
    AND conrelid = 'public.campaign_milestone_claims'::regclass
  ) THEN
    ALTER TABLE public.campaign_milestone_claims
      ADD CONSTRAINT unique_milestone_claim UNIQUE (user_id, chapter, milestone_index);
  END IF;
END;
$$;
