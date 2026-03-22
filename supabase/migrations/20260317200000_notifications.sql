-- Notification Center: alert history table
-- Migration: 20260317200000_notifications.sql

-- 1. Alert type enum
DROP TYPE IF EXISTS public.alert_type CASCADE;
CREATE TYPE public.alert_type AS ENUM ('overdue', 'pending_payment', 'unassigned');

-- 2. Notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type    public.alert_type NOT NULL,
  title         TEXT NOT NULL,
  message       TEXT NOT NULL,
  order_id      TEXT REFERENCES public.orders(id) ON DELETE SET NULL,
  is_dismissed  BOOLEAN NOT NULL DEFAULT false,
  dismissed_at  TIMESTAMPTZ,
  dismissed_by  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_notifications_alert_type  ON public.notifications(alert_type);
CREATE INDEX IF NOT EXISTS idx_notifications_is_dismissed ON public.notifications(is_dismissed);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at  ON public.notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_order_id    ON public.notifications(order_id);

-- 4. Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies
DROP POLICY IF EXISTS "authenticated_read_notifications" ON public.notifications;
CREATE POLICY "authenticated_read_notifications"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "authenticated_insert_notifications" ON public.notifications;
CREATE POLICY "authenticated_insert_notifications"
  ON public.notifications FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_update_notifications" ON public.notifications;
CREATE POLICY "authenticated_update_notifications"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 6. Mock data seeded from existing orders
DO $$
DECLARE
  v_order_id TEXT;
  v_order2   TEXT;
  v_order3   TEXT;
  v_order4   TEXT;
  v_order5   TEXT;
BEGIN
  -- Grab up to 5 existing order IDs
  SELECT id INTO v_order_id FROM public.orders LIMIT 1 OFFSET 0;
  SELECT id INTO v_order2   FROM public.orders LIMIT 1 OFFSET 1;
  SELECT id INTO v_order3   FROM public.orders LIMIT 1 OFFSET 2;
  SELECT id INTO v_order4   FROM public.orders LIMIT 1 OFFSET 3;
  SELECT id INTO v_order5   FROM public.orders LIMIT 1 OFFSET 4;

  -- Overdue alerts
  INSERT INTO public.notifications (id, alert_type, title, message, order_id, is_dismissed, created_at)
  VALUES
    (gen_random_uuid(), 'overdue'::public.alert_type,
     'Overdue Delivery',
     'Order delivery window has passed without completion.',
     v_order_id, false, NOW() - INTERVAL '2 hours'),
    (gen_random_uuid(), 'overdue'::public.alert_type,
     'Overdue Delivery',
     'Order delivery window has passed without completion.',
     v_order2, true, NOW() - INTERVAL '5 hours')
  ON CONFLICT (id) DO NOTHING;

  -- Pending payment alerts
  INSERT INTO public.notifications (id, alert_type, title, message, order_id, is_dismissed, dismissed_at, created_at)
  VALUES
    (gen_random_uuid(), 'pending_payment'::public.alert_type,
     'Pending Payment',
     'Order has an outstanding unpaid balance.',
     v_order3, false, NULL, NOW() - INTERVAL '1 day'),
    (gen_random_uuid(), 'pending_payment'::public.alert_type,
     'Pending Payment',
     'Order has an outstanding unpaid balance.',
     v_order4, true, NOW() - INTERVAL '3 hours', NOW() - INTERVAL '2 days')
  ON CONFLICT (id) DO NOTHING;

  -- Unassigned order alerts
  INSERT INTO public.notifications (id, alert_type, title, message, order_id, is_dismissed, created_at)
  VALUES
    (gen_random_uuid(), 'unassigned'::public.alert_type,
     'Unassigned Order',
     'Order has no driver assigned and is awaiting dispatch.',
     v_order5, false, NOW() - INTERVAL '30 minutes'),
    (gen_random_uuid(), 'unassigned'::public.alert_type,
     'Unassigned Order',
     'Order has no driver assigned and is awaiting dispatch.',
     v_order_id, false, NOW() - INTERVAL '4 hours')
  ON CONFLICT (id) DO NOTHING;

EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Mock notification data insertion failed: %', SQLERRM;
END $$;
