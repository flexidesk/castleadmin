-- ─── Extended Settings Migration ─────────────────────────────────────────────
-- Tables: company_profile, api_keys, system_config

-- 1. Company Profile
CREATE TABLE IF NOT EXISTS public.company_profile (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL DEFAULT 'CastleAdmin',
  trading_name TEXT,
  registration_number TEXT,
  vat_number TEXT,
  industry TEXT DEFAULT 'Logistics & Delivery',
  company_size TEXT DEFAULT '1-10',
  founded_year TEXT,
  website_url TEXT,
  logo_url TEXT,
  primary_email TEXT,
  support_email TEXT,
  billing_email TEXT,
  primary_phone TEXT,
  secondary_phone TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  county TEXT,
  postcode TEXT,
  country TEXT DEFAULT 'United Kingdom',
  social_linkedin TEXT,
  social_twitter TEXT,
  social_facebook TEXT,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2. API Keys
CREATE TABLE IF NOT EXISTS public.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  key_preview TEXT NOT NULL,
  scopes TEXT[] DEFAULT ARRAY['read']::TEXT[],
  is_active BOOLEAN NOT NULL DEFAULT true,
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  usage_count INTEGER NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 3. System Configuration
CREATE TABLE IF NOT EXISTS public.system_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key TEXT NOT NULL UNIQUE,
  config_value TEXT,
  config_type TEXT NOT NULL DEFAULT 'string',
  category TEXT NOT NULL DEFAULT 'general',
  label TEXT NOT NULL,
  description TEXT,
  is_sensitive BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_api_keys_is_active ON public.api_keys(is_active);
CREATE INDEX IF NOT EXISTS idx_system_config_category ON public.system_config(category);
CREATE INDEX IF NOT EXISTS idx_system_config_key ON public.system_config(config_key);

-- Enable RLS
ALTER TABLE public.company_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "authenticated_manage_company_profile" ON public.company_profile;
CREATE POLICY "authenticated_manage_company_profile"
ON public.company_profile FOR ALL TO authenticated
USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_manage_api_keys" ON public.api_keys;
CREATE POLICY "authenticated_manage_api_keys"
ON public.api_keys FOR ALL TO authenticated
USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_manage_system_config" ON public.system_config;
CREATE POLICY "authenticated_manage_system_config"
ON public.system_config FOR ALL TO authenticated
USING (true) WITH CHECK (true);

-- Seed company profile
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.company_profile LIMIT 1) THEN
    INSERT INTO public.company_profile (
      company_name, trading_name, registration_number, vat_number,
      industry, company_size, founded_year, website_url,
      primary_email, support_email, billing_email,
      primary_phone, address_line1, city, county, postcode, country,
      description
    ) VALUES (
      'CastleAdmin Ltd', 'CastleAdmin', 'SC123456', 'GB123456789',
      'Logistics & Delivery', '11-50', '2020', 'https://castleadmin.co.uk',
      'admin@castlefleet.co.uk', 'support@castlefleet.co.uk', 'billing@castlefleet.co.uk',
      '+44 20 7946 0958', '123 Fleet Street', 'London', 'Greater London', 'EC4A 2BB', 'United Kingdom',
      'Last-mile delivery and fleet management platform'
    );
  END IF;
END $$;

-- Seed system config
DO $$
BEGIN
  INSERT INTO public.system_config (config_key, config_value, config_type, category, label, description, is_sensitive) VALUES
    ('maintenance_mode', 'false', 'boolean', 'general', 'Maintenance Mode', 'Put the system into maintenance mode — blocks all non-admin access', false),
    ('allow_driver_self_registration', 'false', 'boolean', 'general', 'Driver Self-Registration', 'Allow drivers to register themselves via the driver portal', false),
    ('require_pod_for_completion', 'true', 'boolean', 'orders', 'Require POD for Completion', 'Drivers must upload proof of delivery before marking an order complete', false),
    ('auto_assign_drivers', 'false', 'boolean', 'orders', 'Auto-Assign Drivers', 'Automatically assign the nearest available driver to new orders', false),
    ('order_expiry_hours', '48', 'number', 'orders', 'Order Expiry (hours)', 'Automatically cancel unassigned orders after this many hours', false),
    ('max_orders_per_driver', '10', 'number', 'orders', 'Max Orders per Driver', 'Maximum concurrent active orders a single driver can hold', false),
    ('session_timeout_minutes', '60', 'number', 'security', 'Session Timeout (minutes)', 'Automatically log out inactive admin sessions', false),
    ('two_factor_required', 'false', 'boolean', 'security', 'Require 2FA', 'Enforce two-factor authentication for all admin accounts', false),
    ('ip_whitelist_enabled', 'false', 'boolean', 'security', 'IP Whitelist', 'Restrict admin access to whitelisted IP addresses only', false),
    ('audit_log_retention_days', '90', 'number', 'security', 'Audit Log Retention (days)', 'How long to keep activity log entries', false),
    ('default_map_zoom', '12', 'number', 'display', 'Default Map Zoom', 'Default zoom level for the live tracking map', false),
    ('date_format', 'DD/MM/YYYY', 'string', 'display', 'Date Format', 'Display format for dates throughout the application', false),
    ('items_per_page', '25', 'number', 'display', 'Items per Page', 'Default number of rows shown in tables and lists', false),
    ('enable_dark_mode', 'false', 'boolean', 'display', 'Enable Dark Mode Toggle', 'Show a dark mode toggle in the top bar', false)
  ON CONFLICT (config_key) DO NOTHING;
END $$;
