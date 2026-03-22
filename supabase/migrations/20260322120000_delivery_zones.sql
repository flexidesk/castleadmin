-- ============================================================
-- Delivery Zones with Map Drawing & Driver Allocation
-- ============================================================

-- 1. Create delivery_zones table (stores drawn polygon zones)
CREATE TABLE IF NOT EXISTS public.delivery_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  color TEXT NOT NULL DEFAULT '#6366f1',
  polygon_geojson JSONB NOT NULL DEFAULT '{"type":"Polygon","coordinates":[]}',
  driver_id UUID REFERENCES public.drivers(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2. Add auto_zone_allocation toggle to fleet_config
ALTER TABLE public.fleet_config
  ADD COLUMN IF NOT EXISTS auto_zone_allocation BOOLEAN NOT NULL DEFAULT false;

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_delivery_zones_driver_id ON public.delivery_zones(driver_id);
CREATE INDEX IF NOT EXISTS idx_delivery_zones_is_active ON public.delivery_zones(is_active);

-- 4. Enable RLS
ALTER TABLE public.delivery_zones ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies
DROP POLICY IF EXISTS "authenticated_manage_delivery_zones" ON public.delivery_zones;
CREATE POLICY "authenticated_manage_delivery_zones"
ON public.delivery_zones FOR ALL TO authenticated
USING (true) WITH CHECK (true);

-- 6. Seed sample delivery zones with polygon data
DO $$
DECLARE
  driver1_id UUID;
  driver2_id UUID;
  driver3_id UUID;
BEGIN
  SELECT id INTO driver1_id FROM public.drivers ORDER BY created_at ASC LIMIT 1;
  SELECT id INTO driver2_id FROM public.drivers ORDER BY created_at ASC OFFSET 1 LIMIT 1;
  SELECT id INTO driver3_id FROM public.drivers ORDER BY created_at ASC OFFSET 2 LIMIT 1;

  IF NOT EXISTS (SELECT 1 FROM public.delivery_zones LIMIT 1) THEN
    INSERT INTO public.delivery_zones (name, description, color, polygon_geojson, driver_id, is_active) VALUES
    (
      'North Zone',
      'North Leicester & Loughborough area',
      '#3b82f6',
      '{"type":"Polygon","coordinates":[[[-1.15,52.68],[-1.05,52.68],[-1.05,52.75],[-1.15,52.75],[-1.15,52.68]]]}',
      driver1_id,
      true
    ),
    (
      'South Zone',
      'South Leicester & Hinckley area',
      '#22c55e',
      '{"type":"Polygon","coordinates":[[[-1.18,52.58],[-1.08,52.58],[-1.08,52.63],[-1.18,52.63],[-1.18,52.58]]]}',
      driver2_id,
      true
    ),
    (
      'Central Zone',
      'City centre & LE1-LE5 postcodes',
      '#ec4899',
      '{"type":"Polygon","coordinates":[[[-1.14,52.62],[-1.10,52.62],[-1.10,52.65],[-1.14,52.65],[-1.14,52.62]]]}',
      driver3_id,
      true
    );
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Delivery zones seed skipped: %', SQLERRM;
END $$;
