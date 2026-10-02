-- Daily spark streak (2026-10-01). Replaces the Earn page's fake client-side
-- token grants (simulated ads / surveys / minigame calling addTokens) with a
-- server-authoritative daily check-in.
--
-- Reward math (per Bryan 2026-10-01):
--   day 1 = 10 sparks, +2 sparks per consecutive day, capped at 50/day
--   milestone bonus: +100 sparks at exactly 7 days, +300 at exactly 30 days
--   missing a day resets the streak to day 1
--
-- Security model (same pattern as public.submit_score):
--   * The client NEVER writes streak/tokens columns directly. It calls
--     public.claim_daily_streak(), which is SECURITY DEFINER and does all
--     math and writes server-side.
--   * Day boundaries are UTC, computed from the server clock
--     ((extract(epoch from now()) / 86400)::integer) — client clocks are
--     never trusted.
--   * Double-claims are impossible: the caller's profile row is locked with
--     SELECT ... FOR UPDATE, so concurrent claims serialize and the second
--     one sees last_spark_streak_day = today → ALREADY_CLAIMED.
--   * Anonymous (guest) sessions have auth.uid() + a profiles row (created by
--     the on_auth_user_created trigger), so guests streak exactly like
--     signed-in users. Fully signed-out callers get 'Not authenticated' and
--     the Earn page shows the identity wall instead.
--   * EXECUTE is granted to `authenticated` only (anon users via Supabase
--     anonymous sign-in hold the authenticated role).
--   * Profiles column guard: A BEFORE UPDATE trigger on public.profiles prevents
--     direct client tampering with 'tokens' or total counters, while allowing
--     authorized server-side RPCs (using transaction-local app.allow_token_update)
--     and service_role operations.
--
-- Apply via the Supabase SQL editor. Idempotent.

-- 1. Ensure streak columns exist on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS spark_streak_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_spark_streak_day integer NOT NULL DEFAULT 0;

-- 2. Drop any legacy trigger that unconditionally blocks client-called RPC updates
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT t.tgname
        FROM pg_trigger t
        JOIN pg_proc p ON t.tgfoid = p.oid
        WHERE t.tgrelid = 'public.profiles'::regclass
          AND NOT t.tgisinternal
          AND pg_get_functiondef(p.oid) ILIKE '%server-managed and not client-writable%'
    ) LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.profiles;', r.tgname);
        RAISE NOTICE 'Dropped legacy profile protection trigger: %', r.tgname;
    END LOOP;
END $$;

-- 3. Create hardened profile column guard function
CREATE OR REPLACE FUNCTION public.protect_profiles_server_managed_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
    -- Allow if an authorized server-side RPC explicitly authorized this transaction
    IF current_setting('app.allow_token_update', true) = 'true' THEN
        RETURN NEW;
    END IF;

    -- Allow if executing under administrative / service roles (e.g. vault-engine)
    IF current_user IN ('postgres', 'service_role', 'supabase_admin')
       OR auth.role() = 'service_role' THEN
        RETURN NEW;
    END IF;

    -- Block direct client writes to server-managed economy columns
    IF OLD.tokens IS DISTINCT FROM NEW.tokens THEN
        RAISE EXCEPTION 'profiles: column "tokens" is server-managed and not client-writable';
    END IF;

    IF OLD.tokens_earned_total IS DISTINCT FROM NEW.tokens_earned_total THEN
        RAISE EXCEPTION 'profiles: column "tokens_earned_total" is server-managed and not client-writable';
    END IF;

    IF OLD.tokens_spent_total IS DISTINCT FROM NEW.tokens_spent_total THEN
        RAISE EXCEPTION 'profiles: column "tokens_spent_total" is server-managed and not client-writable';
    END IF;

    RETURN NEW;
END;
$$;

-- 4. Re-attach the trigger to profiles
DROP TRIGGER IF EXISTS tr_protect_profiles_server_managed_columns ON public.profiles;
CREATE TRIGGER tr_protect_profiles_server_managed_columns
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.protect_profiles_server_managed_columns();

-- 5. Atomic streak claim RPC function
CREATE OR REPLACE FUNCTION public.claim_daily_streak(p_dry_run boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $function$
DECLARE
  v_user_id uuid;
  v_today integer;
  v_streak integer;
  v_last_day integer;
  v_new_streak integer;
  v_base integer;
  v_milestone integer;
  v_reward integer;
  v_tokens integer;
  v_can_claim boolean;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- UTC day number (days since unix epoch). Never trust client clocks.
  v_today := (extract(epoch FROM now()) / 86400)::integer;

  -- Profiles rows are created by the on_auth_user_created trigger, but stay
  -- defensive for accounts that predate it.
  INSERT INTO public.profiles (id) VALUES (v_user_id)
  ON CONFLICT (id) DO NOTHING;

  SELECT p.spark_streak_count, p.last_spark_streak_day
    INTO v_streak, v_last_day
    FROM public.profiles p
   WHERE p.id = v_user_id
   FOR UPDATE;

  v_can_claim := (v_last_day < v_today);

  IF v_last_day >= v_today THEN
    -- Already claimed today: streak and reward describe the banked state.
    v_new_streak := v_streak;
  ELSIF v_last_day = v_today - 1 THEN
    -- Consecutive UTC day: streak continues.
    v_new_streak := v_streak + 1;
  ELSE
    -- Missed a day (or first ever claim): reset to day 1.
    v_new_streak := 1;
  END IF;

  -- Reward math: 10 on day 1, +2 per day, capped at 50. Milestones stack.
  v_base := least(10 + 2 * (v_new_streak - 1), 50);
  v_milestone := 0;
  IF v_new_streak = 7 THEN
    v_milestone := 100;
  ELSIF v_new_streak = 30 THEN
    v_milestone := 300;
  END IF;
  v_reward := v_base + v_milestone;

  IF p_dry_run THEN
    RETURN jsonb_build_object(
      'success', true,
      'dry_run', true,
      'can_claim', v_can_claim,
      'streak', v_new_streak,
      'base_reward', v_base,
      'milestone_bonus', v_milestone,
      'reward', v_reward,
      'today', v_today
    );
  END IF;

  IF NOT v_can_claim THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'ALREADY_CLAIMED',
      'streak', v_streak,
      'today', v_today
    );
  END IF;

  -- Authorize token update for this transaction so profile guard trigger permits it
  PERFORM set_config('app.allow_token_update', 'true', true);

  UPDATE public.profiles p
     SET spark_streak_count = v_new_streak,
         last_spark_streak_day = v_today,
         tokens = p.tokens + v_reward,
         tokens_earned_total = coalesce(p.tokens_earned_total, 0) + v_reward
   WHERE p.id = v_user_id
  RETURNING p.tokens INTO v_tokens;

  RETURN jsonb_build_object(
    'success', true,
    'streak', v_new_streak,
    'base_reward', v_base,
    'milestone_bonus', v_milestone,
    'reward', v_reward,
    'tokens', v_tokens,
    'today', v_today
  );
END
$function$;

REVOKE ALL ON FUNCTION public.claim_daily_streak(boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.claim_daily_streak(boolean) TO authenticated;
