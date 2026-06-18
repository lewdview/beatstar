-- Migration: Setup user_cards table in Supabase
-- Exposing the table under public schema for cards sync

CREATE TABLE IF NOT EXISTS public.user_cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    card_id TEXT NOT NULL,
    rarity TEXT NOT NULL,
    source TEXT NOT NULL,
    claimed_at TIMESTAMPTZ DEFAULT NOW(),
    proof JSONB
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.user_cards ENABLE ROW LEVEL SECURITY;

-- Setup RLS Policies
DROP POLICY IF EXISTS "Users can manage their own cards" ON public.user_cards;
CREATE POLICY "Users can manage their own cards" ON public.user_cards
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Create index for speed on user_id lookups
CREATE INDEX IF NOT EXISTS idx_user_cards_user_id ON public.user_cards(user_id);
