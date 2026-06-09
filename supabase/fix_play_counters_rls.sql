-- Enable Row-Level Security (RLS) on all play counter rollup tables
ALTER TABLE public.play_counter_global ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.play_counter_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.play_counter_release ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.play_counter_release_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.play_counter_source ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.play_counter_source_daily ENABLE ROW LEVEL SECURITY;

-- Add SELECT policies to allow public read access
CREATE POLICY "Allow public read access to play_counter_global" ON public.play_counter_global
    FOR SELECT USING (true);

CREATE POLICY "Allow public read access to play_counter_daily" ON public.play_counter_daily
    FOR SELECT USING (true);

CREATE POLICY "Allow public read access to play_counter_release" ON public.play_counter_release
    FOR SELECT USING (true);

CREATE POLICY "Allow public read access to play_counter_release_daily" ON public.play_counter_release_daily
    FOR SELECT USING (true);

CREATE POLICY "Allow public read access to play_counter_source" ON public.play_counter_source
    FOR SELECT USING (true);

CREATE POLICY "Allow public read access to play_counter_source_daily" ON public.play_counter_source_daily
    FOR SELECT USING (true);
