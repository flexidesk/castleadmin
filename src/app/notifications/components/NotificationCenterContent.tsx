'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Clock, CreditCard, UserX, Bell, CheckCheck, X, Filter, RefreshCw,
  ChevronDown, PackageSearch, ShoppingCart, TruckIcon, BadgeCheck, Archive,
  AlarmClock, Banknote, ShieldAlert,
} from 'lucide-react';
import Link from 'next/link';

// ─── Types ────────────────────────────────────────────────────────────────────

type AlertType =
  | 'overdue' |'pending_payment' |'unassigned' |'order_alert' |'status_update' |'payment_confirmation' |'driver_shift_reminder' |'payment_notification' |'admin_alert';

type DismissalFilter = 'all' | 'active' | 'dismissed';
type ArchiveFilter = 'all' | 'active' | 'archived';

interface Notification {
  id: string;
  alert_type: AlertType;
  title: string;
  message: string;
  order_id: string | null;
  driver_id: string | null;
  metadata: Record<string, unknown> | null;
  is_dismissed: boolean;
  dismissed_at: string | null;
  dismissed_by: string | null;
  is_archived: boolean;
  archived_at: string | null;
  created_at: string;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const ALERT_CONFIG: Record<AlertType, {
  label: string;
  icon: React.ElementType;
  color: string;
  bg: string;
  border: string;
}> = {
  overdue: {
    label: 'Overdue',
    icon: Clock,
    color: 'hsl(0 84% 45%)',
    bg: 'hsl(0 84% 55% / 0.08)',
    border: 'hsl(0 84% 55% / 0.25)',
  },
  pending_payment: {
    label: 'Pending Payment',
    icon: CreditCard,
    color: 'hsl(35 85% 35%)',
    bg: 'hsl(38 92% 50% / 0.08)',
    border: 'hsl(38 92% 50% / 0.25)',
  },
  unassigned: {
    label: 'Unassigned',
    icon: UserX,
    color: 'hsl(217 91% 40%)',
    bg: 'hsl(217 91% 60% / 0.08)',
    border: 'hsl(217 91% 60% / 0.25)',
  },
  order_alert: {
    label: 'Order Alert',
    icon: ShoppingCart,
    color: 'hsl(262 83% 45%)',
    bg: 'hsl(262 83% 58% / 0.08)',
    border: 'hsl(262 83% 58% / 0.25)',
  },
  status_update: {
    label: 'Status Update',
    icon: TruckIcon,
    color: 'hsl(197 71% 35%)',
    bg: 'hsl(197 71% 52% / 0.08)',
    border: 'hsl(197 71% 52% / 0.25)',
  },
  payment_confirmation: {
    label: 'Payment Confirmed',
    icon: BadgeCheck,
    color: 'hsl(142 71% 30%)',
    bg: 'hsl(142 71% 45% / 0.08)',
    border: 'hsl(142 71% 45% / 0.25)',
  },
  driver_shift_reminder: {
    label: 'Shift Reminder',
    icon: AlarmClock,
    color: 'hsl(280 70% 40%)',
    bg: 'hsl(280 70% 55% / 0.08)',
    border: 'hsl(280 70% 55% / 0.25)',
  },
  payment_notification: {
    label: 'Payment Notice',
    icon: Banknote,
    color: 'hsl(22 90% 38%)',
    bg: 'hsl(22 90% 52% / 0.08)',
    border: 'hsl(22 90% 52% / 0.25)',
  },
  admin_alert: {
    label: 'Admin Alert',
    icon: ShieldAlert,
    color: 'hsl(0 72% 38%)',
    bg: 'hsl(0 72% 50% / 0.08)',
    border: 'hsl(0 72% 50% / 0.25)',
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRelative(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function MetadataBadge({ metadata, alertType }: { metadata: Record<string, unknown> | null; alertType: AlertType }) {
  if (!metadata) return null;

  if (alertType === 'driver_shift_reminder') {
    const shiftType = metadata.shift_type as string | undefined;
    if (shiftType) {
      return (
        <span
          className="px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize"
          style={{ backgroundColor: 'hsl(280 70% 55% / 0.1)', color: 'hsl(280 70% 40%)' }}
        >
          {shiftType} shift
        </span>
      );
    }
  }

  if (alertType === 'payment_notification') {
    const amount = metadata.amount as number | undefined;
    const currency = (metadata.currency as string) ?? 'GBP';
    if (amount !== undefined) {
      return (
        <span
          className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
          style={{ backgroundColor: 'hsl(22 90% 52% / 0.1)', color: 'hsl(22 90% 38%)' }}
        >
          {currency === 'GBP' ? '£' : currency}{amount.toFixed(2)}
        </span>
      );
    }
  }

  if (alertType === 'admin_alert') {
    const severity = metadata.severity as string | undefined;
    if (severity === 'high') {
      return (
        <span
          className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
          style={{ backgroundColor: 'hsl(0 72% 50% / 0.12)', color: 'hsl(0 72% 38%)' }}
        >
          High Priority
        </span>
      );
    }
  }

  return null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function NotificationCenterContent() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioningId, setActioningId] = useState<string | null>(null);

  // Filters
  const [alertTypeFilter, setAlertTypeFilter] = useState<AlertType | 'all'>('all');
  const [dismissalFilter, setDismissalFilter] = useState<DismissalFilter>('all');
  const [archiveFilter, setArchiveFilter] = useState<ArchiveFilter>('active');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const fetchNotifications = useCallback(async () => {
    const supabase = createClient();
    let query = supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false });

    if (alertTypeFilter !== 'all') {
      query = query.eq('alert_type', alertTypeFilter);
    }
    if (dismissalFilter === 'active') {
      query = query.eq('is_dismissed', false);
    } else if (dismissalFilter === 'dismissed') {
      query = query.eq('is_dismissed', true);
    }
    if (archiveFilter === 'active') {
      query = query.eq('is_archived', false);
    } else if (archiveFilter === 'archived') {
      query = query.eq('is_archived', true);
    }
    if (dateFrom) {
      query = query.gte('created_at', new Date(dateFrom).toISOString());
    }
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      query = query.lte('created_at', end.toISOString());
    }

    const { data, error } = await query;
    if (!error && data) {
      setNotifications(data as Notification[]);
    }
    setLoading(false);
  }, [alertTypeFilter, dismissalFilter, archiveFilter, dateFrom, dateTo]);

  useEffect(() => {
    setLoading(true);
    fetchNotifications();
  }, [fetchNotifications]);

  // Real-time subscriptions — notifications table + driver_shifts + driver_payments
  useEffect(() => {
    const supabase = createClient();

    const notificationsChannel = supabase
      .channel('notifications_center_v3')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => {
        fetchNotifications();
      })
      .subscribe();

    // Listen to driver_shifts for shift reminder triggers
    const shiftsChannel = supabase
      .channel('driver_shifts_notifications')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'driver_shifts' }, () => {
        fetchNotifications();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'driver_shifts' }, () => {
        fetchNotifications();
      })
      .subscribe();

    // Listen to driver_payments for payment notification triggers
    const paymentsChannel = supabase
      .channel('driver_payments_notifications')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'driver_payments' }, () => {
        fetchNotifications();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(notificationsChannel);
      supabase.removeChannel(shiftsChannel);
      supabase.removeChannel(paymentsChannel);
    };
  }, [fetchNotifications]);

  const handleDismiss = async (id: string) => {
    setActioningId(id);
    const supabase = createClient();
    await supabase
      .from('notifications')
      .update({ is_dismissed: true, dismissed_at: new Date().toISOString() })
      .eq('id', id);
    setActioningId(null);
    fetchNotifications();
  };

  const handleArchive = async (id: string) => {
    setActioningId(id);
    const supabase = createClient();
    await supabase
      .from('notifications')
      .update({ is_archived: true, archived_at: new Date().toISOString(), is_dismissed: true, dismissed_at: new Date().toISOString() })
      .eq('id', id);
    setActioningId(null);
    fetchNotifications();
  };

  const handleDismissAll = async () => {
    const supabase = createClient();
    const activeIds = notifications
      .filter((n) => !n.is_dismissed && !n.is_archived)
      .map((n) => n.id);
    if (activeIds.length === 0) return;
    await supabase
      .from('notifications')
      .update({ is_dismissed: true, dismissed_at: new Date().toISOString() })
      .in('id', activeIds);
    fetchNotifications();
  };

  const handleArchiveAll = async () => {
    const supabase = createClient();
    const activeIds = notifications
      .filter((n) => !n.is_archived)
      .map((n) => n.id);
    if (activeIds.length === 0) return;
    await supabase
      .from('notifications')
      .update({ is_archived: true, archived_at: new Date().toISOString(), is_dismissed: true, dismissed_at: new Date().toISOString() })
      .in('id', activeIds);
    fetchNotifications();
  };

  const clearFilters = () => {
    setAlertTypeFilter('all');
    setDismissalFilter('all');
    setArchiveFilter('active');
    setDateFrom('');
    setDateTo('');
  };

  const activeCount = notifications.filter((n) => !n.is_dismissed && !n.is_archived).length;
  const hasFilters = alertTypeFilter !== 'all' || dismissalFilter !== 'all' || archiveFilter !== 'active' || dateFrom || dateTo;

  // Summary counts per type (active, non-archived only)
  const typeCounts = (Object.keys(ALERT_CONFIG) as AlertType[]).reduce((acc, type) => {
    acc[type] = notifications.filter((n) => n.alert_type === type && !n.is_dismissed && !n.is_archived).length;
    return acc;
  }, {} as Record<AlertType, number>);

  // Group types for summary display — new types first, then existing
  const summaryTypes: AlertType[] = [
    'driver_shift_reminder',
    'payment_notification',
    'admin_alert',
    'order_alert',
    'status_update',
    'payment_confirmation',
    'overdue',
    'pending_payment',
    'unassigned',
  ];

  return (
    <div className="space-y-6">

      {/* ── Summary Cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-3">
        {summaryTypes.map((type) => {
          const cfg = ALERT_CONFIG[type];
          const IconComp = cfg.icon;
          const count = typeCounts[type];
          const isActive = alertTypeFilter === type;
          return (
            <button
              key={type}
              onClick={() => setAlertTypeFilter(isActive ? 'all' : type)}
              className="flex flex-col items-start gap-2 px-3 py-3 rounded-xl border transition-all duration-150 text-left hover:shadow-sm"
              style={{
                backgroundColor: isActive ? cfg.bg : 'hsl(var(--card))',
                borderColor: isActive ? cfg.border : 'hsl(var(--border))',
              }}
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                style={{ backgroundColor: cfg.bg }}
              >
                <IconComp size={15} style={{ color: cfg.color }} />
              </div>
              <div>
                <p className="text-lg font-bold leading-none" style={{ color: cfg.color }}>{count}</p>
                <p className="text-[10px] font-medium mt-0.5 leading-tight" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  {cfg.label}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Filters Bar ───────────────────────────────────────────────────── */}
      <div
        className="flex flex-wrap items-end gap-3 px-4 py-3 rounded-xl border"
        style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
      >
        <div className="flex items-center gap-1.5 mr-1">
          <Filter size={14} style={{ color: 'hsl(var(--muted-foreground))' }} />
          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Filters
          </span>
        </div>

        {/* Alert Type */}
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-medium uppercase tracking-wide" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Type
          </label>
          <div className="relative">
            <select
              value={alertTypeFilter}
              onChange={(e) => setAlertTypeFilter(e.target.value as AlertType | 'all')}
              className="appearance-none pl-3 pr-7 py-1.5 rounded-lg border text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/30"
              style={{
                backgroundColor: 'hsl(var(--background))',
                borderColor: 'hsl(var(--border))',
                color: 'hsl(var(--foreground))',
              }}
            >
              <option value="all">All Types</option>
              <optgroup label="Driver">
                <option value="driver_shift_reminder">Shift Reminder</option>
              </optgroup>
              <optgroup label="Payments">
                <option value="payment_notification">Payment Notice</option>
                <option value="payment_confirmation">Payment Confirmed</option>
                <option value="pending_payment">Pending Payment</option>
              </optgroup>
              <optgroup label="Admin">
                <option value="admin_alert">Admin Alert</option>
              </optgroup>
              <optgroup label="Orders">
                <option value="order_alert">Order Alert</option>
                <option value="status_update">Status Update</option>
                <option value="overdue">Overdue</option>
                <option value="unassigned">Unassigned</option>
              </optgroup>
            </select>
            <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'hsl(var(--muted-foreground))' }} />
          </div>
        </div>

        {/* Dismissal Status */}
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-medium uppercase tracking-wide" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Status
          </label>
          <div className="relative">
            <select
              value={dismissalFilter}
              onChange={(e) => setDismissalFilter(e.target.value as DismissalFilter)}
              className="appearance-none pl-3 pr-7 py-1.5 rounded-lg border text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/30"
              style={{
                backgroundColor: 'hsl(var(--background))',
                borderColor: 'hsl(var(--border))',
                color: 'hsl(var(--foreground))',
              }}
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="dismissed">Dismissed</option>
            </select>
            <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'hsl(var(--muted-foreground))' }} />
          </div>
        </div>

        {/* Archive Status */}
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-medium uppercase tracking-wide" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Archive
          </label>
          <div className="relative">
            <select
              value={archiveFilter}
              onChange={(e) => setArchiveFilter(e.target.value as ArchiveFilter)}
              className="appearance-none pl-3 pr-7 py-1.5 rounded-lg border text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/30"
              style={{
                backgroundColor: 'hsl(var(--background))',
                borderColor: 'hsl(var(--border))',
                color: 'hsl(var(--foreground))',
              }}
            >
              <option value="active">Not Archived</option>
              <option value="archived">Archived</option>
              <option value="all">All</option>
            </select>
            <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'hsl(var(--muted-foreground))' }} />
          </div>
        </div>

        {/* Date From */}
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-medium uppercase tracking-wide" style={{ color: 'hsl(var(--muted-foreground))' }}>
            From
          </label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="px-3 py-1.5 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            style={{
              backgroundColor: 'hsl(var(--background))',
              borderColor: 'hsl(var(--border))',
              color: 'hsl(var(--foreground))',
            }}
          />
        </div>

        {/* Date To */}
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-medium uppercase tracking-wide" style={{ color: 'hsl(var(--muted-foreground))' }}>
            To
          </label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="px-3 py-1.5 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            style={{
              backgroundColor: 'hsl(var(--background))',
              borderColor: 'hsl(var(--border))',
              color: 'hsl(var(--foreground))',
            }}
          />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 ml-auto flex-wrap">
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors hover:bg-secondary"
              style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}
            >
              <X size={12} />
              Clear
            </button>
          )}
          <button
            onClick={() => { setLoading(true); fetchNotifications(); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors hover:bg-secondary"
            style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}
          >
            <RefreshCw size={12} />
            Refresh
          </button>
          {activeCount > 0 && (
            <>
              <button
                onClick={handleDismissAll}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors hover:bg-secondary"
                style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}
              >
                <CheckCheck size={12} />
                Dismiss All ({activeCount})
              </button>
              <button
                onClick={handleArchiveAll}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                style={{ backgroundColor: 'hsl(var(--primary))', color: 'white' }}
              >
                <Archive size={12} />
                Archive All ({activeCount})
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Notification List ─────────────────────────────────────────────── */}
      <div
        className="rounded-xl border overflow-hidden"
        style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3 border-b"
          style={{ borderColor: 'hsl(var(--border))' }}
        >
          <div className="flex items-center gap-2">
            <Bell size={16} style={{ color: 'hsl(var(--primary))' }} />
            <span className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
              Alert History
            </span>
            {!loading && (
              <span
                className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                style={{ backgroundColor: 'hsl(var(--secondary))', color: 'hsl(var(--muted-foreground))' }}
              >
                {notifications.length}
              </span>
            )}
          </div>
          {activeCount > 0 && (
            <span
              className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
              style={{ backgroundColor: 'hsl(0 84% 55% / 0.1)', color: 'hsl(0 84% 45%)' }}
            >
              {activeCount} active
            </span>
          )}
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="flex items-center gap-2" style={{ color: 'hsl(var(--muted-foreground))' }}>
              <RefreshCw size={16} className="animate-spin" />
              <span className="text-sm">Loading alerts…</span>
            </div>
          </div>
        )}

        {/* Empty */}
        {!loading && notifications.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center"
              style={{ backgroundColor: 'hsl(var(--secondary))' }}
            >
              <Bell size={22} style={{ color: 'hsl(var(--muted-foreground))' }} />
            </div>
            <p className="text-sm font-medium" style={{ color: 'hsl(var(--foreground))' }}>
              No alerts found
            </p>
            <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
              {hasFilters ? 'Try adjusting your filters' : 'All clear — no alerts to show'}
            </p>
          </div>
        )}

        {/* Rows */}
        {!loading && notifications.length > 0 && (
          <ul className="divide-y" style={{ borderColor: 'hsl(var(--border))' }}>
            {notifications.map((n) => {
              const cfg = ALERT_CONFIG[n.alert_type] ?? ALERT_CONFIG['overdue'];
              const IconComp = cfg.icon;
              const isActioning = actioningId === n.id;
              const isInactive = n.is_dismissed || n.is_archived;
              return (
                <li
                  key={n.id}
                  className="flex items-start gap-4 px-5 py-4 transition-colors hover:bg-secondary/30"
                  style={{ opacity: isInactive ? 0.55 : 1 }}
                >
                  {/* Icon */}
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                    style={{ backgroundColor: cfg.bg }}
                  >
                    <IconComp size={16} style={{ color: cfg.color }} />
                  </div>

                  {/* Body */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
                        {n.title}
                      </span>
                      <span
                        className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                        style={{ backgroundColor: cfg.bg, color: cfg.color }}
                      >
                        {cfg.label}
                      </span>
                      <MetadataBadge metadata={n.metadata} alertType={n.alert_type} />
                      {n.is_archived && (
                        <span
                          className="px-2 py-0.5 rounded-full text-[10px] font-semibold flex items-center gap-1"
                          style={{ backgroundColor: 'hsl(var(--secondary))', color: 'hsl(var(--muted-foreground))' }}
                        >
                          <Archive size={9} />
                          Archived
                        </span>
                      )}
                      {n.is_dismissed && !n.is_archived && (
                        <span
                          className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                          style={{ backgroundColor: 'hsl(var(--secondary))', color: 'hsl(var(--muted-foreground))' }}
                        >
                          Dismissed
                        </span>
                      )}
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                      {n.message}
                    </p>
                    <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                      <span className="text-[11px]" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        {formatRelative(n.created_at)} · {formatDate(n.created_at)}
                      </span>
                      {n.order_id && (
                        <Link
                          href={`/order-detail?id=${n.order_id}`}
                          className="flex items-center gap-1 text-[11px] font-medium hover:underline"
                          style={{ color: 'hsl(var(--primary))' }}
                        >
                          <PackageSearch size={11} />
                          {n.order_id}
                        </Link>
                      )}
                      {n.driver_id && (
                        <Link
                          href={`/driver-management`}
                          className="flex items-center gap-1 text-[11px] font-medium hover:underline"
                          style={{ color: 'hsl(280 70% 40%)' }}
                        >
                          <TruckIcon size={11} />
                          View Driver
                        </Link>
                      )}
                      {n.is_archived && n.archived_at && (
                        <span className="text-[11px]" style={{ color: 'hsl(var(--muted-foreground))' }}>
                          Archived {formatRelative(n.archived_at)}
                        </span>
                      )}
                      {n.is_dismissed && !n.is_archived && n.dismissed_at && (
                        <span className="text-[11px]" style={{ color: 'hsl(var(--muted-foreground))' }}>
                          Dismissed {formatRelative(n.dismissed_at)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Action buttons */}
                  {!n.is_archived && (
                    <div className="shrink-0 flex items-center gap-1.5">
                      {!n.is_dismissed && (
                        <button
                          onClick={() => handleDismiss(n.id)}
                          disabled={isActioning}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors hover:bg-secondary disabled:opacity-50"
                          style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}
                          title="Dismiss alert"
                        >
                          {isActioning ? (
                            <RefreshCw size={11} className="animate-spin" />
                          ) : (
                            <X size={11} />
                          )}
                          Dismiss
                        </button>
                      )}
                      <button
                        onClick={() => handleArchive(n.id)}
                        disabled={isActioning}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors hover:bg-secondary disabled:opacity-50"
                        style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}
                        title="Archive notification"
                      >
                        {isActioning ? (
                          <RefreshCw size={11} className="animate-spin" />
                        ) : (
                          <Archive size={11} />
                        )}
                        Archive
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
