'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { DollarSign, Clock, TrendingUp, Plus, Edit2, Loader2, RefreshCw, Calendar, X, AlertCircle, CreditCard, Settings, BarChart3,  } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Driver {
  id: string;
  name: string;
  phone: string;
  status: string;
  is_active: boolean;
}

interface PayRate {
  id: string;
  driver_id: string;
  pay_type: 'hourly' | 'per_delivery' | 'both';
  hourly_rate: number | null;
  rate_per_delivery: number | null;
  overtime_multiplier: number;
  weekend_multiplier: number;
  night_shift_multiplier: number;
  effective_from: string;
  notes: string | null;
}

interface Shift {
  id: string;
  driver_id: string;
  clock_in: string;
  clock_out: string | null;
  break_minutes: number;
  notes: string | null;
  shift_type: string;
  pay_type: string;
  deliveries_completed: number;
  gross_pay: number | null;
  is_manual: boolean;
  drivers?: { name: string };
}

interface Payment {
  id: string;
  driver_id: string;
  amount: number;
  payment_date: string;
  payment_method: string;
  reference: string | null;
  period_start: string | null;
  period_end: string | null;
  notes: string | null;
  drivers?: { name: string };
}

interface GlobalRates {
  base_rate_per_hour: number;
  bonus_per_delivery: number;
  overtime_multiplier: number;
  weekend_multiplier: number;
  night_shift_multiplier: number;
  currency: string;
  pay_cycle: string;
}

interface EarningsSummary {
  driverId: string;
  driverName: string;
  weeklyHours: number;
  weeklyDeliveries: number;
  weeklyGross: number;
  monthlyHours: number;
  monthlyDeliveries: number;
  monthlyGross: number;
  totalPaid: number;
  balance: number;
}

type TabType = 'dashboard' | 'pay-rates' | 'shifts' | 'reports';

const PAYMENT_METHODS = ['bank_transfer', 'cash', 'cheque', 'other'];
const PAY_TYPES = ['hourly', 'per_delivery', 'both'];
const SHIFT_TYPES = ['regular', 'overtime', 'weekend', 'night'];

function formatCurrency(amount: number, currency = 'GBP') {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount);
}

function formatDuration(clockIn: string, clockOut: string | null, breakMins: number): string {
  if (!clockOut) return 'Active';
  const ms = new Date(clockOut).getTime() - new Date(clockIn).getTime();
  const totalMins = Math.floor(ms / 60000) - breakMins;
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return `${h}h ${m}m`;
}

function getWeekRange(): { start: string; end: string } {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const start = new Date(now.setDate(diff));
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  };
}

function getMonthRange(): { start: string; end: string } {
  const now = new Date();
  return {
    start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0],
    end: new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0],
  };
}

// ─── Modal: Add/Edit Pay Rate ─────────────────────────────────────────────────

function PayRateModal({
  drivers,
  existing,
  globalRates,
  onClose,
  onSave,
}: {
  drivers: Driver[];
  existing: PayRate | null;
  globalRates: GlobalRates | null;
  onClose: () => void;
  onSave: () => void;
}) {
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    driver_id: existing?.driver_id ?? '',
    pay_type: existing?.pay_type ?? 'hourly',
    hourly_rate: existing?.hourly_rate?.toString() ?? globalRates?.base_rate_per_hour?.toString() ?? '12.00',
    rate_per_delivery: existing?.rate_per_delivery?.toString() ?? globalRates?.bonus_per_delivery?.toString() ?? '0.50',
    overtime_multiplier: existing?.overtime_multiplier?.toString() ?? '1.5',
    weekend_multiplier: existing?.weekend_multiplier?.toString() ?? '1.25',
    night_shift_multiplier: existing?.night_shift_multiplier?.toString() ?? '1.20',
    effective_from: existing?.effective_from ?? new Date().toISOString().split('T')[0],
    notes: existing?.notes ?? '',
  });

  const handleSave = async () => {
    if (!form.driver_id) { toast.error('Select a driver'); return; }
    setSaving(true);
    try {
      const payload = {
        driver_id: form.driver_id,
        pay_type: form.pay_type,
        hourly_rate: form.pay_type !== 'per_delivery' ? parseFloat(form.hourly_rate) : null,
        rate_per_delivery: form.pay_type !== 'hourly' ? parseFloat(form.rate_per_delivery) : null,
        overtime_multiplier: parseFloat(form.overtime_multiplier),
        weekend_multiplier: parseFloat(form.weekend_multiplier),
        night_shift_multiplier: parseFloat(form.night_shift_multiplier),
        effective_from: form.effective_from,
        notes: form.notes || null,
      };
      if (existing) {
        const { error } = await supabase.from('driver_pay_rates').update(payload).eq('id', existing.id);
        if (error) throw error;
        toast.success('Pay rate updated');
      } else {
        const { error } = await supabase.from('driver_pay_rates').insert(payload);
        if (error) throw error;
        toast.success('Pay rate added');
      }
      onSave();
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to save pay rate');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="w-full max-w-lg rounded-xl shadow-xl" style={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}>
        <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: 'hsl(var(--border))' }}>
          <h2 className="font-semibold text-base">{existing ? 'Edit Pay Rate' : 'Add Pay Rate'}</h2>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Driver</label>
            <select
              className="w-full rounded-lg px-3 py-2 text-sm border"
              style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))' }}
              value={form.driver_id}
              onChange={(e) => setForm({ ...form, driver_id: e.target.value })}
              disabled={!!existing}
            >
              <option value="">Select driver…</option>
              {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Pay Type</label>
            <select
              className="w-full rounded-lg px-3 py-2 text-sm border"
              style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))' }}
              value={form.pay_type}
              onChange={(e) => setForm({ ...form, pay_type: e.target.value as any })}
            >
              <option value="hourly">Hourly Rate</option>
              <option value="per_delivery">Per Delivery</option>
              <option value="both">Both (Hourly + Per Delivery)</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {form.pay_type !== 'per_delivery' && (
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Hourly Rate (£)</label>
                <input type="number" step="0.01" className="w-full rounded-lg px-3 py-2 text-sm border"
                  style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))' }}
                  value={form.hourly_rate} onChange={(e) => setForm({ ...form, hourly_rate: e.target.value })} />
              </div>
            )}
            {form.pay_type !== 'hourly' && (
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Rate Per Delivery (£)</label>
                <input type="number" step="0.01" className="w-full rounded-lg px-3 py-2 text-sm border"
                  style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))' }}
                  value={form.rate_per_delivery} onChange={(e) => setForm({ ...form, rate_per_delivery: e.target.value })} />
              </div>
            )}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Overtime ×</label>
              <input type="number" step="0.05" className="w-full rounded-lg px-3 py-2 text-sm border"
                style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))' }}
                value={form.overtime_multiplier} onChange={(e) => setForm({ ...form, overtime_multiplier: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Weekend ×</label>
              <input type="number" step="0.05" className="w-full rounded-lg px-3 py-2 text-sm border"
                style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))' }}
                value={form.weekend_multiplier} onChange={(e) => setForm({ ...form, weekend_multiplier: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Night ×</label>
              <input type="number" step="0.05" className="w-full rounded-lg px-3 py-2 text-sm border"
                style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))' }}
                value={form.night_shift_multiplier} onChange={(e) => setForm({ ...form, night_shift_multiplier: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Effective From</label>
            <input type="date" className="w-full rounded-lg px-3 py-2 text-sm border"
              style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))' }}
              value={form.effective_from} onChange={(e) => setForm({ ...form, effective_from: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Notes</label>
            <textarea rows={2} className="w-full rounded-lg px-3 py-2 text-sm border resize-none"
              style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))' }}
              value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <div className="flex justify-end gap-2 p-5 border-t" style={{ borderColor: 'hsl(var(--border))' }}>
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border" style={{ borderColor: 'hsl(var(--border))' }}>Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 text-sm rounded-lg font-medium flex items-center gap-2"
            style={{ backgroundColor: 'hsl(var(--primary))', color: 'white' }}>
            {saving && <Loader2 size={14} className="animate-spin" />}
            {existing ? 'Update' : 'Add Rate'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal: Add Manual Shift ──────────────────────────────────────────────────

function ManualShiftModal({
  drivers,
  onClose,
  onSave,
}: {
  drivers: Driver[];
  onClose: () => void;
  onSave: () => void;
}) {
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const today = new Date().toISOString().split('T')[0];
  const [form, setForm] = useState({
    driver_id: '',
    date: today,
    clock_in_time: '09:00',
    clock_out_time: '17:00',
    break_minutes: '30',
    shift_type: 'regular',
    pay_type: 'hourly',
    deliveries_completed: '0',
    gross_pay: '',
    notes: '',
  });

  const handleSave = async () => {
    if (!form.driver_id) { toast.error('Select a driver'); return; }
    setSaving(true);
    try {
      const clockIn = new Date(`${form.date}T${form.clock_in_time}:00`).toISOString();
      const clockOut = new Date(`${form.date}T${form.clock_out_time}:00`).toISOString();
      const { error } = await supabase.from('driver_shifts').insert({
        driver_id: form.driver_id,
        clock_in: clockIn,
        clock_out: clockOut,
        break_minutes: parseInt(form.break_minutes) || 0,
        shift_type: form.shift_type,
        pay_type: form.pay_type,
        deliveries_completed: parseInt(form.deliveries_completed) || 0,
        gross_pay: form.gross_pay ? parseFloat(form.gross_pay) : null,
        notes: form.notes || null,
        is_manual: true,
      });
      if (error) throw error;
      toast.success('Shift added');
      onSave();
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to add shift');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="w-full max-w-lg rounded-xl shadow-xl" style={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}>
        <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: 'hsl(var(--border))' }}>
          <h2 className="font-semibold text-base">Add Manual Shift</h2>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Driver</label>
              <select className="w-full rounded-lg px-3 py-2 text-sm border"
                style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))' }}
                value={form.driver_id} onChange={(e) => setForm({ ...form, driver_id: e.target.value })}>
                <option value="">Select…</option>
                {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Date</label>
              <input type="date" className="w-full rounded-lg px-3 py-2 text-sm border"
                style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))' }}
                value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Clock In</label>
              <input type="time" className="w-full rounded-lg px-3 py-2 text-sm border"
                style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))' }}
                value={form.clock_in_time} onChange={(e) => setForm({ ...form, clock_in_time: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Clock Out</label>
              <input type="time" className="w-full rounded-lg px-3 py-2 text-sm border"
                style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))' }}
                value={form.clock_out_time} onChange={(e) => setForm({ ...form, clock_out_time: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Break (mins)</label>
              <input type="number" className="w-full rounded-lg px-3 py-2 text-sm border"
                style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))' }}
                value={form.break_minutes} onChange={(e) => setForm({ ...form, break_minutes: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Shift Type</label>
              <select className="w-full rounded-lg px-3 py-2 text-sm border"
                style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))' }}
                value={form.shift_type} onChange={(e) => setForm({ ...form, shift_type: e.target.value })}>
                {SHIFT_TYPES.map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Pay Type</label>
              <select className="w-full rounded-lg px-3 py-2 text-sm border"
                style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))' }}
                value={form.pay_type} onChange={(e) => setForm({ ...form, pay_type: e.target.value })}>
                <option value="hourly">Hourly</option>
                <option value="per_delivery">Per Delivery</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Deliveries Completed</label>
              <input type="number" className="w-full rounded-lg px-3 py-2 text-sm border"
                style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))' }}
                value={form.deliveries_completed} onChange={(e) => setForm({ ...form, deliveries_completed: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Gross Pay Override (£)</label>
              <input type="number" step="0.01" placeholder="Auto-calculated" className="w-full rounded-lg px-3 py-2 text-sm border"
                style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))' }}
                value={form.gross_pay} onChange={(e) => setForm({ ...form, gross_pay: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Notes</label>
            <textarea rows={2} className="w-full rounded-lg px-3 py-2 text-sm border resize-none"
              style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))' }}
              value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <div className="flex justify-end gap-2 p-5 border-t" style={{ borderColor: 'hsl(var(--border))' }}>
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border" style={{ borderColor: 'hsl(var(--border))' }}>Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 text-sm rounded-lg font-medium flex items-center gap-2"
            style={{ backgroundColor: 'hsl(var(--primary))', color: 'white' }}>
            {saving && <Loader2 size={14} className="animate-spin" />}
            Add Shift
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal: Record Payment ────────────────────────────────────────────────────

function RecordPaymentModal({
  drivers,
  onClose,
  onSave,
}: {
  drivers: Driver[];
  onClose: () => void;
  onSave: () => void;
}) {
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const today = new Date().toISOString().split('T')[0];
  const week = getWeekRange();
  const [form, setForm] = useState({
    driver_id: '',
    amount: '',
    payment_date: today,
    payment_method: 'bank_transfer',
    reference: '',
    period_start: week.start,
    period_end: week.end,
    notes: '',
  });

  const handleSave = async () => {
    if (!form.driver_id) { toast.error('Select a driver'); return; }
    if (!form.amount || parseFloat(form.amount) <= 0) { toast.error('Enter a valid amount'); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from('driver_payments').insert({
        driver_id: form.driver_id,
        amount: parseFloat(form.amount),
        payment_date: form.payment_date,
        payment_method: form.payment_method,
        reference: form.reference || null,
        period_start: form.period_start || null,
        period_end: form.period_end || null,
        notes: form.notes || null,
      });
      if (error) throw error;
      toast.success('Payment recorded');
      onSave();
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to record payment');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="w-full max-w-md rounded-xl shadow-xl" style={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}>
        <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: 'hsl(var(--border))' }}>
          <h2 className="font-semibold text-base">Record Payment</h2>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Driver</label>
            <select className="w-full rounded-lg px-3 py-2 text-sm border"
              style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))' }}
              value={form.driver_id} onChange={(e) => setForm({ ...form, driver_id: e.target.value })}>
              <option value="">Select driver…</option>
              {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Amount (£)</label>
              <input type="number" step="0.01" placeholder="0.00" className="w-full rounded-lg px-3 py-2 text-sm border"
                style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))' }}
                value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Payment Date</label>
              <input type="date" className="w-full rounded-lg px-3 py-2 text-sm border"
                style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))' }}
                value={form.payment_date} onChange={(e) => setForm({ ...form, payment_date: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Method</label>
              <select className="w-full rounded-lg px-3 py-2 text-sm border"
                style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))' }}
                value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })}>
                {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Reference</label>
              <input type="text" placeholder="e.g. BACS-001" className="w-full rounded-lg px-3 py-2 text-sm border"
                style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))' }}
                value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Period Start</label>
              <input type="date" className="w-full rounded-lg px-3 py-2 text-sm border"
                style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))' }}
                value={form.period_start} onChange={(e) => setForm({ ...form, period_start: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Period End</label>
              <input type="date" className="w-full rounded-lg px-3 py-2 text-sm border"
                style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))' }}
                value={form.period_end} onChange={(e) => setForm({ ...form, period_end: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Notes</label>
            <textarea rows={2} className="w-full rounded-lg px-3 py-2 text-sm border resize-none"
              style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))' }}
              value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <div className="flex justify-end gap-2 p-5 border-t" style={{ borderColor: 'hsl(var(--border))' }}>
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border" style={{ borderColor: 'hsl(var(--border))' }}>Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 text-sm rounded-lg font-medium flex items-center gap-2"
            style={{ backgroundColor: 'hsl(142 69% 35%)', color: 'white' }}>
            {saving && <Loader2 size={14} className="animate-spin" />}
            Record Payment
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DriverEarningsContent() {
  const supabase = createClient();
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [loading, setLoading] = useState(true);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [payRates, setPayRates] = useState<PayRate[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [globalRates, setGlobalRates] = useState<GlobalRates | null>(null);
  const [summaries, setSummaries] = useState<EarningsSummary[]>([]);
  const [reportPeriod, setReportPeriod] = useState<'weekly' | 'monthly'>('weekly');
  const [selectedDriverFilter, setSelectedDriverFilter] = useState('all');

  // Modals
  const [showPayRateModal, setShowPayRateModal] = useState(false);
  const [editingPayRate, setEditingPayRate] = useState<PayRate | null>(null);
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [driversRes, payRatesRes, shiftsRes, paymentsRes, globalRes] = await Promise.all([
        supabase.from('drivers').select('id, name, phone, status, is_active').eq('is_active', true).eq('is_archived', false).order('name'),
        supabase.from('driver_pay_rates').select('*').order('effective_from', { ascending: false }),
        supabase.from('driver_shifts').select('*, drivers(name)').order('clock_in', { ascending: false }).limit(200),
        supabase.from('driver_payments').select('*, drivers(name)').order('payment_date', { ascending: false }).limit(200),
        supabase.from('driver_rate_settings').select('*').limit(1).single(),
      ]);

      if (driversRes.data) setDrivers(driversRes.data);
      if (payRatesRes.data) setPayRates(payRatesRes.data);
      if (shiftsRes.data) setShifts(shiftsRes.data as Shift[]);
      if (paymentsRes.data) setPayments(paymentsRes.data as Payment[]);
      if (globalRes.data) setGlobalRates(globalRes.data);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load earnings data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ─── Compute summaries ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!drivers.length) return;
    const week = getWeekRange();
    const month = getMonthRange();

    const computed: EarningsSummary[] = drivers.map((driver) => {
      const driverShifts = shifts.filter((s) => s.driver_id === driver.id && s.clock_out);
      const driverPayments = payments.filter((p) => p.driver_id === driver.id);

      const weekShifts = driverShifts.filter((s) => s.clock_in >= week.start + 'T00:00:00');
      const monthShifts = driverShifts.filter((s) => s.clock_in >= month.start + 'T00:00:00');

      const calcHours = (s: Shift) => {
        if (!s.clock_out) return 0;
        const ms = new Date(s.clock_out).getTime() - new Date(s.clock_in).getTime();
        return Math.max(0, (ms / 3600000) - (s.break_minutes / 60));
      };

      const getRate = (driverId: string): { hourly: number; perDelivery: number } => {
        const rate = payRates.find((r) => r.driver_id === driverId);
        return {
          hourly: rate?.hourly_rate ?? globalRates?.base_rate_per_hour ?? 12,
          perDelivery: rate?.rate_per_delivery ?? globalRates?.bonus_per_delivery ?? 0.5,
        };
      };

      const calcGross = (shiftList: Shift[]) => {
        const rate = getRate(driver.id);
        return shiftList.reduce((sum, s) => {
          if (s.gross_pay != null) return sum + s.gross_pay;
          const hours = calcHours(s);
          const hourlyEarning = s.pay_type !== 'per_delivery' ? hours * rate.hourly : 0;
          const deliveryEarning = s.pay_type !== 'hourly' ? s.deliveries_completed * rate.perDelivery : 0;
          return sum + hourlyEarning + deliveryEarning;
        }, 0);
      };

      const weeklyGross = calcGross(weekShifts);
      const monthlyGross = calcGross(monthShifts);
      const totalPaid = driverPayments.reduce((s, p) => s + p.amount, 0);
      const totalGross = calcGross(driverShifts);

      return {
        driverId: driver.id,
        driverName: driver.name,
        weeklyHours: weekShifts.reduce((s, sh) => s + calcHours(sh), 0),
        weeklyDeliveries: weekShifts.reduce((s, sh) => s + sh.deliveries_completed, 0),
        weeklyGross,
        monthlyHours: monthShifts.reduce((s, sh) => s + calcHours(sh), 0),
        monthlyDeliveries: monthShifts.reduce((s, sh) => s + sh.deliveries_completed, 0),
        monthlyGross,
        totalPaid,
        balance: totalGross - totalPaid,
      };
    });

    setSummaries(computed);
  }, [drivers, shifts, payments, payRates, globalRates]);

  const totalBalance = summaries.reduce((s, d) => s + d.balance, 0);
  const totalWeeklyGross = summaries.reduce((s, d) => s + d.weeklyGross, 0);
  const totalMonthlyGross = summaries.reduce((s, d) => s + d.monthlyGross, 0);
  const activeShifts = shifts.filter((s) => !s.clock_out).length;

  const chartData = summaries.slice(0, 8).map((s) => ({
    name: s.driverName.split(' ')[0],
    weekly: parseFloat(s.weeklyGross.toFixed(2)),
    monthly: parseFloat(s.monthlyGross.toFixed(2)),
    paid: parseFloat(s.totalPaid.toFixed(2)),
  }));

  const filteredShifts = selectedDriverFilter === 'all'
    ? shifts
    : shifts.filter((s) => s.driver_id === selectedDriverFilter);

  const tabs: { id: TabType; label: string; icon: React.ElementType }[] = [
    { id: 'dashboard', label: 'Payments Due', icon: DollarSign },
    { id: 'pay-rates', label: 'Pay Rates', icon: Settings },
    { id: 'shifts', label: 'Shifts', icon: Clock },
    { id: 'reports', label: 'Reports', icon: BarChart3 },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={32} className="animate-spin" style={{ color: 'hsl(var(--primary))' }} />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Driver Earnings</h1>
          <p className="text-sm mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Pay rates, shift tracking, and payment management
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowShiftModal(true)}
            className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border font-medium"
            style={{ borderColor: 'hsl(var(--border))' }}>
            <Plus size={14} /> Add Shift
          </button>
          <button onClick={() => setShowPaymentModal(true)}
            className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg font-medium"
            style={{ backgroundColor: 'hsl(142 69% 35%)', color: 'white' }}>
            <CreditCard size={14} /> Record Payment
          </button>
          <button onClick={loadData} className="p-2 rounded-lg border" style={{ borderColor: 'hsl(var(--border))' }}>
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Payments Due', value: formatCurrency(totalBalance), icon: AlertCircle, color: totalBalance > 0 ? 'hsl(38 92% 50%)' : 'hsl(142 69% 35%)', sub: `${summaries.filter((s) => s.balance > 0).length} drivers` },
          { label: 'This Week Gross', value: formatCurrency(totalWeeklyGross), icon: TrendingUp, color: 'hsl(217 91% 60%)', sub: 'All drivers' },
          { label: 'This Month Gross', value: formatCurrency(totalMonthlyGross), icon: Calendar, color: 'hsl(262 83% 58%)', sub: 'All drivers' },
          { label: 'Active Shifts', value: activeShifts.toString(), icon: Clock, color: 'hsl(142 69% 35%)', sub: 'Currently clocked in' },
        ].map((kpi) => (
          <div key={kpi.label} className="rounded-xl p-4 border" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>{kpi.label}</span>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${kpi.color}20` }}>
                <kpi.icon size={16} style={{ color: kpi.color }} />
              </div>
            </div>
            <p className="text-xl font-bold">{kpi.value}</p>
            <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>{kpi.sub}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-lg" style={{ backgroundColor: 'hsl(var(--secondary))' }}>
        {tabs.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all"
            style={activeTab === tab.id
              ? { backgroundColor: 'hsl(var(--card))', color: 'hsl(var(--foreground))', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }
              : { color: 'hsl(var(--muted-foreground))' }}>
            <tab.icon size={14} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab: Payments Due Dashboard ── */}
      {activeTab === 'dashboard' && (
        <div className="space-y-4">
          <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
            <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: 'hsl(var(--border))' }}>
              <h2 className="font-semibold text-sm">Driver Balances</h2>
              <span className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: 'hsl(38 92% 50% / 0.1)', color: 'hsl(38 92% 50%)' }}>
                {summaries.filter((s) => s.balance > 0).length} drivers owed payment
              </span>
            </div>
            <div className="divide-y" style={{ borderColor: 'hsl(var(--border))' }}>
              {summaries.length === 0 ? (
                <div className="p-8 text-center text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>No driver data yet</div>
              ) : (
                summaries.sort((a, b) => b.balance - a.balance).map((s) => (
                  <div key={s.driverId} className="flex items-center justify-between px-4 py-3 hover:bg-secondary/30 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold"
                        style={{ backgroundColor: 'hsl(var(--primary) / 0.1)', color: 'hsl(var(--primary))' }}>
                        {s.driverName.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{s.driverName}</p>
                        <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                          {s.weeklyHours.toFixed(1)}h this week · {s.weeklyDeliveries} deliveries
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-6 text-right">
                      <div>
                        <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>Week Gross</p>
                        <p className="text-sm font-medium">{formatCurrency(s.weeklyGross)}</p>
                      </div>
                      <div>
                        <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>Total Paid</p>
                        <p className="text-sm font-medium" style={{ color: 'hsl(142 69% 35%)' }}>{formatCurrency(s.totalPaid)}</p>
                      </div>
                      <div>
                        <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>Balance Due</p>
                        <p className="text-sm font-bold" style={{ color: s.balance > 0 ? 'hsl(38 92% 50%)' : 'hsl(142 69% 35%)' }}>
                          {formatCurrency(Math.abs(s.balance))}
                          {s.balance < 0 && <span className="text-xs ml-1">(overpaid)</span>}
                        </p>
                      </div>
                      <button onClick={() => setShowPaymentModal(true)}
                        className="px-3 py-1.5 text-xs rounded-lg font-medium"
                        style={{ backgroundColor: 'hsl(var(--primary) / 0.1)', color: 'hsl(var(--primary))' }}>
                        Pay
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Recent Payments */}
          <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
            <div className="p-4 border-b" style={{ borderColor: 'hsl(var(--border))' }}>
              <h2 className="font-semibold text-sm">Recent Payments</h2>
            </div>
            <div className="divide-y" style={{ borderColor: 'hsl(var(--border))' }}>
              {payments.slice(0, 10).length === 0 ? (
                <div className="p-8 text-center text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>No payments recorded yet</div>
              ) : (
                payments.slice(0, 10).map((p) => (
                  <div key={p.id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-sm font-medium">{p.drivers?.name ?? 'Unknown'}</p>
                      <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        {new Date(p.payment_date).toLocaleDateString('en-GB')}
                        {p.reference && ` · ${p.reference}`}
                        {p.period_start && ` · ${new Date(p.period_start).toLocaleDateString('en-GB')} – ${new Date(p.period_end!).toLocaleDateString('en-GB')}`}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold" style={{ color: 'hsl(142 69% 35%)' }}>{formatCurrency(p.amount)}</p>
                      <p className="text-xs capitalize" style={{ color: 'hsl(var(--muted-foreground))' }}>{p.payment_method.replace('_', ' ')}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Tab: Pay Rates ── */}
      {activeTab === 'pay-rates' && (
        <div className="space-y-4">
          {/* Global rates info */}
          {globalRates && (
            <div className="rounded-xl border p-4" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm">Global Default Rates</h3>
                <span className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: 'hsl(var(--secondary))' }}>
                  Applied when no driver-specific rate exists
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Base Hourly', value: formatCurrency(globalRates.base_rate_per_hour) },
                  { label: 'Bonus/Delivery', value: formatCurrency(globalRates.bonus_per_delivery) },
                  { label: 'Overtime ×', value: `${globalRates.overtime_multiplier}×` },
                  { label: 'Weekend ×', value: `${globalRates.weekend_multiplier}×` },
                ].map((item) => (
                  <div key={item.label} className="rounded-lg p-3" style={{ backgroundColor: 'hsl(var(--secondary))' }}>
                    <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>{item.label}</p>
                    <p className="text-base font-bold mt-0.5">{item.value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
            <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: 'hsl(var(--border))' }}>
              <h2 className="font-semibold text-sm">Driver-Specific Pay Rates</h2>
              <button onClick={() => { setEditingPayRate(null); setShowPayRateModal(true); }}
                className="flex items-center gap-2 px-3 py-1.5 text-xs rounded-lg font-medium"
                style={{ backgroundColor: 'hsl(var(--primary))', color: 'white' }}>
                <Plus size={12} /> Add Rate
              </button>
            </div>
            <div className="divide-y" style={{ borderColor: 'hsl(var(--border))' }}>
              {payRates.length === 0 ? (
                <div className="p-8 text-center text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  No custom rates set. All drivers use global defaults.
                </div>
              ) : (
                payRates.map((rate) => {
                  const driver = drivers.find((d) => d.id === rate.driver_id);
                  return (
                    <div key={rate.id} className="flex items-center justify-between px-4 py-3">
                      <div>
                        <p className="text-sm font-medium">{driver?.name ?? 'Unknown Driver'}</p>
                        <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                          Effective {new Date(rate.effective_from).toLocaleDateString('en-GB')}
                          {rate.notes && ` · ${rate.notes}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex gap-3 text-right">
                          {rate.pay_type !== 'per_delivery' && (
                            <div>
                              <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>Hourly</p>
                              <p className="text-sm font-semibold">{formatCurrency(rate.hourly_rate ?? 0)}</p>
                            </div>
                          )}
                          {rate.pay_type !== 'hourly' && (
                            <div>
                              <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>Per Delivery</p>
                              <p className="text-sm font-semibold">{formatCurrency(rate.rate_per_delivery ?? 0)}</p>
                            </div>
                          )}
                          <div>
                            <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>OT ×</p>
                            <p className="text-sm font-semibold">{rate.overtime_multiplier}</p>
                          </div>
                        </div>
                        <span className="text-xs px-2 py-1 rounded-full capitalize"
                          style={{ backgroundColor: 'hsl(var(--secondary))' }}>
                          {rate.pay_type.replace('_', ' ')}
                        </span>
                        <button onClick={() => { setEditingPayRate(rate); setShowPayRateModal(true); }}
                          className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
                          <Edit2 size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Tab: Shifts ── */}
      {activeTab === 'shifts' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <select className="rounded-lg px-3 py-2 text-sm border"
              style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))' }}
              value={selectedDriverFilter} onChange={(e) => setSelectedDriverFilter(e.target.value)}>
              <option value="all">All Drivers</option>
              {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <button onClick={() => setShowShiftModal(true)}
              className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg font-medium"
              style={{ backgroundColor: 'hsl(var(--primary))', color: 'white' }}>
              <Plus size={14} /> Add Manual Shift
            </button>
          </div>

          <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: 'hsl(var(--secondary))' }}>
                    {['Driver', 'Clock In', 'Clock Out', 'Duration', 'Break', 'Type', 'Deliveries', 'Gross Pay', 'Source'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold" style={{ color: 'hsl(var(--muted-foreground))' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: 'hsl(var(--border))' }}>
                  {filteredShifts.length === 0 ? (
                    <tr><td colSpan={9} className="px-4 py-8 text-center text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>No shifts found</td></tr>
                  ) : (
                    filteredShifts.slice(0, 50).map((shift) => (
                      <tr key={shift.id} className="hover:bg-secondary/30 transition-colors">
                        <td className="px-4 py-3 font-medium">{shift.drivers?.name ?? '—'}</td>
                        <td className="px-4 py-3 text-xs">{new Date(shift.clock_in).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}</td>
                        <td className="px-4 py-3 text-xs">
                          {shift.clock_out
                            ? new Date(shift.clock_out).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })
                            : <span className="px-2 py-0.5 rounded-full text-xs" style={{ backgroundColor: 'hsl(142 69% 35% / 0.1)', color: 'hsl(142 69% 35%)' }}>Active</span>}
                        </td>
                        <td className="px-4 py-3 text-xs">{formatDuration(shift.clock_in, shift.clock_out, shift.break_minutes)}</td>
                        <td className="px-4 py-3 text-xs">{shift.break_minutes}m</td>
                        <td className="px-4 py-3">
                          <span className="text-xs px-2 py-0.5 rounded-full capitalize"
                            style={{ backgroundColor: 'hsl(var(--secondary))' }}>
                            {shift.shift_type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs">{shift.deliveries_completed}</td>
                        <td className="px-4 py-3 text-xs font-medium">
                          {shift.gross_pay != null ? formatCurrency(shift.gross_pay) : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs px-2 py-0.5 rounded-full"
                            style={shift.is_manual
                              ? { backgroundColor: 'hsl(262 83% 58% / 0.1)', color: 'hsl(262 83% 58%)' }
                              : { backgroundColor: 'hsl(142 69% 35% / 0.1)', color: 'hsl(142 69% 35%)' }}>
                            {shift.is_manual ? 'Manual' : 'Driver'}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Tab: Reports ── */}
      {activeTab === 'reports' && (
        <div className="space-y-6">
          <div className="flex items-center gap-2">
            <button onClick={() => setReportPeriod('weekly')}
              className="px-4 py-2 text-sm rounded-lg font-medium transition-all"
              style={reportPeriod === 'weekly'
                ? { backgroundColor: 'hsl(var(--primary))', color: 'white' }
                : { backgroundColor: 'hsl(var(--secondary))', color: 'hsl(var(--foreground))' }}>
              Weekly
            </button>
            <button onClick={() => setReportPeriod('monthly')}
              className="px-4 py-2 text-sm rounded-lg font-medium transition-all"
              style={reportPeriod === 'monthly'
                ? { backgroundColor: 'hsl(var(--primary))', color: 'white' }
                : { backgroundColor: 'hsl(var(--secondary))', color: 'hsl(var(--foreground))' }}>
              Monthly
            </button>
          </div>

          {/* Chart */}
          <div className="rounded-xl border p-5" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
            <h3 className="font-semibold text-sm mb-4">
              {reportPeriod === 'weekly' ? 'This Week' : 'This Month'} — Earnings by Driver
            </h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `£${v}`} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Legend />
                <Bar dataKey={reportPeriod === 'weekly' ? 'weekly' : 'monthly'} name="Gross Earnings" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="paid" name="Paid" fill="hsl(142 69% 35%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Summary Table */}
          <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
            <div className="p-4 border-b" style={{ borderColor: 'hsl(var(--border))' }}>
              <h3 className="font-semibold text-sm">
                {reportPeriod === 'weekly' ? 'Weekly' : 'Monthly'} Earnings Summary
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: 'hsl(var(--secondary))' }}>
                    {['Driver', 'Hours', 'Deliveries', 'Gross Earnings', 'Total Paid', 'Balance Due'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold" style={{ color: 'hsl(var(--muted-foreground))' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: 'hsl(var(--border))' }}>
                  {summaries.map((s) => (
                    <tr key={s.driverId} className="hover:bg-secondary/30 transition-colors">
                      <td className="px-4 py-3 font-medium">{s.driverName}</td>
                      <td className="px-4 py-3">{(reportPeriod === 'weekly' ? s.weeklyHours : s.monthlyHours).toFixed(1)}h</td>
                      <td className="px-4 py-3">{reportPeriod === 'weekly' ? s.weeklyDeliveries : s.monthlyDeliveries}</td>
                      <td className="px-4 py-3 font-semibold">{formatCurrency(reportPeriod === 'weekly' ? s.weeklyGross : s.monthlyGross)}</td>
                      <td className="px-4 py-3" style={{ color: 'hsl(142 69% 35%)' }}>{formatCurrency(s.totalPaid)}</td>
                      <td className="px-4 py-3 font-bold" style={{ color: s.balance > 0 ? 'hsl(38 92% 50%)' : 'hsl(142 69% 35%)' }}>
                        {formatCurrency(Math.abs(s.balance))}
                        {s.balance < 0 && <span className="text-xs font-normal ml-1">(overpaid)</span>}
                      </td>
                    </tr>
                  ))}
                  <tr style={{ backgroundColor: 'hsl(var(--secondary))' }}>
                    <td className="px-4 py-3 font-bold">Total</td>
                    <td className="px-4 py-3 font-bold">{summaries.reduce((s, d) => s + (reportPeriod === 'weekly' ? d.weeklyHours : d.monthlyHours), 0).toFixed(1)}h</td>
                    <td className="px-4 py-3 font-bold">{summaries.reduce((s, d) => s + (reportPeriod === 'weekly' ? d.weeklyDeliveries : d.monthlyDeliveries), 0)}</td>
                    <td className="px-4 py-3 font-bold">{formatCurrency(reportPeriod === 'weekly' ? totalWeeklyGross : totalMonthlyGross)}</td>
                    <td className="px-4 py-3 font-bold" style={{ color: 'hsl(142 69% 35%)' }}>{formatCurrency(summaries.reduce((s, d) => s + d.totalPaid, 0))}</td>
                    <td className="px-4 py-3 font-bold" style={{ color: 'hsl(38 92% 50%)' }}>{formatCurrency(totalBalance)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      {showPayRateModal && (
        <PayRateModal
          drivers={drivers}
          existing={editingPayRate}
          globalRates={globalRates}
          onClose={() => { setShowPayRateModal(false); setEditingPayRate(null); }}
          onSave={() => { setShowPayRateModal(false); setEditingPayRate(null); loadData(); }}
        />
      )}
      {showShiftModal && (
        <ManualShiftModal
          drivers={drivers}
          onClose={() => setShowShiftModal(false)}
          onSave={() => { setShowShiftModal(false); loadData(); }}
        />
      )}
      {showPaymentModal && (
        <RecordPaymentModal
          drivers={drivers}
          onClose={() => setShowPaymentModal(false)}
          onSave={() => { setShowPaymentModal(false); loadData(); }}
        />
      )}
    </div>
  );
}
