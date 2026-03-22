-- Driver Cash Management: cash pot allocations and collection log

-- Table: driver_cash_allocations
-- Records each cash payment allocated to a driver's pot
CREATE TABLE IF NOT EXISTS public.driver_cash_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  order_id TEXT NOT NULL,
  amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  allocated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_driver_cash_allocations_driver_id ON public.driver_cash_allocations(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_cash_allocations_order_id ON public.driver_cash_allocations(order_id);
CREATE INDEX IF NOT EXISTS idx_driver_cash_allocations_allocated_at ON public.driver_cash_allocations(allocated_at);

-- Table: driver_cash_collections
-- Records when admin collects cash from a driver
CREATE TABLE IF NOT EXISTS public.driver_cash_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  collected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  collected_by TEXT NOT NULL DEFAULT 'Admin',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_driver_cash_collections_driver_id ON public.driver_cash_collections(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_cash_collections_collected_at ON public.driver_cash_collections(collected_at);

-- Enable RLS
ALTER TABLE public.driver_cash_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_cash_collections ENABLE ROW LEVEL SECURITY;

-- RLS Policies: admin-only access (authenticated users can manage all)
DROP POLICY IF EXISTS "authenticated_manage_driver_cash_allocations" ON public.driver_cash_allocations;
CREATE POLICY "authenticated_manage_driver_cash_allocations"
ON public.driver_cash_allocations
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_manage_driver_cash_collections" ON public.driver_cash_collections;
CREATE POLICY "authenticated_manage_driver_cash_collections"
ON public.driver_cash_collections
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);
