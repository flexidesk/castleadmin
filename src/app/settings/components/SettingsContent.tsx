'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Settings, Building2, Bell, Users, Plug, Save, RefreshCw, Car, AlertTriangle, Key, Globe, MapPin, ShoppingCart, CheckCircle, XCircle, Loader, Webhook, Copy, Trash2, Upload, Image, X, Database, FileText, Loader2, Mail, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { useBranding } from '@/contexts/BrandingContext';


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
  app_logo_url?: string | null;
  app_favicon_url?: string | null;
  delivery_fee_enabled?: boolean;
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

type TabId = 'fleet' | 'notifications' | 'driver_rates' | 'alert_thresholds' | 'roles' | 'integrations' | 'company' | 'database' | 'smtp';

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

const INTEGRATION_INSTRUCTIONS: Record<string, { overview: string; steps: { title: string; desc: string }[]; tip?: string }> = {
  twilio: {
    overview: 'Twilio powers SMS and WhatsApp alerts sent from CastleAdmin to drivers and customers.',
    steps: [
      { title: 'Create a Twilio account', desc: 'Sign up at https://www.twilio.com and verify your phone number.' },
      { title: 'Get your Account SID and Auth Token', desc: 'From the Twilio Console dashboard, copy your Account SID and Auth Token.' },
      { title: 'Buy a Twilio phone number', desc: 'Go to Phone Numbers → Manage → Buy a number. Choose a number with SMS capability.' },
      { title: 'Enable WhatsApp (optional)', desc: 'Go to Messaging → Try it out → Send a WhatsApp message to activate the Twilio WhatsApp sandbox, or apply for a WhatsApp Business number.' },
      { title: 'Add credentials to your environment', desc: 'Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER, and TWILIO_WHATSAPP_NUMBER in your .env file.' },
      { title: 'Enter your API key above', desc: 'Paste your Auth Token as the API Key and your Account SID as the Webhook URL field, then click Save Config.' },
    ],
    tip: 'For production use, upgrade your Twilio account from trial mode to send messages to unverified numbers.',
  },
  stripe: {
    overview: 'Stripe enables payment processing for orders and deposits within CastleAdmin.',
    steps: [
      { title: 'Create a Stripe account', desc: 'Sign up at https://dashboard.stripe.com/register.' },
      { title: 'Get your API keys', desc: 'Go to Developers → API keys in the Stripe Dashboard. Copy your Publishable key and Secret key.' },
      { title: 'Add keys to your environment', desc: 'Set NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY and STRIPE_SECRET_KEY in your .env file.' },
      { title: 'Enter your Secret Key above', desc: 'Paste your Stripe Secret Key (sk_live_… or sk_test_…) as the API Key and click Save Config.' },
      { title: 'Set up webhooks (optional)', desc: 'In Stripe Dashboard → Developers → Webhooks, add an endpoint pointing to your app\'s /api/stripe/webhook route to receive payment events.' },
    ],
    tip: 'Use test mode keys (sk_test_…) during development. Switch to live keys only when going to production.',
  },
  'google-maps': {
    overview: 'Google Maps provides live driver tracking, route optimisation, and delivery zone mapping.',
    steps: [
      { title: 'Open Google Cloud Console', desc: 'Go to https://console.cloud.google.com and create or select a project.' },
      { title: 'Enable required APIs', desc: 'Navigate to APIs & Services → Library and enable: Maps JavaScript API, Geocoding API, Directions API, and Distance Matrix API.' },
      { title: 'Create an API key', desc: 'Go to APIs & Services → Credentials → Create Credentials → API key.' },
      { title: 'Restrict the key (recommended)', desc: 'Under API restrictions, limit the key to the four APIs above. Under Application restrictions, add your domain.' },
      { title: 'Add the key to your environment', desc: 'Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY in your .env file.' },
      { title: 'Enter your API key above', desc: 'Paste the key into the API Key field and click Save Config.' },
    ],
    tip: 'Set up billing alerts in Google Cloud Console to avoid unexpected charges. New accounts receive $200 free credit per month.',
  },
  sendgrid: {
    overview: 'SendGrid delivers transactional emails such as order confirmations and status updates.',
    steps: [
      { title: 'Create a SendGrid account', desc: 'Sign up at https://signup.sendgrid.com.' },
      { title: 'Verify your sender identity', desc: 'Go to Settings → Sender Authentication and verify either a single sender email or your entire domain.' },
      { title: 'Create an API key', desc: 'Go to Settings → API Keys → Create API Key. Choose "Restricted Access" and enable "Mail Send" permission.' },
      { title: 'Add the key to your environment', desc: 'Set SENDGRID_API_KEY in your .env file.' },
      { title: 'Enter your API key above', desc: 'Paste the SendGrid API key (SG.…) into the API Key field and click Save Config.' },
    ],
    tip: 'Domain authentication (DKIM/SPF) significantly improves email deliverability. Complete it in SendGrid → Settings → Sender Authentication.',
  },
  slack: {
    overview: 'Slack integration sends real-time alerts and notifications to your team channels.',
    steps: [
      { title: 'Create a Slack app', desc: 'Go to https://api.slack.com/apps and click "Create New App" → "From scratch". Give it a name and select your workspace.' },
      { title: 'Enable Incoming Webhooks', desc: 'In your app settings, go to Features → Incoming Webhooks and toggle it on.' },
      { title: 'Add a webhook to your workspace', desc: 'Click "Add New Webhook to Workspace", select the channel to post to, and click Allow.' },
      { title: 'Copy the Webhook URL', desc: 'Copy the generated webhook URL (https://hooks.slack.com/services/…).' },
      { title: 'Enter the webhook URL above', desc: 'Paste the Slack webhook URL into the Webhook URL field and click Save Config.' },
    ],
    tip: 'You can create multiple Slack apps or webhooks to route different alert types (e.g. orders vs driver alerts) to separate channels.',
  },
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
  delivery_fee_enabled: true,
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sanitizeNulls<T extends object>(data: Partial<T>, defaults: T): T {
  const result = { ...defaults } as T;
  // First, copy all keys from defaults (replacing nulls with defaults)
  for (const key in defaults) {
    const k = key as keyof T;
    const val = (data as T)[k];
    if (val !== null && val !== undefined) {
      (result as T)[k] = val;
    }
  }
  // Also copy any extra keys from data that are NOT in defaults (e.g. `id`, timestamps)
  for (const key in data) {
    const k = key as keyof T;
    if (!(k in defaults) && (data as T)[k] !== null && (data as T)[k] !== undefined) {
      (result as T)[k] = (data as T)[k] as T[keyof T];
    }
  }
  return result;
}

function generateApiKey(): { full: string; prefix: string; preview: string; hash: string } {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const randomStr = (len: number) => Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  const prefix = 'ca_' + randomStr(8);
  const secret = randomStr(32);
  const full = prefix + secret;
  const preview = prefix + '…' + secret.slice(-4);
  // Simple hash for storage (not cryptographic)
  let hash = 0;
  for (let i = 0; i < full.length; i++) { hash = ((hash << 5) - hash) + full.charCodeAt(i); hash |= 0; }
  return { full, prefix, preview, hash: hash.toString(16) };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TextInput({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--muted-foreground))' }}>{label}</label>
      <input
        type={type}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none"
        style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
      />
    </div>
  );
}

function NumInput({
  label,
  value,
  onChange,
  step = '1',
  min = '0',
  suffix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: string;
  min?: string;
  suffix?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--muted-foreground))' }}>{label}</label>
      <div className="flex items-center">
        <input
          type="number"
          step={step}
          min={min}
          value={value ?? 0}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none"
          style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
        />
        {suffix && <span className="ml-1.5 text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>{suffix}</span>}
      </div>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${checked ? '' : ''}`}
      style={{ backgroundColor: checked ? 'hsl(var(--primary))' : 'hsl(var(--border))' }}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-1'}`}
      />
    </button>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SettingsContent() {
  const supabase = createClient();
  const { refresh: refreshBranding } = useBranding();
  const [activeTab, setActiveTab] = useState<TabId>('fleet');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Reset App state
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [resetting, setResetting] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);

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
  const [expandedInstructions, setExpandedInstructions] = useState<string | null>(null);

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

  // WooCommerce settings state
  const [wcSettings, setWcSettings] = useState<WooCommerceSettings>(DEFAULT_WC_SETTINGS);
  const [wcTesting, setWcTesting] = useState(false);
  const [wcSaving, setWcSaving] = useState(false);
  const [wcShowKey, setWcShowKey] = useState(false);
  const [wcShowSecret, setWcShowSecret] = useState(false);

  // Delivery zones
  const [deliveryZones, setDeliveryZones] = useState<DeliveryZone[]>([]);

  // Integrations sub-tab
  const [integrationsSubTab, setIntegrationsSubTab] = useState<'connections' | 'api_keys' | 'webhooks'>('connections');

  // App Branding
  const [logoUploading, setLogoUploading] = useState(false);
  const [faviconUploading, setFaviconUploading] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [faviconPreview, setFaviconPreview] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);

  // Webhooks
  const [webhooks, setWebhooks] = useState<WebhookConfig[]>([]);
  const [showNewWebhookForm, setShowNewWebhookForm] = useState(false);
  const [newWebhookForm, setNewWebhookForm] = useState<WebhookConfig>({
    name: '', url: '', method: 'POST', secret: '', events: ['order.created'], is_active: true,
  });
  const [testingWebhook, setTestingWebhook] = useState<string | null>(null);

  // SMTP Configuration
  const [smtpConfig, setSmtpConfig] = useState({
    host: process.env.NEXT_PUBLIC_SMTP_HOST ?? '',
    port: '587',
    secure: false,
    user: '',
    pass: '',
    fromName: '',
    fromEmail: '',
  });
  const [smtpTestEmail, setSmtpTestEmail] = useState('');
  const [smtpTesting, setSmtpTesting] = useState(false);
  const [smtpShowPass, setSmtpShowPass] = useState(false);
  const [smtpSaved, setSmtpSaved] = useState(false);

  // Database backup/export
  const [dbExporting, setDbExporting] = useState(false);
  const [dbTableExporting, setDbTableExporting] = useState<string | null>(null);
  const [dbExportFormat, setDbExportFormat] = useState<'json' | 'csv'>('json');

  // Import backup
  const [importingBackup, setImportingBackup] = useState(false);
  const [importBackupFile, setImportBackupFile] = useState<File | null>(null);
  const [importBackupResult, setImportBackupResult] = useState<{ success: number; failed: number; tables: string[] } | null>(null);
  const importFileRef = useRef<HTMLInputElement>(null);

  // Terms of Hire
  const [termsOfHire, setTermsOfHire] = useState('');
  const [termsOfHireId, setTermsOfHireId] = useState<string | null>(null);
  const [savingTerms, setSavingTerms] = useState(false);

  // SMTP saving
  const [smtpSaving, setSmtpSaving] = useState(false);

  // ─── Load Data ──────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [fleetRes, notifRes, rolesRes, intRes, ratesRes, alertRes, companyRes, apiKeysRes, zonesRes, wcRes] = await Promise.all([
        supabase.from('fleet_config').select('*').order('updated_at', { ascending: true }).limit(1).maybeSingle(),
        supabase.from('notification_preferences').select('*').order('updated_at', { ascending: true }).limit(1).maybeSingle(),
        supabase.from('user_roles').select('*').order('created_at', { ascending: true }),
        supabase.from('system_integrations').select('*').order('name', { ascending: true }),
        supabase.from('driver_rate_settings').select('*').order('updated_at', { ascending: true }).limit(1).maybeSingle(),
        supabase.from('alert_thresholds').select('*').order('updated_at', { ascending: true }).limit(1).maybeSingle(),
        supabase.from('company_profile').select('*').order('updated_at', { ascending: true }).limit(1).maybeSingle(),
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

      // Load webhook configs
      const { data: whData } = await supabase.from('webhook_configs').select('*').order('created_at');
      if (whData) setWebhooks(whData);

      // Load terms of hire from system_config
      const { data: termsData } = await supabase
        .from('system_config')
        .select('id, config_value')
        .eq('config_key', 'terms_of_hire')
        .maybeSingle();
      if (termsData) {
        setTermsOfHire(termsData.config_value ?? '');
        setTermsOfHireId(termsData.id);
      }

      // Load SMTP config from system_config
      const { data: smtpRows } = await supabase
        .from('system_config')
        .select('config_key, config_value')
        .in('config_key', ['smtp_host', 'smtp_port', 'smtp_secure', 'smtp_user', 'smtp_pass', 'smtp_from_name', 'smtp_from_email']);
      if (smtpRows && smtpRows.length > 0) {
        const map: Record<string, string> = {};
        smtpRows.forEach((r: { config_key: string; config_value: string }) => { map[r.config_key] = r.config_value; });
        setSmtpConfig({
          host: map['smtp_host'] ?? process.env.NEXT_PUBLIC_SMTP_HOST ?? '',
          port: map['smtp_port'] ?? '587',
          secure: map['smtp_secure'] === 'true',
          user: map['smtp_user'] ?? '',
          pass: map['smtp_pass'] ?? '',
          fromName: map['smtp_from_name'] ?? '',
          fromEmail: map['smtp_from_email'] ?? '',
        });
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
      const payload = {
        company_name: fleet.company_name, timezone: fleet.timezone,
        currency: fleet.currency, base_delivery_fee: fleet.base_delivery_fee,
        per_km_fee: fleet.per_km_fee, min_delivery_fee: fleet.min_delivery_fee,
        max_delivery_fee: fleet.max_delivery_fee, fee_structure: fleet.fee_structure,
        company_address: fleet.company_address, company_phone: fleet.company_phone,
        company_email: fleet.company_email, auto_zone_allocation: fleet.auto_zone_allocation ?? false,
        map_default_zone_id: fleet.map_default_zone_id ?? null,
        map_default_postcode: fleet.map_default_postcode ?? '',
        delivery_fee_enabled: fleet.delivery_fee_enabled ?? true,
        updated_at: new Date().toISOString(),
      };
      if (fleet.id) {
        const { error } = await supabase.from('fleet_config').update(payload).eq('id', fleet.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('fleet_config').insert(payload).select().single();
        if (error) throw error;
        if (data) setFleet(sanitizeNulls(data, DEFAULT_FLEET));
      }
      toast.success('Fleet configuration saved');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : (err as any)?.message ?? 'Unknown error';
      toast.error(`Failed to save fleet configuration: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  // ─── Save Terms of Hire ──────────────────────────────────────────────────────

  const saveTermsOfHire = async () => {
    setSavingTerms(true);
    try {
      if (termsOfHireId) {
        const { error } = await supabase
          .from('system_config')
          .update({ config_value: termsOfHire, updated_at: new Date().toISOString() })
          .eq('id', termsOfHireId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('system_config')
          .insert({
            config_key: 'terms_of_hire',
            config_value: termsOfHire,
            config_type: 'text',
            category: 'booking',
            label: 'Terms of Hire',
            description: 'Terms displayed to customers at point of delivery',
            is_sensitive: false,
          })
          .select('id')
          .single();
        if (error) throw error;
        if (data) setTermsOfHireId(data.id);
      }
      toast.success('Terms of hire saved');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : (err as any)?.message ?? 'Unknown error';
      toast.error(`Failed to save terms of hire: ${msg}`);
    } finally {
      setSavingTerms(false);
    }
  };

  // ─── Save SMTP Config ────────────────────────────────────────────────────────

  const saveSmtpConfig = async () => {
    setSmtpSaving(true);
    try {
      const entries = [
        { config_key: 'smtp_host', config_value: smtpConfig.host, label: 'SMTP Host', is_sensitive: false },
        { config_key: 'smtp_port', config_value: smtpConfig.port, label: 'SMTP Port', is_sensitive: false },
        { config_key: 'smtp_secure', config_value: String(smtpConfig.secure), label: 'SMTP Secure', is_sensitive: false },
        { config_key: 'smtp_user', config_value: smtpConfig.user, label: 'SMTP Username', is_sensitive: true },
        { config_key: 'smtp_pass', config_value: smtpConfig.pass, label: 'SMTP Password', is_sensitive: true },
        { config_key: 'smtp_from_name', config_value: smtpConfig.fromName, label: 'SMTP From Name', is_sensitive: false },
        { config_key: 'smtp_from_email', config_value: smtpConfig.fromEmail, label: 'SMTP From Email', is_sensitive: false },
      ];
      for (const entry of entries) {
        const { error } = await supabase
          .from('system_config')
          .upsert(
            {
              config_key: entry.config_key,
              config_value: entry.config_value,
              config_type: 'string',
              category: 'smtp',
              label: entry.label,
              description: `SMTP configuration: ${entry.label}`,
              is_sensitive: entry.is_sensitive,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'config_key' }
          );
        if (error) throw error;
      }
      toast.success('SMTP configuration saved');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : (err as any)?.message ?? 'Unknown error';
      toast.error(`Failed to save SMTP configuration: ${msg}`);
    } finally {
      setSmtpSaving(false);
    }
  };

  // ─── Reset App Data ──────────────────────────────────────────────────────────

  const resetAppData = async () => {
    setResetting(true);
    try {
      const tables = [
        'orders',
        'drivers',
        'user_roles',
        'vehicles',
        'vehicle_inspections',
        'vehicle_incidents',
        'customers',
        'activity_logs',
        'notifications',
        'alert_history',
        'driver_locations',
        'driver_shifts',
        'driver_earnings',
        'driver_payments',
        'cash_management',
        'sms_alert_logs',
        'woocommerce_webhook_log',
        'woocommerce_sync_log',
        'webhook_event_logs',
      ];

      for (const table of tables) {
        await supabase.from(table as any).delete().neq('id', '00000000-0000-0000-0000-000000000000');
      }

      setShowResetModal(false);
      setResetConfirmText('');
      toast.success('App data has been reset successfully');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : (err as any)?.message ?? 'Unknown error';
      toast.error(`Failed to reset app data: ${msg}`);
    } finally {
      setResetting(false);
    }
  };

  // ─── Clear Cache ─────────────────────────────────────────────────────────────

  const clearCache = async () => {
    setClearingCache(true);
    try {
      // Clear localStorage
      localStorage.clear();

      // Clear sessionStorage
      sessionStorage.clear();

      // Clear all caches via Cache API if available
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map((name) => caches.delete(name)));
      }

      toast.success('Cache cleared successfully. The page will reload.');
      setTimeout(() => window.location.reload(), 1200);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to clear cache';
      toast.error(`Cache clear failed: ${msg}`);
    } finally {
      setClearingCache(false);
    }
  };

  // ─── Save Notification Prefs ─────────────────────────────────────────────────

  const saveNotifPrefs = async () => {
    setSaving(true);
    try {
      const { id: _id, ...rest } = notifPrefs;
      const payload = { ...rest, updated_at: new Date().toISOString() };
      if (notifPrefs.id) {
        const { error } = await supabase.from('notification_preferences').update(payload).eq('id', notifPrefs.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('notification_preferences').insert(payload).select().single();
        if (error) throw error;
        if (data) setNotifPrefs(sanitizeNulls(data, DEFAULT_NOTIF_PREFS));
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
      const { id: _id, ...rest } = driverRates;
      const payload = { ...rest, updated_at: new Date().toISOString() };
      if (driverRates.id) {
        const { error } = await supabase.from('driver_rate_settings').update(payload).eq('id', driverRates.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('driver_rate_settings').insert(payload).select().single();
        if (error) throw error;
        if (data) setDriverRates(sanitizeNulls(data, DEFAULT_DRIVER_RATES));
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
      const { id: _id, ...rest } = alertThresholds;
      const payload = { ...rest, updated_at: new Date().toISOString() };
      if (alertThresholds.id) {
        const { error } = await supabase.from('alert_thresholds').update(payload).eq('id', alertThresholds.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('alert_thresholds').insert(payload).select().single();
        if (error) throw error;
        if (data) setAlertThresholds(sanitizeNulls(data, DEFAULT_ALERT_THRESHOLDS));
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
      const msg = err instanceof Error ? err.message : 'Unknown error';
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
      const msg = err instanceof Error ? err.message : 'Unknown error';
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
      const { id: _id, ...rest } = companyProfile;
      const payload = { ...rest, updated_at: new Date().toISOString() };
      if (companyProfile.id) {
        const { error } = await supabase.from('company_profile').update(payload).eq('id', companyProfile.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('company_profile').insert(payload).select().single();
        if (error) throw error;
        if (data) setCompanyProfile(sanitizeNulls(data, DEFAULT_COMPANY_PROFILE));
      }
      toast.success('Company profile saved');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Failed to save company profile: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  // ─── App Branding ─────────────────────────────────────────────────────────────

  const uploadBrandingAsset = async (
    file: File,
    assetType: 'logo' | 'favicon',
    setUploading: (v: boolean) => void,
    setPreview: (v: string | null) => void,
  ) => {
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const fileName = `${assetType}-${Date.now()}.${ext}`;
      const { data, error } = await supabase.storage
        .from('app-branding')
        .upload(fileName, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from('app-branding').getPublicUrl(data.path);
      const publicUrl = urlData.publicUrl;
      setPreview(publicUrl);
      // Save URL to fleet_config
      const column = assetType === 'logo' ? 'app_logo_url' : 'app_favicon_url';
      if (fleet.id) {
        const { error: updateError } = await supabase
          .from('fleet_config')
          .update({ [column]: publicUrl })
          .eq('id', fleet.id);
        if (updateError) throw updateError;
      } else {
        const { error: upsertError } = await supabase
          .from('fleet_config')
          .insert({ [column]: publicUrl });
        if (upsertError) throw upsertError;
      }
      setFleet((prev) => ({ ...prev, [column]: publicUrl }));
      if (assetType === 'logo') refreshBranding();
      toast.success(`App ${assetType} updated successfully`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Failed to upload ${assetType}: ${msg}`);
    } finally {
      setUploading(false);
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setLogoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
    uploadBrandingAsset(file, 'logo', setLogoUploading, setLogoPreview);
  };

  const handleFaviconUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setFaviconPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
    uploadBrandingAsset(file, 'favicon', setFaviconUploading, setFaviconPreview);
  };

  // ─── WooCommerce ─────────────────────────────────────────────────────────────

  const saveWcSettings = async () => {
    setWcSaving(true);
    try {
      if (wcSettings.id) {
        const { error } = await supabase.from('woocommerce_settings').update({
          store_url: wcSettings.store_url,
          consumer_key: wcSettings.consumer_key,
          consumer_secret: wcSettings.consumer_secret,
          updated_at: new Date().toISOString(),
        }).eq('id', wcSettings.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('woocommerce_settings').insert({
          store_url: wcSettings.store_url,
          consumer_key: wcSettings.consumer_key,
          consumer_secret: wcSettings.consumer_secret,
          is_connected: false,
        }).select().single();
        if (error) throw error;
        if (data) setWcSettings((s) => ({ ...s, ...data }));
      }
      toast.success('WooCommerce credentials saved');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Failed to save WooCommerce settings: ${msg}`);
    } finally {
      setWcSaving(false);
    }
  };

  const testWcConnection = async () => {
    if (!wcSettings.store_url || !wcSettings.consumer_key || !wcSettings.consumer_secret) {
      toast.error('Please fill in all WooCommerce credentials first');
      return;
    }
    setWcTesting(true);
    try {
      const url = wcSettings.store_url.replace(/\/$/, '');
      const res = await fetch(`${url}/wp-json/wc/v3/orders?per_page=1`, {
        headers: {
          Authorization: 'Basic ' + btoa(`${wcSettings.consumer_key}:${wcSettings.consumer_secret}`),
        },
      });
      const status = res.ok ? 'success' : 'failed';
      const message = res.ok
        ? `Connection successful (HTTP ${res.status})`
        : `Connection failed (HTTP ${res.status})`;
      const now = new Date().toISOString();
      if (wcSettings.id) {
        await supabase.from('woocommerce_settings').update({
          last_tested_at: now,
          last_test_status: status,
          last_test_message: message,
          is_connected: res.ok,
          updated_at: now,
        }).eq('id', wcSettings.id);
      }
      setWcSettings((s) => ({ ...s, last_tested_at: now, last_test_status: status, last_test_message: message, is_connected: res.ok }));
      if (res.ok) toast.success('WooCommerce connection successful');
      else toast.error(`WooCommerce connection failed: HTTP ${res.status}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      const now = new Date().toISOString();
      if (wcSettings.id) {
        await supabase.from('woocommerce_settings').update({
          last_tested_at: now,
          last_test_status: 'failed',
          last_test_message: msg,
          is_connected: false,
          updated_at: now,
        }).eq('id', wcSettings.id);
      }
      setWcSettings((s) => ({ ...s, last_tested_at: now, last_test_status: 'failed', last_test_message: msg, is_connected: false }));
      toast.error(`WooCommerce connection error: ${msg}`);
    } finally {
      setWcTesting(false);
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
    { id: 'smtp', label: 'SMTP Mail', icon: Mail },
    { id: 'database', label: 'Database', icon: Database },
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

          {/* App Branding */}
          <div className="rounded-xl border p-5 space-y-4" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
            <h2 className="font-semibold text-sm flex items-center gap-2" style={{ color: 'hsl(var(--foreground))' }}>
              <Image size={15} style={{ color: 'hsl(var(--primary))' }} /> App Branding
            </h2>
            <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>Upload your app logo and favicon. Changes are saved immediately on upload.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Logo Upload */}
              <div className="space-y-3">
                <label className="block text-xs font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>App Logo</label>
                <div
                  className="relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 gap-3 cursor-pointer transition-colors hover:border-primary/60"
                  style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--background))' }}
                  onClick={() => logoInputRef.current?.click()}
                >
                  {(logoPreview || fleet.app_logo_url) ? (
                    <div className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={logoPreview || fleet.app_logo_url || ''}
                        alt="App logo preview"
                        className="h-16 max-w-full object-contain rounded"
                      />
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setLogoPreview(null); setFleet((p) => ({ ...p, app_logo_url: null })); }}
                        className="absolute -top-2 -right-2 p-0.5 rounded-full bg-red-500 text-white hover:bg-red-600"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="p-3 rounded-full" style={{ backgroundColor: 'hsl(var(--secondary))' }}>
                        <Upload size={20} style={{ color: 'hsl(var(--muted-foreground))' }} />
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-medium" style={{ color: 'hsl(var(--foreground))' }}>Click to upload logo</p>
                        <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>PNG, JPG, SVG, WebP — max 5 MB</p>
                      </div>
                    </>
                  )}
                  {logoUploading && (
                    <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/20">
                      <Loader size={20} className="animate-spin text-white" />
                    </div>
                  )}
                </div>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/webp"
                  className="hidden"
                  onChange={handleLogoUpload}
                />
                {(fleet.app_logo_url || logoPreview) && (
                  <p className="text-xs truncate" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    {fleet.app_logo_url || logoPreview}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  disabled={logoUploading}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50"
                  style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                >
                  <Upload size={12} /> {logoUploading ? 'Uploading…' : 'Choose Logo File'}
                </button>
              </div>

              {/* Favicon Upload */}
              <div className="space-y-3">
                <label className="block text-xs font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>Favicon</label>
                <div
                  className="relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 gap-3 cursor-pointer transition-colors hover:border-primary/60"
                  style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--background))' }}
                  onClick={() => faviconInputRef.current?.click()}
                >
                  {(faviconPreview || fleet.app_favicon_url) ? (
                    <div className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={faviconPreview || fleet.app_favicon_url || ''}
                        alt="Favicon preview"
                        className="h-12 w-12 object-contain rounded"
                      />
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setFaviconPreview(null); setFleet((p) => ({ ...p, app_favicon_url: null })); }}
                        className="absolute -top-2 -right-2 p-0.5 rounded-full bg-red-500 text-white hover:bg-red-600"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="p-3 rounded-full" style={{ backgroundColor: 'hsl(var(--secondary))' }}>
                        <Upload size={20} style={{ color: 'hsl(var(--muted-foreground))' }} />
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-medium" style={{ color: 'hsl(var(--foreground))' }}>Click to upload favicon</p>
                        <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>ICO, PNG, SVG — recommended 32×32 px</p>
                      </div>
                    </>
                  )}
                  {faviconUploading && (
                    <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/20">
                      <Loader size={20} className="animate-spin text-white" />
                    </div>
                  )}
                </div>
                <input
                  ref={faviconInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/x-icon,image/vnd.microsoft.icon,image/svg+xml"
                  className="hidden"
                  onChange={handleFaviconUpload}
                />
                {(fleet.app_favicon_url || faviconPreview) && (
                  <p className="text-xs truncate" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    {fleet.app_favicon_url || faviconPreview}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => faviconInputRef.current?.click()}
                  disabled={faviconUploading}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50"
                  style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                >
                  <Upload size={12} /> {faviconUploading ? 'Uploading…' : 'Choose Favicon File'}
                </button>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={saveCompanyProfile}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-opacity disabled:opacity-60"
              style={{ backgroundColor: 'hsl(var(--primary))' }}
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} {saving ? 'Saving…' : 'Save Company Profile'}
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
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-sm" style={{ color: 'hsl(var(--foreground))' }}>Delivery Fee Structure</h2>
              <Toggle
                checked={fleet.delivery_fee_enabled ?? true}
                onChange={(v) => setFleet((f) => ({ ...f, delivery_fee_enabled: v }))}
              />
            </div>
            {(fleet.delivery_fee_enabled ?? true) && (
              <>
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
                      {type === 'flat' ? 'Flat Rate' : type === 'per_km' ? 'Per Mile' : 'Tiered'}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { key: 'base_delivery_fee', label: 'Base Fee (£)' },
                    { key: 'per_km_fee', label: 'Per Mile Fee (£)' },
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
              </>
            )}
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

          {/* Terms of Hire */}
          <div className="rounded-xl border p-5 space-y-4" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
            <div>
              <h2 className="font-semibold text-sm flex items-center gap-2" style={{ color: 'hsl(var(--foreground))' }}>
                <FileText size={15} style={{ color: 'hsl(var(--primary))' }} /> Terms of Hire
              </h2>
              <p className="text-xs mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
                These terms are displayed to customers at the point of delivery and must be accepted (with signature) before a booking can be marked as complete.
              </p>
            </div>
            <textarea
              rows={12}
              value={termsOfHire}
              onChange={(e) => setTermsOfHire(e.target.value)}
              placeholder="Enter your terms and conditions of hire here…"
              className="w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none resize-y font-mono"
              style={{
                backgroundColor: 'hsl(var(--background))',
                borderColor: 'hsl(var(--border))',
                color: 'hsl(var(--foreground))',
                minHeight: '200px',
              }}
            />
            <div className="flex items-center justify-between">
              <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                {termsOfHire.length} characters
              </p>
              <button
                onClick={saveTermsOfHire}
                disabled={savingTerms}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white transition-opacity disabled:opacity-60"
                style={{ backgroundColor: 'hsl(var(--primary))' }}
              >
                <Save size={14} /> {savingTerms ? 'Saving…' : 'Save Terms'}
              </button>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={saveFleetConfig}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-opacity disabled:opacity-60"
              style={{ backgroundColor: 'hsl(var(--primary))' }}
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} {saving ? 'Saving…' : 'Save Fleet Config'}
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
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} {saving ? 'Saving…' : 'Save Preferences'}
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
                <div key={role.id} className="border rounded-lg p-3 flex items-center justify-between" style={{ borderColor: 'hsl(var(--border))' }}>
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'hsl(var(--foreground))' }}>{role.full_name}</p>
                    <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>{role.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Toggle checked={role.is_active} onChange={(v) => updateUserRole(role.id, { is_active: v })} />
                    <button onClick={() => setExpandedRole(expandedRole === role.id ? null : role.id)} className="text-xs px-2 py-1 rounded border" style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}>Permissions</button>
                    <button onClick={() => deleteUserRole(role.id)} className="text-xs px-2 py-1 rounded border border-red-200 text-red-500">Remove</button>
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
                        Map WooCommerce order fields to CastleAdmin fields. Use dot notation for nested fields (e.g. <code className="px-1 py-0.5 rounded text-xs" style={{ backgroundColor: 'hsl(var(--secondary))' }}>billing.email</code>).
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
                      <div className="flex items-center gap-2 pt-1">
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
                    className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-700 transition-colors whitespace-nowrap flex-shrink-0"
                  >
                    {wcTesting ? <Loader size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                    {wcTesting ? 'Testing…' : 'Test Connection'}
                  </button>
                  <button
                    onClick={saveWcSettings}
                    disabled={wcSaving || wcTesting}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-opacity disabled:opacity-60"
                    style={{ backgroundColor: 'hsl(var(--primary))' }}
                  >
                    <Save size={14} /> {wcSaving ? 'Saving…' : 'Save Credentials'}
                  </button>
                </div>
              </div>

              {/* Other integrations */}
              {integrations.map((integration) => (
                <div key={integration.id} className="rounded-xl border p-5 space-y-3" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{INTEGRATION_ICONS[integration.slug] ?? '🔌'}</span>
                      <div>
                        <p className="text-sm font-medium" style={{ color: 'hsl(var(--foreground))' }}>{integration.name}</p>
                        <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>{integration.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${integration.status === 'connected' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{integration.status}</span>
                      <Toggle checked={integration.is_enabled} onChange={(v) => toggleIntegration(integration.id, v)} />
                      <button onClick={() => { setEditingIntegration(integration.id === editingIntegration ? null : integration.id); setIntegrationApiKey(integration.api_key ?? ''); setIntegrationWebhook(integration.webhook_url ?? ''); }} className="text-xs px-2 py-1 rounded border" style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}>Configure</button>
                    </div>
                  </div>

                  {/* Setup Instructions collapsible */}
                  {INTEGRATION_INSTRUCTIONS[integration.slug] && (
                    <div className="border rounded-lg overflow-hidden" style={{ borderColor: 'hsl(var(--border))' }}>
                      <button
                        type="button"
                        onClick={() => setExpandedInstructions(expandedInstructions === integration.id ? null : integration.id)}
                        className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-medium text-left transition-colors hover:bg-black/5"
                        style={{ backgroundColor: 'hsl(var(--secondary))', color: 'hsl(var(--foreground))' }}
                      >
                        <span className="flex items-center gap-2">
                          <span>📋</span> Setup Instructions
                        </span>
                        <span style={{ color: 'hsl(var(--muted-foreground))' }}>{expandedInstructions === integration.id ? '▲ Hide' : '▼ Show'}</span>
                      </button>
                      {expandedInstructions === integration.id && (() => {
                        const info = INTEGRATION_INSTRUCTIONS[integration.slug];
                        return (
                          <div className="px-4 py-4 space-y-3" style={{ backgroundColor: 'hsl(var(--card))' }}>
                            <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>{info.overview}</p>
                            <ol className="space-y-2.5">
                              {info.steps.map(({ title, desc }, idx) => (
                                <li key={idx} className="flex gap-3">
                                  <span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white mt-0.5" style={{ backgroundColor: 'hsl(var(--primary))' }}>{idx + 1}</span>
                                  <div>
                                    <p className="text-xs font-medium" style={{ color: 'hsl(var(--foreground))' }}>{title}</p>
                                    <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>{desc}</p>
                                  </div>
                                </li>
                              ))}
                            </ol>
                            {info.tip && (
                              <div className="rounded-lg p-3" style={{ backgroundColor: 'hsl(var(--secondary))' }}>
                                <p className="text-xs font-medium mb-0.5" style={{ color: 'hsl(var(--foreground))' }}>💡 Tip</p>
                                <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>{info.tip}</p>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {editingIntegration === integration.id && (
                    <div className="mt-1 space-y-3 pt-4 border-t" style={{ borderColor: 'hsl(var(--border))' }}>
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
                      <button onClick={createApiKey} disabled={saving} className="px-4 py-2 rounded-lg text-xs font-medium text-white disabled:opacity-60" style={{ backgroundColor: 'hsl(var(--primary))' }}>
                        {saving ? 'Creating…' : 'Create Key'}
                      </button>
                      <button onClick={() => setShowNewKeyForm(false)} className="px-4 py-2 rounded-lg text-xs font-medium border" style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}>
                        Cancel
                      </button>
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
                      <div className="flex items-center gap-2">
                        <button onClick={() => setRevealedKeys((s) => { const n = new Set(s); s.has(k.id) ? n.delete(k.id) : n.add(k.id); return n; })} className="text-xs px-2 py-1 rounded border" style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}>
                          {revealedKeys.has(k.id) ? 'Hide' : 'Show'}
                        </button>
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
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-2">
                    <Webhook size={15} style={{ color: 'hsl(var(--primary))' }} />
                    <h2 className="font-semibold text-sm" style={{ color: 'hsl(var(--foreground))' }}>Outgoing Webhooks</h2>
                  </div>
                  <button
                    onClick={() => setShowNewWebhookForm(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
                    style={{ backgroundColor: 'hsl(var(--primary))', color: 'white' }}
                  >
                    + Add Webhook
                  </button>
                </div>
                <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  Configure endpoints to receive real-time notifications when events occur (order created, status updated, driver assigned, etc.).
                </p>

                {webhooks.length === 0 && !showNewWebhookForm && (
                  <div className="text-center py-8">
                    <Webhook size={32} className="mx-auto mb-2 opacity-30" />
                    <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>No webhooks configured yet.</p>
                  </div>
                )}

                {showNewWebhookForm && (
                  <div className="border rounded-lg p-4 space-y-3" style={{ borderColor: 'hsl(var(--border))' }}>
                    <h3 className="text-xs font-semibold" style={{ color: 'hsl(var(--foreground))' }}>New Outgoing Webhook</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <TextInput label="Name" value={newWebhookForm.name} onChange={(v) => setNewWebhookForm((f) => ({ ...f, name: v }))} placeholder="My Webhook" />
                      <div>
                        <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--muted-foreground))' }}>Method</label>
                        <div className="flex gap-2">
                          {(['POST', 'GET'] as const).map((m) => (
                            <button
                              key={m}
                              onClick={() => setNewWebhookForm((f) => ({ ...f, method: m }))}
                              className="flex-1 py-2 rounded-lg text-xs font-semibold border transition-all"
                              style={newWebhookForm.method === m
                                ? { backgroundColor: 'hsl(var(--primary) / 0.1)', borderColor: 'hsl(var(--primary))', color: 'hsl(var(--primary))' }
                                : { borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}
                            >{m}</button>
                          ))}
                        </div>
                      </div>
                      <div className="md:col-span-2">
                        <TextInput label="Endpoint URL" value={newWebhookForm.url} onChange={(v) => setNewWebhookForm((f) => ({ ...f, url: v }))} placeholder="https://your-endpoint.com/webhook" type="url" />
                      </div>
                      <TextInput label="Secret (optional)" value={newWebhookForm.secret} onChange={(v) => setNewWebhookForm((f) => ({ ...f, secret: v }))} placeholder="HMAC signing secret" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--muted-foreground))' }}>Events</label>
                      <div className="flex flex-wrap gap-2">
                        {['order.created', 'order.updated', 'order.completed', 'order.cancelled', 'driver.assigned', 'driver.offline', 'delivery.failed'].map((ev) => (
                          <button
                            key={ev}
                            onClick={() => setNewWebhookForm((f) => ({
                              ...f,
                              events: f.events.includes(ev)
                                ? f.events.filter((e) => e !== ev)
                                : [...f.events, ev],
                            }))}
                            className="px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all"
                            style={newWebhookForm.events.includes(ev)
                              ? { backgroundColor: 'hsl(var(--primary) / 0.1)', borderColor: 'hsl(var(--primary))', color: 'hsl(var(--primary))' }
                              : { borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}
                          >{ev}</button>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end pt-2">
                      <button onClick={() => { setShowNewWebhookForm(false); setNewWebhookForm({ name: '', url: '', method: 'POST', secret: '', events: ['order.created'], is_active: true }); }} className="btn-secondary text-xs">Cancel</button>
                      <button
                        disabled={!newWebhookForm.name || !newWebhookForm.url || newWebhookForm.events.length === 0}
                        onClick={async () => {
                          setSaving(true);
                          try {
                            const { error } = await supabase.from('webhook_configs').insert({
                              name: newWebhookForm.name, url: newWebhookForm.url,
                              method: newWebhookForm.method, secret: newWebhookForm.secret,
                              events: newWebhookForm.events, is_active: true,
                            });
                            if (error) throw error;
                            const { data: all } = await supabase.from('webhook_configs').select('*').order('created_at');
                            setWebhooks(all ?? []);
                            setShowNewWebhookForm(false);
                            setNewWebhookForm({ name: '', url: '', method: 'POST', secret: '', events: ['order.created'], is_active: true });
                            toast.success('Webhook created');
                          } catch (err: unknown) {
                            toast.error(`Failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
                          } finally { setSaving(false); }
                        }}
                        className="btn-primary text-xs"
                      ><Save size={12} /> Save Webhook</button>
                    </div>
                  </div>
                )}

                {webhooks.map((wh) => (
                  <div key={wh.id} className="border rounded-lg p-4" style={{ borderColor: 'hsl(var(--border))' }}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>{wh.name}</span>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${wh.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                            {wh.is_active ? 'Active' : 'Inactive'}
                          </span>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{wh.method}</span>
                        </div>
                        <p className="text-xs font-mono truncate" style={{ color: 'hsl(var(--muted-foreground))' }}>{wh.url}</p>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {wh.events?.map((ev: string) => (
                            <span key={ev} className="text-[10px] px-2 py-0.5 rounded-full border" style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}>{ev}</span>
                          ))}
                        </div>
                        {wh.last_triggered_at && (
                          <p className="text-[10px] mt-2" style={{ color: 'hsl(var(--muted-foreground))' }}>
                            Last fired: {new Date(wh.last_triggered_at).toLocaleString('en-GB')} — Status: {wh.last_status ?? 'unknown'}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={async () => {
                            setTestingWebhook(wh.id ?? null);
                            try {
                              const res = await fetch('/api/webhooks/fire', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ event: 'webhook.test', data: { test: true, timestamp: new Date().toISOString() }, webhook_id: wh.id }),
                              });
                              const result = await res.json();
                              if (result.fired > 0) toast.success('Test webhook sent');
                              else toast.info('No delivery (webhook may not subscribe to webhook.test)');
                              const { data: all } = await supabase.from('webhook_configs').select('*').order('created_at');
                              setWebhooks(all ?? []);
                            } catch { toast.error('Test failed'); }
                            finally { setTestingWebhook(null); }
                          }}
                          disabled={testingWebhook === wh.id}
                          className="p-1.5 rounded-md border text-xs hover:bg-secondary transition-colors"
                          style={{ borderColor: 'hsl(var(--border))' }}
                          title="Test webhook"
                        >
                          {testingWebhook === wh.id ? <RefreshCw size={12} className="animate-spin" /> : <Webhook size={12} />}
                        </button>
                        <button
                          onClick={async () => {
                            await supabase.from('webhook_configs').update({ is_active: !wh.is_active }).eq('id', wh.id);
                            const { data: all } = await supabase.from('webhook_configs').select('*').order('created_at');
                            setWebhooks(all ?? []);
                            toast.success(wh.is_active ? 'Webhook paused' : 'Webhook activated');
                          }}
                          className="p-1.5 rounded-md border text-xs hover:bg-secondary transition-colors"
                          style={{ borderColor: 'hsl(var(--border))' }}
                          title={wh.is_active ? 'Pause' : 'Activate'}
                        >
                          {wh.is_active ? <XCircle size={12} /> : <CheckCircle size={12} />}
                        </button>
                        <button
                          onClick={async () => {
                            if (!confirm(`Delete webhook "${wh.name}"?`)) return;
                            await supabase.from('webhook_configs').delete().eq('id', wh.id);
                            setWebhooks((prev) => prev.filter((w) => w.id !== wh.id));
                            toast.success('Webhook deleted');
                          }}
                          className="p-1.5 rounded-md border text-xs hover:bg-red-50 transition-colors"
                          style={{ borderColor: 'hsl(var(--border))' }}
                          title="Delete"
                        >
                          <Trash2 size={12} style={{ color: 'hsl(var(--destructive))' }} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── SMTP Mail ─────────────────────────────────────────────────────────── */}
      {activeTab === 'smtp' && (
        <div className="space-y-5">
          {/* Server Settings */}
          <div className="rounded-xl border p-5 space-y-4" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
            <div className="flex items-center gap-2">
              <Mail size={16} style={{ color: 'hsl(var(--primary))' }} />
              <h2 className="font-semibold text-sm" style={{ color: 'hsl(var(--foreground))' }}>SMTP Server Configuration</h2>
            </div>
            <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Configure your outgoing mail server. These credentials are used to send booking status emails and notifications.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--muted-foreground))' }}>SMTP Host</label>
                <input
                  type="text"
                  value={smtpConfig.host}
                  onChange={(e) => setSmtpConfig((c) => ({ ...c, host: e.target.value }))}
                  placeholder="smtp.gmail.com"
                  className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none"
                  style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--muted-foreground))' }}>Port</label>
                <input
                  type="number"
                  value={smtpConfig.port}
                  onChange={(e) => setSmtpConfig((c) => ({ ...c, port: e.target.value }))}
                  placeholder="587"
                  className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none"
                  style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                />
              </div>
              <div className="flex items-center gap-3 pt-5">
                <Toggle
                  checked={smtpConfig.secure}
                  onChange={(v) => setSmtpConfig((c) => ({ ...c, secure: v }))}
                />
                <div>
                  <p className="text-sm font-medium" style={{ color: 'hsl(var(--foreground))' }}>Use SSL/TLS</p>
                  <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>Enable for port 465, disable for 587 (STARTTLS)</p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--muted-foreground))' }}>Username / Email</label>
                <input
                  type="text"
                  value={smtpConfig.user}
                  onChange={(e) => setSmtpConfig((c) => ({ ...c, user: e.target.value }))}
                  placeholder="you@gmail.com"
                  className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none"
                  style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--muted-foreground))' }}>Password / App Password</label>
                <div className="relative">
                  <input
                    type={smtpShowPass ? 'text' : 'password'}
                    value={smtpConfig.pass}
                    onChange={(e) => setSmtpConfig((c) => ({ ...c, pass: e.target.value }))}
                    placeholder="••••••••••••"
                    className="w-full px-3 py-2 pr-9 rounded-lg border text-sm focus:outline-none"
                    style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                  />
                  <button
                    type="button"
                    onClick={() => setSmtpShowPass((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2"
                    style={{ color: 'hsl(var(--muted-foreground))' }}
                  >
                    {smtpShowPass ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--muted-foreground))' }}>From Name</label>
                <input
                  type="text"
                  value={smtpConfig.fromName}
                  onChange={(e) => setSmtpConfig((c) => ({ ...c, fromName: e.target.value }))}
                  placeholder="CastleAdmin"
                  className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none"
                  style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--muted-foreground))' }}>From Email Address</label>
                <input
                  type="email"
                  value={smtpConfig.fromEmail}
                  onChange={(e) => setSmtpConfig((c) => ({ ...c, fromEmail: e.target.value }))}
                  placeholder="noreply@yourcompany.com"
                  className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none"
                  style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                />
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <button
                onClick={saveSmtpConfig}
                disabled={smtpSaving}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-opacity disabled:opacity-60"
                style={{ backgroundColor: 'hsl(var(--primary))' }}
              >
                {smtpSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {smtpSaving ? 'Saving…' : 'Save SMTP Settings'}
              </button>
            </div>
          </div>

          {/* Test Email */}
          <div className="rounded-xl border p-5 space-y-4" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
            <h2 className="font-semibold text-sm" style={{ color: 'hsl(var(--foreground))' }}>Test Connection</h2>
            <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Send a test email to verify your SMTP settings are working correctly.
            </p>
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--muted-foreground))' }}>Send Test Email To</label>
                <input
                  type="email"
                  value={smtpTestEmail}
                  onChange={(e) => setSmtpTestEmail(e.target.value)}
                  placeholder="test@example.com"
                  className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none"
                  style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                />
              </div>
              <button
                onClick={async () => {
                  if (!smtpTestEmail) { toast.error('Enter a recipient email address'); return; }
                  if (!smtpConfig.host || !smtpConfig.user || !smtpConfig.pass || !smtpConfig.fromEmail) {
                    toast.error('Fill in all SMTP fields before testing');
                    return;
                  }
                  setSmtpTesting(true);
                  try {
                    const res = await fetch('/api/smtp/test', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        host: smtpConfig.host,
                        port: smtpConfig.port,
                        secure: smtpConfig.secure,
                        user: smtpConfig.user,
                        pass: smtpConfig.pass,
                        fromName: smtpConfig.fromName,
                        fromEmail: smtpConfig.fromEmail,
                        toEmail: smtpTestEmail,
                      }),
                    });
                    const data = await res.json();
                    if (data.success) {
                      toast.success('Test email sent successfully!');
                    } else {
                      toast.error(`SMTP test failed: ${data.error}`);
                    }
                  } catch {
                    toast.error('Failed to reach SMTP test endpoint');
                  } finally {
                    setSmtpTesting(false);
                  }
                }}
                disabled={smtpTesting}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors disabled:opacity-60 whitespace-nowrap"
                style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))', backgroundColor: 'hsl(var(--background))' }}
              >
                {smtpTesting ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
                {smtpTesting ? 'Sending…' : 'Send Test'}
              </button>
            </div>
          </div>

          {/* Info Banner */}
          <div className="rounded-xl border p-4 flex gap-3" style={{ backgroundColor: 'hsl(var(--primary) / 0.05)', borderColor: 'hsl(var(--primary) / 0.2)' }}>
            <AlertTriangle size={16} className="mt-0.5 shrink-0" style={{ color: 'hsl(var(--primary))' }} />
            <div className="text-xs space-y-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
              <p className="font-medium" style={{ color: 'hsl(var(--foreground))' }}>SMTP settings are saved to the database</p>
              <p>Click <strong>Save SMTP Settings</strong> to persist your configuration. Settings are loaded from the database on startup and override environment variable defaults.</p>
              <p>For Gmail, use an <strong>App Password</strong> (not your account password). Enable 2FA first, then generate an App Password under Google Account → Security.</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Force Clear Cache ──────────────────────────────────────────────────── */}
      {activeTab === 'database' && (
        <div className="rounded-xl border-2 border-red-200 p-5 space-y-4 mt-5" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
          <div className="flex items-center gap-2">
            <RefreshCw size={15} style={{ color: 'hsl(var(--primary))' }} />
            <h2 className="font-semibold text-sm text-red-600">Force Clear Cache</h2>
          </div>
          <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Clears all locally stored data including browser cache, localStorage, sessionStorage, and service worker caches. Use this if you are experiencing stale data or display issues. The page will automatically reload after clearing.
          </p>
          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={clearCache}
              disabled={clearingCache}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-opacity disabled:opacity-60"
              style={{ backgroundColor: 'hsl(var(--primary))' }}
            >
              {clearingCache ? (
                <><RefreshCw size={14} className="animate-spin" /> Clearing…</>
              ) : (
                <><RefreshCw size={14} /> Clear Cache</>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ── Danger Zone ───────────────────────────────────────────────────────── */}
      <div className="rounded-xl border-2 border-red-200 p-5 space-y-4 mt-6" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
        <div className="flex items-center gap-2">
          <AlertTriangle size={16} className="text-red-500" />
          <h2 className="font-semibold text-sm text-red-600">Danger Zone</h2>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 rounded-lg bg-red-50 border border-red-100">
          <div>
            <p className="text-sm font-medium text-red-700">Reset App Data</p>
            <p className="text-xs text-red-500 mt-0.5">Permanently removes all demo data — bookings, drivers, staff, vehicles, customers, and logs. Your admin account will be preserved.</p>
          </div>
          <button
            onClick={() => { setShowResetModal(true); setResetConfirmText(''); }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-700 transition-colors whitespace-nowrap flex-shrink-0"
          >
            <Trash2 size={14} /> Reset App
          </button>
        </div>
      </div>

      {/* ── Reset Confirmation Modal ───────────────────────────────────────────── */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
            {/* Header */}
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-full bg-red-100 flex-shrink-0">
                <AlertTriangle size={20} className="text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-base" style={{ color: 'hsl(var(--foreground))' }}>Reset App Data</h3>
                <p className="text-sm mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>This action is <strong>irreversible</strong>. The following data will be permanently deleted:</p>
              </div>
            </div>

            {/* What will be deleted */}
            <ul className="text-sm space-y-1 pl-4 list-disc" style={{ color: 'hsl(var(--muted-foreground))' }}>
              <li>All bookings &amp; orders</li>
              <li>All drivers &amp; driver data</li>
              <li>All staff / team roles (except your admin account)</li>
              <li>All vehicles, inspections &amp; incidents</li>
              <li>All customers</li>
              <li>All activity logs, notifications &amp; alerts</li>
            </ul>

            {/* What is preserved */}
            <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 border border-green-200">
              <CheckCircle size={15} className="text-green-600 flex-shrink-0" />
              <p className="text-xs text-green-700 font-medium">Your admin account and all settings will be preserved.</p>
            </div>

            {/* Confirm input */}
            <div className="space-y-2">
              <label className="text-sm font-medium" style={{ color: 'hsl(var(--foreground))' }}>
                Type <span className="font-bold text-red-600">RESET</span> to confirm
              </label>
              <input
                type="text"
                value={resetConfirmText}
                onChange={(e) => setResetConfirmText(e.target.value)}
                placeholder="Type RESET here"
                className="w-full px-3 py-2 rounded-lg border text-sm outline-none focus:ring-2 focus:ring-red-300"
                style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
              />
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => { setShowResetModal(false); setResetConfirmText(''); }}
                disabled={resetting}
                className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium border transition-colors disabled:opacity-50"
                style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
              >
                Cancel
              </button>
              <button
                onClick={resetAppData}
                disabled={resetConfirmText !== 'RESET' || resetting}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {resetting ? (
                  <><RefreshCw size={14} className="animate-spin" /> Resetting…</>
                ) : (
                  <><Trash2 size={14} /> Confirm Reset</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}