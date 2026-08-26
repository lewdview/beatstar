-- Populate / sync public.profiles for all imported auth users
INSERT INTO public.profiles (id, wallet_address, display_name, username, avatar_url, created_at)
SELECT 
  u.id,
  (u.raw_user_meta_data->>'wallet_address')::text,
  COALESCE(
    (u.raw_user_meta_data->>'display_name')::text,
    (u.raw_user_meta_data->>'username')::text,
    (u.raw_user_meta_data->>'wallet_address')::text
  ),
  (u.raw_user_meta_data->>'username')::text,
  (u.raw_user_meta_data->>'avatar_url')::text,
  u.created_at
FROM auth.users u
ON CONFLICT (id) DO UPDATE SET
  wallet_address = COALESCE(public.profiles.wallet_address, EXCLUDED.wallet_address),
  display_name = COALESCE(public.profiles.display_name, EXCLUDED.display_name);
