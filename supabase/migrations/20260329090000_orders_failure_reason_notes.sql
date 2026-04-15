-- Add failure_reason and failure_notes columns to orders table
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS failure_reason text,
  ADD COLUMN IF NOT EXISTS failure_notes  text;
