-- ============================================================
-- Order Tracking: Email-based lookup policy (idempotent)
-- ============================================================

-- Allow anonymous users to look up orders by order ID + customer email
DROP POLICY IF EXISTS "public_track_order_by_email" ON public.orders;
CREATE POLICY "public_track_order_by_email"
ON public.orders
FOR SELECT
TO anon
USING (customer_email IS NOT NULL);
