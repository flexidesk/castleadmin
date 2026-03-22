-- Driver Shift Templates migration
-- Adds shift_templates table for recurring/bulk patterns
-- Adds vehicle_id to driver_shifts for vehicle assignment

-- 1. Add vehicle_id to driver_shifts if not exists
ALTER TABLE public.driver_shifts
ADD COLUMN IF NOT EXISTS vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL;

ALTER TABLE public.driver_shifts
ADD COLUMN IF NOT EXISTS shift_date DATE;

ALTER TABLE public.driver_shifts
ADD COLUMN IF NOT EXISTS start_time TIME;

ALTER TABLE public.driver_shifts
ADD COLUMN IF NOT EXISTS end_time TIME;

ALTER TABLE public.driver_shifts
ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'scheduled';

-- 2. Create shift_templates table
CREATE TABLE IF NOT EXISTS public.shift_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  shift_type TEXT NOT NULL DEFAULT 'regular',
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  break_minutes INTEGER NOT NULL DEFAULT 30,
  recurrence_days INTEGER[] DEFAULT ARRAY[]::INTEGER[],
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_driver_shifts_driver_id ON public.driver_shifts(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_shifts_shift_date ON public.driver_shifts(shift_date);
CREATE INDEX IF NOT EXISTS idx_driver_shifts_status ON public.driver_shifts(status);
CREATE INDEX IF NOT EXISTS idx_driver_shifts_vehicle_id ON public.driver_shifts(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_shift_templates_is_active ON public.shift_templates(is_active);

-- 4. Enable RLS
ALTER TABLE public.shift_templates ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies for shift_templates
DROP POLICY IF EXISTS "authenticated_manage_shift_templates" ON public.shift_templates;
CREATE POLICY "authenticated_manage_shift_templates"
ON public.shift_templates
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- 6. Seed sample shift templates
DO $$
BEGIN
  INSERT INTO public.shift_templates (id, name, shift_type, start_time, end_time, break_minutes, recurrence_days, notes)
  VALUES
    (gen_random_uuid(), 'Early Morning', 'regular', '06:00', '14:00', 30, ARRAY[1,2,3,4,5], 'Standard weekday early shift'),
    (gen_random_uuid(), 'Day Shift', 'regular', '08:00', '16:00', 30, ARRAY[1,2,3,4,5], 'Standard weekday day shift'),
    (gen_random_uuid(), 'Late Shift', 'regular', '14:00', '22:00', 30, ARRAY[1,2,3,4,5], 'Standard weekday late shift'),
    (gen_random_uuid(), 'Weekend Morning', 'weekend', '07:00', '15:00', 30, ARRAY[6,0], 'Weekend morning shift'),
    (gen_random_uuid(), 'Night Shift', 'night', '22:00', '06:00', 45, ARRAY[1,2,3,4,5], 'Overnight shift')
  ON CONFLICT (id) DO NOTHING;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Shift template seed failed: %', SQLERRM;
END $$;

-- 7. Seed sample driver shifts using existing drivers
DO $$
DECLARE
  driver_rec RECORD;
  vehicle_rec RECORD;
  today DATE := CURRENT_DATE;
  shift_id UUID;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'drivers'
  ) THEN
    FOR driver_rec IN SELECT id FROM public.drivers WHERE is_active = true AND is_archived = false LIMIT 3 LOOP
      SELECT id INTO vehicle_rec FROM public.vehicles WHERE is_active = true LIMIT 1;

      -- Today's shift
      INSERT INTO public.driver_shifts (
        id, driver_id, vehicle_id, shift_date, start_time, end_time,
        clock_in, break_minutes, shift_type, pay_type, status, is_manual, notes
      ) VALUES (
        gen_random_uuid(), driver_rec.id, vehicle_rec.id, today, '08:00', '16:00',
        (today || ' 08:00:00')::TIMESTAMPTZ, 30, 'regular', 'hourly', 'active', false,
        'Regular day shift'
      ) ON CONFLICT (id) DO NOTHING;

      -- Tomorrow's shift
      INSERT INTO public.driver_shifts (
        id, driver_id, vehicle_id, shift_date, start_time, end_time,
        clock_in, break_minutes, shift_type, pay_type, status, is_manual, notes
      ) VALUES (
        gen_random_uuid(), driver_rec.id, vehicle_rec.id, today + 1, '08:00', '16:00',
        ((today + 1) || ' 08:00:00')::TIMESTAMPTZ, 30, 'regular', 'hourly', 'scheduled', false,
        'Regular day shift'
      ) ON CONFLICT (id) DO NOTHING;

      -- Yesterday's completed shift
      INSERT INTO public.driver_shifts (
        id, driver_id, vehicle_id, shift_date, start_time, end_time,
        clock_in, clock_out, break_minutes, shift_type, pay_type, status, is_manual, notes, deliveries_completed
      ) VALUES (
        gen_random_uuid(), driver_rec.id, vehicle_rec.id, today - 1, '08:00', '16:00',
        ((today - 1) || ' 08:00:00')::TIMESTAMPTZ,
        ((today - 1) || ' 16:00:00')::TIMESTAMPTZ,
        30, 'regular', 'hourly', 'completed', false,
        'Regular day shift', 8
      ) ON CONFLICT (id) DO NOTHING;
    END LOOP;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Driver shift seed failed: %', SQLERRM;
END $$;
