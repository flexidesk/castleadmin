-- Add map_default_postcode to fleet_config for map default address setting
ALTER TABLE public.fleet_config
  ADD COLUMN IF NOT EXISTS map_default_postcode TEXT DEFAULT '';
