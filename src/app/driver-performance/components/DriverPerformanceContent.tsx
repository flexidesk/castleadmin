'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend, TooltipProps,
} from 'recharts';
import { createClient } from '@/lib/supabase/client';
import { ordersService, AppDriver } from '@/lib/services/ordersService';
import {
  TrendingUp, TrendingDown, Star, CheckCircle2, Clock, Truck,
  ChevronDown, ChevronUp,
} from 'lucide-react';
import Icon from '@/components/ui/AppIcon';


// ─── Types ────────────────────────────────────────────────────────────────────

interface PerfLog {
  driver_id: string;
  delivery_date: string;
  was_successful: boolean;
  duration_minutes: number | null;
  customer_rating: number | null;
}

interface DriverStats {
  driver: AppDriver;
  totalDeliveries: number;
  successfulDeliveries: number;
  successRate: number;
  avgDuration: number;
  avgRating: number;
  trend: 'up' | 'down' | 'flat';
}

interface DailyPoint {
  date: string;
  successRate: number;
  avgRating: number;
  deliveries: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildDailyTrend(logs: PerfLog[], driverId?: string): DailyPoint[] {
  const points: DailyPoint[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const label = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    const dayLogs = logs.filter(
      (l) => l.delivery_date === dateStr && (!driverId || l.driver_id === driverId)
    );
    const total = dayLogs.length;
    const successful = dayLogs.filter((l) => l.was_successful).length;
    const ratings = dayLogs.filter((l) => l.customer_rating != null).map((l) => l.customer_rating as number);
    points.push({
      date: label,
      successRate: total > 0 ? Math.round((successful / total) * 100) : 0,
      avgRating: ratings.length > 0 ? parseFloat((ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1)) : 0,
      deliveries: total,
    });
  }
  return points;
}

function computeDriverStats(driver: AppDriver, logs: PerfLog[]): DriverStats {
  const driverLogs = logs.filter((l) => l.driver_id === driver.id);
  const total = driverLogs.length;
  const successful = driverLogs.filter((l) => l.was_successful).length;
  const durations = driverLogs.filter((l) => l.duration_minutes != null).map((l) => l.duration_minutes as number);
  const ratings = driverLogs.filter((l) => l.customer_rating != null).map((l) => l.customer_rating as number);

  const successRate = total > 0 ? Math.round((successful / total) * 100) : 0;
  const avgDuration = durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;
  const avgRating = ratings.length > 0 ? parseFloat((ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1)) : 0;

  // Trend: compare last 7 days vs previous 7 days
  const now = new Date();
  const last7 = driverLogs.filter((l) => {
    const d = new Date(l.delivery_date);
    return d >= new Date(now.getTime() - 7 * 86400000);
  });
  const prev7 = driverLogs.filter((l) => {
    const d = new Date(l.delivery_date);
    return d >= new Date(now.getTime() - 14 * 86400000) && d < new Date(now.getTime() - 7 * 86400000);
  });
  const last7Rate = last7.length > 0 ? last7.filter((l) => l.was_successful).length / last7.length : 0;
  const prev7Rate = prev7.length > 0 ? prev7.filter((l) => l.was_successful).length / prev7.length : 0;
  const trend: 'up' | 'down' | 'flat' = last7Rate > prev7Rate + 0.05 ? 'up' : last7Rate < prev7Rate - 0.05 ? 'down' : 'flat';

  return { driver, totalDeliveries: total, successfulDeliveries: successful, successRate, avgDuration, avgRating, trend };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StarRating({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          size={12}
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

function KPICard({
  label, value, subtext, icon: Icon, variant = 'default',
}: {
  label: string; value: string | number; subtext?: string;
  icon: React.ElementType; variant?: 'default' | 'success' | 'warning' | 'accent';
}) {
  const styles = {
    default: { bg: 'hsl(var(--card))', border: 'hsl(var(--border))', iconBg: 'hsl(var(--secondary))', iconColor: 'hsl(var(--primary))', valueColor: 'hsl(var(--foreground))' },
    success: { bg: 'hsl(142 69% 35% / 0.04)', border: 'hsl(142 69% 35% / 0.25)', iconBg: 'hsl(142 69% 35% / 0.1)', iconColor: 'hsl(142 69% 30%)', valueColor: 'hsl(142 69% 28%)' },
    warning: { bg: 'hsl(38 92% 50% / 0.05)', border: 'hsl(38 92% 50% / 0.3)', iconBg: 'hsl(38 92% 50% / 0.12)', iconColor: 'hsl(35 85% 35%)', valueColor: 'hsl(35 85% 32%)' },
    accent: { bg: 'hsl(213 79% 28% / 0.04)', border: 'hsl(213 79% 28% / 0.2)', iconBg: 'hsl(213 79% 28% / 0.1)', iconColor: 'hsl(213 79% 28%)', valueColor: 'hsl(213 79% 22%)' },
  };
  const s = styles[variant];
  return (
    <div className="rounded-xl border p-5 flex flex-col gap-3" style={{ backgroundColor: s.bg, borderColor: s.border }}>
      <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: s.iconBg }}>
        <Icon size={18} style={{ color: s.iconColor }} />
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
          <span className="font-semibold tabular-nums">{p.value}{p.dataKey === 'successRate' ? '%' : ''}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DriverPerformanceContent() {
  const [drivers, setDrivers] = useState<AppDriver[]>([]);
  const [logs, setLogs] = useState<PerfLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [sortField, setSortField] = useState<'successRate' | 'avgRating' | 'avgDuration' | 'totalDeliveries'>('successRate');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const loadData = useCallback(async () => {
    const supabase = createClient();
    const [driversData, { data: logsData }] = await Promise.all([
      ordersService.fetchDrivers(),
      supabase
        .from('driver_performance_logs')
        .select('driver_id, delivery_date, was_successful, duration_minutes, customer_rating')
        .order('delivery_date', { ascending: false }),
    ]);
    setDrivers(driversData);
    setLogs((logsData as PerfLog[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
    const supabase = createClient();
    const channel = supabase
      .channel('driver_perf_live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_performance_logs' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, loadData)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadData]);

  const allStats: DriverStats[] = drivers.map((d) => computeDriverStats(d, logs));

  const sorted = [...allStats].sort((a, b) => {
    const mult = sortDir === 'desc' ? -1 : 1;
    return (a[sortField] - b[sortField]) * mult;
  });

  const selectedStats = selectedDriverId ? allStats.find((s) => s.driver.id === selectedDriverId) : null;
  const trendData = buildDailyTrend(logs, selectedDriverId ?? undefined);

  // Fleet-wide KPIs
  const totalDeliveries = allStats.reduce((s, d) => s + d.totalDeliveries, 0);
  const fleetSuccessRate = allStats.length > 0
    ? Math.round(allStats.reduce((s, d) => s + d.successRate, 0) / allStats.length)
    : 0;
  const fleetAvgDuration = allStats.filter((d) => d.avgDuration > 0).length > 0
    ? Math.round(allStats.filter((d) => d.avgDuration > 0).reduce((s, d) => s + d.avgDuration, 0) / allStats.filter((d) => d.avgDuration > 0).length)
    : 0;
  const fleetAvgRating = allStats.filter((d) => d.avgRating > 0).length > 0
    ? parseFloat((allStats.filter((d) => d.avgRating > 0).reduce((s, d) => s + d.avgRating, 0) / allStats.filter((d) => d.avgRating > 0).length).toFixed(1))
    : 0;

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    else { setSortField(field); setSortDir('desc'); }
  };

  const SortIcon = ({ field }: { field: typeof sortField }) =>
    sortField === field ? (
      sortDir === 'desc' ? <ChevronDown size={12} /> : <ChevronUp size={12} />
    ) : null;

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
      {/* Fleet KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard label="Total Deliveries" value={totalDeliveries} subtext="Last 30 days" icon={Truck} variant="accent" />
        <KPICard label="Fleet Success Rate" value={`${fleetSuccessRate}%`} subtext="Avg across all drivers" icon={CheckCircle2} variant="success" />
        <KPICard label="Avg Delivery Time" value={fleetAvgDuration > 0 ? `${fleetAvgDuration}m` : '—'} subtext="Minutes per delivery" icon={Clock} variant="warning" />
        <KPICard label="Avg Customer Rating" value={fleetAvgRating > 0 ? fleetAvgRating.toFixed(1) : '—'} subtext="Out of 5 stars" icon={Star} variant="default" />
      </div>

      {/* Driver List Table */}
      <div className="card p-0 overflow-hidden">
        <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: 'hsl(var(--border))' }}>
          <div>
            <h3 className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>Driver Performance</h3>
            <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>Click a driver to view their analytics</p>
          </div>
          <span className="text-xs font-medium px-2 py-1 rounded-md" style={{ backgroundColor: 'hsl(var(--secondary))', color: 'hsl(var(--muted-foreground))' }}>
            Last 30 days
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: 'hsl(var(--secondary) / 0.5)', borderBottom: '1px solid hsl(var(--border))' }}>
                <th className="text-left px-5 py-3 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'hsl(var(--muted-foreground))' }}>Driver</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'hsl(var(--muted-foreground))' }}>Status</th>
                <th
                  className="text-right px-4 py-3 text-[11px] font-semibold uppercase tracking-wider cursor-pointer select-none"
                  style={{ color: 'hsl(var(--muted-foreground))' }}
                  onClick={() => handleSort('totalDeliveries')}
                >
                  <span className="flex items-center justify-end gap-1">Deliveries <SortIcon field="totalDeliveries" /></span>
                </th>
                <th
                  className="text-right px-4 py-3 text-[11px] font-semibold uppercase tracking-wider cursor-pointer select-none"
                  style={{ color: 'hsl(var(--muted-foreground))' }}
                  onClick={() => handleSort('successRate')}
                >
                  <span className="flex items-center justify-end gap-1">Success Rate <SortIcon field="successRate" /></span>
                </th>
                <th
                  className="text-right px-4 py-3 text-[11px] font-semibold uppercase tracking-wider cursor-pointer select-none"
                  style={{ color: 'hsl(var(--muted-foreground))' }}
                  onClick={() => handleSort('avgDuration')}
                >
                  <span className="flex items-center justify-end gap-1">Avg Time <SortIcon field="avgDuration" /></span>
                </th>
                <th
                  className="text-right px-4 py-3 text-[11px] font-semibold uppercase tracking-wider cursor-pointer select-none"
                  style={{ color: 'hsl(var(--muted-foreground))' }}
                  onClick={() => handleSort('avgRating')}
                >
                  <span className="flex items-center justify-end gap-1">Rating <SortIcon field="avgRating" /></span>
                </th>
                <th className="text-center px-4 py-3 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'hsl(var(--muted-foreground))' }}>Trend</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((stats, idx) => {
                const isSelected = selectedDriverId === stats.driver.id;
                return (
                  <tr
                    key={stats.driver.id}
                    onClick={() => setSelectedDriverId(isSelected ? null : stats.driver.id)}
                    className="cursor-pointer transition-colors"
                    style={{
                      borderBottom: idx < sorted.length - 1 ? '1px solid hsl(var(--border))' : undefined,
                      backgroundColor: isSelected ? 'hsl(var(--primary) / 0.04)' : undefined,
                    }}
                    onMouseEnter={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.backgroundColor = 'hsl(var(--secondary) / 0.4)'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = isSelected ? 'hsl(var(--primary) / 0.04)' : ''; }}
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0"
                          style={{ backgroundColor: isSelected ? 'hsl(var(--primary) / 0.15)' : 'hsl(var(--primary) / 0.08)', color: 'hsl(var(--primary))' }}
                        >
                          {stats.driver.avatar}
                        </div>
                        <div>
                          <p className="text-xs font-semibold" style={{ color: 'hsl(var(--foreground))' }}>{stats.driver.name}</p>
                          <p className="text-[10px]" style={{ color: 'hsl(var(--muted-foreground))' }}>{stats.driver.vehicle} · {stats.driver.plate}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: statusBg[stats.driver.status] ?? 'hsl(var(--secondary))', color: statusColor[stats.driver.status] ?? 'hsl(var(--muted-foreground))' }}
                      >
                        {stats.driver.status}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <span className="text-xs font-semibold tabular-nums" style={{ color: 'hsl(var(--foreground))' }}>{stats.totalDeliveries}</span>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'hsl(var(--border))' }}>
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${stats.successRate}%`,
                              backgroundColor: stats.successRate >= 90 ? 'hsl(142 69% 35%)' : stats.successRate >= 75 ? 'hsl(38 92% 50%)' : 'hsl(0 84% 55%)',
                            }}
                          />
                        </div>
                        <span
                          className="text-xs font-semibold tabular-nums w-10 text-right"
                          style={{ color: stats.successRate >= 90 ? 'hsl(142 69% 30%)' : stats.successRate >= 75 ? 'hsl(35 85% 35%)' : 'hsl(0 84% 45%)' }}
                        >
                          {stats.successRate}%
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <span className="text-xs tabular-nums" style={{ color: 'hsl(var(--foreground))' }}>
                        {stats.avgDuration > 0 ? `${stats.avgDuration}m` : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <StarRating value={stats.avgRating} />
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      {stats.trend === 'up' && <TrendingUp size={14} style={{ color: 'hsl(142 69% 30%)', display: 'inline' }} />}
                      {stats.trend === 'down' && <TrendingDown size={14} style={{ color: 'hsl(0 84% 45%)', display: 'inline' }} />}
                      {stats.trend === 'flat' && <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Historical Analytics Chart */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Success Rate Trend */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
                {selectedStats ? `${selectedStats.driver.name} — Success Rate` : 'Fleet Success Rate'}
              </h3>
              <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                Daily delivery success % — last 30 days
              </p>
            </div>
            {selectedStats && (
              <button
                onClick={() => setSelectedDriverId(null)}
                className="text-[10px] font-medium px-2 py-1 rounded-md transition-colors"
                style={{ backgroundColor: 'hsl(var(--secondary))', color: 'hsl(var(--muted-foreground))' }}
              >
                View Fleet
              </button>
            )}
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trendData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false} tickLine={false}
                interval={4}
              />
              <YAxis
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false} tickLine={false}
                domain={[0, 100]}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'hsl(var(--border))' }} />
              <Line
                type="monotone"
                dataKey="successRate"
                name="Success Rate"
                stroke="hsl(142 69% 35%)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Deliveries & Ratings */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
                {selectedStats ? `${selectedStats.driver.name} — Deliveries & Ratings` : 'Fleet Deliveries & Ratings'}
              </h3>
              <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                Daily volume and average customer rating
              </p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={trendData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }} barSize={8} barCategoryGap="30%">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false} tickLine={false}
                interval={4}
              />
              <YAxis
                yAxisId="left"
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false} tickLine={false}
                allowDecimals={false}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                domain={[0, 5]}
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false} tickLine={false}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--secondary))' }} />
              <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
              <Bar yAxisId="left" dataKey="deliveries" name="Deliveries" fill="hsl(213 79% 28% / 0.7)" radius={[3, 3, 0, 0]} />
              <Bar yAxisId="right" dataKey="avgRating" name="Avg Rating" fill="hsl(38 92% 50% / 0.8)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Selected Driver Detail Card */}
      {selectedStats && (
        <div className="card p-5">
          <h3 className="text-sm font-semibold mb-4" style={{ color: 'hsl(var(--foreground))' }}>
            {selectedStats.driver.name} — Performance Summary
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="rounded-lg p-4 text-center" style={{ backgroundColor: 'hsl(var(--secondary) / 0.5)' }}>
              <p className="text-2xl font-bold tabular-nums" style={{ color: 'hsl(var(--foreground))' }}>{selectedStats.totalDeliveries}</p>
              <p className="text-[11px] mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Total Deliveries</p>
            </div>
            <div className="rounded-lg p-4 text-center" style={{ backgroundColor: 'hsl(142 69% 35% / 0.06)' }}>
              <p className="text-2xl font-bold tabular-nums" style={{ color: 'hsl(142 69% 28%)' }}>{selectedStats.successRate}%</p>
              <p className="text-[11px] mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Success Rate</p>
            </div>
            <div className="rounded-lg p-4 text-center" style={{ backgroundColor: 'hsl(38 92% 50% / 0.06)' }}>
              <p className="text-2xl font-bold tabular-nums" style={{ color: 'hsl(35 85% 32%)' }}>
                {selectedStats.avgDuration > 0 ? `${selectedStats.avgDuration}m` : '—'}
              </p>
              <p className="text-[11px] mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Avg Delivery Time</p>
            </div>
            <div className="rounded-lg p-4 text-center" style={{ backgroundColor: 'hsl(213 79% 28% / 0.05)' }}>
              <div className="flex justify-center mb-1">
                <StarRating value={selectedStats.avgRating} />
              </div>
              <p className="text-[11px]" style={{ color: 'hsl(var(--muted-foreground))' }}>Customer Rating</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
