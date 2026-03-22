'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Calendar, ChevronLeft, ChevronRight, Plus, Edit2, Trash2, Clock, Truck, Coffee, X, Loader2, RefreshCw, LayoutTemplate, CalendarDays, List, Save, Repeat,  } from 'lucide-react';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

type ShiftStatus = 'scheduled' | 'active' | 'completed' | 'cancelled';
type ShiftType = 'regular' | 'overtime' | 'weekend' | 'night';
type ViewMode = 'calendar' | 'list';

interface Driver {
  id: string;
  name: string;
  phone: string;
  vehicle: string;
  plate: string;
  status: string;
}

interface Vehicle {
  id: string;
  registration: string;
  make: string;
  model: string;
  type: string;
  colour: string | null;
  assigned_driver_id: string | null;
}

interface DriverShift {
  id: string;
  driver_id: string;
  vehicle_id: string | null;
  shift_date: string;
  start_time: string | null;
  end_time: string | null;
  clock_in: string;
  clock_out: string | null;
  break_minutes: number;
  shift_type: ShiftType;
  pay_type: string;
  status: ShiftStatus;
  notes: string | null;
  deliveries_completed: number;
  gross_pay: number | null;
  is_manual: boolean;
  driver?: Driver;
  vehicle?: Vehicle;
}

interface ShiftTemplate {
  id: string;
  name: string;
  shift_type: ShiftType;
  start_time: string;
  end_time: string;
  break_minutes: number;
  recurrence_days: number[];
  notes: string | null;
  is_active: boolean;
}

interface ShiftFormData {
  driver_id: string;
  vehicle_id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  shift_type: ShiftType;
  pay_type: string;
  status: ShiftStatus;
  notes: string;
}

interface TemplateFormData {
  name: string;
  shift_type: ShiftType;
  start_time: string;
  end_time: string;
  break_minutes: number;
  recurrence_days: number[];
  notes: string;
}

interface BulkApplyData {
  template_id: string;
  driver_ids: string[];
  start_date: string;
  end_date: string;
  vehicle_id: string;
}

const EMPTY_SHIFT: ShiftFormData = {
  driver_id: '',
  vehicle_id: '',
  shift_date: new Date().toISOString().split('T')[0],
  start_time: '08:00',
  end_time: '16:00',
  break_minutes: 30,
  shift_type: 'regular',
  pay_type: 'hourly',
  status: 'scheduled',
  notes: '',
};

const EMPTY_TEMPLATE: TemplateFormData = {
  name: '',
  shift_type: 'regular',
  start_time: '08:00',
  end_time: '16:00',
  break_minutes: 30,
  recurrence_days: [],
  notes: '',
};

const EMPTY_BULK: BulkApplyData = {
  template_id: '',
  driver_ids: [],
  start_date: new Date().toISOString().split('T')[0],
  end_date: new Date().toISOString().split('T')[0],
  vehicle_id: '',
};

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const FULL_DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

const STATUS_COLORS: Record<ShiftStatus, { bg: string; text: string; dot: string }> = {
  scheduled: { bg: 'bg-blue-500/10', text: 'text-blue-400', dot: 'bg-blue-400' },
  active: { bg: 'bg-green-500/10', text: 'text-green-400', dot: 'bg-green-400' },
  completed: { bg: 'bg-gray-500/10', text: 'text-gray-400', dot: 'bg-gray-400' },
  cancelled: { bg: 'bg-red-500/10', text: 'text-red-400', dot: 'bg-red-400' },
};

const SHIFT_TYPE_COLORS: Record<ShiftType, string> = {
  regular: 'border-l-blue-400',
  overtime: 'border-l-orange-400',
  weekend: 'border-l-purple-400',
  night: 'border-l-indigo-400',
};

function calcHours(start: string, end: string, breakMins: number): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60;
  return Math.max(0, (mins - breakMins) / 60);
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DriverShiftContent() {
  const supabase = createClient();

  // Data
  const [shifts, setShifts] = useState<DriverShift[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [templates, setTemplates] = useState<ShiftTemplate[]>([]);

  // UI state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('calendar');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'shifts' | 'templates'>('shifts');

  // Modals
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [editingShift, setEditingShift] = useState<DriverShift | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<ShiftTemplate | null>(null);

  // Forms
  const [shiftForm, setShiftForm] = useState<ShiftFormData>(EMPTY_SHIFT);
  const [templateForm, setTemplateForm] = useState<TemplateFormData>(EMPTY_TEMPLATE);
  const [bulkForm, setBulkForm] = useState<BulkApplyData>(EMPTY_BULK);

  // Filters
  const [filterDriver, setFilterDriver] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // ─── Data Fetching ──────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      const firstDay = new Date(year, month, 1).toISOString().split('T')[0];
      const lastDay = new Date(year, month + 1, 0).toISOString().split('T')[0];

      const [shiftsRes, driversRes, vehiclesRes, templatesRes] = await Promise.all([
        supabase
          .from('driver_shifts')
          .select('*, driver:drivers(id,name,phone,vehicle,plate,status), vehicle:vehicles(id,registration,make,model,type,colour,assigned_driver_id)')
          .gte('shift_date', firstDay)
          .lte('shift_date', lastDay)
          .order('shift_date', { ascending: true })
          .order('start_time', { ascending: true }),
        supabase.from('drivers').select('id,name,phone,vehicle,plate,status').eq('is_active', true).eq('is_archived', false).order('name'),
        supabase.from('vehicles').select('id,registration,make,model,type,colour,assigned_driver_id').eq('is_active', true).order('registration'),
        supabase.from('shift_templates').select('*').eq('is_active', true).order('name'),
      ]);

      if (shiftsRes.error) throw shiftsRes.error;
      if (driversRes.error) throw driversRes.error;
      if (vehiclesRes.error) throw vehiclesRes.error;
      if (templatesRes.error) throw templatesRes.error;

      setShifts((shiftsRes.data as DriverShift[]) || []);
      setDrivers((driversRes.data as Driver[]) || []);
      setVehicles((vehiclesRes.data as Vehicle[]) || []);
      setTemplates((templatesRes.data as ShiftTemplate[]) || []);
    } catch (err: any) {
      toast.error('Failed to load shift data');
    } finally {
      setLoading(false);
    }
  }, [currentDate]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ─── Shift CRUD ─────────────────────────────────────────────────────────────

  const openCreateShift = (date?: string) => {
    setEditingShift(null);
    setShiftForm({
      ...EMPTY_SHIFT,
      shift_date: date || new Date().toISOString().split('T')[0],
    });
    setShowShiftModal(true);
  };

  const openEditShift = (shift: DriverShift) => {
    setEditingShift(shift);
    setShiftForm({
      driver_id: shift.driver_id,
      vehicle_id: shift.vehicle_id || '',
      shift_date: shift.shift_date,
      start_time: shift.start_time || '08:00',
      end_time: shift.end_time || '16:00',
      break_minutes: shift.break_minutes,
      shift_type: shift.shift_type,
      pay_type: shift.pay_type,
      status: shift.status,
      notes: shift.notes || '',
    });
    setShowShiftModal(true);
  };

  const saveShift = async () => {
    if (!shiftForm.driver_id) { toast.error('Please select a driver'); return; }
    if (!shiftForm.shift_date) { toast.error('Please select a date'); return; }
    setSaving(true);
    try {
      const payload = {
        driver_id: shiftForm.driver_id,
        vehicle_id: shiftForm.vehicle_id || null,
        shift_date: shiftForm.shift_date,
        start_time: shiftForm.start_time,
        end_time: shiftForm.end_time,
        clock_in: `${shiftForm.shift_date}T${shiftForm.start_time}:00`,
        break_minutes: shiftForm.break_minutes,
        shift_type: shiftForm.shift_type,
        pay_type: shiftForm.pay_type,
        status: shiftForm.status,
        notes: shiftForm.notes || null,
        is_manual: true,
        updated_at: new Date().toISOString(),
      };

      if (editingShift) {
        const { error } = await supabase.from('driver_shifts').update(payload).eq('id', editingShift.id);
        if (error) throw error;
        toast.success('Shift updated');
      } else {
        const { error } = await supabase.from('driver_shifts').insert({ ...payload, created_at: new Date().toISOString() });
        if (error) throw error;
        toast.success('Shift created');
      }
      setShowShiftModal(false);
      fetchAll();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save shift');
    } finally {
      setSaving(false);
    }
  };

  const deleteShift = async (id: string) => {
    try {
      const { error } = await supabase.from('driver_shifts').delete().eq('id', id);
      if (error) throw error;
      toast.success('Shift deleted');
      setShowDeleteConfirm(null);
      fetchAll();
    } catch (err: any) {
      toast.error('Failed to delete shift');
    }
  };

  // ─── Template CRUD ──────────────────────────────────────────────────────────

  const openCreateTemplate = () => {
    setEditingTemplate(null);
    setTemplateForm(EMPTY_TEMPLATE);
    setShowTemplateModal(true);
  };

  const openEditTemplate = (t: ShiftTemplate) => {
    setEditingTemplate(t);
    setTemplateForm({
      name: t.name,
      shift_type: t.shift_type,
      start_time: t.start_time,
      end_time: t.end_time,
      break_minutes: t.break_minutes,
      recurrence_days: t.recurrence_days || [],
      notes: t.notes || '',
    });
    setShowTemplateModal(true);
  };

  const saveTemplate = async () => {
    if (!templateForm.name.trim()) { toast.error('Template name is required'); return; }
    setSaving(true);
    try {
      const payload = {
        name: templateForm.name,
        shift_type: templateForm.shift_type,
        start_time: templateForm.start_time,
        end_time: templateForm.end_time,
        break_minutes: templateForm.break_minutes,
        recurrence_days: templateForm.recurrence_days,
        notes: templateForm.notes || null,
        updated_at: new Date().toISOString(),
      };
      if (editingTemplate) {
        const { error } = await supabase.from('shift_templates').update(payload).eq('id', editingTemplate.id);
        if (error) throw error;
        toast.success('Template updated');
      } else {
        const { error } = await supabase.from('shift_templates').insert({ ...payload, is_active: true });
        if (error) throw error;
        toast.success('Template created');
      }
      setShowTemplateModal(false);
      fetchAll();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  const deleteTemplate = async (id: string) => {
    try {
      const { error } = await supabase.from('shift_templates').update({ is_active: false }).eq('id', id);
      if (error) throw error;
      toast.success('Template removed');
      fetchAll();
    } catch {
      toast.error('Failed to remove template');
    }
  };

  // ─── Bulk Apply ─────────────────────────────────────────────────────────────

  const applyBulkTemplate = async () => {
    if (!bulkForm.template_id) { toast.error('Select a template'); return; }
    if (!bulkForm.driver_ids.length) { toast.error('Select at least one driver'); return; }
    if (!bulkForm.start_date || !bulkForm.end_date) { toast.error('Select date range'); return; }

    const tpl = templates.find(t => t.id === bulkForm.template_id);
    if (!tpl) return;

    setSaving(true);
    try {
      const start = new Date(bulkForm.start_date);
      const end = new Date(bulkForm.end_date);
      const inserts: any[] = [];

      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dayOfWeek = d.getDay();
        if (!tpl.recurrence_days.length || tpl.recurrence_days.includes(dayOfWeek)) {
          const dateStr = d.toISOString().split('T')[0];
          for (const driverId of bulkForm.driver_ids) {
            inserts.push({
              driver_id: driverId,
              vehicle_id: bulkForm.vehicle_id || null,
              shift_date: dateStr,
              start_time: tpl.start_time,
              end_time: tpl.end_time,
              clock_in: `${dateStr}T${tpl.start_time}:00`,
              break_minutes: tpl.break_minutes,
              shift_type: tpl.shift_type,
              pay_type: 'hourly',
              status: 'scheduled',
              notes: `From template: ${tpl.name}`,
              is_manual: false,
            });
          }
        }
      }

      if (!inserts.length) { toast.error('No matching days found in range'); setSaving(false); return; }

      const { error } = await supabase.from('driver_shifts').insert(inserts);
      if (error) throw error;
      toast.success(`Created ${inserts.length} shifts`);
      setShowBulkModal(false);
      setBulkForm(EMPTY_BULK);
      fetchAll();
    } catch (err: any) {
      toast.error(err.message || 'Failed to apply template');
    } finally {
      setSaving(false);
    }
  };

  // ─── Calendar Helpers ───────────────────────────────────────────────────────

  const getDaysInMonth = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days: (number | null)[] = Array(firstDay).fill(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(i);
    while (days.length % 7 !== 0) days.push(null);
    return days;
  };

  const getShiftsForDate = (day: number) => {
    const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return shifts.filter(s => s.shift_date === dateStr);
  };

  const formatDateStr = (day: number) =>
    `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  const isToday = (day: number) => {
    const today = new Date();
    return day === today.getDate() && currentDate.getMonth() === today.getMonth() && currentDate.getFullYear() === today.getFullYear();
  };

  // ─── Filtered List ──────────────────────────────────────────────────────────

  const filteredShifts = shifts.filter(s => {
    if (filterDriver && s.driver_id !== filterDriver) return false;
    if (filterStatus && s.status !== filterStatus) return false;
    return true;
  });

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-auto" style={{ backgroundColor: 'hsl(var(--background))' }}>
      {/* Header */}
      <div className="px-6 py-5 border-b flex-shrink-0" style={{ borderColor: 'hsl(var(--border))' }}>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'hsl(var(--foreground))' }}>Driver Shifts</h1>
            <p className="text-sm mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Schedule and manage driver shifts, assign vehicles, and apply recurring templates
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setShowBulkModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors hover:bg-secondary"
              style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
            >
              <Repeat size={15} />
              Bulk Apply
            </button>
            <button
              onClick={() => { setActiveTab('templates'); setShowTemplateModal(true); openCreateTemplate(); }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors hover:bg-secondary"
              style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
            >
              <LayoutTemplate size={15} />
              Templates
            </button>
            <button
              onClick={() => openCreateShift()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
              style={{ backgroundColor: 'hsl(var(--primary))' }}
            >
              <Plus size={15} />
              New Shift
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-4">
          {(['shifts', 'templates'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium capitalize transition-colors ${activeTab === tab ? 'text-white' : 'hover:bg-secondary'}`}
              style={activeTab === tab ? { backgroundColor: 'hsl(var(--primary))' } : { color: 'hsl(var(--muted-foreground))' }}
            >
              {tab === 'shifts' ? 'Shift Schedule' : 'Shift Templates'}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 p-6 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 size={28} className="animate-spin" style={{ color: 'hsl(var(--primary))' }} />
          </div>
        ) : activeTab === 'shifts' ? (
          <>
            {/* Shift Controls */}
            <div className="flex items-center justify-between gap-4 mb-5 flex-wrap">
              <div className="flex items-center gap-2">
                <button onClick={() => setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
                  className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
                  <ChevronLeft size={18} style={{ color: 'hsl(var(--foreground))' }} />
                </button>
                <span className="text-base font-semibold min-w-[160px] text-center" style={{ color: 'hsl(var(--foreground))' }}>
                  {MONTH_NAMES[currentDate.getMonth()]} {currentDate.getFullYear()}
                </span>
                <button onClick={() => setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
                  className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
                  <ChevronRight size={18} style={{ color: 'hsl(var(--foreground))' }} />
                </button>
                <button onClick={() => setCurrentDate(new Date())}
                  className="px-3 py-1 text-xs rounded-md border hover:bg-secondary transition-colors"
                  style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}>
                  Today
                </button>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {/* Filters */}
                <select
                  value={filterDriver}
                  onChange={e => setFilterDriver(e.target.value)}
                  className="text-sm px-3 py-1.5 rounded-lg border bg-transparent"
                  style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                >
                  <option value="">All Drivers</option>
                  {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <select
                  value={filterStatus}
                  onChange={e => setFilterStatus(e.target.value)}
                  className="text-sm px-3 py-1.5 rounded-lg border bg-transparent"
                  style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                >
                  <option value="">All Statuses</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
                {/* View toggle */}
                <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: 'hsl(var(--border))' }}>
                  <button
                    onClick={() => setViewMode('calendar')}
                    className={`px-3 py-1.5 text-sm flex items-center gap-1.5 transition-colors ${viewMode === 'calendar' ? 'text-white' : 'hover:bg-secondary'}`}
                    style={viewMode === 'calendar' ? { backgroundColor: 'hsl(var(--primary))' } : { color: 'hsl(var(--muted-foreground))' }}
                  >
                    <CalendarDays size={14} /> Calendar
                  </button>
                  <button
                    onClick={() => setViewMode('list')}
                    className={`px-3 py-1.5 text-sm flex items-center gap-1.5 transition-colors ${viewMode === 'list' ? 'text-white' : 'hover:bg-secondary'}`}
                    style={viewMode === 'list' ? { backgroundColor: 'hsl(var(--primary))' } : { color: 'hsl(var(--muted-foreground))' }}
                  >
                    <List size={14} /> List
                  </button>
                </div>
                <button onClick={fetchAll} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
                  <RefreshCw size={16} style={{ color: 'hsl(var(--muted-foreground))' }} />
                </button>
              </div>
            </div>

            {/* Calendar View */}
            {viewMode === 'calendar' && (
              <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'hsl(var(--border))' }}>
                {/* Day headers */}
                <div className="grid grid-cols-7 border-b" style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--card))' }}>
                  {DAY_NAMES.map(d => (
                    <div key={d} className="py-2 text-center text-xs font-semibold uppercase tracking-wide"
                      style={{ color: 'hsl(var(--muted-foreground))' }}>{d}</div>
                  ))}
                </div>
                {/* Calendar grid */}
                <div className="grid grid-cols-7" style={{ backgroundColor: 'hsl(var(--background))' }}>
                  {getDaysInMonth().map((day, idx) => {
                    const dayShifts = day ? getShiftsForDate(day).filter(s =>
                      (!filterDriver || s.driver_id === filterDriver) &&
                      (!filterStatus || s.status === filterStatus)
                    ) : [];
                    const dateStr = day ? formatDateStr(day) : '';
                    const isSelected = selectedDate === dateStr;
                    return (
                      <div
                        key={idx}
                        onClick={() => day && setSelectedDate(isSelected ? null : dateStr)}
                        className={`min-h-[110px] border-b border-r p-1.5 cursor-pointer transition-colors ${day ? 'hover:bg-secondary/50' : ''} ${isSelected ? 'ring-2 ring-inset' : ''}`}
                        style={{
                          borderColor: 'hsl(var(--border))',
                          backgroundColor: isSelected ? 'hsl(var(--primary) / 0.05)' : undefined,
                          ...(isSelected ? { '--tw-ring-color': 'hsl(var(--primary))' } as any : {}),
                        }}
                      >
                        {day && (
                          <>
                            <div className="flex items-center justify-between mb-1">
                              <span
                                className={`text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full ${isToday(day) ? 'text-white' : ''}`}
                                style={isToday(day) ? { backgroundColor: 'hsl(var(--primary))' } : { color: 'hsl(var(--foreground))' }}
                              >
                                {day}
                              </span>
                              <button
                                onClick={e => { e.stopPropagation(); openCreateShift(dateStr); }}
                                className="opacity-0 group-hover:opacity-100 hover:opacity-100 p-0.5 rounded hover:bg-secondary transition-all"
                                title="Add shift"
                              >
                                <Plus size={12} style={{ color: 'hsl(var(--muted-foreground))' }} />
                              </button>
                            </div>
                            <div className="space-y-0.5">
                              {dayShifts.slice(0, 3).map(shift => (
                                <div
                                  key={shift.id}
                                  onClick={e => { e.stopPropagation(); openEditShift(shift); }}
                                  className={`text-[10px] px-1.5 py-0.5 rounded border-l-2 truncate cursor-pointer hover:opacity-80 transition-opacity ${SHIFT_TYPE_COLORS[shift.shift_type]}`}
                                  style={{ backgroundColor: 'hsl(var(--card))' }}
                                  title={`${shift.driver?.name} — ${shift.start_time}–${shift.end_time}`}
                                >
                                  <span style={{ color: 'hsl(var(--foreground))' }}>{shift.driver?.name?.split(' ')[0]}</span>
                                  <span className="ml-1" style={{ color: 'hsl(var(--muted-foreground))' }}>{shift.start_time?.slice(0, 5)}</span>
                                </div>
                              ))}
                              {dayShifts.length > 3 && (
                                <div className="text-[10px] px-1 font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                  +{dayShifts.length - 3} more
                                </div>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Selected Day Detail */}
            {viewMode === 'calendar' && selectedDate && (
              <div className="mt-4 rounded-xl border p-4" style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--card))' }}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-sm" style={{ color: 'hsl(var(--foreground))' }}>
                    Shifts for {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </h3>
                  <button onClick={() => openCreateShift(selectedDate)}
                    className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg text-white"
                    style={{ backgroundColor: 'hsl(var(--primary))' }}>
                    <Plus size={12} /> Add Shift
                  </button>
                </div>
                <ShiftList
                  shifts={shifts.filter(s => s.shift_date === selectedDate)}
                  onEdit={openEditShift}
                  onDelete={id => setShowDeleteConfirm(id)}
                />
              </div>
            )}

            {/* List View */}
            {viewMode === 'list' && (
              <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'hsl(var(--border))' }}>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b" style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--card))' }}>
                        {['Date', 'Driver', 'Vehicle', 'Time', 'Break', 'Hours', 'Type', 'Status', ''].map(h => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide"
                            style={{ color: 'hsl(var(--muted-foreground))' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredShifts.length === 0 ? (
                        <tr><td colSpan={9} className="px-4 py-12 text-center text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                          No shifts found for this month
                        </td></tr>
                      ) : filteredShifts.map(shift => {
                        const hours = shift.start_time && shift.end_time ? calcHours(shift.start_time, shift.end_time, shift.break_minutes) : 0;
                        const sc = STATUS_COLORS[shift.status];
                        return (
                          <tr key={shift.id} className="border-b hover:bg-secondary/30 transition-colors"
                            style={{ borderColor: 'hsl(var(--border))' }}>
                            <td className="px-4 py-3 font-medium text-xs" style={{ color: 'hsl(var(--foreground))' }}>
                              {new Date(shift.shift_date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                                  style={{ backgroundColor: 'hsl(var(--primary))' }}>
                                  {shift.driver?.name?.charAt(0) || '?'}
                                </div>
                                <span className="text-xs font-medium" style={{ color: 'hsl(var(--foreground))' }}>{shift.driver?.name || '—'}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                              {shift.vehicle ? `${shift.vehicle.make} ${shift.vehicle.model}` : '—'}
                              {shift.vehicle && <div className="text-[10px]">{shift.vehicle.registration}</div>}
                            </td>
                            <td className="px-4 py-3 text-xs font-mono" style={{ color: 'hsl(var(--foreground))' }}>
                              {shift.start_time?.slice(0, 5)} – {shift.end_time?.slice(0, 5)}
                            </td>
                            <td className="px-4 py-3 text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                              {shift.break_minutes}m
                            </td>
                            <td className="px-4 py-3 text-xs font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
                              {hours.toFixed(1)}h
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-[10px] px-2 py-0.5 rounded-full capitalize font-medium"
                                style={{ backgroundColor: 'hsl(var(--secondary))', color: 'hsl(var(--foreground))' }}>
                                {shift.shift_type}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`text-[10px] px-2 py-0.5 rounded-full capitalize font-medium ${sc.bg} ${sc.text}`}>
                                {shift.status}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1">
                                <button onClick={() => openEditShift(shift)}
                                  className="p-1 rounded hover:bg-secondary transition-colors">
                                  <Edit2 size={13} style={{ color: 'hsl(var(--muted-foreground))' }} />
                                </button>
                                <button onClick={() => setShowDeleteConfirm(shift.id)}
                                  className="p-1 rounded hover:bg-secondary transition-colors">
                                  <Trash2 size={13} className="text-red-400" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        ) : (
          /* Templates Tab */
          <div>
            <div className="flex items-center justify-between mb-5">
              <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                Define reusable shift patterns for bulk scheduling
              </p>
              <button onClick={openCreateTemplate}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white"
                style={{ backgroundColor: 'hsl(var(--primary))' }}>
                <Plus size={15} /> New Template
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.length === 0 ? (
                <div className="col-span-3 text-center py-16 text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  No templates yet. Create one to enable bulk shift scheduling.
                </div>
              ) : templates.map(tpl => {
                const hours = calcHours(tpl.start_time, tpl.end_time, tpl.break_minutes);
                return (
                  <div key={tpl.id} className="rounded-xl border p-4 flex flex-col gap-3"
                    style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--card))' }}>
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold text-sm" style={{ color: 'hsl(var(--foreground))' }}>{tpl.name}</h3>
                        <span className="text-[10px] px-2 py-0.5 rounded-full capitalize font-medium mt-1 inline-block"
                          style={{ backgroundColor: 'hsl(var(--secondary))', color: 'hsl(var(--muted-foreground))' }}>
                          {tpl.shift_type}
                        </span>
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => openEditTemplate(tpl)}
                          className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
                          <Edit2 size={13} style={{ color: 'hsl(var(--muted-foreground))' }} />
                        </button>
                        <button onClick={() => deleteTemplate(tpl.id)}
                          className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
                          <Trash2 size={13} className="text-red-400" />
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="flex items-center gap-1.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        <Clock size={12} />
                        <span>{tpl.start_time.slice(0, 5)} – {tpl.end_time.slice(0, 5)}</span>
                      </div>
                      <div className="flex items-center gap-1.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        <Coffee size={12} />
                        <span>{tpl.break_minutes}m break</span>
                      </div>
                      <div className="flex items-center gap-1.5 col-span-2" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        <CalendarDays size={12} />
                        <span>{hours.toFixed(1)}h net · {tpl.recurrence_days.length ? tpl.recurrence_days.map(d => DAY_NAMES[d]).join(', ') : 'Any day'}</span>
                      </div>
                    </div>
                    {tpl.notes && (
                      <p className="text-[11px] italic" style={{ color: 'hsl(var(--muted-foreground))' }}>{tpl.notes}</p>
                    )}
                    <button
                      onClick={() => { setBulkForm({ ...EMPTY_BULK, template_id: tpl.id }); setShowBulkModal(true); }}
                      className="mt-auto flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium border hover:bg-secondary transition-colors"
                      style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}>
                      <Repeat size={12} /> Apply to Drivers
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Shift Modal ─────────────────────────────────────────────────────── */}
      {showShiftModal && (
        <Modal title={editingShift ? 'Edit Shift' : 'Create Shift'} onClose={() => setShowShiftModal(false)}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Driver *">
                <select value={shiftForm.driver_id} onChange={e => setShiftForm(f => ({ ...f, driver_id: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border text-sm bg-transparent"
                  style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}>
                  <option value="">Select driver</option>
                  {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </FormField>
              <FormField label="Vehicle">
                <select value={shiftForm.vehicle_id} onChange={e => setShiftForm(f => ({ ...f, vehicle_id: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border text-sm bg-transparent"
                  style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}>
                  <option value="">No vehicle</option>
                  {vehicles.map(v => <option key={v.id} value={v.id}>{v.make} {v.model} ({v.registration})</option>)}
                </select>
              </FormField>
            </div>
            <FormField label="Shift Date *">
              <input type="date" value={shiftForm.shift_date} onChange={e => setShiftForm(f => ({ ...f, shift_date: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border text-sm bg-transparent"
                style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }} />
            </FormField>
            <div className="grid grid-cols-3 gap-4">
              <FormField label="Start Time">
                <input type="time" value={shiftForm.start_time} onChange={e => setShiftForm(f => ({ ...f, start_time: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border text-sm bg-transparent"
                  style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }} />
              </FormField>
              <FormField label="End Time">
                <input type="time" value={shiftForm.end_time} onChange={e => setShiftForm(f => ({ ...f, end_time: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border text-sm bg-transparent"
                  style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }} />
              </FormField>
              <FormField label="Break (mins)">
                <input type="number" min={0} max={120} value={shiftForm.break_minutes}
                  onChange={e => setShiftForm(f => ({ ...f, break_minutes: Number(e.target.value) }))}
                  className="w-full px-3 py-2 rounded-lg border text-sm bg-transparent"
                  style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }} />
              </FormField>
            </div>
            {/* Hours preview */}
            {shiftForm.start_time && shiftForm.end_time && (
              <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg"
                style={{ backgroundColor: 'hsl(var(--secondary))', color: 'hsl(var(--muted-foreground))' }}>
                <Clock size={12} />
                Net hours: <strong style={{ color: 'hsl(var(--foreground))' }}>
                  {calcHours(shiftForm.start_time, shiftForm.end_time, shiftForm.break_minutes).toFixed(1)}h
                </strong>
                (after {shiftForm.break_minutes}m break)
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Shift Type">
                <select value={shiftForm.shift_type} onChange={e => setShiftForm(f => ({ ...f, shift_type: e.target.value as ShiftType }))}
                  className="w-full px-3 py-2 rounded-lg border text-sm bg-transparent"
                  style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}>
                  <option value="regular">Regular</option>
                  <option value="overtime">Overtime</option>
                  <option value="weekend">Weekend</option>
                  <option value="night">Night</option>
                </select>
              </FormField>
              <FormField label="Status">
                <select value={shiftForm.status} onChange={e => setShiftForm(f => ({ ...f, status: e.target.value as ShiftStatus }))}
                  className="w-full px-3 py-2 rounded-lg border text-sm bg-transparent"
                  style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}>
                  <option value="scheduled">Scheduled</option>
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </FormField>
            </div>
            <FormField label="Notes">
              <textarea value={shiftForm.notes} onChange={e => setShiftForm(f => ({ ...f, notes: e.target.value }))}
                rows={2} placeholder="Optional notes..."
                className="w-full px-3 py-2 rounded-lg border text-sm bg-transparent resize-none"
                style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }} />
            </FormField>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowShiftModal(false)}
                className="px-4 py-2 rounded-lg text-sm border hover:bg-secondary transition-colors"
                style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}>
                Cancel
              </button>
              <button onClick={saveShift} disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-60"
                style={{ backgroundColor: 'hsl(var(--primary))' }}>
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {editingShift ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Template Modal ───────────────────────────────────────────────────── */}
      {showTemplateModal && (
        <Modal title={editingTemplate ? 'Edit Template' : 'New Shift Template'} onClose={() => setShowTemplateModal(false)}>
          <div className="space-y-4">
            <FormField label="Template Name *">
              <input type="text" value={templateForm.name} onChange={e => setTemplateForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Morning Shift"
                className="w-full px-3 py-2 rounded-lg border text-sm bg-transparent"
                style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }} />
            </FormField>
            <div className="grid grid-cols-3 gap-4">
              <FormField label="Start Time">
                <input type="time" value={templateForm.start_time} onChange={e => setTemplateForm(f => ({ ...f, start_time: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border text-sm bg-transparent"
                  style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }} />
              </FormField>
              <FormField label="End Time">
                <input type="time" value={templateForm.end_time} onChange={e => setTemplateForm(f => ({ ...f, end_time: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border text-sm bg-transparent"
                  style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }} />
              </FormField>
              <FormField label="Break (mins)">
                <input type="number" min={0} max={120} value={templateForm.break_minutes}
                  onChange={e => setTemplateForm(f => ({ ...f, break_minutes: Number(e.target.value) }))}
                  className="w-full px-3 py-2 rounded-lg border text-sm bg-transparent"
                  style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }} />
              </FormField>
            </div>
            <FormField label="Shift Type">
              <select value={templateForm.shift_type} onChange={e => setTemplateForm(f => ({ ...f, shift_type: e.target.value as ShiftType }))}
                className="w-full px-3 py-2 rounded-lg border text-sm bg-transparent"
                style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}>
                <option value="regular">Regular</option>
                <option value="overtime">Overtime</option>
                <option value="weekend">Weekend</option>
                <option value="night">Night</option>
              </select>
            </FormField>
            <FormField label="Recurring Days (leave empty for any day)">
              <div className="flex gap-2 flex-wrap">
                {FULL_DAY_NAMES.map((name, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setTemplateForm(f => ({
                      ...f,
                      recurrence_days: f.recurrence_days.includes(idx)
                        ? f.recurrence_days.filter(d => d !== idx)
                        : [...f.recurrence_days, idx],
                    }))}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${templateForm.recurrence_days.includes(idx) ? 'text-white border-transparent' : 'hover:bg-secondary'}`}
                    style={templateForm.recurrence_days.includes(idx)
                      ? { backgroundColor: 'hsl(var(--primary))', borderColor: 'transparent' }
                      : { borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}
                  >
                    {DAY_NAMES[idx]}
                  </button>
                ))}
              </div>
            </FormField>
            <FormField label="Notes">
              <textarea value={templateForm.notes} onChange={e => setTemplateForm(f => ({ ...f, notes: e.target.value }))}
                rows={2} placeholder="Optional description..."
                className="w-full px-3 py-2 rounded-lg border text-sm bg-transparent resize-none"
                style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }} />
            </FormField>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowTemplateModal(false)}
                className="px-4 py-2 rounded-lg text-sm border hover:bg-secondary transition-colors"
                style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}>
                Cancel
              </button>
              <button onClick={saveTemplate} disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-60"
                style={{ backgroundColor: 'hsl(var(--primary))' }}>
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {editingTemplate ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Bulk Apply Modal ─────────────────────────────────────────────────── */}
      {showBulkModal && (
        <Modal title="Bulk Apply Shift Template" onClose={() => setShowBulkModal(false)}>
          <div className="space-y-4">
            <FormField label="Template *">
              <select value={bulkForm.template_id} onChange={e => setBulkForm(f => ({ ...f, template_id: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border text-sm bg-transparent"
                style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}>
                <option value="">Select template</option>
                {templates.map(t => <option key={t.id} value={t.id}>{t.name} ({t.start_time.slice(0, 5)}–{t.end_time.slice(0, 5)})</option>)}
              </select>
            </FormField>
            <FormField label="Drivers * (select multiple)">
              <div className="border rounded-lg max-h-40 overflow-y-auto p-2 space-y-1"
                style={{ borderColor: 'hsl(var(--border))' }}>
                {drivers.map(d => (
                  <label key={d.id} className="flex items-center gap-2 cursor-pointer hover:bg-secondary/50 px-2 py-1 rounded">
                    <input type="checkbox"
                      checked={bulkForm.driver_ids.includes(d.id)}
                      onChange={e => setBulkForm(f => ({
                        ...f,
                        driver_ids: e.target.checked ? [...f.driver_ids, d.id] : f.driver_ids.filter(id => id !== d.id),
                      }))}
                      className="rounded" />
                    <span className="text-sm" style={{ color: 'hsl(var(--foreground))' }}>{d.name}</span>
                    <span className="text-xs ml-auto" style={{ color: 'hsl(var(--muted-foreground))' }}>{d.vehicle}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
                {bulkForm.driver_ids.length} driver{bulkForm.driver_ids.length !== 1 ? 's' : ''} selected
              </p>
            </FormField>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Start Date *">
                <input type="date" value={bulkForm.start_date} onChange={e => setBulkForm(f => ({ ...f, start_date: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border text-sm bg-transparent"
                  style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }} />
              </FormField>
              <FormField label="End Date *">
                <input type="date" value={bulkForm.end_date} onChange={e => setBulkForm(f => ({ ...f, end_date: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border text-sm bg-transparent"
                  style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }} />
              </FormField>
            </div>
            <FormField label="Vehicle (optional)">
              <select value={bulkForm.vehicle_id} onChange={e => setBulkForm(f => ({ ...f, vehicle_id: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border text-sm bg-transparent"
                style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}>
                <option value="">No vehicle</option>
                {vehicles.map(v => <option key={v.id} value={v.id}>{v.make} {v.model} ({v.registration})</option>)}
              </select>
            </FormField>
            {bulkForm.template_id && (
              <div className="text-xs px-3 py-2 rounded-lg" style={{ backgroundColor: 'hsl(var(--secondary))', color: 'hsl(var(--muted-foreground))' }}>
                {(() => {
                  const tpl = templates.find(t => t.id === bulkForm.template_id);
                  if (!tpl) return null;
                  return tpl.recurrence_days.length
                    ? `Shifts will be created on: ${tpl.recurrence_days.map(d => FULL_DAY_NAMES[d]).join(', ')} only`
                    : 'Shifts will be created on every day in the range';
                })()}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowBulkModal(false)}
                className="px-4 py-2 rounded-lg text-sm border hover:bg-secondary transition-colors"
                style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}>
                Cancel
              </button>
              <button onClick={applyBulkTemplate} disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-60"
                style={{ backgroundColor: 'hsl(var(--primary))' }}>
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Repeat size={14} />}
                Apply Template
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Delete Confirm ───────────────────────────────────────────────────── */}
      {showDeleteConfirm && (
        <Modal title="Delete Shift" onClose={() => setShowDeleteConfirm(null)}>
          <p className="text-sm mb-5" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Are you sure you want to delete this shift? This action cannot be undone.
          </p>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowDeleteConfirm(null)}
              className="px-4 py-2 rounded-lg text-sm border hover:bg-secondary transition-colors"
              style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}>
              Cancel
            </button>
            <button onClick={() => deleteShift(showDeleteConfirm)}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-red-500 hover:bg-red-600 transition-colors">
              Delete
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ShiftList({ shifts, onEdit, onDelete }: {
  shifts: DriverShift[];
  onEdit: (s: DriverShift) => void;
  onDelete: (id: string) => void;
}) {
  if (!shifts.length) {
    return <p className="text-sm text-center py-6" style={{ color: 'hsl(var(--muted-foreground))' }}>No shifts for this day</p>;
  }
  return (
    <div className="space-y-2">
      {shifts.map(shift => {
        const sc = STATUS_COLORS[shift.status];
        const hours = shift.start_time && shift.end_time ? calcHours(shift.start_time, shift.end_time, shift.break_minutes) : 0;
        return (
          <div key={shift.id} className={`flex items-center gap-3 p-3 rounded-lg border-l-2 ${SHIFT_TYPE_COLORS[shift.shift_type]}`}
            style={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }}>
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
              style={{ backgroundColor: 'hsl(var(--primary))' }}>
              {shift.driver?.name?.charAt(0) || '?'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium" style={{ color: 'hsl(var(--foreground))' }}>{shift.driver?.name}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${sc.bg} ${sc.text}`}>{shift.status}</span>
              </div>
              <div className="flex items-center gap-3 mt-0.5 text-xs flex-wrap" style={{ color: 'hsl(var(--muted-foreground))' }}>
                <span className="flex items-center gap-1"><Clock size={10} />{shift.start_time?.slice(0, 5)}–{shift.end_time?.slice(0, 5)}</span>
                <span className="flex items-center gap-1"><Coffee size={10} />{shift.break_minutes}m</span>
                <span>{hours.toFixed(1)}h net</span>
                {shift.vehicle && <span className="flex items-center gap-1"><Truck size={10} />{shift.vehicle.registration}</span>}
              </div>
            </div>
            <div className="flex gap-1 shrink-0">
              <button onClick={() => onEdit(shift)} className="p-1.5 rounded hover:bg-secondary transition-colors">
                <Edit2 size={13} style={{ color: 'hsl(var(--muted-foreground))' }} />
              </button>
              <button onClick={() => onDelete(shift.id)} className="p-1.5 rounded hover:bg-secondary transition-colors">
                <Trash2 size={13} className="text-red-400" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="w-full max-w-lg rounded-xl shadow-xl max-h-[90vh] overflow-y-auto"
        style={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'hsl(var(--border))' }}>
          <h2 className="font-semibold text-base" style={{ color: 'hsl(var(--foreground))' }}>{title}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-secondary transition-colors">
            <X size={16} style={{ color: 'hsl(var(--muted-foreground))' }} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--muted-foreground))' }}>{label}</label>
      {children}
    </div>
  );
}
