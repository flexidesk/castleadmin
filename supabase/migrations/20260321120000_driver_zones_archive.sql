-- ============================================================
-- Driver Zones & Archive Support
-- ============================================================

-- 1. Add zone and archived columns to drivers
ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS zone TEXT,
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- 2. Create driver_zones reference table
CREATE TABLE IF NOT EXISTS public.driver_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  color TEXT DEFAULT '#6366f1',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Enable RLS
ALTER TABLE public.driver_zones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_read_driver_zones" ON public.driver_zones;
CREATE POLICY "authenticated_read_driver_zones"
ON public.driver_zones FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_manage_driver_zones" ON public.driver_zones;
CREATE POLICY "authenticated_manage_driver_zones"
ON public.driver_zones FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 3. Seed zones
INSERT INTO public.driver_zones (name, description, color) VALUES
  ('North',     'North Leicester & Loughborough area',  '#3b82f6'),
  ('South',     'South Leicester & Hinckley area',      '#22c55e'),
  ('East',      'East Leicester & Melton Mowbray area', '#f97316'),
  ('West',      'West Leicester & Coalville area',      '#a855f7'),
  ('Central',   'City centre & LE1-LE5 postcodes',      '#ec4899'),
  ('Unassigned','No zone assigned',                     '#9ca3af')
ON CONFLICT (name) DO NOTHING;

-- 4. Assign demo zones to existing drivers
DO $$
BEGIN
  UPDATE public.drivers SET zone = 'North'   WHERE name = 'Marcus Webb'    AND zone IS NULL;
  UPDATE public.drivers SET zone = 'South'   WHERE name = 'Priya Nair'     AND zone IS NULL;
  UPDATE public.drivers SET zone = 'East'    WHERE name = 'Tom Bridges'    AND zone IS NULL;
  UPDATE public.drivers SET zone = 'West'    WHERE name = 'Leanne Carter'  AND zone IS NULL;
  UPDATE public.drivers SET zone = 'Central' WHERE name = 'Darren Hollis'  AND zone IS NULL;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Zone seed skipped: %', SQLERRM;
END $$;
