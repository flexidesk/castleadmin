-- Add deposit_paid and amount_due columns to orders table

ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS deposit_paid NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS amount_due NUMERIC DEFAULT 0;
