-- ============================================================
-- Driver Performance Schema
-- ============================================================

-- Add customer_rating to orders (1-5 stars, nullable)
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS customer_rating SMALLINT CHECK (customer_rating >= 1 AND customer_rating <= 5),
ADD COLUMN IF NOT EXISTS delivery_duration_minutes INTEGER;

-- Driver ratings / performance log table
CREATE TABLE IF NOT EXISTS public.driver_performance_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  order_id TEXT REFERENCES public.orders(id) ON DELETE SET NULL,
  delivery_date DATE NOT NULL,
  was_successful BOOLEAN NOT NULL DEFAULT true,
  duration_minutes INTEGER,
  customer_rating SMALLINT CHECK (customer_rating >= 1 AND customer_rating <= 5),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_driver_perf_driver_id ON public.driver_performance_logs(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_perf_delivery_date ON public.driver_performance_logs(delivery_date);
CREATE INDEX IF NOT EXISTS idx_orders_customer_rating ON public.orders(customer_rating);

-- Enable RLS
ALTER TABLE public.driver_performance_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_read_driver_perf" ON public.driver_performance_logs;
CREATE POLICY "authenticated_read_driver_perf"
ON public.driver_performance_logs FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_manage_driver_perf" ON public.driver_performance_logs;
CREATE POLICY "authenticated_manage_driver_perf"
ON public.driver_performance_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Seed demo performance logs using existing drivers
DO $$
DECLARE
  drv RECORD;
  i INTEGER;
  base_date DATE;
  rand_success BOOLEAN;
  rand_duration INTEGER;
  rand_rating SMALLINT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'drivers'
  ) THEN
    RAISE NOTICE 'drivers table not found, skipping seed';
    RETURN;
  END IF;

  FOR drv IN SELECT id FROM public.drivers LOOP
    FOR i IN 0..29 LOOP
      base_date := CURRENT_DATE - i;
      rand_success := (random() > 0.08);
      rand_duration := (30 + (random() * 90)::INTEGER);
      rand_rating := CASE
        WHEN rand_success THEN (3 + (random() * 2)::INTEGER)::SMALLINT
        ELSE (1 + (random() * 2)::INTEGER)::SMALLINT
      END;

      INSERT INTO public.driver_performance_logs
        (driver_id, delivery_date, was_successful, duration_minutes, customer_rating)
      VALUES
        (drv.id, base_date, rand_success, rand_duration, rand_rating)
      ON CONFLICT (id) DO NOTHING;
    END LOOP;
  END LOOP;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Seed failed: %', SQLERRM;
END $$;
