-- ============================================================
-- Reports: Additional indexes for efficient reporting queries
-- ============================================================

-- Index for zone-based revenue queries (postcode prefix)
CREATE INDEX IF NOT EXISTS idx_orders_delivery_postcode ON public.orders(delivery_address_postcode);

-- Index for driver + date combined queries
CREATE INDEX IF NOT EXISTS idx_orders_driver_date ON public.orders(driver_id, booking_date);

-- Index for status + date for completion rate queries
CREATE INDEX IF NOT EXISTS idx_orders_status_date ON public.orders(status, booking_date);

-- Ensure driver_performance_logs has date index for trend queries
CREATE INDEX IF NOT EXISTS idx_perf_logs_delivery_date ON public.driver_performance_logs(delivery_date);
CREATE INDEX IF NOT EXISTS idx_perf_logs_driver_date ON public.driver_performance_logs(driver_id, delivery_date);
