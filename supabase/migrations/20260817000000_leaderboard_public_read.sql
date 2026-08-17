-- Ensure gameplay_records are publicly readable for daily and song leaderboards
DROP POLICY IF EXISTS "Users can view their own gameplay records" ON public.gameplay_records;
DROP POLICY IF EXISTS "Gameplay records are readable for leaderboards" ON public.gameplay_records;

CREATE POLICY "Gameplay records are readable for leaderboards" ON public.gameplay_records
    FOR SELECT USING (true);
