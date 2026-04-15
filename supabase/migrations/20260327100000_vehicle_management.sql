-- ============================================================
-- Vehicle Management Schema (idempotent)
-- ============================================================

-- 1. Extend vehicles table with additional fields
ALTER TABLE public.vehicles
ADD COLUMN IF NOT EXISTS mileage INTEGER,
ADD COLUMN IF NOT EXISTS fuel_type TEXT DEFAULT 'Diesel',
ADD COLUMN IF NOT EXISTS vin TEXT,
ADD COLUMN IF NOT EXISTS mot_expiry DATE,
ADD COLUMN IF NOT EXISTS service_due DATE;

-- 2. Vehicle Insurance table
CREATE TABLE IF NOT EXISTS public.vehicle_insurance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  policy_number TEXT NOT NULL,
  start_date DATE NOT NULL,
  expiry_date DATE NOT NULL,
  cover_type TEXT NOT NULL DEFAULT 'Comprehensive',
  notes TEXT,
  document_url TEXT,
  document_name TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_vehicle_insurance_vehicle_id ON public.vehicle_insurance(vehicle_id);

-- 3. Vehicle Tax (Road Tax / VED) table
CREATE TABLE IF NOT EXISTS public.vehicle_tax (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  tax_reference TEXT,
  start_date DATE NOT NULL,
  expiry_date DATE NOT NULL,
  amount DECIMAL(10,2),
  notes TEXT,
  document_url TEXT,
  document_name TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_vehicle_tax_vehicle_id ON public.vehicle_tax(vehicle_id);

-- 4. Vehicle Documents (generic uploads)
CREATE TABLE IF NOT EXISTS public.vehicle_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL DEFAULT 'other',
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  expiry_date DATE,
  notes TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_vehicle_documents_vehicle_id ON public.vehicle_documents(vehicle_id);

-- 5. Vehicle Inspections (scheduled checks)
CREATE TABLE IF NOT EXISTS public.vehicle_inspections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  driver_id UUID REFERENCES public.drivers(id) ON DELETE SET NULL,
  inspection_type TEXT NOT NULL DEFAULT 'interim',
  scheduled_date TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'scheduled',
  overall_result TEXT,
  driver_signature TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_vehicle_inspections_vehicle_id ON public.vehicle_inspections(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_inspections_driver_id ON public.vehicle_inspections(driver_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_inspections_status ON public.vehicle_inspections(status);

-- 6. Vehicle Inspection Items (individual check results)
CREATE TABLE IF NOT EXISTS public.vehicle_inspection_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id UUID NOT NULL REFERENCES public.vehicle_inspections(id) ON DELETE CASCADE,
  check_name TEXT NOT NULL,
  result TEXT,
  notes TEXT,
  image_url TEXT,
  image_name TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_vehicle_inspection_items_inspection_id ON public.vehicle_inspection_items(inspection_id);

-- 7. Vehicle Incidents
CREATE TABLE IF NOT EXISTS public.vehicle_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  driver_id UUID REFERENCES public.drivers(id) ON DELETE SET NULL,
  incident_date TIMESTAMPTZ NOT NULL,
  incident_type TEXT NOT NULL DEFAULT 'accident',
  description TEXT NOT NULL,
  notes TEXT,
  severity TEXT NOT NULL DEFAULT 'minor',
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_vehicle_incidents_vehicle_id ON public.vehicle_incidents(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_incidents_driver_id ON public.vehicle_incidents(driver_id);

-- 8. Vehicle Incident Images
CREATE TABLE IF NOT EXISTS public.vehicle_incident_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID NOT NULL REFERENCES public.vehicle_incidents(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_vehicle_incident_images_incident_id ON public.vehicle_incident_images(incident_id);

-- 9. Enable RLS on all new tables
ALTER TABLE public.vehicle_insurance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_tax ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_inspection_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_incident_images ENABLE ROW LEVEL SECURITY;

-- 10. RLS Policies
DROP POLICY IF EXISTS "authenticated_read_vehicle_insurance" ON public.vehicle_insurance;
CREATE POLICY "authenticated_read_vehicle_insurance"
ON public.vehicle_insurance FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_manage_vehicle_insurance" ON public.vehicle_insurance;
CREATE POLICY "authenticated_manage_vehicle_insurance"
ON public.vehicle_insurance FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_read_vehicle_tax" ON public.vehicle_tax;
CREATE POLICY "authenticated_read_vehicle_tax"
ON public.vehicle_tax FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_manage_vehicle_tax" ON public.vehicle_tax;
CREATE POLICY "authenticated_manage_vehicle_tax"
ON public.vehicle_tax FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_read_vehicle_documents" ON public.vehicle_documents;
CREATE POLICY "authenticated_read_vehicle_documents"
ON public.vehicle_documents FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_manage_vehicle_documents" ON public.vehicle_documents;
CREATE POLICY "authenticated_manage_vehicle_documents"
ON public.vehicle_documents FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_read_vehicle_inspections" ON public.vehicle_inspections;
CREATE POLICY "authenticated_read_vehicle_inspections"
ON public.vehicle_inspections FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_manage_vehicle_inspections" ON public.vehicle_inspections;
CREATE POLICY "authenticated_manage_vehicle_inspections"
ON public.vehicle_inspections FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_read_vehicle_inspection_items" ON public.vehicle_inspection_items;
CREATE POLICY "authenticated_read_vehicle_inspection_items"
ON public.vehicle_inspection_items FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_manage_vehicle_inspection_items" ON public.vehicle_inspection_items;
CREATE POLICY "authenticated_manage_vehicle_inspection_items"
ON public.vehicle_inspection_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_read_vehicle_incidents" ON public.vehicle_incidents;
CREATE POLICY "authenticated_read_vehicle_incidents"
ON public.vehicle_incidents FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_manage_vehicle_incidents" ON public.vehicle_incidents;
CREATE POLICY "authenticated_manage_vehicle_incidents"
ON public.vehicle_incidents FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_read_vehicle_incident_images" ON public.vehicle_incident_images;
CREATE POLICY "authenticated_read_vehicle_incident_images"
ON public.vehicle_incident_images FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_manage_vehicle_incident_images" ON public.vehicle_incident_images;
CREATE POLICY "authenticated_manage_vehicle_incident_images"
ON public.vehicle_incident_images FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 11. Updated_at triggers
DROP TRIGGER IF EXISTS set_vehicle_insurance_updated_at ON public.vehicle_insurance;
CREATE TRIGGER set_vehicle_insurance_updated_at
  BEFORE UPDATE ON public.vehicle_insurance
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_vehicle_tax_updated_at ON public.vehicle_tax;
CREATE TRIGGER set_vehicle_tax_updated_at
  BEFORE UPDATE ON public.vehicle_tax
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_vehicle_inspections_updated_at ON public.vehicle_inspections;
CREATE TRIGGER set_vehicle_inspections_updated_at
  BEFORE UPDATE ON public.vehicle_inspections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_vehicle_incidents_updated_at ON public.vehicle_incidents;
CREATE TRIGGER set_vehicle_incidents_updated_at
  BEFORE UPDATE ON public.vehicle_incidents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
