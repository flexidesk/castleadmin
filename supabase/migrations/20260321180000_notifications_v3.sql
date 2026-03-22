-- Notifications v3: Add driver_shift_reminder, payment_notification, admin_alert types
-- Migration: 20260321180000_notifications_v3.sql

-- 1. Add new enum values (idempotent via DO block check)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'driver_shift_reminder'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'alert_type' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public'))
  ) THEN
    ALTER TYPE public.alert_type ADD VALUE 'driver_shift_reminder';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'payment_notification'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'alert_type' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public'))
  ) THEN
    ALTER TYPE public.alert_type ADD VALUE 'payment_notification';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'admin_alert'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'alert_type' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public'))
  ) THEN
    ALTER TYPE public.alert_type ADD VALUE 'admin_alert';
  END IF;
END $$;

-- 2. Add driver_id column to notifications for linking shift reminders to drivers
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS driver_id UUID;

-- 3. Add metadata column for extra context (shift time, payment amount, etc.)
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS metadata JSONB;

-- 4. Index for driver_id lookups
CREATE INDEX IF NOT EXISTS idx_notifications_driver_id ON public.notifications(driver_id);

-- 5. Mock data for new notification types
DO $$
DECLARE
  v_driver1 UUID;
  v_driver2 UUID;
  v_order1 TEXT;
  v_order2 TEXT;
BEGIN
  -- Get existing driver IDs if available
  SELECT id INTO v_driver1 FROM public.drivers LIMIT 1 OFFSET 0;
  SELECT id INTO v_driver2 FROM public.drivers LIMIT 1 OFFSET 1;
  SELECT id INTO v_order1 FROM public.orders LIMIT 1 OFFSET 0;
  SELECT id INTO v_order2 FROM public.orders LIMIT 1 OFFSET 1;

  -- Driver shift reminder notifications
  INSERT INTO public.notifications (id, alert_type, title, message, driver_id, is_dismissed, is_archived, metadata, created_at)
  VALUES
    (gen_random_uuid(), 'driver_shift_reminder'::public.alert_type,
     'Shift Starting Soon',
     'Your shift begins in 30 minutes. Please ensure you are ready for dispatch.',
     v_driver1, false, false,
     jsonb_build_object('shift_start', NOW() + INTERVAL '30 minutes', 'shift_type', 'regular'),
     NOW() - INTERVAL '5 minutes'),
    (gen_random_uuid(), 'driver_shift_reminder'::public.alert_type,
     'End of Shift Reminder',
     'Your shift ends in 1 hour. Please complete any active deliveries.',
     v_driver2, false, false,
     jsonb_build_object('shift_end', NOW() + INTERVAL '1 hour', 'shift_type', 'evening'),
     NOW() - INTERVAL '20 minutes'),
    (gen_random_uuid(), 'driver_shift_reminder'::public.alert_type,
     'Driver Clocked In',
     'Driver has clocked in and is now available for assignments.',
     v_driver1, false, false,
     jsonb_build_object('clock_in_time', NOW() - INTERVAL '2 hours', 'shift_type', 'regular'),
     NOW() - INTERVAL '2 hours')
  ON CONFLICT (id) DO NOTHING;

  -- Payment notification notifications
  INSERT INTO public.notifications (id, alert_type, title, message, order_id, is_dismissed, is_archived, metadata, created_at)
  VALUES
    (gen_random_uuid(), 'payment_notification'::public.alert_type,
     'Payment Overdue',
     'Invoice payment is now 3 days overdue. Please follow up with the customer.',
     v_order1, false, false,
     jsonb_build_object('amount', 125.00, 'currency', 'GBP', 'days_overdue', 3),
     NOW() - INTERVAL '1 hour'),
    (gen_random_uuid(), 'payment_notification'::public.alert_type,
     'Driver Payment Due',
     'Weekly driver payment of £340.00 is due for processing.',
     v_order2, false, false,
     jsonb_build_object('amount', 340.00, 'currency', 'GBP', 'payment_type', 'driver_weekly'),
     NOW() - INTERVAL '3 hours'),
    (gen_random_uuid(), 'payment_notification'::public.alert_type,
     'Refund Requested',
     'Customer has requested a refund. Review and process within 24 hours.',
     v_order1, false, false,
     jsonb_build_object('amount', 65.00, 'currency', 'GBP', 'refund_reason', 'damaged_goods'),
     NOW() - INTERVAL '5 hours')
  ON CONFLICT (id) DO NOTHING;

  -- Admin alert notifications
  INSERT INTO public.notifications (id, alert_type, title, message, is_dismissed, is_archived, metadata, created_at)
  VALUES
    (gen_random_uuid(), 'admin_alert'::public.alert_type,
     'High Order Volume',
     'Order volume is 40% above average for this time period. Consider adding more drivers.',
     false, false,
     jsonb_build_object('current_volume', 28, 'average_volume', 20, 'threshold_percent', 40),
     NOW() - INTERVAL '30 minutes'),
    (gen_random_uuid(), 'admin_alert'::public.alert_type,
     'Driver Shortage Alert',
     'Only 2 drivers are currently available with 8 pending orders in the queue.',
     false, false,
     jsonb_build_object('available_drivers', 2, 'pending_orders', 8, 'severity', 'high'),
     NOW() - INTERVAL '45 minutes'),
    (gen_random_uuid(), 'admin_alert'::public.alert_type,
     'System Maintenance Scheduled',
     'Scheduled maintenance window tonight from 02:00 to 04:00 GMT. Plan accordingly.',
     false, false,
     jsonb_build_object('maintenance_start', '02:00', 'maintenance_end', '04:00', 'timezone', 'GMT'),
     NOW() - INTERVAL '2 hours')
  ON CONFLICT (id) DO NOTHING;

EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Mock notification v3 data insertion failed: %', SQLERRM;
END $$;
