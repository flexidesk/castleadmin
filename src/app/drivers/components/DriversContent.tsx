'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Truck, Plus, Search, Edit2, UserX, UserCheck, Star, Phone, Mail, X, Loader2, RefreshCw, MapPin, FileText, Upload, Calendar, Eye, ShieldCheck, ShieldAlert, ShieldOff, CreditCard, Car, Hash, User, ChevronRight, CheckCircle2, Trash2, FileImage, KeyRound, EyeOff, ToggleLeft, ToggleRight, ChevronDown, Download, FileSpreadsheet, Archive, ArchiveRestore, TrendingUp, CheckSquare, Square, Users, Zap, BarChart2, Bell, RotateCcw, CalendarCheck, AlertCircle,  } from 'lucide-react';
import { toast } from 'sonner';
import Icon from '@/components/ui/AppIcon';
import VehicleManagementContent from './VehicleManagementContent';

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
  archived_at?: string | null;
  zone: string | null;
  created_at: string;
  verification_status: VerificationStatus;
  access_code: string | null;
  auth_user_id?: string | null;
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

interface DriverZone {
  id: string;
  name: string;
  color: string;
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

const STATUS_OPTIONS: DriverStatus[] = ['Available', 'On Route', 'Off Duty'];

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

// ─── Helper Components ────────────────────────────────────────────────────────

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

function ZoneBadge({ zone, zones }: { zone: string | null; zones: DriverZone[] }) {
  if (!zone) return (
    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">No Zone</span>
  );
  const zoneData = zones.find((z) => z.name === zone);
  const color = zoneData?.color ?? '#9ca3af';
  return (
    <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: `${color}20`, color }}>
      {zone}
    </span>
  );
}

function PerformanceBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="w-full h-1.5 rounded-full bg-gray-100 overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, value)}%`, backgroundColor: color }} />
    </div>
  );
}

function VerificationBadge({ status }: { status: VerificationStatus }) {
  const cfg = VERIFICATION_CONFIG[status] ?? VERIFICATION_CONFIG.unverified;
  const { Icon } = cfg;
  return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: cfg.bg, color: cfg.color }}>
      <Icon size={11} />
      {cfg.label}
    </span>
  );
}

function InfoRow({ icon: IconComp, label, value }: { icon: React.ElementType; label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: 'hsl(var(--secondary))' }}>
        <IconComp size={14} style={{ color: 'hsl(var(--muted-foreground))' }} />
      </div>
      <div className="min-w-0">
        <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>{label}</p>
        <p className="text-sm font-medium truncate" style={{ color: 'hsl(var(--foreground))' }}>{value}</p>
      </div>
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'hsl(var(--muted-foreground))' }}>{title}</p>
      <div className="flex-1 h-px" style={{ backgroundColor: 'hsl(var(--border))' }} />
    </div>
  );
}

// ─── Export Helpers ───────────────────────────────────────────────────────────

function buildExportRows(drivers: Driver[], ratings: Record<string, DriverRating>) {
  return drivers.map((d) => {
    const r = ratings[d.id];
    const successRate = r && r.total_deliveries > 0 ? Math.round((r.successful_deliveries / r.total_deliveries) * 100) : 0;
    return {
      Name: d.name, Phone: d.phone, Email: d.email ?? '', Vehicle: d.vehicle, Plate: d.plate,
      Status: d.status, Zone: d.zone ?? 'Unassigned', Active: d.is_active ? 'Yes' : 'No',
      Archived: d.is_archived ? 'Yes' : 'No', Verification: d.verification_status,
      'Avg Rating': r ? r.avg_rating.toFixed(2) : '—', 'Total Deliveries': r ? r.total_deliveries : 0,
      'Successful Deliveries': r ? r.successful_deliveries : 0, 'Success Rate (%)': r ? successRate : 0,
      'Member Since': new Date(d.created_at).toLocaleDateString(),
    };
  });
}

function exportCSV(rows: ReturnType<typeof buildExportRows>, filterLabel: string) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const csvContent = [headers.join(','), ...rows.map((row) => headers.map((h) => { const val = String((row as Record<string, string | number>)[h] ?? ''); return val.includes(',') || val.includes('"') ? `"${val.replace(/"/g, '""')}"` : val; }).join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `drivers_${filterLabel}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportPDF(rows: ReturnType<typeof buildExportRows>, filterLabel: string) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const now = new Date().toLocaleString();
  const tableRows = rows.map((row) => `<tr>${headers.map((h) => `<td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:11px;">${(row as Record<string, string | number>)[h] ?? ''}</td>`).join('')}</tr>`).join('');
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Driver Export</title><style>body{font-family:Arial,sans-serif;margin:24px;color:#111;}h1{font-size:20px;margin-bottom:4px;}.meta{font-size:12px;color:#6b7280;margin-bottom:16px;}table{width:100%;border-collapse:collapse;}th{background:#f3f4f6;padding:8px 10px;text-align:left;font-size:11px;border-bottom:2px solid #d1d5db;}tr:nth-child(even) td{background:#f9fafb;}@media print{body{margin:0;}}</style></head><body><h1>Driver Report</h1><div class="meta">Filter: ${filterLabel} | ${rows.length} driver(s) | Generated: ${now}</div><table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${tableRows}</tbody></table><script>window.onload=()=>{window.print();}<\/script></body></html>`;
  const win = window.open('', '_blank');
  if (win) { win.document.write(html); win.document.close(); }
}

// ─── Inspection Types ─────────────────────────────────────────────────────────

type InspectionType = 'interim' | 'full' | 'licence' | 'vehicle' | 'medical';
type ComplianceStatus = 'compliant' | 'due_soon' | 'overdue';

interface InspectionSchedule {
  id: string;
  driver_id: string;
  inspection_type: InspectionType;
  frequency_days: number;
  last_completed_at: string | null;
  next_due_at: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface InspectionScheduleForm {
  driver_id: string;
  inspection_type: InspectionType;
  frequency_days: number;
  next_due_at: string;
  notes: string;
}

const INSPECTION_TYPE_LABELS: Record<InspectionType, string> = {
  interim: 'Interim Check',
  full: 'Full Check',
  licence: 'Licence Review',
  vehicle: 'Vehicle Inspection',
  medical: 'Medical Check',
};

const INSPECTION_TYPE_COLORS: Record<InspectionType, string> = {
  interim: '#3b82f6',
  full: '#8b5cf6',
  licence: '#f59e0b',
  vehicle: '#10b981',
  medical: '#ec4899',
};

const EMPTY_SCHEDULE_FORM: InspectionScheduleForm = {
  driver_id: '',
  inspection_type: 'interim',
  frequency_days: 90,
  next_due_at: '',
  notes: '',
};

function getComplianceStatus(nextDue: string): ComplianceStatus {
  const now = new Date();
  const due = new Date(nextDue);
  const daysUntilDue = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (daysUntilDue < 0) return 'overdue';
  if (daysUntilDue <= 14) return 'due_soon';
  return 'compliant';
}

function getDaysLabel(nextDue: string): string {
  const now = new Date();
  const due = new Date(nextDue);
  const days = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `Due in ${days}d`;
}

const COMPLIANCE_CONFIG: Record<ComplianceStatus, { label: string; color: string; bg: string; border: string }> = {
  compliant: { label: 'Compliant', color: '#16a34a', bg: '#dcfce7', border: '#bbf7d0' },
  due_soon: { label: 'Due Soon', color: '#d97706', bg: '#fef3c7', border: '#fde68a' },
  overdue: { label: 'Overdue', color: '#dc2626', bg: '#fee2e2', border: '#fecaca' },
};

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DriversContent() {
  const supabase = createClient();
  const { session } = useAuth();

  // ─── Shared state ──────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'profiles' | 'management' | 'vehicles' | 'inspections'>('profiles');
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [ratings, setRatings] = useState<Record<string, DriverRating>>({});
  const [zones, setZones] = useState<DriverZone[]>([]);
  const [documents, setDocuments] = useState<Record<string, DriverDocument[]>>({});
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null);
  const [form, setForm] = useState<DriverFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState<Driver | null>(null);

  // ─── Profiles tab state ────────────────────────────────────────────────────
  const [profileSearch, setProfileSearch] = useState('');
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);
  const [showDocUpload, setShowDocUpload] = useState(false);
  const [docType, setDocType] = useState<DocType>('license');
  const [docExpiry, setDocExpiry] = useState('');
  const [docNotes, setDocNotes] = useState('');
  const [docFile, setDocFile] = useState<File | null>(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showCredentials, setShowCredentials] = useState(false);
  const [credentialsDriver, setCredentialsDriver] = useState<Driver | null>(null);
  const [credEmail, setCredEmail] = useState('');
  const [credPassword, setCredPassword] = useState('');
  const [credShowPassword, setCredShowPassword] = useState(false);
  const [savingCredentials, setSavingCredentials] = useState(false);

  // ─── Management tab state ──────────────────────────────────────────────────
  const [mgmtSearch, setMgmtSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [zoneFilter, setZoneFilter] = useState<string>('all');
  const [showArchived, setShowArchived] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState<Driver | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Driver | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [docModalDriver, setDocModalDriver] = useState<Driver | null>(null);
  const [mgmtDocType, setMgmtDocType] = useState<DocType>('license');
  const [mgmtDocExpiry, setMgmtDocExpiry] = useState('');
  const [mgmtDocNotes, setMgmtDocNotes] = useState('');
  const [mgmtDocFile, setMgmtDocFile] = useState<File | null>(null);
  const [mgmtUploadingDoc, setMgmtUploadingDoc] = useState(false);
  const mgmtFileInputRef = useRef<HTMLInputElement>(null);
  const [statsDriver, setStatsDriver] = useState<Driver | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [showBulkZoneDropdown, setShowBulkZoneDropdown] = useState(false);

  // ─── Fetch Zones ────────────────────────────────────────────────────────────

  const fetchZones = useCallback(async () => {
    const { data } = await supabase.from('driver_zones').select('id, name, color').order('name');
    if (data) setZones(data);
  }, [supabase]);

  // ─── Fetch Drivers ──────────────────────────────────────────────────────────

  const fetchDrivers = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('drivers')
      .select('id, name, phone, email, vehicle, plate, status, avatar, is_active, is_archived, archived_at, zone, created_at, verification_status, access_code, auth_user_id')
      .order('name');
    if (error) {
      toast.error('Failed to load drivers: ' + error.message);
    } else {
      const mapped = (data ?? []).map((d) => ({ ...d, verification_status: (d.verification_status ?? 'unverified') as VerificationStatus }));
      setDrivers(mapped);
      if (selectedDriver) {
        const updated = mapped.find((d) => d.id === selectedDriver.id);
        if (updated) setSelectedDriver(updated);
      }
    }
    setLoading(false);
  }, [supabase, selectedDriver]);

  // ─── Fetch Ratings ──────────────────────────────────────────────────────────

  const fetchRatings = useCallback(async () => {
    const { data, error } = await supabase.from('driver_performance_logs').select('driver_id, was_successful, customer_rating');
    if (error || !data) return;
    const map: Record<string, DriverRating> = {};
    data.forEach((row) => {
      if (!map[row.driver_id]) map[row.driver_id] = { driver_id: row.driver_id, avg_rating: 0, total_deliveries: 0, successful_deliveries: 0 };
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
    const { data, error } = await supabase.from('driver_documents').select('*').order('uploaded_at', { ascending: false });
    if (error || !data) return;
    const map: Record<string, DriverDocument[]> = {};
    data.forEach((doc) => {
      if (!map[doc.driver_id]) map[doc.driver_id] = [];
      map[doc.driver_id].push(doc as DriverDocument);
    });
    setDocuments(map);
  }, [supabase]);

  // ─── Inspection tab state ──────────────────────────────────────────────────
  const [inspectionSchedules, setInspectionSchedules] = useState<InspectionSchedule[]>([]);
  const [inspectionLoading, setInspectionLoading] = useState(false);
  const [inspectionSearch, setInspectionSearch] = useState('');
  const [inspectionTypeFilter, setInspectionTypeFilter] = useState<'all' | InspectionType>('all');
  const [inspectionStatusFilter, setInspectionStatusFilter] = useState<'all' | ComplianceStatus>('all');
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<InspectionSchedule | null>(null);
  const [scheduleForm, setScheduleForm] = useState<InspectionScheduleForm>(EMPTY_SCHEDULE_FORM);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [confirmDeleteSchedule, setConfirmDeleteSchedule] = useState<InspectionSchedule | null>(null);
  const [deletingSchedule, setDeletingSchedule] = useState(false);
  const [selectedScheduleIds, setSelectedScheduleIds] = useState<Set<string>>(new Set());
  const [showBulkReschedule, setShowBulkReschedule] = useState(false);
  const [bulkRescheduleDate, setBulkRescheduleDate] = useState('');
  const [bulkRescheduling, setBulkRescheduling] = useState(false);
  const [markingDone, setMarkingDone] = useState<string | null>(null);

  // ─── Fetch Inspection Schedules ─────────────────────────────────────────────

  const fetchInspectionSchedules = useCallback(async () => {
    setInspectionLoading(true);
    const { data, error } = await supabase
      .from('driver_inspection_schedules')
      .select('*')
      .order('next_due_at', { ascending: true });
    if (error) {
      toast.error('Failed to load inspection schedules');
    } else {
      setInspectionSchedules(data ?? []);
    }
    setInspectionLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchZones();
    fetchDrivers();
    fetchRatings();
    fetchDocuments();
    fetchInspectionSchedules();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Real-time subscription ─────────────────────────────────────────────────

  useEffect(() => {
    const driverChannel = supabase.channel('drivers-rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'drivers' }, (payload) => {
        const d = payload.new as Record<string, unknown>;
        toast.success(`New driver added: ${d.name}`, { duration: 5000 });
        fetchDrivers();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'drivers' }, (payload) => {
        const prev = payload.old as Record<string, unknown>;
        const next = payload.new as Record<string, unknown>;
        if (prev.status !== next.status) toast.info(`${next.name}: status → ${next.status}`, { duration: 4000 });
        else if (prev.is_active !== next.is_active) toast.info(next.is_active ? `${next.name} reactivated` : `${next.name} deactivated`, { duration: 4000 });
        else if (prev.zone !== next.zone) toast.info(next.zone ? `${next.name}: zone set to ${next.zone}` : `${next.name}: zone cleared`, { duration: 4000 });
        fetchDrivers();
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'drivers' }, (payload) => {
        const d = payload.old as Record<string, unknown>;
        toast.info(`Driver ${d.name ?? payload.old.id} removed`, { duration: 4000 });
        fetchDrivers();
      })
      .subscribe();

    const perfChannel = supabase.channel('driver-perf-rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'driver_performance_logs' }, () => fetchRatings())
      .subscribe();

    const docsChannel = supabase.channel('driver-docs-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_documents' }, () => fetchDocuments())
      .subscribe();

    return () => {
      supabase.removeChannel(driverChannel);
      supabase.removeChannel(perfChannel);
      supabase.removeChannel(docsChannel);
    };
  }, [supabase, fetchDrivers, fetchRatings, fetchDocuments]);

  // ─── Stats ───────────────────────────────────────────────────────────────────

  const activeDrivers = drivers.filter((d) => !d.is_archived);
  const totalActive = activeDrivers.filter((d) => d.is_active).length;
  const totalAvailable = activeDrivers.filter((d) => d.is_active && d.status === 'Available').length;
  const totalOnRoute = activeDrivers.filter((d) => d.is_active && d.status === 'On Route').length;
  const allRatings = Object.values(ratings).map((r) => r.avg_rating).filter((r) => r > 0);
  const fleetAvgRating = allRatings.length > 0 ? allRatings.reduce((a, b) => a + b, 0) / allRatings.length : 0;

  // ─── Profiles tab filtered list ─────────────────────────────────────────────

  const profileFiltered = drivers.filter((d) => {
    if (d.is_archived) return false;
    const q = profileSearch.toLowerCase();
    return d.name.toLowerCase().includes(q) || d.phone.includes(q) || (d.email ?? '').toLowerCase().includes(q) || d.plate.toLowerCase().includes(q) || (d.vehicle ?? '').toLowerCase().includes(q);
  });

  // ─── Management tab filtered list ───────────────────────────────────────────

  const mgmtFiltered = drivers.filter((d) => {
    if (!showArchived && d.is_archived) return false;
    if (showArchived && !d.is_archived) return false;
    const matchSearch = d.name.toLowerCase().includes(mgmtSearch.toLowerCase()) || d.phone.includes(mgmtSearch) || (d.email ?? '').toLowerCase().includes(mgmtSearch.toLowerCase()) || d.plate.toLowerCase().includes(mgmtSearch.toLowerCase());
    const matchStatus = statusFilter === 'all' || (statusFilter === 'active' && d.is_active) || (statusFilter === 'inactive' && !d.is_active);
    const matchZone = zoneFilter === 'all' || (zoneFilter === 'none' && !d.zone) || d.zone === zoneFilter;
    return matchSearch && matchStatus && matchZone;
  });

  // ─── Bulk selection helpers ──────────────────────────────────────────────────

  const allFilteredIds = mgmtFiltered.map((d) => d.id);
  const allSelected = allFilteredIds.length > 0 && allFilteredIds.every((id) => selectedIds.has(id));
  const someSelected = allFilteredIds.some((id) => selectedIds.has(id));

  function toggleSelectAll() {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(allFilteredIds));
  }

  function toggleSelectDriver(id: string) {
    setSelectedIds((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }

  function clearSelection() {
    setSelectedIds(new Set());
    setShowBulkZoneDropdown(false);
  }

  // ─── Form handlers ──────────────────────────────────────────────────────────

  function openAdd() {
    setEditingDriver(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function openEdit(driver: Driver) {
    setEditingDriver(driver);
    setForm({
      name: driver.name, phone: driver.phone, email: driver.email ?? '',
      vehicle: driver.vehicle, plate: driver.plate, status: driver.status, zone: driver.zone ?? '',
      license_number: driver.license_number ?? '', license_expiry: driver.license_expiry ?? '',
      license_class: driver.license_class ?? '', address: driver.address ?? '',
      emergency_contact: driver.emergency_contact ?? '', emergency_phone: driver.emergency_phone ?? '',
      notes: driver.notes ?? '',
    });
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingDriver(null);
    setForm(EMPTY_FORM);
  }

  async function handleSave() {
    if (!form.name.trim() || !form.phone.trim()) { toast.error('Name and phone are required'); return; }
    setSaving(true);
    const payload = {
      name: form.name.trim(), phone: form.phone.trim(), email: form.email.trim() || null,
      vehicle: form.vehicle.trim(), plate: form.plate.trim().toUpperCase(), status: form.status,
      zone: form.zone || null, license_number: form.license_number.trim() || null,
      license_expiry: form.license_expiry || null, license_class: form.license_class.trim() || null,
      address: form.address.trim() || null, emergency_contact: form.emergency_contact.trim() || null,
      emergency_phone: form.emergency_phone.trim() || null, notes: form.notes.trim() || null,
    };
    if (editingDriver) {
      const { error } = await supabase.from('drivers').update(payload).eq('id', editingDriver.id);
      if (error) toast.error('Update failed: ' + error.message);
      else { toast.success('Driver updated'); closeForm(); fetchDrivers(); }
    } else {
      const { error } = await supabase.from('drivers').insert({ ...payload, avatar: '', is_active: true, is_archived: false, verification_status: 'unverified' });
      if (error) toast.error('Create failed: ' + error.message);
      else { toast.success('Driver added'); closeForm(); fetchDrivers(); }
    }
    setSaving(false);
  }

  async function handleDeactivate(driver: Driver) {
    const { error } = await supabase.from('drivers').update({ is_active: !driver.is_active }).eq('id', driver.id);
    if (error) toast.error('Failed: ' + error.message);
    else { toast.success(driver.is_active ? `${driver.name} deactivated` : `${driver.name} reactivated`); setConfirmDeactivate(null); fetchDrivers(); }
  }

  async function handleArchive(driver: Driver) {
    const nowArchiving = !driver.is_archived;
    const { error } = await supabase.from('drivers').update({ is_archived: nowArchiving, archived_at: nowArchiving ? new Date().toISOString() : null, is_active: nowArchiving ? false : driver.is_active }).eq('id', driver.id);
    if (error) toast.error('Failed: ' + error.message);
    else { toast.success(nowArchiving ? `${driver.name} archived` : `${driver.name} restored`); setConfirmArchive(null); fetchDrivers(); }
  }

  async function handleDelete(driver: Driver) {
    setDeleting(true);
    const { error } = await supabase.from('drivers').delete().eq('id', driver.id);
    if (error) toast.error('Delete failed: ' + error.message);
    else { toast.success(`${driver.name} permanently deleted`); setConfirmDelete(null); fetchDrivers(); }
    setDeleting(false);
  }

  async function updateVerification(driver: Driver, status: VerificationStatus) {
    const { error } = await supabase.from('drivers').update({ verification_status: status }).eq('id', driver.id);
    if (error) toast.error('Failed to update verification: ' + error.message);
    else { toast.success(`${driver.name} marked as ${VERIFICATION_CONFIG[status].label}`); fetchDrivers(); }
  }

  async function toggleStatus(driver: Driver) {
    const next: DriverStatus = driver.status === 'Available' ? 'Off Duty' : 'Available';
    const { error } = await supabase.from('drivers').update({ status: next }).eq('id', driver.id);
    if (error) toast.error('Failed to update status');
    else { toast.success(`${driver.name} is now ${next}`); fetchDrivers(); }
  }

  async function assignZone(driverId: string, zone: string | null) {
    const { error } = await supabase.from('drivers').update({ zone: zone || null }).eq('id', driverId);
    if (error) toast.error('Failed to assign zone');
    else { toast.success(zone ? `Zone set to ${zone}` : 'Zone cleared'); fetchDrivers(); }
  }

  // ─── Bulk actions ────────────────────────────────────────────────────────────

  async function bulkActivate() {
    if (selectedIds.size === 0) return;
    setBulkLoading(true);
    const ids = Array.from(selectedIds);
    const { error } = await supabase.from('drivers').update({ is_active: true }).in('id', ids);
    if (error) toast.error('Bulk activate failed: ' + error.message);
    else { toast.success(`${ids.length} driver${ids.length !== 1 ? 's' : ''} activated`); clearSelection(); fetchDrivers(); }
    setBulkLoading(false);
  }

  async function bulkDeactivate() {
    if (selectedIds.size === 0) return;
    setBulkLoading(true);
    const ids = Array.from(selectedIds);
    const { error } = await supabase.from('drivers').update({ is_active: false }).in('id', ids);
    if (error) toast.error('Bulk deactivate failed: ' + error.message);
    else { toast.success(`${ids.length} driver${ids.length !== 1 ? 's' : ''} deactivated`); clearSelection(); fetchDrivers(); }
    setBulkLoading(false);
  }

  async function bulkAssignZone(zone: string | null) {
    if (selectedIds.size === 0) return;
    setBulkLoading(true);
    const ids = Array.from(selectedIds);
    const { error } = await supabase.from('drivers').update({ zone: zone || null }).in('id', ids);
    if (error) toast.error('Bulk zone assign failed: ' + error.message);
    else { toast.success(zone ? `Zone "${zone}" assigned to ${ids.length} driver${ids.length !== 1 ? 's' : ''}` : `Zone cleared for ${ids.length} driver${ids.length !== 1 ? 's' : ''}`); clearSelection(); fetchDrivers(); }
    setBulkLoading(false);
    setShowBulkZoneDropdown(false);
  }

  // ─── Credentials ─────────────────────────────────────────────────────────────

  function openCredentials(driver: Driver) {
    setCredentialsDriver(driver);
    setCredEmail(driver.email ?? '');
    setCredPassword('');
    setCredShowPassword(false);
    setShowCredentials(true);
  }

  async function handleSetCredentials() {
    if (!credentialsDriver) return;
    if (!credEmail.trim()) { toast.error('Email is required'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(credEmail.trim())) { toast.error('Enter a valid email address'); return; }
    if (!credPassword.trim()) { toast.error('Password is required'); return; }
    if (credPassword.length < 6) { toast.error('Password must be at least 6 characters'); return; }
    setSavingCredentials(true);
    try {
      const res = await fetch('/api/drivers/set-credentials', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) }, body: JSON.stringify({ driverId: credentialsDriver.id, email: credEmail.trim(), password: credPassword }) });
      const json = await res.json();
      if (!res.ok) toast.error(json.error || 'Failed to set credentials');
      else { toast.success(`Credentials set for ${credentialsDriver.name}`); setShowCredentials(false); fetchDrivers(); }
    } catch { toast.error('Network error — please try again'); }
    setSavingCredentials(false);
  }

  // ─── Document upload (Profiles tab) ─────────────────────────────────────────

  async function handleDocUpload() {
    if (!selectedDriver || !docFile) { toast.error('Please select a file'); return; }
    setUploadingDoc(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      const { error } = await supabase.from('driver_documents').insert({ driver_id: selectedDriver.id, doc_type: docType, file_name: docFile.name, file_url: dataUrl, expiry_date: docExpiry || null, notes: docNotes || null });
      if (error) toast.error('Upload failed: ' + error.message);
      else { toast.success(`${DOC_TYPE_LABELS[docType]} uploaded`); setShowDocUpload(false); setDocFile(null); setDocExpiry(''); setDocNotes(''); fetchDocuments(); }
      setUploadingDoc(false);
    };
    reader.onerror = () => { toast.error('Failed to read file'); setUploadingDoc(false); };
    reader.readAsDataURL(docFile);
  }

  // ─── Document upload (Management tab) ───────────────────────────────────────

  function openDocModal(driver: Driver) {
    setDocModalDriver(driver);
    setMgmtDocType('license');
    setMgmtDocExpiry('');
    setMgmtDocNotes('');
    setMgmtDocFile(null);
  }

  function closeDocModal() {
    setDocModalDriver(null);
    setMgmtDocFile(null);
    setMgmtDocExpiry('');
    setMgmtDocNotes('');
  }

  async function handleMgmtDocUpload() {
    if (!docModalDriver || !mgmtDocFile) { toast.error('Please select a file'); return; }
    setMgmtUploadingDoc(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      const { error } = await supabase.from('driver_documents').insert({ driver_id: docModalDriver.id, doc_type: mgmtDocType, file_name: mgmtDocFile.name, file_url: dataUrl, expiry_date: mgmtDocExpiry || null, notes: mgmtDocNotes || null });
      if (error) toast.error('Upload failed: ' + error.message);
      else { toast.success(`${DOC_TYPE_LABELS[mgmtDocType]} uploaded for ${docModalDriver.name}`); closeDocModal(); fetchDocuments(); }
      setMgmtUploadingDoc(false);
    };
    reader.onerror = () => { toast.error('Failed to read file'); setMgmtUploadingDoc(false); };
    reader.readAsDataURL(mgmtDocFile);
  }

  async function deleteDocument(docId: string) {
    const { error } = await supabase.from('driver_documents').delete().eq('id', docId);
    if (error) toast.error('Failed to delete document: ' + error.message);
    else { toast.success('Document removed'); fetchDocuments(); }
  }

  const selectedRating = selectedDriver ? ratings[selectedDriver.id] : null;
  const selectedDocs = selectedDriver ? (documents[selectedDriver.id] ?? []) : [];

  // ─── Inspection schedule helpers ────────────────────────────────────────────

  const overdueSchedules = inspectionSchedules.filter((s) => getComplianceStatus(s.next_due_at) === 'overdue');
  const dueSoonSchedules = inspectionSchedules.filter((s) => getComplianceStatus(s.next_due_at) === 'due_soon');

  const filteredSchedules = inspectionSchedules.filter((s) => {
    const driver = drivers.find((d) => d.id === s.driver_id);
    const driverName = driver?.name?.toLowerCase() ?? '';
    const matchSearch = driverName.includes(inspectionSearch.toLowerCase()) || INSPECTION_TYPE_LABELS[s.inspection_type].toLowerCase().includes(inspectionSearch.toLowerCase());
    const matchType = inspectionTypeFilter === 'all' || s.inspection_type === inspectionTypeFilter;
    const matchStatus = inspectionStatusFilter === 'all' || getComplianceStatus(s.next_due_at) === inspectionStatusFilter;
    return matchSearch && matchType && matchStatus;
  });

  const allScheduleIds = filteredSchedules.map((s) => s.id);
  const allSchedulesSelected = allScheduleIds.length > 0 && allScheduleIds.every((id) => selectedScheduleIds.has(id));
  const someSchedulesSelected = allScheduleIds.some((id) => selectedScheduleIds.has(id));

  function toggleSelectAllSchedules() {
    if (allSchedulesSelected) setSelectedScheduleIds(new Set());
    else setSelectedScheduleIds(new Set(allScheduleIds));
  }

  function toggleSelectSchedule(id: string) {
    setSelectedScheduleIds((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }

  function openAddSchedule(driverId?: string) {
    setEditingSchedule(null);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setScheduleForm({ ...EMPTY_SCHEDULE_FORM, driver_id: driverId ?? '', next_due_at: tomorrow.toISOString().slice(0, 10) });
    setShowScheduleForm(true);
  }

  function openEditSchedule(schedule: InspectionSchedule) {
    setEditingSchedule(schedule);
    setScheduleForm({
      driver_id: schedule.driver_id,
      inspection_type: schedule.inspection_type,
      frequency_days: schedule.frequency_days,
      next_due_at: schedule.next_due_at.slice(0, 10),
      notes: schedule.notes ?? '',
    });
    setShowScheduleForm(true);
  }

  async function handleSaveSchedule() {
    if (!scheduleForm.driver_id) { toast.error('Please select a driver'); return; }
    if (!scheduleForm.next_due_at) { toast.error('Please set a due date'); return; }
    setSavingSchedule(true);
    const payload = {
      driver_id: scheduleForm.driver_id,
      inspection_type: scheduleForm.inspection_type,
      frequency_days: scheduleForm.frequency_days,
      next_due_at: new Date(scheduleForm.next_due_at).toISOString(),
      notes: scheduleForm.notes || null,
    };
    if (editingSchedule) {
      const { error } = await supabase.from('driver_inspection_schedules').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editingSchedule.id);
      if (error) toast.error('Update failed: ' + error.message);
      else { toast.success('Schedule updated'); setShowScheduleForm(false); fetchInspectionSchedules(); }
    } else {
      const { error } = await supabase.from('driver_inspection_schedules').insert(payload);
      if (error) toast.error('Create failed: ' + error.message);
      else { toast.success('Inspection scheduled'); setShowScheduleForm(false); fetchInspectionSchedules(); }
    }
    setSavingSchedule(false);
  }

  async function handleDeleteSchedule(schedule: InspectionSchedule) {
    setDeletingSchedule(true);
    const { error } = await supabase.from('driver_inspection_schedules').delete().eq('id', schedule.id);
    if (error) toast.error('Delete failed: ' + error.message);
    else { toast.success('Schedule removed'); setConfirmDeleteSchedule(null); fetchInspectionSchedules(); }
    setDeletingSchedule(false);
  }

  async function handleMarkDone(schedule: InspectionSchedule) {
    setMarkingDone(schedule.id);
    const now = new Date();
    const nextDue = new Date(now);
    nextDue.setDate(nextDue.getDate() + schedule.frequency_days);
    const { error } = await supabase.from('driver_inspection_schedules').update({
      last_completed_at: now.toISOString(),
      next_due_at: nextDue.toISOString(),
      updated_at: now.toISOString(),
    }).eq('id', schedule.id);
    if (error) toast.error('Failed to mark done: ' + error.message);
    else {
      await supabase.from('driver_inspection_logs').insert({
        schedule_id: schedule.id,
        driver_id: schedule.driver_id,
        inspection_type: schedule.inspection_type,
        completed_at: now.toISOString(),
        outcome: 'pass',
      });
      toast.success('Inspection marked as complete. Next due: ' + nextDue.toLocaleDateString('en-GB'));
      fetchInspectionSchedules();
    }
    setMarkingDone(null);
  }

  async function handleBulkReschedule() {
    if (!bulkRescheduleDate || selectedScheduleIds.size === 0) return;
    setBulkRescheduling(true);
    const ids = Array.from(selectedScheduleIds);
    const { error } = await supabase.from('driver_inspection_schedules').update({
      next_due_at: new Date(bulkRescheduleDate).toISOString(),
      updated_at: new Date().toISOString(),
    }).in('id', ids);
    if (error) toast.error('Bulk reschedule failed: ' + error.message);
    else {
      toast.success(`${ids.length} inspection${ids.length !== 1 ? 's' : ''} rescheduled to ${new Date(bulkRescheduleDate).toLocaleDateString('en-GB')}`);
      setSelectedScheduleIds(new Set());
      setShowBulkReschedule(false);
      setBulkRescheduleDate('');
      fetchInspectionSchedules();
    }
    setBulkRescheduling(false);
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'hsl(var(--foreground))' }}>Drivers</h1>
          <p className="text-sm mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Manage driver profiles, licences, documents, zones, and availability
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { fetchDrivers(); fetchRatings(); fetchZones(); fetchDocuments(); fetchInspectionSchedules(); }}
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

      {/* Overdue Alerts Banner */}
      {(overdueSchedules.length > 0 || dueSoonSchedules.length > 0) && (
        <div className="space-y-2">
          {overdueSchedules.length > 0 && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl border" style={{ backgroundColor: '#fef2f2', borderColor: '#fecaca' }}>
              <AlertCircle size={18} className="text-red-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-red-700">
                  {overdueSchedules.length} overdue inspection{overdueSchedules.length !== 1 ? 's' : ''}
                </p>
                <p className="text-xs text-red-600 mt-0.5">
                  {overdueSchedules.slice(0, 3).map((s) => {
                    const driver = drivers.find((d) => d.id === s.driver_id);
                    return driver ? `${driver.name} (${INSPECTION_TYPE_LABELS[s.inspection_type]})` : null;
                  }).filter(Boolean).join(', ')}
                  {overdueSchedules.length > 3 && ` +${overdueSchedules.length - 3} more`}
                </p>
              </div>
              <button onClick={() => { setActiveTab('inspections'); setInspectionStatusFilter('overdue'); }} className="text-xs font-medium px-3 py-1.5 rounded-lg text-white bg-red-600 hover:bg-red-700 transition-colors shrink-0">
                View All
              </button>
            </div>
          )}
          {dueSoonSchedules.length > 0 && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl border" style={{ backgroundColor: '#fffbeb', borderColor: '#fde68a' }}>
              <Bell size={18} className="text-amber-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-amber-700">
                  {dueSoonSchedules.length} inspection{dueSoonSchedules.length !== 1 ? 's' : ''} due within 14 days
                </p>
                <p className="text-xs text-amber-600 mt-0.5">
                  {dueSoonSchedules.slice(0, 3).map((s) => {
                    const driver = drivers.find((d) => d.id === s.driver_id);
                    return driver ? `${driver.name} (${getDaysLabel(s.next_due_at)})` : null;
                  }).filter(Boolean).join(', ')}
                  {dueSoonSchedules.length > 3 && ` +${dueSoonSchedules.length - 3} more`}
                </p>
              </div>
              <button onClick={() => { setActiveTab('inspections'); setInspectionStatusFilter('due_soon'); }} className="text-xs font-medium px-3 py-1.5 rounded-lg text-white bg-amber-500 hover:bg-amber-600 transition-colors shrink-0">
                View All
              </button>
            </div>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Active', value: totalActive, icon: Truck, color: 'hsl(var(--primary))' },
          { label: 'Available', value: totalAvailable, icon: CheckCircle2, color: '#22c55e' },
          { label: 'On Route', value: totalOnRoute, icon: MapPin, color: '#f97316' },
          { label: 'Fleet Avg Rating', value: fleetAvgRating > 0 ? fleetAvgRating.toFixed(1) : '—', icon: Star, color: '#eab308' },
        ].map((card) => (
          <div key={card.label} className="rounded-xl border p-4 flex items-center gap-3" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
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

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl border flex-wrap" style={{ backgroundColor: 'hsl(var(--secondary))', borderColor: 'hsl(var(--border))', width: 'fit-content' }}>
        {([
          { key: 'profiles', label: 'Driver Profiles' },
          { key: 'management', label: 'Management' },
          { key: 'vehicles', label: 'Vehicle Management' },
          { key: 'inspections', label: 'Inspections', badge: overdueSchedules.length > 0 ? overdueSchedules.length : undefined },
        ] as const).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5"
            style={{
              backgroundColor: activeTab === tab.key ? 'hsl(var(--card))' : 'transparent',
              color: activeTab === tab.key ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))',
              boxShadow: activeTab === tab.key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            }}
          >
            {tab.label}
            {'badge' in tab && tab.badge !== undefined && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold text-white bg-red-500">{tab.badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          PROFILES TAB
      ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'profiles' && (
        <div className="flex gap-5" style={{ minHeight: '600px' }}>
          {/* Driver List */}
          <div className="flex flex-col rounded-xl border overflow-hidden" style={{ width: '340px', minWidth: '280px', backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
            <div className="p-3 border-b" style={{ borderColor: 'hsl(var(--border))' }}>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'hsl(var(--muted-foreground))' }} />
                <input
                  type="text"
                  placeholder="Search drivers..."
                  value={profileSearch}
                  onChange={(e) => setProfileSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border outline-none focus:ring-2"
                  style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center h-40">
                  <Loader2 size={24} className="animate-spin" style={{ color: 'hsl(var(--primary))' }} />
                </div>
              ) : profileFiltered.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 gap-3">
                  <Truck size={32} style={{ color: 'hsl(var(--muted-foreground))' }} />
                  <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>No drivers found</p>
                </div>
              ) : (
                profileFiltered.map((driver) => {
                  const isSelected = selectedDriver?.id === driver.id;
                  const r = ratings[driver.id];
                  return (
                    <button
                      key={driver.id}
                      onClick={() => setSelectedDriver(driver)}
                      className="w-full text-left px-4 py-3 border-b flex items-center gap-3 transition-colors hover:bg-secondary"
                      style={{ borderColor: 'hsl(var(--border))', backgroundColor: isSelected ? 'hsl(var(--secondary))' : undefined }}
                    >
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 text-white" style={{ backgroundColor: 'hsl(var(--primary))' }}>
                        {driver.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold truncate" style={{ color: 'hsl(var(--foreground))' }}>{driver.name}</p>
                          {!driver.is_active && <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-medium shrink-0">Inactive</span>}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_COLOURS[driver.status]}`}>{driver.status}</span>
                          {r && r.avg_rating > 0 && (
                            <span className="text-[10px] flex items-center gap-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                              <Star size={10} className="text-yellow-400 fill-yellow-400" />{r.avg_rating.toFixed(1)}
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
              <div className="h-full rounded-xl border flex flex-col items-center justify-center gap-3" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
                <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: 'hsl(var(--secondary))' }}>
                  <User size={28} style={{ color: 'hsl(var(--muted-foreground))' }} />
                </div>
                <p className="text-base font-medium" style={{ color: 'hsl(var(--foreground))' }}>Select a driver</p>
                <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>Choose a driver from the list to view their full profile</p>
              </div>
            ) : (
              <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
                {/* Profile Header */}
                <div className="p-6 border-b" style={{ borderColor: 'hsl(var(--border))', background: 'linear-gradient(135deg, hsl(var(--primary) / 0.08) 0%, hsl(var(--card)) 100%)' }}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold shrink-0" style={{ backgroundColor: 'hsl(var(--primary) / 0.15)', color: 'hsl(var(--primary))' }}>
                        {selectedDriver.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h2 className="text-xl font-bold" style={{ color: 'hsl(var(--foreground))' }}>{selectedDriver.name}</h2>
                          <VerificationBadge status={selectedDriver.verification_status} />
                          {!selectedDriver.is_active && <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-medium">Inactive</span>}
                        </div>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOURS[selectedDriver.status]}`}>{selectedDriver.status}</span>
                          {selectedDriver.zone && <span className="text-xs flex items-center gap-1" style={{ color: 'hsl(var(--muted-foreground))' }}><MapPin size={11} />{selectedDriver.zone}</span>}
                          <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>Member since {new Date(selectedDriver.created_at).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                      <button onClick={() => openEdit(selectedDriver)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors hover:bg-secondary" style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}>
                        <Edit2 size={13} />Edit
                      </button>
                      <button onClick={() => openCredentials(selectedDriver)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors hover:bg-secondary" style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}>
                        <KeyRound size={13} />Set Credentials
                      </button>
                      <button onClick={() => setConfirmDeactivate(selectedDriver)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${selectedDriver.is_active ? 'border-red-200 text-red-600 hover:bg-red-50' : 'border-green-200 text-green-600 hover:bg-green-50'}`}>
                        {selectedDriver.is_active ? <UserX size={13} /> : <UserCheck size={13} />}
                        {selectedDriver.is_active ? 'Deactivate' : 'Reactivate'}
                      </button>
                    </div>
                  </div>
                  {selectedRating && (
                    <div className="mt-4 flex items-center gap-6 flex-wrap">
                      <div className="flex items-center gap-2">
                        <StarRating rating={selectedRating.avg_rating} size={16} />
                        <span className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>{selectedRating.avg_rating.toFixed(1)}</span>
                        <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>avg rating</span>
                      </div>
                      <div className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}><span className="font-semibold" style={{ color: 'hsl(var(--foreground))' }}>{selectedRating.total_deliveries}</span> deliveries</div>
                      <div className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}><span className="font-semibold text-green-600">{selectedRating.successful_deliveries}</span> successful</div>
                      {selectedRating.total_deliveries > 0 && (
                        <div className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}><span className="font-semibold" style={{ color: 'hsl(var(--foreground))' }}>{Math.round((selectedRating.successful_deliveries / selectedRating.total_deliveries) * 100)}%</span> success rate</div>
                      )}
                    </div>
                  )}
                </div>

                {/* Profile Body */}
                <div className="p-6 overflow-y-auto" style={{ maxHeight: '520px' }}>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div className="space-y-6">
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
                      <div>
                        <SectionHeader title="Vehicle Information" />
                        <div className="space-y-3">
                          <InfoRow icon={Car} label="Vehicle" value={selectedDriver.vehicle} />
                          <InfoRow icon={Hash} label="Plate Number" value={selectedDriver.plate} />
                          <InfoRow icon={MapPin} label="Zone" value={selectedDriver.zone} />
                        </div>
                      </div>
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
                      {selectedDriver.notes && (
                        <div>
                          <SectionHeader title="Notes" />
                          <p className="text-sm" style={{ color: 'hsl(var(--foreground))' }}>{selectedDriver.notes}</p>
                        </div>
                      )}
                      <div>
                        <SectionHeader title="Verification Status" />
                        <div className="flex items-center gap-2 flex-wrap">
                          <VerificationBadge status={selectedDriver.verification_status} />
                          <div className="flex gap-1.5 flex-wrap">
                            {(['unverified', 'pending', 'verified', 'rejected'] as VerificationStatus[]).map((vs) => (
                              <button
                                key={vs}
                                onClick={() => updateVerification(selectedDriver, vs)}
                                className={`text-xs px-2 py-1 rounded-lg border transition-colors ${selectedDriver.verification_status === vs ? 'font-semibold' : 'hover:bg-secondary'}`}
                                style={{ borderColor: selectedDriver.verification_status === vs ? VERIFICATION_CONFIG[vs].color : 'hsl(var(--border))', color: selectedDriver.verification_status === vs ? VERIFICATION_CONFIG[vs].color : 'hsl(var(--muted-foreground))' }}
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
                        <div className="flex items-center gap-2 flex-1">
                          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'hsl(var(--muted-foreground))' }}>Documents</p>
                          <div className="flex-1 h-px" style={{ backgroundColor: 'hsl(var(--border))' }} />
                        </div>
                        <button onClick={() => setShowDocUpload((v) => !v)} className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors hover:bg-secondary ml-2" style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}>
                          <Upload size={12} />Upload
                        </button>
                      </div>
                      {showDocUpload && (
                        <div className="mb-4 p-4 rounded-xl border space-y-3" style={{ backgroundColor: 'hsl(var(--secondary))', borderColor: 'hsl(var(--border))' }}>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-xs font-medium block mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Type</label>
                              <select value={docType} onChange={(e) => setDocType(e.target.value as DocType)} className="w-full px-2 py-1.5 text-sm rounded-lg border outline-none" style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}>
                                {(Object.keys(DOC_TYPE_LABELS) as DocType[]).map((t) => <option key={t} value={t}>{DOC_TYPE_LABELS[t]}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className="text-xs font-medium block mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Expiry Date</label>
                              <input type="date" value={docExpiry} onChange={(e) => setDocExpiry(e.target.value)} className="w-full px-2 py-1.5 text-sm rounded-lg border outline-none" style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }} />
                            </div>
                          </div>
                          <div>
                            <label className="text-xs font-medium block mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Notes</label>
                            <input type="text" value={docNotes} onChange={(e) => setDocNotes(e.target.value)} placeholder="Optional notes..." className="w-full px-2 py-1.5 text-sm rounded-lg border outline-none" style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }} />
                          </div>
                          <div>
                            <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" onChange={(e) => setDocFile(e.target.files?.[0] ?? null)} />
                            <button onClick={() => fileInputRef.current?.click()} className="w-full py-2 rounded-lg border-2 border-dashed text-sm transition-colors hover:bg-secondary" style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}>
                              {docFile ? docFile.name : 'Click to select file'}
                            </button>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={handleDocUpload} disabled={uploadingDoc || !docFile} className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: 'hsl(var(--primary))' }}>
                              {uploadingDoc ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}Upload
                            </button>
                            <button onClick={() => { setShowDocUpload(false); setDocFile(null); }} className="px-3 py-1.5 rounded-lg border text-sm transition-colors hover:bg-secondary" style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}>Cancel</button>
                          </div>
                        </div>
                      )}
                      {selectedDocs.length === 0 ? (
                        <div className="rounded-xl border p-6 flex flex-col items-center gap-2" style={{ borderColor: 'hsl(var(--border))' }}>
                          <FileImage size={28} style={{ color: 'hsl(var(--muted-foreground))' }} />
                          <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>No documents uploaded</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {selectedDocs.map((doc) => {
                            const isExpired = doc.expiry_date && new Date(doc.expiry_date) < new Date();
                            const expiringSoon = doc.expiry_date && !isExpired && new Date(doc.expiry_date) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
                            return (
                              <div key={doc.id} className="flex items-center gap-3 p-3 rounded-xl border" style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))' }}>
                                <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: 'hsl(var(--secondary))' }}>
                                  <FileText size={16} style={{ color: 'hsl(var(--primary))' }} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium truncate" style={{ color: 'hsl(var(--foreground))' }}>{DOC_TYPE_LABELS[doc.doc_type]}</p>
                                  <p className="text-xs truncate" style={{ color: 'hsl(var(--muted-foreground))' }}>{doc.file_name}</p>
                                  {doc.expiry_date && (
                                    <p className={`text-xs font-medium ${isExpired ? 'text-red-500' : expiringSoon ? 'text-orange-500' : ''}`} style={!isExpired && !expiringSoon ? { color: 'hsl(var(--muted-foreground))' } : {}}>
                                      {isExpired ? '⚠ Expired: ' : expiringSoon ? '⚡ Expires: ' : 'Expires: '}{new Date(doc.expiry_date).toLocaleDateString('en-GB')}
                                    </p>
                                  )}
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg transition-colors hover:bg-secondary" title="View document"><Eye size={13} style={{ color: 'hsl(var(--muted-foreground))' }} /></a>
                                  <button onClick={() => deleteDocument(doc.id)} className="p-1.5 rounded-lg transition-colors hover:bg-red-50" title="Delete document"><Trash2 size={13} className="text-red-400" /></button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {selectedDriver.access_code && (
                        <div className="mt-6">
                          <SectionHeader title="Portal Access" />
                          <div className="flex items-center gap-3 p-3 rounded-xl border" style={{ backgroundColor: 'hsl(var(--secondary))', borderColor: 'hsl(var(--border))' }}>
                            <Hash size={14} style={{ color: 'hsl(var(--muted-foreground))' }} />
                            <div>
                              <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>Driver Portal Access Code</p>
                              <p className="text-sm font-mono font-semibold tracking-widest" style={{ color: 'hsl(var(--foreground))' }}>{selectedDriver.access_code}</p>
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
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          MANAGEMENT TAB
      ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'management' && (
        <div className="space-y-5">
          {/* Management toolbar */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => { setShowArchived((v) => !v); clearSelection(); }}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors"
              style={{ backgroundColor: showArchived ? 'hsl(var(--primary))' : 'hsl(var(--background))', borderColor: showArchived ? 'hsl(var(--primary))' : 'hsl(var(--border))', color: showArchived ? 'white' : 'hsl(var(--foreground))' }}
            >
              <Archive size={15} />
              {showArchived ? 'Archived' : 'Active'}
            </button>
            <div className="relative flex-1 min-w-48">
              <button onClick={() => setExportOpen((o) => !o)} className="flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors hover:bg-secondary" style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}>
                <Download size={15} />Export
                <span className="text-xs px-1.5 py-0.5 rounded-full font-semibold" style={{ backgroundColor: 'hsl(var(--primary))', color: 'white' }}>{mgmtFiltered.length}</span>
                <ChevronDown size={13} />
              </button>
              {exportOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setExportOpen(false)} />
                  <div className="absolute right-0 mt-1 w-48 rounded-xl border shadow-lg z-50 overflow-hidden" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
                    <div className="px-3 py-2 border-b" style={{ borderColor: 'hsl(var(--border))' }}>
                      <p className="text-xs font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>Export {mgmtFiltered.length} driver{mgmtFiltered.length !== 1 ? 's' : ''}</p>
                    </div>
                    <button onClick={() => { exportCSV(buildExportRows(mgmtFiltered, ratings), statusFilter); setExportOpen(false); }} className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-secondary transition-colors" style={{ color: 'hsl(var(--foreground))' }}>
                      <FileSpreadsheet size={15} className="text-green-600" />Export as CSV
                    </button>
                    <button onClick={() => { exportPDF(buildExportRows(mgmtFiltered, ratings), statusFilter); setExportOpen(false); }} className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-secondary transition-colors" style={{ color: 'hsl(var(--foreground))' }}>
                      <FileText size={15} className="text-red-500" />Export as PDF
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'hsl(var(--muted-foreground))' }} />
              <input type="text" placeholder="Search by name, phone, email, plate…" value={mgmtSearch} onChange={(e) => setMgmtSearch(e.target.value)} className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border outline-none focus:ring-2" style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }} />
            </div>
            <div className="flex gap-2">
              {(['all', 'active', 'inactive'] as const).map((f) => (
                <button key={f} onClick={() => setStatusFilter(f)} className="px-3 py-2 text-sm rounded-lg border font-medium transition-colors capitalize" style={{ backgroundColor: statusFilter === f ? 'hsl(var(--primary))' : 'hsl(var(--background))', borderColor: statusFilter === f ? 'hsl(var(--primary))' : 'hsl(var(--border))', color: statusFilter === f ? 'white' : 'hsl(var(--foreground))' }}>{f}</button>
              ))}
            </div>
            <div className="relative">
              <MapPin size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'hsl(var(--muted-foreground))' }} />
              <select value={zoneFilter} onChange={(e) => setZoneFilter(e.target.value)} className="appearance-none pl-8 pr-8 py-2 text-sm rounded-lg border outline-none focus:ring-2" style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}>
                <option value="all">All Zones</option>
                <option value="none">No Zone</option>
                {zones.filter((z) => z.name !== 'Unassigned').map((z) => <option key={z.id} value={z.name}>{z.name}</option>)}
              </select>
              <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'hsl(var(--muted-foreground))' }} />
            </div>
          </div>

          {/* Bulk Action Toolbar */}
          {!loading && mgmtFiltered.length > 0 && (
            <div className="flex items-center gap-3 flex-wrap px-4 py-3 rounded-xl border" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
              <button onClick={toggleSelectAll} className="flex items-center gap-2 text-sm font-medium transition-colors hover:opacity-80" style={{ color: 'hsl(var(--foreground))' }}>
                {allSelected ? <CheckSquare size={16} style={{ color: 'hsl(var(--primary))' }} /> : someSelected ? <CheckSquare size={16} style={{ color: 'hsl(var(--muted-foreground))' }} /> : <Square size={16} style={{ color: 'hsl(var(--muted-foreground))' }} />}
                {allSelected ? 'Deselect All' : 'Select All'}
              </button>
              {selectedIds.size > 0 && (
                <>
                  <div className="h-4 w-px" style={{ backgroundColor: 'hsl(var(--border))' }} />
                  <div className="flex items-center gap-1.5">
                    <Users size={14} style={{ color: 'hsl(var(--primary))' }} />
                    <span className="text-sm font-semibold" style={{ color: 'hsl(var(--primary))' }}>{selectedIds.size} selected</span>
                  </div>
                  <div className="h-4 w-px" style={{ backgroundColor: 'hsl(var(--border))' }} />
                  <button onClick={bulkActivate} disabled={bulkLoading} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60" style={{ backgroundColor: '#22c55e' }}>
                    {bulkLoading ? <Loader2 size={12} className="animate-spin" /> : <UserCheck size={13} />}Activate
                  </button>
                  <button onClick={bulkDeactivate} disabled={bulkLoading} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60 bg-red-500">
                    {bulkLoading ? <Loader2 size={12} className="animate-spin" /> : <UserX size={13} />}Deactivate
                  </button>
                  <div className="relative">
                    <button onClick={() => setShowBulkZoneDropdown((v) => !v)} disabled={bulkLoading} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors hover:bg-secondary disabled:opacity-60" style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}>
                      <Zap size={14} style={{ color: 'hsl(var(--primary))' }} />Assign Zone<ChevronDown size={11} />
                    </button>
                    {showBulkZoneDropdown && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setShowBulkZoneDropdown(false)} />
                        <div className="absolute left-0 mt-1 w-44 rounded-xl border shadow-lg z-50 overflow-hidden" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
                          <div className="px-3 py-2 border-b" style={{ borderColor: 'hsl(var(--border))' }}>
                            <p className="text-xs font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>Assign zone to {selectedIds.size} driver{selectedIds.size !== 1 ? 's' : ''}</p>
                          </div>
                          <button onClick={() => bulkAssignZone(null)} className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-secondary transition-colors" style={{ color: 'hsl(var(--muted-foreground))' }}>
                            <X size={12} />Clear Zone
                          </button>
                          {zones.filter((z) => z.name !== 'Unassigned').map((z) => (
                            <button key={z.id} onClick={() => bulkAssignZone(z.name)} className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-secondary transition-colors" style={{ color: 'hsl(var(--foreground))' }}>
                              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: z.color }} />{z.name}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                  <button onClick={clearSelection} className="flex items-center gap-1 text-xs transition-colors hover:opacity-80" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    <X size={12} />Clear
                  </button>
                </>
              )}
            </div>
          )}

          {/* Driver Grid */}
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={28} className="animate-spin" style={{ color: 'hsl(var(--primary))' }} />
            </div>
          ) : mgmtFiltered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Truck size={40} style={{ color: 'hsl(var(--muted-foreground))' }} />
              <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>No drivers found</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {mgmtFiltered.map((driver) => {
                const r = ratings[driver.id];
                const successRate = r && r.total_deliveries > 0 ? Math.round((r.successful_deliveries / r.total_deliveries) * 100) : null;
                const failedDeliveries = r ? r.total_deliveries - r.successful_deliveries : 0;
                const isSelected = selectedIds.has(driver.id);
                const driverDocs = documents[driver.id] ?? [];
                const hasLicense = driverDocs.some((d) => d.doc_type === 'license');
                const hasInsurance = driverDocs.some((d) => d.doc_type === 'insurance');
                return (
                  <div
                    key={driver.id}
                    className={`rounded-xl border p-4 flex flex-col gap-3 transition-all ${!driver.is_active || driver.is_archived ? 'opacity-60' : ''} ${isSelected ? 'ring-2' : ''}`}
                    style={{ backgroundColor: 'hsl(var(--card))', borderColor: isSelected ? 'hsl(var(--primary))' : 'hsl(var(--border))' }}
                  >
                    {/* Top row */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <button onClick={() => toggleSelectDriver(driver.id)} className="shrink-0 transition-colors hover:opacity-80" title={isSelected ? 'Deselect' : 'Select'}>
                          {isSelected ? <CheckSquare size={16} style={{ color: 'hsl(var(--primary))' }} /> : <Square size={16} style={{ color: 'hsl(var(--muted-foreground))' }} />}
                        </button>
                        <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 text-white" style={{ backgroundColor: 'hsl(var(--primary))' }}>
                          {driver.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-sm truncate" style={{ color: 'hsl(var(--foreground))' }}>{driver.name}</p>
                          <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOURS[driver.status]}`}>{driver.status}</span>
                            {!driver.is_active && !driver.is_archived && <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-medium">Inactive</span>}
                            {driver.is_archived && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">Archived</span>}
                          </div>
                        </div>
                      </div>
                      <ZoneBadge zone={driver.zone} zones={zones} />
                    </div>

                    {/* Contact & Vehicle */}
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}><Phone size={12} /><span>{driver.phone}</span></div>
                      {driver.email && <div className="flex items-center gap-2 text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}><Mail size={12} /><span className="truncate">{driver.email}</span></div>}
                      {driver.vehicle && <div className="flex items-center gap-2 text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}><Truck size={12} /><span>{driver.vehicle} · {driver.plate}</span></div>}
                      {driver.access_code && (
                        <div className="flex items-center gap-2 text-xs mt-1">
                          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg w-full" style={{ backgroundColor: 'hsl(var(--primary) / 0.08)', border: '1px solid hsl(var(--primary) / 0.2)' }}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'hsl(var(--primary))', flexShrink: 0 }}><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                            <span className="font-medium" style={{ color: 'hsl(var(--primary))' }}>Access Code:</span>
                            <span className="font-mono font-bold tracking-widest" style={{ color: 'hsl(var(--foreground))' }}>{driver.access_code}</span>
                            <button onClick={() => { navigator.clipboard.writeText(driver.access_code!); toast.success('Access code copied!', { duration: 2000 }); }} className="ml-auto p-0.5 rounded transition-opacity hover:opacity-70" title="Copy access code" style={{ color: 'hsl(var(--primary))' }}>
                              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2v4"/></svg>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Documents Summary */}
                    <div className="rounded-lg p-2.5 space-y-1.5" style={{ backgroundColor: 'hsl(var(--secondary))' }}>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium" style={{ color: 'hsl(var(--foreground))' }}>Documents</span>
                        <button onClick={() => openDocModal(driver)} className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-md transition-colors hover:opacity-80 text-white" style={{ backgroundColor: 'hsl(var(--primary))' }}>
                          <Upload size={10} />Upload
                        </button>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className={`flex items-center gap-1 text-xs ${hasLicense ? 'text-green-600' : 'text-gray-400'}`}><FileText size={11} /><span>Licence</span>{hasLicense && <CheckCircle2 size={10} className="text-green-500" />}</div>
                        <div className={`flex items-center gap-1 text-xs ${hasInsurance ? 'text-green-600' : 'text-gray-400'}`}><FileImage size={11} /><span>Insurance</span>{hasInsurance && <CheckCircle2 size={10} className="text-green-500" />}</div>
                        {driverDocs.length > 0 && <span className="text-xs ml-auto" style={{ color: 'hsl(var(--muted-foreground))' }}>{driverDocs.length} file{driverDocs.length !== 1 ? 's' : ''}</span>}
                      </div>
                    </div>

                    {/* Performance */}
                    {r && r.total_deliveries > 0 ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5"><TrendingUp size={12} style={{ color: 'hsl(var(--muted-foreground))' }} /><span className="text-xs font-medium" style={{ color: 'hsl(var(--foreground))' }}>Performance</span></div>
                          <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>{r.total_deliveries} deliveries</span>
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>Success rate</span>
                            <span className="text-xs font-semibold" style={{ color: successRate && successRate >= 80 ? '#22c55e' : successRate && successRate >= 60 ? '#f97316' : '#ef4444' }}>{successRate}%</span>
                          </div>
                          <PerformanceBar value={successRate ?? 0} color={successRate && successRate >= 80 ? '#22c55e' : successRate && successRate >= 60 ? '#f97316' : '#ef4444'} />
                        </div>
                        {r.avg_rating > 0 && (
                          <div className="flex items-center justify-between">
                            <StarRating rating={r.avg_rating} size={12} />
                            <span className="text-xs font-semibold" style={{ color: 'hsl(var(--foreground))' }}>{r.avg_rating.toFixed(1)} / 5</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-8 gap-3">
                        <BarChart2 size={36} style={{ color: 'hsl(var(--muted-foreground))' }} />
                        <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>No performance data available yet</p>
                      </div>
                    )}

                    {/* Zone Assignment */}
                    {!driver.is_archived && (
                      <div className="flex items-center gap-2">
                        <MapPin size={12} style={{ color: 'hsl(var(--muted-foreground))' }} />
                        <div className="relative flex-1">
                          <select value={driver.zone ?? ''} onChange={(e) => assignZone(driver.id, e.target.value || null)} className="w-full appearance-none pl-2 pr-6 py-1 text-xs rounded-lg border outline-none" style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}>
                            <option value="">Assign zone…</option>
                            {zones.filter((z) => z.name !== 'Unassigned').map((z) => <option key={z.id} value={z.name}>{z.name}</option>)}
                          </select>
                          <ChevronDown size={11} className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'hsl(var(--muted-foreground))' }} />
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-2 pt-1 border-t" style={{ borderColor: 'hsl(var(--border))' }}>
                      {!driver.is_archived && (
                        <button onClick={() => toggleStatus(driver)} disabled={!driver.is_active} className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed" style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }} title={driver.status === 'Available' ? 'Set Off Duty' : 'Set Available'}>
                          {driver.status === 'Available' ? <ToggleRight size={14} className="text-green-500" /> : <ToggleLeft size={14} style={{ color: 'hsl(var(--muted-foreground))' }} />}
                          {driver.status === 'Available' ? 'Available' : 'Off Duty'}
                        </button>
                      )}
                      <div className="flex-1" />
                      {!driver.is_archived && (
                        <button onClick={() => openEdit(driver)} className="p-1.5 rounded-lg border transition-colors hover:bg-secondary" style={{ borderColor: 'hsl(var(--border))' }} title="Edit driver">
                          <Edit2 size={14} style={{ color: 'hsl(var(--muted-foreground))' }} />
                        </button>
                      )}
                      {!driver.is_archived && (
                        <button onClick={() => setConfirmDeactivate(driver)} className="p-1.5 rounded-lg border transition-colors hover:bg-secondary" style={{ borderColor: 'hsl(var(--border))' }} title={driver.is_active ? 'Deactivate driver' : 'Reactivate driver'}>
                          {driver.is_active ? <UserX size={14} className="text-red-500" /> : <UserCheck size={14} className="text-green-500" />}
                        </button>
                      )}
                      <button onClick={() => setConfirmArchive(driver)} className="p-1.5 rounded-lg border transition-colors hover:bg-secondary" style={{ borderColor: 'hsl(var(--border))' }} title={driver.is_archived ? 'Restore driver' : 'Archive driver'}>
                        {driver.is_archived ? <ArchiveRestore size={14} className="text-blue-500" /> : <Archive size={14} className="text-amber-500" />}
                      </button>
                      <button onClick={() => setConfirmDelete(driver)} className="p-1.5 rounded-lg border transition-colors hover:bg-red-50" style={{ borderColor: 'hsl(var(--border))' }} title="Permanently delete driver">
                        <Trash2 size={14} className="text-red-500" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          VEHICLES TAB
      ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'vehicles' && (
        <VehicleManagementContent />
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          MODALS
      ═══════════════════════════════════════════════════════════════════════ */}

      {/* Add / Edit Driver Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="w-full max-w-2xl rounded-2xl border shadow-2xl overflow-hidden" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'hsl(var(--border))' }}>
              <h2 className="text-lg font-semibold" style={{ color: 'hsl(var(--foreground))' }}>{editingDriver ? 'Edit Driver' : 'Add New Driver'}</h2>
              <button onClick={closeForm} className="p-1.5 rounded-lg hover:bg-secondary transition-colors"><X size={18} style={{ color: 'hsl(var(--muted-foreground))' }} /></button>
            </div>
            <div className="p-6 overflow-y-auto" style={{ maxHeight: '70vh' }}>
              <div className="space-y-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'hsl(var(--muted-foreground))' }}>Basic Information</p>
                  <div className="grid grid-cols-2 gap-4">
                    {[{ key: 'name', label: 'Full Name *', placeholder: 'John Smith' }, { key: 'phone', label: 'Phone *', placeholder: '+44 7700 000000' }, { key: 'email', label: 'Email', placeholder: 'john@example.com' }, { key: 'zone', label: 'Zone', placeholder: 'Zone A' }].map(({ key, label, placeholder }) => (
                      <div key={key}>
                        <label className="text-xs font-medium block mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>{label}</label>
                        <input type={key === 'email' ? 'email' : 'text'} value={(form as Record<string, string>)[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} placeholder={placeholder} className="w-full px-3 py-2 text-sm rounded-lg border outline-none focus:ring-2" style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }} />
                      </div>
                    ))}
                    <div>
                      <label className="text-xs font-medium block mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Status</label>
                      <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as DriverStatus }))} className="w-full px-3 py-2 text-sm rounded-lg border outline-none" style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}>
                        {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'hsl(var(--muted-foreground))' }}>Vehicle Information</p>
                  <div className="grid grid-cols-2 gap-4">
                    {[{ key: 'vehicle', label: 'Vehicle', placeholder: 'Ford Transit' }, { key: 'plate', label: 'Plate Number', placeholder: 'AB12 CDE' }].map(({ key, label, placeholder }) => (
                      <div key={key}>
                        <label className="text-xs font-medium block mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>{label}</label>
                        <input type="text" value={(form as Record<string, string>)[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} placeholder={placeholder} className="w-full px-3 py-2 text-sm rounded-lg border outline-none focus:ring-2" style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }} />
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'hsl(var(--muted-foreground))' }}>Licence Information</p>
                  <div className="grid grid-cols-2 gap-4">
                    {[{ key: 'license_number', label: 'Licence Number', placeholder: 'SMITH123456AB9CD' }, { key: 'license_class', label: 'Licence Class', placeholder: 'Class C' }].map(({ key, label, placeholder }) => (
                      <div key={key}>
                        <label className="text-xs font-medium block mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>{label}</label>
                        <input type="text" value={(form as Record<string, string>)[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} placeholder={placeholder} className="w-full px-3 py-2 text-sm rounded-lg border outline-none focus:ring-2" style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }} />
                      </div>
                    ))}
                    <div>
                      <label className="text-xs font-medium block mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Licence Expiry</label>
                      <input type="date" value={form.license_expiry} onChange={(e) => setForm((f) => ({ ...f, license_expiry: e.target.value }))} className="w-full px-3 py-2 text-sm rounded-lg border outline-none focus:ring-2" style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }} />
                    </div>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'hsl(var(--muted-foreground))' }}>Contact & Emergency</p>
                  <div className="grid grid-cols-2 gap-4">
                    {[{ key: 'address', label: 'Address', placeholder: '123 Main St, London' }, { key: 'emergency_contact', label: 'Emergency Contact', placeholder: 'Jane Smith' }, { key: 'emergency_phone', label: 'Emergency Phone', placeholder: '+44 7700 000001' }].map(({ key, label, placeholder }) => (
                      <div key={key}>
                        <label className="text-xs font-medium block mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>{label}</label>
                        <input type="text" value={(form as Record<string, string>)[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} placeholder={placeholder} className="w-full px-3 py-2 text-sm rounded-lg border outline-none focus:ring-2" style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }} />
                      </div>
                    ))}
                    <div className="col-span-2">
                      <label className="text-xs font-medium block mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Notes</label>
                      <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Any additional notes..." rows={2} className="w-full px-3 py-2 text-sm rounded-lg border outline-none focus:ring-2 resize-none" style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t" style={{ borderColor: 'hsl(var(--border))' }}>
              <button onClick={closeForm} className="px-4 py-2 rounded-lg border text-sm font-medium transition-colors hover:bg-secondary" style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}>Cancel</button>
              <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: 'hsl(var(--primary))' }}>
                {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                {editingDriver ? 'Save Changes' : 'Add Driver'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Set Credentials Modal */}
      {showCredentials && credentialsDriver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'hsl(var(--border))' }}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'hsl(var(--primary) / 0.1)' }}><KeyRound size={16} style={{ color: 'hsl(var(--primary))' }} /></div>
                <div>
                  <h2 className="text-base font-semibold" style={{ color: 'hsl(var(--foreground))' }}>Set Driver Credentials</h2>
                  <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>{credentialsDriver.name}</p>
                </div>
              </div>
              <button onClick={() => setShowCredentials(false)} className="p-1.5 rounded-lg hover:bg-secondary transition-colors"><X size={18} style={{ color: 'hsl(var(--muted-foreground))' }} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-start gap-3 p-3 rounded-lg text-sm" style={{ backgroundColor: 'hsl(var(--primary) / 0.06)', border: '1px solid hsl(var(--primary) / 0.15)' }}>
                <KeyRound size={15} className="shrink-0 mt-0.5" style={{ color: 'hsl(var(--primary))' }} />
                <p style={{ color: 'hsl(var(--foreground))' }}>These credentials allow the driver to log into the <strong>Driver Portal</strong>.</p>
              </div>
              <div>
                <label className="text-xs font-medium block mb-1.5" style={{ color: 'hsl(var(--muted-foreground))' }}>Email Address <span className="text-red-500">*</span></label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'hsl(var(--muted-foreground))' }}><Mail size={15} /></span>
                  <input type="email" value={credEmail} onChange={(e) => setCredEmail(e.target.value)} placeholder="driver@example.com" className="w-full pl-9 pr-3 py-2.5 text-sm rounded-lg border outline-none focus:ring-2" style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }} />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium block mb-1.5" style={{ color: 'hsl(var(--muted-foreground))' }}>Password <span className="text-red-500">*</span></label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'hsl(var(--muted-foreground))' }}><KeyRound size={15} /></span>
                  <input type={credShowPassword ? 'text' : 'password'} value={credPassword} onChange={(e) => setCredPassword(e.target.value)} placeholder="Min. 6 characters" className="w-full pl-9 pr-10 py-2.5 text-sm rounded-lg border outline-none focus:ring-2" style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }} />
                  <button type="button" onClick={() => setCredShowPassword((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors" style={{ color: 'hsl(var(--muted-foreground))' }} tabIndex={-1}>
                    {credShowPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                <p className="text-xs mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>{credentialsDriver.auth_user_id ? 'Saving will update the existing password.' : 'A new driver portal account will be created.'}</p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t" style={{ borderColor: 'hsl(var(--border))' }}>
              <button onClick={() => setShowCredentials(false)} className="px-4 py-2 rounded-lg border text-sm font-medium transition-colors hover:bg-secondary" style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}>Cancel</button>
              <button onClick={handleSetCredentials} disabled={savingCredentials} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: 'hsl(var(--primary))' }}>
                {savingCredentials ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}
                {credentialsDriver.auth_user_id ? 'Update Credentials' : 'Set Credentials'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Document Upload Modal (Management tab) */}
      {docModalDriver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="w-full max-w-lg rounded-2xl shadow-xl p-6 space-y-5 max-h-[90vh] overflow-y-auto" style={{ backgroundColor: 'hsl(var(--card))' }}>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold" style={{ color: 'hsl(var(--foreground))' }}>Documents — {docModalDriver.name}</h2>
                <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>Upload licence, insurance, or other documents</p>
              </div>
              <button onClick={closeDocModal} className="p-1.5 rounded-lg hover:bg-secondary transition-colors"><X size={18} style={{ color: 'hsl(var(--muted-foreground))' }} /></button>
            </div>
            {(documents[docModalDriver.id] ?? []).length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>Uploaded Documents</p>
                {(documents[docModalDriver.id] ?? []).map((doc) => (
                  <div key={doc.id} className="flex items-center gap-3 p-2.5 rounded-lg border" style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--secondary))' }}>
                    <FileText size={16} style={{ color: 'hsl(var(--primary))' }} className="shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate" style={{ color: 'hsl(var(--foreground))' }}>{doc.file_name}</p>
                      <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>{DOC_TYPE_LABELS[doc.doc_type as DocType] ?? doc.doc_type}{doc.expiry_date && ` · Expires ${new Date(doc.expiry_date).toLocaleDateString()}`}</p>
                    </div>
                    <a href={doc.file_url} download={doc.file_name} className="p-1.5 rounded-lg hover:bg-secondary transition-colors" title="Download"><Eye size={13} style={{ color: 'hsl(var(--muted-foreground))' }} /></a>
                    <button onClick={() => deleteDocument(doc.id)} className="p-1.5 rounded-lg hover:bg-red-50 transition-colors" title="Delete document"><Trash2 size={13} className="text-red-500" /></button>
                  </div>
                ))}
              </div>
            )}
            <div className="space-y-3 pt-2 border-t" style={{ borderColor: 'hsl(var(--border))' }}>
              <p className="text-xs font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>Upload New Document</p>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'hsl(var(--muted-foreground))' }}>Document Type</label>
                <div className="relative">
                  <select value={mgmtDocType} onChange={(e) => setMgmtDocType(e.target.value as DocType)} className="w-full appearance-none px-3 py-2 text-sm rounded-lg border outline-none focus:ring-2 pr-8" style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}>
                    <option value="license">Driver&apos;s Licence</option>
                    <option value="insurance">Insurance</option>
                    <option value="other">Other</option>
                  </select>
                  <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'hsl(var(--muted-foreground))' }} />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'hsl(var(--muted-foreground))' }}>Expiry Date (optional)</label>
                <div className="relative">
                  <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'hsl(var(--muted-foreground))' }} />
                  <input type="date" value={mgmtDocExpiry} onChange={(e) => setMgmtDocExpiry(e.target.value)} className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border outline-none focus:ring-2" style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }} />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'hsl(var(--muted-foreground))' }}>Notes (optional)</label>
                <input type="text" value={mgmtDocNotes} onChange={(e) => setMgmtDocNotes(e.target.value)} placeholder="e.g. Renewal pending" className="w-full px-3 py-2 text-sm rounded-lg border outline-none focus:ring-2" style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }} />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'hsl(var(--muted-foreground))' }}>File *</label>
                <input ref={mgmtFileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={(e) => setMgmtDocFile(e.target.files?.[0] ?? null)} className="hidden" />
                <button onClick={() => mgmtFileInputRef.current?.click()} className="w-full flex items-center justify-center gap-2 px-3 py-3 rounded-lg border-2 border-dashed text-sm transition-colors hover:bg-secondary" style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}>
                  <Upload size={16} />{mgmtDocFile ? mgmtDocFile.name : 'Click to select file (PDF, JPG, PNG)'}
                </button>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={closeDocModal} className="flex-1 py-2 text-sm rounded-lg border transition-colors hover:bg-secondary" style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}>Close</button>
              <button onClick={handleMgmtDocUpload} disabled={mgmtUploadingDoc || !mgmtDocFile} className="flex-1 py-2 text-sm rounded-lg font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2" style={{ backgroundColor: 'hsl(var(--primary))' }}>
                {mgmtUploadingDoc && <Loader2 size={14} className="animate-spin" />}Upload Document
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Performance Stats Modal */}
      {statsDriver && (() => {
        const r = ratings[statsDriver.id];
        const successRate = r && r.total_deliveries > 0 ? Math.round((r.successful_deliveries / r.total_deliveries) * 100) : 0;
        const failedDeliveries = r ? r.total_deliveries - r.successful_deliveries : 0;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
            <div className="w-full max-w-md rounded-2xl shadow-xl p-6 space-y-5" style={{ backgroundColor: 'hsl(var(--card))' }}>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold" style={{ color: 'hsl(var(--foreground))' }}>Performance Stats</h2>
                  <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>{statsDriver.name}</p>
                </div>
                <button onClick={() => setStatsDriver(null)} className="p-1.5 rounded-lg hover:bg-secondary transition-colors"><X size={18} style={{ color: 'hsl(var(--muted-foreground))' }} /></button>
              </div>
              {r && r.total_deliveries > 0 ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    {[{ label: 'Total Deliveries', value: r.total_deliveries, color: 'hsl(var(--primary))' }, { label: 'Successful', value: r.successful_deliveries, color: '#22c55e' }, { label: 'Failed', value: failedDeliveries, color: '#ef4444' }, { label: 'Avg Rating', value: r.avg_rating > 0 ? `${r.avg_rating.toFixed(1)} / 5` : '—', color: '#eab308' }].map((stat) => (
                      <div key={stat.label} className="rounded-xl p-3 border" style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--secondary))' }}>
                        <p className="text-xl font-bold" style={{ color: stat.color }}>{stat.value}</p>
                        <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>{stat.label}</p>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium" style={{ color: 'hsl(var(--foreground))' }}>Success Rate</span>
                      <span className="text-sm font-bold" style={{ color: successRate >= 80 ? '#22c55e' : successRate >= 60 ? '#f97316' : '#ef4444' }}>{successRate}%</span>
                    </div>
                    <div className="w-full h-3 rounded-full bg-gray-100 overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${successRate}%`, backgroundColor: successRate >= 80 ? '#22c55e' : successRate >= 60 ? '#f97316' : '#ef4444' }} />
                    </div>
                  </div>
                  {r.avg_rating > 0 && (
                    <div className="flex items-center justify-between p-3 rounded-xl border" style={{ borderColor: 'hsl(var(--border))' }}>
                      <span className="text-sm font-medium" style={{ color: 'hsl(var(--foreground))' }}>Customer Rating</span>
                      <div className="flex items-center gap-2"><StarRating rating={r.avg_rating} size={16} /><span className="text-sm font-bold" style={{ color: 'hsl(var(--foreground))' }}>{r.avg_rating.toFixed(1)}</span></div>
                    </div>
                  )}
                  <div className="flex items-center justify-between p-3 rounded-xl border" style={{ borderColor: 'hsl(var(--border))' }}>
                    <span className="text-sm font-medium" style={{ color: 'hsl(var(--foreground))' }}>Verification</span>
                    <VerificationBadge status={statsDriver.verification_status} />
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-xl border" style={{ borderColor: 'hsl(var(--border))' }}>
                    <span className="text-sm font-medium" style={{ color: 'hsl(var(--foreground))' }}>Documents on file</span>
                    <span className="text-sm font-bold" style={{ color: 'hsl(var(--foreground))' }}>{(documents[statsDriver.id] ?? []).length}</span>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 gap-3">
                  <BarChart2 size={36} style={{ color: 'hsl(var(--muted-foreground))' }} />
                  <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>No performance data available yet</p>
                </div>
              )}
              <button onClick={() => setStatsDriver(null)} className="w-full py-2 text-sm rounded-lg border transition-colors hover:bg-secondary" style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}>Close</button>
            </div>
          </div>
        );
      })()}

      {/* Deactivate Confirm Modal */}
      {confirmDeactivate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="w-full max-w-sm rounded-2xl border shadow-2xl p-6" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${confirmDeactivate.is_active ? 'bg-red-100' : 'bg-green-100'}`}>
                {confirmDeactivate.is_active ? <UserX size={20} className="text-red-600" /> : <UserCheck size={20} className="text-green-600" />}
              </div>
              <div>
                <h3 className="font-semibold" style={{ color: 'hsl(var(--foreground))' }}>{confirmDeactivate.is_active ? 'Deactivate Driver' : 'Reactivate Driver'}</h3>
                <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>{confirmDeactivate.name}</p>
              </div>
            </div>
            <p className="text-sm mb-5" style={{ color: 'hsl(var(--muted-foreground))' }}>{confirmDeactivate.is_active ? 'This driver will be marked as inactive and will not appear in active assignments.' : 'This driver will be reactivated and can be assigned to deliveries again.'}</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDeactivate(null)} className="flex-1 py-2 text-sm rounded-lg border transition-colors hover:bg-secondary" style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}>Cancel</button>
              <button onClick={() => handleDeactivate(confirmDeactivate)} className={`flex-1 py-2 text-sm rounded-lg font-medium text-white transition-opacity hover:opacity-90 ${confirmDeactivate.is_active ? 'bg-red-500' : 'bg-green-500'}`}>
                {confirmDeactivate.is_active ? 'Deactivate' : 'Reactivate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Archive Confirm Modal */}
      {confirmArchive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="w-full max-w-sm rounded-2xl shadow-xl p-6 space-y-4" style={{ backgroundColor: 'hsl(var(--card))' }}>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${confirmArchive.is_archived ? 'bg-blue-100' : 'bg-amber-100'}`}>
                {confirmArchive.is_archived ? <ArchiveRestore size={20} className="text-blue-500" /> : <Archive size={20} className="text-amber-500" />}
              </div>
              <div>
                <h3 className="font-semibold text-sm" style={{ color: 'hsl(var(--foreground))' }}>{confirmArchive.is_archived ? 'Restore Driver' : 'Archive Driver'}</h3>
                <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>{confirmArchive.is_archived ? `${confirmArchive.name} will be restored to the active driver list.` : `${confirmArchive.name} will be archived and deactivated. This can be undone.`}</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmArchive(null)} className="flex-1 py-2 text-sm rounded-lg border transition-colors hover:bg-secondary" style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}>Cancel</button>
              <button onClick={() => handleArchive(confirmArchive)} className={`flex-1 py-2 text-sm rounded-lg font-medium text-white transition-opacity hover:opacity-90 ${confirmArchive.is_archived ? 'bg-blue-500' : 'bg-amber-500'}`}>
                {confirmArchive.is_archived ? 'Restore' : 'Archive'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="w-full max-w-sm rounded-2xl shadow-xl p-6 space-y-4" style={{ backgroundColor: 'hsl(var(--card))' }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center bg-red-100"><Trash2 size={20} className="text-red-500" /></div>
              <div>
                <h3 className="font-semibold text-sm" style={{ color: 'hsl(var(--foreground))' }}>Permanently Delete Driver</h3>
                <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>This will permanently delete <strong>{confirmDelete.name}</strong> and all associated data. This action cannot be undone.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 py-2 text-sm rounded-lg border transition-colors hover:bg-secondary" style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}>Cancel</button>
              <button onClick={() => handleDelete(confirmDelete)} disabled={deleting} className="flex-1 py-2 text-sm rounded-lg font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2 bg-red-500">
                {deleting && <Loader2 size={14} className="animate-spin" />}Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Schedule Inspection Modal */}
      {showScheduleForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="w-full max-w-lg rounded-2xl border shadow-2xl overflow-hidden" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'hsl(var(--border))' }}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'hsl(var(--primary) / 0.1)' }}>
                  <CalendarCheck size={16} style={{ color: 'hsl(var(--primary))' }} />
                </div>
                <h2 className="text-base font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
                  {editingSchedule ? 'Edit Inspection Schedule' : 'Schedule Inspection'}
                </h2>
              </div>
              <button onClick={() => setShowScheduleForm(false)} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
                <X size={18} style={{ color: 'hsl(var(--muted-foreground))' }} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-medium block mb-1.5" style={{ color: 'hsl(var(--muted-foreground))' }}>Driver <span className="text-red-500">*</span></label>
                <div className="relative">
                  <select
                    value={scheduleForm.driver_id}
                    onChange={(e) => setScheduleForm((f) => ({ ...f, driver_id: e.target.value }))}
                    className="w-full appearance-none px-3 py-2.5 text-sm rounded-lg border outline-none focus:ring-2 pr-8"
                    style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                  >
                    <option value="">Select a driver…</option>
                    {drivers.filter((d) => !d.is_archived && d.is_active).map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'hsl(var(--muted-foreground))' }} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium block mb-1.5" style={{ color: 'hsl(var(--muted-foreground))' }}>Inspection Type</label>
                  <div className="relative">
                    <select
                      value={scheduleForm.inspection_type}
                      onChange={(e) => setScheduleForm((f) => ({ ...f, inspection_type: e.target.value as InspectionType }))}
                      className="w-full appearance-none px-3 py-2.5 text-sm rounded-lg border outline-none focus:ring-2 pr-8"
                      style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                    >
                      {(Object.keys(INSPECTION_TYPE_LABELS) as InspectionType[]).map((t) => (
                        <option key={t} value={t}>{INSPECTION_TYPE_LABELS[t]}</option>
                      ))}
                    </select>
                    <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'hsl(var(--muted-foreground))' }} />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium block mb-1.5" style={{ color: 'hsl(var(--muted-foreground))' }}>Frequency (days)</label>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={scheduleForm.frequency_days}
                    onChange={(e) => setScheduleForm((f) => ({ ...f, frequency_days: parseInt(e.target.value) || 90 }))}
                    className="w-full px-3 py-2.5 text-sm rounded-lg border outline-none focus:ring-2"
                    style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium block mb-1.5" style={{ color: 'hsl(var(--muted-foreground))' }}>Next Due Date <span className="text-red-500">*</span></label>
                <div className="relative">
                  <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'hsl(var(--muted-foreground))' }} />
                  <input
                    type="date"
                    value={scheduleForm.next_due_at}
                    onChange={(e) => setScheduleForm((f) => ({ ...f, next_due_at: e.target.value }))}
                    className="w-full pl-9 pr-3 py-2.5 text-sm rounded-lg border outline-none focus:ring-2"
                    style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium block mb-1.5" style={{ color: 'hsl(var(--muted-foreground))' }}>Notes (optional)</label>
                <textarea
                  value={scheduleForm.notes}
                  onChange={(e) => setScheduleForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Any additional notes about this inspection…"
                  rows={2}
                  className="w-full px-3 py-2.5 text-sm rounded-lg border outline-none focus:ring-2 resize-none"
                  style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t" style={{ borderColor: 'hsl(var(--border))' }}>
              <button onClick={() => setShowScheduleForm(false)} className="px-4 py-2 rounded-lg border text-sm font-medium transition-colors hover:bg-secondary" style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}>Cancel</button>
              <button onClick={handleSaveSchedule} disabled={savingSchedule} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: 'hsl(var(--primary))' }}>
                {savingSchedule ? <Loader2 size={14} className="animate-spin" /> : <CalendarCheck size={14} />}
                {editingSchedule ? 'Save Changes' : 'Schedule'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Reschedule Modal */}
      {showBulkReschedule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="w-full max-w-sm rounded-2xl border shadow-2xl overflow-hidden" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'hsl(var(--border))' }}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'hsl(var(--primary) / 0.1)' }}>
                  <RotateCcw size={16} style={{ color: 'hsl(var(--primary))' }} />
                </div>
                <div>
                  <h2 className="text-base font-semibold" style={{ color: 'hsl(var(--foreground))' }}>Bulk Reschedule</h2>
                  <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>{selectedScheduleIds.size} inspection{selectedScheduleIds.size !== 1 ? 's' : ''} selected</p>
                </div>
              </div>
              <button onClick={() => setShowBulkReschedule(false)} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
                <X size={18} style={{ color: 'hsl(var(--muted-foreground))' }} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                Set a new due date for all {selectedScheduleIds.size} selected inspection{selectedScheduleIds.size !== 1 ? 's' : ''}.
              </p>
              <div>
                <label className="text-xs font-medium block mb-1.5" style={{ color: 'hsl(var(--muted-foreground))' }}>New Due Date <span className="text-red-500">*</span></label>
                <div className="relative">
                  <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'hsl(var(--muted-foreground))' }} />
                  <input
                    type="date"
                    value={bulkRescheduleDate}
                    onChange={(e) => setBulkRescheduleDate(e.target.value)}
                    min={new Date().toISOString().slice(0, 10)}
                    className="w-full pl-9 pr-3 py-2.5 text-sm rounded-lg border outline-none focus:ring-2"
                    style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                  />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t" style={{ borderColor: 'hsl(var(--border))' }}>
              <button onClick={() => setShowBulkReschedule(false)} className="px-4 py-2 rounded-lg border text-sm font-medium transition-colors hover:bg-secondary" style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}>Cancel</button>
              <button onClick={handleBulkReschedule} disabled={bulkRescheduling || !bulkRescheduleDate} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: 'hsl(var(--primary))' }}>
                {bulkRescheduling ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                Reschedule All
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Schedule Confirm Modal */}
      {confirmDeleteSchedule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="w-full max-w-sm rounded-2xl shadow-xl p-6 space-y-4" style={{ backgroundColor: 'hsl(var(--card))' }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center bg-red-100"><Trash2 size={20} className="text-red-500" /></div>
              <div>
                <h3 className="font-semibold text-sm" style={{ color: 'hsl(var(--foreground))' }}>Remove Inspection Schedule</h3>
                <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  Remove the {INSPECTION_TYPE_LABELS[confirmDeleteSchedule.inspection_type]} schedule? This cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDeleteSchedule(null)} className="flex-1 py-2 text-sm rounded-lg border transition-colors hover:bg-secondary" style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}>Cancel</button>
              <button onClick={() => handleDeleteSchedule(confirmDeleteSchedule)} disabled={deletingSchedule} className="flex-1 py-2 text-sm rounded-lg font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2 bg-red-500">
                {deletingSchedule && <Loader2 size={14} className="animate-spin" />}Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
