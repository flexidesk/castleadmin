-- ─── Driver Earnings Migration ────────────────────────────────────────────────
-- Tables: driver_shifts, driver_pay_rates, driver_payments

-- 1. Driver Shifts (clock in/out + manual admin entries)
CREATE TABLE IF NOT EXISTS public.driver_shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  clock_in TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  clock_out TIMESTAMPTZ,
  break_minutes INT NOT NULL DEFAULT 0,
  notes TEXT,
  shift_type TEXT NOT NULL DEFAULT 'regular',  -- regular | overtime | weekend | night
  pay_type TEXT NOT NULL DEFAULT 'hourly',      -- hourly | per_delivery
  deliveries_completed INT NOT NULL DEFAULT 0,
  gross_pay NUMERIC(10,2),
  is_manual BOOLEAN NOT NULL DEFAULT false,     -- true = admin manually added
  added_by_admin UUID,                          -- auth user id of admin who added
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2. Per-driver pay rate overrides (overrides global driver_rate_settings)
CREATE TABLE IF NOT EXISTS public.driver_pay_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  pay_type TEXT NOT NULL DEFAULT 'hourly',      -- hourly | per_delivery | both
  hourly_rate NUMERIC(10,2),
  rate_per_delivery NUMERIC(10,2),
  overtime_multiplier NUMERIC(4,2) DEFAULT 1.5,
  weekend_multiplier NUMERIC(4,2) DEFAULT 1.25,
  night_shift_multiplier NUMERIC(4,2) DEFAULT 1.20,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(driver_id, effective_from)
);

-- 3. Driver Payments (record payments made to drivers)
CREATE TABLE IF NOT EXISTS public.driver_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method TEXT NOT NULL DEFAULT 'bank_transfer', -- bank_transfer | cash | cheque | other
  reference TEXT,
  period_start DATE,
  period_end DATE,
  notes TEXT,
  recorded_by UUID,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_driver_shifts_driver_id ON public.driver_shifts(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_shifts_clock_in ON public.driver_shifts(clock_in);
CREATE INDEX IF NOT EXISTS idx_driver_shifts_clock_out ON public.driver_shifts(clock_out);
CREATE INDEX IF NOT EXISTS idx_driver_pay_rates_driver_id ON public.driver_pay_rates(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_payments_driver_id ON public.driver_payments(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_payments_payment_date ON public.driver_payments(payment_date);

-- Enable RLS
ALTER TABLE public.driver_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_pay_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_payments ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "authenticated_manage_driver_shifts" ON public.driver_shifts;
CREATE POLICY "authenticated_manage_driver_shifts"
ON public.driver_shifts FOR ALL TO authenticated
USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_read_driver_shifts" ON public.driver_shifts;
CREATE POLICY "anon_read_driver_shifts"
ON public.driver_shifts FOR SELECT TO anon
USING (true);

DROP POLICY IF EXISTS "anon_insert_driver_shifts" ON public.driver_shifts;
CREATE POLICY "anon_insert_driver_shifts"
ON public.driver_shifts FOR INSERT TO anon
WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_driver_shifts" ON public.driver_shifts;
CREATE POLICY "anon_update_driver_shifts"
ON public.driver_shifts FOR UPDATE TO anon
USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_manage_driver_pay_rates" ON public.driver_pay_rates;
CREATE POLICY "authenticated_manage_driver_pay_rates"
ON public.driver_pay_rates FOR ALL TO authenticated
USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_read_driver_pay_rates" ON public.driver_pay_rates;
CREATE POLICY "anon_read_driver_pay_rates"
ON public.driver_pay_rates FOR SELECT TO anon
USING (true);

DROP POLICY IF EXISTS "authenticated_manage_driver_payments" ON public.driver_payments;
CREATE POLICY "authenticated_manage_driver_payments"
ON public.driver_payments FOR ALL TO authenticated
USING (true) WITH CHECK (true);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_driver_earnings_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_driver_shifts_updated_at ON public.driver_shifts;
CREATE TRIGGER trg_driver_shifts_updated_at
BEFORE UPDATE ON public.driver_shifts
FOR EACH ROW EXECUTE FUNCTION public.update_driver_earnings_updated_at();

DROP TRIGGER IF EXISTS trg_driver_pay_rates_updated_at ON public.driver_pay_rates;
CREATE TRIGGER trg_driver_pay_rates_updated_at
BEFORE UPDATE ON public.driver_pay_rates
FOR EACH ROW EXECUTE FUNCTION public.update_driver_earnings_updated_at();
