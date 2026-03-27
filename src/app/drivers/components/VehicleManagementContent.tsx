'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Car, Plus, Search, Edit2, Trash2, X, Loader2, Upload, FileText, Shield, AlertTriangle, Camera, Wrench, Fuel, Eye, ClipboardList, User, Hash, Palette, CalendarDays, FileCheck, Zap,  } from 'lucide-react';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Driver {
  id: string;
  name: string;
  plate: string;
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
  notes: string | null;
  mileage: number | null;
  fuel_type: string | null;
  vin: string | null;
  mot_expiry: string | null;
  service_due: string | null;
  created_at: string;
}

interface VehicleInsurance {
  id: string;
  vehicle_id: string;
  provider: string;
  policy_number: string;
  start_date: string;
  expiry_date: string;
  cover_type: string;
  notes: string | null;
  document_url: string | null;
  document_name: string | null;
}

interface VehicleTax {
  id: string;
  vehicle_id: string;
  tax_reference: string | null;
  start_date: string;
  expiry_date: string;
  amount: number | null;
  notes: string | null;
  document_url: string | null;
  document_name: string | null;
}

interface VehicleInspection {
  id: string;
  vehicle_id: string;
  driver_id: string | null;
  inspection_type: 'interim' | 'full';
  scheduled_date: string;
  completed_at: string | null;
  status: 'scheduled' | 'in_progress' | 'completed' | 'overdue';
  overall_result: string | null;
  driver_signature: string | null;
  notes: string | null;
  created_at: string;
}

interface InspectionItem {
  id: string;
  inspection_id: string;
  check_name: string;
  result: 'good' | 'needs_attention' | 'immediate' | null;
  notes: string | null;
  image_url: string | null;
  image_name: string | null;
  sort_order: number;
}

interface VehicleIncident {
  id: string;
  vehicle_id: string;
  driver_id: string | null;
  incident_date: string;
  incident_type: string;
  description: string;
  notes: string | null;
  severity: string;
  status: string;
  created_at: string;
}

interface IncidentImage {
  id: string;
  incident_id: string;
  file_url: string;
  file_name: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const INTERIM_CHECKS = [
  'Indicators Check',
  'Headlights Check',
  'Tyres Check',
  'Driver Seatbelt',
  'Fuel Check',
  'Mirrors Check',
  'Warning Lights',
];

const FULL_CHECKS = [
  ...INTERIM_CHECKS,
  'Oil Check',
  'Screen Wash Check',
  'Coolant Check',
  'Braking Check',
  'Fog Lights Check',
  'Full Seatbelt Check',
  'Wipers Check',
  'Horn Check',
  'Passenger Safety Equipment',
  'Hazard Warning Lights',
  'Bodywork Check',
];

const RESULT_CONFIG = {
  good: { label: 'Good', bg: 'bg-green-500', text: 'text-white', border: 'border-green-500', light: 'bg-green-50 text-green-700 border-green-200' },
  needs_attention: { label: 'Needs Attention', bg: 'bg-orange-500', text: 'text-white', border: 'border-orange-500', light: 'bg-orange-50 text-orange-700 border-orange-200' },
  immediate: { label: 'Immediate', bg: 'bg-red-500', text: 'text-white', border: 'border-red-500', light: 'bg-red-50 text-red-700 border-red-200' },
};

const VEHICLE_TYPES = ['Van', 'Large Van', 'Car', 'Minibus', 'Truck', 'Motorcycle', 'Other'];
const FUEL_TYPES = ['Diesel', 'Petrol', 'Electric', 'Hybrid', 'LPG'];
const COVER_TYPES = ['Comprehensive', 'Third Party', 'Third Party Fire & Theft'];
const INCIDENT_TYPES = ['Accident', 'Theft', 'Vandalism', 'Breakdown', 'Near Miss', 'Other'];
const SEVERITY_LEVELS = ['Minor', 'Moderate', 'Serious', 'Critical'];

// ─── Helper Components ────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'hsl(var(--muted-foreground))' }}>{title}</p>
      <div className="flex-1 h-px" style={{ backgroundColor: 'hsl(var(--border))' }} />
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    scheduled: 'bg-blue-100 text-blue-700',
    in_progress: 'bg-yellow-100 text-yellow-700',
    completed: 'bg-green-100 text-green-700',
    overdue: 'bg-red-100 text-red-700',
    open: 'bg-orange-100 text-orange-700',
    closed: 'bg-gray-100 text-gray-600',
    resolved: 'bg-green-100 text-green-700',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${map[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {status.replace('_', ' ')}
    </span>
  );
}

function ExpiryBadge({ date }: { date: string | null }) {
  if (!date) return <span className="text-xs text-gray-400">—</span>;
  const d = new Date(date);
  const now = new Date();
  const daysLeft = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (daysLeft < 0) return <span className="text-xs font-medium text-red-600">Expired</span>;
  if (daysLeft <= 30) return <span className="text-xs font-medium text-orange-600">{daysLeft}d left</span>;
  return <span className="text-xs text-gray-500">{d.toLocaleDateString('en-GB')}</span>;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function VehicleManagementContent() {
  const supabase = createClient();

  // ─── State ─────────────────────────────────────────────────────────────────
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [vehicleTab, setVehicleTab] = useState<'details' | 'insurance' | 'tax' | 'inspections' | 'incidents'>('details');

  // Vehicle form
  const [showVehicleForm, setShowVehicleForm] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [vehicleForm, setVehicleForm] = useState({
    registration: '', make: '', model: '', year: '', colour: '', type: 'Van',
    fuel_type: 'Diesel', vin: '', mileage: '', mot_expiry: '', service_due: '',
    assigned_driver_id: '', notes: '',
  });
  const [savingVehicle, setSavingVehicle] = useState(false);

  // Insurance
  const [insurance, setInsurance] = useState<VehicleInsurance[]>([]);
  const [showInsuranceForm, setShowInsuranceForm] = useState(false);
  const [insuranceForm, setInsuranceForm] = useState({
    provider: '', policy_number: '', start_date: '', expiry_date: '', cover_type: 'Comprehensive', notes: '',
  });
  const [insuranceFile, setInsuranceFile] = useState<File | null>(null);
  const [savingInsurance, setSavingInsurance] = useState(false);
  const insuranceFileRef = useRef<HTMLInputElement>(null);

  // Tax
  const [tax, setTax] = useState<VehicleTax[]>([]);
  const [showTaxForm, setShowTaxForm] = useState(false);
  const [taxForm, setTaxForm] = useState({
    tax_reference: '', start_date: '', expiry_date: '', amount: '', notes: '',
  });
  const [taxFile, setTaxFile] = useState<File | null>(null);
  const [savingTax, setSavingTax] = useState(false);
  const taxFileRef = useRef<HTMLInputElement>(null);

  // Inspections
  const [inspections, setInspections] = useState<VehicleInspection[]>([]);
  const [showInspectionForm, setShowInspectionForm] = useState(false);
  const [inspectionForm, setInspectionForm] = useState({
    inspection_type: 'interim\' as \'interim\' | \'full',
    scheduled_date: '',
    driver_id: '',
    notes: '',
  });
  const [savingInspection, setSavingInspection] = useState(false);
  const [conductingInspection, setConductingInspection] = useState<VehicleInspection | null>(null);
  const [checkItems, setCheckItems] = useState<Record<string, { result: 'good' | 'needs_attention' | 'immediate' | null; notes: string; imageFile: File | null; imagePreview: string | null }>>({});
  const [signatureData, setSignatureData] = useState('');
  const [submittingCheck, setSubmittingCheck] = useState(false);
  const [viewingInspection, setViewingInspection] = useState<{ inspection: VehicleInspection; items: InspectionItem[] } | null>(null);
  const checkImageRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Incidents
  const [incidents, setIncidents] = useState<VehicleIncident[]>([]);
  const [incidentImages, setIncidentImages] = useState<Record<string, IncidentImage[]>>({});
  const [showIncidentForm, setShowIncidentForm] = useState(false);
  const [incidentForm, setIncidentForm] = useState({
    incident_date: '', incident_type: 'Accident', description: '', notes: '', severity: 'Minor', driver_id: '',
  });
  const [incidentFiles, setIncidentFiles] = useState<File[]>([]);
  const [savingIncident, setSavingIncident] = useState(false);
  const incidentFileRef = useRef<HTMLInputElement>(null);

  // ─── Fetch ──────────────────────────────────────────────────────────────────

  const fetchVehicles = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('vehicles').select('*').order('make');
    if (error) toast.error('Failed to load vehicles');
    else setVehicles(data ?? []);
    setLoading(false);
  }, [supabase]);

  const fetchDrivers = useCallback(async () => {
    const { data } = await supabase.from('drivers').select('id, name, plate').eq('is_active', true).order('name');
    if (data) setDrivers(data);
  }, [supabase]);

  const fetchInsurance = useCallback(async (vehicleId: string) => {
    const { data } = await supabase.from('vehicle_insurance').select('*').eq('vehicle_id', vehicleId).order('expiry_date', { ascending: false });
    setInsurance(data ?? []);
  }, [supabase]);

  const fetchTax = useCallback(async (vehicleId: string) => {
    const { data } = await supabase.from('vehicle_tax').select('*').eq('vehicle_id', vehicleId).order('expiry_date', { ascending: false });
    setTax(data ?? []);
  }, [supabase]);

  const fetchInspections = useCallback(async (vehicleId: string) => {
    const { data } = await supabase.from('vehicle_inspections').select('*').eq('vehicle_id', vehicleId).order('scheduled_date', { ascending: false });
    setInspections(data ?? []);
  }, [supabase]);

  const fetchIncidents = useCallback(async (vehicleId: string) => {
    const { data } = await supabase.from('vehicle_incidents').select('*').eq('vehicle_id', vehicleId).order('incident_date', { ascending: false });
    if (data) {
      setIncidents(data);
      const ids = data.map((i) => i.id);
      if (ids.length > 0) {
        const { data: imgs } = await supabase.from('vehicle_incident_images').select('*').in('incident_id', ids);
        const map: Record<string, IncidentImage[]> = {};
        (imgs ?? []).forEach((img) => {
          if (!map[img.incident_id]) map[img.incident_id] = [];
          map[img.incident_id].push(img);
        });
        setIncidentImages(map);
      }
    }
  }, [supabase]);

  useEffect(() => {
    fetchVehicles();
    fetchDrivers();
  }, [fetchVehicles, fetchDrivers]);

  useEffect(() => {
    if (selectedVehicle) {
      fetchInsurance(selectedVehicle.id);
      fetchTax(selectedVehicle.id);
      fetchInspections(selectedVehicle.id);
      fetchIncidents(selectedVehicle.id);
    }
  }, [selectedVehicle, fetchInsurance, fetchTax, fetchInspections, fetchIncidents]);

  // ─── Vehicle CRUD ───────────────────────────────────────────────────────────

  function openAddVehicle() {
    setEditingVehicle(null);
    setVehicleForm({ registration: '', make: '', model: '', year: '', colour: '', type: 'Van', fuel_type: 'Diesel', vin: '', mileage: '', mot_expiry: '', service_due: '', assigned_driver_id: '', notes: '' });
    setShowVehicleForm(true);
  }

  function openEditVehicle(v: Vehicle) {
    setEditingVehicle(v);
    setVehicleForm({
      registration: v.registration, make: v.make, model: v.model,
      year: v.year?.toString() ?? '', colour: v.colour ?? '', type: v.type,
      fuel_type: v.fuel_type ?? 'Diesel', vin: v.vin ?? '', mileage: v.mileage?.toString() ?? '',
      mot_expiry: v.mot_expiry ?? '', service_due: v.service_due ?? '',
      assigned_driver_id: v.assigned_driver_id ?? '', notes: v.notes ?? '',
    });
    setShowVehicleForm(true);
  }

  async function saveVehicle() {
    if (!vehicleForm.registration.trim() || !vehicleForm.make.trim() || !vehicleForm.model.trim()) {
      toast.error('Registration, make and model are required');
      return;
    }
    setSavingVehicle(true);
    const payload = {
      registration: vehicleForm.registration.toUpperCase().trim(),
      make: vehicleForm.make.trim(),
      model: vehicleForm.model.trim(),
      year: vehicleForm.year ? parseInt(vehicleForm.year) : null,
      colour: vehicleForm.colour || null,
      type: vehicleForm.type,
      fuel_type: vehicleForm.fuel_type,
      vin: vehicleForm.vin || null,
      mileage: vehicleForm.mileage ? parseInt(vehicleForm.mileage) : null,
      mot_expiry: vehicleForm.mot_expiry || null,
      service_due: vehicleForm.service_due || null,
      assigned_driver_id: vehicleForm.assigned_driver_id || null,
      notes: vehicleForm.notes || null,
    };
    if (editingVehicle) {
      const { error } = await supabase.from('vehicles').update(payload).eq('id', editingVehicle.id);
      if (error) { toast.error('Failed to update vehicle'); setSavingVehicle(false); return; }
      toast.success('Vehicle updated');
    } else {
      const { error } = await supabase.from('vehicles').insert(payload);
      if (error) { toast.error('Failed to add vehicle: ' + error.message); setSavingVehicle(false); return; }
      toast.success('Vehicle added');
    }
    setSavingVehicle(false);
    setShowVehicleForm(false);
    fetchVehicles();
  }

  async function deleteVehicle(v: Vehicle) {
    if (!confirm(`Delete ${v.make} ${v.model} (${v.registration})?`)) return;
    const { error } = await supabase.from('vehicles').delete().eq('id', v.id);
    if (error) { toast.error('Failed to delete vehicle'); return; }
    toast.success('Vehicle deleted');
    if (selectedVehicle?.id === v.id) setSelectedVehicle(null);
    fetchVehicles();
  }

  // ─── Upload helper ──────────────────────────────────────────────────────────

  async function uploadFile(file: File, bucket: string, path: string): Promise<string | null> {
    const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true });
    if (error) { toast.error('File upload failed: ' + error.message); return null; }
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  }

  // ─── Insurance ──────────────────────────────────────────────────────────────

  async function saveInsurance() {
    if (!selectedVehicle) return;
    if (!insuranceForm.provider || !insuranceForm.policy_number || !insuranceForm.start_date || !insuranceForm.expiry_date) {
      toast.error('Please fill all required fields');
      return;
    }
    setSavingInsurance(true);
    let documentUrl: string | null = null;
    let documentName: string | null = null;
    if (insuranceFile) {
      const path = `vehicle-docs/${selectedVehicle.id}/insurance/${Date.now()}_${insuranceFile.name}`;
      documentUrl = await uploadFile(insuranceFile, 'driver-documents', path);
      documentName = insuranceFile.name;
    }
    const { error } = await supabase.from('vehicle_insurance').insert({
      vehicle_id: selectedVehicle.id,
      ...insuranceForm,
      document_url: documentUrl,
      document_name: documentName,
    });
    if (error) { toast.error('Failed to save insurance'); setSavingInsurance(false); return; }
    toast.success('Insurance record added');
    setSavingInsurance(false);
    setShowInsuranceForm(false);
    setInsuranceForm({ provider: '', policy_number: '', start_date: '', expiry_date: '', cover_type: 'Comprehensive', notes: '' });
    setInsuranceFile(null);
    fetchInsurance(selectedVehicle.id);
  }

  // ─── Tax ────────────────────────────────────────────────────────────────────

  async function saveTax() {
    if (!selectedVehicle) return;
    if (!taxForm.start_date || !taxForm.expiry_date) {
      toast.error('Start and expiry dates are required');
      return;
    }
    setSavingTax(true);
    let documentUrl: string | null = null;
    let documentName: string | null = null;
    if (taxFile) {
      const path = `vehicle-docs/${selectedVehicle.id}/tax/${Date.now()}_${taxFile.name}`;
      documentUrl = await uploadFile(taxFile, 'driver-documents', path);
      documentName = taxFile.name;
    }
    const { error } = await supabase.from('vehicle_tax').insert({
      vehicle_id: selectedVehicle.id,
      tax_reference: taxForm.tax_reference || null,
      start_date: taxForm.start_date,
      expiry_date: taxForm.expiry_date,
      amount: taxForm.amount ? parseFloat(taxForm.amount) : null,
      notes: taxForm.notes || null,
      document_url: documentUrl,
      document_name: documentName,
    });
    if (error) { toast.error('Failed to save tax record'); setSavingTax(false); return; }
    toast.success('Tax record added');
    setSavingTax(false);
    setShowTaxForm(false);
    setTaxForm({ tax_reference: '', start_date: '', expiry_date: '', amount: '', notes: '' });
    setTaxFile(null);
    fetchTax(selectedVehicle.id);
  }

  // ─── Inspections ────────────────────────────────────────────────────────────

  async function scheduleInspection() {
    if (!selectedVehicle) return;
    if (!inspectionForm.scheduled_date) { toast.error('Scheduled date is required'); return; }
    setSavingInspection(true);
    const { error } = await supabase.from('vehicle_inspections').insert({
      vehicle_id: selectedVehicle.id,
      driver_id: inspectionForm.driver_id || null,
      inspection_type: inspectionForm.inspection_type,
      scheduled_date: inspectionForm.scheduled_date,
      status: 'scheduled',
      notes: inspectionForm.notes || null,
    });
    if (error) { toast.error('Failed to schedule inspection'); setSavingInspection(false); return; }
    toast.success('Inspection scheduled');
    setSavingInspection(false);
    setShowInspectionForm(false);
    setInspectionForm({ inspection_type: 'interim', scheduled_date: '', driver_id: '', notes: '' });
    fetchInspections(selectedVehicle.id);
  }

  function startConductInspection(inspection: VehicleInspection) {
    const checks = inspection.inspection_type === 'full' ? FULL_CHECKS : INTERIM_CHECKS;
    const initial: Record<string, { result: 'good' | 'needs_attention' | 'immediate' | null; notes: string; imageFile: File | null; imagePreview: string | null }> = {};
    checks.forEach((c) => { initial[c] = { result: null, notes: '', imageFile: null, imagePreview: null }; });
    setCheckItems(initial);
    setSignatureData('');
    setConductingInspection(inspection);
  }

  function setCheckResult(checkName: string, result: 'good' | 'needs_attention' | 'immediate') {
    setCheckItems((prev) => ({ ...prev, [checkName]: { ...prev[checkName], result } }));
  }

  function setCheckNotes(checkName: string, notes: string) {
    setCheckItems((prev) => ({ ...prev, [checkName]: { ...prev[checkName], notes } }));
  }

  function handleCheckImage(checkName: string, file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      setCheckItems((prev) => ({ ...prev, [checkName]: { ...prev[checkName], imageFile: file, imagePreview: e.target?.result as string } }));
    };
    reader.readAsDataURL(file);
  }

  async function submitInspection() {
    if (!conductingInspection || !selectedVehicle) return;
    const checks = conductingInspection.inspection_type === 'full' ? FULL_CHECKS : INTERIM_CHECKS;
    const allAnswered = checks.every((c) => checkItems[c]?.result !== null);
    if (!allAnswered) { toast.error('Please complete all check items'); return; }
    if (!signatureData.trim()) { toast.error('Driver signature is required'); return; }
    setSubmittingCheck(true);

    // Determine overall result
    const hasImmediate = checks.some((c) => checkItems[c]?.result === 'immediate');
    const hasAttention = checks.some((c) => checkItems[c]?.result === 'needs_attention');
    const overallResult = hasImmediate ? 'immediate' : hasAttention ? 'needs_attention' : 'good';

    // Update inspection
    const { error: inspErr } = await supabase.from('vehicle_inspections').update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      overall_result: overallResult,
      driver_signature: signatureData,
    }).eq('id', conductingInspection.id);
    if (inspErr) { toast.error('Failed to submit inspection'); setSubmittingCheck(false); return; }

    // Insert items
    const items = await Promise.all(checks.map(async (checkName, idx) => {
      const item = checkItems[checkName];
      let imageUrl: string | null = null;
      let imageName: string | null = null;
      if (item.imageFile) {
        const path = `vehicle-docs/${selectedVehicle.id}/inspections/${conductingInspection.id}/${Date.now()}_${item.imageFile.name}`;
        imageUrl = await uploadFile(item.imageFile, 'driver-documents', path);
        imageName = item.imageFile.name;
      }
      return {
        inspection_id: conductingInspection.id,
        check_name: checkName,
        result: item.result,
        notes: item.notes || null,
        image_url: imageUrl,
        image_name: imageName,
        sort_order: idx,
      };
    }));

    const { error: itemsErr } = await supabase.from('vehicle_inspection_items').insert(items);
    if (itemsErr) { toast.error('Failed to save check items'); setSubmittingCheck(false); return; }

    toast.success('Inspection completed successfully');
    setSubmittingCheck(false);
    setConductingInspection(null);
    fetchInspections(selectedVehicle.id);
  }

  async function viewInspectionDetails(inspection: VehicleInspection) {
    const { data } = await supabase.from('vehicle_inspection_items').select('*').eq('inspection_id', inspection.id).order('sort_order');
    setViewingInspection({ inspection, items: data ?? [] });
  }

  // ─── Incidents ──────────────────────────────────────────────────────────────

  async function saveIncident() {
    if (!selectedVehicle) return;
    if (!incidentForm.incident_date || !incidentForm.description) {
      toast.error('Date and description are required');
      return;
    }
    setSavingIncident(true);
    const { data: incidentData, error } = await supabase.from('vehicle_incidents').insert({
      vehicle_id: selectedVehicle.id,
      driver_id: incidentForm.driver_id || null,
      incident_date: incidentForm.incident_date,
      incident_type: incidentForm.incident_type,
      description: incidentForm.description,
      notes: incidentForm.notes || null,
      severity: incidentForm.severity.toLowerCase(),
      status: 'open',
    }).select().single();
    if (error || !incidentData) { toast.error('Failed to save incident'); setSavingIncident(false); return; }

    // Upload images
    if (incidentFiles.length > 0) {
      const uploads = incidentFiles.map(async (file) => {
        const path = `vehicle-docs/${selectedVehicle.id}/incidents/${incidentData.id}/${Date.now()}_${file.name}`;
        const url = await uploadFile(file, 'driver-documents', path);
        if (url) return { incident_id: incidentData.id, file_url: url, file_name: file.name };
        return null;
      });
      const results = (await Promise.all(uploads)).filter(Boolean);
      if (results.length > 0) {
        await supabase.from('vehicle_incident_images').insert(results as { incident_id: string; file_url: string; file_name: string }[]);
      }
    }

    toast.success('Incident logged');
    setSavingIncident(false);
    setShowIncidentForm(false);
    setIncidentForm({ incident_date: '', incident_type: 'Accident', description: '', notes: '', severity: 'Minor', driver_id: '' });
    setIncidentFiles([]);
    fetchIncidents(selectedVehicle.id);
  }

  // ─── Filtered vehicles ──────────────────────────────────────────────────────

  const filtered = vehicles.filter((v) => {
    const q = search.toLowerCase();
    return v.registration.toLowerCase().includes(q) || v.make.toLowerCase().includes(q) || v.model.toLowerCase().includes(q);
  });

  const assignedDriver = selectedVehicle ? drivers.find((d) => d.id === selectedVehicle.assigned_driver_id) : null;

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold" style={{ color: 'hsl(var(--foreground))' }}>Vehicle Management</h2>
          <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>Manage fleet vehicles, inspections, insurance and incidents</p>
        </div>
        <button onClick={openAddVehicle} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90" style={{ backgroundColor: 'hsl(var(--primary))' }}>
          <Plus size={16} /> Add Vehicle
        </button>
      </div>

      {/* Main layout */}
      <div className="flex gap-5" style={{ minHeight: '600px' }}>
        {/* Vehicle List */}
        <div className="w-72 shrink-0 flex flex-col gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'hsl(var(--muted-foreground))' }} />
            <input
              type="text"
              placeholder="Search vehicles..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border outline-none focus:ring-2"
              style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
            />
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 size={24} className="animate-spin" style={{ color: 'hsl(var(--muted-foreground))' }} /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <Car size={32} className="mx-auto mb-2" style={{ color: 'hsl(var(--muted-foreground))' }} />
              <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>No vehicles found</p>
            </div>
          ) : (
            <div className="space-y-2 overflow-y-auto" style={{ maxHeight: '560px' }}>
              {filtered.map((v) => {
                const driver = drivers.find((d) => d.id === v.assigned_driver_id);
                const isSelected = selectedVehicle?.id === v.id;
                return (
                  <button
                    key={v.id}
                    onClick={() => { setSelectedVehicle(v); setVehicleTab('details'); }}
                    className="w-full text-left p-3 rounded-xl border transition-all"
                    style={{
                      backgroundColor: isSelected ? 'hsl(var(--primary) / 0.08)' : 'hsl(var(--card))',
                      borderColor: isSelected ? 'hsl(var(--primary))' : 'hsl(var(--border))',
                    }}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: 'hsl(var(--secondary))' }}>
                        <Car size={14} style={{ color: 'hsl(var(--muted-foreground))' }} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: 'hsl(var(--foreground))' }}>{v.make} {v.model}</p>
                        <p className="text-xs font-mono" style={{ color: 'hsl(var(--muted-foreground))' }}>{v.registration}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>{v.type} {v.year ? `· ${v.year}` : ''}</span>
                      {driver ? (
                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 truncate max-w-[90px]">{driver.name}</span>
                      ) : (
                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">Unassigned</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Vehicle Detail Panel */}
        {selectedVehicle ? (
          <div className="flex-1 rounded-2xl border overflow-hidden flex flex-col" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
            {/* Panel header */}
            <div className="p-5 border-b flex items-start justify-between gap-3" style={{ borderColor: 'hsl(var(--border))' }}>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'hsl(var(--secondary))' }}>
                  <Car size={22} style={{ color: 'hsl(var(--muted-foreground))' }} />
                </div>
                <div>
                  <h3 className="font-bold text-lg" style={{ color: 'hsl(var(--foreground))' }}>{selectedVehicle.make} {selectedVehicle.model}</h3>
                  <p className="text-sm font-mono font-semibold" style={{ color: 'hsl(var(--muted-foreground))' }}>{selectedVehicle.registration}</p>
                  {assignedDriver && <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>Assigned to: <span className="font-medium">{assignedDriver.name}</span></p>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => openEditVehicle(selectedVehicle)} className="p-2 rounded-lg border transition-colors hover:bg-secondary" style={{ borderColor: 'hsl(var(--border))' }}>
                  <Edit2 size={14} style={{ color: 'hsl(var(--muted-foreground))' }} />
                </button>
                <button onClick={() => deleteVehicle(selectedVehicle)} className="p-2 rounded-lg border transition-colors hover:bg-red-50" style={{ borderColor: 'hsl(var(--border))' }}>
                  <Trash2 size={14} className="text-red-500" />
                </button>
              </div>
            </div>

            {/* Sub-tabs */}
            <div className="flex gap-1 p-2 border-b overflow-x-auto" style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--secondary))' }}>
              {([
                { key: 'details', label: 'Details', icon: Car },
                { key: 'insurance', label: 'Insurance', icon: Shield },
                { key: 'tax', label: 'Road Tax', icon: FileCheck },
                { key: 'inspections', label: 'Inspections', icon: ClipboardList },
                { key: 'incidents', label: 'Incidents', icon: AlertTriangle },
              ] as const).map((t) => (
                <button
                  key={t.key}
                  onClick={() => setVehicleTab(t.key)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all"
                  style={{
                    backgroundColor: vehicleTab === t.key ? 'hsl(var(--card))' : 'transparent',
                    color: vehicleTab === t.key ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))',
                    boxShadow: vehicleTab === t.key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  }}
                >
                  <t.icon size={12} />
                  {t.label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto p-5">

              {/* ── Details Tab ── */}
              {vehicleTab === 'details' && (
                <div className="space-y-5">
                  <SectionHeader title="Vehicle Information" />
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { label: 'Make', value: selectedVehicle.make, icon: Car },
                      { label: 'Model', value: selectedVehicle.model, icon: Car },
                      { label: 'Registration', value: selectedVehicle.registration, icon: Hash },
                      { label: 'Year', value: selectedVehicle.year?.toString() ?? '—', icon: CalendarDays },
                      { label: 'Colour', value: selectedVehicle.colour ?? '—', icon: Palette },
                      { label: 'Type', value: selectedVehicle.type, icon: Car },
                      { label: 'Fuel Type', value: selectedVehicle.fuel_type ?? '—', icon: Fuel },
                      { label: 'Mileage', value: selectedVehicle.mileage ? `${selectedVehicle.mileage.toLocaleString()} mi` : '—', icon: Zap },
                      { label: 'VIN', value: selectedVehicle.vin ?? '—', icon: Hash },
                      { label: 'MOT Expiry', value: selectedVehicle.mot_expiry ? new Date(selectedVehicle.mot_expiry).toLocaleDateString('en-GB') : '—', icon: CalendarDays },
                      { label: 'Service Due', value: selectedVehicle.service_due ? new Date(selectedVehicle.service_due).toLocaleDateString('en-GB') : '—', icon: Wrench },
                      { label: 'Assigned Driver', value: assignedDriver?.name ?? 'Unassigned', icon: User },
                    ].map((row) => (
                      <div key={row.label} className="flex items-start gap-2">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5" style={{ backgroundColor: 'hsl(var(--secondary))' }}>
                          <row.icon size={12} style={{ color: 'hsl(var(--muted-foreground))' }} />
                        </div>
                        <div>
                          <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>{row.label}</p>
                          <p className="text-sm font-medium" style={{ color: 'hsl(var(--foreground))' }}>{row.value}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  {selectedVehicle.notes && (
                    <div className="p-3 rounded-lg" style={{ backgroundColor: 'hsl(var(--secondary))' }}>
                      <p className="text-xs font-medium mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Notes</p>
                      <p className="text-sm" style={{ color: 'hsl(var(--foreground))' }}>{selectedVehicle.notes}</p>
                    </div>
                  )}
                </div>
              )}

              {/* ── Insurance Tab ── */}
              {vehicleTab === 'insurance' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <SectionHeader title="Insurance Records" />
                    <button onClick={() => setShowInsuranceForm(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white" style={{ backgroundColor: 'hsl(var(--primary))' }}>
                      <Plus size={12} /> Add
                    </button>
                  </div>
                  {showInsuranceForm && (
                    <div className="p-4 rounded-xl border space-y-3" style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--background))' }}>
                      <h4 className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>New Insurance Record</h4>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-medium block mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Provider *</label>
                          <input value={insuranceForm.provider} onChange={(e) => setInsuranceForm((p) => ({ ...p, provider: e.target.value }))} className="w-full px-3 py-2 text-sm rounded-lg border outline-none" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }} placeholder="e.g. Aviva" />
                        </div>
                        <div>
                          <label className="text-xs font-medium block mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Policy Number *</label>
                          <input value={insuranceForm.policy_number} onChange={(e) => setInsuranceForm((p) => ({ ...p, policy_number: e.target.value }))} className="w-full px-3 py-2 text-sm rounded-lg border outline-none" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }} placeholder="POL-12345" />
                        </div>
                        <div>
                          <label className="text-xs font-medium block mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Start Date *</label>
                          <input type="date" value={insuranceForm.start_date} onChange={(e) => setInsuranceForm((p) => ({ ...p, start_date: e.target.value }))} className="w-full px-3 py-2 text-sm rounded-lg border outline-none" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }} />
                        </div>
                        <div>
                          <label className="text-xs font-medium block mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Expiry Date *</label>
                          <input type="date" value={insuranceForm.expiry_date} onChange={(e) => setInsuranceForm((p) => ({ ...p, expiry_date: e.target.value }))} className="w-full px-3 py-2 text-sm rounded-lg border outline-none" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }} />
                        </div>
                        <div>
                          <label className="text-xs font-medium block mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Cover Type</label>
                          <select value={insuranceForm.cover_type} onChange={(e) => setInsuranceForm((p) => ({ ...p, cover_type: e.target.value }))} className="w-full px-3 py-2 text-sm rounded-lg border outline-none" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}>
                            {COVER_TYPES.map((c) => <option key={c}>{c}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs font-medium block mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Upload Document</label>
                          <input ref={insuranceFileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={(e) => setInsuranceFile(e.target.files?.[0] ?? null)} />
                          <button onClick={() => insuranceFileRef.current?.click()} className="w-full px-3 py-2 text-sm rounded-lg border flex items-center gap-2 transition-colors hover:bg-secondary" style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}>
                            <Upload size={12} /> {insuranceFile ? insuranceFile.name : 'Choose file'}
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-medium block mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Notes</label>
                        <textarea value={insuranceForm.notes} onChange={(e) => setInsuranceForm((p) => ({ ...p, notes: e.target.value }))} rows={2} className="w-full px-3 py-2 text-sm rounded-lg border outline-none resize-none" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }} />
                      </div>
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => setShowInsuranceForm(false)} className="px-3 py-1.5 text-sm rounded-lg border" style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}>Cancel</button>
                        <button onClick={saveInsurance} disabled={savingInsurance} className="px-3 py-1.5 text-sm rounded-lg text-white flex items-center gap-1.5 disabled:opacity-60" style={{ backgroundColor: 'hsl(var(--primary))' }}>
                          {savingInsurance && <Loader2 size={12} className="animate-spin" />} Save
                        </button>
                      </div>
                    </div>
                  )}
                  {insurance.length === 0 ? (
                    <p className="text-sm text-center py-8" style={{ color: 'hsl(var(--muted-foreground))' }}>No insurance records yet</p>
                  ) : (
                    <div className="space-y-3">
                      {insurance.map((ins) => (
                        <div key={ins.id} className="p-4 rounded-xl border" style={{ borderColor: 'hsl(var(--border))' }}>
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>{ins.provider}</p>
                              <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>Policy: {ins.policy_number} · {ins.cover_type}</p>
                            </div>
                            <ExpiryBadge date={ins.expiry_date} />
                          </div>
                          <div className="flex items-center gap-4 mt-2 text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                            <span>From: {new Date(ins.start_date).toLocaleDateString('en-GB')}</span>
                            <span>To: {new Date(ins.expiry_date).toLocaleDateString('en-GB')}</span>
                          </div>
                          {ins.document_url && (
                            <a href={ins.document_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 mt-2 text-xs text-blue-600 hover:underline">
                              <FileText size={11} /> {ins.document_name ?? 'View Document'}
                            </a>
                          )}
                          {ins.notes && <p className="text-xs mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>{ins.notes}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── Tax Tab ── */}
              {vehicleTab === 'tax' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <SectionHeader title="Road Tax Records" />
                    <button onClick={() => setShowTaxForm(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white" style={{ backgroundColor: 'hsl(var(--primary))' }}>
                      <Plus size={12} /> Add
                    </button>
                  </div>
                  {showTaxForm && (
                    <div className="p-4 rounded-xl border space-y-3" style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--background))' }}>
                      <h4 className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>New Tax Record</h4>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-medium block mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Tax Reference</label>
                          <input value={taxForm.tax_reference} onChange={(e) => setTaxForm((p) => ({ ...p, tax_reference: e.target.value }))} className="w-full px-3 py-2 text-sm rounded-lg border outline-none" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }} placeholder="Optional" />
                        </div>
                        <div>
                          <label className="text-xs font-medium block mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Amount (£)</label>
                          <input type="number" value={taxForm.amount} onChange={(e) => setTaxForm((p) => ({ ...p, amount: e.target.value }))} className="w-full px-3 py-2 text-sm rounded-lg border outline-none" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }} placeholder="0.00" />
                        </div>
                        <div>
                          <label className="text-xs font-medium block mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Start Date *</label>
                          <input type="date" value={taxForm.start_date} onChange={(e) => setTaxForm((p) => ({ ...p, start_date: e.target.value }))} className="w-full px-3 py-2 text-sm rounded-lg border outline-none" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }} />
                        </div>
                        <div>
                          <label className="text-xs font-medium block mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Expiry Date *</label>
                          <input type="date" value={taxForm.expiry_date} onChange={(e) => setTaxForm((p) => ({ ...p, expiry_date: e.target.value }))} className="w-full px-3 py-2 text-sm rounded-lg border outline-none" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }} />
                        </div>
                        <div className="col-span-2">
                          <label className="text-xs font-medium block mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Upload Document</label>
                          <input ref={taxFileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={(e) => setTaxFile(e.target.files?.[0] ?? null)} />
                          <button onClick={() => taxFileRef.current?.click()} className="w-full px-3 py-2 text-sm rounded-lg border flex items-center gap-2 transition-colors hover:bg-secondary" style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}>
                            <Upload size={12} /> {taxFile ? taxFile.name : 'Choose file'}
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-medium block mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Notes</label>
                        <textarea value={taxForm.notes} onChange={(e) => setTaxForm((p) => ({ ...p, notes: e.target.value }))} rows={2} className="w-full px-3 py-2 text-sm rounded-lg border outline-none resize-none" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }} />
                      </div>
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => setShowTaxForm(false)} className="px-3 py-1.5 text-sm rounded-lg border" style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}>Cancel</button>
                        <button onClick={saveTax} disabled={savingTax} className="px-3 py-1.5 text-sm rounded-lg text-white flex items-center gap-1.5 disabled:opacity-60" style={{ backgroundColor: 'hsl(var(--primary))' }}>
                          {savingTax && <Loader2 size={12} className="animate-spin" />} Save
                        </button>
                      </div>
                    </div>
                  )}
                  {tax.length === 0 ? (
                    <p className="text-sm text-center py-8" style={{ color: 'hsl(var(--muted-foreground))' }}>No tax records yet</p>
                  ) : (
                    <div className="space-y-3">
                      {tax.map((t) => (
                        <div key={t.id} className="p-4 rounded-xl border" style={{ borderColor: 'hsl(var(--border))' }}>
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>Road Tax {t.tax_reference ? `· ${t.tax_reference}` : ''}</p>
                              {t.amount && <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>£{t.amount.toFixed(2)}</p>}
                            </div>
                            <ExpiryBadge date={t.expiry_date} />
                          </div>
                          <div className="flex items-center gap-4 mt-2 text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                            <span>From: {new Date(t.start_date).toLocaleDateString('en-GB')}</span>
                            <span>To: {new Date(t.expiry_date).toLocaleDateString('en-GB')}</span>
                          </div>
                          {t.document_url && (
                            <a href={t.document_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 mt-2 text-xs text-blue-600 hover:underline">
                              <FileText size={11} /> {t.document_name ?? 'View Document'}
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── Inspections Tab ── */}
              {vehicleTab === 'inspections' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <SectionHeader title="Vehicle Inspections" />
                    <button onClick={() => setShowInspectionForm(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white" style={{ backgroundColor: 'hsl(var(--primary))' }}>
                      <Plus size={12} /> Schedule
                    </button>
                  </div>
                  {showInspectionForm && (
                    <div className="p-4 rounded-xl border space-y-3" style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--background))' }}>
                      <h4 className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>Schedule Inspection</h4>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-medium block mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Type</label>
                          <select value={inspectionForm.inspection_type} onChange={(e) => setInspectionForm((p) => ({ ...p, inspection_type: e.target.value as 'interim' | 'full' }))} className="w-full px-3 py-2 text-sm rounded-lg border outline-none" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}>
                            <option value="interim">Interim Check</option>
                            <option value="full">Full Check</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-xs font-medium block mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Scheduled Date *</label>
                          <input type="datetime-local" value={inspectionForm.scheduled_date} onChange={(e) => setInspectionForm((p) => ({ ...p, scheduled_date: e.target.value }))} className="w-full px-3 py-2 text-sm rounded-lg border outline-none" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }} />
                        </div>
                        <div className="col-span-2">
                          <label className="text-xs font-medium block mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Assign Driver</label>
                          <select value={inspectionForm.driver_id} onChange={(e) => setInspectionForm((p) => ({ ...p, driver_id: e.target.value }))} className="w-full px-3 py-2 text-sm rounded-lg border outline-none" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}>
                            <option value="">— No driver assigned —</option>
                            {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-medium block mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Notes</label>
                        <textarea value={inspectionForm.notes} onChange={(e) => setInspectionForm((p) => ({ ...p, notes: e.target.value }))} rows={2} className="w-full px-3 py-2 text-sm rounded-lg border outline-none resize-none" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }} />
                      </div>
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => setShowInspectionForm(false)} className="px-3 py-1.5 text-sm rounded-lg border" style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}>Cancel</button>
                        <button onClick={scheduleInspection} disabled={savingInspection} className="px-3 py-1.5 text-sm rounded-lg text-white flex items-center gap-1.5 disabled:opacity-60" style={{ backgroundColor: 'hsl(var(--primary))' }}>
                          {savingInspection && <Loader2 size={12} className="animate-spin" />} Schedule
                        </button>
                      </div>
                    </div>
                  )}
                  {inspections.length === 0 ? (
                    <p className="text-sm text-center py-8" style={{ color: 'hsl(var(--muted-foreground))' }}>No inspections scheduled</p>
                  ) : (
                    <div className="space-y-3">
                      {inspections.map((insp) => {
                        const driver = drivers.find((d) => d.id === insp.driver_id);
                        const resultCfg = insp.overall_result ? RESULT_CONFIG[insp.overall_result as keyof typeof RESULT_CONFIG] : null;
                        return (
                          <div key={insp.id} className="p-4 rounded-xl border" style={{ borderColor: 'hsl(var(--border))' }}>
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-semibold capitalize" style={{ color: 'hsl(var(--foreground))' }}>{insp.inspection_type} Check</span>
                                  <StatusPill status={insp.status} />
                                  {resultCfg && (
                                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${resultCfg.light}`}>{resultCfg.label}</span>
                                  )}
                                </div>
                                <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                  {new Date(insp.scheduled_date).toLocaleString('en-GB')}
                                  {driver ? ` · ${driver.name}` : ''}
                                </p>
                                {insp.completed_at && <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>Completed: {new Date(insp.completed_at).toLocaleString('en-GB')}</p>}
                              </div>
                              <div className="flex gap-1.5">
                                {insp.status === 'completed' && (
                                  <button onClick={() => viewInspectionDetails(insp)} className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs border transition-colors hover:bg-secondary" style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}>
                                    <Eye size={11} /> View
                                  </button>
                                )}
                                {(insp.status === 'scheduled' || insp.status === 'overdue') && (
                                  <button onClick={() => startConductInspection(insp)} className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-white" style={{ backgroundColor: 'hsl(var(--primary))' }}>
                                    <ClipboardList size={11} /> Start Check
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* ── Incidents Tab ── */}
              {vehicleTab === 'incidents' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <SectionHeader title="Vehicle Incidents" />
                    <button onClick={() => setShowIncidentForm(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white" style={{ backgroundColor: 'hsl(var(--primary))' }}>
                      <Plus size={12} /> Log Incident
                    </button>
                  </div>
                  {showIncidentForm && (
                    <div className="p-4 rounded-xl border space-y-3" style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--background))' }}>
                      <h4 className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>Log Incident</h4>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-medium block mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Date & Time *</label>
                          <input type="datetime-local" value={incidentForm.incident_date} onChange={(e) => setIncidentForm((p) => ({ ...p, incident_date: e.target.value }))} className="w-full px-3 py-2 text-sm rounded-lg border outline-none" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }} />
                        </div>
                        <div>
                          <label className="text-xs font-medium block mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Type</label>
                          <select value={incidentForm.incident_type} onChange={(e) => setIncidentForm((p) => ({ ...p, incident_type: e.target.value }))} className="w-full px-3 py-2 text-sm rounded-lg border outline-none" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}>
                            {INCIDENT_TYPES.map((t) => <option key={t}>{t}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs font-medium block mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Severity</label>
                          <select value={incidentForm.severity} onChange={(e) => setIncidentForm((p) => ({ ...p, severity: e.target.value }))} className="w-full px-3 py-2 text-sm rounded-lg border outline-none" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}>
                            {SEVERITY_LEVELS.map((s) => <option key={s}>{s}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs font-medium block mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Driver Involved</label>
                          <select value={incidentForm.driver_id} onChange={(e) => setIncidentForm((p) => ({ ...p, driver_id: e.target.value }))} className="w-full px-3 py-2 text-sm rounded-lg border outline-none" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}>
                            <option value="">— None —</option>
                            {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                          </select>
                        </div>
                        <div className="col-span-2">
                          <label className="text-xs font-medium block mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Description *</label>
                          <textarea value={incidentForm.description} onChange={(e) => setIncidentForm((p) => ({ ...p, description: e.target.value }))} rows={3} className="w-full px-3 py-2 text-sm rounded-lg border outline-none resize-none" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }} placeholder="Describe what happened..." />
                        </div>
                        <div className="col-span-2">
                          <label className="text-xs font-medium block mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Additional Notes</label>
                          <textarea value={incidentForm.notes} onChange={(e) => setIncidentForm((p) => ({ ...p, notes: e.target.value }))} rows={2} className="w-full px-3 py-2 text-sm rounded-lg border outline-none resize-none" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }} />
                        </div>
                        <div className="col-span-2">
                          <label className="text-xs font-medium block mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Images</label>
                          <input ref={incidentFileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => setIncidentFiles(Array.from(e.target.files ?? []))} />
                          <button onClick={() => incidentFileRef.current?.click()} className="w-full px-3 py-2 text-sm rounded-lg border flex items-center gap-2 transition-colors hover:bg-secondary" style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}>
                            <Camera size={12} /> {incidentFiles.length > 0 ? `${incidentFiles.length} image(s) selected` : 'Add images'}
                          </button>
                        </div>
                      </div>
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => setShowIncidentForm(false)} className="px-3 py-1.5 text-sm rounded-lg border" style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}>Cancel</button>
                        <button onClick={saveIncident} disabled={savingIncident} className="px-3 py-1.5 text-sm rounded-lg text-white flex items-center gap-1.5 disabled:opacity-60" style={{ backgroundColor: 'hsl(var(--primary))' }}>
                          {savingIncident && <Loader2 size={12} className="animate-spin" />} Log Incident
                        </button>
                      </div>
                    </div>
                  )}
                  {incidents.length === 0 ? (
                    <p className="text-sm text-center py-8" style={{ color: 'hsl(var(--muted-foreground))' }}>No incidents logged</p>
                  ) : (
                    <div className="space-y-3">
                      {incidents.map((inc) => {
                        const driver = drivers.find((d) => d.id === inc.driver_id);
                        const imgs = incidentImages[inc.id] ?? [];
                        const severityColor: Record<string, string> = { minor: 'bg-yellow-50 text-yellow-700', moderate: 'bg-orange-50 text-orange-700', serious: 'bg-red-50 text-red-700', critical: 'bg-red-100 text-red-800' };
                        return (
                          <div key={inc.id} className="p-4 rounded-xl border" style={{ borderColor: 'hsl(var(--border))' }}>
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>{inc.incident_type}</span>
                                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${severityColor[inc.severity] ?? 'bg-gray-100 text-gray-600'}`}>{inc.severity}</span>
                                  <StatusPill status={inc.status} />
                                </div>
                                <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                  {new Date(inc.incident_date).toLocaleString('en-GB')}
                                  {driver ? ` · ${driver.name}` : ''}
                                </p>
                              </div>
                            </div>
                            <p className="text-sm mt-2" style={{ color: 'hsl(var(--foreground))' }}>{inc.description}</p>
                            {inc.notes && <p className="text-xs mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>{inc.notes}</p>}
                            {imgs.length > 0 && (
                              <div className="flex gap-2 mt-3 flex-wrap">
                                {imgs.map((img) => (
                                  <a key={img.id} href={img.file_url} target="_blank" rel="noopener noreferrer">
                                    <img src={img.file_url} alt={img.file_name} className="w-16 h-16 object-cover rounded-lg border" style={{ borderColor: 'hsl(var(--border))' }} />
                                  </a>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 rounded-2xl border flex items-center justify-center" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
            <div className="text-center">
              <Car size={40} className="mx-auto mb-3" style={{ color: 'hsl(var(--muted-foreground))' }} />
              <p className="text-sm font-medium" style={{ color: 'hsl(var(--foreground))' }}>Select a vehicle</p>
              <p className="text-xs mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Choose a vehicle from the list to view details</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Vehicle Form Modal ── */}
      {showVehicleForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="w-full max-w-2xl rounded-2xl border shadow-2xl overflow-hidden" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
            <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: 'hsl(var(--border))' }}>
              <h3 className="font-semibold" style={{ color: 'hsl(var(--foreground))' }}>{editingVehicle ? 'Edit Vehicle' : 'Add Vehicle'}</h3>
              <button onClick={() => setShowVehicleForm(false)} className="p-1.5 rounded-lg hover:bg-secondary"><X size={16} style={{ color: 'hsl(var(--muted-foreground))' }} /></button>
            </div>
            <div className="p-5 overflow-y-auto" style={{ maxHeight: '70vh' }}>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: 'Registration *', key: 'registration', placeholder: 'AB21 XYZ' },
                  { label: 'Make *', key: 'make', placeholder: 'Ford' },
                  { label: 'Model *', key: 'model', placeholder: 'Transit' },
                  { label: 'Year', key: 'year', placeholder: '2021', type: 'number' },
                  { label: 'Colour', key: 'colour', placeholder: 'White' },
                  { label: 'VIN', key: 'vin', placeholder: 'Optional' },
                  { label: 'Mileage', key: 'mileage', placeholder: '0', type: 'number' },
                  { label: 'MOT Expiry', key: 'mot_expiry', type: 'date' },
                  { label: 'Service Due', key: 'service_due', type: 'date' },
                ].map((field) => (
                  <div key={field.key}>
                    <label className="text-xs font-medium block mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>{field.label}</label>
                    <input
                      type={field.type ?? 'text'}
                      placeholder={field.placeholder}
                      value={(vehicleForm as Record<string, string>)[field.key]}
                      onChange={(e) => setVehicleForm((p) => ({ ...p, [field.key]: e.target.value }))}
                      className="w-full px-3 py-2 text-sm rounded-lg border outline-none focus:ring-2"
                      style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                    />
                  </div>
                ))}
                <div>
                  <label className="text-xs font-medium block mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Vehicle Type</label>
                  <select value={vehicleForm.type} onChange={(e) => setVehicleForm((p) => ({ ...p, type: e.target.value }))} className="w-full px-3 py-2 text-sm rounded-lg border outline-none" style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}>
                    {VEHICLE_TYPES.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium block mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Fuel Type</label>
                  <select value={vehicleForm.fuel_type} onChange={(e) => setVehicleForm((p) => ({ ...p, fuel_type: e.target.value }))} className="w-full px-3 py-2 text-sm rounded-lg border outline-none" style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}>
                    {FUEL_TYPES.map((f) => <option key={f}>{f}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-medium block mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Assign Driver</label>
                  <select value={vehicleForm.assigned_driver_id} onChange={(e) => setVehicleForm((p) => ({ ...p, assigned_driver_id: e.target.value }))} className="w-full px-3 py-2 text-sm rounded-lg border outline-none" style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}>
                    <option value="">— Unassigned —</option>
                    {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-medium block mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Notes</label>
                  <textarea value={vehicleForm.notes} onChange={(e) => setVehicleForm((p) => ({ ...p, notes: e.target.value }))} rows={3} className="w-full px-3 py-2 text-sm rounded-lg border outline-none resize-none" style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }} />
                </div>
              </div>
            </div>
            <div className="flex gap-3 p-5 border-t justify-end" style={{ borderColor: 'hsl(var(--border))' }}>
              <button onClick={() => setShowVehicleForm(false)} className="px-4 py-2 rounded-lg border text-sm font-medium" style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}>Cancel</button>
              <button onClick={saveVehicle} disabled={savingVehicle} className="px-4 py-2 rounded-lg text-sm font-medium text-white flex items-center gap-2 disabled:opacity-60" style={{ backgroundColor: 'hsl(var(--primary))' }}>
                {savingVehicle && <Loader2 size={14} className="animate-spin" />}{editingVehicle ? 'Update' : 'Add Vehicle'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Conduct Inspection Modal ── */}
      {conductingInspection && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
          <div className="w-full max-w-2xl rounded-2xl border shadow-2xl overflow-hidden flex flex-col" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', maxHeight: '90vh' }}>
            <div className="flex items-center justify-between p-5 border-b shrink-0" style={{ borderColor: 'hsl(var(--border))' }}>
              <div>
                <h3 className="font-semibold capitalize" style={{ color: 'hsl(var(--foreground))' }}>{conductingInspection.inspection_type} Vehicle Check</h3>
                <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>{selectedVehicle?.make} {selectedVehicle?.model} · {selectedVehicle?.registration}</p>
              </div>
              <button onClick={() => setConductingInspection(null)} className="p-1.5 rounded-lg hover:bg-secondary"><X size={16} style={{ color: 'hsl(var(--muted-foreground))' }} /></button>
            </div>
            <div className="overflow-y-auto flex-1 p-5 space-y-4">
              {(conductingInspection.inspection_type === 'full' ? FULL_CHECKS : INTERIM_CHECKS).map((checkName) => {
                const item = checkItems[checkName] ?? { result: null, notes: '', imageFile: null, imagePreview: null };
                return (
                  <div key={checkName} className="p-4 rounded-xl border" style={{ borderColor: 'hsl(var(--border))' }}>
                    <p className="text-sm font-medium mb-3" style={{ color: 'hsl(var(--foreground))' }}>{checkName}</p>
                    {/* Result buttons */}
                    <div className="flex gap-2 mb-3">
                      {(['good', 'needs_attention', 'immediate'] as const).map((r) => {
                        const cfg = RESULT_CONFIG[r];
                        const isSelected = item.result === r;
                        return (
                          <button
                            key={r}
                            onClick={() => setCheckResult(checkName, r)}
                            className={`flex-1 py-2 rounded-lg text-xs font-semibold border-2 transition-all ${isSelected ? `${cfg.bg} ${cfg.text} ${cfg.border}` : `border-gray-200 text-gray-500 hover:border-gray-300`}`}
                          >
                            {cfg.label}
                          </button>
                        );
                      })}
                    </div>
                    {/* Notes */}
                    <textarea
                      placeholder="Add notes (optional)..."
                      value={item.notes}
                      onChange={(e) => setCheckNotes(checkName, e.target.value)}
                      rows={2}
                      className="w-full px-3 py-2 text-xs rounded-lg border outline-none resize-none mb-2"
                      style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                    />
                    {/* Image upload */}
                    <div className="flex items-center gap-2">
                      <input
                        ref={(el) => { checkImageRefs.current[checkName] = el; }}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCheckImage(checkName, f); }}
                      />
                      <button
                        onClick={() => checkImageRefs.current[checkName]?.click()}
                        className="flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs transition-colors hover:bg-secondary"
                        style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}
                      >
                        <Camera size={11} /> {item.imageFile ? 'Change image' : 'Add image'}
                      </button>
                      {item.imagePreview && (
                        <img src={item.imagePreview} alt="preview" className="w-10 h-10 object-cover rounded-lg border" style={{ borderColor: 'hsl(var(--border))' }} />
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Driver Signature */}
              <div className="p-4 rounded-xl border" style={{ borderColor: 'hsl(var(--border))' }}>
                <p className="text-sm font-medium mb-2" style={{ color: 'hsl(var(--foreground))' }}>Driver Signature</p>
                <p className="text-xs mb-3" style={{ color: 'hsl(var(--muted-foreground))' }}>By signing below, the driver confirms all checks have been completed accurately.</p>
                <input
                  type="text"
                  placeholder="Type full name as signature..."
                  value={signatureData}
                  onChange={(e) => setSignatureData(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border outline-none focus:ring-2 font-handwriting"
                  style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))', fontStyle: 'italic' }}
                />
              </div>
            </div>
            <div className="flex gap-3 p-5 border-t shrink-0 justify-end" style={{ borderColor: 'hsl(var(--border))' }}>
              <button onClick={() => setConductingInspection(null)} className="px-4 py-2 rounded-lg border text-sm font-medium" style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}>Cancel</button>
              <button onClick={submitInspection} disabled={submittingCheck} className="px-4 py-2 rounded-lg text-sm font-medium text-white flex items-center gap-2 disabled:opacity-60" style={{ backgroundColor: 'hsl(var(--primary))' }}>
                {submittingCheck && <Loader2 size={14} className="animate-spin" />} Submit Check
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── View Inspection Modal ── */}
      {viewingInspection && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
          <div className="w-full max-w-2xl rounded-2xl border shadow-2xl overflow-hidden flex flex-col" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', maxHeight: '90vh' }}>
            <div className="flex items-center justify-between p-5 border-b shrink-0" style={{ borderColor: 'hsl(var(--border))' }}>
              <div>
                <h3 className="font-semibold capitalize" style={{ color: 'hsl(var(--foreground))' }}>{viewingInspection.inspection.inspection_type} Check — Results</h3>
                <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  Completed: {viewingInspection.inspection.completed_at ? new Date(viewingInspection.inspection.completed_at).toLocaleString('en-GB') : '—'}
                </p>
              </div>
              <button onClick={() => setViewingInspection(null)} className="p-1.5 rounded-lg hover:bg-secondary"><X size={16} style={{ color: 'hsl(var(--muted-foreground))' }} /></button>
            </div>
            <div className="overflow-y-auto flex-1 p-5 space-y-3">
              {viewingInspection.items.map((item) => {
                const resultCfg = item.result ? RESULT_CONFIG[item.result] : null;
                return (
                  <div key={item.id} className="flex items-start gap-3 p-3 rounded-xl border" style={{ borderColor: 'hsl(var(--border))' }}>
                    <div className="flex-1">
                      <p className="text-sm font-medium" style={{ color: 'hsl(var(--foreground))' }}>{item.check_name}</p>
                      {item.notes && <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>{item.notes}</p>}
                      {item.image_url && (
                        <a href={item.image_url} target="_blank" rel="noopener noreferrer">
                          <img src={item.image_url} alt={item.image_name ?? 'check image'} className="w-16 h-16 object-cover rounded-lg border mt-2" style={{ borderColor: 'hsl(var(--border))' }} />
                        </a>
                      )}
                    </div>
                    {resultCfg && (
                      <span className={`text-xs px-2 py-1 rounded-lg font-semibold border shrink-0 ${resultCfg.light}`}>{resultCfg.label}</span>
                    )}
                  </div>
                );
              })}
              {viewingInspection.inspection.driver_signature && (
                <div className="p-4 rounded-xl border" style={{ borderColor: 'hsl(var(--border))' }}>
                  <p className="text-xs font-medium mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Driver Signature</p>
                  <p className="text-sm font-medium italic" style={{ color: 'hsl(var(--foreground))' }}>{viewingInspection.inspection.driver_signature}</p>
                </div>
              )}
              {viewingInspection.inspection.notes && (
                <div className="p-4 rounded-xl border" style={{ borderColor: 'hsl(var(--border))' }}>
                  <p className="text-xs font-medium mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Notes</p>
                  <p className="text-sm" style={{ color: 'hsl(var(--foreground))' }}>{viewingInspection.inspection.notes}</p>
                </div>
              )}
            </div>
            <div className="p-5 border-t shrink-0 flex justify-end" style={{ borderColor: 'hsl(var(--border))' }}>
              <button onClick={() => setViewingInspection(null)} className="px-4 py-2 rounded-lg border text-sm font-medium" style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
