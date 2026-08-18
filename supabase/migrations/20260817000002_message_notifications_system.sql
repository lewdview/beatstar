-- ============================================================================
-- Migration: 20260817000002_message_notifications_system.sql
-- Description: System Announcements & Notification System for All Users
-- ============================================================================

-- 1. Create system_announcements table
CREATE TABLE IF NOT EXISTS public.system_announcements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('drop', 'event', 'reward', 'maintenance', 'update', 'general')) DEFAULT 'general',
    priority TEXT NOT NULL CHECK (priority IN ('low', 'normal', 'high', 'urgent')) DEFAULT 'normal',
    action_url TEXT,
    action_label TEXT,
    reward_type TEXT CHECK (reward_type IN ('tokens', 'card', 'none')) DEFAULT 'none',
    reward_amount INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- 2. Create user_notification_reads table (Tracking read/dismissed state per user)
CREATE TABLE IF NOT EXISTS public.user_notification_reads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    announcement_id UUID NOT NULL REFERENCES public.system_announcements(id) ON DELETE CASCADE,
    read_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    dismissed BOOLEAN DEFAULT FALSE NOT NULL,
    CONSTRAINT unique_user_announcement_read UNIQUE (user_id, announcement_id)
);

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.system_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_notification_reads ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies for system_announcements
-- Anyone (authenticated or guest/anon) can view active, non-expired announcements
DROP POLICY IF EXISTS "Public can view active announcements" ON public.system_announcements;
CREATE POLICY "Public can view active announcements" ON public.system_announcements
    FOR SELECT
    USING (
        is_active = TRUE 
        AND (expires_at IS NULL OR expires_at > NOW())
    );

-- Admins / Service role can insert, update, delete announcements
DROP POLICY IF EXISTS "Admins can manage announcements" ON public.system_announcements;
CREATE POLICY "Admins can manage announcements" ON public.system_announcements
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() 
            AND (profiles.is_alpha = TRUE OR profiles.username IN ('th3scr1b3', 'admin'))
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() 
            AND (profiles.is_alpha = TRUE OR profiles.username IN ('th3scr1b3', 'admin'))
        )
    );

-- 5. RLS Policies for user_notification_reads
DROP POLICY IF EXISTS "Users can view their own notification reads" ON public.user_notification_reads;
CREATE POLICY "Users can view their own notification reads" ON public.user_notification_reads
    FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage their own notification reads" ON public.user_notification_reads;
CREATE POLICY "Users can manage their own notification reads" ON public.user_notification_reads
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- 6. Realtime Publication Setup
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'system_announcements'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.system_announcements;
  END IF;
END $$;

-- 7. Seed Initial Public Gen 0 Welcome Announcement
INSERT INTO public.system_announcements (
    title,
    message,
    category,
    priority,
    action_url,
    action_label,
    is_active
) VALUES (
    '⚡ WELCOME TO PUBLIC GEN 0',
    'Welcome to PIM : th3v4ult — poetry in motion. Explore 365 daily rhythm releases, unlock audio-reactive collectible cards, forge duplicate stems, and climb global leaderboards.',
    'event',
    'high',
    '/daily',
    'PLAY TODAY''S DROP',
    TRUE
) ON CONFLICT DO NOTHING;
