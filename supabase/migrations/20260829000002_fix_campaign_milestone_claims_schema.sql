-- ============================================================================
-- Migration: 20260829000002_fix_campaign_milestone_claims_schema.sql
-- Description: Unify campaign_milestone_claims columns (chapter/milestone_index
--              and month_num/milestone_num), add auto-synchronization trigger,
--              unique indexes for both query formats, and robust RLS policies.
-- ============================================================================

-- 1. Ensure the table exists
CREATE TABLE IF NOT EXISTS public.campaign_milestone_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    chapter TEXT,
    milestone_index INTEGER,
    month_num INTEGER,
    milestone_num INTEGER,
    claimed_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Add any missing columns across legacy schema variants
ALTER TABLE public.campaign_milestone_claims 
    ADD COLUMN IF NOT EXISTS chapter TEXT,
    ADD COLUMN IF NOT EXISTS milestone_index INTEGER,
    ADD COLUMN IF NOT EXISTS month_num INTEGER,
    ADD COLUMN IF NOT EXISTS milestone_num INTEGER,
    ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ DEFAULT NOW();

-- 3. Backfill missing values between (chapter, milestone_index) and (month_num, milestone_num)
UPDATE public.campaign_milestone_claims
SET 
    month_num = COALESCE(month_num, (NULLIF(REGEXP_REPLACE(chapter, '\D', '', 'g'), ''))::INTEGER, 1),
    chapter = COALESCE(chapter, month_num::TEXT, '1'),
    milestone_num = COALESCE(milestone_num, milestone_index, 1),
    milestone_index = COALESCE(milestone_index, milestone_num, 1)
WHERE 
    month_num IS NULL OR chapter IS NULL OR milestone_num IS NULL OR milestone_index IS NULL;

-- 4. Create trigger to keep chapter/month_num and milestone_index/milestone_num in sync
CREATE OR REPLACE FUNCTION public.sync_milestone_claim_columns()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.chapter IS NOT NULL AND NEW.month_num IS NULL THEN
        NEW.month_num := (NULLIF(REGEXP_REPLACE(NEW.chapter, '\D', '', 'g'), ''))::INTEGER;
    END IF;
    IF NEW.month_num IS NOT NULL AND NEW.chapter IS NULL THEN
        NEW.chapter := NEW.month_num::TEXT;
    END IF;
    IF NEW.milestone_index IS NOT NULL AND NEW.milestone_num IS NULL THEN
        NEW.milestone_num := NEW.milestone_index;
    END IF;
    IF NEW.milestone_num IS NOT NULL AND NEW.milestone_index IS NULL THEN
        NEW.milestone_index := NEW.milestone_num;
    END IF;
    IF NEW.claimed_at IS NULL THEN
        NEW.claimed_at := NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_sync_milestone_claim_columns ON public.campaign_milestone_claims;
CREATE TRIGGER trigger_sync_milestone_claim_columns
    BEFORE INSERT OR UPDATE ON public.campaign_milestone_claims
    FOR EACH ROW EXECUTE FUNCTION public.sync_milestone_claim_columns();

-- 5. Create unique indexes supporting both query styles and onConflict targets
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_milestone_claim_chapter
    ON public.campaign_milestone_claims (user_id, chapter, milestone_index);

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_milestone_claim_month
    ON public.campaign_milestone_claims (user_id, month_num, milestone_num);

CREATE INDEX IF NOT EXISTS idx_milestone_claims_user_id
    ON public.campaign_milestone_claims (user_id);

-- 6. Enable Row Level Security (RLS) and define user policies
ALTER TABLE public.campaign_milestone_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own milestone claims" ON public.campaign_milestone_claims;
CREATE POLICY "Users can manage their own milestone claims" ON public.campaign_milestone_claims
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own milestone claims" ON public.campaign_milestone_claims;
CREATE POLICY "Users can view their own milestone claims" ON public.campaign_milestone_claims
    FOR SELECT USING (auth.uid() = user_id);
