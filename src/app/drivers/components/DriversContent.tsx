'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Truck, Plus, Search, Edit2, UserX, UserCheck, Star, Phone, Mail, X, Loader2, RefreshCw, MapPin, FileText, Upload, Calendar, Eye, ShieldCheck, ShieldAlert, ShieldOff, CreditCard, Car, Hash, User, ChevronRight, CheckCircle2, Trash2, FileImage,  } from 'lucide-react';
import { toast } from 'sonner';
import Icon from '@/components/ui/AppIcon';


// ─── Types ────────────────────────────────────────────────────────────────────

type DriverStatus = 'Available' | 'On Route' | 'Off Duty';
type VerificationStatus = 'unverified' | 'pending' | 'verified' | 'rejected';
type DocType = 'license' | 'insurance' | 'other';

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
  is_archived: boolean;
  zone: string | null;
  created_at: string;
  verification_status: VerificationStatus;
  access_code: string | null;
  license_number?: string | null;
  license_expiry?: string | null;
  license_class?: string | null;
  address?: string | null;
  emergency_contact?: string | null;
  emergency_phone?: string | null;
  notes?: string | null;
}

interface DriverDocument {
  id: string;
  driver_id: string;
  doc_type: DocType;
  file_name: string;
  file_url: string;
  expiry_date: string | null;
  notes: string | null;
  uploaded_at: string;
}

interface DriverRating {
  driver_id: string;
  avg_rating: number;
  total_deliveries: number;
  successful_deliveries: number;
}

interface DriverFormData {
  name: string;
  phone: string;
  email: string;
  vehicle: string;
  plate: string;
  status: DriverStatus;
  zone: string;
  license_number: string;
  license_expiry: string;
  license_class: string;
  address: string;
  emergency_contact: string;
  emergency_phone: string;
  notes: string;
}

const EMPTY_FORM: DriverFormData = {
  name: '',
  phone: '',
  email: '',
  vehicle: '',
  plate: '',
  status: 'Available',
  zone: '',
  license_number: '',
  license_expiry: '',
  license_class: '',
  address: '',
  emergency_contact: '',
  emergency_phone: '',
  notes: '',
};

const STATUS_COLOURS: Record<DriverStatus, string> = {
  Available: 'bg-green-100 text-green-700',
  'On Route': 'bg-orange-100 text-orange-700',
  'Off Duty': 'bg-gray-100 text-gray-500',
};

const VERIFICATION_CONFIG: Record<VerificationStatus, { label: string; color: string; bg: string; Icon: React.ElementType }> = {
  unverified: { label: 'Unverified', color: '#9ca3af', bg: '#f3f4f6', Icon: ShieldOff },
  pending: { label: 'Pending Review', color: '#f59e0b', bg: '#fef3c7', Icon: ShieldAlert },
  verified: { label: 'Verified', color: '#22c55e', bg: '#dcfce7', Icon: ShieldCheck },
  rejected: { label: 'Rejected', color: '#ef4444', bg: '#fee2e2', Icon: ShieldAlert },
};

const DOC_TYPE_LABELS: Record<DocType, string> = {
  license: "Driver's Licence",
  insurance: 'Insurance',
  other: 'Other',
};

// ─── Star Rating ──────────────────────────────────────────────────────────────

function StarRating({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          size={size}
          className={s <= Math.round(rating) ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'}
        />
      ))}
    </div>
  );
}

// ─── Verification Badge ───────────────────────────────────────────────────────

function VerificationBadge({ status }: { status: VerificationStatus }) {
  const cfg = VERIFICATION_CONFIG[status] ?? VERIFICATION_CONFIG.unverified;
  const { Icon } = cfg;
  return (
    <span
      className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium"
      style={{ backgroundColor: cfg.bg, color: cfg.color }}
    >
      <Icon size={11} />
      {cfg.label}
    </span>
  );
}

// ─── Info Row ─────────────────────────────────────────────────────────────────

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: 'hsl(var(--secondary))' }}>
        <Icon size={14} style={{ color: 'hsl(var(--muted-foreground))' }} />
      </div>
      <div className="min-w-0">
        <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>{label}</p>
        <p className="text-sm font-medium truncate" style={{ color: 'hsl(var(--foreground))' }}>{value}</p>
      </div>
    </div>
  );
}

// ─── Section Header ───────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'hsl(var(--muted-foreground))' }}>{title}</p>
      <div className="flex-1 h-px" style={{ backgroundColor: 'hsl(var(--border))' }} />
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DriversContent() {
  const supabase = createClient();

  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [ratings, setRatings] = useState<Record<string, DriverRating>>({});
  const [documents, setDocuments] = useState<Record<string, DriverDocument[]>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null);
  const [form, setForm] = useState<DriverFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState<Driver | null>(null);

  // Document upload state
  const [docType, setDocType] = useState<DocType>('license');
  const [docExpiry, setDocExpiry] = useState('');
  const [docNotes, setDocNotes] = useState('');
  const [docFile, setDocFile] = useState<File | null>(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [showDocUpload, setShowDocUpload] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Fetch Drivers ──────────────────────────────────────────────────────────

  const fetchDrivers = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('drivers')
      .select('id, name, phone, email, vehicle, plate, status, avatar, is_active, is_archived, zone, created_at, verification_status, access_code')
      .eq('is_archived', false)
      .order('name');
    if (error) {
      toast.error('Failed to load drivers: ' + error.message);
    } else {
      const mapped = (data ?? []).map((d) => ({
        ...d,
        verification_status: (d.verification_status ?? 'unverified') as VerificationStatus,
      }));
      setDrivers(mapped);
      // Update selected driver if it exists
      if (selectedDriver) {
        const updated = mapped.find((d) => d.id === selectedDriver.id);
        if (updated) setSelectedDriver(updated);
      }
    }
    setLoading(false);
  }, [supabase, selectedDriver]);

  // ─── Fetch Ratings ──────────────────────────────────────────────────────────

  const fetchRatings = useCallback(async () => {
    const { data, error } = await supabase
      .from('driver_performance_logs')
      .select('driver_id, was_successful, customer_rating');
    if (error || !data) return;

    const map: Record<string, DriverRating> = {};
    data.forEach((row) => {
      if (!map[row.driver_id]) {
        map[row.driver_id] = { driver_id: row.driver_id, avg_rating: 0, total_deliveries: 0, successful_deliveries: 0 };
      }
      map[row.driver_id].total_deliveries++;
      if (row.was_successful) map[row.driver_id].successful_deliveries++;
    });

    const ratingMap: Record<string, number[]> = {};
    data.filter((r) => r.customer_rating != null).forEach((r) => {
      if (!ratingMap[r.driver_id]) ratingMap[r.driver_id] = [];
      ratingMap[r.driver_id].push(r.customer_rating);
    });
    Object.keys(ratingMap).forEach((dId) => {
      const arr = ratingMap[dId];
      if (map[dId]) map[dId].avg_rating = arr.reduce((a, b) => a + b, 0) / arr.length;
    });

    setRatings(map);
  }, [supabase]);

  // ─── Fetch Documents ────────────────────────────────────────────────────────

  const fetchDocuments = useCallback(async () => {
    const { data, error } = await supabase
      .from('driver_documents')
      .select('*')
      .order('uploaded_at', { ascending: false });
    if (error || !data) return;
    const map: Record<string, DriverDocument[]> = {};
    data.forEach((doc) => {
      if (!map[doc.driver_id]) map[doc.driver_id] = [];
      map[doc.driver_id].push(doc as DriverDocument);
    });
    setDocuments(map);
  }, [supabase]);

  useEffect(() => {
    fetchDrivers();
    fetchRatings();
    fetchDocuments();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Filtered list ──────────────────────────────────────────────────────────

  const filtered = drivers.filter((d) => {
    const q = search.toLowerCase();
    return (
      d.name.toLowerCase().includes(q) ||
      d.phone.includes(q) ||
      (d.email ?? '').toLowerCase().includes(q) ||
      d.plate.toLowerCase().includes(q) ||
      (d.vehicle ?? '').toLowerCase().includes(q)
    );
  });

  // ─── Form handlers ──────────────────────────────────────────────────────────

  function openAdd() {
    setEditingDriver(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function openEdit(driver: Driver) {
    setEditingDriver(driver);
    setForm({
      name: driver.name,
      phone: driver.phone,
      email: driver.email ?? '',
      vehicle: driver.vehicle,
      plate: driver.plate,
      status: driver.status,
      zone: driver.zone ?? '',
      license_number: (driver as Driver).license_number ?? '',
      license_expiry: (driver as Driver).license_expiry ?? '',
      license_class: (driver as Driver).license_class ?? '',
      address: (driver as Driver).address ?? '',
      emergency_contact: (driver as Driver).emergency_contact ?? '',
      emergency_phone: (driver as Driver).emergency_phone ?? '',
      notes: (driver as Driver).notes ?? '',
    });
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.name.trim() || !form.phone.trim()) {
      toast.error('Name and phone are required');
      return;
    }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim() || null,
      vehicle: form.vehicle.trim(),
      plate: form.plate.trim().toUpperCase(),
      status: form.status,
      zone: form.zone || null,
    };

    if (editingDriver) {
      const { error } = await supabase.from('drivers').update(payload).eq('id', editingDriver.id);
      if (error) { toast.error('Update failed: ' + error.message); }
      else {
        toast.success('Driver updated');
        setShowForm(false);
        fetchDrivers();
        fetchRatings();
      }
    } else {
      const { error } = await supabase.from('drivers').insert({
        ...payload,
        avatar: '',
        is_active: true,
        is_archived: false,
        verification_status: 'unverified',
      });
      if (error) { toast.error('Create failed: ' + error.message); }
      else {
        toast.success('Driver added');
        setShowForm(false);
        fetchDrivers();
      }
    }
    setSaving(false);
  }

  // ─── Deactivate ─────────────────────────────────────────────────────────────

  async function handleDeactivate(driver: Driver) {
    const { error } = await supabase
      .from('drivers')
      .update({ is_active: !driver.is_active })
      .eq('id', driver.id);
    if (error) toast.error('Failed: ' + error.message);
    else {
      toast.success(driver.is_active ? `${driver.name} deactivated` : `${driver.name} reactivated`);
      setConfirmDeactivate(null);
      fetchDrivers();
    }
  }

  // ─── Verification ────────────────────────────────────────────────────────────

  async function updateVerification(driver: Driver, status: VerificationStatus) {
    const { error } = await supabase.from('drivers').update({ verification_status: status }).eq('id', driver.id);
    if (error) toast.error('Failed to update verification: ' + error.message);
    else {
      toast.success(`${driver.name} marked as ${VERIFICATION_CONFIG[status].label}`);
      fetchDrivers();
    }
  }

  // ─── Document upload ────────────────────────────────────────────────────────

  async function handleDocUpload() {
    if (!selectedDriver || !docFile) {
      toast.error('Please select a file');
      return;
    }
    setUploadingDoc(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      const { error } = await supabase.from('driver_documents').insert({
        driver_id: selectedDriver.id,
        doc_type: docType,
        file_name: docFile.name,
        file_url: dataUrl,
        expiry_date: docExpiry || null,
        notes: docNotes || null,
      });
      if (error) {
        toast.error('Upload failed: ' + error.message);
      } else {
        toast.success(`${DOC_TYPE_LABELS[docType]} uploaded`);
        setShowDocUpload(false);
        setDocFile(null);
        setDocExpiry('');
        setDocNotes('');
        fetchDocuments();
      }
      setUploadingDoc(false);
    };
    reader.onerror = () => { toast.error('Failed to read file'); setUploadingDoc(false); };
    reader.readAsDataURL(docFile);
  }

  async function deleteDocument(docId: string) {
    const { error } = await supabase.from('driver_documents').delete().eq('id', docId);
    if (error) toast.error('Failed to delete document: ' + error.message);
    else { toast.success('Document removed'); fetchDocuments(); }
  }

  // ─── Stats ───────────────────────────────────────────────────────────────────

  const totalActive = drivers.filter((d) => d.is_active).length;
  const totalAvailable = drivers.filter((d) => d.is_active && d.status === 'Available').length;
  const totalOnRoute = drivers.filter((d) => d.is_active && d.status === 'On Route').length;
  const allRatings = Object.values(ratings).map((r) => r.avg_rating).filter((r) => r > 0);
  const fleetAvgRating = allRatings.length > 0 ? allRatings.reduce((a, b) => a + b, 0) / allRatings.length : 0;

  const selectedRating = selectedDriver ? ratings[selectedDriver.id] : null;
  const selectedDocs = selectedDriver ? (documents[selectedDriver.id] ?? []) : [];

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'hsl(var(--foreground))' }}>Drivers</h1>
          <p className="text-sm mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
            View and manage driver profiles, licences, and documents
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { fetchDrivers(); fetchRatings(); fetchDocuments(); }}
            className="p-2 rounded-lg border transition-colors hover:bg-secondary"
            style={{ borderColor: 'hsl(var(--border))' }}
            title="Refresh"
          >
            <RefreshCw size={16} style={{ color: 'hsl(var(--muted-foreground))' }} />
          </button>
          <button
            onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: 'hsl(var(--primary))' }}
          >
            <Plus size={16} />
            Add Driver
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Active', value: totalActive, icon: Truck, color: 'hsl(var(--primary))' },
          { label: 'Available', value: totalAvailable, icon: CheckCircle2, color: '#22c55e' },
          { label: 'On Route', value: totalOnRoute, icon: MapPin, color: '#f97316' },
          { label: 'Fleet Avg Rating', value: fleetAvgRating > 0 ? fleetAvgRating.toFixed(1) : '—', icon: Star, color: '#eab308' },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-xl border p-4 flex items-center gap-3"
            style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
          >
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${card.color}20` }}>
              <card.icon size={20} style={{ color: card.color }} />
            </div>
            <div>
              <p className="text-2xl font-bold" style={{ color: 'hsl(var(--foreground))' }}>{card.value}</p>
              <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>{card.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Main Content: List + Profile */}
      <div className="flex gap-5" style={{ minHeight: '600px' }}>
        {/* Driver List */}
        <div
          className="flex flex-col rounded-xl border overflow-hidden"
          style={{ width: '340px', minWidth: '280px', backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
        >
          {/* Search */}
          <div className="p-3 border-b" style={{ borderColor: 'hsl(var(--border))' }}>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'hsl(var(--muted-foreground))' }} />
              <input
                type="text"
                placeholder="Search drivers..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border outline-none focus:ring-2"
                style={{
                  backgroundColor: 'hsl(var(--background))',
                  borderColor: 'hsl(var(--border))',
                  color: 'hsl(var(--foreground))',
                }}
              />
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center h-40">
                <Loader2 size={24} className="animate-spin" style={{ color: 'hsl(var(--primary))' }} />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 gap-2">
                <Truck size={32} style={{ color: 'hsl(var(--muted-foreground))' }} />
                <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>No drivers found</p>
              </div>
            ) : (
              filtered.map((driver) => {
                const isSelected = selectedDriver?.id === driver.id;
                const r = ratings[driver.id];
                return (
                  <button
                    key={driver.id}
                    onClick={() => setSelectedDriver(driver)}
                    className="w-full text-left px-4 py-3 border-b flex items-center gap-3 transition-colors hover:bg-secondary"
                    style={{
                      borderColor: 'hsl(var(--border))',
                      backgroundColor: isSelected ? 'hsl(var(--secondary))' : undefined,
                    }}
                  >
                    {/* Avatar */}
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                      style={{ backgroundColor: 'hsl(var(--primary) / 0.15)', color: 'hsl(var(--primary))' }}
                    >
                      {driver.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold truncate" style={{ color: 'hsl(var(--foreground))' }}>{driver.name}</p>
                        {!driver.is_active && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 font-medium shrink-0">Inactive</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${STATUS_COLOURS[driver.status]}`}>
                          {driver.status}
                        </span>
                        {r && r.avg_rating > 0 && (
                          <span className="text-[10px] flex items-center gap-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                            <Star size={10} className="text-yellow-400 fill-yellow-400" />
                            {r.avg_rating.toFixed(1)}
                          </span>
                        )}
                      </div>
                      <p className="text-xs truncate mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>{driver.phone}</p>
                    </div>
                    <ChevronRight size={14} style={{ color: 'hsl(var(--muted-foreground))' }} className="shrink-0" />
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Profile Panel */}
        <div className="flex-1 min-w-0">
          {!selectedDriver ? (
            <div
              className="h-full rounded-xl border flex flex-col items-center justify-center gap-3"
              style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
            >
              <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: 'hsl(var(--secondary))' }}>
                <User size={28} style={{ color: 'hsl(var(--muted-foreground))' }} />
              </div>
              <p className="text-base font-medium" style={{ color: 'hsl(var(--foreground))' }}>Select a driver</p>
              <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>Choose a driver from the list to view their full profile</p>
            </div>
          ) : (
            <div
              className="rounded-xl border overflow-hidden"
              style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
            >
              {/* Profile Header */}
              <div className="p-6 border-b" style={{ borderColor: 'hsl(var(--border))', background: 'linear-gradient(135deg, hsl(var(--primary) / 0.08) 0%, hsl(var(--card)) 100%)' }}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div
                      className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold shrink-0"
                      style={{ backgroundColor: 'hsl(var(--primary) / 0.15)', color: 'hsl(var(--primary))' }}
                    >
                      {selectedDriver.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-xl font-bold" style={{ color: 'hsl(var(--foreground))' }}>{selectedDriver.name}</h2>
                        <VerificationBadge status={selectedDriver.verification_status} />
                        {!selectedDriver.is_active && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-medium">Inactive</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOURS[selectedDriver.status]}`}>
                          {selectedDriver.status}
                        </span>
                        {selectedDriver.zone && (
                          <span className="text-xs flex items-center gap-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
                            <MapPin size={11} />
                            {selectedDriver.zone}
                          </span>
                        )}
                        <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                          Member since {new Date(selectedDriver.created_at).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
                        </span>
                      </div>
                    </div>
                  </div>
                  {/* Action Buttons */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => openEdit(selectedDriver)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors hover:bg-secondary"
                      style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                    >
                      <Edit2 size={13} />
                      Edit
                    </button>
                    <button
                      onClick={() => setConfirmDeactivate(selectedDriver)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                        selectedDriver.is_active
                          ? 'border-red-200 text-red-600 hover:bg-red-50' :'border-green-200 text-green-600 hover:bg-green-50'
                      }`}
                    >
                      {selectedDriver.is_active ? <UserX size={13} /> : <UserCheck size={13} />}
                      {selectedDriver.is_active ? 'Deactivate' : 'Reactivate'}
                    </button>
                  </div>
                </div>

                {/* Rating Summary */}
                {selectedRating && (
                  <div className="mt-4 flex items-center gap-6 flex-wrap">
                    <div className="flex items-center gap-2">
                      <StarRating rating={selectedRating.avg_rating} size={16} />
                      <span className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
                        {selectedRating.avg_rating.toFixed(1)}
                      </span>
                      <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>avg rating</span>
                    </div>
                    <div className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                      <span className="font-semibold" style={{ color: 'hsl(var(--foreground))' }}>{selectedRating.total_deliveries}</span> deliveries
                    </div>
                    <div className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                      <span className="font-semibold text-green-600">{selectedRating.successful_deliveries}</span> successful
                    </div>
                    {selectedRating.total_deliveries > 0 && (
                      <div className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        <span className="font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
                          {Math.round((selectedRating.successful_deliveries / selectedRating.total_deliveries) * 100)}%
                        </span> success rate
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Profile Body */}
              <div className="p-6 overflow-y-auto" style={{ maxHeight: '520px' }}>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Left Column */}
                  <div className="space-y-6">
                    {/* Contact Info */}
                    <div>
                      <SectionHeader title="Contact Information" />
                      <div className="space-y-3">
                        <InfoRow icon={Phone} label="Phone" value={selectedDriver.phone} />
                        <InfoRow icon={Mail} label="Email" value={selectedDriver.email} />
                        <InfoRow icon={MapPin} label="Address" value={selectedDriver.address} />
                        <InfoRow icon={User} label="Emergency Contact" value={selectedDriver.emergency_contact} />
                        <InfoRow icon={Phone} label="Emergency Phone" value={selectedDriver.emergency_phone} />
                      </div>
                      {!selectedDriver.email && !selectedDriver.address && !selectedDriver.emergency_contact && (
                        <p className="text-xs italic" style={{ color: 'hsl(var(--muted-foreground))' }}>No additional contact info — edit profile to add</p>
                      )}
                    </div>

                    {/* Vehicle Info */}
                    <div>
                      <SectionHeader title="Vehicle Information" />
                      <div className="space-y-3">
                        <InfoRow icon={Car} label="Vehicle" value={selectedDriver.vehicle} />
                        <InfoRow icon={Hash} label="Plate Number" value={selectedDriver.plate} />
                        <InfoRow icon={MapPin} label="Zone" value={selectedDriver.zone} />
                      </div>
                    </div>

                    {/* Licence Info */}
                    <div>
                      <SectionHeader title="Licence Information" />
                      <div className="space-y-3">
                        <InfoRow icon={CreditCard} label="Licence Number" value={selectedDriver.license_number} />
                        <InfoRow icon={FileText} label="Licence Class" value={selectedDriver.license_class} />
                        <InfoRow icon={Calendar} label="Licence Expiry" value={selectedDriver.license_expiry ? new Date(selectedDriver.license_expiry).toLocaleDateString('en-GB') : null} />
                      </div>
                      {!selectedDriver.license_number && !selectedDriver.license_class && !selectedDriver.license_expiry && (
                        <p className="text-xs italic" style={{ color: 'hsl(var(--muted-foreground))' }}>No licence info — edit profile to add</p>
                      )}
                    </div>

                    {/* Notes */}
                    {selectedDriver.notes && (
                      <div>
                        <SectionHeader title="Notes" />
                        <p className="text-sm" style={{ color: 'hsl(var(--foreground))' }}>{selectedDriver.notes}</p>
                      </div>
                    )}

                    {/* Verification */}
                    <div>
                      <SectionHeader title="Verification Status" />
                      <div className="flex items-center gap-2 flex-wrap">
                        <VerificationBadge status={selectedDriver.verification_status} />
                        <div className="flex gap-1.5">
                          {(['unverified', 'pending', 'verified', 'rejected'] as VerificationStatus[]).map((vs) => (
                            <button
                              key={vs}
                              onClick={() => updateVerification(selectedDriver, vs)}
                              className={`text-xs px-2 py-1 rounded-lg border transition-colors ${
                                selectedDriver.verification_status === vs
                                  ? 'font-semibold' :'hover:bg-secondary'
                              }`}
                              style={{
                                borderColor: selectedDriver.verification_status === vs ? VERIFICATION_CONFIG[vs].color : 'hsl(var(--border))',
                                color: selectedDriver.verification_status === vs ? VERIFICATION_CONFIG[vs].color : 'hsl(var(--muted-foreground))',
                              }}
                            >
                              {VERIFICATION_CONFIG[vs].label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right Column — Documents */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'hsl(var(--muted-foreground))' }}>Documents</p>
                        <div className="flex-1 h-px" style={{ backgroundColor: 'hsl(var(--border))' }} />
                      </div>
                      <button
                        onClick={() => setShowDocUpload((v) => !v)}
                        className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors hover:bg-secondary"
                        style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                      >
                        <Upload size={12} />
                        Upload
                      </button>
                    </div>

                    {/* Upload Form */}
                    {showDocUpload && (
                      <div
                        className="mb-4 p-4 rounded-xl border space-y-3"
                        style={{ backgroundColor: 'hsl(var(--secondary))', borderColor: 'hsl(var(--border))' }}
                      >
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs font-medium block mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Type</label>
                            <select
                              value={docType}
                              onChange={(e) => setDocType(e.target.value as DocType)}
                              className="w-full px-2 py-1.5 text-sm rounded-lg border outline-none"
                              style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                            >
                              {(Object.keys(DOC_TYPE_LABELS) as DocType[]).map((t) => (
                                <option key={t} value={t}>{DOC_TYPE_LABELS[t]}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="text-xs font-medium block mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Expiry Date</label>
                            <input
                              type="date"
                              value={docExpiry}
                              onChange={(e) => setDocExpiry(e.target.value)}
                              className="w-full px-2 py-1.5 text-sm rounded-lg border outline-none"
                              style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                            />
                          </div>
                        </div>
                        <div>
                          <label className="text-xs font-medium block mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Notes</label>
                          <input
                            type="text"
                            value={docNotes}
                            onChange={(e) => setDocNotes(e.target.value)}
                            placeholder="Optional notes..."
                            className="w-full px-2 py-1.5 text-sm rounded-lg border outline-none"
                            style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                          />
                        </div>
                        <div>
                          <input
                            ref={fileInputRef}
                            type="file"
                            className="hidden"
                            accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                            onChange={(e) => setDocFile(e.target.files?.[0] ?? null)}
                          />
                          <button
                            onClick={() => fileInputRef.current?.click()}
                            className="w-full py-2 rounded-lg border-2 border-dashed text-sm transition-colors hover:bg-secondary"
                            style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}
                          >
                            {docFile ? docFile.name : 'Click to select file'}
                          </button>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={handleDocUpload}
                            disabled={uploadingDoc || !docFile}
                            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                            style={{ backgroundColor: 'hsl(var(--primary))' }}
                          >
                            {uploadingDoc ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                            Upload
                          </button>
                          <button
                            onClick={() => { setShowDocUpload(false); setDocFile(null); }}
                            className="px-3 py-1.5 rounded-lg border text-sm transition-colors hover:bg-secondary"
                            style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Document List */}
                    {selectedDocs.length === 0 ? (
                      <div
                        className="rounded-xl border p-6 flex flex-col items-center gap-2"
                        style={{ borderColor: 'hsl(var(--border))' }}
                      >
                        <FileImage size={28} style={{ color: 'hsl(var(--muted-foreground))' }} />
                        <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>No documents uploaded</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {selectedDocs.map((doc) => {
                          const isExpired = doc.expiry_date && new Date(doc.expiry_date) < new Date();
                          const expiringSoon = doc.expiry_date && !isExpired &&
                            new Date(doc.expiry_date) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
                          return (
                            <div
                              key={doc.id}
                              className="flex items-center gap-3 p-3 rounded-xl border"
                              style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))' }}
                            >
                              <div
                                className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                                style={{ backgroundColor: 'hsl(var(--secondary))' }}
                              >
                                <FileText size={16} style={{ color: 'hsl(var(--primary))' }} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate" style={{ color: 'hsl(var(--foreground))' }}>
                                  {DOC_TYPE_LABELS[doc.doc_type]}
                                </p>
                                <p className="text-xs truncate" style={{ color: 'hsl(var(--muted-foreground))' }}>{doc.file_name}</p>
                                {doc.expiry_date && (
                                  <p className={`text-xs font-medium ${isExpired ? 'text-red-500' : expiringSoon ? 'text-orange-500' : ''}`}
                                    style={!isExpired && !expiringSoon ? { color: 'hsl(var(--muted-foreground))' } : {}}>
                                    {isExpired ? '⚠ Expired: ' : expiringSoon ? '⚡ Expires: ' : 'Expires: '}
                                    {new Date(doc.expiry_date).toLocaleDateString('en-GB')}
                                  </p>
                                )}
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <a
                                  href={doc.file_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-1.5 rounded-lg transition-colors hover:bg-secondary"
                                  title="View document"
                                >
                                  <Eye size={13} style={{ color: 'hsl(var(--muted-foreground))' }} />
                                </a>
                                <button
                                  onClick={() => deleteDocument(doc.id)}
                                  className="p-1.5 rounded-lg transition-colors hover:bg-red-50"
                                  title="Delete document"
                                >
                                  <Trash2 size={13} className="text-red-400" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Access Code */}
                    {selectedDriver.access_code && (
                      <div className="mt-6">
                        <SectionHeader title="Portal Access" />
                        <div
                          className="flex items-center gap-3 p-3 rounded-xl border"
                          style={{ backgroundColor: 'hsl(var(--secondary))', borderColor: 'hsl(var(--border))' }}
                        >
                          <Hash size={14} style={{ color: 'hsl(var(--muted-foreground))' }} />
                          <div>
                            <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>Driver Portal Access Code</p>
                            <p className="text-sm font-mono font-semibold tracking-widest" style={{ color: 'hsl(var(--foreground))' }}>
                              {selectedDriver.access_code}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ─── Edit / Add Driver Modal ─────────────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div
            className="w-full max-w-2xl rounded-2xl border shadow-2xl overflow-hidden"
            style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'hsl(var(--border))' }}>
              <h2 className="text-lg font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
                {editingDriver ? 'Edit Driver' : 'Add New Driver'}
              </h2>
              <button onClick={() => setShowForm(false)} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
                <X size={18} style={{ color: 'hsl(var(--muted-foreground))' }} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto" style={{ maxHeight: '70vh' }}>
              <div className="space-y-5">
                {/* Basic Info */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'hsl(var(--muted-foreground))' }}>Basic Information</p>
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { key: 'name', label: 'Full Name *', placeholder: 'John Smith' },
                      { key: 'phone', label: 'Phone *', placeholder: '+44 7700 000000' },
                      { key: 'email', label: 'Email', placeholder: 'john@example.com' },
                      { key: 'zone', label: 'Zone', placeholder: 'Zone A' },
                    ].map(({ key, label, placeholder }) => (
                      <div key={key}>
                        <label className="text-xs font-medium block mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>{label}</label>
                        <input
                          type={key === 'email' ? 'email' : 'text'}
                          value={(form as Record<string, string>)[key]}
                          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                          placeholder={placeholder}
                          className="w-full px-3 py-2 text-sm rounded-lg border outline-none focus:ring-2"
                          style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                        />
                      </div>
                    ))}
                    <div>
                      <label className="text-xs font-medium block mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Status</label>
                      <select
                        value={form.status}
                        onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as DriverStatus }))}
                        className="w-full px-3 py-2 text-sm rounded-lg border outline-none"
                        style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                      >
                        {(['Available', 'On Route', 'Off Duty'] as DriverStatus[]).map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Vehicle Info */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'hsl(var(--muted-foreground))' }}>Vehicle Information</p>
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { key: 'vehicle', label: 'Vehicle', placeholder: 'Ford Transit' },
                      { key: 'plate', label: 'Plate Number', placeholder: 'AB12 CDE' },
                    ].map(({ key, label, placeholder }) => (
                      <div key={key}>
                        <label className="text-xs font-medium block mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>{label}</label>
                        <input
                          type="text"
                          value={(form as Record<string, string>)[key]}
                          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                          placeholder={placeholder}
                          className="w-full px-3 py-2 text-sm rounded-lg border outline-none focus:ring-2"
                          style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Licence Info */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'hsl(var(--muted-foreground))' }}>Licence Information</p>
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { key: 'license_number', label: 'Licence Number', placeholder: 'SMITH123456AB9CD' },
                      { key: 'license_class', label: 'Licence Class', placeholder: 'Class C' },
                    ].map(({ key, label, placeholder }) => (
                      <div key={key}>
                        <label className="text-xs font-medium block mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>{label}</label>
                        <input
                          type="text"
                          value={(form as Record<string, string>)[key]}
                          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                          placeholder={placeholder}
                          className="w-full px-3 py-2 text-sm rounded-lg border outline-none focus:ring-2"
                          style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                        />
                      </div>
                    ))}
                    <div>
                      <label className="text-xs font-medium block mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Licence Expiry</label>
                      <input
                        type="date"
                        value={form.license_expiry}
                        onChange={(e) => setForm((f) => ({ ...f, license_expiry: e.target.value }))}
                        className="w-full px-3 py-2 text-sm rounded-lg border outline-none focus:ring-2"
                        style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                      />
                    </div>
                  </div>
                </div>

                {/* Contact & Emergency */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'hsl(var(--muted-foreground))' }}>Contact & Emergency</p>
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { key: 'address', label: 'Address', placeholder: '123 Main St, London' },
                      { key: 'emergency_contact', label: 'Emergency Contact', placeholder: 'Jane Smith' },
                      { key: 'emergency_phone', label: 'Emergency Phone', placeholder: '+44 7700 000001' },
                    ].map(({ key, label, placeholder }) => (
                      <div key={key}>
                        <label className="text-xs font-medium block mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>{label}</label>
                        <input
                          type="text"
                          value={(form as Record<string, string>)[key]}
                          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                          placeholder={placeholder}
                          className="w-full px-3 py-2 text-sm rounded-lg border outline-none focus:ring-2"
                          style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                        />
                      </div>
                    ))}
                    <div className="col-span-2">
                      <label className="text-xs font-medium block mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Notes</label>
                      <textarea
                        value={form.notes}
                        onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                        placeholder="Any additional notes..."
                        rows={2}
                        className="w-full px-3 py-2 text-sm rounded-lg border outline-none focus:ring-2 resize-none"
                        style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t" style={{ borderColor: 'hsl(var(--border))' }}>
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 rounded-lg border text-sm font-medium transition-colors hover:bg-secondary"
                style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: 'hsl(var(--primary))' }}
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                {editingDriver ? 'Save Changes' : 'Add Driver'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Deactivate Confirm Modal ─────────────────────────────────────────── */}
      {confirmDeactivate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div
            className="w-full max-w-sm rounded-2xl border shadow-2xl p-6"
            style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${confirmDeactivate.is_active ? 'bg-red-100' : 'bg-green-100'}`}>
                {confirmDeactivate.is_active ? <UserX size={20} className="text-red-600" /> : <UserCheck size={20} className="text-green-600" />}
              </div>
              <div>
                <h3 className="font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
                  {confirmDeactivate.is_active ? 'Deactivate Driver' : 'Reactivate Driver'}
                </h3>
                <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>{confirmDeactivate.name}</p>
              </div>
            </div>
            <p className="text-sm mb-5" style={{ color: 'hsl(var(--muted-foreground))' }}>
              {confirmDeactivate.is_active
                ? 'This driver will be marked as inactive and will not appear in active assignments.' :'This driver will be reactivated and can be assigned to deliveries again.'}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDeactivate(null)}
                className="flex-1 px-4 py-2 rounded-lg border text-sm font-medium transition-colors hover:bg-secondary"
                style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeactivate(confirmDeactivate)}
                className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90 ${
                  confirmDeactivate.is_active ? 'bg-red-500' : 'bg-green-500'
                }`}
              >
                {confirmDeactivate.is_active ? 'Deactivate' : 'Reactivate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
