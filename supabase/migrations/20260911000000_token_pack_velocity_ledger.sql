-- ============================================================================
-- PIM : th3v4ult — TOKEN PACK VELOCITY LEDGER & ATOMIC CLAIM FUNCTION
-- ============================================================================
-- Enforces server-authoritative velocity limits (default 15/day) on token packs
-- (vault_token and bombshell_token) to protect temporal scarcity and prevent race conditions.
-- ============================================================================

-- 1. ADD CACHED COUNTER COLUMN TO PROFILES
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS daily_token_purchased INTEGER DEFAULT 0;

-- 2. CREATE TOKEN PACK PURCHASES TRANSACTION LEDGER
CREATE TABLE IF NOT EXISTS public.token_pack_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  pack_type TEXT NOT NULL,
  pack_size TEXT NOT NULL DEFAULT 'single',
  cost_tokens INTEGER NOT NULL,
  utc_day_boundary DATE NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_token_pack_velocity 
  ON public.token_pack_purchases(user_id, utc_day_boundary);

-- 3. ENABLE RLS ON LEDGER
ALTER TABLE public.token_pack_purchases ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'token_pack_purchases' AND policyname = 'Users can read own token pack purchases'
  ) THEN
    CREATE POLICY "Users can read own token pack purchases"
      ON public.token_pack_purchases
      FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'token_pack_purchases' AND policyname = 'Service role has full access to token pack purchases'
  ) THEN
    CREATE POLICY "Service role has full access to token pack purchases"
      ON public.token_pack_purchases
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- 4. ATOMIC GATING & PURCHASE RPC FUNCTION
CREATE OR REPLACE FUNCTION public.claim_token_pack_atomic(
    p_user_id UUID,
    p_pack_type TEXT,
    p_pack_size TEXT,
    p_cost_tokens INTEGER,
    p_max_daily_limit INTEGER
)
RETURNS JSONB AS $$
DECLARE
    v_current_tokens INTEGER;
    v_today DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::DATE;
    v_today_count INTEGER;
    v_new_tokens INTEGER;
BEGIN
    -- Acquire exclusive row lock on the user's profile to serialize concurrent purchases
    SELECT tokens INTO v_current_tokens
    FROM public.profiles
    WHERE id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'USER_NOT_FOUND');
    END IF;

    -- Verify token balance
    IF v_current_tokens < p_cost_tokens THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'INSUFFICIENT_TOKENS', 
            'current_tokens', v_current_tokens
        );
    END IF;

    -- Check velocity limit against authoritative ledger (UTC boundary)
    SELECT COUNT(*) INTO v_today_count
    FROM public.token_pack_purchases
    WHERE user_id = p_user_id
      AND utc_day_boundary = v_today;

    IF v_today_count >= p_max_daily_limit THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'DAILY_TOKEN_LIMIT_REACHED', 
            'daily_count', v_today_count,
            'limit', p_max_daily_limit
        );
    END IF;

    -- Deduct tokens & update cached profile counter
    v_new_tokens := v_current_tokens - p_cost_tokens;
    UPDATE public.profiles
    SET tokens = v_new_tokens,
        daily_token_purchased = v_today_count + 1,
        tokens_spent_total = COALESCE(tokens_spent_total, 0) + p_cost_tokens
    WHERE id = p_user_id;

    -- Record transaction in authoritative ledger
    INSERT INTO public.token_pack_purchases (
        user_id, pack_type, pack_size, cost_tokens, utc_day_boundary
    ) VALUES (
        p_user_id, p_pack_type, p_pack_size, p_cost_tokens, v_today
    );

    RETURN jsonb_build_object(
        'success', true,
        'remaining_tokens', v_new_tokens,
        'daily_count', v_today_count + 1,
        'limit', p_max_daily_limit
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog;

REVOKE EXECUTE ON FUNCTION public.claim_token_pack_atomic(UUID, TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_token_pack_atomic(UUID, TEXT, TEXT, INTEGER, INTEGER) TO authenticated, service_role;
