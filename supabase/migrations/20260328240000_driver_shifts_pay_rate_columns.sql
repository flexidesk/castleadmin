-- Add missing pay rate columns to driver_shifts table
ALTER TABLE public.driver_shifts
ADD COLUMN IF NOT EXISTS hourly_rate NUMERIC(10,2),
ADD COLUMN IF NOT EXISTS fixed_amount NUMERIC(10,2),
ADD COLUMN IF NOT EXISTS per_delivery_rate NUMERIC(10,2);
