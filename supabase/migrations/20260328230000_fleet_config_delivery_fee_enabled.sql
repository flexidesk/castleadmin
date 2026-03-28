-- Add delivery_fee_enabled column to fleet_config
ALTER TABLE public.fleet_config
ADD COLUMN IF NOT EXISTS delivery_fee_enabled BOOLEAN NOT NULL DEFAULT true;
