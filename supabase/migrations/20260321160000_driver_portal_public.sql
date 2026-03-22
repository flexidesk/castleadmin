-- ============================================================
-- Driver Portal Public Access (idempotent)
-- Adds access_code to drivers for PIN-based public portal access
-- Adds public RLS policies for driver portal data reads
-- ============================================================

-- 1. Add access_code column to drivers (short PIN for public portal)
ALTER TABLE public.drivers
ADD COLUMN IF NOT EXISTS access_code TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_drivers_access_code ON public.drivers(access_code) WHERE access_code IS NOT NULL;

-- 2. Populate access codes for existing drivers (last 6 chars of id, uppercase)
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN SELECT id FROM public.drivers WHERE access_code IS NULL LOOP
    UPDATE public.drivers
    SET access_code = upper(substring(replace(rec.id::text, '-', ''), 1, 6))
    WHERE id = rec.id;
  END LOOP;
END $$;

-- 3. Public read policy for drivers (so portal can look up by access_code without auth)
DROP POLICY IF EXISTS "public_read_drivers_portal" ON public.drivers;
CREATE POLICY "public_read_drivers_portal"
ON public.drivers FOR SELECT TO anon USING (true);

-- 4. Public read policy for orders (so portal can show assigned orders without auth)
DROP POLICY IF EXISTS "public_read_orders_portal" ON public.orders;
CREATE POLICY "public_read_orders_portal"
ON public.orders FOR SELECT TO anon USING (true);

-- 5. Public update policy for driver status (so driver can toggle availability)
DROP POLICY IF EXISTS "public_update_driver_status" ON public.drivers;
CREATE POLICY "public_update_driver_status"
ON public.drivers FOR UPDATE TO anon
USING (true)
WITH CHECK (true);

-- 6. Public update policy for order status (so driver can advance order status)
DROP POLICY IF EXISTS "public_update_order_status" ON public.orders;
CREATE POLICY "public_update_order_status"
ON public.orders FOR UPDATE TO anon
USING (true)
WITH CHECK (true);

-- 7. Public read for driver_rate_settings (for earnings calculation)
DROP POLICY IF EXISTS "public_read_driver_rate_settings" ON public.driver_rate_settings;
CREATE POLICY "public_read_driver_rate_settings"
ON public.driver_rate_settings FOR SELECT TO anon USING (true);

-- 8. Public read for driver_performance_logs (for earnings history)
DROP POLICY IF EXISTS "public_read_driver_performance_logs" ON public.driver_performance_logs;
CREATE POLICY "public_read_driver_performance_logs"
ON public.driver_performance_logs FOR SELECT TO anon USING (true);

-- 9. Public insert for driver_pod_submissions
DROP POLICY IF EXISTS "public_insert_pod" ON public.driver_pod_submissions;
CREATE POLICY "public_insert_pod"
ON public.driver_pod_submissions FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "public_read_pod" ON public.driver_pod_submissions;
CREATE POLICY "public_read_pod"
ON public.driver_pod_submissions FOR SELECT TO anon USING (true);
