-- ============================================================================
-- Migration: 20260829000001_bonus_code_aug29.sql
-- Description: Provision BONUSAUG29 bonus code and broadcast notification
-- ============================================================================

BEGIN;

-- 1. Create or update BONUSAUG29 bonus code granting 100 V⚡ tokens
INSERT INTO public.bonus_codes (
    code,
    reward_type,
    reward_value,
    max_uses,
    use_count
) VALUES (
    'BONUSAUG29',
    'tokens',
    '100',
    999999,
    0
) ON CONFLICT (code) DO UPDATE SET
    reward_type = 'tokens',
    reward_value = '100',
    max_uses = 999999;

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
    '🎁 FREE 100 V⚡ TOKENS — CODE: BONUSAUG29',
    'Claim 100 free V⚡ tokens using promo code "BONUSAUG29" at the Claim counter! That gives you enough tokens to unlock a 1-card Bombshell pack in the Pack Shop. Head over, redeem your code, and crack your pack!',
    'reward',
    'high',
    '/claim',
    'REDEEM CODE "BONUSAUG29"',
    'tokens',
    100,
    TRUE
);

COMMIT;
