-- Allow anon role to SELECT from driver_portal_credentials
-- The portal-login API route uses the anon key to look up credentials,
-- so without this policy the query returns zero rows and login always fails.

DROP POLICY IF EXISTS "anon_select_driver_portal_credentials" ON public.driver_portal_credentials;
CREATE POLICY "anon_select_driver_portal_credentials"
  ON public.driver_portal_credentials
  FOR SELECT
  TO anon
  USING (true);
