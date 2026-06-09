-- 1. Create gameplay_records
CREATE TABLE IF NOT EXISTS public.gameplay_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    song_id TEXT NOT NULL,
    score INT NOT NULL,
    accuracy NUMERIC(5,2) NOT NULL,
    max_combo INT NOT NULL,
    medal TEXT NOT NULL CHECK (medal IN ('NONE', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM')),
    pack_rewarded BOOLEAN DEFAULT FALSE,
    reward_tier TEXT NOT NULL CHECK (reward_tier IN ('none', 'common', 'enhanced', 'rare', 'epic', 'legendary', 'mythic')),
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create user_fragments
CREATE TABLE IF NOT EXISTS public.user_fragments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    song_id TEXT NOT NULL,
    count INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_user_song_fragment UNIQUE (user_id, song_id)
);

-- 3. Create campaign_milestone_claims
CREATE TABLE IF NOT EXISTS public.campaign_milestone_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    month_num INT NOT NULL,
    milestone_num INT NOT NULL,
    claimed_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_user_milestone UNIQUE (user_id, month_num, milestone_num)
);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.gameplay_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_fragments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_milestone_claims ENABLE ROW LEVEL SECURITY;

-- 5. Create RLS Policies

-- gameplay_records
DROP POLICY IF EXISTS "Users can insert their own gameplay records" ON public.gameplay_records;
CREATE POLICY "Users can insert their own gameplay records" ON public.gameplay_records
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own gameplay records" ON public.gameplay_records;
CREATE POLICY "Users can view their own gameplay records" ON public.gameplay_records
    FOR SELECT USING (auth.uid() = user_id);

-- user_fragments
DROP POLICY IF EXISTS "Users can manage their own fragments" ON public.user_fragments;
CREATE POLICY "Users can manage their own fragments" ON public.user_fragments
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- campaign_milestone_claims
DROP POLICY IF EXISTS "Users can manage their own milestone claims" ON public.campaign_milestone_claims;
CREATE POLICY "Users can manage their own milestone claims" ON public.campaign_milestone_claims
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
