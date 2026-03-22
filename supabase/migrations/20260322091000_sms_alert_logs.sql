-- SMS Alert Logs Migration (Twilio)
-- Adds sms_alert_logs table for tracking Twilio SMS sends

CREATE TABLE IF NOT EXISTS public.sms_alert_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES public.message_templates(id) ON DELETE SET NULL,
  trigger_type public.alert_trigger_type NOT NULL,
  channel public.template_channel NOT NULL DEFAULT 'sms',
  recipient TEXT NOT NULL,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'sent',
  error_message TEXT,
  message_sid TEXT,
  order_id TEXT,
  metadata JSONB,
  sent_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_sms_alert_logs_trigger ON public.sms_alert_logs(trigger_type);
CREATE INDEX IF NOT EXISTS idx_sms_alert_logs_sent_at ON public.sms_alert_logs(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_sms_alert_logs_status ON public.sms_alert_logs(status);

-- ─── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.sms_alert_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_manage_sms_alert_logs" ON public.sms_alert_logs;
CREATE POLICY "authenticated_manage_sms_alert_logs"
  ON public.sms_alert_logs FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ─── Seed SMS Templates for Driver Shifts, Payment, Delivery Failures ─────────

DO $$
BEGIN
  -- Driver Shift Assignment SMS
  INSERT INTO public.message_templates (name, channel, trigger_type, subject, body, is_active, is_admin_alert, description)
  VALUES (
    'Driver Shift Assignment – SMS',
    'sms',
    'new_assignment',
    NULL,
    'Hi {{customer_name}}, you have been assigned a new delivery shift. Order: {{order_id}} | Address: {{address}}. Check the driver portal for details.',
    true,
    false,
    'SMS sent to driver when a new shift/order is assigned'
  ) ON CONFLICT DO NOTHING;

  -- Delivery Failure SMS (admin)
  INSERT INTO public.message_templates (name, channel, trigger_type, subject, body, is_active, is_admin_alert, description)
  VALUES (
    'Delivery Failure Alert – SMS',
    'sms',
    'delivery_failure',
    NULL,
    'ALERT: Delivery failed for Order {{order_id}} ({{customer_name}}, {{address}}). Status: {{status}}. Immediate action required.',
    true,
    true,
    'SMS alert to admin when a delivery fails'
  ) ON CONFLICT DO NOTHING;

  -- Payment Issue SMS (admin)
  INSERT INTO public.message_templates (name, channel, trigger_type, subject, body, is_active, is_admin_alert, description)
  VALUES (
    'Payment Issue Alert – SMS',
    'sms',
    'payment_issue',
    NULL,
    'PAYMENT ALERT: Issue detected for Order {{order_id}} ({{customer_name}}). Status: {{status}}. Please review immediately.',
    true,
    true,
    'SMS alert to admin when a payment issue is detected'
  ) ON CONFLICT DO NOTHING;

EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'SMS seed data insertion failed: %', SQLERRM;
END $$;
