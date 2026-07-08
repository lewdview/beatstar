-- Add settings, progression, and unlocked_cheats to the public.profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS settings jsonb DEFAULT '{}'::jsonb NOT NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS progression jsonb DEFAULT '{}'::jsonb NOT NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS unlocked_cheats jsonb DEFAULT '{}'::jsonb NOT NULL;
