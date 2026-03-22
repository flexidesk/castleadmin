-- ─── Driver Rate Settings & Alert Thresholds Migration ───────────────────────

-- 1. Driver Rate Settings
CREATE TABLE IF NOT EXISTS public.driver_rate_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_rate_per_hour NUMERIC(10,2) NOT NULL DEFAULT 12.00,
  rate_per_km NUMERIC(10,2) NOT NULL DEFAULT 0.25,
  overtime_multiplier NUMERIC(4,2) NOT NULL DEFAULT 1.5,
  weekend_multiplier NUMERIC(4,2) NOT NULL DEFAULT 1.25,
  night_shift_multiplier NUMERIC(4,2) NOT NULL DEFAULT 1.20,
  bonus_per_delivery NUMERIC(10,2) NOT NULL DEFAULT 0.50,
  fuel_allowance_per_km NUMERIC(10,2) NOT NULL DEFAULT 0.15,
  min_guaranteed_hours NUMERIC(4,1) NOT NULL DEFAULT 4.0,
  max_hours_per_day NUMERIC(4,1) NOT NULL DEFAULT 10.0,
  currency TEXT NOT NULL DEFAULT 'GBP',
  pay_cycle TEXT NOT NULL DEFAULT 'weekly',
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2. Alert Thresholds
CREATE TABLE IF NOT EXISTS public.alert_thresholds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Driver availability
  min_active_drivers INT NOT NULL DEFAULT 2,
  low_driver_warning_pct INT NOT NULL DEFAULT 30,
  -- Delivery performance
  late_delivery_minutes INT NOT NULL DEFAULT 15,
  critical_delay_minutes INT NOT NULL DEFAULT 45,
  max_failed_deliveries_pct INT NOT NULL DEFAULT 10,
  -- Order volume
  high_order_volume_per_hour INT NOT NULL DEFAULT 20,
  unassigned_order_warning_count INT NOT NULL DEFAULT 5,
  -- System health
  driver_offline_alert_minutes INT NOT NULL DEFAULT 10,
  gps_stale_alert_minutes INT NOT NULL DEFAULT 5,
  -- Financial
  daily_revenue_target NUMERIC(10,2) NOT NULL DEFAULT 1000.00,
  low_revenue_warning_pct INT NOT NULL DEFAULT 70,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_driver_rate_settings_id ON public.driver_rate_settings(id);
CREATE INDEX IF NOT EXISTS idx_alert_thresholds_id ON public.alert_thresholds(id);

-- Enable RLS
ALTER TABLE public.driver_rate_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alert_thresholds ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "authenticated_manage_driver_rate_settings" ON public.driver_rate_settings;
CREATE POLICY "authenticated_manage_driver_rate_settings"
ON public.driver_rate_settings FOR ALL TO authenticated
USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_manage_alert_thresholds" ON public.alert_thresholds;
CREATE POLICY "authenticated_manage_alert_thresholds"
ON public.alert_thresholds FOR ALL TO authenticated
USING (true) WITH CHECK (true);

-- Seed default driver rate settings
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.driver_rate_settings LIMIT 1) THEN
    INSERT INTO public.driver_rate_settings (
      base_rate_per_hour, rate_per_km, overtime_multiplier, weekend_multiplier,
      night_shift_multiplier, bonus_per_delivery, fuel_allowance_per_km,
      min_guaranteed_hours, max_hours_per_day, currency, pay_cycle
    ) VALUES (
      12.00, 0.25, 1.5, 1.25, 1.20, 0.50, 0.15, 4.0, 10.0, 'GBP', 'weekly'
    );
  END IF;
END $$;

-- Seed default alert thresholds
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.alert_thresholds LIMIT 1) THEN
    INSERT INTO public.alert_thresholds (
      min_active_drivers, low_driver_warning_pct,
      late_delivery_minutes, critical_delay_minutes, max_failed_deliveries_pct,
      high_order_volume_per_hour, unassigned_order_warning_count,
      driver_offline_alert_minutes, gps_stale_alert_minutes,
      daily_revenue_target, low_revenue_warning_pct
    ) VALUES (
      2, 30, 15, 45, 10, 20, 5, 10, 5, 1000.00, 70
    );
  END IF;
END $$;
