-- Add delivery_charge column to orders table
-- order_total maps to existing payment_amount column
-- deposit_paid and amount_due already exist from previous migration

ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS delivery_charge NUMERIC DEFAULT 0;
