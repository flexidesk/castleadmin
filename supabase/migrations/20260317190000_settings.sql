-- ─── Settings Migration ───────────────────────────────────────────────────────
-- Tables: fleet_config, notification_preferences, user_roles, system_integrations

-- 1. Fleet Configuration
CREATE TABLE IF NOT EXISTS public.fleet_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL DEFAULT 'CastleAdmin Fleet',
  timezone TEXT NOT NULL DEFAULT 'Europe/London',
  currency TEXT NOT NULL DEFAULT 'GBP',
  base_delivery_fee NUMERIC(10,2) NOT NULL DEFAULT 5.00,
  per_km_fee NUMERIC(10,2) NOT NULL DEFAULT 0.50,
  min_delivery_fee NUMERIC(10,2) NOT NULL DEFAULT 3.00,
  max_delivery_fee NUMERIC(10,2) NOT NULL DEFAULT 50.00,
  fee_structure TEXT NOT NULL DEFAULT 'flat',
  company_address TEXT,
  company_phone TEXT,
  company_email TEXT,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_by UUID
);

-- 2. Notification Preferences
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notify_new_order BOOLEAN NOT NULL DEFAULT true,
  notify_order_status_change BOOLEAN NOT NULL DEFAULT true,
  notify_driver_assigned BOOLEAN NOT NULL DEFAULT true,
  notify_delivery_complete BOOLEAN NOT NULL DEFAULT true,
  notify_delivery_failed BOOLEAN NOT NULL DEFAULT true,
  notify_driver_offline BOOLEAN NOT NULL DEFAULT false,
  notify_low_driver_availability BOOLEAN NOT NULL DEFAULT true,
  email_notifications BOOLEAN NOT NULL DEFAULT true,
  sms_notifications BOOLEAN NOT NULL DEFAULT false,
  push_notifications BOOLEAN NOT NULL DEFAULT true,
  notification_email TEXT,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 3. User Roles
DROP TYPE IF EXISTS public.user_role_level CASCADE;
CREATE TYPE public.user_role_level AS ENUM ('admin', 'manager', 'dispatcher', 'viewer');

CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL DEFAULT '',
  role public.user_role_level NOT NULL DEFAULT 'viewer',
  is_active BOOLEAN NOT NULL DEFAULT true,
  can_create_orders BOOLEAN NOT NULL DEFAULT false,
  can_edit_orders BOOLEAN NOT NULL DEFAULT false,
  can_delete_orders BOOLEAN NOT NULL DEFAULT false,
  can_manage_drivers BOOLEAN NOT NULL DEFAULT false,
  can_view_analytics BOOLEAN NOT NULL DEFAULT false,
  can_manage_settings BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 4. System Integrations
CREATE TABLE IF NOT EXISTS public.system_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  api_key TEXT,
  api_secret TEXT,
  webhook_url TEXT,
  config JSONB DEFAULT '{}',
  last_synced_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'disconnected',
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_roles_email ON public.user_roles(email);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON public.user_roles(role);
CREATE INDEX IF NOT EXISTS idx_system_integrations_slug ON public.system_integrations(slug);

-- Enable RLS
ALTER TABLE public.fleet_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_integrations ENABLE ROW LEVEL SECURITY;

-- RLS Policies (authenticated users can read/write — admin app)
DROP POLICY IF EXISTS "authenticated_manage_fleet_config" ON public.fleet_config;
CREATE POLICY "authenticated_manage_fleet_config"
ON public.fleet_config FOR ALL TO authenticated
USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_manage_notification_preferences" ON public.notification_preferences;
CREATE POLICY "authenticated_manage_notification_preferences"
ON public.notification_preferences FOR ALL TO authenticated
USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_manage_user_roles" ON public.user_roles;
CREATE POLICY "authenticated_manage_user_roles"
ON public.user_roles FOR ALL TO authenticated
USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_manage_system_integrations" ON public.system_integrations;
CREATE POLICY "authenticated_manage_system_integrations"
ON public.system_integrations FOR ALL TO authenticated
USING (true) WITH CHECK (true);

-- Seed default fleet config
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.fleet_config LIMIT 1) THEN
    INSERT INTO public.fleet_config (
      company_name, timezone, currency, base_delivery_fee, per_km_fee,
      min_delivery_fee, max_delivery_fee, fee_structure,
      company_address, company_phone, company_email
    ) VALUES (
      'CastleAdmin Fleet', 'Europe/London', 'GBP', 5.00, 0.50,
      3.00, 50.00, 'flat',
      '123 Fleet Street, London, EC4A 2BB', '+44 20 7946 0958', 'admin@castlefleet.co.uk'
    );
  END IF;
END $$;

-- Seed default notification preferences
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.notification_preferences LIMIT 1) THEN
    INSERT INTO public.notification_preferences (
      notify_new_order, notify_order_status_change, notify_driver_assigned,
      notify_delivery_complete, notify_delivery_failed, notify_driver_offline,
      notify_low_driver_availability, email_notifications, sms_notifications,
      push_notifications, notification_email
    ) VALUES (
      true, true, true, true, true, false, true, true, false, true, 'admin@castlefleet.co.uk'
    );
  END IF;
END $$;

-- Seed system integrations
DO $$
BEGIN
  INSERT INTO public.system_integrations (name, slug, description, is_enabled, status) VALUES
    ('WooCommerce', 'woocommerce', 'Sync orders from WooCommerce store', true, 'connected'),
    ('Google Maps', 'google-maps', 'Route optimisation and geocoding', false, 'disconnected'),
    ('Stripe', 'stripe', 'Payment processing and invoicing', false, 'disconnected'),
    ('Twilio SMS', 'twilio', 'SMS notifications to customers and drivers', false, 'disconnected'),
    ('SendGrid', 'sendgrid', 'Transactional email delivery', false, 'disconnected'),
    ('Slack', 'slack', 'Team notifications and alerts', false, 'disconnected')
  ON CONFLICT (slug) DO NOTHING;
END $$;

-- Seed sample user roles
DO $$
BEGIN
  INSERT INTO public.user_roles (email, full_name, role, is_active, can_create_orders, can_edit_orders, can_delete_orders, can_manage_drivers, can_view_analytics, can_manage_settings) VALUES
    ('admin@castlefleet.co.uk', 'System Admin', 'admin', true, true, true, true, true, true, true),
    ('manager@castlefleet.co.uk', 'Operations Manager', 'manager', true, true, true, false, true, true, false),
    ('dispatcher@castlefleet.co.uk', 'Dispatch Controller', 'dispatcher', true, true, true, false, false, false, false),
    ('viewer@castlefleet.co.uk', 'Read-Only User', 'viewer', true, false, false, false, false, true, false)
  ON CONFLICT DO NOTHING;
END $$;
