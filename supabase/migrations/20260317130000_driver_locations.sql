-- Driver Locations table for real-time GPS tracking
CREATE TABLE IF NOT EXISTS public.driver_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  order_id TEXT REFERENCES public.orders(id) ON DELETE SET NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  heading DOUBLE PRECISION,
  speed DOUBLE PRECISION,
  accuracy DOUBLE PRECISION,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast driver lookups
CREATE INDEX IF NOT EXISTS idx_driver_locations_driver_id ON public.driver_locations(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_locations_recorded_at ON public.driver_locations(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_driver_locations_order_id ON public.driver_locations(order_id);

-- Enable RLS
ALTER TABLE public.driver_locations ENABLE ROW LEVEL SECURITY;

-- Admins (authenticated users) can read all locations
DROP POLICY IF EXISTS "authenticated_read_driver_locations" ON public.driver_locations;
CREATE POLICY "authenticated_read_driver_locations"
  ON public.driver_locations
  FOR SELECT
  TO authenticated
  USING (true);

-- Drivers can insert/update their own location
DROP POLICY IF EXISTS "drivers_insert_own_location" ON public.driver_locations;
CREATE POLICY "drivers_insert_own_location"
  ON public.driver_locations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    driver_id IN (
      SELECT id FROM public.drivers WHERE auth_user_id = auth.uid()
    )
  );

-- Seed some demo locations for existing drivers (UK coordinates)
DO $$
DECLARE
  driver_rec RECORD;
  base_lats DOUBLE PRECISION[] := ARRAY[51.5074, 51.5120, 51.4950, 51.5200, 51.5010];
  base_lngs DOUBLE PRECISION[] := ARRAY[-0.1278, -0.0900, -0.1450, -0.1100, -0.1350];
  i INT := 1;
BEGIN
  FOR driver_rec IN SELECT id FROM public.drivers ORDER BY created_at LOOP
    IF i <= 5 THEN
      INSERT INTO public.driver_locations (driver_id, latitude, longitude, heading, speed, recorded_at)
      VALUES (
        driver_rec.id,
        base_lats[i] + (random() * 0.01 - 0.005),
        base_lngs[i] + (random() * 0.01 - 0.005),
        (random() * 360)::DOUBLE PRECISION,
        (random() * 60)::DOUBLE PRECISION,
        NOW() - (random() * interval '5 minutes')
      )
      ON CONFLICT DO NOTHING;
      i := i + 1;
    END IF;
  END LOOP;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Demo location seed skipped: %', SQLERRM;
END $$;
