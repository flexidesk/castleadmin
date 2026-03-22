-- Add map_default_zone_id to fleet_config for map default zone setting
ALTER TABLE public.fleet_config
  ADD COLUMN IF NOT EXISTS map_default_zone_id UUID REFERENCES public.delivery_zones(id) ON DELETE SET NULL;
