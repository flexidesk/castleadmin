-- ============================================================
-- Analytics: Revenue per driver & fleet utilization
-- ============================================================

-- Add revenue_amount to orders if not present (alias for payment_amount)
-- payment_amount already exists; we just need indexes for analytics queries

CREATE INDEX IF NOT EXISTS idx_orders_payment_amount ON public.orders(payment_amount);
CREATE INDEX IF NOT EXISTS idx_orders_booking_date_status ON public.orders(booking_date, status);

-- Fleet utilization view: daily active drivers vs total drivers
CREATE OR REPLACE VIEW public.fleet_utilization_daily AS
SELECT
  o.booking_date AS date,
  COUNT(DISTINCT o.driver_id) AS active_drivers,
  (SELECT COUNT(*) FROM public.drivers) AS total_drivers,
  COUNT(o.id) AS total_orders,
  COUNT(CASE WHEN o.status = 'Booking Complete' THEN 1 END) AS completed_orders,
  COALESCE(SUM(o.payment_amount), 0) AS total_revenue
FROM public.orders o
WHERE o.driver_id IS NOT NULL
GROUP BY o.booking_date
ORDER BY o.booking_date DESC;

-- Revenue per driver view
CREATE OR REPLACE VIEW public.driver_revenue_summary AS
SELECT
  d.id AS driver_id,
  d.name AS driver_name,
  d.vehicle,
  d.plate,
  d.status,
  COUNT(o.id) AS total_orders,
  COUNT(CASE WHEN o.status = 'Booking Complete' THEN 1 END) AS completed_orders,
  COALESCE(SUM(o.payment_amount), 0) AS total_revenue,
  COALESCE(AVG(o.payment_amount), 0) AS avg_revenue_per_order,
  COALESCE(AVG(o.customer_rating), 0) AS avg_rating
FROM public.drivers d
LEFT JOIN public.orders o ON o.driver_id = d.id
GROUP BY d.id, d.name, d.vehicle, d.plate, d.status;

-- Grant access to authenticated users
GRANT SELECT ON public.fleet_utilization_daily TO authenticated;
GRANT SELECT ON public.driver_revenue_summary TO authenticated;
