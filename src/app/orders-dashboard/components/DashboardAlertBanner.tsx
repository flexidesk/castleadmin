'use client';

import { useEffect, useState, useCallback } from 'react';
import { AlertTriangle, Clock, CreditCard, UserX, X, ChevronRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';


interface AlertCounts {
  overdueDeliveries: number;
  pendingPayments: number;
  unassignedOrders: number;
}

interface DashboardAlertBannerProps {
  onCountChange?: (total: number) => void;
}

export default function DashboardAlertBanner({ onCountChange }: DashboardAlertBannerProps) {
  const [counts, setCounts] = useState<AlertCounts>({ overdueDeliveries: 0, pendingPayments: 0, unassignedOrders: 0 });
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  const fetchCounts = useCallback(async () => {
    const supabase = createClient();
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    // 1. Overdue deliveries — Out For Delivery where window has passed
    const { data: activeOrders } = await supabase
      .from('orders')
      .select('id, delivery_window, booking_date')
      .eq('status', 'Booking Out For Delivery')
      .lte('booking_date', todayStr);

    let overdueCount = 0;
    if (activeOrders) {
      for (const order of activeOrders) {
        const windowMatch = order.delivery_window?.match(/(\d{2}:\d{2})\s*$/);
        if (windowMatch) {
          const [endHour, endMin] = windowMatch[1].split(':').map(Number);
          const windowEnd = new Date(order.booking_date);
          windowEnd.setHours(endHour, endMin, 0, 0);
          if (now > windowEnd) overdueCount++;
        }
      }
    }

    // 2. Pending payments — active orders with Unpaid payment status
    const { count: pendingCount } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('payment_status', 'Unpaid')
      .not('status', 'eq', 'Booking Cancelled')
      .not('status', 'eq', 'Booking Complete');

    // 3. Unassigned orders — active orders with no driver assigned
    const { count: unassignedCount } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .is('driver_id', null)
      .not('status', 'eq', 'Booking Cancelled')
      .not('status', 'eq', 'Booking Complete');

    const newCounts: AlertCounts = {
      overdueDeliveries: overdueCount,
      pendingPayments: pendingCount ?? 0,
      unassignedOrders: unassignedCount ?? 0,
    };

    setCounts(newCounts);
    onCountChange?.(newCounts.overdueDeliveries + newCounts.pendingPayments + newCounts.unassignedOrders);
    setLoading(false);
  }, [onCountChange]);

  useEffect(() => {
    fetchCounts();

    const supabase = createClient();
    const channel = supabase
      .channel('dashboard_alert_banner')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        setDismissed(false);
        fetchCounts();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchCounts]);

  const total = counts.overdueDeliveries + counts.pendingPayments + counts.unassignedOrders;

  if (loading || total === 0 || dismissed) return null;

  const items = [
    {
      key: 'overdue',
      count: counts.overdueDeliveries,
      icon: Clock,
      label: 'overdue deliver' + (counts.overdueDeliveries === 1 ? 'y' : 'ies'),
      color: 'hsl(0 84% 45%)',
      bg: 'hsl(0 84% 55% / 0.08)',
      href: '/orders-dashboard',
    },
    {
      key: 'pending',
      count: counts.pendingPayments,
      icon: CreditCard,
      label: 'pending payment' + (counts.pendingPayments === 1 ? '' : 's'),
      color: 'hsl(35 85% 35%)',
      bg: 'hsl(38 92% 50% / 0.08)',
      href: '/orders-dashboard',
    },
    {
      key: 'unassigned',
      count: counts.unassignedOrders,
      icon: UserX,
      label: 'unassigned order' + (counts.unassignedOrders === 1 ? '' : 's'),
      color: 'hsl(217 91% 40%)',
      bg: 'hsl(217 91% 60% / 0.08)',
      href: '/orders-dashboard',
    },
  ].filter((item) => item.count > 0);

  const hasCritical = counts.overdueDeliveries > 0;
  const bannerBg = hasCritical ? 'hsl(0 84% 55% / 0.06)' : 'hsl(38 92% 50% / 0.06)';
  const bannerBorder = hasCritical ? 'hsl(0 84% 55% / 0.25)' : 'hsl(38 92% 50% / 0.25)';
  const iconColor = hasCritical ? 'hsl(0 84% 45%)' : 'hsl(35 85% 35%)';
  const iconBg = hasCritical ? 'hsl(0 84% 55% / 0.12)' : 'hsl(38 92% 50% / 0.12)';

  return (
    <div
      className="flex items-start gap-3 px-4 py-3 rounded-xl border"
      style={{ backgroundColor: bannerBg, borderColor: bannerBorder }}
      role="alert"
      aria-live="polite"
    >
      {/* Icon */}
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
        style={{ backgroundColor: iconBg }}
      >
        <AlertTriangle size={16} style={{ color: iconColor }} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
          {total} action{total !== 1 ? 's' : ''} require{total === 1 ? 's' : ''} attention
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-1.5">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.key}
                href={item.href}
                className="flex items-center gap-1.5 group"
              >
                <span
                  className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold transition-opacity group-hover:opacity-80"
                  style={{ backgroundColor: item.bg, color: item.color }}
                >
                  <Icon size={11} />
                  {item.count} {item.label}
                </span>
                <ChevronRight size={11} className="opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: item.color }} />
              </Link>
            );
          })}
        </div>
      </div>

      {/* Dismiss */}
      <button
        onClick={() => setDismissed(true)}
        className="p-1.5 rounded-md transition-colors hover:bg-black/5 shrink-0"
        title="Dismiss banner"
        aria-label="Dismiss alert banner"
      >
        <X size={14} style={{ color: 'hsl(var(--muted-foreground))' }} />
      </button>
    </div>
  );
}
