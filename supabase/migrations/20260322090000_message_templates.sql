-- Message Templates & Email Alert Logs Migration

-- ─── Types ────────────────────────────────────────────────────────────────────

DROP TYPE IF EXISTS public.template_channel CASCADE;
CREATE TYPE public.template_channel AS ENUM ('email', 'sms');

DROP TYPE IF EXISTS public.alert_trigger_type CASCADE;
CREATE TYPE public.alert_trigger_type AS ENUM (
  'new_assignment',
  'delivery_failure',
  'payment_issue',
  'daily_summary',
  'booking_accepted',
  'booking_assigned',
  'booking_out_for_delivery',
  'booking_complete',
  'custom'
);

-- ─── Tables ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.message_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  channel public.template_channel NOT NULL DEFAULT 'email',
  trigger_type public.alert_trigger_type NOT NULL DEFAULT 'custom',
  subject TEXT,
  body TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_admin_alert BOOLEAN NOT NULL DEFAULT false,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.email_alert_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES public.message_templates(id) ON DELETE SET NULL,
  trigger_type public.alert_trigger_type NOT NULL,
  channel public.template_channel NOT NULL DEFAULT 'email',
  recipient TEXT NOT NULL,
  subject TEXT,
  status TEXT NOT NULL DEFAULT 'sent',
  error_message TEXT,
  order_id TEXT,
  metadata JSONB,
  sent_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_message_templates_channel ON public.message_templates(channel);
CREATE INDEX IF NOT EXISTS idx_message_templates_trigger ON public.message_templates(trigger_type);
CREATE INDEX IF NOT EXISTS idx_message_templates_active ON public.message_templates(is_active);
CREATE INDEX IF NOT EXISTS idx_email_alert_logs_trigger ON public.email_alert_logs(trigger_type);
CREATE INDEX IF NOT EXISTS idx_email_alert_logs_sent_at ON public.email_alert_logs(sent_at DESC);

-- ─── Updated At Trigger ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_message_templates_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_message_templates_updated_at ON public.message_templates;
CREATE TRIGGER trg_message_templates_updated_at
  BEFORE UPDATE ON public.message_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_message_templates_updated_at();

-- ─── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_alert_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_manage_message_templates" ON public.message_templates;
CREATE POLICY "authenticated_manage_message_templates"
  ON public.message_templates FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_manage_email_alert_logs" ON public.email_alert_logs;
CREATE POLICY "authenticated_manage_email_alert_logs"
  ON public.email_alert_logs FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ─── Seed Default Templates ───────────────────────────────────────────────────

DO $$
BEGIN
  -- New Assignment Alert (admin email)
  INSERT INTO public.message_templates (name, channel, trigger_type, subject, body, is_active, is_admin_alert, description)
  VALUES (
    'New Assignment Alert',
    'email',
    'new_assignment',
    'New Booking Assigned – {{order_id}}',
    '<p>Hi Admin,</p><p>A new booking has been assigned.</p><p><strong>Order ID:</strong> {{order_id}}<br/><strong>Customer:</strong> {{customer_name}}<br/><strong>Address:</strong> {{address}}<br/><strong>Items:</strong> {{items}}<br/><strong>Status:</strong> {{status}}</p><p>Please review the assignment in the admin portal.</p>',
    true,
    true,
    'Sent to admin when a new booking is assigned to a driver'
  ) ON CONFLICT DO NOTHING;

  -- Delivery Failure Alert (admin email)
  INSERT INTO public.message_templates (name, channel, trigger_type, subject, body, is_active, is_admin_alert, description)
  VALUES (
    'Delivery Failure Alert',
    'email',
    'delivery_failure',
    'Delivery Failed – {{order_id}}',
    '<p>Hi Admin,</p><p>A delivery has failed and requires attention.</p><p><strong>Order ID:</strong> {{order_id}}<br/><strong>Customer:</strong> {{customer_name}}<br/><strong>Address:</strong> {{address}}<br/><strong>Status:</strong> {{status}}</p><p>Please follow up with the driver and customer immediately.</p>',
    true,
    true,
    'Sent to admin when a delivery fails'
  ) ON CONFLICT DO NOTHING;

  -- Payment Issue Alert (admin email)
  INSERT INTO public.message_templates (name, channel, trigger_type, subject, body, is_active, is_admin_alert, description)
  VALUES (
    'Payment Issue Alert',
    'email',
    'payment_issue',
    'Payment Issue Detected – {{order_id}}',
    '<p>Hi Admin,</p><p>A payment issue has been detected for the following order.</p><p><strong>Order ID:</strong> {{order_id}}<br/><strong>Customer:</strong> {{customer_name}}<br/><strong>Status:</strong> {{status}}</p><p>Please review the payment details in the admin portal.</p>',
    true,
    true,
    'Sent to admin when a payment issue is detected'
  ) ON CONFLICT DO NOTHING;

  -- Daily Summary Digest (admin email)
  INSERT INTO public.message_templates (name, channel, trigger_type, subject, body, is_active, is_admin_alert, description)
  VALUES (
    'Daily Summary Digest',
    'email',
    'daily_summary',
    'Daily Operations Summary – {{date}}',
    '<p>Hi Admin,</p><p>Here is your daily operations summary.</p><p><strong>Total Bookings:</strong> {{total_bookings}}<br/><strong>Completed:</strong> {{completed_bookings}}<br/><strong>Failed:</strong> {{failed_bookings}}<br/><strong>Pending:</strong> {{pending_bookings}}</p><p>Log in to the admin portal for full details.</p>',
    true,
    true,
    'Daily digest sent to admin with operations summary'
  ) ON CONFLICT DO NOTHING;

  -- Booking Accepted (customer email)
  INSERT INTO public.message_templates (name, channel, trigger_type, subject, body, is_active, is_admin_alert, description)
  VALUES (
    'Booking Accepted – Customer',
    'email',
    'booking_accepted',
    'Your Booking Has Been Accepted – {{order_id}}',
    '<p>Hi {{customer_name}},</p><p>Great news! Your booking has been accepted.</p><p><strong>Order ID:</strong> {{order_id}}<br/><strong>Address:</strong> {{address}}<br/><strong>Items:</strong> {{items}}<br/><strong>Status:</strong> {{status}}</p><p>We will keep you updated as your delivery progresses.</p>',
    true,
    false,
    'Sent to customer when their booking is accepted'
  ) ON CONFLICT DO NOTHING;

  -- Booking Out For Delivery (customer SMS)
  INSERT INTO public.message_templates (name, channel, trigger_type, subject, body, is_active, is_admin_alert, description)
  VALUES (
    'Out For Delivery – Customer SMS',
    'sms',
    'booking_out_for_delivery',
    NULL,
    'Hi {{customer_name}}, your order {{order_id}} is out for delivery! Track it here: {{tracking_link}}',
    true,
    false,
    'SMS sent to customer when their order is out for delivery'
  ) ON CONFLICT DO NOTHING;

  -- Booking Complete (customer email)
  INSERT INTO public.message_templates (name, channel, trigger_type, subject, body, is_active, is_admin_alert, description)
  VALUES (
    'Delivery Complete – Customer',
    'email',
    'booking_complete',
    'Your Delivery Is Complete – {{order_id}}',
    '<p>Hi {{customer_name}},</p><p>Your order has been successfully delivered!</p><p><strong>Order ID:</strong> {{order_id}}<br/><strong>Status:</strong> {{status}}</p><p>Thank you for choosing us. We hope to serve you again soon.</p>',
    true,
    false,
    'Sent to customer when their delivery is complete'
  ) ON CONFLICT DO NOTHING;

EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Seed data insertion failed: %', SQLERRM;
END $$;
