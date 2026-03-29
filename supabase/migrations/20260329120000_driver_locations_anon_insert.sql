-- Allow anon (driver portal custom session) to insert location updates
-- The driver portal uses a custom credential system (not Supabase auth),
-- so drivers are anon role when broadcasting GPS coordinates.

DROP POLICY IF EXISTS "anon_insert_driver_locations" ON public.driver_locations;
CREATE POLICY "anon_insert_driver_locations"
  ON public.driver_locations
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Also allow anon to read driver_locations (for driver portal map view)
DROP POLICY IF EXISTS "anon_read_driver_locations" ON public.driver_locations;
CREATE POLICY "anon_read_driver_locations"
  ON public.driver_locations
  FOR SELECT
  TO anon
  USING (true);
