-- Notifications v2: Add order_alert, status_update, payment_confirmation types + archive support
-- Migration: 20260321110000_notifications_v2.sql

-- 1. Add new enum values to existing alert_type enum
--    PostgreSQL does not support DROP/RECREATE of enum when table uses it,
--    so we use ALTER TYPE ... ADD VALUE (idempotent via DO block check)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'order_alert'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'alert_type' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public'))
  ) THEN
    ALTER TYPE public.alert_type ADD VALUE 'order_alert';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'status_update'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'alert_type' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public'))
  ) THEN
    ALTER TYPE public.alert_type ADD VALUE 'status_update';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'payment_confirmation'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'alert_type' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public'))
  ) THEN
    ALTER TYPE public.alert_type ADD VALUE 'payment_confirmation';
  END IF;
END $$;

-- 2. Add is_archived column
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- 3. Index for archive filter
CREATE INDEX IF NOT EXISTS idx_notifications_is_archived ON public.notifications(is_archived);

-- 4. Mock data for new notification types
DO $$
DECLARE
  v_order1 TEXT;
  v_order2 TEXT;
  v_order3 TEXT;
BEGIN
  SELECT id INTO v_order1 FROM public.orders LIMIT 1 OFFSET 0;
  SELECT id INTO v_order2 FROM public.orders LIMIT 1 OFFSET 1;
  SELECT id INTO v_order3 FROM public.orders LIMIT 1 OFFSET 2;

  -- Order alert notifications
  INSERT INTO public.notifications (id, alert_type, title, message, order_id, is_dismissed, is_archived, created_at)
  VALUES
    (gen_random_uuid(), 'order_alert'::public.alert_type,
     'New Order Received',
     'A new order has been placed and is awaiting processing.',
     v_order1, false, false, NOW() - INTERVAL '15 minutes'),
    (gen_random_uuid(), 'order_alert'::public.alert_type,
     'Order Requires Attention',
     'Order has been flagged and requires manual review before dispatch.',
     v_order2, false, false, NOW() - INTERVAL '45 minutes')
  ON CONFLICT (id) DO NOTHING;

  -- Status update notifications
  INSERT INTO public.notifications (id, alert_type, title, message, order_id, is_dismissed, is_archived, created_at)
  VALUES
    (gen_random_uuid(), 'status_update'::public.alert_type,
     'Order Status Updated',
     'Order status has changed to Out for Delivery.',
     v_order1, false, false, NOW() - INTERVAL '1 hour'),
    (gen_random_uuid(), 'status_update'::public.alert_type,
     'Delivery Completed',
     'Order has been successfully delivered and confirmed by driver.',
     v_order3, false, true, NOW() - INTERVAL '3 hours')
  ON CONFLICT (id) DO NOTHING;

  -- Payment confirmation notifications
  INSERT INTO public.notifications (id, alert_type, title, message, order_id, is_dismissed, is_archived, created_at)
  VALUES
    (gen_random_uuid(), 'payment_confirmation'::public.alert_type,
     'Payment Confirmed',
     'Payment of £85.00 has been successfully received for this order.',
     v_order2, false, false, NOW() - INTERVAL '2 hours'),
    (gen_random_uuid(), 'payment_confirmation'::public.alert_type,
     'Payment Received',
     'Card payment processed successfully. Order is now confirmed.',
     v_order3, false, false, NOW() - INTERVAL '6 hours')
  ON CONFLICT (id) DO NOTHING;

EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Mock notification v2 data insertion failed: %', SQLERRM;
END $$;
