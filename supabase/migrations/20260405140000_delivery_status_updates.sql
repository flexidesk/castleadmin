-- Delivery status updates table for driver PWA status tracking with GPS
CREATE TABLE IF NOT EXISTS public.delivery_status_updates (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id text NOT NULL,
  driver_id uuid REFERENCES public.drivers(id) ON DELETE SET NULL,
  status text NOT NULL CHECK (status IN ('departed', 'arrived_at_location', 'started_delivery', 'completed')),
  latitude double precision,
  longitude double precision,
  accuracy double precision,
  timestamp timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast lookups by order
CREATE INDEX IF NOT EXISTS idx_delivery_status_updates_order_id ON public.delivery_status_updates(order_id);
CREATE INDEX IF NOT EXISTS idx_delivery_status_updates_driver_id ON public.delivery_status_updates(driver_id);

-- RLS
ALTER TABLE public.delivery_status_updates ENABLE ROW LEVEL SECURITY;

-- Drivers can insert their own updates (anon allowed for driver portal)
CREATE POLICY "Allow insert delivery status updates" ON public.delivery_status_updates
  FOR INSERT WITH CHECK (true);

-- Anyone can read (admin + driver portal)
CREATE POLICY "Allow read delivery status updates" ON public.delivery_status_updates
  FOR SELECT USING (true);
