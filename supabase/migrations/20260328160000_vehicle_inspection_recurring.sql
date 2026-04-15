-- ============================================================
-- Add recurring fields to vehicle_inspections (idempotent)
-- ============================================================

ALTER TABLE public.vehicle_inspections
  ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recurrence_interval_days INTEGER;
