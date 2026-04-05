'use client';

import { useState, useEffect } from 'react';
import { Bell, BellOff, Truck, RefreshCw, CreditCard, AlertTriangle, CheckCircle2, Settings2 } from 'lucide-react';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NotificationPreferences {
  assignments: boolean;
  statusChanges: boolean;
  payments: boolean;
  urgentAlerts: boolean;
}

const STORAGE_KEY = 'driver_notification_prefs';

const DEFAULT_PREFS: NotificationPreferences = {
  assignments: true,
  statusChanges: true,
  payments: true,
  urgentAlerts: true,
};

function loadPrefs(): NotificationPreferences {
  if (typeof window === 'undefined') return DEFAULT_PREFS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_PREFS;
  }
}

function savePrefs(prefs: NotificationPreferences): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {}
}

export function useNotificationPrefs(): NotificationPreferences {
  const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULT_PREFS);
  useEffect(() => {
    setPrefs(loadPrefs());
  }, []);
  return prefs;
}

// ─── Toggle Row ───────────────────────────────────────────────────────────────

interface ToggleRowProps {
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  title: string;
  description: string;
  enabled: boolean;
  onChange: (val: boolean) => void;
}

function ToggleRow({ icon, iconBg, iconColor, title, description, enabled, onChange }: ToggleRowProps) {
  return (
    <div
      className="flex items-center gap-4 p-4 rounded-xl border transition-all"
      style={{
        backgroundColor: 'hsl(var(--card))',
        borderColor: enabled ? iconColor + '44' : 'hsl(var(--border))',
      }}
    >
      {/* Icon */}
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
        style={{ backgroundColor: iconBg }}
      >
        {icon}
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold leading-tight" style={{ color: 'hsl(var(--foreground))' }}>
          {title}
        </p>
        <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'hsl(var(--muted-foreground))' }}>
          {description}
        </p>
      </div>

      {/* Toggle */}
      <button
        onClick={() => onChange(!enabled)}
        className="relative shrink-0 w-12 h-6 rounded-full transition-all duration-200 focus:outline-none"
        style={{
          backgroundColor: enabled ? iconColor : 'hsl(var(--secondary))',
        }}
        aria-label={enabled ? `Disable ${title}` : `Enable ${title}`}
        role="switch"
        aria-checked={enabled}
      >
        <span
          className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200"
          style={{ transform: enabled ? 'translateX(24px)' : 'translateX(0)' }}
        />
      </button>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface DriverNotificationSettingsProps {
  driverId: string;
}

export default function DriverNotificationSettings({ driverId: _driverId }: DriverNotificationSettingsProps) {
  const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULT_PREFS);
  const [pushPermission, setPushPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const [requestingPush, setRequestingPush] = useState(false);
  const [saved, setSaved] = useState(false);

  // Load prefs from localStorage on mount
  useEffect(() => {
    setPrefs(loadPrefs());
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPushPermission(Notification.permission);
    } else if (typeof window !== 'undefined') {
      setPushPermission('unsupported');
    }
  }, []);

  const updatePref = (key: keyof NotificationPreferences, value: boolean) => {
    const updated = { ...prefs, [key]: value };
    setPrefs(updated);
    savePrefs(updated);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    toast.success(`${value ? 'Enabled' : 'Disabled'} ${PREF_LABELS[key]}`);
  };

  const handleEnableAll = () => {
    const all: NotificationPreferences = { assignments: true, statusChanges: true, payments: true, urgentAlerts: true };
    setPrefs(all);
    savePrefs(all);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    toast.success('All notifications enabled');
  };

  const handleDisableAll = () => {
    const none: NotificationPreferences = { assignments: false, statusChanges: false, payments: false, urgentAlerts: false };
    setPrefs(none);
    savePrefs(none);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    toast.success('All notifications disabled');
  };

  const handleRequestPushPermission = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    setRequestingPush(true);
    try {
      const result = await Notification.requestPermission();
      setPushPermission(result);
      if (result === 'granted') {
        toast.success('Push notifications enabled');
      } else if (result === 'denied') {
        toast.error('Push notifications blocked. Please enable them in your browser settings.');
      }
    } catch {
      toast.error('Could not request notification permission');
    }
    setRequestingPush(false);
  };

  const allEnabled = Object.values(prefs).every(Boolean);
  const allDisabled = Object.values(prefs).every((v) => !v);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings2 size={18} style={{ color: 'hsl(var(--primary))' }} />
          <h2 className="text-base font-bold" style={{ color: 'hsl(var(--foreground))' }}>
            Notification Settings
          </h2>
        </div>
        {saved && (
          <div className="flex items-center gap-1 text-xs font-medium" style={{ color: 'hsl(142 69% 35%)' }}>
            <CheckCircle2 size={13} />
            Saved
          </div>
        )}
      </div>

      {/* Push Permission Banner */}
      {pushPermission !== 'granted' && pushPermission !== 'unsupported' && (
        <div
          className="rounded-xl border p-4 flex items-start gap-3"
          style={{
            backgroundColor: 'hsl(38 92% 50% / 0.08)',
            borderColor: 'hsl(38 92% 50% / 0.3)',
          }}
        >
          <BellOff size={18} className="shrink-0 mt-0.5" style={{ color: 'hsl(38 92% 50%)' }} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
              Push notifications {pushPermission === 'denied' ? 'blocked' : 'not enabled'}
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
              {pushPermission === 'denied' ?'Enable notifications in your browser or device settings to receive alerts.' :'Allow notifications to receive real-time alerts even when the app is in the background.'}
            </p>
            {pushPermission !== 'denied' && (
              <button
                onClick={handleRequestPushPermission}
                disabled={requestingPush}
                className="mt-2.5 flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
                style={{ backgroundColor: 'hsl(38 92% 50%)', color: 'white', opacity: requestingPush ? 0.7 : 1 }}
              >
                {requestingPush ? <RefreshCw size={11} className="animate-spin" /> : <Bell size={11} />}
                {requestingPush ? 'Requesting…' : 'Enable Push Notifications'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Push Enabled Confirmation */}
      {pushPermission === 'granted' && (
        <div
          className="rounded-xl border p-3 flex items-center gap-3"
          style={{
            backgroundColor: 'hsl(142 69% 35% / 0.08)',
            borderColor: 'hsl(142 69% 35% / 0.3)',
          }}
        >
          <CheckCircle2 size={16} className="shrink-0" style={{ color: 'hsl(142 69% 35%)' }} />
          <p className="text-xs font-medium" style={{ color: 'hsl(142 69% 35%)' }}>
            Push notifications are active on this device
          </p>
        </div>
      )}

      {/* Quick Actions */}
      <div className="flex gap-2">
        <button
          onClick={handleEnableAll}
          disabled={allEnabled}
          className="flex-1 py-2 rounded-lg text-xs font-semibold transition-all"
          style={{
            backgroundColor: allEnabled ? 'hsl(var(--secondary))' : 'hsl(var(--primary))',
            color: allEnabled ? 'hsl(var(--muted-foreground))' : 'white',
            opacity: allEnabled ? 0.6 : 1,
          }}
        >
          Enable All
        </button>
        <button
          onClick={handleDisableAll}
          disabled={allDisabled}
          className="flex-1 py-2 rounded-lg text-xs font-semibold transition-all"
          style={{
            backgroundColor: 'hsl(var(--secondary))',
            color: allDisabled ? 'hsl(var(--muted-foreground))' : 'hsl(var(--foreground))',
            opacity: allDisabled ? 0.6 : 1,
          }}
        >
          Disable All
        </button>
      </div>

      {/* Notification Type Toggles */}
      <div className="space-y-2.5">
        <p className="text-xs font-semibold uppercase tracking-wide px-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
          Notification Types
        </p>

        <ToggleRow
          icon={<Truck size={18} style={{ color: 'hsl(217 91% 60%)' }} />}
          iconBg="hsl(217 91% 60% / 0.12)"
          iconColor="hsl(217 91% 60%)"
          title="Assignment Alerts"
          description="Get notified when a new booking is assigned to you"
          enabled={prefs.assignments}
          onChange={(val) => updatePref('assignments', val)}
        />

        <ToggleRow
          icon={<RefreshCw size={18} style={{ color: 'hsl(262 83% 58%)' }} />}
          iconBg="hsl(262 83% 58% / 0.12)"
          iconColor="hsl(262 83% 58%)"
          title="Status Changes"
          description="Receive updates when order statuses are changed by dispatch"
          enabled={prefs.statusChanges}
          onChange={(val) => updatePref('statusChanges', val)}
        />

        <ToggleRow
          icon={<CreditCard size={18} style={{ color: 'hsl(142 69% 35%)' }} />}
          iconBg="hsl(142 69% 35% / 0.12)"
          iconColor="hsl(142 69% 35%)"
          title="Payment Notifications"
          description="Alerts for payment confirmations, outstanding balances, and earnings"
          enabled={prefs.payments}
          onChange={(val) => updatePref('payments', val)}
        />

        <ToggleRow
          icon={<AlertTriangle size={18} style={{ color: 'hsl(0 84% 60%)' }} />}
          iconBg="hsl(0 84% 60% / 0.12)"
          iconColor="hsl(0 84% 60%)"
          title="Urgent Alerts"
          description="High-priority messages from dispatch requiring immediate attention"
          enabled={prefs.urgentAlerts}
          onChange={(val) => updatePref('urgentAlerts', val)}
        />
      </div>

      {/* Info Note */}
      <div
        className="rounded-xl border p-3.5"
        style={{ backgroundColor: 'hsl(var(--secondary))', borderColor: 'hsl(var(--border))' }}
      >
        <p className="text-xs leading-relaxed" style={{ color: 'hsl(var(--muted-foreground))' }}>
          <span className="font-semibold" style={{ color: 'hsl(var(--foreground))' }}>Note: </span>
          These preferences are saved on this device. Disabling a type will suppress in-app alerts for that category. Urgent alerts from dispatch may still appear regardless of your settings.
        </p>
      </div>
    </div>
  );
}

// ─── Label map for toast messages ─────────────────────────────────────────────

const PREF_LABELS: Record<keyof NotificationPreferences, string> = {
  assignments: 'Assignment Alerts',
  statusChanges: 'Status Changes',
  payments: 'Payment Notifications',
  urgentAlerts: 'Urgent Alerts',
};
