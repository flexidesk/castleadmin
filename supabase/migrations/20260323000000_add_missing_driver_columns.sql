-- Add missing columns to the drivers table used by Driver Management UI

ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS zone TEXT;

ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'unverified';

ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS access_code TEXT;

-- Indexes for common lookups
CREATE INDEX IF NOT EXISTS idx_drivers_is_archived ON public.drivers(is_archived);
CREATE INDEX IF NOT EXISTS idx_drivers_verification_status ON public.drivers(verification_status);
