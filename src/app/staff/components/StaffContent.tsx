'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Users, Plus, Search, Upload, Edit2, UserX, UserCheck,
  Truck, ChevronDown, X, Check, AlertCircle, Loader2,
  Phone, Mail, Car, RefreshCw, Filter,
} from 'lucide-react';
import { toast } from 'sonner';
import Icon from '@/components/ui/AppIcon';


// ─── Types ────────────────────────────────────────────────────────────────────

type DriverStatus = 'Available' | 'On Route' | 'Off Duty';

interface Driver {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  vehicle: string;
  plate: string;
  status: DriverStatus;
  avatar: string;
  is_active: boolean;
  created_at: string;
}

interface Vehicle {
  id: string;
  registration: string;
  make: string;
  model: string;
  year: number | null;
  colour: string | null;
  type: string;
  is_active: boolean;
  assigned_driver_id: string | null;
}

interface DriverFormData {
  name: string;
  phone: string;
  email: string;
  vehicle: string;
  plate: string;
  status: DriverStatus;
  assigned_vehicle_id: string;
}

const EMPTY_FORM: DriverFormData = {
  name: '',
  phone: '',
  email: '',
  vehicle: '',
  plate: '',
  status: 'Available',
  assigned_vehicle_id: '',
};

const STATUS_COLOURS: Record<DriverStatus, string> = {
  Available: 'bg-green-100 text-green-700',
  'On Route': 'bg-orange-100 text-orange-700',
  'Off Duty': 'bg-gray-100 text-gray-500',
};

// ─── CSV Parser ───────────────────────────────────────────────────────────────

function parseCSV(text: string): Partial<DriverFormData>[] {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  return lines.slice(1).map((line) => {
    const values = line.split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] ?? ''; });
    return {
      name: row['name'] || row['full_name'] || '',
      phone: row['phone'] || row['phone_number'] || '',
      email: row['email'] || '',
      vehicle: row['vehicle'] || row['vehicle_type'] || '',
      plate: row['plate'] || row['registration'] || row['reg'] || '',
      status: (['Available', 'On Route', 'Off Duty'].includes(row['status']) ? row['status'] : 'Available') as DriverStatus,
    };
  }).filter((r) => r.name);
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function StaffContent() {
  const supabase = createClient();

  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('active');
  const [availFilter, setAvailFilter] = useState<DriverStatus | 'all'>('all');

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null);
  const [form, setForm] = useState<DriverFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // CSV import state
  const [csvModalOpen, setCsvModalOpen] = useState(false);
  const [csvPreview, setCsvPreview] = useState<Partial<DriverFormData>[]>([]);
  const [csvImporting, setCsvImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Data Fetching ──────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: driversData }, { data: vehiclesData }] = await Promise.all([
        supabase.from('drivers').select('*').order('name'),
        supabase.from('vehicles').select('*').order('registration'),
      ]);
      setDrivers(driversData ?? []);
      setVehicles(vehiclesData ?? []);
    } catch {
      toast.error('Failed to load staff data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Real-time subscription — reflects driver availability changes from the Driver Portal
  useEffect(() => {
    const channel = supabase
      .channel('staff-drivers-realtime')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'drivers' },
        (payload) => {
          const updated = payload.new as Driver;
          setDrivers((prev) =>
            prev.map((d) => (d.id === updated.id ? { ...d, ...updated } : d))
          );
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'drivers' },
        () => {
          fetchData();
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);

  // ─── Filtered Drivers ───────────────────────────────────────────────────────

  const filtered = drivers.filter((d) => {
    const matchSearch =
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      d.phone.includes(search) ||
      (d.email ?? '').toLowerCase().includes(search.toLowerCase()) ||
      d.plate.toLowerCase().includes(search.toLowerCase());
    const matchStatus =
      statusFilter === 'all' ? true :
      statusFilter === 'active' ? d.is_active :
      !d.is_active;
    const matchAvail = availFilter === 'all' ? true : d.status === availFilter;
    return matchSearch && matchStatus && matchAvail;
  });

  // ─── Modal Helpers ──────────────────────────────────────────────────────────

  const openAdd = () => {
    setEditingDriver(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setModalOpen(true);
  };

  const openEdit = (driver: Driver) => {
    setEditingDriver(driver);
    const assignedVehicle = vehicles.find((v) => v.assigned_driver_id === driver.id);
    setForm({
      name: driver.name,
      phone: driver.phone,
      email: driver.email ?? '',
      vehicle: driver.vehicle,
      plate: driver.plate,
      status: driver.status,
      assigned_vehicle_id: assignedVehicle?.id ?? '',
    });
    setFormError('');
    setModalOpen(true);
  };

  const closeModal = () => { setModalOpen(false); setEditingDriver(null); };

  // ─── Save Driver ────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!form.name.trim()) { setFormError('Name is required'); return; }
    if (!form.phone.trim()) { setFormError('Phone is required'); return; }
    setSaving(true);
    setFormError('');
    try {
      const payload = {
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || null,
        vehicle: form.vehicle.trim(),
        plate: form.plate.trim().toUpperCase(),
        status: form.status,
      };

      let driverId = editingDriver?.id;

      if (editingDriver) {
        const { error } = await supabase.from('drivers').update(payload).eq('id', editingDriver.id);
        if (error) throw error;
        toast.success('Driver updated');
      } else {
        const { data, error } = await supabase.from('drivers').insert({ ...payload, avatar: '' }).select().single();
        if (error) throw error;
        driverId = data.id;
        toast.success('Driver added');
      }

      // Handle vehicle assignment
      if (driverId) {
        // Unassign this driver from any vehicle they were previously assigned to
        await supabase.from('vehicles').update({ assigned_driver_id: null }).eq('assigned_driver_id', driverId);

        if (form.assigned_vehicle_id) {
          // Unassign the selected vehicle from whoever had it
          await supabase.from('vehicles').update({ assigned_driver_id: null }).eq('id', form.assigned_vehicle_id);
          // Assign to this driver
          await supabase.from('vehicles').update({ assigned_driver_id: driverId }).eq('id', form.assigned_vehicle_id);
        }
      }

      closeModal();
      fetchData();
    } catch (err: any) {
      setFormError(err.message ?? 'Failed to save driver');
    } finally {
      setSaving(false);
    }
  };

  // ─── Deactivate / Reactivate ────────────────────────────────────────────────

  const toggleActive = async (driver: Driver) => {
    const newState = !driver.is_active;
    const { error } = await supabase.from('drivers').update({ is_active: newState }).eq('id', driver.id);
    if (error) { toast.error('Failed to update driver'); return; }
    toast.success(newState ? 'Driver reactivated' : 'Driver deactivated');
    setDrivers((prev) => prev.map((d) => d.id === driver.id ? { ...d, is_active: newState } : d));
  };

  // ─── Availability Status Quick-Change ───────────────────────────────────────

  const changeStatus = async (driver: Driver, status: DriverStatus) => {
    const { error } = await supabase.from('drivers').update({ status }).eq('id', driver.id);
    if (error) { toast.error('Failed to update status'); return; }
    setDrivers((prev) => prev.map((d) => d.id === driver.id ? { ...d, status } : d));
  };

  // ─── CSV Import ─────────────────────────────────────────────────────────────

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rows = parseCSV(text);
      if (rows.length === 0) { toast.error('No valid rows found in CSV'); return; }
      setCsvPreview(rows);
      setCsvModalOpen(true);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleCsvImport = async () => {
    setCsvImporting(true);
    try {
      const rows = csvPreview.map((r) => ({
        name: r.name ?? '',
        phone: r.phone ?? '',
        email: r.email || null,
        vehicle: r.vehicle ?? '',
        plate: (r.plate ?? '').toUpperCase(),
        status: r.status ?? 'Available',
        is_active: true,
      })).filter((r) => r.name);

      const { error } = await supabase.from('drivers').insert(rows);
      if (error) throw error;
      toast.success(`${rows.length} driver(s) imported`);
      setCsvModalOpen(false);
      setCsvPreview([]);
      fetchData();
    } catch (err: any) {
      toast.error(err.message ?? 'Import failed');
    } finally {
      setCsvImporting(false);
    }
  };

  // ─── Stats ──────────────────────────────────────────────────────────────────

  const activeCount = drivers.filter((d) => d.is_active).length;
  const availableCount = drivers.filter((d) => d.is_active && d.status === 'Available').length;
  const onRouteCount = drivers.filter((d) => d.is_active && d.status === 'On Route').length;
  const vehicleCount = vehicles.filter((v) => v.is_active).length;

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'hsl(var(--foreground))' }}>Staff Management</h1>
          <p className="text-sm mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Manage drivers, vehicle assignments, and availability
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchData()}
            className="p-2 rounded-lg border transition-colors hover:bg-secondary"
            style={{ borderColor: 'hsl(var(--border))' }}
            title="Refresh"
          >
            <RefreshCw size={16} style={{ color: 'hsl(var(--muted-foreground))' }} />
          </button>
          <label
            className="flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium cursor-pointer transition-colors hover:bg-secondary"
            style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
          >
            <Upload size={15} />
            Import CSV
            <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
          </label>
          <button
            onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
            style={{ backgroundColor: 'hsl(var(--primary))' }}
          >
            <Plus size={15} />
            Add Driver
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Active Drivers', value: activeCount, icon: Users, colour: 'hsl(var(--primary))' },
          { label: 'Available', value: availableCount, icon: UserCheck, colour: '#16a34a' },
          { label: 'On Route', value: onRouteCount, icon: Truck, colour: '#ea580c' },
          { label: 'Vehicles', value: vehicleCount, icon: Car, colour: '#7c3aed' },
        ].map(({ label, value, icon: Icon, colour }) => (
          <div
            key={label}
            className="rounded-xl border p-4 flex items-center gap-3"
            style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
          >
            <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${colour}18` }}>
              <Icon size={20} style={{ color: colour }} />
            </div>
            <div>
              <p className="text-2xl font-bold" style={{ color: 'hsl(var(--foreground))' }}>{value}</p>
              <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'hsl(var(--muted-foreground))' }} />
          <input
            type="text"
            placeholder="Search by name, phone, email or plate…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2"
            style={{
              backgroundColor: 'hsl(var(--background))',
              borderColor: 'hsl(var(--border))',
              color: 'hsl(var(--foreground))',
            }}
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter size={14} style={{ color: 'hsl(var(--muted-foreground))' }} />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-3 py-2 rounded-lg border text-sm focus:outline-none"
            style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
          >
            <option value="all">All Drivers</option>
            <option value="active">Active Only</option>
            <option value="inactive">Deactivated</option>
          </select>
          <select
            value={availFilter}
            onChange={(e) => setAvailFilter(e.target.value as any)}
            className="px-3 py-2 rounded-lg border text-sm focus:outline-none"
            style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
          >
            <option value="all">All Statuses</option>
            <option value="Available">Available</option>
            <option value="On Route">On Route</option>
            <option value="Off Duty">Off Duty</option>
          </select>
        </div>
      </div>

      {/* Driver Table */}
      <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin" style={{ color: 'hsl(var(--muted-foreground))' }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <Users size={32} style={{ color: 'hsl(var(--muted-foreground))' }} />
            <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>No drivers found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid hsl(var(--border))', backgroundColor: 'hsl(var(--secondary))' }}>
                  {['Driver', 'Contact', 'Vehicle / Plate', 'Availability', 'Status', 'Actions'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'hsl(var(--muted-foreground))' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((driver, idx) => {
                  const assignedVehicle = vehicles.find((v) => v.assigned_driver_id === driver.id);
                  return (
                    <tr
                      key={driver.id}
                      className={`transition-colors hover:bg-secondary/50 ${!driver.is_active ? 'opacity-50' : ''}`}
                      style={{ borderBottom: idx < filtered.length - 1 ? '1px solid hsl(var(--border))' : undefined }}
                    >
                      {/* Driver */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0"
                            style={{ backgroundColor: 'hsl(var(--primary) / 0.15)', color: 'hsl(var(--primary))' }}
                          >
                            {driver.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium" style={{ color: 'hsl(var(--foreground))' }}>{driver.name}</p>
                            {!driver.is_active && (
                              <span className="text-xs text-red-500 font-medium">Deactivated</span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Contact */}
                      <td className="px-4 py-3">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <Phone size={11} style={{ color: 'hsl(var(--muted-foreground))' }} />
                            <span style={{ color: 'hsl(var(--foreground))' }}>{driver.phone}</span>
                          </div>
                          {driver.email && (
                            <div className="flex items-center gap-1.5">
                              <Mail size={11} style={{ color: 'hsl(var(--muted-foreground))' }} />
                              <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>{driver.email}</span>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Vehicle */}
                      <td className="px-4 py-3">
                        {assignedVehicle ? (
                          <div>
                            <p className="font-medium" style={{ color: 'hsl(var(--foreground))' }}>
                              {assignedVehicle.make} {assignedVehicle.model}
                            </p>
                            <p className="text-xs font-mono" style={{ color: 'hsl(var(--muted-foreground))' }}>
                              {assignedVehicle.registration}
                            </p>
                          </div>
                        ) : driver.vehicle ? (
                          <div>
                            <p style={{ color: 'hsl(var(--foreground))' }}>{driver.vehicle}</p>
                            {driver.plate && (
                              <p className="text-xs font-mono" style={{ color: 'hsl(var(--muted-foreground))' }}>{driver.plate}</p>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>Unassigned</span>
                        )}
                      </td>

                      {/* Availability */}
                      <td className="px-4 py-3">
                        <div className="relative group inline-block">
                          <button
                            disabled={!driver.is_active}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_COLOURS[driver.status]} ${driver.is_active ? 'cursor-pointer' : 'cursor-default'}`}
                          >
                            {driver.status}
                            {driver.is_active && <ChevronDown size={11} />}
                          </button>
                          {driver.is_active && (
                            <div
                              className="absolute left-0 top-full mt-1 z-20 rounded-lg border shadow-lg overflow-hidden opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity"
                              style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', minWidth: '130px' }}
                            >
                              {(['Available', 'On Route', 'Off Duty'] as DriverStatus[]).map((s) => (
                                <button
                                  key={s}
                                  onClick={() => changeStatus(driver, s)}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-secondary transition-colors text-left"
                                  style={{ color: 'hsl(var(--foreground))' }}
                                >
                                  {driver.status === s && <Check size={11} className="text-green-600" />}
                                  {driver.status !== s && <span className="w-[11px]" />}
                                  {s}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Active Status */}
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${driver.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}
                        >
                          {driver.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => openEdit(driver)}
                            className="p-1.5 rounded-md hover:bg-secondary transition-colors"
                            title="Edit driver"
                          >
                            <Edit2 size={14} style={{ color: 'hsl(var(--muted-foreground))' }} />
                          </button>
                          <button
                            onClick={() => toggleActive(driver)}
                            className="p-1.5 rounded-md hover:bg-secondary transition-colors"
                            title={driver.is_active ? 'Deactivate driver' : 'Reactivate driver'}
                          >
                            {driver.is_active
                              ? <UserX size={14} className="text-red-500" />
                              : <UserCheck size={14} className="text-green-600" />
                            }
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div
            className="w-full max-w-lg rounded-2xl shadow-xl overflow-hidden"
            style={{ backgroundColor: 'hsl(var(--card))' }}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'hsl(var(--border))' }}>
              <h2 className="text-lg font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
                {editingDriver ? 'Edit Driver' : 'Add New Driver'}
              </h2>
              <button onClick={closeModal} className="p-1 rounded-md hover:bg-secondary transition-colors">
                <X size={18} style={{ color: 'hsl(var(--muted-foreground))' }} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
              {formError && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 text-red-600 text-sm">
                  <AlertCircle size={15} />
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-medium mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Full Name *</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. John Smith"
                    className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2"
                    style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Phone *</label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    placeholder="07700 000000"
                    className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2"
                    style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="driver@example.com"
                    className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2"
                    style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Vehicle Type</label>
                  <input
                    type="text"
                    value={form.vehicle}
                    onChange={(e) => setForm((f) => ({ ...f, vehicle: e.target.value }))}
                    placeholder="e.g. Ford Transit"
                    className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2"
                    style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Plate</label>
                  <input
                    type="text"
                    value={form.plate}
                    onChange={(e) => setForm((f) => ({ ...f, plate: e.target.value.toUpperCase() }))}
                    placeholder="AB21 XYZ"
                    className="w-full px-3 py-2 rounded-lg border text-sm font-mono focus:outline-none focus:ring-2"
                    style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Availability Status</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as DriverStatus }))}
                    className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2"
                    style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                  >
                    <option value="Available">Available</option>
                    <option value="On Route">On Route</option>
                    <option value="Off Duty">Off Duty</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Assign Vehicle</label>
                  <select
                    value={form.assigned_vehicle_id}
                    onChange={(e) => setForm((f) => ({ ...f, assigned_vehicle_id: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2"
                    style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                  >
                    <option value="">— No vehicle —</option>
                    {vehicles.filter((v) => v.is_active && (!v.assigned_driver_id || v.assigned_driver_id === editingDriver?.id)).map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.make} {v.model} — {v.registration}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t" style={{ borderColor: 'hsl(var(--border))' }}>
              <button
                onClick={closeModal}
                className="px-4 py-2 rounded-lg border text-sm font-medium transition-colors hover:bg-secondary"
                style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-60"
                style={{ backgroundColor: 'hsl(var(--primary))' }}
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                {editingDriver ? 'Save Changes' : 'Add Driver'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSV Preview Modal */}
      {csvModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div
            className="w-full max-w-2xl rounded-2xl shadow-xl overflow-hidden"
            style={{ backgroundColor: 'hsl(var(--card))' }}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'hsl(var(--border))' }}>
              <div>
                <h2 className="text-lg font-semibold" style={{ color: 'hsl(var(--foreground))' }}>CSV Import Preview</h2>
                <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  {csvPreview.length} driver(s) ready to import
                </p>
              </div>
              <button onClick={() => { setCsvModalOpen(false); setCsvPreview([]); }} className="p-1 rounded-md hover:bg-secondary transition-colors">
                <X size={18} style={{ color: 'hsl(var(--muted-foreground))' }} />
              </button>
            </div>

            <div className="px-6 py-4 max-h-[50vh] overflow-y-auto">
              <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'hsl(var(--border))' }}>
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ backgroundColor: 'hsl(var(--secondary))', borderBottom: '1px solid hsl(var(--border))' }}>
                      {['Name', 'Phone', 'Email', 'Vehicle', 'Plate', 'Status'].map((h) => (
                        <th key={h} className="px-3 py-2 text-left font-semibold uppercase tracking-wider" style={{ color: 'hsl(var(--muted-foreground))' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {csvPreview.map((row, i) => (
                      <tr key={i} style={{ borderBottom: i < csvPreview.length - 1 ? '1px solid hsl(var(--border))' : undefined }}>
                        <td className="px-3 py-2" style={{ color: 'hsl(var(--foreground))' }}>{row.name}</td>
                        <td className="px-3 py-2" style={{ color: 'hsl(var(--foreground))' }}>{row.phone}</td>
                        <td className="px-3 py-2" style={{ color: 'hsl(var(--muted-foreground))' }}>{row.email || '—'}</td>
                        <td className="px-3 py-2" style={{ color: 'hsl(var(--foreground))' }}>{row.vehicle || '—'}</td>
                        <td className="px-3 py-2 font-mono" style={{ color: 'hsl(var(--foreground))' }}>{row.plate || '—'}</td>
                        <td className="px-3 py-2">
                          <span className={`px-2 py-0.5 rounded-full font-medium ${STATUS_COLOURS[row.status ?? 'Available']}`}>
                            {row.status ?? 'Available'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-3 p-3 rounded-lg text-xs" style={{ backgroundColor: 'hsl(var(--secondary))', color: 'hsl(var(--muted-foreground))' }}>
                <strong>Expected CSV columns:</strong> name, phone, email, vehicle, plate, status
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t" style={{ borderColor: 'hsl(var(--border))' }}>
              <button
                onClick={() => { setCsvModalOpen(false); setCsvPreview([]); }}
                className="px-4 py-2 rounded-lg border text-sm font-medium transition-colors hover:bg-secondary"
                style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
              >
                Cancel
              </button>
              <button
                onClick={handleCsvImport}
                disabled={csvImporting}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-60"
                style={{ backgroundColor: 'hsl(var(--primary))' }}
              >
                {csvImporting && <Loader2 size={14} className="animate-spin" />}
                Import {csvPreview.length} Driver(s)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
