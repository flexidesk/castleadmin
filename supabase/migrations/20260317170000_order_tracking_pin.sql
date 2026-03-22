-- ============================================================
-- Order Tracking PIN (idempotent)
-- ============================================================

-- 1. Add tracking_pin column to orders
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS tracking_pin TEXT;

-- 2. Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_orders_tracking_pin ON public.orders(tracking_pin);

-- 3. Public read policy for tracking (order ID + PIN match)
DROP POLICY IF EXISTS "public_track_order_by_pin" ON public.orders;
CREATE POLICY "public_track_order_by_pin"
ON public.orders
FOR SELECT
TO anon
USING (tracking_pin IS NOT NULL);

-- 4. Public read policy for driver_locations (for tracking map)
DROP POLICY IF EXISTS "public_read_driver_locations_for_tracking" ON public.driver_locations;
CREATE POLICY "public_read_driver_locations_for_tracking"
ON public.driver_locations
FOR SELECT
TO anon
USING (true);

-- 5. Public read policy for drivers (name/vehicle for tracking)
DROP POLICY IF EXISTS "public_read_drivers_for_tracking" ON public.drivers;
CREATE POLICY "public_read_drivers_for_tracking"
ON public.drivers
FOR SELECT
TO anon
USING (true);

-- 6. Seed tracking_pin for existing orders that don't have one
DO $$
DECLARE
    r RECORD;
    pin TEXT;
BEGIN
    FOR r IN SELECT id FROM public.orders WHERE tracking_pin IS NULL LOOP
        -- Generate a 6-character alphanumeric PIN
        pin := upper(substring(md5(r.id || random()::text) FROM 1 FOR 6));
        UPDATE public.orders SET tracking_pin = pin WHERE id = r.id;
    END LOOP;
    RAISE NOTICE 'Tracking PINs seeded for existing orders';
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'PIN seeding failed: %', SQLERRM;
END $$;
