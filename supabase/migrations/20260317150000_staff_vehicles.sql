-- ============================================================
-- Staff / Vehicles Schema (idempotent)
-- ============================================================

-- 1. Add is_active column to drivers (for deactivation)
ALTER TABLE public.drivers
ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- 2. Add email column to drivers (useful for staff management)
ALTER TABLE public.drivers
ADD COLUMN IF NOT EXISTS email TEXT;

-- 3. Create vehicles table
CREATE TABLE IF NOT EXISTS public.vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration TEXT NOT NULL,
  make TEXT NOT NULL,
  model TEXT NOT NULL,
  year INTEGER,
  colour TEXT,
  type TEXT NOT NULL DEFAULT 'Van',
  is_active BOOLEAN NOT NULL DEFAULT true,
  assigned_driver_id UUID REFERENCES public.drivers(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicles_registration ON public.vehicles(registration);
CREATE INDEX IF NOT EXISTS idx_vehicles_assigned_driver ON public.vehicles(assigned_driver_id);

-- 4. Enable RLS
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies for vehicles
DROP POLICY IF EXISTS "authenticated_read_vehicles" ON public.vehicles;
CREATE POLICY "authenticated_read_vehicles"
ON public.vehicles FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_manage_vehicles" ON public.vehicles;
CREATE POLICY "authenticated_manage_vehicles"
ON public.vehicles FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 6. updated_at trigger for vehicles
DROP TRIGGER IF EXISTS set_vehicles_updated_at ON public.vehicles;
CREATE TRIGGER set_vehicles_updated_at
  BEFORE UPDATE ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 7. Seed demo vehicles
DO $$
DECLARE
  d1 UUID; d2 UUID; d3 UUID; d4 UUID; d5 UUID;
BEGIN
  SELECT id INTO d1 FROM public.drivers ORDER BY created_at LIMIT 1;
  SELECT id INTO d2 FROM public.drivers ORDER BY created_at OFFSET 1 LIMIT 1;
  SELECT id INTO d3 FROM public.drivers ORDER BY created_at OFFSET 2 LIMIT 1;
  SELECT id INTO d4 FROM public.drivers ORDER BY created_at OFFSET 3 LIMIT 1;
  SELECT id INTO d5 FROM public.drivers ORDER BY created_at OFFSET 4 LIMIT 1;

  INSERT INTO public.vehicles (registration, make, model, year, colour, type, assigned_driver_id)
  VALUES
    ('AB21 XYZ', 'Ford', 'Transit', 2021, 'White', 'Van', d1),
    ('CD19 LMN', 'Mercedes', 'Sprinter', 2019, 'Silver', 'Van', d2),
    ('EF22 PQR', 'Volkswagen', 'Crafter', 2022, 'White', 'Large Van', d3),
    ('GH20 STU', 'Renault', 'Master', 2020, 'Grey', 'Van', d4),
    ('IJ18 VWX', 'Peugeot', 'Boxer', 2018, 'White', 'Large Van', d5)
  ON CONFLICT (registration) DO NOTHING;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Vehicle seed failed: %', SQLERRM;
END $$;
