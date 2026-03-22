'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Truck, Plus, Search, Edit2, UserX, UserCheck, Star,
  Phone, Mail, X, Loader2, RefreshCw, ToggleLeft, ToggleRight,
  ChevronDown, AlertCircle, CheckCircle2, Download, FileText,
  FileSpreadsheet, Archive, ArchiveRestore, MapPin, TrendingUp,
  CheckSquare, Square, Users, Zap, Trash2, ShieldCheck, ShieldAlert,
  ShieldOff, Upload, FileImage, Calendar, Eye, BarChart2,
} from 'lucide-react';
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
  archived_at: string | null;
  zone: string | null;
  created_at: string;
  verification_status: VerificationStatus;
  access_code: string | null;
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
}

const EMPTY_FORM: DriverFormData = {
  name: '',
  phone: '',
  email: '',
  vehicle: '',
  plate: '',
  status: 'Available',
  zone: '',
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

// ─── Star Rating Component ────────────────────────────────────────────────────

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

// ─── Zone Badge ───────────────────────────────────────────────────────────────

function ZoneBadge({ zone, zones }: { zone: string | null; zones: DriverZone[] }) {
  if (!zone) return (
    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">
      No Zone
    </span>
  );
  const zoneData = zones.find((z) => z.name === zone);
  const color = zoneData?.color ?? '#9ca3af';
  return (
    <span
      className="text-xs px-2 py-0.5 rounded-full font-medium"
      style={{ backgroundColor: `${color}20`, color }}
    >
      {zone}
    </span>
  );
}

// ─── Performance Bar ──────────────────────────────────────────────────────────

function PerformanceBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="w-full h-1.5 rounded-full bg-gray-100 overflow-hidden">
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${Math.min(100, value)}%`, backgroundColor: color }}
      />
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

// ─── Export Helpers ───────────────────────────────────────────────────────────

function buildExportRows(drivers: Driver[], ratings: Record<string, DriverRating>) {
  return drivers.map((d) => {
    const r = ratings[d.id];
    const successRate =
      r && r.total_deliveries > 0
        ? Math.round((r.successful_deliveries / r.total_deliveries) * 100)
        : 0;
    return {
      Name: d.name,
      Phone: d.phone,
      Email: d.email ?? '',
      Vehicle: d.vehicle,
      Plate: d.plate,
      Status: d.status,
      Zone: d.zone ?? 'Unassigned',
      Active: d.is_active ? 'Yes' : 'No',
      Archived: d.is_archived ? 'Yes' : 'No',
      Verification: d.verification_status,
      'Avg Rating': r ? r.avg_rating.toFixed(2) : '—',
      'Total Deliveries': r ? r.total_deliveries : 0,
      'Successful Deliveries': r ? r.successful_deliveries : 0,
      'Success Rate (%)': r ? successRate : 0,
      'Member Since': new Date(d.created_at).toLocaleDateString(),
    };
  });
}

function exportCSV(rows: ReturnType<typeof buildExportRows>, filterLabel: string) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const csvContent = [
    headers.join(','),
    ...rows.map((row) =>
      headers
        .map((h) => {
          const val = String((row as Record<string, string | number>)[h] ?? '');
          return val.includes(',') || val.includes('"') ? `"${val.replace(/"/g, '""')}"` : val;
        })
        .join(',')
    ),
  ].join('\n');
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
  const tableRows = rows
    .map(
      (row) =>
        `<tr>${headers
          .map(
            (h) =>
              `<td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:11px;">${(row as Record<string, string | number>)[h] ?? ''}</td>`
          )
          .join('')}</tr>`
    )
    .join('');
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Driver Export</title>
<style>body{font-family:Arial,sans-serif;margin:24px;color:#111;}h1{font-size:20px;margin-bottom:4px;}
.meta{font-size:12px;color:#6b7280;margin-bottom:16px;}table{width:100%;border-collapse:collapse;}
th{background:#f3f4f6;padding:8px 10px;text-align:left;font-size:11px;border-bottom:2px solid #d1d5db;}
tr:nth-child(even) td{background:#f9fafb;}@media print{body{margin:0;}}</style></head>
<body><h1>Driver Management Report</h1>
<div class="meta">Filter: ${filterLabel} | ${rows.length} driver(s) | Generated: ${now}</div>
<table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
<tbody>${tableRows}</tbody></table>
<script>window.onload=()=>{window.print();}<\/script></body></html>`;
  const win = window.open('', '_blank');
  if (win) { win.document.write(html); win.document.close(); }
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DriverManagementContent() {
  const supabase = createClient();

  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [ratings, setRatings] = useState<Record<string, DriverRating>>({});
  const [zones, setZones] = useState<DriverZone[]>([]);
  const [documents, setDocuments] = useState<Record<string, DriverDocument[]>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [zoneFilter, setZoneFilter] = useState<string>('all');
  const [showArchived, setShowArchived] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null);
  const [form, setForm] = useState<DriverFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState<Driver | null>(null);
  const [confirmArchive, setConfirmArchive] = useState<Driver | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Driver | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  // ─── Document upload state ───────────────────────────────────────────────────
  const [docModalDriver, setDocModalDriver] = useState<Driver | null>(null);
  const [docType, setDocType] = useState<DocType>('license');
  const [docExpiry, setDocExpiry] = useState('');
  const [docNotes, setDocNotes] = useState('');
  const [docFile, setDocFile] = useState<File | null>(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Performance stats panel state ──────────────────────────────────────────
  const [statsDriver, setStatsDriver] = useState<Driver | null>(null);

  // ─── Bulk selection state ────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkZone, setBulkZone] = useState('');
  const [showBulkZoneDropdown, setShowBulkZoneDropdown] = useState(false);

  // ─── Fetch Zones ────────────────────────────────────────────────────────────

  const fetchZones = useCallback(async () => {
    const { data } = await supabase
      .from('driver_zones')
      .select('id, name, color')
      .order('name');
    if (data) setZones(data);
  }, [supabase]);

  // ─── Fetch Drivers ──────────────────────────────────────────────────────────

  const fetchDrivers = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('drivers')
      .select('id, name, phone, email, vehicle, plate, status, avatar, is_active, is_archived, archived_at, zone, created_at, verification_status, access_code')
      .order('name');
    if (error) {
      toast.error('Failed to load drivers: ' + error.message);
    } else {
      setDrivers((data ?? []).map((d) => ({
        ...d,
        verification_status: (d.verification_status ?? 'unverified') as VerificationStatus,
      })));
    }
    setLoading(false);
  }, [supabase]);

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
    fetchZones();
    fetchDrivers();
    fetchRatings();
    fetchDocuments();
  }, [fetchZones, fetchDrivers, fetchRatings, fetchDocuments]);

  // ─── Real-time subscription ─────────────────────────────────────────────────

  useEffect(() => {
    const driverChannel = supabase
      .channel('driver-management-rt')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'drivers' },
        (payload) => {
          const d = payload.new as Record<string, unknown>;
          toast.success(`New driver added: ${d.name}`, { duration: 5000 });
          fetchDrivers();
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'drivers' },
        (payload) => {
          const prev = payload.old as Record<string, unknown>;
          const next = payload.new as Record<string, unknown>;

          // Status change (Available / On Route / Off Duty)
          if (prev.status !== next.status) {
            toast.info(`${next.name}: status → ${next.status}`, { duration: 4000 });
          }
          // Active/inactive toggle
          else if (prev.is_active !== next.is_active) {
            toast.info(
              next.is_active
                ? `${next.name} reactivated`
                : `${next.name} deactivated`,
              { duration: 4000 }
            );
          }
          // Zone assignment
          else if (prev.zone !== next.zone) {
            toast.info(
              next.zone
                ? `${next.name}: zone set to ${next.zone}`
                : `${next.name}: zone cleared`,
              { duration: 4000 }
            );
          }

          fetchDrivers();
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'drivers' },
        (payload) => {
          const d = payload.old as Record<string, unknown>;
          toast.info(`Driver ${d.name ?? payload.old.id} removed`, { duration: 4000 });
          fetchDrivers();
        }
      )
      .subscribe();

    // Refresh ratings when new performance logs arrive
    const perfChannel = supabase
      .channel('driver-perf-logs-rt')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'driver_performance_logs' },
        () => {
          fetchRatings();
        }
      )
      .subscribe();

    const docsChannel = supabase
      .channel('driver-docs-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_documents' }, () => {
        fetchDocuments();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(driverChannel);
      supabase.removeChannel(perfChannel);
      supabase.removeChannel(docsChannel);
    };
  }, [supabase, fetchDrivers, fetchRatings, fetchDocuments]);

  // ─── Filtered list ──────────────────────────────────────────────────────────

  const filtered = drivers.filter((d) => {
    if (!showArchived && d.is_archived) return false;
    if (showArchived && !d.is_archived) return false;

    const matchSearch =
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      d.phone.includes(search) ||
      (d.email ?? '').toLowerCase().includes(search.toLowerCase()) ||
      d.plate.toLowerCase().includes(search.toLowerCase());

    const matchStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && d.is_active) ||
      (statusFilter === 'inactive' && !d.is_active);

    const matchZone =
      zoneFilter === 'all' ||
      (zoneFilter === 'none' && !d.zone) ||
      d.zone === zoneFilter;

    return matchSearch && matchStatus && matchZone;
  });

  // ─── Summary stats ──────────────────────────────────────────────────────────

  const activeDrivers = drivers.filter((d) => !d.is_archived);
  const totalActive = activeDrivers.filter((d) => d.is_active).length;
  const totalAvailable = activeDrivers.filter((d) => d.is_active && d.status === 'Available').length;
  const totalOnRoute = activeDrivers.filter((d) => d.is_active && d.status === 'On Route').length;
  const allRatings = Object.values(ratings).map((r) => r.avg_rating).filter((r) => r > 0);
  const fleetAvgRating = allRatings.length > 0 ? allRatings.reduce((a, b) => a + b, 0) / allRatings.length : 0;

  // ─── Bulk selection helpers ──────────────────────────────────────────────────

  const allFilteredIds = filtered.map((d) => d.id);
  const allSelected = allFilteredIds.length > 0 && allFilteredIds.every((id) => selectedIds.has(id));
  const someSelected = allFilteredIds.some((id) => selectedIds.has(id));

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allFilteredIds));
    }
  }

  function toggleSelectDriver(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
    setBulkZone('');
    setShowBulkZoneDropdown(false);
  }

  // ─── Bulk activate ───────────────────────────────────────────────────────────

  async function bulkActivate() {
    if (selectedIds.size === 0) return;
    setBulkLoading(true);
    const ids = Array.from(selectedIds);
    const { error } = await supabase
      .from('drivers')
      .update({ is_active: true })
      .in('id', ids);
    if (error) {
      toast.error('Bulk activate failed: ' + error.message);
    } else {
      toast.success(`${ids.length} driver${ids.length !== 1 ? 's' : ''} activated`);
      clearSelection();
      fetchDrivers();
    }
    setBulkLoading(false);
  }

  // ─── Bulk deactivate ─────────────────────────────────────────────────────────

  async function bulkDeactivate() {
    if (selectedIds.size === 0) return;
    setBulkLoading(true);
    const ids = Array.from(selectedIds);
    const { error } = await supabase
      .from('drivers')
      .update({ is_active: false })
      .in('id', ids);
    if (error) {
      toast.error('Bulk deactivate failed: ' + error.message);
    } else {
      toast.success(`${ids.length} driver${ids.length !== 1 ? 's' : ''} deactivated`);
      clearSelection();
      fetchDrivers();
    }
    setBulkLoading(false);
  }

  // ─── Bulk zone assign ────────────────────────────────────────────────────────

  async function bulkAssignZone(zone: string | null) {
    if (selectedIds.size === 0) return;
    setBulkLoading(true);
    const ids = Array.from(selectedIds);
    const { error } = await supabase
      .from('drivers')
      .update({ zone: zone || null })
      .in('id', ids);
    if (error) {
      toast.error('Bulk zone assign failed: ' + error.message);
    } else {
      toast.success(
        zone
          ? `Zone "${zone}" assigned to ${ids.length} driver${ids.length !== 1 ? 's' : ''}`
          : `Zone cleared for ${ids.length} driver${ids.length !== 1 ? 's' : ''}`
      );
      clearSelection();
      fetchDrivers();
    }
    setBulkLoading(false);
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
      name: driver.name,
      phone: driver.phone,
      email: driver.email ?? '',
      vehicle: driver.vehicle,
      plate: driver.plate,
      status: driver.status,
      zone: driver.zone ?? '',
    });
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingDriver(null);
    setForm(EMPTY_FORM);
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
      else { toast.success('Driver updated'); closeForm(); fetchDrivers(); }
    } else {
      const { error } = await supabase.from('drivers').insert({ ...payload, avatar: '', is_active: true, is_archived: false, verification_status: 'unverified' });
      if (error) { toast.error('Create failed: ' + error.message); }
      else { toast.success('Driver added'); closeForm(); fetchDrivers(); }
    }
    setSaving(false);
  }

  // ─── Delete driver ──────────────────────────────────────────────────────────

  async function handleDelete(driver: Driver) {
    setDeleting(true);
    const { error } = await supabase.from('drivers').delete().eq('id', driver.id);
    if (error) toast.error('Delete failed: ' + error.message);
    else {
      toast.success(`${driver.name} permanently deleted`);
      setConfirmDelete(null);
      fetchDrivers();
    }
    setDeleting(false);
  }

  // ─── Verification status update ─────────────────────────────────────────────

  async function updateVerification(driver: Driver, status: VerificationStatus) {
    const { error } = await supabase.from('drivers').update({ verification_status: status }).eq('id', driver.id);
    if (error) toast.error('Failed to update verification: ' + error.message);
    else {
      toast.success(`${driver.name} marked as ${VERIFICATION_CONFIG[status].label}`);
      fetchDrivers();
    }
  }

  // ─── Status toggle ──────────────────────────────────────────────────────────

  async function toggleStatus(driver: Driver) {
    const next: DriverStatus = driver.status === 'Available' ? 'Off Duty' : 'Available';
    const { error } = await supabase.from('drivers').update({ status: next }).eq('id', driver.id);
    if (error) toast.error('Failed to update status');
    else {
      toast.success(`${driver.name} is now ${next}`);
      fetchDrivers();
    }
  }

  // ─── Deactivation ───────────────────────────────────────────────────────────

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

  // ─── Archive ────────────────────────────────────────────────────────────────

  async function handleArchive(driver: Driver) {
    const nowArchiving = !driver.is_archived;
    const { error } = await supabase
      .from('drivers')
      .update({
        is_archived: nowArchiving,
        archived_at: nowArchiving ? new Date().toISOString() : null,
        is_active: nowArchiving ? false : driver.is_active,
      })
      .eq('id', driver.id);
    if (error) toast.error('Failed: ' + error.message);
    else {
      toast.success(nowArchiving ? `${driver.name} archived` : `${driver.name} restored`);
      setConfirmArchive(null);
      fetchDrivers();
    }
  }

  // ─── Zone assignment ────────────────────────────────────────────────────────

  async function assignZone(driverId: string, zone: string | null) {
    const { error } = await supabase
      .from('drivers')
      .update({ zone: zone || null })
      .eq('id', driverId);
    if (error) toast.error('Failed to assign zone');
    else {
      toast.success(zone ? `Zone set to ${zone}` : 'Zone cleared');
      fetchDrivers();
    }
  }

  // ─── Document upload ────────────────────────────────────────────────────────

  function openDocModal(driver: Driver) {
    setDocModalDriver(driver);
    setDocType('license');
    setDocExpiry('');
    setDocNotes('');
    setDocFile(null);
  }

  function closeDocModal() {
    setDocModalDriver(null);
    setDocFile(null);
    setDocExpiry('');
    setDocNotes('');
  }

  async function handleDocUpload() {
    if (!docModalDriver || !docFile) {
      toast.error('Please select a file');
      return;
    }
    setUploadingDoc(true);

    // Store as base64 data URL (no storage bucket required)
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      const { error } = await supabase.from('driver_documents').insert({
        driver_id: docModalDriver.id,
        doc_type: docType,
        file_name: docFile.name,
        file_url: dataUrl,
        expiry_date: docExpiry || null,
        notes: docNotes || null,
      });
      if (error) {
        toast.error('Upload failed: ' + error.message);
      } else {
        toast.success(`${DOC_TYPE_LABELS[docType]} uploaded for ${docModalDriver.name}`);
        closeDocModal();
        fetchDocuments();
      }
      setUploadingDoc(false);
    };
    reader.onerror = () => {
      toast.error('Failed to read file');
      setUploadingDoc(false);
    };
    reader.readAsDataURL(docFile);
  }

  async function deleteDocument(docId: string) {
    const { error } = await supabase.from('driver_documents').delete().eq('id', docId);
    if (error) toast.error('Failed to delete document: ' + error.message);
    else { toast.success('Document removed'); fetchDocuments(); }
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'hsl(var(--foreground))' }}>
            Driver Management
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Manage drivers, zones, availability, documents, and performance
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => { fetchDrivers(); fetchRatings(); fetchZones(); fetchDocuments(); }}
            className="p-2 rounded-lg border transition-colors hover:bg-secondary"
            style={{ borderColor: 'hsl(var(--border))' }}
            title="Refresh"
          >
            <RefreshCw size={16} style={{ color: 'hsl(var(--muted-foreground))' }} />
          </button>

          {/* Archive toggle */}
          <button
            onClick={() => { setShowArchived((v) => !v); clearSelection(); }}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${showArchived ? 'text-white' : ''}`}
            style={{
              backgroundColor: showArchived ? 'hsl(var(--primary))' : 'hsl(var(--background))',
              borderColor: showArchived ? 'hsl(var(--primary))' : 'hsl(var(--border))',
              color: showArchived ? 'white' : 'hsl(var(--foreground))',
            }}
          >
            <Archive size={15} />
            {showArchived ? 'Archived' : 'Active'}
          </button>

          {/* Export Dropdown */}
          <div className="relative">
            <button
              onClick={() => setExportOpen((o) => !o)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors hover:bg-secondary"
              style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
            >
              <Download size={15} />
              Export
              <span className="text-xs px-1.5 py-0.5 rounded-full font-semibold" style={{ backgroundColor: 'hsl(var(--primary))', color: 'white' }}>
                {filtered.length}
              </span>
              <ChevronDown size={13} />
            </button>

            {exportOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setExportOpen(false)} />
                <div className="absolute right-0 mt-1 w-48 rounded-xl border shadow-lg z-50 overflow-hidden" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
                  <div className="px-3 py-2 border-b" style={{ borderColor: 'hsl(var(--border))' }}>
                    <p className="text-xs font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>
                      Export {filtered.length} driver{filtered.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <button
                    onClick={() => { exportCSV(buildExportRows(filtered, ratings), statusFilter); setExportOpen(false); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-secondary transition-colors"
                    style={{ color: 'hsl(var(--foreground))' }}
                  >
                    <FileSpreadsheet size={15} className="text-green-600" />
                    Export as CSV
                  </button>
                  <button
                    onClick={() => { exportPDF(buildExportRows(filtered, ratings), statusFilter); setExportOpen(false); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-secondary transition-colors"
                    style={{ color: 'hsl(var(--foreground))' }}
                  >
                    <FileText size={15} className="text-red-500" />
                    Export as PDF
                  </button>
                </div>
              </>
            )}
          </div>

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

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Active', value: totalActive, icon: Truck, color: 'hsl(var(--primary))' },
          { label: 'Available', value: totalAvailable, icon: CheckCircle2, color: '#22c55e' },
          { label: 'On Route', value: totalOnRoute, icon: Truck, color: '#f97316' },
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

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'hsl(var(--muted-foreground))' }} />
          <input
            type="text"
            placeholder="Search by name, phone, email, plate…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border outline-none focus:ring-2"
            style={{
              backgroundColor: 'hsl(var(--background))',
              borderColor: 'hsl(var(--border))',
              color: 'hsl(var(--foreground))',
            }}
          />
        </div>

        {/* Status filter */}
        <div className="flex gap-2">
          {(['all', 'active', 'inactive'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`px-3 py-2 text-sm rounded-lg border font-medium transition-colors capitalize`}
              style={{
                backgroundColor: statusFilter === f ? 'hsl(var(--primary))' : 'hsl(var(--background))',
                borderColor: statusFilter === f ? 'hsl(var(--primary))' : 'hsl(var(--border))',
                color: statusFilter === f ? 'white' : 'hsl(var(--foreground))',
              }}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Zone filter */}
        <div className="relative">
          <MapPin size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'hsl(var(--muted-foreground))' }} />
          <select
            value={zoneFilter}
            onChange={(e) => setZoneFilter(e.target.value)}
            className="appearance-none pl-8 pr-8 py-2 text-sm rounded-lg border outline-none focus:ring-2"
            style={{
              backgroundColor: 'hsl(var(--background))',
              borderColor: 'hsl(var(--border))',
              color: 'hsl(var(--foreground))',
            }}
          >
            <option value="all">All Zones</option>
            <option value="none">No Zone</option>
            {zones.filter((z) => z.name !== 'Unassigned').map((z) => (
              <option key={z.id} value={z.name}>{z.name}</option>
            ))}
          </select>
          <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'hsl(var(--muted-foreground))' }} />
        </div>
      </div>

      {/* ─── Bulk Action Toolbar ─────────────────────────────────────────────── */}
      {!loading && filtered.length > 0 && (
        <div
          className="flex items-center gap-3 flex-wrap px-4 py-3 rounded-xl border"
          style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
        >
          {/* Select all checkbox */}
          <button
            onClick={toggleSelectAll}
            className="flex items-center gap-2 text-sm font-medium transition-colors hover:opacity-80"
            style={{ color: 'hsl(var(--foreground))' }}
          >
            {allSelected ? (
              <CheckSquare size={16} style={{ color: 'hsl(var(--primary))' }} />
            ) : someSelected ? (
              <CheckSquare size={16} style={{ color: 'hsl(var(--muted-foreground))' }} />
            ) : (
              <Square size={16} style={{ color: 'hsl(var(--muted-foreground))' }} />
            )}
            {allSelected ? 'Deselect All' : 'Select All'}
          </button>

          {selectedIds.size > 0 && (
            <>
              <div className="h-4 w-px" style={{ backgroundColor: 'hsl(var(--border))' }} />

              {/* Selection count */}
              <div className="flex items-center gap-1.5">
                <Users size={14} style={{ color: 'hsl(var(--primary))' }} />
                <span
                  className="text-sm font-semibold"
                  style={{ color: 'hsl(var(--primary))' }}
                >
                  {selectedIds.size} selected
                </span>
              </div>

              <div className="h-4 w-px" style={{ backgroundColor: 'hsl(var(--border))' }} />

              {/* Bulk Activate */}
              <button
                onClick={bulkActivate}
                disabled={bulkLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                style={{ backgroundColor: '#22c55e' }}
              >
                {bulkLoading ? <Loader2 size={12} className="animate-spin" /> : <UserCheck size={13} />}
                Activate
              </button>

              {/* Bulk Deactivate */}
              <button
                onClick={bulkDeactivate}
                disabled={bulkLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60 bg-red-500"
              >
                {bulkLoading ? <Loader2 size={12} className="animate-spin" /> : <UserX size={13} />}
                Deactivate
              </button>

              {/* Bulk Zone Assign */}
              <div className="relative">
                <button
                  onClick={() => setShowBulkZoneDropdown((v) => !v)}
                  disabled={bulkLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors hover:bg-secondary disabled:opacity-60"
                  style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                >
                  <Zap size={13} style={{ color: 'hsl(var(--primary))' }} />
                  Assign Zone
                  <ChevronDown size={11} />
                </button>

                {showBulkZoneDropdown && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowBulkZoneDropdown(false)} />
                    <div
                      className="absolute left-0 mt-1 w-44 rounded-xl border shadow-lg z-50 overflow-hidden"
                      style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
                    >
                      <div className="px-3 py-2 border-b" style={{ borderColor: 'hsl(var(--border))' }}>
                        <p className="text-xs font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>
                          Assign zone to {selectedIds.size} driver{selectedIds.size !== 1 ? 's' : ''}
                        </p>
                      </div>
                      <button
                        onClick={() => bulkAssignZone(null)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-secondary transition-colors"
                        style={{ color: 'hsl(var(--muted-foreground))' }}
                      >
                        <X size={12} />
                        Clear Zone
                      </button>
                      {zones.filter((z) => z.name !== 'Unassigned').map((z) => (
                        <button
                          key={z.id}
                          onClick={() => bulkAssignZone(z.name)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-secondary transition-colors"
                          style={{ color: 'hsl(var(--foreground))' }}
                        >
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: z.color }}
                          />
                          {z.name}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Clear selection */}
              <button
                onClick={clearSelection}
                className="flex items-center gap-1 text-xs transition-colors hover:opacity-80"
                style={{ color: 'hsl(var(--muted-foreground))' }}
              >
                <X size={12} />
                Clear
              </button>
            </>
          )}
        </div>
      )}

      {/* Driver List */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={28} className="animate-spin" style={{ color: 'hsl(var(--primary))' }} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Truck size={40} style={{ color: 'hsl(var(--muted-foreground))' }} />
          <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>No drivers found</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((driver) => {
            const r = ratings[driver.id];
            const successRate = r && r.total_deliveries > 0
              ? Math.round((r.successful_deliveries / r.total_deliveries) * 100)
              : null;
            const isSelected = selectedIds.has(driver.id);
            const driverDocs = documents[driver.id] ?? [];
            const hasLicense = driverDocs.some((d) => d.doc_type === 'license');
            const hasInsurance = driverDocs.some((d) => d.doc_type === 'insurance');

            return (
              <div
                key={driver.id}
                className={`rounded-xl border p-4 flex flex-col gap-3 transition-all ${!driver.is_active || driver.is_archived ? 'opacity-60' : ''} ${isSelected ? 'ring-2' : ''}`}
                style={{
                  backgroundColor: 'hsl(var(--card))',
                  borderColor: isSelected ? 'hsl(var(--primary))' : 'hsl(var(--border))',
                  ...(isSelected ? { '--tw-ring-color': 'hsl(var(--primary))' } as React.CSSProperties : {}),
                }}
              >
                {/* Top row */}
                <div className="flex items-start justify-between gap-2">
                  {/* Checkbox + Avatar + Name */}
                  <div className="flex items-center gap-2.5 min-w-0">
                    <button
                      onClick={() => toggleSelectDriver(driver.id)}
                      className="shrink-0 transition-colors hover:opacity-80"
                      title={isSelected ? 'Deselect' : 'Select'}
                    >
                      {isSelected ? (
                        <CheckSquare size={16} style={{ color: 'hsl(var(--primary))' }} />
                      ) : (
                        <Square size={16} style={{ color: 'hsl(var(--muted-foreground))' }} />
                      )}
                    </button>
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 text-white"
                      style={{ backgroundColor: 'hsl(var(--primary))' }}
                    >
                      {driver.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate" style={{ color: 'hsl(var(--foreground))' }}>
                        {driver.name}
                      </p>
                      <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOURS[driver.status]}`}>
                          {driver.status}
                        </span>
                        {!driver.is_active && !driver.is_archived && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-medium">
                            Inactive
                          </span>
                        )}
                        {driver.is_archived && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">
                            Archived
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {/* Zone badge */}
                  <ZoneBadge zone={driver.zone} zones={zones} />
                </div>

                {/* Contact & Vehicle */}
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    <Phone size={12} />
                    <span>{driver.phone}</span>
                  </div>
                  {driver.email && (
                    <div className="flex items-center gap-2 text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                      <Mail size={12} />
                      <span className="truncate">{driver.email}</span>
                    </div>
                  )}
                  {driver.vehicle && (
                    <div className="flex items-center gap-2 text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                      <Truck size={12} />
                      <span>{driver.vehicle} · {driver.plate}</span>
                    </div>
                  )}
                  {driver.access_code && (
                    <div className="flex items-center gap-2 text-xs mt-1">
                      <div
                        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg w-full"
                        style={{ backgroundColor: 'hsl(var(--primary) / 0.08)', border: '1px solid hsl(var(--primary) / 0.2)' }}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'hsl(var(--primary))', flexShrink: 0 }}><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                        <span className="font-medium" style={{ color: 'hsl(var(--primary))' }}>Access Code:</span>
                        <span className="font-mono font-bold tracking-widest" style={{ color: 'hsl(var(--foreground))' }}>{driver.access_code}</span>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(driver.access_code!);
                            toast.success('Access code copied!', { duration: 2000 });
                          }}
                          className="ml-auto p-0.5 rounded transition-opacity hover:opacity-70"
                          title="Copy access code"
                          style={{ color: 'hsl(var(--primary))' }}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Documents Summary */}
                <div
                  className="rounded-lg p-2.5 space-y-1.5"
                  style={{ backgroundColor: 'hsl(var(--secondary))' }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium" style={{ color: 'hsl(var(--foreground))' }}>Documents</span>
                    <button
                      onClick={() => openDocModal(driver)}
                      className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-md transition-colors hover:opacity-80 text-white"
                      style={{ backgroundColor: 'hsl(var(--primary))' }}
                    >
                      <Upload size={10} />
                      Upload
                    </button>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className={`flex items-center gap-1 text-xs ${hasLicense ? 'text-green-600' : 'text-gray-400'}`}>
                      <FileText size={11} />
                      <span>Licence</span>
                      {hasLicense && <CheckCircle2 size={10} className="text-green-500" />}
                    </div>
                    <div className={`flex items-center gap-1 text-xs ${hasInsurance ? 'text-green-600' : 'text-gray-400'}`}>
                      <FileImage size={11} />
                      <span>Insurance</span>
                      {hasInsurance && <CheckCircle2 size={10} className="text-green-500" />}
                    </div>
                    {driverDocs.length > 0 && (
                      <span className="text-xs ml-auto" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        {driverDocs.length} file{driverDocs.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>

                {/* Performance Metrics */}
                {r && r.total_deliveries > 0 ? (
                  <div
                    className="rounded-lg p-2.5 space-y-2"
                    style={{ backgroundColor: 'hsl(var(--secondary))' }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <TrendingUp size={12} style={{ color: 'hsl(var(--muted-foreground))' }} />
                        <span className="text-xs font-medium" style={{ color: 'hsl(var(--foreground))' }}>
                          Performance
                        </span>
                      </div>
                      <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        {r.total_deliveries} deliveries
                      </span>
                    </div>

                    {/* Success rate bar */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>Success rate</span>
                        <span className="text-xs font-semibold" style={{ color: successRate && successRate >= 80 ? '#22c55e' : successRate && successRate >= 60 ? '#f97316' : '#ef4444' }}>
                          {successRate}%
                        </span>
                      </div>
                      <PerformanceBar
                        value={successRate ?? 0}
                        color={successRate && successRate >= 80 ? '#22c55e' : successRate && successRate >= 60 ? '#f97316' : '#ef4444'}
                      />
                    </div>

                    {/* Rating */}
                    {r.avg_rating > 0 && (
                      <div className="flex items-center justify-between">
                        <StarRating rating={r.avg_rating} size={12} />
                        <span className="text-xs font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
                          {r.avg_rating.toFixed(1)} / 5
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div
                    className="rounded-lg p-2.5 flex items-center gap-2"
                    style={{ backgroundColor: 'hsl(var(--secondary))' }}
                  >
                    <TrendingUp size={12} style={{ color: 'hsl(var(--muted-foreground))' }} />
                    <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>No performance data yet</span>
                  </div>
                )}

                {/* Zone Assignment */}
                {!driver.is_archived && (
                  <div className="flex items-center gap-2">
                    <MapPin size={12} style={{ color: 'hsl(var(--muted-foreground))' }} />
                    <div className="relative flex-1">
                      <select
                        value={driver.zone ?? ''}
                        onChange={(e) => assignZone(driver.id, e.target.value || null)}
                        className="w-full appearance-none pl-2 pr-6 py-1 text-xs rounded-lg border outline-none"
                        style={{
                          backgroundColor: 'hsl(var(--background))',
                          borderColor: 'hsl(var(--border))',
                          color: 'hsl(var(--foreground))',
                        }}
                      >
                        <option value="">Assign zone…</option>
                        {zones.filter((z) => z.name !== 'Unassigned').map((z) => (
                          <option key={z.id} value={z.name}>{z.name}</option>
                        ))}
                      </select>
                      <ChevronDown size={11} className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'hsl(var(--muted-foreground))' }} />
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 pt-1 border" style={{ borderColor: 'hsl(var(--border))' }}>
                  {/* Availability toggle */}
                  {!driver.is_archived && (
                    <button
                      onClick={() => toggleStatus(driver)}
                      disabled={!driver.is_active}
                      className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                      title={driver.status === 'Available' ? 'Set Off Duty' : 'Set Available'}
                    >
                      {driver.status === 'Available'
                        ? <ToggleRight size={14} className="text-green-500" />
                        : <ToggleLeft size={14} style={{ color: 'hsl(var(--muted-foreground))' }} />
                      }
                      {driver.status === 'Available' ? 'Available' : 'Off Duty'}
                    </button>
                  )}

                  <div className="flex-1" />

                  {/* Edit */}
                  {!driver.is_archived && (
                    <button
                      onClick={() => openEdit(driver)}
                      className="p-1.5 rounded-lg border transition-colors hover:bg-secondary"
                      style={{ borderColor: 'hsl(var(--border))' }}
                      title="Edit driver"
                    >
                      <Edit2 size={14} style={{ color: 'hsl(var(--muted-foreground))' }} />
                    </button>
                  )}

                  {/* Deactivate / Reactivate */}
                  {!driver.is_archived && (
                    <button
                      onClick={() => setConfirmDeactivate(driver)}
                      className="p-1.5 rounded-lg border transition-colors hover:bg-secondary"
                      style={{ borderColor: 'hsl(var(--border))' }}
                      title={driver.is_active ? 'Deactivate driver' : 'Reactivate driver'}
                    >
                      {driver.is_active
                        ? <UserX size={14} className="text-red-500" />
                        : <UserCheck size={14} className="text-green-500" />
                      }
                    </button>
                  )}

                  {/* Archive / Restore */}
                  <button
                    onClick={() => setConfirmArchive(driver)}
                    className="p-1.5 rounded-lg border transition-colors hover:bg-secondary"
                    style={{ borderColor: 'hsl(var(--border))' }}
                    title={driver.is_archived ? 'Restore driver' : 'Archive driver'}
                  >
                    {driver.is_archived
                      ? <ArchiveRestore size={14} className="text-blue-500" />
                      : <Archive size={14} style={{ color: 'hsl(var(--muted-foreground))' }} />
                    }
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => setConfirmDelete(driver)}
                    className="p-1.5 rounded-lg border transition-colors hover:bg-red-50"
                    style={{ borderColor: 'hsl(var(--border))' }}
                    title="Permanently delete driver"
                  >
                    <Trash2 size={14} className="text-red-500" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── Add / Edit Form Modal ──────────────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div
            className="w-full max-w-md rounded-2xl shadow-xl p-6 space-y-5"
            style={{ backgroundColor: 'hsl(var(--card))' }}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
                {editingDriver ? 'Edit Driver' : 'Add New Driver'}
              </h2>
              <button onClick={closeForm} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
                <X size={18} style={{ color: 'hsl(var(--muted-foreground))' }} />
              </button>
            </div>

            <div className="space-y-3">
              {/* Name */}
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'hsl(var(--muted-foreground))' }}>Full Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="John Smith"
                  className="w-full px-3 py-2 text-sm rounded-lg border outline-none focus:ring-2"
                  style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                />
              </div>

              {/* Phone */}
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'hsl(var(--muted-foreground))' }}>Phone *</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+44 7700 900000"
                  className="w-full px-3 py-2 text-sm rounded-lg border outline-none focus:ring-2"
                  style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                />
              </div>

              {/* Email */}
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'hsl(var(--muted-foreground))' }}>Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="driver@example.com"
                  className="w-full px-3 py-2 text-sm rounded-lg border outline-none focus:ring-2"
                  style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                />
              </div>

              {/* Vehicle + Plate */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: 'hsl(var(--muted-foreground))' }}>Vehicle</label>
                  <input
                    type="text"
                    value={form.vehicle}
                    onChange={(e) => setForm({ ...form, vehicle: e.target.value })}
                    placeholder="Ford Transit"
                    className="w-full px-3 py-2 text-sm rounded-lg border outline-none focus:ring-2"
                    style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: 'hsl(var(--muted-foreground))' }}>Plate</label>
                  <input
                    type="text"
                    value={form.plate}
                    onChange={(e) => setForm({ ...form, plate: e.target.value })}
                    placeholder="AB12 CDE"
                    className="w-full px-3 py-2 text-sm rounded-lg border outline-none focus:ring-2"
                    style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                  />
                </div>
              </div>

              {/* Status + Zone */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: 'hsl(var(--muted-foreground))' }}>Status</label>
                  <div className="relative">
                    <select
                      value={form.status}
                      onChange={(e) => setForm({ ...form, status: e.target.value as DriverStatus })}
                      className="w-full appearance-none px-3 py-2 text-sm rounded-lg border outline-none focus:ring-2 pr-8"
                      style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                    <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'hsl(var(--muted-foreground))' }} />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: 'hsl(var(--muted-foreground))' }}>Zone</label>
                  <div className="relative">
                    <select
                      value={form.zone}
                      onChange={(e) => setForm({ ...form, zone: e.target.value })}
                      className="w-full appearance-none px-3 py-2 text-sm rounded-lg border outline-none focus:ring-2 pr-8"
                      style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                    >
                      <option value="">No Zone</option>
                      {zones.filter((z) => z.name !== 'Unassigned').map((z) => (
                        <option key={z.id} value={z.name}>{z.name}</option>
                      ))}
                    </select>
                    <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'hsl(var(--muted-foreground))' }} />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={closeForm}
                className="flex-1 py-2 text-sm rounded-lg border transition-colors hover:bg-secondary"
                style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2 text-sm rounded-lg font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2"
                style={{ backgroundColor: 'hsl(var(--primary))' }}
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                {editingDriver ? 'Save Changes' : 'Add Driver'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Document Upload Modal ──────────────────────────────────────────── */}
      {docModalDriver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="w-full max-w-lg rounded-2xl shadow-xl p-6 space-y-5 max-h-[90vh] overflow-y-auto" style={{ backgroundColor: 'hsl(var(--card))' }}>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
                  Documents — {docModalDriver.name}
                </h2>
                <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>Upload licence, insurance, or other documents</p>
              </div>
              <button onClick={closeDocModal} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
                <X size={18} style={{ color: 'hsl(var(--muted-foreground))' }} />
              </button>
            </div>

            {/* Existing documents */}
            {(documents[docModalDriver.id] ?? []).length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>Uploaded Documents</p>
                {(documents[docModalDriver.id] ?? []).map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center gap-3 p-2.5 rounded-lg border"
                    style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--secondary))' }}
                  >
                    <FileText size={16} style={{ color: 'hsl(var(--primary))' }} className="shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate" style={{ color: 'hsl(var(--foreground))' }}>{doc.file_name}</p>
                      <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        {DOC_TYPE_LABELS[doc.doc_type as DocType] ?? doc.doc_type}
                        {doc.expiry_date && ` · Expires ${new Date(doc.expiry_date).toLocaleDateString()}`}
                      </p>
                    </div>
                    <a
                      href={doc.file_url}
                      download={doc.file_name}
                      className="p-1.5 rounded-lg hover:bg-secondary transition-colors"
                      title="Download"
                    >
                      <Eye size={13} style={{ color: 'hsl(var(--muted-foreground))' }} />
                    </a>
                    <button
                      onClick={() => deleteDocument(doc.id)}
                      className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                      title="Delete document"
                    >
                      <Trash2 size={13} className="text-red-500" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Upload form */}
            <div className="space-y-3 pt-2 border-t" style={{ borderColor: 'hsl(var(--border))' }}>
              <p className="text-xs font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>Upload New Document</p>

              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'hsl(var(--muted-foreground))' }}>Document Type</label>
                <div className="relative">
                  <select
                    value={docType}
                    onChange={(e) => setDocType(e.target.value as DocType)}
                    className="w-full appearance-none px-3 py-2 text-sm rounded-lg border outline-none focus:ring-2 pr-8"
                    style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                  >
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
                  <input
                    type="date"
                    value={docExpiry}
                    onChange={(e) => setDocExpiry(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border outline-none focus:ring-2"
                    style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'hsl(var(--muted-foreground))' }}>Notes (optional)</label>
                <input
                  type="text"
                  value={docNotes}
                  onChange={(e) => setDocNotes(e.target.value)}
                  placeholder="e.g. Renewal pending"
                  className="w-full px-3 py-2 text-sm rounded-lg border outline-none focus:ring-2"
                  style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                />
              </div>

              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'hsl(var(--muted-foreground))' }}>File *</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  onChange={(e) => setDocFile(e.target.files?.[0] ?? null)}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 px-3 py-3 rounded-lg border-2 border-dashed text-sm transition-colors hover:bg-secondary"
                  style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}
                >
                  <Upload size={16} />
                  {docFile ? docFile.name : 'Click to select file (PDF, JPG, PNG)'}
                </button>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={closeDocModal}
                className="flex-1 py-2 text-sm rounded-lg border transition-colors hover:bg-secondary"
                style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
              >
                Close
              </button>
              <button
                onClick={handleDocUpload}
                disabled={uploadingDoc || !docFile}
                className="flex-1 py-2 text-sm rounded-lg font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2"
                style={{ backgroundColor: 'hsl(var(--primary))' }}
              >
                {uploadingDoc && <Loader2 size={14} className="animate-spin" />}
                Upload Document
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Performance Stats Panel ────────────────────────────────────────── */}
      {statsDriver && (() => {
        const r = ratings[statsDriver.id];
        const successRate = r && r.total_deliveries > 0
          ? Math.round((r.successful_deliveries / r.total_deliveries) * 100)
          : 0;
        const failedDeliveries = r ? r.total_deliveries - r.successful_deliveries : 0;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
            <div className="w-full max-w-md rounded-2xl shadow-xl p-6 space-y-5" style={{ backgroundColor: 'hsl(var(--card))' }}>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
                    Performance Stats
                  </h2>
                  <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>{statsDriver.name}</p>
                </div>
                <button onClick={() => setStatsDriver(null)} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
                  <X size={18} style={{ color: 'hsl(var(--muted-foreground))' }} />
                </button>
              </div>

              {r && r.total_deliveries > 0 ? (
                <div className="space-y-4">
                  {/* Summary grid */}
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'Total Deliveries', value: r.total_deliveries, color: 'hsl(var(--primary))' },
                      { label: 'Successful', value: r.successful_deliveries, color: '#22c55e' },
                      { label: 'Failed', value: failedDeliveries, color: '#ef4444' },
                      { label: 'Avg Rating', value: r.avg_rating > 0 ? `${r.avg_rating.toFixed(1)} / 5` : '—', color: '#eab308' },
                    ].map((stat) => (
                      <div
                        key={stat.label}
                        className="rounded-xl p-3 border"
                        style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--secondary))' }}
                      >
                        <p className="text-xl font-bold" style={{ color: stat.color }}>{stat.value}</p>
                        <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>{stat.label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Success rate bar */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium" style={{ color: 'hsl(var(--foreground))' }}>Success Rate</span>
                      <span className="text-sm font-bold" style={{ color: successRate >= 80 ? '#22c55e' : successRate >= 60 ? '#f97316' : '#ef4444' }}>
                        {successRate}%
                      </span>
                    </div>
                    <div className="w-full h-3 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${successRate}%`,
                          backgroundColor: successRate >= 80 ? '#22c55e' : successRate >= 60 ? '#f97316' : '#ef4444',
                        }}
                      />
                    </div>
                  </div>

                  {/* Star rating */}
                  {r.avg_rating > 0 && (
                    <div className="flex items-center justify-between p-3 rounded-xl border" style={{ borderColor: 'hsl(var(--border))' }}>
                      <span className="text-sm font-medium" style={{ color: 'hsl(var(--foreground))' }}>Customer Rating</span>
                      <div className="flex items-center gap-2">
                        <StarRating rating={r.avg_rating} size={16} />
                        <span className="text-sm font-bold" style={{ color: 'hsl(var(--foreground))' }}>{r.avg_rating.toFixed(1)}</span>
                      </div>
                    </div>
                  )}

                  {/* Verification status */}
                  <div className="flex items-center justify-between p-3 rounded-xl border" style={{ borderColor: 'hsl(var(--border))' }}>
                    <span className="text-sm font-medium" style={{ color: 'hsl(var(--foreground))' }}>Verification</span>
                    <VerificationBadge status={statsDriver.verification_status} />
                  </div>

                  {/* Documents */}
                  <div className="flex items-center justify-between p-3 rounded-xl border" style={{ borderColor: 'hsl(var(--border))' }}>
                    <span className="text-sm font-medium" style={{ color: 'hsl(var(--foreground))' }}>Documents on file</span>
                    <span className="text-sm font-bold" style={{ color: 'hsl(var(--foreground))' }}>
                      {(documents[statsDriver.id] ?? []).length}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 gap-3">
                  <BarChart2 size={36} style={{ color: 'hsl(var(--muted-foreground))' }} />
                  <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>No performance data available yet</p>
                </div>
              )}

              <button
                onClick={() => setStatsDriver(null)}
                className="w-full py-2 text-sm rounded-lg border transition-colors hover:bg-secondary"
                style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
              >
                Close
              </button>
            </div>
          </div>
        );
      })()}

      {/* ─── Deactivate Confirmation Modal ─────────────────────────────────── */}
      {confirmDeactivate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="w-full max-w-sm rounded-2xl shadow-xl p-6 space-y-4" style={{ backgroundColor: 'hsl(var(--card))' }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center bg-red-100">
                <AlertCircle size={20} className="text-red-500" />
              </div>
              <div>
                <h3 className="font-semibold text-sm" style={{ color: 'hsl(var(--foreground))' }}>
                  {confirmDeactivate.is_active ? 'Deactivate Driver' : 'Reactivate Driver'}
                </h3>
                <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  {confirmDeactivate.is_active
                    ? `${confirmDeactivate.name} will no longer be assignable to orders.`
                    : `${confirmDeactivate.name} will be available for order assignment again.`}
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDeactivate(null)}
                className="flex-1 py-2 text-sm rounded-lg border transition-colors hover:bg-secondary"
                style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeactivate(confirmDeactivate)}
                className={`flex-1 py-2 text-sm rounded-lg font-medium text-white transition-opacity hover:opacity-90 ${confirmDeactivate.is_active ? 'bg-red-500' : 'bg-green-500'}`}
              >
                {confirmDeactivate.is_active ? 'Deactivate' : 'Reactivate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Archive Confirmation Modal ─────────────────────────────────────── */}
      {confirmArchive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="w-full max-w-sm rounded-2xl shadow-xl p-6 space-y-4" style={{ backgroundColor: 'hsl(var(--card))' }}>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${confirmArchive.is_archived ? 'bg-blue-100' : 'bg-amber-100'}`}>
                {confirmArchive.is_archived
                  ? <ArchiveRestore size={20} className="text-blue-500" />
                  : <Archive size={20} className="text-amber-500" />
                }
              </div>
              <div>
                <h3 className="font-semibold text-sm" style={{ color: 'hsl(var(--foreground))' }}>
                  {confirmArchive.is_archived ? 'Restore Driver' : 'Archive Driver'}
                </h3>
                <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  {confirmArchive.is_archived
                    ? `${confirmArchive.name} will be restored to the active driver list.`
                    : `${confirmArchive.name} will be archived and deactivated. This can be undone.`}
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmArchive(null)}
                className="flex-1 py-2 text-sm rounded-lg border transition-colors hover:bg-secondary"
                style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleArchive(confirmArchive)}
                className={`flex-1 py-2 text-sm rounded-lg font-medium text-white transition-opacity hover:opacity-90 ${confirmArchive.is_archived ? 'bg-blue-500' : 'bg-amber-500'}`}
              >
                {confirmArchive.is_archived ? 'Restore' : 'Archive'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Delete Confirmation Modal ──────────────────────────────────────── */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="w-full max-w-sm rounded-2xl shadow-xl p-6 space-y-4" style={{ backgroundColor: 'hsl(var(--card))' }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center bg-red-100">
                <Trash2 size={20} className="text-red-500" />
              </div>
              <div>
                <h3 className="font-semibold text-sm" style={{ color: 'hsl(var(--foreground))' }}>
                  Permanently Delete Driver
                </h3>
                <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  This will permanently delete <strong>{confirmDelete.name}</strong> and all associated data. This action cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 py-2 text-sm rounded-lg border transition-colors hover:bg-secondary"
                style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(confirmDelete)}
                disabled={deleting}
                className="flex-1 py-2 text-sm rounded-lg font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2 bg-red-500"
              >
                {deleting && <Loader2 size={14} className="animate-spin" />}
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
