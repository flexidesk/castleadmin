'use client';

import { useEffect, useState, useCallback } from 'react';
import { AlertTriangle, Clock, CreditCard, WifiOff, FileX, RefreshCw, ChevronRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';


interface Alert {
  id: string;
  type: 'late_delivery' | 'unpaid_order' | 'offline_driver' | 'pod_failure';
  severity: 'critical' | 'warning';
  title: string;
  description: string;
  orderId?: string;
  driverId?: string;
  timestamp: string;
}

const ALERT_CONFIG = {
  late_delivery: {
    icon: Clock,
    label: 'Late Delivery',
    color: 'hsl(0 84% 45%)',
    bg: 'hsl(0 84% 55% / 0.08)',
    border: 'hsl(0 84% 55% / 0.25)',
    badgeBg: 'hsl(0 84% 55% / 0.12)',
  },
  unpaid_order: {
    icon: CreditCard,
    label: 'Unpaid Order',
    color: 'hsl(35 85% 35%)',
    bg: 'hsl(38 92% 50% / 0.06)',
    border: 'hsl(38 92% 50% / 0.3)',
    badgeBg: 'hsl(38 92% 50% / 0.12)',
  },
  offline_driver: {
    icon: WifiOff,
    label: 'Offline Driver',
    color: 'hsl(0 84% 45%)',
    bg: 'hsl(0 84% 55% / 0.08)',
    border: 'hsl(0 84% 55% / 0.25)',
    badgeBg: 'hsl(0 84% 55% / 0.12)',
  },
  pod_failure: {
    icon: FileX,
    label: 'POD Failure',
    color: 'hsl(35 85% 35%)',
    bg: 'hsl(38 92% 50% / 0.06)',
    border: 'hsl(38 92% 50% / 0.3)',
    badgeBg: 'hsl(38 92% 50% / 0.12)',
  },
};

function timeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function AlertsWidget() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const buildAlerts = useCallback(async () => {
    const supabase = createClient();
    const newAlerts: Alert[] = [];
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    // 1. Late deliveries — Out For Delivery orders where delivery window has passed
    const { data: activeOrders } = await supabase
      .from('orders')
      .select('id, customer_name, delivery_window, booking_date, status, updated_at')
      .eq('status', 'Booking Out For Delivery')
      .lte('booking_date', todayStr);

    if (activeOrders) {
      for (const order of activeOrders) {
        // Parse end of delivery window e.g. "08:00 - 10:00" → 10:00
        const windowMatch = order.delivery_window?.match(/(\d{2}:\d{2})\s*$/);
        if (windowMatch) {
          const [endHour, endMin] = windowMatch[1].split(':').map(Number);
          const windowEnd = new Date(order.booking_date);
          windowEnd.setHours(endHour, endMin, 0, 0);
          if (now > windowEnd) {
            const overMins = Math.floor((now.getTime() - windowEnd.getTime()) / 60000);
            newAlerts.push({
              id: `late-${order.id}`,
              type: 'late_delivery',
              severity: 'critical',
              title: `Late Delivery — ${order.id}`,
              description: `${order.customer_name} · window ended ${overMins}m ago (${order.delivery_window})`,
              orderId: order.id,
              timestamp: order.updated_at,
            });
          }
        }
      }
    }

    // 2. Unpaid orders — active (non-cancelled, non-complete) orders with Unpaid status
    const { data: unpaidOrders } = await supabase
      .from('orders')
      .select('id, customer_name, payment_amount, booking_date, updated_at')
      .eq('payment_status', 'Unpaid')
      .not('status', 'eq', 'Booking Cancelled')
      .not('status', 'eq', 'Booking Complete')
      .order('booking_date', { ascending: true })
      .limit(10);

    if (unpaidOrders) {
      for (const order of unpaidOrders) {
        newAlerts.push({
          id: `unpaid-${order.id}`,
          type: 'unpaid_order',
          severity: 'warning',
          title: `Unpaid Order — ${order.id}`,
          description: `${order.customer_name} · £${Number(order.payment_amount).toFixed(2)} outstanding`,
          orderId: order.id,
          timestamp: order.updated_at,
        });
      }
    }

    // 3. Offline drivers — drivers with status "Off Duty" who have an active order assigned
    const { data: offlineDriverOrders } = await supabase
      .from('orders')
      .select('id, customer_name, booking_date, updated_at, drivers!inner(id, name, status)')
      .not('status', 'eq', 'Booking Complete')
      .not('status', 'eq', 'Booking Cancelled')
      .not('driver_id', 'is', null)
      .lte('booking_date', todayStr);

    if (offlineDriverOrders) {
      const seen = new Set<string>();
      for (const order of offlineDriverOrders as any[]) {
        const driver = order.drivers;
        if (driver?.status === 'Off Duty' && !seen.has(driver.id)) {
          seen.add(driver.id);
          newAlerts.push({
            id: `offline-${driver.id}`,
            type: 'offline_driver',
            severity: 'critical',
            title: `Offline Driver — ${driver.name}`,
            description: `Has active order ${order.id} but is marked Off Duty`,
            orderId: order.id,
            driverId: driver.id,
            timestamp: order.updated_at,
          });
        }
      }
    }

    // 4. POD failures — completed orders missing POD data
    const { data: completedOrders } = await supabase
      .from('orders')
      .select('id, customer_name, updated_at, pod')
      .eq('status', 'Booking Complete')
      .gte('booking_date', new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0])
      .order('updated_at', { ascending: false })
      .limit(50);

    if (completedOrders) {
      for (const order of completedOrders) {
        const pod = order.pod;
        const hasPOD = pod && (pod.photoUrl || pod.signatureUrl || pod.receivedBy);
        if (!hasPOD) {
          newAlerts.push({
            id: `pod-${order.id}`,
            type: 'pod_failure',
            severity: 'warning',
            title: `Missing POD — ${order.id}`,
            description: `${order.customer_name} · completed without proof of delivery`,
            orderId: order.id,
            timestamp: order.updated_at,
          });
        }
      }
    }

    // Sort: critical first, then by timestamp desc
    newAlerts.sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === 'critical' ? -1 : 1;
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });

    setAlerts(newAlerts);
    setLastRefreshed(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    buildAlerts();

    const supabase = createClient();
    const channel = supabase
      .channel('alerts_widget')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => buildAlerts())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers' }, () => buildAlerts())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [buildAlerts]);

  const criticalCount = alerts.filter((a) => a.severity === 'critical').length;
  const warningCount = alerts.filter((a) => a.severity === 'warning').length;

  const countByType = {
    late_delivery: alerts.filter((a) => a.type === 'late_delivery').length,
    unpaid_order: alerts.filter((a) => a.type === 'unpaid_order').length,
    offline_driver: alerts.filter((a) => a.type === 'offline_driver').length,
    pod_failure: alerts.filter((a) => a.type === 'pod_failure').length,
  };

  return (
    <div className="card p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: criticalCount > 0 ? 'hsl(0 84% 55% / 0.12)' : 'hsl(38 92% 50% / 0.12)' }}
          >
            <AlertTriangle
              size={16}
              style={{ color: criticalCount > 0 ? 'hsl(0 84% 45%)' : 'hsl(35 85% 35%)' }}
            />
          </div>
          <div>
            <h3 className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
              Critical Alerts
            </h3>
            {!loading && (
              <p className="text-[10px]" style={{ color: 'hsl(var(--muted-foreground))' }}>
                {alerts.length === 0
                  ? 'All clear'
                  : `${criticalCount} critical · ${warningCount} warning`}
              </p>
            )}
          </div>
        </div>
        <button
          onClick={() => { setLoading(true); buildAlerts(); }}
          className="p-1.5 rounded-md transition-colors hover:bg-secondary"
          title="Refresh alerts"
        >
          <RefreshCw size={13} style={{ color: 'hsl(var(--muted-foreground))' }} />
        </button>
      </div>

      {/* Summary badges */}
      {!loading && alerts.length > 0 && (
        <div className="grid grid-cols-4 gap-2 mb-4">
          {(Object.entries(countByType) as [keyof typeof ALERT_CONFIG, number][]).map(([type, count]) => {
            const cfg = ALERT_CONFIG[type];
            const Icon = cfg.icon;
            return (
              <div
                key={type}
                className="flex flex-col items-center gap-1 p-2 rounded-lg border text-center"
                style={{ backgroundColor: cfg.bg, borderColor: cfg.border }}
              >
                <Icon size={14} style={{ color: cfg.color }} />
                <span className="text-lg font-bold tabular-nums leading-none" style={{ color: cfg.color }}>
                  {count}
                </span>
                <span className="text-[9px] font-medium leading-tight" style={{ color: cfg.color }}>
                  {cfg.label}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Alert list */}
      <div className="space-y-2">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="flex items-start gap-3 p-3 rounded-lg border animate-pulse"
              style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--secondary) / 0.4)' }}
            >
              <div className="w-7 h-7 rounded-md shrink-0" style={{ backgroundColor: 'hsl(var(--secondary))' }} />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 rounded w-3/4" style={{ backgroundColor: 'hsl(var(--secondary))' }} />
                <div className="h-2.5 rounded w-full" style={{ backgroundColor: 'hsl(var(--secondary))' }} />
              </div>
            </div>
          ))
        ) : alerts.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center py-8 rounded-lg border"
            style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(142 69% 35% / 0.04)' }}
          >
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center mb-2"
              style={{ backgroundColor: 'hsl(142 69% 35% / 0.12)' }}
            >
              <AlertTriangle size={18} style={{ color: 'hsl(142 69% 30%)' }} />
            </div>
            <p className="text-sm font-medium" style={{ color: 'hsl(142 69% 28%)' }}>All systems normal</p>
            <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>No critical events detected</p>
          </div>
        ) : (
          alerts.slice(0, 8).map((alert) => {
            const cfg = ALERT_CONFIG[alert.type];
            const Icon = cfg.icon;
            return (
              <div
                key={alert.id}
                className="flex items-start gap-3 p-3 rounded-lg border transition-all duration-150 hover:shadow-sm"
                style={{ backgroundColor: cfg.bg, borderColor: cfg.border }}
              >
                <div
                  className="w-7 h-7 rounded-md flex items-center justify-center shrink-0 mt-0.5"
                  style={{ backgroundColor: cfg.badgeBg }}
                >
                  <Icon size={13} style={{ color: cfg.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold truncate" style={{ color: cfg.color }}>
                      {alert.title}
                    </p>
                    <span className="text-[10px] shrink-0" style={{ color: 'hsl(var(--muted-foreground))' }}>
                      {timeAgo(alert.timestamp)}
                    </span>
                  </div>
                  <p className="text-[11px] mt-0.5 leading-relaxed" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    {alert.description}
                  </p>
                </div>
                {alert.orderId && (
                  <Link
                    href={`/order-detail?id=${alert.orderId}`}
                    className="shrink-0 mt-0.5 p-1 rounded hover:bg-white/30 transition-colors"
                    title="View order"
                  >
                    <ChevronRight size={13} style={{ color: cfg.color }} />
                  </Link>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      {!loading && alerts.length > 0 && (
        <p className="text-[10px] mt-3 text-center" style={{ color: 'hsl(var(--muted-foreground))' }}>
          Last updated {lastRefreshed?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) ?? '—'} · Live via Supabase
        </p>
      )}
    </div>
  );
}
