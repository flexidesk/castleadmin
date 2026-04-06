-- Add is_enabled column to woocommerce_settings table
ALTER TABLE public.woocommerce_settings
  ADD COLUMN IF NOT EXISTS is_enabled boolean NOT NULL DEFAULT true;
