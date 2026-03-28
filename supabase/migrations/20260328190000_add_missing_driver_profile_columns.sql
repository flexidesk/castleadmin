-- Add missing driver profile columns to the drivers table
ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS license_number TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS license_expiry DATE DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS license_class TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS address TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS emergency_contact TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS emergency_phone TEXT DEFAULT NULL;
