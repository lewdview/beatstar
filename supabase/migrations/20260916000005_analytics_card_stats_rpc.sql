-- ============================================================================
-- Analytics RPC: exact uncapped user and card metrics
-- ============================================================================

-- Function to get aggregate user & card statistics
CREATE OR REPLACE FUNCTION public.get_user_card_stats()
RETURNS JSON AS $$
DECLARE
  v_total_users BIGINT;
  v_users_with_cards BIGINT;
  v_users_without_cards BIGINT;
  v_total_cards BIGINT;
  v_total_tokens BIGINT;
  v_total_burns BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_total_users FROM public.profiles;
  SELECT COUNT(DISTINCT owner_id) INTO v_users_with_cards FROM public.vault_collections;
  v_users_without_cards := GREATEST(0, v_total_users - v_users_with_cards);
  SELECT COUNT(*) INTO v_total_cards FROM public.vault_collections;
  SELECT COALESCE(SUM(tokens), 0), COALESCE(SUM(total_burns), 0) 
    INTO v_total_tokens, v_total_burns 
    FROM public.profiles;

  RETURN json_build_object(
    'total_users', v_total_users,
    'users_with_cards', v_users_with_cards,
    'users_without_cards', v_users_without_cards,
    'total_cards', v_total_cards,
    'total_tokens', v_total_tokens,
    'total_burns', v_total_burns
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_user_card_stats() TO anon, authenticated, service_role;

-- Function to get distinct user IDs who currently own at least 1 card
CREATE OR REPLACE FUNCTION public.get_card_owner_ids()
RETURNS SETOF UUID AS $$
BEGIN
  RETURN QUERY 
  SELECT DISTINCT owner_id 
  FROM public.vault_collections 
  WHERE owner_id IS NOT NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_card_owner_ids() TO anon, authenticated, service_role;
