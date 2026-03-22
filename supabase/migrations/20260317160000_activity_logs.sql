-- ============================================================
-- Activity Logs Schema (idempotent)
-- ============================================================

-- 1. Create activity_logs table
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,           -- 'order' | 'driver'
  entity_id TEXT NOT NULL,             -- order id (text) or driver id (uuid as text)
  entity_label TEXT,                   -- human-readable label e.g. order number or driver name
  action TEXT NOT NULL,                -- e.g. 'status_changed', 'driver_assigned', 'availability_changed'
  field_changed TEXT,                  -- e.g. 'status', 'driver_id', 'availability'
  old_value TEXT,
  new_value TEXT,
  changed_by TEXT,                     -- user email or name
  changed_by_user_id UUID,             -- auth user id (nullable)
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_activity_logs_entity ON public.activity_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON public.activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action ON public.activity_logs(action);

-- 3. Enable RLS
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies
DROP POLICY IF EXISTS "authenticated_read_activity_logs" ON public.activity_logs;
CREATE POLICY "authenticated_read_activity_logs"
ON public.activity_logs FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_insert_activity_logs" ON public.activity_logs;
CREATE POLICY "authenticated_insert_activity_logs"
ON public.activity_logs FOR INSERT TO authenticated WITH CHECK (true);

-- 5. Seed demo activity logs
DO $$
DECLARE
  o1 TEXT; o2 TEXT; o3 TEXT; o4 TEXT; o5 TEXT;
  d1 UUID; d2 UUID; d3 UUID;
BEGIN
  -- Fetch existing order ids
  SELECT id INTO o1 FROM public.orders ORDER BY created_at LIMIT 1;
  SELECT id INTO o2 FROM public.orders ORDER BY created_at OFFSET 1 LIMIT 1;
  SELECT id INTO o3 FROM public.orders ORDER BY created_at OFFSET 2 LIMIT 1;
  SELECT id INTO o4 FROM public.orders ORDER BY created_at OFFSET 3 LIMIT 1;
  SELECT id INTO o5 FROM public.orders ORDER BY created_at OFFSET 4 LIMIT 1;

  -- Fetch existing driver ids
  SELECT id INTO d1 FROM public.drivers ORDER BY created_at LIMIT 1;
  SELECT id INTO d2 FROM public.drivers ORDER BY created_at OFFSET 1 LIMIT 1;
  SELECT id INTO d3 FROM public.drivers ORDER BY created_at OFFSET 2 LIMIT 1;

  IF o1 IS NOT NULL THEN
    INSERT INTO public.activity_logs (entity_type, entity_id, entity_label, action, field_changed, old_value, new_value, changed_by, created_at)
    VALUES
      ('order', o1, 'Order #' || o1, 'status_changed', 'status', 'Booking Accepted', 'Booking Assigned', 'admin@castleadmin.com', NOW() - INTERVAL '2 hours'),
      ('order', o1, 'Order #' || o1, 'status_changed', 'status', 'Booking Assigned', 'Booking Out For Delivery', 'admin@castleadmin.com', NOW() - INTERVAL '1 hour 30 minutes'),
      ('order', o1, 'Order #' || o1, 'status_changed', 'status', 'Booking Out For Delivery', 'Booking Complete', 'driver@castleadmin.com', NOW() - INTERVAL '45 minutes')
    ON CONFLICT DO NOTHING;
  END IF;

  IF o2 IS NOT NULL THEN
    INSERT INTO public.activity_logs (entity_type, entity_id, entity_label, action, field_changed, old_value, new_value, changed_by, created_at)
    VALUES
      ('order', o2, 'Order #' || o2, 'status_changed', 'status', 'Booking Accepted', 'Booking Assigned', 'dispatch@castleadmin.com', NOW() - INTERVAL '3 hours'),
      ('order', o2, 'Order #' || o2, 'driver_assigned', 'driver_id', NULL, 'Driver assigned', 'dispatch@castleadmin.com', NOW() - INTERVAL '3 hours')
    ON CONFLICT DO NOTHING;
  END IF;

  IF o3 IS NOT NULL THEN
    INSERT INTO public.activity_logs (entity_type, entity_id, entity_label, action, field_changed, old_value, new_value, changed_by, created_at)
    VALUES
      ('order', o3, 'Order #' || o3, 'status_changed', 'status', 'Booking Accepted', 'Booking Cancelled', 'admin@castleadmin.com', NOW() - INTERVAL '5 hours'),
      ('order', o3, 'Order #' || o3, 'payment_updated', 'payment_status', 'Unpaid', 'Paid', 'admin@castleadmin.com', NOW() - INTERVAL '4 hours 30 minutes')
    ON CONFLICT DO NOTHING;
  END IF;

  IF o4 IS NOT NULL THEN
    INSERT INTO public.activity_logs (entity_type, entity_id, entity_label, action, field_changed, old_value, new_value, changed_by, created_at)
    VALUES
      ('order', o4, 'Order #' || o4, 'status_changed', 'status', 'Booking Assigned', 'Booking Out For Delivery', 'driver@castleadmin.com', NOW() - INTERVAL '1 hour')
    ON CONFLICT DO NOTHING;
  END IF;

  IF o5 IS NOT NULL THEN
    INSERT INTO public.activity_logs (entity_type, entity_id, entity_label, action, field_changed, old_value, new_value, changed_by, created_at)
    VALUES
      ('order', o5, 'Order #' || o5, 'status_changed', 'status', 'Booking Accepted', 'Booking Assigned', 'dispatch@castleadmin.com', NOW() - INTERVAL '6 hours')
    ON CONFLICT DO NOTHING;
  END IF;

  IF d1 IS NOT NULL THEN
    INSERT INTO public.activity_logs (entity_type, entity_id, entity_label, action, field_changed, old_value, new_value, changed_by, created_at)
    VALUES
      ('driver', d1::TEXT, (SELECT name FROM public.drivers WHERE id = d1), 'availability_changed', 'status', 'Available', 'On Route', 'system', NOW() - INTERVAL '2 hours 15 minutes'),
      ('driver', d1::TEXT, (SELECT name FROM public.drivers WHERE id = d1), 'availability_changed', 'status', 'On Route', 'Available', 'system', NOW() - INTERVAL '30 minutes')
    ON CONFLICT DO NOTHING;
  END IF;

  IF d2 IS NOT NULL THEN
    INSERT INTO public.activity_logs (entity_type, entity_id, entity_label, action, field_changed, old_value, new_value, changed_by, created_at)
    VALUES
      ('driver', d2::TEXT, (SELECT name FROM public.drivers WHERE id = d2), 'availability_changed', 'status', 'Available', 'Off Duty', 'driver@castleadmin.com', NOW() - INTERVAL '4 hours'),
      ('driver', d2::TEXT, (SELECT name FROM public.drivers WHERE id = d2), 'availability_changed', 'status', 'Off Duty', 'Available', 'admin@castleadmin.com', NOW() - INTERVAL '1 hour')
    ON CONFLICT DO NOTHING;
  END IF;

  IF d3 IS NOT NULL THEN
    INSERT INTO public.activity_logs (entity_type, entity_id, entity_label, action, field_changed, old_value, new_value, changed_by, created_at)
    VALUES
      ('driver', d3::TEXT, (SELECT name FROM public.drivers WHERE id = d3), 'availability_changed', 'status', 'Off Duty', 'On Route', 'dispatch@castleadmin.com', NOW() - INTERVAL '7 hours')
    ON CONFLICT DO NOTHING;
  END IF;

EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Activity log seed failed: %', SQLERRM;
END $$;
