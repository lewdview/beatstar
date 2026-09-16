-- ============================================================================
-- Fix and harden RLS policies on system_announcements
-- ============================================================================

-- Ensure service_role has full access (bypasses RLS by default, but grant explicitly)
GRANT ALL ON public.system_announcements TO service_role;
GRANT SELECT ON public.system_announcements TO anon, authenticated;

-- Helper function to check if an authenticated user is an administrator
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  -- Check user ID against known admin accounts
  IF auth.uid() IN (
    '5393bcd0-df3a-4d2c-a81d-8fb1433df7fb'::uuid,
    'fa1d9176-b55e-4301-bda1-057cd66201a0'::uuid
  ) THEN
    RETURN TRUE;
  END IF;

  -- Check profiles table for is_alpha or admin usernames
  RETURN EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() 
    AND (profiles.is_alpha = TRUE OR profiles.username IN ('th3scr1b3', 'admin', 'lewdview'))
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate the admin policy on system_announcements using is_admin()
DROP POLICY IF EXISTS "Admins can manage announcements" ON public.system_announcements;
CREATE POLICY "Admins can manage announcements" ON public.system_announcements
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
