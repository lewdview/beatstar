-- ============================================================================
-- Migration: 20260829000000_reset_song_leaderboards_and_notify.sql
-- Description: Reset individual song leaderboards and broadcast notification to all users
-- ============================================================================

BEGIN;

-- 1. Reset song gameplay records (individual song leaderboards)
TRUNCATE TABLE public.gameplay_records CASCADE;

-- 2. Broadcast system announcement to all active users
INSERT INTO public.system_announcements (
    title,
    message,
    category,
    priority,
    action_url,
    action_label,
    reward_type,
    reward_amount,
    is_active
) VALUES (
    '🏆 LEADERBOARD RESET & CHART UPGRADE',
    'All 365 daily rhythm charts have been re-calibrated and upgraded with wave-synced audio forge transient detection! Individual song leaderboards have been reset to give everyone a fresh start. Jump into any daily drop, set new record high scores, and claim the #1 rank!',
    'update',
    'high',
    '/daily',
    'PLAY TODAY''S DROP',
    'none',
    0,
    TRUE
);

COMMIT;
