'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend, AreaChart, Area, TooltipProps,
} from 'recharts';
import { createClient } from '@/lib/supabase/client';
import { TrendingUp, TrendingDown, Star, CheckCircle2, Truck, DollarSign, Users,  } from 'lucide-react';
import Icon from '@/components/ui/AppIcon';


// ─── Types ────────────────────────────────────────────────────────────────────

interface DriverRevenue {
  driver_id: string;
  driver_name: string;
  vehicle: string;
  plate: string;
  status: string;
  total_orders: number;
  completed_orders: number;
  total_revenue: number;
  avg_revenue_per_order: number;
  avg_rating: number;
}

interface FleetUtilDay {
  date: string;
  active_drivers: number;
  total_drivers: number;
  total_orders: number;
  completed_orders: number;
  total_revenue: number;
}

interface PerfLog {
  driver_id: string;
  delivery_date: string;
  was_successful: boolean;
  customer_rating: number | null;
}

interface DriverPerfSummary {
  driver_id: string;
  driver_name: string;
  deliveries: number;
  on_time_rate: number;
  avg_rating: number;
  revenue: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(n);
}

function fmtShort(n: number) {
  if (n >= 1000) return `£${(n / 1000).toFixed(1)}k`;
  return `£${Math.round(n)}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

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
    <div className="rounded-xl border p-5 flex flex-col gap-3" style={{ backgroundColor: s.bg, borderColor: s.border }}>
      <div className="flex items-start justify-between">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: s.iconBg }}>
          <Icon size={18} style={{ color: s.iconColor }} />
        </div>
        {trend && (
          <div className="flex items-center gap-1">
            {trend === 'up'
              ? <TrendingUp size={13} style={{ color: 'hsl(142 69% 35%)' }} />
              : <TrendingDown size={13} style={{ color: 'hsl(0 84% 55%)' }} />}
          </div>
        )}
      </div>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>{label}</p>
        <p className="text-3xl font-bold tabular-nums leading-none" style={{ color: s.valueColor }}>{value}</p>
        {subtext && <p className="text-xs mt-1.5" style={{ color: 'hsl(var(--muted-foreground))' }}>{subtext}</p>}
      </div>
    </div>
  );
}

function CustomTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  return (
    <div className="card shadow-lg p-3 text-xs min-w-[160px]" style={{ border: '1px solid hsl(var(--border))' }}>
      <p className="font-semibold mb-2 text-sm">{label}</p>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4 py-0.5">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: p.color }} />
            <span style={{ color: 'hsl(var(--muted-foreground))' }}>{p.name}</span>
          </div>
          <span className="font-semibold tabular-nums">
            {String(p.dataKey).includes('revenue') || String(p.dataKey).includes('Revenue')
              ? fmtShort(Number(p.value))
              : String(p.dataKey).includes('rate') || String(p.dataKey).includes('utilization')
              ? `${p.value}%`
              : p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function StarRating({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          size={11}
          fill={s <= Math.round(value) ? 'hsl(38 92% 50%)' : 'none'}
          style={{ color: s <= Math.round(value) ? 'hsl(38 92% 50%)' : 'hsl(var(--border))' }}
        />
      ))}
      <span className="ml-1 text-xs font-semibold tabular-nums" style={{ color: 'hsl(var(--foreground))' }}>
        {value > 0 ? value.toFixed(1) : '—'}
      </span>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AnalyticsContent() {
  const [driverRevenue, setDriverRevenue] = useState<DriverRevenue[]>([]);
  const [fleetUtil, setFleetUtil] = useState<FleetUtilDay[]>([]);
  const [perfLogs, setPerfLogs] = useState<PerfLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d'>('30d');

  const loadData = useCallback(async () => {
    const supabase = createClient();

    const days = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90;
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString().split('T')[0];

    const [revRes, utilRes, perfRes] = await Promise.all([
      supabase.from('driver_revenue_summary').select('*'),
      supabase
        .from('fleet_utilization_daily')
        .select('*')
        .gte('date', sinceStr)
        .order('date', { ascending: true }),
      supabase
        .from('driver_performance_logs')
        .select('driver_id, delivery_date, was_successful, customer_rating')
        .gte('delivery_date', sinceStr),
    ]);

    setDriverRevenue((revRes.data as DriverRevenue[]) ?? []);
    setFleetUtil((utilRes.data as FleetUtilDay[]) ?? []);
    setPerfLogs((perfRes.data as PerfLog[]) ?? []);
    setLoading(false);
  }, [dateRange]);

  useEffect(() => {
    loadData();
    const supabase = createClient();
    const channel = supabase
      .channel('analytics_live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_performance_logs' }, loadData)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadData]);

  // ── Derived data ──────────────────────────────────────────────────────────

  // Fleet utilization % per day
  const utilizationTrend = fleetUtil.map((d) => ({
    date: new Date(d.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
    utilization: d.total_drivers > 0 ? Math.round((d.active_drivers / d.total_drivers) * 100) : 0,
    orders: d.total_orders,
    revenue: Number(d.total_revenue),
  }));

  // Revenue trend per day
  const revenueTrend = fleetUtil.map((d) => ({
    date: new Date(d.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
    revenue: Number(d.total_revenue),
    completed: d.completed_orders,
  }));

  // Driver performance summary (merge perf logs + revenue)
  const driverPerfSummary: DriverPerfSummary[] = driverRevenue.map((dr) => {
    const logs = perfLogs.filter((l) => l.driver_id === dr.driver_id);
    const total = logs.length;
    const successful = logs.filter((l) => l.was_successful).length;
    const ratings = logs.filter((l) => l.customer_rating != null).map((l) => l.customer_rating as number);
    return {
      driver_id: dr.driver_id,
      driver_name: dr.driver_name,
      deliveries: dr.completed_orders,
      on_time_rate: total > 0 ? Math.round((successful / total) * 100) : 0,
      avg_rating: ratings.length > 0 ? parseFloat((ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1)) : 0,
      revenue: Number(dr.total_revenue),
    };
  }).sort((a, b) => b.revenue - a.revenue);

  // Top-level KPIs
  const totalRevenue = driverRevenue.reduce((s, d) => s + Number(d.total_revenue), 0);
  const totalDeliveries = driverRevenue.reduce((s, d) => s + d.completed_orders, 0);
  const avgUtilization = utilizationTrend.length > 0
    ? Math.round(utilizationTrend.reduce((s, d) => s + d.utilization, 0) / utilizationTrend.length)
    : 0;
  const fleetAvgRating = driverRevenue.filter((d) => d.avg_rating > 0).length > 0
    ? parseFloat((driverRevenue.filter((d) => d.avg_rating > 0).reduce((s, d) => s + Number(d.avg_rating), 0) / driverRevenue.filter((d) => d.avg_rating > 0).length).toFixed(1))
    : 0;

  // Revenue per driver bar chart data (top 8)
  const revenueBarData = [...driverRevenue]
    .sort((a, b) => Number(b.total_revenue) - Number(a.total_revenue))
    .slice(0, 8)
    .map((d) => ({
      name: d.driver_name.split(' ')[0],
      revenue: Number(d.total_revenue),
      orders: d.completed_orders,
    }));

  const statusColor: Record<string, string> = {
    Available: 'hsl(142 69% 35%)',
    'On Route': 'hsl(24 95% 53%)',
    'Off Duty': 'hsl(var(--muted-foreground))',
  };
  const statusBg: Record<string, string> = {
    Available: 'hsl(142 69% 35% / 0.1)',
    'On Route': 'hsl(24 95% 53% / 0.1)',
    'Off Duty': 'hsl(var(--muted) / 0.5)',
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'hsl(var(--primary))' }} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold" style={{ color: 'hsl(var(--foreground))' }}>Analytics</h2>
          <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Driver performance, revenue, and fleet utilization
          </p>
        </div>
        <div className="flex items-center gap-1 p-1 rounded-lg" style={{ backgroundColor: 'hsl(var(--secondary))' }}>
          {(['7d', '30d', '90d'] as const).map((r) => (
            <button
              key={r}
              onClick={() => setDateRange(r)}
              className="px-3 py-1.5 rounded-md text-xs font-semibold transition-all"
              style={{
                backgroundColor: dateRange === r ? 'hsl(var(--card))' : 'transparent',
                color: dateRange === r ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))',
                boxShadow: dateRange === r ? '0 1px 3px hsl(var(--border))' : 'none',
              }}
            >
              {r === '7d' ? '7 Days' : r === '30d' ? '30 Days' : '90 Days'}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard label="Total Revenue" value={fmt(totalRevenue)} subtext="All drivers combined" icon={DollarSign} variant="success" />
        <KPICard label="Deliveries Completed" value={totalDeliveries} subtext="Successful completions" icon={CheckCircle2} variant="accent" />
        <KPICard label="Fleet Utilization" value={`${avgUtilization}%`} subtext="Avg active drivers/day" icon={Truck} variant="warning" />
        <KPICard label="Avg Customer Rating" value={fleetAvgRating > 0 ? fleetAvgRating.toFixed(1) : '—'} subtext="Out of 5 stars" icon={Star} variant="purple" />
      </div>

      {/* Charts Row 1: Revenue trend + Fleet utilization */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Revenue Trend */}
        <div className="card p-5">
          <div className="mb-5">
            <h3 className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>Revenue Trend</h3>
            <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>Daily revenue across all drivers</p>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={revenueTrend} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(142 69% 35%)" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="hsl(142 69% 35%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} interval={Math.floor(revenueTrend.length / 6)} />
              <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={fmtShort} />
              <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'hsl(var(--border))' }} />
              <Area type="monotone" dataKey="revenue" name="Revenue" stroke="hsl(142 69% 35%)" strokeWidth={2} fill="url(#revenueGrad)" dot={false} activeDot={{ r: 4 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Fleet Utilization Trend */}
        <div className="card p-5">
          <div className="mb-5">
            <h3 className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>Fleet Utilization</h3>
            <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>% of drivers active each day</p>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={utilizationTrend} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} interval={Math.floor(utilizationTrend.length / 6)} />
              <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
              <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'hsl(var(--border))' }} />
              <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
              <Line type="monotone" dataKey="utilization" name="Utilization %" stroke="hsl(213 79% 28%)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              <Line type="monotone" dataKey="orders" name="Orders" stroke="hsl(38 92% 50%)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} strokeDasharray="4 2" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Revenue per Driver Bar Chart */}
      <div className="card p-5">
        <div className="mb-5">
          <h3 className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>Revenue per Driver</h3>
          <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>Top drivers by total revenue generated</p>
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={revenueBarData} margin={{ top: 4, right: 4, left: -10, bottom: 0 }} barSize={28} barCategoryGap="30%">
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={fmtShort} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--secondary))' }} />
            <Bar dataKey="revenue" name="Revenue" fill="hsl(213 79% 28% / 0.8)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Driver Performance Table */}
      <div className="card p-0 overflow-hidden">
        <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: 'hsl(var(--border))' }}>
          <div>
            <h3 className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>Driver Performance Metrics</h3>
            <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>Deliveries completed, on-time rate, customer ratings, and revenue</p>
          </div>
          <div className="flex items-center gap-1.5">
            <Users size={14} style={{ color: 'hsl(var(--muted-foreground))' }} />
            <span className="text-xs font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>{driverPerfSummary.length} drivers</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: 'hsl(var(--secondary) / 0.5)', borderBottom: '1px solid hsl(var(--border))' }}>
                <th className="text-left px-5 py-3 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'hsl(var(--muted-foreground))' }}>Driver</th>
                <th className="text-right px-4 py-3 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'hsl(var(--muted-foreground))' }}>Deliveries</th>
                <th className="text-right px-4 py-3 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'hsl(var(--muted-foreground))' }}>On-Time Rate</th>
                <th className="text-right px-4 py-3 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'hsl(var(--muted-foreground))' }}>Customer Rating</th>
                <th className="text-right px-5 py-3 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'hsl(var(--muted-foreground))' }}>Revenue</th>
              </tr>
            </thead>
            <tbody>
              {driverPerfSummary.map((d, idx) => {
                const dr = driverRevenue.find((r) => r.driver_id === d.driver_id);
                return (
                  <tr
                    key={d.driver_id}
                    className="transition-colors"
                    style={{ borderBottom: idx < driverPerfSummary.length - 1 ? '1px solid hsl(var(--border))' : undefined }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'hsl(var(--secondary) / 0.4)'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = ''; }}
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0"
                          style={{ backgroundColor: 'hsl(var(--primary) / 0.08)', color: 'hsl(var(--primary))' }}
                        >
                          {d.driver_name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-xs font-semibold" style={{ color: 'hsl(var(--foreground))' }}>{d.driver_name}</p>
                          {dr && (
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span
                                className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                                style={{ backgroundColor: statusBg[dr.status] ?? 'hsl(var(--secondary))', color: statusColor[dr.status] ?? 'hsl(var(--muted-foreground))' }}
                              >
                                {dr.status}
                              </span>
                              <span className="text-[10px]" style={{ color: 'hsl(var(--muted-foreground))' }}>{dr.vehicle}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <span className="text-xs font-semibold tabular-nums" style={{ color: 'hsl(var(--foreground))' }}>{d.deliveries}</span>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'hsl(var(--border))' }}>
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${d.on_time_rate}%`,
                              backgroundColor: d.on_time_rate >= 90 ? 'hsl(142 69% 35%)' : d.on_time_rate >= 75 ? 'hsl(38 92% 50%)' : 'hsl(0 84% 55%)',
                            }}
                          />
                        </div>
                        <span
                          className="text-xs font-semibold tabular-nums w-10 text-right"
                          style={{ color: d.on_time_rate >= 90 ? 'hsl(142 69% 30%)' : d.on_time_rate >= 75 ? 'hsl(35 85% 35%)' : 'hsl(0 84% 45%)' }}
                        >
                          {d.on_time_rate}%
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <StarRating value={d.avg_rating} />
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <span className="text-xs font-semibold tabular-nums" style={{ color: 'hsl(142 69% 28%)' }}>
                        {fmt(d.revenue)}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {driverPerfSummary.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    No driver data available for the selected period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
