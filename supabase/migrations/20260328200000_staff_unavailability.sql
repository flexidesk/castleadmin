-- Staff Unavailability Table
-- Tracks when drivers/staff are marked as unavailable on the shift calendar

CREATE TABLE IF NOT EXISTS public.staff_unavailability (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    reason TEXT,
    notes TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_date_range CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_staff_unavailability_driver_id ON public.staff_unavailability(driver_id);
CREATE INDEX IF NOT EXISTS idx_staff_unavailability_start_date ON public.staff_unavailability(start_date);
CREATE INDEX IF NOT EXISTS idx_staff_unavailability_end_date ON public.staff_unavailability(end_date);

ALTER TABLE public.staff_unavailability ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_unavailability_all_access" ON public.staff_unavailability;
CREATE POLICY "staff_unavailability_all_access"
ON public.staff_unavailability
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);
