-- Fix driver portal anon access for notifications, cash collections, and cash allocations

-- 1. Allow anon to read notifications (driver portal uses anon client)
DROP POLICY IF EXISTS "anon_read_notifications" ON public.notifications;
CREATE POLICY "anon_read_notifications"
ON public.notifications FOR SELECT TO anon
USING (true);

DROP POLICY IF EXISTS "anon_update_notifications" ON public.notifications;
CREATE POLICY "anon_update_notifications"
ON public.notifications FOR UPDATE TO anon
USING (true)
WITH CHECK (true);

-- 2. Allow anon to read/insert driver_cash_allocations
DROP POLICY IF EXISTS "anon_read_driver_cash_allocations" ON public.driver_cash_allocations;
CREATE POLICY "anon_read_driver_cash_allocations"
ON public.driver_cash_allocations FOR SELECT TO anon
USING (true);

DROP POLICY IF EXISTS "anon_insert_driver_cash_allocations" ON public.driver_cash_allocations;
CREATE POLICY "anon_insert_driver_cash_allocations"
ON public.driver_cash_allocations FOR INSERT TO anon
WITH CHECK (true);

-- 3. Allow anon to read driver_cash_collections (to calculate balance)
DROP POLICY IF EXISTS "anon_read_driver_cash_collections" ON public.driver_cash_collections;
CREATE POLICY "anon_read_driver_cash_collections"
ON public.driver_cash_collections FOR SELECT TO anon
USING (true);

-- 4. Allow anon to read driver_payments (for earnings section)
DROP POLICY IF EXISTS "anon_read_driver_payments" ON public.driver_payments;
CREATE POLICY "anon_read_driver_payments"
ON public.driver_payments FOR SELECT TO anon
USING (true);
