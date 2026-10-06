-- ============================================================================
-- Migration: 20261006000000_farcaster_notification_tokens.sql
-- Description: Table for storing Farcaster Mini App (Frames v2) notification tokens
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.farcaster_notification_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fid BIGINT NOT NULL,
  token TEXT NOT NULL,
  url TEXT NOT NULL DEFAULT 'https://api.warpcast.com/v1/frame-notifications',
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_farcaster_notification_fid_token UNIQUE (fid, token)
);

CREATE INDEX IF NOT EXISTS idx_farcaster_notification_tokens_fid ON public.farcaster_notification_tokens (fid);
CREATE INDEX IF NOT EXISTS idx_farcaster_notification_tokens_enabled ON public.farcaster_notification_tokens (enabled);

-- Enable RLS
ALTER TABLE public.farcaster_notification_tokens ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
DROP POLICY IF EXISTS "service_role_all_farcaster_tokens" ON public.farcaster_notification_tokens;
CREATE POLICY "service_role_all_farcaster_tokens"
  ON public.farcaster_notification_tokens
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Allow client (anon / authenticated) to select, insert, and update notification tokens
DROP POLICY IF EXISTS "client_select_farcaster_tokens" ON public.farcaster_notification_tokens;
CREATE POLICY "client_select_farcaster_tokens"
  ON public.farcaster_notification_tokens
  FOR SELECT
  TO authenticated, anon
  USING (true);

DROP POLICY IF EXISTS "client_insert_farcaster_tokens" ON public.farcaster_notification_tokens;
CREATE POLICY "client_insert_farcaster_tokens"
  ON public.farcaster_notification_tokens
  FOR INSERT
  TO authenticated, anon
  WITH CHECK (true);

DROP POLICY IF EXISTS "client_update_farcaster_tokens" ON public.farcaster_notification_tokens;
CREATE POLICY "client_update_farcaster_tokens"
  ON public.farcaster_notification_tokens
  FOR UPDATE
  TO authenticated, anon
  USING (true)
  WITH CHECK (true);
