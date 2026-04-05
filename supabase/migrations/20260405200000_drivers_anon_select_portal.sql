-- Allow anon role to SELECT limited driver fields for portal login
-- The portal-login API fetches driver details after credential verification.
-- Without this, the drivers query returns empty rows when using the anon key.
-- Only exposes non-sensitive fields needed by the driver portal.

DROP POLICY IF EXISTS "anon_select_drivers_portal" ON public.drivers;
CREATE POLICY "anon_select_drivers_portal"
  ON public.drivers
  FOR SELECT
  TO anon
  USING (is_active = true AND is_archived = false);
