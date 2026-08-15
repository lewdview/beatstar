-- ═══════════════════════════════════════════════════════════════
-- STRIPE ORDERS & REVENUE TRACKING TABLE
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.stripe_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  stripe_session_id TEXT UNIQUE NOT NULL,
  pack_category TEXT NOT NULL,
  pack_size TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT DEFAULT 'usd',
  status TEXT DEFAULT 'pending', -- 'pending' | 'completed' | 'failed'
  cards_minted JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- Index for fast lookup by session_id and user_id
CREATE INDEX IF NOT EXISTS idx_stripe_orders_session ON public.stripe_orders(stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_stripe_orders_user ON public.stripe_orders(user_id);

-- Enable RLS
ALTER TABLE public.stripe_orders ENABLE ROW LEVEL SECURITY;

-- Users can read their own orders
CREATE POLICY "Users can view their own stripe orders"
  ON public.stripe_orders
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Service role has full access
CREATE POLICY "Service role has full access to stripe orders"
  ON public.stripe_orders
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
