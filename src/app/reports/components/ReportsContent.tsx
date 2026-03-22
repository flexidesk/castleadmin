'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend, AreaChart, Area,
} from 'recharts';
import { createClient } from '@/lib/supabase/client';
import { Download, Calendar, TrendingUp, TrendingDown, DollarSign, CheckCircle2, Clock, Truck, MapPin, RefreshCw,  } from 'lucide-react';
import Icon from '@/components/ui/AppIcon';


// ─── Types ────────────────────────────────────────────────────────────────────

interface RevenueByDate {
  date: string;
  label: string;
  revenue: number;
  orders: number;
  completed: number;
}

interface RevenueByDriver {
  driver_id: string;
  driver_name: string;
  total_orders: number;
  completed_orders: number;
  total_revenue: number;
  avg_revenue_per_order: number;
  avg_rating: number;
  completion_rate: number;
}

interface RevenueByZone {
  zone: string;
  total_orders: number;
  completed_orders: number;
  total_revenue: number;
  completion_rate: number;
}

interface DeliveryTimeTrend {
  date: string;
  avg_duration: number;
  deliveries: number;
}

interface SummaryKPI {
  totalRevenue: number;
  totalOrders: number;
  completedOrders: number;
  completionRate: number;
  avgDeliveryTime: number;
  revenueChange: number;
  ordersChange: number;
}

type TabKey = 'overview' | 'by-driver' | 'by-zone' | 'delivery-time';
type DateRange = '7d' | '30d' | '90d' | 'custom';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(n);
}

function fmtShort(n: number) {
  if (n >= 1000) return `£${(n / 1000).toFixed(1)}k`;
  return `£${Math.round(n)}`;
}

function getDateRange(range: DateRange, customFrom?: string, customTo?: string): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  if (range === '7d') from.setDate(to.getDate() - 6);
  else if (range === '30d') from.setDate(to.getDate() - 29);
  else if (range === '90d') from.setDate(to.getDate() - 89);
  else {
    return {
      from: customFrom ?? from.toISOString().split('T')[0],
      to: customTo ?? to.toISOString().split('T')[0],
    };
  }
  return { from: from.toISOString().split('T')[0], to: to.toISOString().split('T')[0] };
}

function exportCSV(filename: string, headers: string[], rows: (string | number)[][]) {
  const csvContent = [
    headers.join(','),
    ...rows.map((r) => r.map((v) => `"${v}"`).join(',')),
  ].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KPICard({
  label, value, subtext, icon: Icon, variant = 'default', trend,
}: {
  label: string; value: string | number; subtext?: string;
  icon: React.ElementType; variant?: 'default' | 'success' | 'warning' | 'accent' | 'purple';
  trend?: 'up' | 'down' | null;
}) {
  const styles: Record<string, { bg: string; border: string; iconBg: string; iconColor: string; valueColor: string }> = {
    default: { bg: 'hsl(var(--card))', border: 'hsl(var(--border))', iconBg: 'hsl(var(--secondary))', iconColor: 'hsl(var(--primary))', valueColor: 'hsl(var(--foreground))' },
    success: { bg: 'hsl(142 69% 35% / 0.04)', border: 'hsl(142 69% 35% / 0.25)', iconBg: 'hsl(142 69% 35% / 0.1)', iconColor: 'hsl(142 69% 30%)', valueColor: 'hsl(142 69% 28%)' },
    warning: { bg: 'hsl(38 92% 50% / 0.05)', border: 'hsl(38 92% 50% / 0.3)', iconBg: 'hsl(38 92% 50% / 0.12)', iconColor: 'hsl(35 85% 35%)', valueColor: 'hsl(35 85% 32%)' },
    accent: { bg: 'hsl(213 79% 28% / 0.04)', border: 'hsl(213 79% 28% / 0.2)', iconBg: 'hsl(213 79% 28% / 0.1)', iconColor: 'hsl(213 79% 28%)', valueColor: 'hsl(213 79% 22%)' },
    purple: { bg: 'hsl(270 60% 50% / 0.04)', border: 'hsl(270 60% 50% / 0.2)', iconBg: 'hsl(270 60% 50% / 0.1)', iconColor: 'hsl(270 60% 40%)', valueColor: 'hsl(270 60% 35%)' },
  };
  const s = styles[variant];
  return (
    <div className="rounded-xl border p-4 flex items-start gap-3" style={{ backgroundColor: s.bg, borderColor: s.border }}>
      <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: s.iconBg }}>
        <Icon size={18} style={{ color: s.iconColor }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium mb-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>{label}</p>
        <p className="text-xl font-bold leading-tight" style={{ color: s.valueColor }}>{value}</p>
        {subtext && (
          <div className="flex items-center gap-1 mt-0.5">
            {trend === 'up' && <TrendingUp size={11} className="text-green-600" />}
            {trend === 'down' && <TrendingDown size={11} className="text-red-500" />}
            <p className="text-[11px]" style={{ color: 'hsl(var(--muted-foreground))' }}>{subtext}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ReportsContent() {
  const supabase = createClient();

  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [dateRange, setDateRange] = useState<DateRange>('30d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [loading, setLoading] = useState(true);

  const [kpi, setKpi] = useState<SummaryKPI>({
    totalRevenue: 0, totalOrders: 0, completedOrders: 0,
    completionRate: 0, avgDeliveryTime: 0, revenueChange: 0, ordersChange: 0,
  });
  const [revenueByDate, setRevenueByDate] = useState<RevenueByDate[]>([]);
  const [revenueByDriver, setRevenueByDriver] = useState<RevenueByDriver[]>([]);
  const [revenueByZone, setRevenueByZone] = useState<RevenueByZone[]>([]);
  const [deliveryTimeTrend, setDeliveryTimeTrend] = useState<DeliveryTimeTrend[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { from, to } = getDateRange(dateRange, customFrom, customTo);

    try {
      // ── Revenue by date ──────────────────────────────────────────────────
      const { data: ordersRaw } = await supabase
        .from('orders')
        .select('booking_date, status, payment_amount, driver_id, delivery_address_postcode')
        .gte('booking_date', from)
        .lte('booking_date', to)
        .order('booking_date', { ascending: true });

      const orders = ordersRaw ?? [];

      // Build date map
      const dateMap: Record<string, RevenueByDate> = {};
      orders.forEach((o) => {
        const d = o.booking_date as string;
        if (!dateMap[d]) {
          const label = new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
          dateMap[d] = { date: d, label, revenue: 0, orders: 0, completed: 0 };
        }
        dateMap[d].orders += 1;
        dateMap[d].revenue += Number(o.payment_amount ?? 0);
        if (o.status === 'Booking Complete') dateMap[d].completed += 1;
      });
      setRevenueByDate(Object.values(dateMap));

      // ── KPIs ─────────────────────────────────────────────────────────────
      const totalRevenue = orders.reduce((s, o) => s + Number(o.payment_amount ?? 0), 0);
      const totalOrders = orders.length;
      const completedOrders = orders.filter((o) => o.status === 'Booking Complete').length;
      const completionRate = totalOrders > 0 ? Math.round((completedOrders / totalOrders) * 100) : 0;

      // Previous period for change %
      const days = Math.ceil((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1;
      const prevTo = new Date(from);
      prevTo.setDate(prevTo.getDate() - 1);
      const prevFrom = new Date(prevTo);
      prevFrom.setDate(prevFrom.getDate() - days + 1);

      const { data: prevOrders } = await supabase
        .from('orders')
        .select('payment_amount, status')
        .gte('booking_date', prevFrom.toISOString().split('T')[0])
        .lte('booking_date', prevTo.toISOString().split('T')[0]);

      const prevRevenue = (prevOrders ?? []).reduce((s, o) => s + Number(o.payment_amount ?? 0), 0);
      const prevCount = (prevOrders ?? []).length;
      const revenueChange = prevRevenue > 0 ? Math.round(((totalRevenue - prevRevenue) / prevRevenue) * 100) : 0;
      const ordersChange = prevCount > 0 ? Math.round(((totalOrders - prevCount) / prevCount) * 100) : 0;

      // ── Avg delivery time from performance logs ───────────────────────────
      const { data: perfLogs } = await supabase
        .from('driver_performance_logs')
        .select('delivery_date, duration_minutes, driver_id')
        .gte('delivery_date', from)
        .lte('delivery_date', to);

      const durations = (perfLogs ?? []).filter((l) => l.duration_minutes != null).map((l) => l.duration_minutes as number);
      const avgDeliveryTime = durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;

      setKpi({ totalRevenue, totalOrders, completedOrders, completionRate, avgDeliveryTime, revenueChange, ordersChange });

      // ── Revenue by driver ─────────────────────────────────────────────────
      const { data: driversRaw } = await supabase
        .from('driver_revenue_summary')
        .select('*');

      const driverMap: Record<string, RevenueByDriver> = {};
      orders.forEach((o) => {
        if (!o.driver_id) return;
        if (!driverMap[o.driver_id]) {
          const summary = (driversRaw ?? []).find((d) => d.driver_id === o.driver_id);
          driverMap[o.driver_id] = {
            driver_id: o.driver_id,
            driver_name: summary?.driver_name ?? 'Unknown',
            total_orders: 0,
            completed_orders: 0,
            total_revenue: 0,
            avg_revenue_per_order: 0,
            avg_rating: summary?.avg_rating ?? 0,
            completion_rate: 0,
          };
        }
        driverMap[o.driver_id].total_orders += 1;
        driverMap[o.driver_id].total_revenue += Number(o.payment_amount ?? 0);
        if (o.status === 'Booking Complete') driverMap[o.driver_id].completed_orders += 1;
      });
      const driverList = Object.values(driverMap).map((d) => ({
        ...d,
        avg_revenue_per_order: d.total_orders > 0 ? Math.round(d.total_revenue / d.total_orders) : 0,
        completion_rate: d.total_orders > 0 ? Math.round((d.completed_orders / d.total_orders) * 100) : 0,
      })).sort((a, b) => b.total_revenue - a.total_revenue);
      setRevenueByDriver(driverList);

      // ── Revenue by zone (postcode prefix) ────────────────────────────────
      const zoneMap: Record<string, RevenueByZone> = {};
      orders.forEach((o) => {
        const raw = (o.delivery_address_postcode as string | null) ?? '';
        const zone = raw.trim().split(' ')[0] || 'Unknown';
        if (!zoneMap[zone]) {
          zoneMap[zone] = { zone, total_orders: 0, completed_orders: 0, total_revenue: 0, completion_rate: 0 };
        }
        zoneMap[zone].total_orders += 1;
        zoneMap[zone].total_revenue += Number(o.payment_amount ?? 0);
        if (o.status === 'Booking Complete') zoneMap[zone].completed_orders += 1;
      });
      const zoneList = Object.values(zoneMap).map((z) => ({
        ...z,
        completion_rate: z.total_orders > 0 ? Math.round((z.completed_orders / z.total_orders) * 100) : 0,
      })).sort((a, b) => b.total_revenue - a.total_revenue).slice(0, 15);
      setRevenueByZone(zoneList);

      // ── Delivery time trend ───────────────────────────────────────────────
      const trendMap: Record<string, { durations: number[]; count: number }> = {};
      (perfLogs ?? []).forEach((l) => {
        const d = l.delivery_date as string;
        if (!trendMap[d]) trendMap[d] = { durations: [], count: 0 };
        trendMap[d].count += 1;
        if (l.duration_minutes != null) trendMap[d].durations.push(l.duration_minutes as number);
      });
      const trendList: DeliveryTimeTrend[] = Object.entries(trendMap)
        .map(([date, v]) => ({
          date: new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
          avg_duration: v.durations.length > 0 ? Math.round(v.durations.reduce((a, b) => a + b, 0) / v.durations.length) : 0,
          deliveries: v.count,
        }))
        .sort((a, b) => a.date.localeCompare(b.date));
      setDeliveryTimeTrend(trendList);
    } catch (err) {
      console.error('Reports fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [dateRange, customFrom, customTo]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── CSV Exports ──────────────────────────────────────────────────────────────

  const handleExportOverview = () => {
    exportCSV('revenue-by-date.csv',
      ['Date', 'Revenue (£)', 'Total Orders', 'Completed Orders', 'Completion Rate (%)'],
      revenueByDate.map((r) => [
        r.date, r.revenue.toFixed(2), r.orders, r.completed,
        r.orders > 0 ? Math.round((r.completed / r.orders) * 100) : 0,
      ])
    );
  };

  const handleExportDrivers = () => {
    exportCSV('revenue-by-driver.csv',
      ['Driver', 'Total Orders', 'Completed', 'Completion Rate (%)', 'Total Revenue (£)', 'Avg Revenue/Order (£)', 'Avg Rating'],
      revenueByDriver.map((d) => [
        d.driver_name, d.total_orders, d.completed_orders, d.completion_rate,
        d.total_revenue.toFixed(2), d.avg_revenue_per_order.toFixed(2), d.avg_rating.toFixed(1),
      ])
    );
  };

  const handleExportZones = () => {
    exportCSV('revenue-by-zone.csv',
      ['Zone', 'Total Orders', 'Completed', 'Completion Rate (%)', 'Total Revenue (£)'],
      revenueByZone.map((z) => [
        z.zone, z.total_orders, z.completed_orders, z.completion_rate, z.total_revenue.toFixed(2),
      ])
    );
  };

  const handleExportDeliveryTime = () => {
    exportCSV('delivery-time-trend.csv',
      ['Date', 'Avg Delivery Time (min)', 'Deliveries'],
      deliveryTimeTrend.map((t) => [t.date, t.avg_duration, t.deliveries])
    );
  };

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'overview', label: 'Revenue Overview' },
    { key: 'by-driver', label: 'By Driver' },
    { key: 'by-zone', label: 'By Zone' },
    { key: 'delivery-time', label: 'Delivery Time' },
  ];

  const exportHandlers: Record<TabKey, () => void> = {
    'overview': handleExportOverview,
    'by-driver': handleExportDrivers,
    'by-zone': handleExportZones,
    'delivery-time': handleExportDeliveryTime,
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'hsl(var(--foreground))' }}>Reports</h1>
          <p className="text-sm mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Revenue breakdowns, completion rates, delivery trends, and driver performance
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Date range selector */}
          <div className="flex items-center gap-1 rounded-lg border p-1" style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--card))' }}>
            {(['7d', '30d', '90d'] as DateRange[]).map((r) => (
              <button
                key={r}
                onClick={() => setDateRange(r)}
                className="px-3 py-1.5 rounded-md text-xs font-medium transition-all"
                style={{
                  backgroundColor: dateRange === r ? 'hsl(var(--primary))' : 'transparent',
                  color: dateRange === r ? 'white' : 'hsl(var(--muted-foreground))',
                }}
              >
                {r === '7d' ? '7 Days' : r === '30d' ? '30 Days' : '90 Days'}
              </button>
            ))}
            <button
              onClick={() => setDateRange('custom')}
              className="px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1"
              style={{
                backgroundColor: dateRange === 'custom' ? 'hsl(var(--primary))' : 'transparent',
                color: dateRange === 'custom' ? 'white' : 'hsl(var(--muted-foreground))',
              }}
            >
              <Calendar size={12} /> Custom
            </button>
          </div>
          {dateRange === 'custom' && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="text-xs border rounded-lg px-2 py-1.5"
                style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--card))', color: 'hsl(var(--foreground))' }}
              />
              <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>to</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="text-xs border rounded-lg px-2 py-1.5"
                style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--card))', color: 'hsl(var(--foreground))' }}
              />
            </div>
          )}
          <button
            onClick={fetchData}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-all hover:bg-secondary"
            style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          <button
            onClick={exportHandlers[activeTab]}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all"
            style={{ backgroundColor: 'hsl(var(--primary))', color: 'white' }}
          >
            <Download size={13} /> Export CSV
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          label="Total Revenue"
          value={fmt(kpi.totalRevenue)}
          subtext={`${kpi.revenueChange >= 0 ? '+' : ''}${kpi.revenueChange}% vs prev period`}
          icon={DollarSign}
          variant="accent"
          trend={kpi.revenueChange >= 0 ? 'up' : 'down'}
        />
        <KPICard
          label="Total Orders"
          value={kpi.totalOrders.toLocaleString()}
          subtext={`${kpi.ordersChange >= 0 ? '+' : ''}${kpi.ordersChange}% vs prev period`}
          icon={Truck}
          variant="default"
          trend={kpi.ordersChange >= 0 ? 'up' : 'down'}
        />
        <KPICard
          label="Completion Rate"
          value={`${kpi.completionRate}%`}
          subtext={`${kpi.completedOrders} of ${kpi.totalOrders} completed`}
          icon={CheckCircle2}
          variant="success"
        />
        <KPICard
          label="Avg Delivery Time"
          value={kpi.avgDeliveryTime > 0 ? `${kpi.avgDeliveryTime} min` : 'N/A'}
          subtext="Based on performance logs"
          icon={Clock}
          variant="warning"
        />
      </div>

      {/* Tabs */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--card))' }}>
        <div className="flex border-b overflow-x-auto" style={{ borderColor: 'hsl(var(--border))' }}>
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className="px-5 py-3.5 text-sm font-medium whitespace-nowrap transition-all border-b-2"
              style={{
                borderBottomColor: activeTab === t.key ? 'hsl(var(--primary))' : 'transparent',
                color: activeTab === t.key ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-5">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="flex flex-col items-center gap-3">
                <RefreshCw size={24} className="animate-spin" style={{ color: 'hsl(var(--primary))' }} />
                <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>Loading report data…</p>
              </div>
            </div>
          ) : (
            <>
              {/* ── Overview Tab ─────────────────────────────────────────── */}
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-sm font-semibold mb-4" style={{ color: 'hsl(var(--foreground))' }}>Revenue by Date</h3>
                    {revenueByDate.length === 0 ? (
                      <EmptyState message="No revenue data for this period" />
                    ) : (
                      <ResponsiveContainer width="100%" height={260}>
                        <AreaChart data={revenueByDate} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                          <defs>
                            <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="hsl(213 79% 28%)" stopOpacity={0.15} />
                              <stop offset="95%" stopColor="hsl(213 79% 28%)" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} />
                          <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} />
                          <Tooltip
                            formatter={(v: number) => [fmt(v), 'Revenue']}
                            contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                          />
                          <Area type="monotone" dataKey="revenue" stroke="hsl(213 79% 28%)" strokeWidth={2} fill="url(#revGrad)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    )}
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold mb-4" style={{ color: 'hsl(var(--foreground))' }}>Order Completion Rate by Date</h3>
                    {revenueByDate.length === 0 ? (
                      <EmptyState message="No order data for this period" />
                    ) : (
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={revenueByDate.map((r) => ({
                          ...r,
                          completion_rate: r.orders > 0 ? Math.round((r.completed / r.orders) * 100) : 0,
                        }))} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} />
                          <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} />
                          <Tooltip
                            formatter={(v: number) => [`${v}%`, 'Completion Rate']}
                            contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                          />
                          <Bar dataKey="completion_rate" fill="hsl(142 69% 35%)" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>
              )}

              {/* ── By Driver Tab ─────────────────────────────────────────── */}
              {activeTab === 'by-driver' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-sm font-semibold mb-4" style={{ color: 'hsl(var(--foreground))' }}>Revenue by Driver</h3>
                    {revenueByDriver.length === 0 ? (
                      <EmptyState message="No driver revenue data for this period" />
                    ) : (
                      <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={revenueByDriver.slice(0, 10)} layout="vertical" margin={{ top: 4, right: 16, left: 80, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                          <XAxis type="number" tickFormatter={fmtShort} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} />
                          <YAxis type="category" dataKey="driver_name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} width={80} />
                          <Tooltip
                            formatter={(v: number) => [fmt(v), 'Revenue']}
                            contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                          />
                          <Bar dataKey="total_revenue" fill="hsl(213 79% 28%)" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>

                  {/* Driver performance table */}
                  <div>
                    <h3 className="text-sm font-semibold mb-3" style={{ color: 'hsl(var(--foreground))' }}>Driver Performance Metrics</h3>
                    {revenueByDriver.length === 0 ? (
                      <EmptyState message="No driver data for this period" />
                    ) : (
                      <div className="overflow-x-auto rounded-lg border" style={{ borderColor: 'hsl(var(--border))' }}>
                        <table className="w-full text-sm">
                          <thead>
                            <tr style={{ backgroundColor: 'hsl(var(--secondary))' }}>
                              {['Driver', 'Orders', 'Completed', 'Completion Rate', 'Revenue', 'Avg/Order', 'Avg Rating'].map((h) => (
                                <th key={h} className="text-left px-4 py-3 text-xs font-semibold" style={{ color: 'hsl(var(--muted-foreground))' }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {revenueByDriver.map((d, i) => (
                              <tr key={d.driver_id} className="border-t" style={{ borderColor: 'hsl(var(--border))', backgroundColor: i % 2 === 0 ? 'transparent' : 'hsl(var(--secondary) / 0.3)' }}>
                                <td className="px-4 py-3 font-medium" style={{ color: 'hsl(var(--foreground))' }}>{d.driver_name}</td>
                                <td className="px-4 py-3" style={{ color: 'hsl(var(--muted-foreground))' }}>{d.total_orders}</td>
                                <td className="px-4 py-3" style={{ color: 'hsl(var(--muted-foreground))' }}>{d.completed_orders}</td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2">
                                    <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'hsl(var(--border))' }}>
                                      <div className="h-full rounded-full" style={{ width: `${d.completion_rate}%`, backgroundColor: d.completion_rate >= 80 ? 'hsl(142 69% 35%)' : d.completion_rate >= 60 ? 'hsl(38 92% 50%)' : 'hsl(var(--destructive))' }} />
                                    </div>
                                    <span className="text-xs font-medium" style={{ color: 'hsl(var(--foreground))' }}>{d.completion_rate}%</span>
                                  </div>
                                </td>
                                <td className="px-4 py-3 font-semibold" style={{ color: 'hsl(var(--foreground))' }}>{fmt(d.total_revenue)}</td>
                                <td className="px-4 py-3" style={{ color: 'hsl(var(--muted-foreground))' }}>{fmt(d.avg_revenue_per_order)}</td>
                                <td className="px-4 py-3">
                                  <span className="flex items-center gap-1 text-xs font-medium" style={{ color: 'hsl(38 92% 40%)' }}>
                                    ★ {d.avg_rating > 0 ? d.avg_rating.toFixed(1) : '—'}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── By Zone Tab ───────────────────────────────────────────── */}
              {activeTab === 'by-zone' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-sm font-semibold mb-4" style={{ color: 'hsl(var(--foreground))' }}>Revenue by Zone (Postcode Area)</h3>
                    {revenueByZone.length === 0 ? (
                      <EmptyState message="No zone data for this period" />
                    ) : (
                      <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={revenueByZone} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="zone" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} />
                          <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} />
                          <Tooltip
                            formatter={(v: number, name: string) => [name === 'total_revenue' ? fmt(v) : v, name === 'total_revenue' ? 'Revenue' : 'Orders']}
                            contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                          />
                          <Legend formatter={(v) => v === 'total_revenue' ? 'Revenue' : 'Orders'} />
                          <Bar dataKey="total_revenue" fill="hsl(213 79% 28%)" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="total_orders" fill="hsl(213 79% 28% / 0.3)" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>

                  {revenueByZone.length > 0 && (
                    <div className="overflow-x-auto rounded-lg border" style={{ borderColor: 'hsl(var(--border))' }}>
                      <table className="w-full text-sm">
                        <thead>
                          <tr style={{ backgroundColor: 'hsl(var(--secondary))' }}>
                            {['Zone', 'Total Orders', 'Completed', 'Completion Rate', 'Total Revenue'].map((h) => (
                              <th key={h} className="text-left px-4 py-3 text-xs font-semibold" style={{ color: 'hsl(var(--muted-foreground))' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {revenueByZone.map((z, i) => (
                            <tr key={z.zone} className="border-t" style={{ borderColor: 'hsl(var(--border))', backgroundColor: i % 2 === 0 ? 'transparent' : 'hsl(var(--secondary) / 0.3)' }}>
                              <td className="px-4 py-3 font-medium flex items-center gap-2" style={{ color: 'hsl(var(--foreground))' }}>
                                <MapPin size={13} style={{ color: 'hsl(var(--primary))' }} />{z.zone}
                              </td>
                              <td className="px-4 py-3" style={{ color: 'hsl(var(--muted-foreground))' }}>{z.total_orders}</td>
                              <td className="px-4 py-3" style={{ color: 'hsl(var(--muted-foreground))' }}>{z.completed_orders}</td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'hsl(var(--border))' }}>
                                    <div className="h-full rounded-full" style={{ width: `${z.completion_rate}%`, backgroundColor: z.completion_rate >= 80 ? 'hsl(142 69% 35%)' : z.completion_rate >= 60 ? 'hsl(38 92% 50%)' : 'hsl(var(--destructive))' }} />
                                  </div>
                                  <span className="text-xs font-medium" style={{ color: 'hsl(var(--foreground))' }}>{z.completion_rate}%</span>
                                </div>
                              </td>
                              <td className="px-4 py-3 font-semibold" style={{ color: 'hsl(var(--foreground))' }}>{fmt(z.total_revenue)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* ── Delivery Time Tab ─────────────────────────────────────── */}
              {activeTab === 'delivery-time' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-sm font-semibold mb-4" style={{ color: 'hsl(var(--foreground))' }}>Average Delivery Time Trend (minutes)</h3>
                    {deliveryTimeTrend.length === 0 ? (
                      <EmptyState message="No delivery time data for this period" />
                    ) : (
                      <ResponsiveContainer width="100%" height={260}>
                        <LineChart data={deliveryTimeTrend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} />
                          <YAxis tickFormatter={(v) => `${v}m`} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} />
                          <Tooltip
                            formatter={(v: number, name: string) => [name === 'avg_duration' ? `${v} min` : v, name === 'avg_duration' ? 'Avg Duration' : 'Deliveries']}
                            contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                          />
                          <Legend formatter={(v) => v === 'avg_duration' ? 'Avg Duration (min)' : 'Deliveries'} />
                          <Line type="monotone" dataKey="avg_duration" stroke="hsl(38 92% 45%)" strokeWidth={2} dot={false} />
                          <Line type="monotone" dataKey="deliveries" stroke="hsl(213 79% 28%)" strokeWidth={2} dot={false} strokeDasharray="4 2" />
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                  </div>

                  {deliveryTimeTrend.length > 0 && (
                    <div className="grid grid-cols-3 gap-4">
                      {[
                        { label: 'Fastest Day', value: `${Math.min(...deliveryTimeTrend.filter(t => t.avg_duration > 0).map(t => t.avg_duration))} min`, icon: TrendingUp, color: 'hsl(142 69% 30%)' },
                        { label: 'Slowest Day', value: `${Math.max(...deliveryTimeTrend.map(t => t.avg_duration))} min`, icon: TrendingDown, color: 'hsl(var(--destructive))' },
                        { label: 'Overall Average', value: `${Math.round(deliveryTimeTrend.filter(t => t.avg_duration > 0).reduce((s, t) => s + t.avg_duration, 0) / (deliveryTimeTrend.filter(t => t.avg_duration > 0).length || 1))} min`, icon: Clock, color: 'hsl(38 92% 40%)' },
                      ].map((stat) => (
                        <div key={stat.label} className="rounded-xl border p-4 flex items-center gap-3" style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--card))' }}>
                          <stat.icon size={20} style={{ color: stat.color }} />
                          <div>
                            <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>{stat.label}</p>
                            <p className="text-lg font-bold" style={{ color: 'hsl(var(--foreground))' }}>{stat.value}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-40 rounded-lg border border-dashed" style={{ borderColor: 'hsl(var(--border))' }}>
      <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>{message}</p>
    </div>
  );
}
