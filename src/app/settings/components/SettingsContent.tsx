'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Settings, Building2, Bell, Users, Plug, Save, RefreshCw, Car, AlertTriangle, Key, Globe, MapPin, ShoppingCart, CheckCircle, XCircle, Loader, Webhook, Copy, Trash2 } from 'lucide-react';
import { toast } from 'sonner';



// ─── Types ────────────────────────────────────────────────────────────────────

interface FleetConfig {
  id?: string;
  company_name: string;
  timezone: string;
  currency: string;
  base_delivery_fee: number;
  per_km_fee: number;
  min_delivery_fee: number;
  max_delivery_fee: number;
  fee_structure: string;
  company_address: string;
  company_phone: string;
  company_email: string;
  auto_zone_allocation?: boolean;
  map_default_zone_id?: string | null;
  map_default_postcode?: string;
}

interface NotificationPrefs {
  id?: string;
  notify_new_order: boolean;
  notify_order_status_change: boolean;
  notify_driver_assigned: boolean;
  notify_delivery_complete: boolean;
  notify_delivery_failed: boolean;
  notify_driver_offline: boolean;
  notify_low_driver_availability: boolean;
  email_notifications: boolean;
  sms_notifications: boolean;
  push_notifications: boolean;
  notification_email: string;
}

interface UserRole {
  id: string;
  email: string;
  full_name: string;
  role: 'admin' | 'manager' | 'dispatcher' | 'viewer';
  is_active: boolean;
  can_create_orders: boolean;
  can_edit_orders: boolean;
  can_delete_orders: boolean;
  can_manage_drivers: boolean;
  can_view_analytics: boolean;
  can_manage_settings: boolean;
}

interface Integration {
  id: string;
  name: string;
  slug: string;
  description: string;
  is_enabled: boolean;
  api_key: string | null;
  webhook_url: string | null;
  status: string;
  last_synced_at: string | null;
}

interface DriverRateSettings {
  id?: string;
  base_rate_per_hour: number;
  rate_per_km: number;
  overtime_multiplier: number;
  weekend_multiplier: number;
  night_shift_multiplier: number;
  bonus_per_delivery: number;
  fuel_allowance_per_km: number;
  min_guaranteed_hours: number;
  max_hours_per_day: number;
  currency: string;
  pay_cycle: string;
}

interface AlertThresholds {
  id?: string;
  min_active_drivers: number;
  low_driver_warning_pct: number;
  late_delivery_minutes: number;
  critical_delay_minutes: number;
  max_failed_deliveries_pct: number;
  high_order_volume_per_hour: number;
  unassigned_order_warning_count: number;
  driver_offline_alert_minutes: number;
  gps_stale_alert_minutes: number;
  daily_revenue_target: number;
  low_revenue_warning_pct: number;
}

interface CompanyProfile {
  id?: string;
  company_name: string;
  trading_name: string;
  registration_number: string;
  vat_number: string;
  industry: string;
  company_size: string;
  founded_year: string;
  website_url: string;
  logo_url: string;
  primary_email: string;
  support_email: string;
  billing_email: string;
  primary_phone: string;
  secondary_phone: string;
  address_line1: string;
  address_line2: string;
  city: string;
  county: string;
  postcode: string;
  country: string;
  social_linkedin: string;
  social_twitter: string;
  social_facebook: string;
  description: string;
}

interface ApiKey {
  id: string;
  name: string;
  description: string;
  key_prefix: string;
  key_preview: string;
  scopes: string[];
  is_active: boolean;
  expires_at: string | null;
  last_used_at: string | null;
  usage_count: number;
  created_by: string;
  created_at: string;
}

interface DeliveryZone {
  id: string;
  name: string;
  color: string;
  is_active: boolean;
}

interface WooCommerceSettings {
  id?: string;
  store_url: string;
  consumer_key: string;
  consumer_secret: string;
  is_connected: boolean;
  last_tested_at?: string | null;
  last_test_status?: string | null;
  last_test_message?: string | null;
  field_mapping?: WooCommerceFieldMapping;
}

interface WooCommerceFieldMapping {
  order_id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  delivery_address: string;
  delivery_city: string;
  delivery_postcode: string;
  order_notes: string;
  order_total: string;
  order_status: string;
}

interface WebhookConfig {
  id?: string;
  name: string;
  url: string;
  method: 'GET' | 'POST';
  secret: string;
  events: string[];
  is_active: boolean;
  last_triggered_at?: string | null;
  last_status?: string | null;
}

type TabId = 'fleet' | 'notifications' | 'driver_rates' | 'alert_thresholds' | 'roles' | 'integrations' | 'company';

const TIMEZONES = [
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Madrid',
  'America/New_York', 'America/Chicago', 'America/Los_Angeles',
  'Asia/Dubai', 'Asia/Singapore', 'Australia/Sydney',
];

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-red-100 text-red-700',
  manager: 'bg-blue-100 text-blue-700',
  dispatcher: 'bg-yellow-100 text-yellow-700',
  viewer: 'bg-gray-100 text-gray-600',
};

const INTEGRATION_ICONS: Record<string, string> = {
  woocommerce: '🛒',
  'google-maps': '🗺️',
  stripe: '💳',
  twilio: '📱',
  sendgrid: '📧',
  slack: '💬',
};

const API_SCOPES = ['read', 'write', 'orders:read', 'orders:write', 'drivers:read', 'drivers:write', 'analytics:read', 'settings:read', 'settings:write'];

const DEFAULT_FLEET: FleetConfig = {
  company_name: '', timezone: 'Europe/London', currency: 'GBP',
  base_delivery_fee: 5, per_km_fee: 0.5, min_delivery_fee: 3,
  max_delivery_fee: 50, fee_structure: 'flat',
  company_address: '', company_phone: '', company_email: '',
  auto_zone_allocation: false,
  map_default_zone_id: null,
  map_default_postcode: '',
};

const DEFAULT_COMPANY_PROFILE: CompanyProfile = {
  company_name: '', trading_name: '', registration_number: '', vat_number: '',
  industry: 'Logistics & Delivery', company_size: '1-10', founded_year: '',
  website_url: '', logo_url: '', primary_email: '', support_email: '',
  billing_email: '', primary_phone: '', secondary_phone: '',
  address_line1: '', address_line2: '', city: '', county: '', postcode: '',
  country: 'United Kingdom', social_linkedin: '', social_twitter: '',
  social_facebook: '', description: '',
};

const DEFAULT_NOTIF_PREFS: NotificationPrefs = {
  notify_new_order: true, notify_order_status_change: true,
  notify_driver_assigned: true, notify_delivery_complete: true,
  notify_delivery_failed: true, notify_driver_offline: false,
  notify_low_driver_availability: true, email_notifications: true,
  sms_notifications: false, push_notifications: true, notification_email: '',
};

const DEFAULT_DRIVER_RATES: DriverRateSettings = {
  base_rate_per_hour: 12, rate_per_km: 0.25, overtime_multiplier: 1.5,
  weekend_multiplier: 1.25, night_shift_multiplier: 1.20, bonus_per_delivery: 0.50,
  fuel_allowance_per_km: 0.15, min_guaranteed_hours: 4, max_hours_per_day: 10,
  currency: 'GBP', pay_cycle: 'weekly',
};

const DEFAULT_ALERT_THRESHOLDS: AlertThresholds = {
  min_active_drivers: 2, low_driver_warning_pct: 30,
  late_delivery_minutes: 15, critical_delay_minutes: 45, max_failed_deliveries_pct: 10,
  high_order_volume_per_hour: 20, unassigned_order_warning_count: 5,
  driver_offline_alert_minutes: 10, gps_stale_alert_minutes: 5,
  daily_revenue_target: 1000, low_revenue_warning_pct: 70,
};

const DEFAULT_WC_FIELD_MAPPING: WooCommerceFieldMapping = {
  order_id: 'id',
  customer_name: 'billing.first_name + billing.last_name',
  customer_email: 'billing.email',
  customer_phone: 'billing.phone',
  delivery_address: 'shipping.address_1',
  delivery_city: 'shipping.city',
  delivery_postcode: 'shipping.postcode',
  order_notes: 'customer_note',
  order_total: 'total',
  order_status: 'status',
};

const DEFAULT_WC_SETTINGS: WooCommerceSettings = {
  store_url: '', consumer_key: '', consumer_secret: '', is_connected: false,
};

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SettingsContent() {
  const supabase = createClient();
  const [activeTab, setActiveTab] = useState<TabId>('fleet');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Fleet config
  const [fleet, setFleet] = useState<FleetConfig>(DEFAULT_FLEET);

  // Notification prefs
  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs>(DEFAULT_NOTIF_PREFS);

  // User roles
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [newRoleForm, setNewRoleForm] = useState({ email: '', full_name: '', role: 'viewer' as UserRole['role'] });
  const [showNewRoleForm, setShowNewRoleForm] = useState(false);
  const [expandedRole, setExpandedRole] = useState<string | null>(null);

  // Integrations
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [editingIntegration, setEditingIntegration] = useState<string | null>(null);
  const [integrationApiKey, setIntegrationApiKey] = useState('');
  const [integrationWebhook, setIntegrationWebhook] = useState('');

  // Driver rate settings
  const [driverRates, setDriverRates] = useState<DriverRateSettings>(DEFAULT_DRIVER_RATES);

  // Alert thresholds
  const [alertThresholds, setAlertThresholds] = useState<AlertThresholds>(DEFAULT_ALERT_THRESHOLDS);

  // Company profile
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile>(DEFAULT_COMPANY_PROFILE);

  // API Keys
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [showNewKeyForm, setShowNewKeyForm] = useState(false);
  const [newKeyForm, setNewKeyForm] = useState({ name: '', description: '', scopes: ['read'] as string[], expires_at: '' });
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());

  // WooCommerce UI state
  const [wcShowInstructions, setWcShowInstructions] = useState(false);
  const [wcShowFieldMapping, setWcShowFieldMapping] = useState(false);
  const [wcFieldMapping, setWcFieldMapping] = useState<WooCommerceFieldMapping>(DEFAULT_WC_FIELD_MAPPING);
  const [wcFieldMappingSaving, setWcFieldMappingSaving] = useState(false);

  // ─── Load Data ──────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [fleetRes, notifRes, rolesRes, intRes, ratesRes, alertRes, companyRes, apiKeysRes, zonesRes, wcRes] = await Promise.all([
        supabase.from('fleet_config').select('*').limit(1).maybeSingle(),
        supabase.from('notification_preferences').select('*').limit(1).maybeSingle(),
        supabase.from('user_roles').select('*').order('created_at', { ascending: true }),
        supabase.from('system_integrations').select('*').order('name', { ascending: true }),
        supabase.from('driver_rate_settings').select('*').limit(1).maybeSingle(),
        supabase.from('alert_thresholds').select('*').limit(1).maybeSingle(),
        supabase.from('company_profile').select('*').limit(1).maybeSingle(),
        supabase.from('api_keys').select('*').order('created_at', { ascending: false }),
        supabase.from('delivery_zones').select('id, name, color, is_active').eq('is_active', true).order('name', { ascending: true }),
        supabase.from('woocommerce_settings').select('*').limit(1).maybeSingle(),
      ]);

      if (fleetRes.data) setFleet(sanitizeNulls(fleetRes.data, DEFAULT_FLEET));
      if (notifRes.data) setNotifPrefs(sanitizeNulls(notifRes.data, DEFAULT_NOTIF_PREFS));
      if (rolesRes.data) setUserRoles(rolesRes.data);
      if (intRes.data) setIntegrations(intRes.data);
      if (ratesRes.data) setDriverRates(sanitizeNulls(ratesRes.data, DEFAULT_DRIVER_RATES));
      if (alertRes.data) setAlertThresholds(sanitizeNulls(alertRes.data, DEFAULT_ALERT_THRESHOLDS));
      if (companyRes.data) setCompanyProfile(sanitizeNulls(companyRes.data, DEFAULT_COMPANY_PROFILE));
      if (apiKeysRes.data) setApiKeys(apiKeysRes.data);
      if (zonesRes.data) setDeliveryZones(zonesRes.data);
      if (wcRes.data) {
        setWcSettings(sanitizeNulls(wcRes.data, DEFAULT_WC_SETTINGS));
        if (wcRes.data.field_mapping) setWcFieldMapping(wcRes.data.field_mapping as WooCommerceFieldMapping);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : (err as any)?.message ?? 'Unknown error';
      toast.error(`Failed to load settings: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, []);


  useEffect(() => { loadData(); }, [loadData]);

  // ─── Save Fleet Config ───────────────────────────────────────────────────────

  const saveFleetConfig = async () => {
    setSaving(true);
    try {
      if (fleet.id) {
        const { error } = await supabase.from('fleet_config').update({
          company_name: fleet.company_name, timezone: fleet.timezone,
          currency: fleet.currency, base_delivery_fee: fleet.base_delivery_fee,
          per_km_fee: fleet.per_km_fee, min_delivery_fee: fleet.min_delivery_fee,
          max_delivery_fee: fleet.max_delivery_fee, fee_structure: fleet.fee_structure,
          company_address: fleet.company_address, company_phone: fleet.company_phone,
          company_email: fleet.company_email, auto_zone_allocation: fleet.auto_zone_allocation ?? false,
          map_default_zone_id: fleet.map_default_zone_id ?? null,
          map_default_postcode: fleet.map_default_postcode ?? '',
          updated_at: new Date().toISOString(),
        }).eq('id', fleet.id);
        if (error) throw error;
      } else {
        const { id: _id, ...rest } = fleet;
        const { data, error } = await supabase.from('fleet_config').insert(rest).select().single();
        if (error) throw error;
        if (data) setFleet(data);
      }
      toast.success('Fleet configuration saved');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : (err as any)?.message ?? 'Unknown error';
      toast.error(`Failed to save fleet configuration: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  // ─── Save Notification Prefs ─────────────────────────────────────────────────

  const saveNotifPrefs = async () => {
    setSaving(true);
    try {
      if (notifPrefs.id) {
        const { id: _id, ...rest } = notifPrefs;
        const { error } = await supabase.from('notification_preferences').update({
          ...rest, updated_at: new Date().toISOString(),
        }).eq('id', notifPrefs.id);
        if (error) throw error;
      } else {
        const { id: _id, ...rest } = notifPrefs;
        const { data, error } = await supabase.from('notification_preferences').insert(rest).select().single();
        if (error) throw error;
        if (data) setNotifPrefs(data);
      }
      toast.success('Notification preferences saved');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : (err as any)?.message ?? 'Unknown error';
      toast.error(`Failed to save notification preferences: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  // ─── Save Driver Rates ───────────────────────────────────────────────────────

  const saveDriverRates = async () => {
    setSaving(true);
    try {
      if (driverRates.id) {
        const { id: _id, ...rest } = driverRates;
        const { error } = await supabase.from('driver_rate_settings').update({
          ...rest, updated_at: new Date().toISOString(),
        }).eq('id', driverRates.id);
        if (error) throw error;
      } else {
        const { id: _id, ...rest } = driverRates;
        const { data, error } = await supabase.from('driver_rate_settings').insert(rest).select().single();
        if (error) throw error;
        if (data) setDriverRates(data);
      }
      toast.success('Driver rate settings saved');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : (err as any)?.message ?? 'Unknown error';
      toast.error(`Failed to save driver rate settings: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  // ─── Save Alert Thresholds ───────────────────────────────────────────────────

  const saveAlertThresholds = async () => {
    setSaving(true);
    try {
      if (alertThresholds.id) {
        const { id: _id, ...rest } = alertThresholds;
        const { error } = await supabase.from('alert_thresholds').update({
          ...rest, updated_at: new Date().toISOString(),
        }).eq('id', alertThresholds.id);
        if (error) throw error;
      } else {
        const { id: _id, ...rest } = alertThresholds;
        const { data, error } = await supabase.from('alert_thresholds').insert(rest).select().single();
        if (error) throw error;
        if (data) setAlertThresholds(data);
      }
      toast.success('Alert thresholds saved');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : (err as any)?.message ?? 'Unknown error';
      toast.error(`Failed to save alert thresholds: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  // ─── User Roles ──────────────────────────────────────────────────────────────

  const addUserRole = async () => {
    if (!newRoleForm.email || !newRoleForm.full_name) {
      toast.error('Email and name are required');
      return;
    }
    setSaving(true);
    try {
      const { data: existing } = await supabase
        .from('user_roles')
        .select('id')
        .eq('email', newRoleForm.email.trim())
        .maybeSingle();
      if (existing) {
        toast.error('A user with this email already exists');
        setSaving(false);
        return;
      }
      const perms = {
        admin: { can_create_orders: true, can_edit_orders: true, can_delete_orders: true, can_manage_drivers: true, can_view_analytics: true, can_manage_settings: true },
        manager: { can_create_orders: true, can_edit_orders: true, can_delete_orders: false, can_manage_drivers: true, can_view_analytics: true, can_manage_settings: false },
        dispatcher: { can_create_orders: true, can_edit_orders: true, can_delete_orders: false, can_manage_drivers: false, can_view_analytics: false, can_manage_settings: false },
        viewer: { can_create_orders: false, can_edit_orders: false, can_delete_orders: false, can_manage_drivers: false, can_view_analytics: true, can_manage_settings: false },
      };
      const { data, error } = await supabase.from('user_roles').insert({
        email: newRoleForm.email.trim(),
        full_name: newRoleForm.full_name.trim(),
        role: newRoleForm.role,
        is_active: true,
        ...perms[newRoleForm.role],
      }).select().single();
      if (error) throw error;
      if (data) setUserRoles((prev) => [...prev, data]);
      setNewRoleForm({ email: '', full_name: '', role: 'viewer' });
      setShowNewRoleForm(false);
      toast.success('User role added');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : (err as any)?.message ?? 'Unknown error';
      toast.error(`Failed to add user role: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  const updateUserRole = async (id: string, updates: Partial<UserRole>) => {
    try {
      const { error } = await supabase.from('user_roles').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
      setUserRoles((prev) => prev.map((r) => r.id === id ? { ...r, ...updates } : r));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : (err as any)?.message ?? 'Unknown error';
      toast.error(`Failed to update role: ${msg}`);
    }
  };

  const deleteUserRole = async (id: string) => {
    try {
      const { error } = await supabase.from('user_roles').delete().eq('id', id);
      if (error) throw error;
      setUserRoles((prev) => prev.filter((r) => r.id !== id));
      toast.success('User role removed');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : (err as any)?.message ?? 'Unknown error';
      toast.error(`Failed to remove user role: ${msg}`);
    }
  };

  // ─── Integrations ────────────────────────────────────────────────────────────

  const toggleIntegration = async (id: string, enabled: boolean) => {
    try {
      const { error } = await supabase.from('system_integrations').update({
        is_enabled: enabled,
        status: enabled ? 'connected' : 'disconnected',
        updated_at: new Date().toISOString(),
      }).eq('id', id);
      if (error) throw error;
      setIntegrations((prev) => prev.map((i) => i.id === id ? { ...i, is_enabled: enabled, status: enabled ? 'connected' : 'disconnected' } : i));
      toast.success(enabled ? 'Integration enabled' : 'Integration disabled');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Failed to update integration: ${msg}`);
    }
  };

  const saveIntegrationConfig = async (id: string) => {
    setSaving(true);
    try {
      const { error } = await supabase.from('system_integrations').update({
        api_key: integrationApiKey || null,
        webhook_url: integrationWebhook || null,
        updated_at: new Date().toISOString(),
      }).eq('id', id);
      if (error) throw error;
      setIntegrations((prev) => prev.map((i) => i.id === id ? { ...i, api_key: integrationApiKey || null, webhook_url: integrationWebhook || null } : i));
      setEditingIntegration(null);
      toast.success('Integration configuration saved');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Failed to save integration config: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  const saveWcFieldMapping = async () => {
    if (!wcSettings.id) { toast.error('Save credentials first'); return; }
    setWcFieldMappingSaving(true);
    try {
      const { error } = await supabase.from('woocommerce_settings').update({
        field_mapping: wcFieldMapping,
        updated_at: new Date().toISOString(),
      }).eq('id', wcSettings.id);
      if (error) throw error;
      toast.success('Field mapping saved');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Failed to save field mapping: ${msg}`);
    } finally {
      setWcFieldMappingSaving(false);
    }
  };

  // ─── Company Profile ─────────────────────────────────────────────────────────

  const saveCompanyProfile = async () => {
    setSaving(true);
    try {
      if (companyProfile.id) {
        const { id: _id, ...rest } = companyProfile;
        const { error } = await supabase.from('company_profile').update({
          ...rest, updated_at: new Date().toISOString(),
        }).eq('id', companyProfile.id);
        if (error) throw error;
      } else {
        const { id: _id, ...rest } = companyProfile;
        const { data, error } = await supabase.from('company_profile').insert(rest).select().single();
        if (error) throw error;
        if (data) setCompanyProfile(data);
      }
      toast.success('Company profile saved');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : (err as any)?.message ?? 'Unknown error';
      toast.error(`Failed to save company profile: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  // ─── API Keys ────────────────────────────────────────────────────────────────

  const createApiKey = async () => {
    if (!newKeyForm.name) { toast.error('Key name is required'); return; }
    setSaving(true);
    try {
      const { full, prefix, preview, hash } = generateApiKey();
      const { data, error } = await supabase.from('api_keys').insert({
        name: newKeyForm.name,
        description: newKeyForm.description,
        key_prefix: prefix,
        key_hash: hash,
        key_preview: preview,
        scopes: newKeyForm.scopes,
        is_active: true,
        expires_at: newKeyForm.expires_at || null,
        created_by: 'admin',
      }).select().single();
      if (error) throw error;
      if (data) setApiKeys((prev) => [data, ...prev]);
      setGeneratedKey(full);
      setNewKeyForm({ name: '', description: '', scopes: ['read'], expires_at: '' });
      toast.success('API key created — copy it now, it will not be shown again');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Failed to create API key: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  const revokeApiKey = async (id: string) => {
    try {
      const { error } = await supabase.from('api_keys').update({ is_active: false, updated_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
      setApiKeys((prev) => prev.map((k) => k.id === id ? { ...k, is_active: false } : k));
      toast.success('API key revoked');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Failed to revoke API key: ${msg}`);
    }
  };

  const deleteApiKey = async (id: string) => {
    try {
      const { error } = await supabase.from('api_keys').delete().eq('id', id);
      if (error) throw error;
      setApiKeys((prev) => prev.filter((k) => k.id !== id));
      toast.success('API key deleted');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Failed to delete API key: ${msg}`);
    }
  };

  const toggleScopeOnNewKey = (scope: string) => {
    setNewKeyForm((f) => ({
      ...f,
      scopes: f.scopes.includes(scope) ? f.scopes.filter((s) => s !== scope) : [...f.scopes, scope],
    }));
  };

  // ─── Tabs ────────────────────────────────────────────────────────────────────

  const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
    { id: 'company', label: 'Company Profile', icon: Globe },
    { id: 'fleet', label: 'Fleet Config', icon: Building2 },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'roles', label: 'Team Roles', icon: Users },
    { id: 'driver_rates', label: 'Driver Rates', icon: Car },
    { id: 'alert_thresholds', label: 'Alert Thresholds', icon: AlertTriangle },
    { id: 'integrations', label: 'Integrations', icon: Plug },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw size={24} className="animate-spin" style={{ color: 'hsl(var(--muted-foreground))' }} />
        <span className="ml-3 text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>Loading settings…</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg" style={{ backgroundColor: 'hsl(var(--primary) / 0.1)' }}>
          <Settings size={20} style={{ color: 'hsl(var(--primary))' }} />
        </div>
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'hsl(var(--foreground))' }}>Settings</h1>
          <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>Manage company profile, fleet, notifications, team roles, API keys, and system configuration</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 p-1 rounded-xl" style={{ backgroundColor: 'hsl(var(--secondary))' }}>
        {tabs.map((tab) => {
          const TabIcon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 flex-1 justify-center min-w-fit ${
                activeTab === tab.id ? 'shadow-sm' : 'hover:bg-white/50'
              }`}
              style={activeTab === tab.id ? {
                backgroundColor: 'hsl(var(--card))',
                color: 'hsl(var(--primary))',
              } : { color: 'hsl(var(--muted-foreground))' }}
            >
              <TabIcon size={15} />
              <span className="hidden md:inline">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── Company Profile ───────────────────────────────────────────────────── */}
      {activeTab === 'company' && (
        <div className="space-y-5">
          {/* Basic Info */}
          <div className="rounded-xl border p-5 space-y-4" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
            <h2 className="font-semibold text-sm flex items-center gap-2" style={{ color: 'hsl(var(--foreground))' }}>
              <Globe size={15} style={{ color: 'hsl(var(--primary))' }} /> Business Identity
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <TextInput label="Company Name" value={companyProfile.company_name} onChange={(v) => setCompanyProfile((p) => ({ ...p, company_name: v }))} placeholder="CastleAdmin Ltd" />
              <TextInput label="Trading Name" value={companyProfile.trading_name} onChange={(v) => setCompanyProfile((p) => ({ ...p, trading_name: v }))} placeholder="CastleAdmin" />
              <TextInput label="Registration Number" value={companyProfile.registration_number} onChange={(v) => setCompanyProfile((p) => ({ ...p, registration_number: v }))} placeholder="SC123456" />
              <TextInput label="VAT Number" value={companyProfile.vat_number} onChange={(v) => setCompanyProfile((p) => ({ ...p, vat_number: v }))} placeholder="GB123456789" />
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--muted-foreground))' }}>Industry</label>
                <select
                  value={companyProfile.industry ?? ''}
                  onChange={(e) => setCompanyProfile((p) => ({ ...p, industry: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none"
                  style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                >
                  {['Logistics & Delivery', 'E-Commerce', 'Food & Beverage', 'Healthcare', 'Retail', 'Manufacturing', 'Other'].map((i) => <option key={i} value={i}>{i}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--muted-foreground))' }}>Company Size</label>
                <select
                  value={companyProfile.company_size ?? ''}
                  onChange={(e) => setCompanyProfile((p) => ({ ...p, company_size: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none"
                  style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                >
                  {['1-10', '11-50', '51-200', '201-500', '500+'].map((s) => <option key={s} value={s}>{s} employees</option>)}
                </select>
              </div>
              <TextInput label="Founded Year" value={companyProfile.founded_year} onChange={(v) => setCompanyProfile((p) => ({ ...p, founded_year: v }))} placeholder="2020" />
              <TextInput label="Website URL" value={companyProfile.website_url} onChange={(v) => setCompanyProfile((p) => ({ ...p, website_url: v }))} placeholder="https://yourcompany.co.uk" type="url" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--muted-foreground))' }}>Company Description</label>
              <textarea
                value={companyProfile.description ?? ''}
                onChange={(e) => setCompanyProfile((p) => ({ ...p, description: e.target.value }))}
                rows={3}
                placeholder="Brief description of your company…"
                className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none resize-none"
                style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
              />
            </div>
          </div>

          {/* Contact */}
          <div className="rounded-xl border p-5 space-y-4" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
            <h2 className="font-semibold text-sm" style={{ color: 'hsl(var(--foreground))' }}>Contact Details</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <TextInput label="Primary Email" value={companyProfile.primary_email} onChange={(v) => setCompanyProfile((p) => ({ ...p, primary_email: v }))} placeholder="admin@company.co.uk" type="email" />
              <TextInput label="Support Email" value={companyProfile.support_email} onChange={(v) => setCompanyProfile((p) => ({ ...p, support_email: v }))} placeholder="support@company.co.uk" type="email" />
              <TextInput label="Billing Email" value={companyProfile.billing_email} onChange={(v) => setCompanyProfile((p) => ({ ...p, billing_email: v }))} placeholder="billing@company.co.uk" type="email" />
              <TextInput label="Primary Phone" value={companyProfile.primary_phone} onChange={(v) => setCompanyProfile((p) => ({ ...p, primary_phone: v }))} placeholder="+44 20 7946 0958" />
              <TextInput label="Secondary Phone" value={companyProfile.secondary_phone} onChange={(v) => setCompanyProfile((p) => ({ ...p, secondary_phone: v }))} placeholder="+44 20 7946 0959" />
            </div>
          </div>

          {/* Address */}
          <div className="rounded-xl border p-5 space-y-4" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
            <h2 className="font-semibold text-sm" style={{ color: 'hsl(var(--foreground))' }}>Registered Address</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <TextInput label="Address Line 1" value={companyProfile.address_line1} onChange={(v) => setCompanyProfile((p) => ({ ...p, address_line1: v }))} placeholder="123 Fleet Street" />
              </div>
              <div className="md:col-span-2">
                <TextInput label="Address Line 2" value={companyProfile.address_line2} onChange={(v) => setCompanyProfile((p) => ({ ...p, address_line2: v }))} placeholder="Suite 100" />
              </div>
              <TextInput label="City" value={companyProfile.city} onChange={(v) => setCompanyProfile((p) => ({ ...p, city: v }))} placeholder="London" />
              <TextInput label="County / Region" value={companyProfile.county} onChange={(v) => setCompanyProfile((p) => ({ ...p, county: v }))} placeholder="Greater London" />
              <TextInput label="Postcode" value={companyProfile.postcode} onChange={(v) => setCompanyProfile((p) => ({ ...p, postcode: v }))} placeholder="EC4A 2BB" />
              <TextInput label="Country" value={companyProfile.country} onChange={(v) => setCompanyProfile((p) => ({ ...p, country: v }))} placeholder="United Kingdom" />
            </div>
          </div>

          {/* Social */}
          <div className="rounded-xl border p-5 space-y-4" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
            <h2 className="font-semibold text-sm" style={{ color: 'hsl(var(--foreground))' }}>Social Profiles</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <TextInput label="LinkedIn" value={companyProfile.social_linkedin} onChange={(v) => setCompanyProfile((p) => ({ ...p, social_linkedin: v }))} placeholder="https://linkedin.com/company/…" type="url" />
              <TextInput label="Twitter / X" value={companyProfile.social_twitter} onChange={(v) => setCompanyProfile((p) => ({ ...p, social_twitter: v }))} placeholder="https://twitter.com/…" type="url" />
              <TextInput label="Facebook" value={companyProfile.social_facebook} onChange={(v) => setCompanyProfile((p) => ({ ...p, social_facebook: v }))} placeholder="https://facebook.com/…" type="url" />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={saveCompanyProfile}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-opacity disabled:opacity-60"
              style={{ backgroundColor: 'hsl(var(--primary))' }}
            >
              <Save size={15} /> {saving ? 'Saving…' : 'Save Company Profile'}
            </button>
          </div>
        </div>
      )}

      {/* ── Fleet Config ─────────────────────────────────────────────────────── */}
      {activeTab === 'fleet' && (
        <div className="space-y-5">
          {/* Company Info */}
          <div className="rounded-xl border p-5 space-y-4" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
            <h2 className="font-semibold text-sm flex items-center gap-2" style={{ color: 'hsl(var(--foreground))' }}>
              <Building2 size={15} style={{ color: 'hsl(var(--primary))' }} /> Company Information
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--muted-foreground))' }}>Company Name</label>
                <input
                  type="text"
                  value={fleet.company_name ?? ''}
                  onChange={(e) => setFleet((f) => ({ ...f, company_name: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2"
                  style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--muted-foreground))' }}>Timezone</label>
                <select
                  value={fleet.timezone ?? ''}
                  onChange={(e) => setFleet((f) => ({ ...f, timezone: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none"
                  style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                >
                  {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--muted-foreground))' }}>Company Email</label>
                <input
                  type="email"
                  value={fleet.company_email ?? ''}
                  onChange={(e) => setFleet((f) => ({ ...f, company_email: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none"
                  style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--muted-foreground))' }}>Company Phone</label>
                <input
                  type="text"
                  value={fleet.company_phone ?? ''}
                  onChange={(e) => setFleet((f) => ({ ...f, company_phone: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none"
                  style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--muted-foreground))' }}>Company Address</label>
                <input
                  type="text"
                  value={fleet.company_address ?? ''}
                  onChange={(e) => setFleet((f) => ({ ...f, company_address: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none"
                  style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                />
              </div>
            </div>
          </div>

          {/* Delivery Fee Structure */}
          <div className="rounded-xl border p-5 space-y-4" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
            <h2 className="font-semibold text-sm" style={{ color: 'hsl(var(--foreground))' }}>Delivery Fee Structure</h2>
            <div className="flex gap-3 mb-4">
              {['flat', 'per_km', 'tiered'].map((type) => (
                <button
                  key={type}
                  onClick={() => setFleet((f) => ({ ...f, fee_structure: type }))}
                  className={`px-4 py-2 rounded-lg text-xs font-medium border transition-all ${
                    fleet.fee_structure === type ? 'border-primary' : ''
                  }`}
                  style={fleet.fee_structure === type ? {
                    backgroundColor: 'hsl(var(--primary) / 0.1)',
                    borderColor: 'hsl(var(--primary))',
                    color: 'hsl(var(--primary))',
                  } : { borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}
                >
                  {type === 'flat' ? 'Flat Rate' : type === 'per_km' ? 'Per KM' : 'Tiered'}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { key: 'base_delivery_fee', label: 'Base Fee (£)' },
                { key: 'per_km_fee', label: 'Per KM Fee (£)' },
                { key: 'min_delivery_fee', label: 'Min Fee (£)' },
                { key: 'max_delivery_fee', label: 'Max Fee (£)' },
              ].map(({ key, label }) => (
                <div key={key}>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--muted-foreground))' }}>{label}</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={(fleet as any)[key] ?? 0}
                    onChange={(e) => setFleet((f) => ({ ...f, [key]: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none"
                    style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Auto Zone Allocation */}
          <div className="rounded-xl border p-5" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-sm" style={{ color: 'hsl(var(--foreground))' }}>Auto Zone Allocation</h2>
                <p className="text-xs mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  Automatically assign incoming orders to the driver whose delivery zone contains the delivery or collection address.
                </p>
              </div>
              <Toggle
                checked={fleet.auto_zone_allocation ?? false}
                onChange={(v) => setFleet((f) => ({ ...f, auto_zone_allocation: v }))}
              />
            </div>
          </div>

          {/* Map Default Zone */}
          <div className="rounded-xl border p-5 space-y-3" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
            <h2 className="font-semibold text-sm flex items-center gap-2" style={{ color: 'hsl(var(--foreground))' }}>
              <MapPin size={15} style={{ color: 'hsl(var(--primary))' }} /> Map Default Address
            </h2>
            <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Enter the postcode that maps will centre on by default when no specific location is selected.
            </p>
            <div className="max-w-sm">
              <input
                type="text"
                value={fleet.map_default_postcode ?? ''}
                onChange={(e) => setFleet((f) => ({ ...f, map_default_postcode: e.target.value.toUpperCase() }))}
                placeholder="e.g. LE4 7RN"
                className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none uppercase"
                style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
              />
              {fleet.map_default_postcode && (
                <p className="text-xs mt-2" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  Maps will default to <span className="font-semibold font-mono" style={{ color: 'hsl(var(--foreground))' }}>{fleet.map_default_postcode}</span>
                </p>
              )}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={saveFleetConfig}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-opacity disabled:opacity-60"
              style={{ backgroundColor: 'hsl(var(--primary))' }}
            >
              <Save size={15} /> {saving ? 'Saving…' : 'Save Fleet Config'}
            </button>
          </div>
        </div>
      )}

      {/* ── Notifications ─────────────────────────────────────────────────────── */}
      {activeTab === 'notifications' && (
        <div className="space-y-5">
          {/* Channels */}
          <div className="rounded-xl border p-5 space-y-4" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
            <h2 className="font-semibold text-sm" style={{ color: 'hsl(var(--foreground))' }}>Notification Channels</h2>
            <div className="space-y-3">
              {[
                { key: 'email_notifications', label: 'Email Notifications', desc: 'Receive alerts via email' },
                { key: 'sms_notifications', label: 'SMS Notifications', desc: 'Receive alerts via SMS (requires Twilio)' },
                { key: 'push_notifications', label: 'Push Notifications', desc: 'Browser push notifications' },
              ].map(({ key, label, desc }) => (
                <div key={key} className="flex items-center justify-between py-2 border-b last:border-0" style={{ borderColor: 'hsl(var(--border))' }}>
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'hsl(var(--foreground))' }}>{label}</p>
                    <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>{desc}</p>
                  </div>
                  <Toggle checked={(notifPrefs as any)[key]} onChange={(v) => setNotifPrefs((p) => ({ ...p, [key]: v }))} />
                </div>
              ))}
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--muted-foreground))' }}>Notification Email Address</label>
              <input
                type="email"
                value={notifPrefs.notification_email ?? ''}
                onChange={(e) => setNotifPrefs((p) => ({ ...p, notification_email: e.target.value }))}
                className="w-full max-w-sm px-3 py-2 rounded-lg border text-sm focus:outline-none"
                style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                placeholder="alerts@yourcompany.com"
              />
            </div>
          </div>

          {/* Event Triggers */}
          <div className="rounded-xl border p-5 space-y-3" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
            <h2 className="font-semibold text-sm" style={{ color: 'hsl(var(--foreground))' }}>Event Triggers</h2>
            {[
              { key: 'notify_new_order', label: 'New Order Received', desc: 'Alert when a new order is created' },
              { key: 'notify_order_status_change', label: 'Order Status Changed', desc: 'Alert on any status update' },
              { key: 'notify_driver_assigned', label: 'Driver Assigned', desc: 'Alert when a driver is assigned to an order' },
              { key: 'notify_delivery_complete', label: 'Delivery Completed', desc: 'Alert on successful delivery' },
              { key: 'notify_delivery_failed', label: 'Delivery Failed', desc: 'Alert when delivery cannot be completed' },
              { key: 'notify_driver_offline', label: 'Driver Goes Offline', desc: 'Alert when an active driver disconnects' },
              { key: 'notify_low_driver_availability', label: 'Low Driver Availability', desc: 'Alert when fewer than 2 drivers are available' },
            ].map(({ key, label, desc }) => (
              <div key={key} className="flex items-center justify-between py-2 border-b last:border-0" style={{ borderColor: 'hsl(var(--border))' }}>
                <div>
                  <p className="text-sm font-medium" style={{ color: 'hsl(var(--foreground))' }}>{label}</p>
                  <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>{desc}</p>
                </div>
                <Toggle checked={(notifPrefs as any)[key]} onChange={(v) => setNotifPrefs((p) => ({ ...p, [key]: v }))} />
              </div>
            ))}
          </div>

          <div className="flex justify-end">
            <button
              onClick={saveNotifPrefs}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-opacity disabled:opacity-60"
              style={{ backgroundColor: 'hsl(var(--primary))' }}
            >
              <Save size={15} /> {saving ? 'Saving…' : 'Save Preferences'}
            </button>
          </div>
        </div>
      )}

      {/* ── Team Roles ────────────────────────────────────────────────────────────── */}
      {activeTab === 'roles' && (
        <div className="space-y-5">
          <div className="rounded-xl border p-5 space-y-4" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-sm" style={{ color: 'hsl(var(--foreground))' }}>Team Members & Roles</h2>
              <button
                onClick={() => setShowNewRoleForm((v) => !v)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
                style={{ backgroundColor: 'hsl(var(--primary))' }}
              >
                <Users size={13} /> Add Member
              </button>
            </div>
            {showNewRoleForm && (
              <div className="border rounded-lg p-4 space-y-3" style={{ borderColor: 'hsl(var(--border))' }}>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <TextInput label="Email" value={newRoleForm.email} onChange={(v) => setNewRoleForm((f) => ({ ...f, email: v }))} placeholder="user@company.co.uk" type="email" />
                  <TextInput label="Full Name" value={newRoleForm.full_name} onChange={(v) => setNewRoleForm((f) => ({ ...f, full_name: v }))} placeholder="Jane Smith" />
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--muted-foreground))' }}>Role</label>
                    <select
                      value={newRoleForm.role}
                      onChange={(e) => setNewRoleForm((f) => ({ ...f, role: e.target.value as UserRole['role'] }))}
                      className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none"
                      style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                    >
                      {(['admin', 'manager', 'dispatcher', 'viewer'] as UserRole['role'][]).map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={addUserRole} disabled={saving} className="px-4 py-2 rounded-lg text-xs font-medium text-white disabled:opacity-60" style={{ backgroundColor: 'hsl(var(--primary))' }}>
                    {saving ? 'Adding…' : 'Add Member'}
                  </button>
                  <button onClick={() => setShowNewRoleForm(false)} className="px-4 py-2 rounded-lg text-xs font-medium border" style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
            <div className="space-y-2">
              {userRoles.map((role) => (
                <div key={role.id} className="border rounded-lg p-3" style={{ borderColor: 'hsl(var(--border))' }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div>
                        <p className="text-sm font-medium" style={{ color: 'hsl(var(--foreground))' }}>{role.full_name}</p>
                        <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>{role.email}</p>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_COLORS[role.role]}`}>{role.role}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Toggle checked={role.is_active} onChange={(v) => updateUserRole(role.id, { is_active: v })} />
                      <button onClick={() => setExpandedRole(expandedRole === role.id ? null : role.id)} className="text-xs px-2 py-1 rounded border" style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}>Permissions</button>
                      <button onClick={() => deleteUserRole(role.id)} className="text-xs px-2 py-1 rounded border border-red-200 text-red-500">Remove</button>
                    </div>
                  </div>
                  {expandedRole === role.id && (
                    <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-2 pt-3 border-t" style={{ borderColor: 'hsl(var(--border))' }}>
                      {(['can_create_orders', 'can_edit_orders', 'can_delete_orders', 'can_manage_drivers', 'can_view_analytics', 'can_manage_settings'] as (keyof UserRole)[]).map((perm) => (
                        <label key={perm} className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'hsl(var(--foreground))' }}>
                          <input type="checkbox" checked={!!role[perm]} onChange={(e) => updateUserRole(role.id, { [perm]: e.target.checked } as Partial<UserRole>)} />
                          {perm.replace(/_/g, ' ')}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {userRoles.length === 0 && <p className="text-sm text-center py-4" style={{ color: 'hsl(var(--muted-foreground))' }}>No team members added yet.</p>}
            </div>
          </div>
        </div>
      )}

      {/* ── Integrations ──────────────────────────────────────────────────────── */}
      {activeTab === 'integrations' && (
        <div className="space-y-4">
          {/* Sub-tabs */}
          <div className="flex gap-1 p-1 rounded-lg" style={{ backgroundColor: 'hsl(var(--secondary))' }}>
            {([
              { id: 'connections', label: 'Connections', icon: Plug },
              { id: 'api_keys', label: 'API Keys', icon: Key },
              { id: 'webhooks', label: 'Webhooks', icon: Webhook },
            ] as { id: 'connections' | 'api_keys' | 'webhooks'; label: string; icon: React.ElementType }[]).map((st) => {
              const StIcon = st.icon;
              return (
                <button
                  key={st.id}
                  onClick={() => setIntegrationsSubTab(st.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all flex-1 justify-center ${integrationsSubTab === st.id ? 'shadow-sm' : 'hover:bg-white/50'}`}
                  style={integrationsSubTab === st.id ? { backgroundColor: 'hsl(var(--card))', color: 'hsl(var(--primary))' } : { color: 'hsl(var(--muted-foreground))' }}
                >
                  <StIcon size={14} />
                  {st.label}
                </button>
              );
            })}
          </div>

          {/* ── Connections sub-tab ── */}
          {integrationsSubTab === 'connections' && (
            <div className="space-y-4">
              {/* WooCommerce dedicated card */}
              <div className="rounded-xl border p-5 space-y-4" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg" style={{ backgroundColor: 'hsl(var(--primary) / 0.1)' }}>
                      <ShoppingCart size={18} style={{ color: 'hsl(var(--primary))' }} />
                    </div>
                    <div>
                      <h2 className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>WooCommerce</h2>
                      <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>Connect your WooCommerce store to sync orders automatically</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {wcSettings.last_test_status === 'success' ? (
                      <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                        <CheckCircle size={11} /> Connected
                      </span>
                    ) : wcSettings.last_test_status === 'failed' ? (
                      <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-600">
                        <XCircle size={11} /> Failed
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Not tested</span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--muted-foreground))' }}>Store URL</label>
                    <input
                      type="url"
                      value={wcSettings.store_url ?? ''}
                      onChange={(e) => setWcSettings((s) => ({ ...s, store_url: e.target.value }))}
                      placeholder="https://yourstore.com"
                      className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none font-mono"
                      style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                    />
                    <p className="text-xs mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>The root URL of your WooCommerce store (e.g. https://yourstore.com) — no trailing slash.</p>
                  </div>

                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--muted-foreground))' }}>Consumer Key</label>
                    <div className="relative">
                      <input
                        type={wcShowKey ? 'text' : 'password'}
                        value={wcSettings.consumer_key ?? ''}
                        onChange={(e) => setWcSettings((s) => ({ ...s, consumer_key: e.target.value }))}
                        placeholder="ck_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                        className="w-full px-3 py-2 pr-16 rounded-lg border text-sm focus:outline-none font-mono"
                        style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                      />
                      <button
                        type="button"
                        onClick={() => setWcShowKey((v) => !v)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-xs px-2 py-0.5 rounded"
                        style={{ color: 'hsl(var(--muted-foreground))' }}
                      >
                        {wcShowKey ? 'Hide' : 'Show'}
                      </button>
                    </div>
                    <p className="text-xs mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Generate in WooCommerce → Settings → Advanced → REST API — set Description to "CastleAdmin", User to an admin account, and Permissions to "Read/Write".</p>
                  </div>

                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--muted-foreground))' }}>Consumer Secret</label>
                    <div className="relative">
                      <input
                        type={wcShowSecret ? 'text' : 'password'}
                        value={wcSettings.consumer_secret ?? ''}
                        onChange={(e) => setWcSettings((s) => ({ ...s, consumer_secret: e.target.value }))}
                        placeholder="cs_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                        className="w-full px-3 py-2 pr-16 rounded-lg border text-sm focus:outline-none font-mono"
                        style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                      />
                      <button
                        type="button"
                        onClick={() => setWcShowSecret((v) => !v)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-xs px-2 py-0.5 rounded"
                        style={{ color: 'hsl(var(--muted-foreground))' }}
                      >
                        {wcShowSecret ? 'Hide' : 'Show'}
                      </button>
                    </div>
                  </div>
                </div>

                {wcSettings.last_test_message && (
                  <div className={`text-xs px-3 py-2 rounded-lg ${wcSettings.last_test_status === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                    {wcSettings.last_test_message}
                    {wcSettings.last_tested_at && (
                      <span className="ml-2 opacity-60">· {new Date(wcSettings.last_tested_at).toLocaleString()}</span>
                    )}
                  </div>
                )}

                {/* ── Setup Instructions ── */}
                <div className="border rounded-lg overflow-hidden" style={{ borderColor: 'hsl(var(--border))' }}>
                  <button
                    type="button"
                    onClick={() => setWcShowInstructions((v) => !v)}
                    className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-left transition-colors hover:bg-black/5"
                    style={{ backgroundColor: 'hsl(var(--secondary))', color: 'hsl(var(--foreground))' }}
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-base">📋</span> Setup Instructions
                    </span>
                    <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>{wcShowInstructions ? '▲ Hide' : '▼ Show'}</span>
                  </button>
                  {wcShowInstructions && (
                    <div className="px-4 py-4 space-y-3" style={{ backgroundColor: 'hsl(var(--card))' }}>
                      <p className="text-xs font-semibold" style={{ color: 'hsl(var(--foreground))' }}>Follow these steps to connect your WooCommerce store:</p>
                      <ol className="space-y-2.5">
                        {[
                          { step: 1, title: 'Log in to your WordPress admin panel', desc: 'Go to your store\'s WordPress dashboard (e.g. https://yourstore.com/wp-admin).' },
                          { step: 2, title: 'Navigate to WooCommerce → Settings → Advanced → REST API', desc: 'Click "Add key" to create a new API key.' },
                          { step: 3, title: 'Create a new API key', desc: 'Set Description to "CastleAdmin", User to an admin account, and Permissions to "Read/Write". Click "Generate API key".' },
                          { step: 4, title: 'Copy your Consumer Key and Consumer Secret', desc: 'These are shown only once. Paste them into the fields above and click "Save Credentials".' },
                          { step: 5, title: 'Enter your Store URL', desc: 'Use the root URL of your store (e.g. https://yourstore.com) — no trailing slash.' },
                          { step: 6, title: 'Test the connection', desc: 'Click "Test Connection" to verify the credentials are working correctly.' },
                          { step: 7, title: 'Set up the webhook (optional)', desc: 'Go to the Webhooks tab and copy the incoming webhook URL. In WooCommerce → Settings → Advanced → Webhooks, add a new webhook pointing to that URL for order events.' },
                        ].map(({ step, title, desc }) => (
                          <li key={step} className="flex gap-3">
                            <span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white mt-0.5" style={{ backgroundColor: 'hsl(var(--primary))' }}>{step}</span>
                            <div>
                              <p className="text-xs font-medium" style={{ color: 'hsl(var(--foreground))' }}>{title}</p>
                              <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>{desc}</p>
                            </div>
                          </li>
                        ))}
                      </ol>
                      <div className="rounded-lg p-3 mt-2" style={{ backgroundColor: 'hsl(var(--secondary))', borderColor: 'hsl(var(--border))' }}>
                        <p className="text-xs font-medium mb-1" style={{ color: 'hsl(var(--foreground))' }}>💡 Tip</p>
                        <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>Make sure your WooCommerce store has the REST API enabled. Go to WooCommerce → Settings → Advanced and ensure "Legacy REST API" is enabled if you are on WooCommerce 2.x.</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* ── Field Mapping ── */}
                <div className="border rounded-lg overflow-hidden" style={{ borderColor: 'hsl(var(--border))' }}>
                  <button
                    type="button"
                    onClick={() => setWcShowFieldMapping((v) => !v)}
                    className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-left transition-colors hover:bg-black/5"
                    style={{ backgroundColor: 'hsl(var(--secondary))', color: 'hsl(var(--foreground))' }}
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-base">🗂️</span> Field Mapping
                    </span>
                    <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>{wcShowFieldMapping ? '▲ Hide' : '▼ Show'}</span>
                  </button>
                  {wcShowFieldMapping && (
                    <div className="px-4 py-4 space-y-4" style={{ backgroundColor: 'hsl(var(--card))' }}>
                      <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        Map WooCommerce order fields to CastleAdmin fields. Use dot notation for nested fields (e.g. <code className="px-1 py-0.5 rounded text-xs font-mono" style={{ backgroundColor: 'hsl(var(--secondary))' }}>billing.email</code>).
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {(
                          [
                            { key: 'order_id', label: 'Order ID', placeholder: 'id' },
                            { key: 'customer_name', label: 'Customer Name', placeholder: 'billing.first_name + billing.last_name' },
                            { key: 'customer_email', label: 'Customer Email', placeholder: 'billing.email' },
                            { key: 'customer_phone', label: 'Customer Phone', placeholder: 'billing.phone' },
                            { key: 'delivery_address', label: 'Delivery Address', placeholder: 'shipping.address_1' },
                            { key: 'delivery_city', label: 'Delivery City', placeholder: 'shipping.city' },
                            { key: 'delivery_postcode', label: 'Delivery Postcode', placeholder: 'shipping.postcode' },
                            { key: 'order_notes', label: 'Order Notes', placeholder: 'customer_note' },
                            { key: 'order_total', label: 'Order Total', placeholder: 'total' },
                            { key: 'order_status', label: 'Order Status', placeholder: 'status' },
                          ] as { key: keyof WooCommerceFieldMapping; label: string; placeholder: string }[]
                        ).map(({ key, label, placeholder }) => (
                          <div key={key}>
                            <label className="block text-xs font-medium mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
                              {label}
                            </label>
                            <div className="flex items-center gap-2">
                              <span className="text-xs px-2 py-1.5 rounded-l-lg border-y border-l font-mono shrink-0" style={{ backgroundColor: 'hsl(var(--secondary))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}>
                                WC →
                              </span>
                              <input
                                type="text"
                                value={wcFieldMapping[key]}
                                onChange={(e) => setWcFieldMapping((m) => ({ ...m, [key]: e.target.value }))}
                                placeholder={placeholder}
                                className="flex-1 px-3 py-1.5 rounded-r-lg border text-xs focus:outline-none font-mono"
                                style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center justify-between pt-1">
                        <button
                          type="button"
                          onClick={() => setWcFieldMapping(DEFAULT_WC_FIELD_MAPPING)}
                          className="text-xs px-3 py-1.5 rounded-lg border transition-colors"
                          style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}
                        >
                          Reset to Defaults
                        </button>
                        <button
                          type="button"
                          onClick={saveWcFieldMapping}
                          disabled={wcFieldMappingSaving}
                          className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-60"
                          style={{ backgroundColor: 'hsl(var(--primary))' }}
                        >
                          <Save size={12} /> {wcFieldMappingSaving ? 'Saving…' : 'Save Mapping'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3 pt-1">
                  <button
                    onClick={testWcConnection}
                    disabled={wcTesting || wcSaving}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors disabled:opacity-60"
                    style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                  >
                    {wcTesting ? <Loader size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                    {wcTesting ? 'Testing…' : 'Test Connection'}
                  </button>
                  <button
                    onClick={saveWcSettings}
                    disabled={wcSaving || wcTesting}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-60"
                    style={{ backgroundColor: 'hsl(var(--primary))' }}
                  >
                    <Save size={14} /> {wcSaving ? 'Saving…' : 'Save Credentials'}
                  </button>
                </div>
              </div>

              {/* Other integrations */}
              {integrations.map((integration) => (
                <div key={integration.id} className="rounded-xl border p-5" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{INTEGRATION_ICONS[integration.slug] ?? '🔌'}</span>
                      <div>
                        <p className="text-sm font-medium" style={{ color: 'hsl(var(--foreground))' }}>{integration.name}</p>
                        <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>{integration.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${integration.status === 'connected' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{integration.status}</span>
                      <Toggle checked={integration.is_enabled} onChange={(v) => toggleIntegration(integration.id, v)} />
                      <button onClick={() => { setEditingIntegration(integration.id === editingIntegration ? null : integration.id); setIntegrationApiKey(integration.api_key ?? ''); setIntegrationWebhook(integration.webhook_url ?? ''); }} className="text-xs px-2 py-1 rounded border" style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}>Configure</button>
                    </div>
                  </div>
                  {editingIntegration === integration.id && (
                    <div className="mt-4 space-y-3 pt-4 border-t" style={{ borderColor: 'hsl(var(--border))' }}>
                      <TextInput label="API Key" value={integrationApiKey} onChange={setIntegrationApiKey} placeholder="Enter API key…" />
                      <TextInput label="Webhook URL" value={integrationWebhook} onChange={setIntegrationWebhook} placeholder="https://…" type="url" />
                      <button onClick={() => saveIntegrationConfig(integration.id)} disabled={saving} className="px-4 py-2 rounded-lg text-xs font-medium text-white disabled:opacity-60" style={{ backgroundColor: 'hsl(var(--primary))' }}>
                        {saving ? 'Saving…' : 'Save Config'}
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {integrations.length === 0 && <p className="text-sm text-center py-8" style={{ color: 'hsl(var(--muted-foreground))' }}>No integrations available.</p>}
            </div>
          )}

          {/* ── API Keys sub-tab ── */}
          {integrationsSubTab === 'api_keys' && (
            <div className="space-y-5">
              <div className="rounded-xl border p-5 space-y-4" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-sm flex items-center gap-2" style={{ color: 'hsl(var(--foreground))' }}><Key size={15} style={{ color: 'hsl(var(--primary))' }} /> API Keys</h2>
                  <button onClick={() => setShowNewKeyForm((v) => !v)} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-white" style={{ backgroundColor: 'hsl(var(--primary))' }}>
                    <Key size={13} /> New Key
                  </button>
                </div>
                {generatedKey && (
                  <div className="p-3 rounded-lg border border-yellow-300 bg-yellow-50 text-xs space-y-1">
                    <p className="font-semibold text-yellow-800">Copy your API key now — it will not be shown again.</p>
                    <code className="block break-all text-yellow-900">{generatedKey}</code>
                    <button onClick={() => { navigator.clipboard.writeText(generatedKey); toast.success('Copied!'); }} className="px-3 py-1 rounded bg-yellow-200 text-yellow-800 font-medium">Copy</button>
                    <button onClick={() => setGeneratedKey(null)} className="ml-2 px-3 py-1 rounded bg-gray-200 text-gray-700 font-medium">Dismiss</button>
                  </div>
                )}
                {showNewKeyForm && (
                  <div className="border rounded-lg p-4 space-y-3" style={{ borderColor: 'hsl(var(--border))' }}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <TextInput label="Key Name" value={newKeyForm.name} onChange={(v) => setNewKeyForm((f) => ({ ...f, name: v }))} placeholder="My Integration Key" />
                      <TextInput label="Description" value={newKeyForm.description} onChange={(v) => setNewKeyForm((f) => ({ ...f, description: v }))} placeholder="Optional description" />
                      <TextInput label="Expires At (optional)" value={newKeyForm.expires_at} onChange={(v) => setNewKeyForm((f) => ({ ...f, expires_at: v }))} type="date" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--muted-foreground))' }}>Scopes</label>
                      <div className="flex flex-wrap gap-2">
                        {API_SCOPES.map((scope) => (
                          <button key={scope} onClick={() => toggleScopeOnNewKey(scope)} className={`px-2 py-1 rounded text-xs border ${newKeyForm.scopes.includes(scope) ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}
                            style={newKeyForm.scopes.includes(scope) ? { borderColor: 'hsl(var(--primary))', backgroundColor: 'hsl(var(--primary) / 0.1)', color: 'hsl(var(--primary))' } : { borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}>
                            {scope}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={createApiKey} disabled={saving} className="px-4 py-2 rounded-lg text-xs font-medium text-white disabled:opacity-60" style={{ backgroundColor: 'hsl(var(--primary))' }}>{saving ? 'Creating…' : 'Create Key'}</button>
                      <button onClick={() => setShowNewKeyForm(false)} className="px-4 py-2 rounded-lg text-xs font-medium border" style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}>Cancel</button>
                    </div>
                  </div>
                )}
                <div className="space-y-2">
                  {apiKeys.map((k) => (
                    <div key={k.id} className="border rounded-lg p-3 flex items-center justify-between" style={{ borderColor: 'hsl(var(--border))' }}>
                      <div>
                        <p className="text-sm font-medium" style={{ color: 'hsl(var(--foreground))' }}>{k.name} {!k.is_active && <span className="ml-2 text-xs text-red-500">Revoked</span>}</p>
                        <p className="text-xs font-mono" style={{ color: 'hsl(var(--muted-foreground))' }}>{revealedKeys.has(k.id) ? k.key_preview : k.key_preview}</p>
                        <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>Scopes: {k.scopes.join(', ')} · Used {k.usage_count} times</p>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => setRevealedKeys((s) => { const n = new Set(s); s.has(k.id) ? n.delete(k.id) : n.add(k.id); return n; })} className="text-xs px-2 py-1 rounded border" style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}>{revealedKeys.has(k.id) ? 'Hide' : 'Show'}</button>
                        {k.is_active && <button onClick={() => revokeApiKey(k.id)} className="text-xs px-2 py-1 rounded border border-yellow-300 text-yellow-700">Revoke</button>}
                        <button onClick={() => deleteApiKey(k.id)} className="text-xs px-2 py-1 rounded border border-red-200 text-red-500">Delete</button>
                      </div>
                    </div>
                  ))}
                  {apiKeys.length === 0 && <p className="text-sm text-center py-4" style={{ color: 'hsl(var(--muted-foreground))' }}>No API keys yet.</p>}
                </div>
              </div>
            </div>
          )}

          {/* ── Webhooks sub-tab ── */}
          {integrationsSubTab === 'webhooks' && (
            <div className="space-y-4">
              <div className="rounded-xl border p-5 space-y-4" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-semibold text-sm flex items-center gap-2" style={{ color: 'hsl(var(--foreground))' }}>
                      <Webhook size={15} style={{ color: 'hsl(var(--primary))' }} /> Webhooks
                    </h2>
                    <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>Send real-time HTTP requests to external URLs when events occur</p>
                  </div>
                  <button
                    onClick={() => setShowNewWebhookForm((v) => !v)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
                    style={{ backgroundColor: 'hsl(var(--primary))' }}
                  >
                    <Webhook size={13} /> Add Webhook
                  </button>
                </div>

                {/* Incoming webhook info */}
                <div className="rounded-lg p-3 border" style={{ backgroundColor: 'hsl(var(--secondary))', borderColor: 'hsl(var(--border))' }}>
                  <p className="text-xs font-medium mb-1" style={{ color: 'hsl(var(--foreground))' }}>Incoming Webhook Endpoint (WooCommerce → CastleAdmin)</p>
                  <div className="flex items-center gap-2">
                    <code className="text-xs font-mono flex-1 break-all" style={{ color: 'hsl(var(--muted-foreground))' }}>
                      POST https://castleadmi7836.builtwithrocket.new/api/woocommerce/webhook
                    </code>
                    <button
                      onClick={() => { navigator.clipboard.writeText('https://castleadmi7836.builtwithrocket.new/api/woocommerce/webhook'); toast.success('Copied!'); }}
                      className="shrink-0 p-1.5 rounded border"
                      style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}
                    >
                      <Copy size={12} />
                    </button>
                  </div>
                  <p className="text-xs mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Topics: Order created · Order updated · Order completed</p>
                </div>

                {/* New webhook form */}
                {showNewWebhookForm && (
                  <div className="border rounded-lg p-4 space-y-3" style={{ borderColor: 'hsl(var(--border))' }}>
                    <h3 className="text-xs font-semibold" style={{ color: 'hsl(var(--foreground))' }}>New Outgoing Webhook</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <TextInput label="Name" value={newWebhookForm.name} onChange={(v) => setNewWebhookForm((f) => ({ ...f, name: v }))} placeholder="My Webhook" />
                      <div>
                        <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--muted-foreground))' }}>Method</label>
                        <div className="flex gap-2">
                          {(['GET', 'POST'] as const).map((m) => (
                            <button
                              key={m}
                              onClick={() => setNewWebhookForm((f) => ({ ...f, method: m }))}
                              className="flex-1 py-2 rounded-lg text-xs font-semibold border transition-all"
                              style={newWebhookForm.method === m
                                ? { backgroundColor: 'hsl(var(--primary) / 0.1)', borderColor: 'hsl(var(--primary))', color: 'hsl(var(--primary))' }
                                : { borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}
                            >
                              {m}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="md:col-span-2">
                        <TextInput label="Endpoint URL" value={newWebhookForm.url} onChange={(v) => setNewWebhookForm((f) => ({ ...f, url: v }))} placeholder="https://your-endpoint.com/webhook" type="url" />
                      </div>
                      <TextInput label="Secret (optional)" value={newWebhookForm.secret} onChange={(v) => setNewWebhookForm((f) => ({ ...f, secret: v }))} placeholder="Signing secret for HMAC verification" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--muted-foreground))' }}>Events</label>
                      <div className="flex flex-wrap gap-2">
                        {['order.created', 'order.updated', 'order.completed', 'order.cancelled', 'driver.assigned', 'driver.offline', 'delivery.failed'].map((ev) => (
                          <button
                            key={ev}
                            onClick={() => setNewWebhookForm((f) => ({
                              ...f,
                              events: f.events.includes(ev) ? f.events.filter((e) => e !== ev) : [...f.events, ev],
                            }))}
                            className="px-2 py-1 rounded text-xs border"
                            style={newWebhookForm.events.includes(ev)
                              ? { borderColor: 'hsl(var(--primary))', backgroundColor: 'hsl(var(--primary) / 0.1)', color: 'hsl(var(--primary))' }
                              : { borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}
                          >
                            {ev}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          if (!newWebhookForm.name || !newWebhookForm.url) { toast.error('Name and URL are required'); return; }
                          const wh: WebhookConfig = { ...newWebhookForm, id: crypto.randomUUID() };
                          setWebhooks((prev) => [...prev, wh]);
                          setNewWebhookForm({ name: '', url: '', method: 'POST', secret: '', events: ['order.created'], is_active: true });
                          setShowNewWebhookForm(false);
                          toast.success('Webhook added');
                        }}
                        className="px-4 py-2 rounded-lg text-xs font-medium text-white"
                        style={{ backgroundColor: 'hsl(var(--primary))' }}
                      >
                        Add Webhook
                      </button>
                      <button onClick={() => setShowNewWebhookForm(false)} className="px-4 py-2 rounded-lg text-xs font-medium border" style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Webhook list */}
                <div className="space-y-2">
                  {webhooks.map((wh) => (
                    <div key={wh.id} className="border rounded-lg p-3" style={{ borderColor: 'hsl(var(--border))' }}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium" style={{ color: 'hsl(var(--foreground))' }}>{wh.name}</p>
                            <span className={`text-xs px-1.5 py-0.5 rounded font-semibold ${wh.method === 'POST' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>{wh.method}</span>
                            <span className={`text-xs px-1.5 py-0.5 rounded ${wh.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{wh.is_active ? 'Active' : 'Inactive'}</span>
                          </div>
                          <p className="text-xs font-mono mt-0.5 truncate" style={{ color: 'hsl(var(--muted-foreground))' }}>{wh.url}</p>
                          <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>Events: {wh.events.join(', ')}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={async () => {
                              setTestingWebhook(wh.id ?? null);
                              try {
                                const payload = { event: 'test', timestamp: new Date().toISOString(), source: 'castleadmin' };
                                const res = await fetch(wh.url, {
                                  method: wh.method,
                                  headers: { 'Content-Type': 'application/json', ...(wh.secret ? { 'X-Webhook-Secret': wh.secret } : {}) },
                                  ...(wh.method === 'POST' ? { body: JSON.stringify(payload) } : {}),
                                });
                                if (res.ok) toast.success(`Test ${wh.method} to ${wh.url} succeeded (${res.status})`);
                                else toast.error(`Test failed: HTTP ${res.status}`);
                              } catch {
                                toast.error('Test request failed — check the URL and CORS settings');
                              } finally {
                                setTestingWebhook(null);
                              }
                            }}
                            disabled={testingWebhook === wh.id}
                            className="text-xs px-2 py-1 rounded border disabled:opacity-60"
                            style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}
                          >
                            {testingWebhook === wh.id ? <Loader size={11} className="animate-spin" /> : 'Test'}
                          </button>
                          <Toggle
                            checked={wh.is_active}
                            onChange={(v) => setWebhooks((prev) => prev.map((w) => w.id === wh.id ? { ...w, is_active: v } : w))}
                          />
                          <button
                            onClick={() => { setWebhooks((prev) => prev.filter((w) => w.id !== wh.id)); toast.success('Webhook removed'); }}
                            className="text-xs px-2 py-1 rounded border border-red-200 text-red-500"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {webhooks.length === 0 && (
                    <div className="text-center py-8">
                      <Webhook size={28} className="mx-auto mb-2 opacity-30" style={{ color: 'hsl(var(--muted-foreground))' }} />
                      <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>No outgoing webhooks configured yet.</p>
                      <p className="text-xs mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Add a webhook to push events to external services.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Driver Rates ──────────────────────────────────────────────────────── */}
      {activeTab === 'driver_rates' && (
        <div className="space-y-5">
          <div className="rounded-xl border p-5 space-y-4" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
            <h2 className="font-semibold text-sm flex items-center gap-2" style={{ color: 'hsl(var(--foreground))' }}>
              <Car size={15} style={{ color: 'hsl(var(--primary))' }} /> Driver Rate Settings
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <NumInput label="Base Rate / Hour (£)" value={driverRates.base_rate_per_hour} onChange={(v) => setDriverRates((d) => ({ ...d, base_rate_per_hour: v }))} step="0.01" min="0" />
              <NumInput label="Rate / KM (£)" value={driverRates.rate_per_km} onChange={(v) => setDriverRates((d) => ({ ...d, rate_per_km: v }))} step="0.01" min="0" />
              <NumInput label="Overtime Multiplier" value={driverRates.overtime_multiplier} onChange={(v) => setDriverRates((d) => ({ ...d, overtime_multiplier: v }))} step="0.01" min="1" />
              <NumInput label="Weekend Multiplier" value={driverRates.weekend_multiplier} onChange={(v) => setDriverRates((d) => ({ ...d, weekend_multiplier: v }))} step="0.01" min="1" />
              <NumInput label="Night Shift Multiplier" value={driverRates.night_shift_multiplier} onChange={(v) => setDriverRates((d) => ({ ...d, night_shift_multiplier: v }))} step="0.01" min="1" />
              <NumInput label="Bonus / Delivery (£)" value={driverRates.bonus_per_delivery} onChange={(v) => setDriverRates((d) => ({ ...d, bonus_per_delivery: v }))} step="0.01" min="0" />
              <NumInput label="Fuel Allowance / KM (£)" value={driverRates.fuel_allowance_per_km} onChange={(v) => setDriverRates((d) => ({ ...d, fuel_allowance_per_km: v }))} step="0.01" min="0" />
              <NumInput label="Min Guaranteed Hours" value={driverRates.min_guaranteed_hours} onChange={(v) => setDriverRates((d) => ({ ...d, min_guaranteed_hours: v }))} step="1" min="0" />
              <NumInput label="Max Hours / Day" value={driverRates.max_hours_per_day} onChange={(v) => setDriverRates((d) => ({ ...d, max_hours_per_day: v }))} step="1" min="1" />
            </div>
          </div>
          <div className="flex justify-end">
            <button onClick={saveDriverRates} disabled={saving} className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-opacity disabled:opacity-60" style={{ backgroundColor: 'hsl(var(--primary))' }}>
              <Save size={15} /> {saving ? 'Saving…' : 'Save Driver Rates'}
            </button>
          </div>
        </div>
      )}

      {/* ── Alert Thresholds ──────────────────────────────────────────────────── */}
      {activeTab === 'alert_thresholds' && (
        <div className="space-y-5">
          <div className="rounded-xl border p-5 space-y-4" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
            <h2 className="font-semibold text-sm flex items-center gap-2" style={{ color: 'hsl(var(--foreground))' }}>
              <AlertTriangle size={15} style={{ color: 'hsl(var(--primary))' }} /> Alert Thresholds
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <NumInput label="Min Active Drivers" value={alertThresholds.min_active_drivers} onChange={(v) => setAlertThresholds((a) => ({ ...a, min_active_drivers: v }))} step="1" min="1" />
              <NumInput label="Low Driver Warning (%)" value={alertThresholds.low_driver_warning_pct} onChange={(v) => setAlertThresholds((a) => ({ ...a, low_driver_warning_pct: v }))} step="1" min="0" suffix="%" />
              <NumInput label="Late Delivery (min)" value={alertThresholds.late_delivery_minutes} onChange={(v) => setAlertThresholds((a) => ({ ...a, late_delivery_minutes: v }))} step="1" min="1" suffix="min" />
              <NumInput label="Critical Delay (min)" value={alertThresholds.critical_delay_minutes} onChange={(v) => setAlertThresholds((a) => ({ ...a, critical_delay_minutes: v }))} step="1" min="1" suffix="min" />
              <NumInput label="Max Failed Deliveries (%)" value={alertThresholds.max_failed_deliveries_pct} onChange={(v) => setAlertThresholds((a) => ({ ...a, max_failed_deliveries_pct: v }))} step="1" min="0" suffix="%" />
              <NumInput label="High Order Volume / Hour" value={alertThresholds.high_order_volume_per_hour} onChange={(v) => setAlertThresholds((a) => ({ ...a, high_order_volume_per_hour: v }))} step="1" min="1" />
              <NumInput label="Unassigned Orders Warning" value={alertThresholds.unassigned_order_warning_count} onChange={(v) => setAlertThresholds((a) => ({ ...a, unassigned_order_warning_count: v }))} step="1" min="1" />
              <NumInput label="Driver Offline Alert (min)" value={alertThresholds.driver_offline_alert_minutes} onChange={(v) => setAlertThresholds((a) => ({ ...a, driver_offline_alert_minutes: v }))} step="1" min="1" suffix="min" />
              <NumInput label="GPS Stale Alert (min)" value={alertThresholds.gps_stale_alert_minutes} onChange={(v) => setAlertThresholds((a) => ({ ...a, gps_stale_alert_minutes: v }))} step="1" min="1" suffix="min" />
              <NumInput label="Daily Revenue Target (£)" value={alertThresholds.daily_revenue_target} onChange={(v) => setAlertThresholds((a) => ({ ...a, daily_revenue_target: v }))} step="1" min="0" />
              <NumInput label="Low Revenue Warning (%)" value={alertThresholds.low_revenue_warning_pct} onChange={(v) => setAlertThresholds((a) => ({ ...a, low_revenue_warning_pct: v }))} step="1" min="0" suffix="%" />
            </div>
          </div>
          <div className="flex justify-end">
            <button onClick={saveAlertThresholds} disabled={saving} className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-opacity disabled:opacity-60" style={{ backgroundColor: 'hsl(var(--primary))' }}>
              <Save size={15} /> {saving ? 'Saving…' : 'Save Thresholds'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}