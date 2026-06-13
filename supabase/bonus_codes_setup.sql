-- Create bonus_codes table
CREATE TABLE IF NOT EXISTS public.bonus_codes (
  code text PRIMARY KEY,
  reward_type text NOT NULL, -- 'tokens', 'card', 'background_skin'
  reward_value text NOT NULL,
  max_uses integer DEFAULT 100,
  use_count integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  expires_at timestamp with time zone
);

-- Enable RLS for bonus_codes
ALTER TABLE public.bonus_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Bonus codes readable by authenticated" ON public.bonus_codes;
CREATE POLICY "Bonus codes readable by authenticated" ON public.bonus_codes FOR SELECT USING (true);
DROP POLICY IF EXISTS "Client cannot modify bonus codes" ON public.bonus_codes;
CREATE POLICY "Client cannot modify bonus codes" ON public.bonus_codes FOR ALL USING (false);

-- Create bonus_code_redemptions table
CREATE TABLE IF NOT EXISTS public.bonus_code_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  code text REFERENCES public.bonus_codes(code) ON DELETE CASCADE NOT NULL,
  redeemed_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  CONSTRAINT bonus_code_redemptions_user_code_key UNIQUE (user_id, code)
);

-- Enable RLS for bonus_code_redemptions
ALTER TABLE public.bonus_code_redemptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own redemptions" ON public.bonus_code_redemptions;
CREATE POLICY "Users can view own redemptions" ON public.bonus_code_redemptions FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Client cannot insert redemptions directly" ON public.bonus_code_redemptions;
CREATE POLICY "Client cannot insert redemptions directly" ON public.bonus_code_redemptions FOR ALL USING (false);

-- Add unlocked_skins to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS unlocked_skins text[] DEFAULT '{}'::text[] NOT NULL;

-- Seed bonus codes for testing
INSERT INTO public.bonus_codes (code, reward_type, reward_value, max_uses)
VALUES 
  ('BETA2026', 'tokens', '1000', 500),
  ('PIMCARD', 'card', 'card-12-rare', 500),
  ('EXCLUSIVESKIN', 'background_skin', 'gold_record', 500),
  ('123487655!!!!', 'tokens', '10000', 999999)
ON CONFLICT (code) DO NOTHING;
