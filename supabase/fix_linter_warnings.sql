-- Fix 1: Search Path Mutability (function_search_path_mutable)
ALTER FUNCTION public.decrement_tokens(uuid, integer) SET search_path = public, pg_catalog;
ALTER FUNCTION public.get_play_counter_public(text, integer) SET search_path = public, pg_catalog;
ALTER FUNCTION public.get_play_counter_snapshot(integer, integer) SET search_path = public, pg_catalog;
ALTER FUNCTION public.grant_daily_credits(uuid, integer) SET search_path = public, pg_catalog;
ALTER FUNCTION public.handle_new_user() SET search_path = public, pg_catalog;
ALTER FUNCTION public.increment_play_rollups() SET search_path = public, pg_catalog;
ALTER FUNCTION public.increment_supply(text) SET search_path = public, pg_catalog;
ALTER FUNCTION public.increment_tokens(uuid, integer) SET search_path = public, pg_catalog;
ALTER FUNCTION public.log_telemetry_event(text, uuid, jsonb) SET search_path = public, pg_catalog;
ALTER FUNCTION public.publish_article_webhook(text, jsonb) SET search_path = public, pg_catalog;
ALTER FUNCTION public.record_play_event(text, integer, text, text, text, numeric, text, text, timestamp with time zone) SET search_path = public, pg_catalog;
ALTER FUNCTION public.redeem_invite_code(text, uuid) SET search_path = public, pg_catalog;
ALTER FUNCTION public.rls_auto_enable() SET search_path = public, pg_catalog;
ALTER FUNCTION public.set_articles_updated_at() SET search_path = public, pg_catalog;

-- Fix 2: Permissive RLS Policy for ALL (rls_policy_always_true)
DROP POLICY IF EXISTS "Allow all access" ON public.kv_store_473d7342;
CREATE POLICY "Allow public select only" ON public.kv_store_473d7342
    FOR SELECT USING (true);

-- Fix 3: Public Bucket Listing (public_bucket_allows_listing)
DROP POLICY IF EXISTS "Allow Uploads iz5wym_0" ON storage.objects;
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;

-- Fix 4: Revoke Public Execute on Security Definer functions (anon_security_definer_function_executable / authenticated_security_definer_function_executable)
REVOKE EXECUTE ON FUNCTION public.decrement_tokens(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_play_counter_public(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_play_counter_snapshot(integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.grant_daily_credits(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_supply(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_tokens(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_telemetry_event(text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.publish_article_webhook(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_play_event(text, integer, text, text, text, numeric, text, text, timestamp with time zone) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.redeem_invite_code(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
