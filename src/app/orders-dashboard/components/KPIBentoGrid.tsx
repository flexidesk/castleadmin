'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { TrendingUp, TrendingDown, AlertTriangle, Truck, CheckCircle2, CreditCard, PackageCheck, Calendar } from 'lucide-react';
import { ordersService, AppOrder } from '@/lib/services/ordersService';
import { createClient } from '@/lib/supabase/client';
import Icon from '@/components/ui/AppIcon';


interface KPICardProps {
  label: string;
  value: string | number;
  subtext?: string;
  icon: React.ElementType;
  trend?: { value: string; positive: boolean };
  variant?: 'default' | 'alert' | 'success' | 'warning' | 'accent';
  loading?: boolean;
}

function KPICard({ label, value, subtext, icon: Icon, trend, variant = 'default', loading }: KPICardProps) {
  const variantStyles = {
    default: {
      bg: 'hsl(var(--card))',
      border: 'hsl(var(--border))',
      iconBg: 'hsl(var(--secondary))',
      iconColor: 'hsl(var(--primary))',
      valueColor: 'hsl(var(--foreground))',
    },
    alert: {
      bg: 'hsl(0 84% 55% / 0.04)',
      border: 'hsl(0 84% 55% / 0.3)',
      iconBg: 'hsl(0 84% 55% / 0.1)',
      iconColor: 'hsl(0 84% 45%)',
      valueColor: 'hsl(0 84% 40%)',
    },
    success: {
      bg: 'hsl(142 69% 35% / 0.04)',
      border: 'hsl(142 69% 35% / 0.25)',
      iconBg: 'hsl(142 69% 35% / 0.1)',
      iconColor: 'hsl(142 69% 30%)',
      valueColor: 'hsl(142 69% 28%)',
    },
    warning: {
      bg: 'hsl(38 92% 50% / 0.05)',
      border: 'hsl(38 92% 50% / 0.3)',
      iconBg: 'hsl(38 92% 50% / 0.12)',
      iconColor: 'hsl(35 85% 35%)',
      valueColor: 'hsl(35 85% 32%)',
    },
    accent: {
      bg: 'hsl(213 79% 28% / 0.04)',
      border: 'hsl(213 79% 28% / 0.2)',
      iconBg: 'hsl(213 79% 28% / 0.1)',
      iconColor: 'hsl(213 79% 28%)',
      valueColor: 'hsl(213 79% 22%)',
    },
  };

  const s = variantStyles[variant];

  return (
    <div
      className="rounded-xl border p-5 flex flex-col gap-3 transition-all duration-150 hover:shadow-sm"
      style={{ backgroundColor: s.bg, borderColor: s.border }}
    >
      <div className="flex items-start justify-between">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
          style={{ backgroundColor: s.iconBg }}
        >
          <Icon size={18} style={{ color: s.iconColor }} />
        </div>
        {trend && !loading && (
          <div
            className="flex items-center gap-1 text-xs font-medium"
            style={{ color: trend.positive ? 'hsl(142 69% 30%)' : 'hsl(0 84% 45%)' }}
          >
            {trend.positive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {trend.value}
          </div>
        )}
      </div>

      <div>
        <p
          className="text-[11px] font-semibold uppercase tracking-wider mb-1"
          style={{ color: 'hsl(var(--muted-foreground))' }}
        >
          {label}
        </p>
        {loading ? (
          <div className="h-8 w-12 rounded animate-pulse" style={{ backgroundColor: 'hsl(var(--secondary))' }} />
        ) : (
          <p
            className="text-3xl font-bold tabular-nums leading-none"
            style={{ color: s.valueColor }}
          >
            {value}
          </p>
        )}
        {subtext && !loading && (
          <p className="text-xs mt-1.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
            {subtext}
          </p>
        )}
      </div>
    </div>
  );
}

export default function KPIBentoGrid() {
  const [orders, setOrders] = useState<AppOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const loadOrders = useCallback(async () => {
    const data = await ordersService.fetchAllOrders();
    setOrders(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadOrders();

    const supabase = createClient();
    const channel = supabase
      .channel('kpi_orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        loadOrders();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [loadOrders]);

  const { todayStr, tomorrowStr } = useMemo(() => {
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 86400000);
    return {
      todayStr: now.toISOString().split('T')[0],
      tomorrowStr: tomorrow.toISOString().split('T')[0],
    };
  }, [orders]);

  const todayOrders = orders.filter((o) => o.bookingDate === todayStr);
  const totalToday = todayOrders.length;
  const unassigned = todayOrders.filter((o) => o.status === 'Booking Accepted' && !o.driver).length;
  const outForDelivery = orders.filter((o) => o.status === 'Booking Out For Delivery').length;
  const completedToday = todayOrders.filter((o) => o.status === 'Booking Complete').length;
  const pendingPayment = orders.filter((o) => o.payment.status === 'Unpaid').length;
  const deliveryCount = todayOrders.filter((o) => o.type === 'Delivery').length;
  const collectionCount = todayOrders.filter((o) => o.type === 'Collection').length;
  const tomorrowCount = orders.filter((o) => o.bookingDate === tomorrowStr).length;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-6 gap-4">
      <KPICard
        label="Today's Bookings"
        value={totalToday}
        subtext={`${deliveryCount} delivery · ${collectionCount} collection`}
        icon={Calendar}
        variant="accent"
        trend={{ value: 'Live', positive: true }}
        loading={loading}
      />
      <KPICard
        label="Unassigned Bookings"
        value={unassigned}
        subtext="Need driver assignment now"
        icon={AlertTriangle}
        variant={unassigned > 0 ? 'alert' : 'success'}
        trend={unassigned > 0 ? { value: 'Action needed', positive: false } : undefined}
        loading={loading}
      />
      <KPICard
        label="Out For Delivery"
        value={outForDelivery}
        subtext="Active deliveries right now"
        icon={Truck}
        variant="warning"
        trend={{ value: 'Live', positive: true }}
        loading={loading}
      />
      <KPICard
        label="Completed Today"
        value={completedToday}
        subtext={`of ${totalToday} scheduled`}
        icon={CheckCircle2}
        variant="success"
        trend={{ value: `${Math.round((completedToday / Math.max(totalToday, 1)) * 100)}% rate`, positive: true }}
        loading={loading}
      />
      <KPICard
        label="Pending Payments"
        value={pendingPayment}
        subtext="Unpaid bookings total"
        icon={CreditCard}
        variant={pendingPayment > 2 ? 'alert' : 'default'}
        trend={pendingPayment > 0 ? { value: `${pendingPayment} to collect`, positive: false } : undefined}
        loading={loading}
      />
      <KPICard
        label="Tomorrow's Bookings"
        value={tomorrowCount}
        subtext="Pre-assigned bookings"
        icon={PackageCheck}
        variant="default"
        trend={{ value: 'Scheduled', positive: true }}
        loading={loading}
      />
    </div>
  );
}