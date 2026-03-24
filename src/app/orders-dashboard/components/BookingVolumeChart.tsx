'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, TooltipProps,
} from 'recharts';
import { ordersService, AppOrder } from '@/lib/services/ordersService';
import { createClient } from '@/lib/supabase/client';

interface ChartDay {
  date: string;
  accepted: number;
  assigned: number;
  outForDelivery: number;
  complete: number;
}

function buildChartData(orders: AppOrder[]): ChartDay[] {
  const days: ChartDay[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const label = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    const dayOrders = orders.filter((o) => o.bookingDate === dateStr);
    days.push({
      date: label,
      accepted: dayOrders.filter((o) => o.status === 'Booking Accepted').length,
      assigned: dayOrders.filter((o) => o.status === 'Booking Assigned').length,
      outForDelivery: dayOrders.filter((o) => o.status === 'Booking Out For Delivery').length,
      complete: dayOrders.filter((o) => o.status === 'Booking Complete').length,
    });
  }
  return days;
}

function CustomTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload || !payload.length) return null;
  const total = payload.reduce((sum, p) => sum + (p.value as number || 0), 0);
  return (
    <div className="card shadow-lg p-3 text-xs min-w-[160px]" style={{ border: '1px solid hsl(var(--border))' }}>
      <p className="font-semibold mb-2 text-sm">{label}</p>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4 py-0.5">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: p.color }} />
            <span style={{ color: 'hsl(var(--muted-foreground))' }}>{p.name}</span>
          </div>
          <span className="font-semibold tabular-nums">{p.value}</span>
        </div>
      ))}
      <div className="flex items-center justify-between pt-2 mt-1 border-t" style={{ borderColor: 'hsl(var(--border))' }}>
        <span style={{ color: 'hsl(var(--muted-foreground))' }}>Total</span>
        <span className="font-bold tabular-nums">{total}</span>
      </div>
    </div>
  );
}

export default function BookingVolumeChart() {
  const [chartData, setChartData] = useState<ChartDay[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    const orders = await ordersService.fetchAllOrders();
    setChartData(buildChartData(orders));
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();

    const supabase = createClient();
    const channel = supabase
      .channel('chart_orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        loadData();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [loadData]);

  const [rangeLabel, setRangeLabel] = useState('');
  useEffect(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 6);
    setRangeLabel(
      `${start.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} – ${end.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`
    );
  }, []);

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
            Booking Volume — Last 7 Days
          </h3>
          <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Breakdown by booking status per day
          </p>
        </div>
        <span
          className="text-[10px] font-medium px-2 py-1 rounded-md"
          style={{ backgroundColor: 'hsl(var(--secondary))', color: 'hsl(var(--muted-foreground))' }}
        >
          {rangeLabel}
        </span>
      </div>

      {loading ? (
        <div className="h-[240px] flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'hsl(var(--primary))' }} />
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }} barSize={10} barCategoryGap="28%">
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))', fontFamily: 'DM Sans' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))', fontFamily: 'DM Sans' }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--secondary))' }} />
            <Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize: '11px', paddingTop: '12px', fontFamily: 'DM Sans' }} />
            <Bar dataKey="accepted" name="Accepted" fill="hsl(213 79% 65%)" radius={[3, 3, 0, 0]} />
            <Bar dataKey="assigned" name="Assigned" fill="hsl(38 92% 65%)" radius={[3, 3, 0, 0]} />
            <Bar dataKey="outForDelivery" name="Out For Delivery" fill="hsl(24 95% 60%)" radius={[3, 3, 0, 0]} />
            <Bar dataKey="complete" name="Complete" fill="hsl(142 69% 50%)" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}