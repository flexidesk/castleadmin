-- Add missing notes column to the drivers table
ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT NULL;
