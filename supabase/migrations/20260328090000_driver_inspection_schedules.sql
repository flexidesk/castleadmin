-- Driver Inspection Schedules Migration
-- Creates tables for driver inspection schedules and compliance tracking

-- Inspection schedules table
CREATE TABLE IF NOT EXISTS public.driver_inspection_schedules (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  inspection_type text NOT NULL CHECK (inspection_type IN ('interim', 'full', 'licence', 'vehicle', 'medical')),
  frequency_days integer NOT NULL DEFAULT 90,
  last_completed_at timestamptz,
  next_due_at timestamptz NOT NULL,
  notes text,
  created_by text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Inspection completion logs
CREATE TABLE IF NOT EXISTS public.driver_inspection_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  schedule_id uuid REFERENCES public.driver_inspection_schedules(id) ON DELETE SET NULL,
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  inspection_type text NOT NULL,
  completed_at timestamptz DEFAULT now(),
  completed_by text,
  outcome text CHECK (outcome IN ('pass', 'fail', 'needs_attention')),
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_driver_inspection_schedules_driver_id ON public.driver_inspection_schedules(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_inspection_schedules_next_due ON public.driver_inspection_schedules(next_due_at);
CREATE INDEX IF NOT EXISTS idx_driver_inspection_logs_driver_id ON public.driver_inspection_logs(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_inspection_logs_schedule_id ON public.driver_inspection_logs(schedule_id);

-- RLS
ALTER TABLE public.driver_inspection_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_inspection_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'driver_inspection_schedules' AND policyname = 'Allow all for authenticated'
  ) THEN
    CREATE POLICY "Allow all for authenticated" ON public.driver_inspection_schedules
      FOR ALL USING (auth.role() = 'authenticated');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'driver_inspection_logs' AND policyname = 'Allow all for authenticated'
  ) THEN
    CREATE POLICY "Allow all for authenticated" ON public.driver_inspection_logs
      FOR ALL USING (auth.role() = 'authenticated');
  END IF;
END $$;
