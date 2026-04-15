-- Allow anon role to INSERT and UPDATE driver_portal_credentials
-- The set-credentials API falls back to the anon key when SUPABASE_SERVICE_ROLE_KEY
-- is not configured, so without these policies the upsert returns 401 / RLS 42501.

DROP POLICY IF EXISTS "anon_insert_driver_portal_credentials" ON public.driver_portal_credentials;
CREATE POLICY "anon_insert_driver_portal_credentials"
  ON public.driver_portal_credentials
  FOR INSERT
  TO anon
  WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_driver_portal_credentials" ON public.driver_portal_credentials;
CREATE POLICY "anon_update_driver_portal_credentials"
  ON public.driver_portal_credentials
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

-- Also ensure authenticated role can INSERT/UPDATE (covers admin sessions)
DROP POLICY IF EXISTS "authenticated_write_driver_portal_credentials" ON public.driver_portal_credentials;
CREATE POLICY "authenticated_write_driver_portal_credentials"
  ON public.driver_portal_credentials
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
