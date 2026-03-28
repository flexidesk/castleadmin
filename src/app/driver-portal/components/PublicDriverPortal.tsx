'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { mapDbOrderToApp, AppOrder, AppDriver } from '@/lib/services/ordersService';
import { toast } from 'sonner';
import { Truck, Package, CheckCircle2, Clock, MapPin, Phone, RefreshCw, Loader2, ChevronDown, Navigation, AlertCircle, Calendar, User, ArrowRight, PoundSterling, TrendingUp, Star, LogOut, Wifi, WifiOff, Shield, Timer, ClipboardList, X, Mail, Lock, Eye, EyeOff, Settings, Save, History, Car, Wrench, Search, CheckSquare, XCircle, Info, Camera, Trash2 } from 'lucide-react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import AppLogo from '@/components/ui/AppLogo';
import dynamic from 'next/dynamic';

const DriverRouteMap = dynamic(() => import('./DriverRouteMap'), { ssr: false });

// ─── Types ────────────────────────────────────────────────────────────────────

type AvailabilityStatus = 'Available' | 'On Route' | 'Off Duty';

const AVAILABILITY_OPTIONS: AvailabilityStatus[] = ['Available', 'On Route', 'Off Duty'];

const AVAILABILITY_STYLES: Record<AvailabilityStatus, { bg: string; text: string; dot: string; border: string }> = {
  Available: {
    bg: 'hsl(142 69% 35% / 0.12)',
    text: 'hsl(142 69% 35%)',
    dot: 'hsl(142 69% 35%)',
    border: 'hsl(142 69% 35% / 0.3)',
  },
  'On Route': {
    bg: 'hsl(262 83% 58% / 0.12)',
    text: 'hsl(262 83% 58%)',
    dot: 'hsl(262 83% 58%)',
    border: 'hsl(262 83% 58% / 0.3)',
  },
  'Off Duty': {
    bg: 'hsl(var(--secondary))',
    text: 'hsl(var(--muted-foreground))',
    dot: 'hsl(var(--muted-foreground))',
    border: 'hsl(var(--border))',
  },
};

const STATUS_FLOW = [
  'Booking Accepted',
  'Booking Assigned',
  'Booking Out For Delivery',
  'Booking Complete',
];

const NEXT_STATUS_LABEL: Record<string, string> = {
  'Booking Accepted': 'Mark Assigned',
  'Booking Assigned': 'Start Delivery',
  'Booking Out For Delivery': 'Mark Complete',
};

const NEXT_STATUS_VALUE: Record<string, string> = {
  'Booking Accepted': 'Booking Assigned',
  'Booking Assigned': 'Booking Out For Delivery',
  'Booking Out For Delivery': 'Booking Complete',
};

const STATUS_ACCENT: Record<string, string> = {
  'Booking Accepted': 'hsl(38 92% 50%)',
  'Booking Assigned': 'hsl(217 91% 60%)',
  'Booking Out For Delivery': 'hsl(262 83% 58%)',
  'Booking Complete': 'hsl(142 69% 35%)',
  'Booking Cancelled': 'hsl(0 84% 60%)',
};

interface EarningsSummary {
  todayDeliveries: number;
  weekDeliveries: number;
  monthDeliveries: number;
  todayEarnings: number;
  weekEarnings: number;
  monthEarnings: number;
  avgRating: number;
  completionRate: number;
  bonusPerDelivery: number;
}

function getTodayStr(): string {
  return new Date().toISOString().split('T')[0];
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function isUrgent(order: AppOrder): boolean {
  if (order.status === 'Booking Complete' || order.status === 'Booking Cancelled') return false;
  const window = order.deliveryWindow ?? '';
  const now = new Date();
  const h = now.getHours();
  if (window.toLowerCase().includes('am') && h >= 10) return true;
  if (window.toLowerCase().includes('pm') && h >= 14) return true;
  return false;
}

// ─── Booking Detail Modal ─────────────────────────────────────────────────────

interface BookingDetailModalProps {
  order: AppOrder;
  onClose: () => void;
}

function BookingDetailModal({ order, onClose }: BookingDetailModalProps) {
  const mapAddress = order.deliveryAddress
    ? encodeURIComponent(`${order.deliveryAddress.line1}, ${order.deliveryAddress.city}, ${order.deliveryAddress.postcode}, UK`)
    : null;

  const googleMapsDirectionsUrl = order.deliveryAddress
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
        `${order.deliveryAddress.line1}, ${order.deliveryAddress.city}, ${order.deliveryAddress.postcode}`
      )}`
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div
        className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col"
        style={{ backgroundColor: 'hsl(var(--card))', maxHeight: '90vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0" style={{ borderColor: 'hsl(var(--border))' }}>
          <div>
            <h2 className="font-bold text-base" style={{ color: 'hsl(var(--foreground))' }}>{order.id}</h2>
            <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
              {new Date(order.bookingDate).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg transition-colors hover:bg-secondary">
            <X size={18} style={{ color: 'hsl(var(--foreground))' }} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto flex-1 p-4 space-y-4">
          {/* Status */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>Status:</span>
            <span
              className="text-xs font-semibold px-2 py-0.5 rounded-full font-medium"
              style={{
                backgroundColor: STATUS_ACCENT[order.status] ? `${STATUS_ACCENT[order.status]}20` : 'hsl(var(--secondary))',
                color: STATUS_ACCENT[order.status] ?? 'hsl(var(--foreground))',
              }}
            >
              {order.status}
            </span>
            {(order as any).bookingType && (
              <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: 'hsl(var(--secondary))', color: 'hsl(var(--muted-foreground))' }}>
                {(order as any).bookingType}
              </span>
            )}
          </div>

          {/* Customer */}
          <div className="rounded-xl border p-3 space-y-2" style={{ borderColor: 'hsl(var(--border))' }}>
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'hsl(var(--muted-foreground))' }}>Customer</p>
            <div className="flex items-center gap-2">
              <User size={14} style={{ color: 'hsl(var(--primary))' }} />
              <span className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>{order.customer.name}</span>
            </div>
            {order.customer.email && (
              <p className="text-xs pl-5" style={{ color: 'hsl(var(--muted-foreground))' }}>{order.customer.email}</p>
            )}
            {order.customer.phone && (
              <a href={`tel:${order.customer.phone}`} className="flex items-center gap-2 pl-1">
                <Phone size={13} style={{ color: 'hsl(var(--primary))' }} />
                <span className="text-sm font-medium" style={{ color: 'hsl(var(--primary))' }}>{order.customer.phone}</span>
              </a>
            )}
          </div>

          {/* Delivery Address + Navigate */}
          {order.deliveryAddress && (
            <div className="rounded-xl border p-3 space-y-2" style={{ borderColor: 'hsl(var(--border))' }}>
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'hsl(var(--muted-foreground))' }}>Delivery Address</p>
              <div className="flex items-start gap-2">
                <MapPin size={14} className="shrink-0 mt-0.5" style={{ color: 'hsl(var(--primary))' }} />
                <div>
                  <p className="text-sm font-medium" style={{ color: 'hsl(var(--foreground))' }}>{order.deliveryAddress.line1}</p>
                  {order.deliveryAddress.line2 && <p className="text-sm" style={{ color: 'hsl(var(--foreground))' }}>{order.deliveryAddress.line2}</p>}
                  <p className="text-sm" style={{ color: 'hsl(var(--foreground))' }}>{order.deliveryAddress.city}{order.deliveryAddress.county ? `, ${order.deliveryAddress.county}` : ''}</p>
                  <p className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>{order.deliveryAddress.postcode}</p>
                  {order.deliveryAddress.notes && (
                    <p className="text-xs mt-1 italic" style={{ color: 'hsl(var(--muted-foreground))' }}>{order.deliveryAddress.notes}</p>
                  )}
                </div>
              </div>
              {googleMapsDirectionsUrl && (
                <a
                  href={googleMapsDirectionsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg font-semibold text-sm transition-all"
                  style={{ backgroundColor: 'hsl(var(--primary))', color: 'white' }}
                >
                  <Navigation size={15} />
                  Navigate with Google Maps
                </a>
              )}
            </div>
          )}

          {/* Schedule */}
          <div className="rounded-xl border p-3 space-y-2" style={{ borderColor: 'hsl(var(--border))' }}>
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'hsl(var(--muted-foreground))' }}>Schedule</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>Booking Date</p>
                <div className="flex items-center gap-1 mt-0.5">
                  <Calendar size={12} style={{ color: 'hsl(var(--primary))' }} />
                  <p className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
                    {new Date(order.bookingDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </p>
                </div>
              </div>
              {order.deliveryWindow && (
                <div>
                  <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>Delivery Window</p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <Clock size={12} style={{ color: 'hsl(var(--primary))' }} />
                    <p className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>{order.deliveryWindow}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Items */}
          {order.products?.length > 0 && (
            <div className="rounded-xl border p-3 space-y-2" style={{ borderColor: 'hsl(var(--border))' }}>
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'hsl(var(--muted-foreground))' }}>Items ({order.products.length})</p>
              <div className="space-y-1.5">
                {order.products.map((p: any, i: number) => (
                  <div key={i} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Package size={12} className="shrink-0" style={{ color: 'hsl(var(--muted-foreground))' }} />
                      <span className="text-sm truncate" style={{ color: 'hsl(var(--foreground))' }}>{p.name}</span>
                    </div>
                    <span className="text-xs font-medium shrink-0 px-1.5 py-0.5 rounded" style={{ backgroundColor: 'hsl(var(--secondary))', color: 'hsl(var(--muted-foreground))' }}>
                      x{p.quantity}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          {order.notes && (
            <div className="rounded-xl border p-3" style={{ borderColor: 'hsl(var(--border))' }}>
              <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Notes</p>
              <p className="text-sm" style={{ color: 'hsl(var(--foreground))' }}>{order.notes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Safety Check Component ───────────────────────────────────────────────────

const INTERIM_CHECKS = [
  'Indicators Check', 'Headlights Check', 'Tyres Check',
  'Driver Seatbelt', 'Fuel Check', 'Mirrors Check', 'Warning Lights',
];

const FULL_CHECKS = [
  ...INTERIM_CHECKS,
  'Oil Check', 'Screen Wash Check', 'Coolant Check', 'Braking Check',
  'Fog Lights Check', 'Full Seatbelt Check', 'Wipers Check', 'Horn Check',
  'Passenger Safety Equipment', 'Hazard Warning Lights', 'Bodywork Check',
];

type CheckResult = 'good' | 'needs_attention' | 'immediate' | null;

interface SafetyCheckSectionProps {
  driverId: string;
}

function SafetyCheckSection({ driverId }: SafetyCheckSectionProps) {
  const supabase = createClient();
  const [vehicles, setVehicles] = useState<Array<{ id: string; registration: string; make: string; model: string }>>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('');
  const [inspectionType, setInspectionType] = useState<'interim' | 'full'>('interim');
  const [checkResults, setCheckResults] = useState<Record<string, CheckResult>>({});
  const [checkImages, setCheckImages] = useState<Record<string, { file: File; preview: string } | null>>({});
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [pastInspections, setPastInspections] = useState<any[]>([]);
  const [loadingInspections, setLoadingInspections] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const checks = inspectionType === 'interim' ? INTERIM_CHECKS : FULL_CHECKS;

  const loadInspections = useCallback(async () => {
    // Load ALL inspections (all drivers) so history is shared
    const { data: inspData } = await supabase
      .from('vehicle_inspections')
      .select('*, vehicles(registration, make, model), drivers(name)')
      .order('created_at', { ascending: false })
      .limit(50);
    if (inspData) setPastInspections(inspData);
    setLoadingInspections(false);
  }, [supabase]);

  useEffect(() => {
    const load = async () => {
      const { data: vehiclesData } = await supabase
        .from('vehicles')
        .select('id, registration, make, model')
        .eq('is_active', true)
        .order('registration');
      if (vehiclesData) setVehicles(vehiclesData);
      await loadInspections();
    };
    load();
  }, [driverId, loadInspections]);

  const handleResultChange = (check: string, result: CheckResult) => {
    setCheckResults((prev) => ({ ...prev, [check]: result }));
  };

  const handleImageSelect = (check: string, file: File) => {
    const preview = URL.createObjectURL(file);
    setCheckImages((prev) => ({ ...prev, [check]: { file, preview } }));
  };

  const handleImageRemove = (check: string) => {
    setCheckImages((prev) => {
      const existing = prev[check];
      if (existing) URL.revokeObjectURL(existing.preview);
      return { ...prev, [check]: null };
    });
    if (fileInputRefs.current[check]) {
      fileInputRefs.current[check]!.value = '';
    }
  };

  const uploadCheckImage = async (check: string, inspectionId: string): Promise<{ url: string; name: string } | null> => {
    const img = checkImages[check];
    if (!img) return null;
    const ext = img.file.name.split('.').pop() ?? 'jpg';
    const path = `${inspectionId}/${check.replace(/\s+/g, '_')}_${Date.now()}.${ext}`;
    const { data, error } = await supabase.storage
      .from('safety-check-images')
      .upload(path, img.file, { upsert: true });
    if (error) return null;
    const { data: urlData } = supabase.storage.from('safety-check-images').getPublicUrl(data.path);
    return { url: urlData.publicUrl, name: img.file.name };
  };

  const handleSubmit = async () => {
    if (!selectedVehicleId) {
      toast.error('Please select a vehicle');
      return;
    }
    const incomplete = checks.filter((c) => !checkResults[c]);
    if (incomplete.length > 0) {
      toast.error(`Please complete all checks (${incomplete.length} remaining)`);
      return;
    }

    setSubmitting(true);
    try {
      const hasImmediate = checks.some((c) => checkResults[c] === 'immediate');
      const hasAttention = checks.some((c) => checkResults[c] === 'needs_attention');
      const overallResult = hasImmediate ? 'fail' : hasAttention ? 'advisory' : 'pass';

      const { data: inspection, error: inspError } = await supabase
        .from('vehicle_inspections')
        .insert({
          vehicle_id: selectedVehicleId,
          driver_id: driverId,
          inspection_type: inspectionType,
          scheduled_date: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          status: 'completed',
          overall_result: overallResult,
          notes,
        })
        .select()
        .single();

      if (inspError) throw inspError;

      // Upload images and insert check items
      const items = await Promise.all(
        checks.map(async (check, idx) => {
          const imgResult = await uploadCheckImage(check, inspection.id);
          return {
            inspection_id: inspection.id,
            check_name: check,
            result: checkResults[check],
            notes: null,
            image_url: imgResult?.url ?? null,
            image_name: imgResult?.name ?? null,
            sort_order: idx,
          };
        })
      );

      await supabase.from('vehicle_inspection_items').insert(items);

      toast.success('Safety check submitted successfully!');
      setShowForm(false);
      setCheckResults({});
      setCheckImages({});
      setNotes('');
      setSelectedVehicleId('');

      await loadInspections();
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to submit safety check');
    } finally {
      setSubmitting(false);
    }
  };

  const resultConfig = {
    good: { label: 'Good', bg: 'hsl(142 69% 35%)', light: 'hsl(142 69% 35% / 0.1)', text: 'hsl(142 69% 35%)' },
    needs_attention: { label: 'Advisory', bg: 'hsl(38 92% 50%)', light: 'hsl(38 92% 50% / 0.1)', text: 'hsl(38 92% 50%)' },
    immediate: { label: 'Fail', bg: 'hsl(0 84% 60%)', light: 'hsl(0 84% 60% / 0.1)', text: 'hsl(0 84% 60%)' },
  };

  const overallResultLabel = (result: string | null) => {
    if (result === 'pass') return { label: 'Pass', color: 'hsl(142 69% 35%)', bg: 'hsl(142 69% 35% / 0.1)' };
    if (result === 'advisory') return { label: 'Advisory', color: 'hsl(38 92% 50%)', bg: 'hsl(38 92% 50% / 0.1)' };
    if (result === 'fail') return { label: 'Fail', color: 'hsl(0 84% 60%)', bg: 'hsl(0 84% 60% / 0.1)' };
    return { label: result ?? '—', color: 'hsl(var(--muted-foreground))', bg: 'hsl(var(--secondary))' };
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-base" style={{ color: 'hsl(var(--foreground))' }}>Vehicle Safety Checks</h3>
          <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>Complete pre-drive safety inspections</p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-all"
          style={{ backgroundColor: 'hsl(var(--primary))', color: 'white' }}
        >
          {showForm ? <X size={14} /> : <Wrench size={14} />}
          {showForm ? 'Cancel' : 'New Check'}
        </button>
      </div>

      {/* New Check Form */}
      {showForm && (
        <div className="rounded-xl border p-4 space-y-4" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
          {/* Vehicle Select */}
          <div>
            <label className="text-xs font-semibold block mb-1.5" style={{ color: 'hsl(var(--muted-foreground))' }}>Vehicle</label>
            <select
              value={selectedVehicleId}
              onChange={(e) => setSelectedVehicleId(e.target.value)}
              className="w-full text-sm px-3 py-2 rounded-lg border outline-none"
              style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
            >
              <option value="">Select vehicle...</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>{v.registration} — {v.make} {v.model}</option>
              ))}
            </select>
          </div>

          {/* Inspection Type */}
          <div>
            <label className="text-xs font-semibold block mb-1.5" style={{ color: 'hsl(var(--muted-foreground))' }}>Check Type</label>
            <div className="flex gap-2">
              {(['interim', 'full'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => { setInspectionType(t); setCheckResults({}); setCheckImages({}); }}
                  className="flex-1 py-2 rounded-lg text-sm font-medium transition-all capitalize"
                  style={{
                    backgroundColor: inspectionType === t ? 'hsl(var(--primary))' : 'hsl(var(--secondary))',
                    color: inspectionType === t ? 'white' : 'hsl(var(--muted-foreground))',
                  }}
                >
                  {t} ({t === 'interim' ? INTERIM_CHECKS.length : FULL_CHECKS.length} checks)
                </button>
              ))}
            </div>
          </div>

          {/* Check Items */}
          <div className="space-y-2">
            <p className="text-xs font-semibold" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Checks ({Object.keys(checkResults).length}/{checks.length} completed)
            </p>
            {checks.map((check) => {
              const result = checkResults[check];
              const img = checkImages[check];
              return (
                <div
                  key={check}
                  className="rounded-lg p-3 space-y-2"
                  style={{
                    backgroundColor: result ? resultConfig[result].light : 'hsl(var(--secondary))',
                    border: `1px solid ${result ? resultConfig[result].bg + '40' : 'transparent'}`,
                  }}
                >
                  <p className="text-sm font-medium" style={{ color: 'hsl(var(--foreground))' }}>{check}</p>
                  <div className="flex gap-2">
                    {(['good', 'needs_attention', 'immediate'] as const).map((r) => (
                      <button
                        key={r}
                        onClick={() => handleResultChange(check, r)}
                        className="flex-1 py-1.5 rounded-md text-xs font-semibold transition-all"
                        style={{
                          backgroundColor: result === r ? resultConfig[r].bg : 'hsl(var(--card))',
                          color: result === r ? 'white' : 'hsl(var(--muted-foreground))',
                          border: `1px solid ${result === r ? resultConfig[r].bg : 'hsl(var(--border))'}`,
                        }}
                      >
                        {resultConfig[r].label}
                      </button>
                    ))}
                  </div>
                  {/* Image upload for this check item */}
                  <div className="flex items-center gap-2">
                    {img ? (
                      <div className="flex items-center gap-2 flex-1">
                        <img
                          src={img.preview}
                          alt={`${check} photo`}
                          className="w-12 h-12 rounded-lg object-cover border"
                          style={{ borderColor: 'hsl(var(--border))' }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs truncate font-medium" style={{ color: 'hsl(var(--foreground))' }}>{img.file.name}</p>
                          <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>{(img.file.size / 1024).toFixed(0)} KB</p>
                        </div>
                        <button
                          onClick={() => handleImageRemove(check)}
                          className="p-1.5 rounded-lg transition-colors hover:bg-secondary shrink-0"
                          title="Remove image"
                        >
                          <Trash2 size={13} style={{ color: 'hsl(0 84% 60%)' }} />
                        </button>
                      </div>
                    ) : (
                      <label className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors hover:bg-secondary border"
                        style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}>
                        <Camera size={12} />
                        Add Photo
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="hidden"
                          ref={(el) => { fileInputRefs.current[check] = el; }}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleImageSelect(check, file);
                          }}
                        />
                      </label>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-semibold block mb-1.5" style={{ color: 'hsl(var(--muted-foreground))' }}>Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Any additional notes..."
              className="w-full text-sm px-3 py-2 rounded-lg border outline-none resize-none"
              style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
            />
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full py-3 rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-2"
            style={{ backgroundColor: 'hsl(var(--primary))', color: 'white', opacity: submitting ? 0.7 : 1 }}
          >
            {submitting ? <Loader2 size={15} className="animate-spin" /> : <CheckSquare size={15} />}
            {submitting ? 'Submitting...' : 'Submit Safety Check'}
          </button>
        </div>
      )}

      {/* Past Inspections — all drivers */}
      <div>
        <p className="text-xs font-semibold mb-2" style={{ color: 'hsl(var(--muted-foreground))' }}>All Safety Check History</p>
        {loadingInspections ? (
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <div key={i} className="rounded-xl border p-4 animate-pulse" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
                <div className="h-4 rounded w-1/2 mb-2" style={{ backgroundColor: 'hsl(var(--secondary))' }} />
                <div className="h-3 rounded w-1/3" style={{ backgroundColor: 'hsl(var(--secondary))' }} />
              </div>
            ))}
          </div>
        ) : pastInspections.length === 0 ? (
          <div className="rounded-xl border p-8 text-center" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
            <Shield size={32} className="mx-auto mb-2" style={{ color: 'hsl(var(--muted-foreground))' }} />
            <p className="text-sm font-medium" style={{ color: 'hsl(var(--foreground))' }}>No safety checks yet</p>
            <p className="text-xs mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Complete your first pre-drive check above.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {pastInspections.map((insp) => {
              const res = overallResultLabel(insp.overall_result);
              const driverName = (insp.drivers as any)?.name;
              return (
                <div key={insp.id} className="rounded-xl border p-3 flex items-center gap-3" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: res.bg }}>
                    {insp.overall_result === 'pass' ? (
                      <CheckCircle2 size={18} style={{ color: res.color }} />
                    ) : insp.overall_result === 'fail' ? (
                      <XCircle size={18} style={{ color: res.color }} />
                    ) : (
                      <AlertCircle size={18} style={{ color: res.color }} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
                        {(insp.vehicles as any)?.registration ?? 'Unknown Vehicle'}
                      </p>
                      <span className="text-xs px-1.5 py-0.5 rounded-full font-medium capitalize" style={{ backgroundColor: res.bg, color: res.color }}>
                        {res.label}
                      </span>
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                      {insp.inspection_type === 'interim' ? 'Interim' : 'Full'} check ·{' '}
                      {new Date(insp.completed_at ?? insp.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      {driverName ? ` · ${driverName}` : ''}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Email/Password Login Screen ──────────────────────────────────────────────

interface EmailLoginProps {
  onLogin: (driver: AppDriver & { access_code: string }) => void;
}

function PinLoginScreen({ onLogin }: EmailLoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (authError) throw authError;

      const { data, error: dbError } = await supabase
        .from('drivers')
        .select('*')
        .eq('auth_user_id', authData.user.id)
        .eq('is_active', true)
        .single();

      if (dbError || !data) {
        await supabase.auth.signOut();
        setError('No driver account found for these credentials. Please contact your administrator.');
        return;
      }

      onLogin({
        id: data.id,
        name: data.name,
        phone: data.phone,
        vehicle: data.vehicle,
        plate: data.plate,
        status: data.status,
        avatar: data.avatar,
        access_code: data.access_code ?? '',
      });
    } catch (err: any) {
      setError(err?.message || 'Invalid email or password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-12"
      style={{ backgroundColor: 'hsl(var(--background))' }}
    >
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center gap-3 mb-4">
            <AppLogo size={40} />
            <span className="text-2xl font-bold" style={{ color: 'hsl(var(--primary))' }}>
              CastleAdmin
            </span>
          </div>
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-full mb-4 text-sm font-medium"
            style={{ backgroundColor: 'hsl(var(--primary) / 0.1)', color: 'hsl(var(--primary))' }}
          >
            <Truck size={14} />
            Driver Portal
          </div>
          <h1 className="text-xl font-semibold text-center" style={{ color: 'hsl(var(--foreground))' }}>
            Driver Sign In
          </h1>
          <p className="mt-1 text-sm text-center" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Sign in to view and manage your assigned orders
          </p>
        </div>

        {/* Card */}
        <div className="card p-6 shadow-sm">
          {error && (
            <div
              className="flex items-start gap-3 p-3 rounded-lg mb-4 text-sm"
              style={{
                backgroundColor: 'hsl(var(--destructive) / 0.08)',
                color: 'hsl(var(--destructive))',
                border: '1px solid hsl(var(--destructive) / 0.2)',
              }}
            >
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label className="label">Email address</label>
              <div className="relative">
                <span
                  className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: 'hsl(var(--muted-foreground))' }}
                >
                  <Mail size={16} />
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="input-base pl-9"
                  autoComplete="email"
                  autoFocus
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="label">Password</label>
              <div className="relative">
                <span
                  className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: 'hsl(var(--muted-foreground))' }}
                >
                  <Lock size={16} />
                </span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="input-base pl-9 pr-10"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: 'hsl(var(--muted-foreground))' }}
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !email.trim() || !password.trim()}
              className="btn-primary w-full justify-center py-2.5"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Signing in…
                </>
              ) : (
                <>
                  <Shield size={16} />
                  Sign in as Driver
                </>
              )}
            </button>
          </form>
        </div>

        <p className="mt-5 text-center text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
          Admin?{' '}
          <a
            href="/login"
            className="font-medium transition-colors hover:underline"
            style={{ color: 'hsl(var(--primary))' }}
          >
            Sign in to Admin Dashboard
          </a>
        </p>
      </div>
    </div>
  );
}

// ─── Clock In/Out Types ───────────────────────────────────────────────────────

interface ActiveShift {
  id: string;
  clock_in: string;
  break_minutes: number;
  pay_type: string;
  shift_type: string;
}

// ─── Clock In/Out Component ───────────────────────────────────────────────────

function ClockInOutCard({
  driverId,
  onShiftChange,
}: {
  driverId: string;
  onShiftChange: () => void;
}) {
  const supabase = createClient();
  const [activeShift, setActiveShift] = useState<ActiveShift | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [elapsed, setElapsed] = useState('');
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [endNotes, setEndNotes] = useState('');
  const [deliveriesCount, setDeliveriesCount] = useState('0');

  const loadActiveShift = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('driver_shifts')
        .select('id, clock_in, break_minutes, pay_type, shift_type')
        .eq('driver_id', driverId)
        .is('clock_out', null)
        .order('clock_in', { ascending: false })
        .limit(1)
        .maybeSingle();
      setActiveShift(data ?? null);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [driverId]);

  useEffect(() => { loadActiveShift(); }, [loadActiveShift]);

  // Elapsed timer
  useEffect(() => {
    if (!activeShift) { setElapsed(''); return; }
    const tick = () => {
      const ms = Date.now() - new Date(activeShift.clock_in).getTime();
      const totalMins = Math.floor(ms / 60000) - activeShift.break_minutes;
      const h = Math.floor(Math.max(0, totalMins) / 60);
      const m = Math.max(0, totalMins) % 60;
      setElapsed(`${h}h ${m.toString().padStart(2, '0')}m`);
    };
    tick();
    const interval = setInterval(tick, 30000);
    return () => clearInterval(interval);
  }, [activeShift]);

  const handleClockIn = async () => {
    setProcessing(true);
    try {
      const now = new Date();
      const day = now.getDay();
      const hour = now.getHours();
      const shiftType = day === 0 || day === 6 ? 'weekend' : hour >= 22 || hour < 6 ? 'night' : 'regular';
      const { error } = await supabase.from('driver_shifts').insert({
        driver_id: driverId,
        clock_in: now.toISOString(),
        shift_type: shiftType,
        pay_type: 'hourly',
        deliveries_completed: 0,
        is_manual: false,
      });
      if (error) throw error;
      toast.success('Clocked in successfully');
      await loadActiveShift();
      onShiftChange();
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to clock in');
    } finally {
      setProcessing(false);
    }
  };

  const handleClockOut = async () => {
    if (!activeShift) return;
    setProcessing(true);
    try {
      const { error } = await supabase.from('driver_shifts').update({
        clock_out: new Date().toISOString(),
        notes: endNotes || null,
        deliveries_completed: parseInt(deliveriesCount) || 0,
        updated_at: new Date().toISOString(),
      }).eq('id', activeShift.id);
      if (error) throw error;
      toast.success('Clocked out. Shift saved.');
      setActiveShift(null);
      setShowNotesModal(false);
      setEndNotes('');
      setDeliveriesCount('0');
      onShiftChange();
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to clock out');
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border p-4 flex items-center justify-center" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
        <Loader2 size={18} className="animate-spin" style={{ color: 'hsl(var(--muted-foreground))' }} />
      </div>
    );
  }

  return (
    <>
      <div className="rounded-xl border p-4" style={{ backgroundColor: 'hsl(var(--card))', borderColor: activeShift ? 'hsl(142 69% 35% / 0.4)' : 'hsl(var(--border))' }}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: activeShift ? 'hsl(142 69% 35% / 0.1)' : 'hsl(var(--secondary))' }}>
              <Timer size={16} style={{ color: activeShift ? 'hsl(142 69% 35%)' : 'hsl(var(--muted-foreground))' }} />
            </div>
            <div>
              <p className="text-sm font-semibold">Shift Tracker</p>
              {activeShift && (
                <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  Started {new Date(activeShift.clock_in).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                </p>
              )}
            </div>
          </div>
          {activeShift && elapsed && (
            <div className="text-right">
              <p className="text-lg font-bold" style={{ color: 'hsl(142 69% 35%)' }}>{elapsed}</p>
              <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>elapsed</p>
            </div>
          )}
        </div>

        {activeShift ? (
          <button
            onClick={() => setShowNotesModal(true)}
            disabled={processing}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-semibold text-sm transition-all"
            style={{ backgroundColor: 'hsl(0 84% 60%)', color: 'white' }}>
            {processing ? <Loader2 size={14} className="animate-spin" /> : <ClipboardList size={14} />}
            Clock Out & Add Notes
          </button>
        ) : (
          <button
            onClick={handleClockIn}
            disabled={processing}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-semibold text-sm transition-all"
            style={{ backgroundColor: 'hsl(142 69% 35%)', color: 'white' }}>
            {processing ? <Loader2 size={14} className="animate-spin" /> : <Timer size={14} />}
            Clock In
          </button>
        )}
      </div>

      {/* End of Shift Notes Modal */}
      {showNotesModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="w-full max-w-sm rounded-2xl shadow-xl" style={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}>
            <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'hsl(var(--border))' }}>
              <h3 className="font-semibold text-sm">End of Shift</h3>
              <button onClick={() => setShowNotesModal(false)}><X size={16} /></button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Deliveries Completed</label>
                <input type="number" min="0" className="w-full rounded-lg px-3 py-2 text-sm border"
                  style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))' }}
                  value={deliveriesCount} onChange={(e) => setDeliveriesCount(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Shift Notes (optional)</label>
                <textarea rows={3} placeholder="Any issues, incidents, or notes for this shift…"
                  className="w-full rounded-lg px-3 py-2 text-sm border resize-none"
                  style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))' }}
                  value={endNotes} onChange={(e) => setEndNotes(e.target.value)} />
              </div>
            </div>
            <div className="flex gap-2 p-4 border-t" style={{ borderColor: 'hsl(var(--border))' }}>
              <button onClick={() => setShowNotesModal(false)} className="flex-1 py-2.5 text-sm rounded-lg border font-medium" style={{ borderColor: 'hsl(var(--border))' }}>Cancel</button>
              <button onClick={handleClockOut} disabled={processing}
                className="flex-1 py-2.5 text-sm rounded-lg font-semibold flex items-center justify-center gap-2"
                style={{ backgroundColor: 'hsl(0 84% 60%)', color: 'white' }}>
                {processing && <Loader2 size={14} className="animate-spin" />}
                Confirm Clock Out
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Driver Profile Section ───────────────────────────────────────────────────

interface DriverProfileSectionProps {
  driver: AppDriver & { access_code: string };
  onDriverUpdate: (updated: AppDriver & { access_code: string }) => void;
  onLogout: () => void;
}

function DriverProfileSection({ driver, onDriverUpdate, onLogout }: DriverProfileSectionProps) {
  const supabase = createClient();

  // Profile fields
  const [name, setName] = useState(driver.name);
  const [phone, setPhone] = useState(driver.phone ?? '');
  const [vehicle, setVehicle] = useState(driver.vehicle ?? '');
  const [plate, setPlate] = useState(driver.plate ?? '');
  const [email, setEmail] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);

  // Password fields
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Load current auth email
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) setEmail(data.user.email);
    });
  }, []);

  const handleSaveProfile = async () => {
    if (!name.trim()) return;
    setSavingProfile(true);
    setProfileSuccess(false);
    try {
      const { error } = await supabase
        .from('drivers')
        .update({
          name: name.trim(),
          phone: phone.trim() || null,
          vehicle: vehicle.trim() || null,
          plate: plate.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', driver.id);

      if (error) throw error;

      onDriverUpdate({ ...driver, name: name.trim(), phone: phone.trim(), vehicle: vehicle.trim(), plate: plate.trim() });
      setProfileSuccess(true);
      toast.success('Profile updated successfully');
      setTimeout(() => setProfileSuccess(false), 3000);
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to update profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async () => {
    setPasswordError(null);
    if (!newPassword || !confirmPassword) {
      setPasswordError('Please fill in all password fields.');
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError('New password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }
    setSavingPassword(true);
    setPasswordSuccess(false);
    try {
      // Re-authenticate first
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) throw new Error('No authenticated user found.');

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });
      if (signInError) throw new Error('Current password is incorrect.');

      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw updateError;

      setPasswordSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.success('Password changed successfully');
      setTimeout(() => setPasswordSuccess(false), 3000);
    } catch (err: any) {
      setPasswordError(err.message ?? 'Failed to change password');
    } finally {
      setSavingPassword(false);
    }
  };

  const initials = driver.name.slice(0, 2).toUpperCase();

  return (
    <div className="space-y-4">
      {/* Avatar + Name Header */}
      <div
        className="rounded-2xl border p-5 flex flex-col items-center text-center"
        style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
      >
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold mb-3"
          style={{ backgroundColor: 'hsl(var(--primary))', color: 'white' }}
        >
          {driver.avatar || initials}
        </div>
        <p className="font-bold text-base" style={{ color: 'hsl(var(--foreground))' }}>{driver.name}</p>
        {email && (
          <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>{email}</p>
        )}
        <div
          className="mt-2 flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium"
          style={{ backgroundColor: 'hsl(var(--primary) / 0.1)', color: 'hsl(var(--primary))' }}
        >
          <Truck size={11} />
          Driver
        </div>
      </div>

      {/* Personal Info */}
      <div
        className="rounded-2xl border p-4 space-y-4"
        style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
      >
        <div className="flex items-center gap-2 mb-1">
          <User size={15} style={{ color: 'hsl(var(--primary))' }} />
          <h3 className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>Personal Information</h3>
        </div>

        {/* Name */}
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Full Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your full name"
            className="w-full rounded-lg px-3 py-2.5 text-sm border transition-colors"
            style={{
              backgroundColor: 'hsl(var(--background))',
              borderColor: 'hsl(var(--border))',
              color: 'hsl(var(--foreground))',
            }}
          />
        </div>

        {/* Email (read-only) */}
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Email Address</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'hsl(var(--muted-foreground))' }}>
              <Mail size={14} />
            </span>
            <input
              type="email"
              value={email}
              readOnly
              className="w-full rounded-lg pl-9 pr-3 py-2.5 text-sm border cursor-not-allowed"
              style={{
                backgroundColor: 'hsl(var(--secondary))',
                borderColor: 'hsl(var(--border))',
                color: 'hsl(var(--muted-foreground))',
              }}
            />
          </div>
          <p className="text-xs mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Email is managed by your administrator</p>
        </div>

        {/* Phone */}
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Phone Number</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'hsl(var(--muted-foreground))' }}>
              <Phone size={14} />
            </span>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+44 7700 000000"
              className="w-full rounded-lg pl-9 pr-3 py-2.5 text-sm border transition-colors"
              style={{
                backgroundColor: 'hsl(var(--background))',
                borderColor: 'hsl(var(--border))',
                color: 'hsl(var(--foreground))',
              }}
            />
          </div>
        </div>

        <button
          onClick={handleSaveProfile}
          disabled={savingProfile || !name.trim()}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all"
          style={{
            backgroundColor: profileSuccess ? 'hsl(142 69% 35%)' : 'hsl(var(--primary))',
            color: 'white',
            opacity: savingProfile || !name.trim() ? 0.6 : 1,
          }}
        >
          {savingProfile ? (
            <><Loader2 size={14} className="animate-spin" /> Saving…</>
          ) : profileSuccess ? (
            <><CheckCircle2 size={14} /> Saved!</>
          ) : (
            <><Save size={14} /> Save Personal Info</>
          )}
        </button>
      </div>

      {/* Vehicle Info */}
      <div
        className="rounded-2xl border p-4 space-y-4"
        style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
      >
        <div className="flex items-center gap-2 mb-1">
          <Truck size={15} style={{ color: 'hsl(var(--primary))' }} />
          <h3 className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>Vehicle Information</h3>
        </div>

        {/* Vehicle */}
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Vehicle Type / Description</label>
          <input
            type="text"
            value={vehicle}
            onChange={(e) => setVehicle(e.target.value)}
            placeholder="e.g. Ford Transit Van"
            className="w-full rounded-lg px-3 py-2.5 text-sm border transition-colors"
            style={{
              backgroundColor: 'hsl(var(--background))',
              borderColor: 'hsl(var(--border))',
              color: 'hsl(var(--foreground))',
            }}
          />
        </div>

        {/* Plate */}
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Registration Plate</label>
          <input
            type="text"
            value={plate}
            onChange={(e) => setPlate(e.target.value.toUpperCase())}
            placeholder="e.g. AB12 CDE"
            className="w-full rounded-lg px-3 py-2.5 text-sm border transition-colors font-mono tracking-wider"
            style={{
              backgroundColor: 'hsl(var(--background))',
              borderColor: 'hsl(var(--border))',
              color: 'hsl(var(--foreground))',
            }}
          />
        </div>

        <button
          onClick={handleSaveProfile}
          disabled={savingProfile || !name.trim()}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all"
          style={{
            backgroundColor: profileSuccess ? 'hsl(142 69% 35%)' : 'hsl(var(--primary))',
            color: 'white',
            opacity: savingProfile || !name.trim() ? 0.6 : 1,
          }}
        >
          {savingProfile ? (
            <><Loader2 size={14} className="animate-spin" /> Saving…</>
          ) : profileSuccess ? (
            <><CheckCircle2 size={14} /> Saved!</>
          ) : (
            <><Save size={14} /> Save Vehicle Info</>
          )}
        </button>
      </div>

      {/* Account Settings — Change Password */}
      <div
        className="rounded-2xl border p-4 space-y-4"
        style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
      >
        <div className="flex items-center gap-2 mb-1">
          <Settings size={15} style={{ color: 'hsl(var(--primary))' }} />
          <h3 className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>Account Settings</h3>
        </div>

        {passwordError && (
          <div
            className="flex items-start gap-2 p-3 rounded-lg text-xs"
            style={{
              backgroundColor: 'hsl(var(--destructive) / 0.08)',
              color: 'hsl(var(--destructive))',
              border: '1px solid hsl(var(--destructive) / 0.2)',
            }}
          >
            <AlertCircle size={13} className="shrink-0 mt-0.5" />
            {passwordError}
          </div>
        )}

        {/* Current Password */}
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Current Password</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'hsl(var(--muted-foreground))' }}>
              <Lock size={14} />
            </span>
            <input
              type={showCurrentPw ? 'text' : 'password'}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Enter current password"
              className="w-full rounded-lg pl-9 pr-10 py-2.5 text-sm border transition-colors"
              style={{
                backgroundColor: 'hsl(var(--background))',
                borderColor: 'hsl(var(--border))',
                color: 'hsl(var(--foreground))',
              }}
            />
            <button
              type="button"
              onClick={() => setShowCurrentPw((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2"
              style={{ color: 'hsl(var(--muted-foreground))' }}
            >
              {showCurrentPw ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </div>

        {/* New Password */}
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>New Password</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'hsl(var(--muted-foreground))' }}>
              <Lock size={14} />
            </span>
            <input
              type={showNewPw ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Min. 6 characters"
              className="w-full rounded-lg pl-9 pr-10 py-2.5 text-sm border transition-colors"
              style={{
                backgroundColor: 'hsl(var(--background))',
                borderColor: 'hsl(var(--border))',
                color: 'hsl(var(--foreground))',
              }}
            />
            <button
              type="button"
              onClick={() => setShowNewPw((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2"
              style={{ color: 'hsl(var(--muted-foreground))' }}
            >
              {showNewPw ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </div>

        {/* Confirm Password */}
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Confirm New Password</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'hsl(var(--muted-foreground))' }}>
              <Lock size={14} />
            </span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repeat new password"
              className="w-full rounded-lg pl-9 pr-3 py-2.5 text-sm border transition-colors"
              style={{
                backgroundColor: 'hsl(var(--background))',
                borderColor: 'hsl(var(--border))',
                color: 'hsl(var(--foreground))',
              }}
            />
          </div>
        </div>

        <button
          onClick={handleChangePassword}
          disabled={savingPassword || !currentPassword || !newPassword || !confirmPassword}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all"
          style={{
            backgroundColor: passwordSuccess ? 'hsl(142 69% 35%)' : 'hsl(var(--primary))',
            color: 'white',
            opacity: savingPassword || !currentPassword || !newPassword || !confirmPassword ? 0.6 : 1,
          }}
        >
          {savingPassword ? (
            <><Loader2 size={14} className="animate-spin" /> Updating…</>
          ) : passwordSuccess ? (
            <><CheckCircle2 size={14} /> Password Changed!</>
          ) : (
            <><Shield size={14} /> Change Password</>
          )}
        </button>
      </div>

      {/* Sign Out */}
      <div
        className="rounded-2xl border p-4"
        style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
      >
        <button
          onClick={onLogout}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all"
          style={{ backgroundColor: 'hsl(var(--destructive) / 0.1)', color: 'hsl(var(--destructive))' }}
        >
          <LogOut size={14} />
          Sign Out
        </button>
      </div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

interface DashboardProps {
  driver: AppDriver & { access_code: string };
  onLogout: () => void;
}

function DriverDashboard({ driver: initialDriver, onLogout }: DashboardProps) {
  const [driver, setDriver] = useState(initialDriver);
  const [allOrders, setAllOrders] = useState<AppOrder[]>([]);
  const [earnings, setEarnings] = useState<EarningsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'today' | 'all'>('today');
  const [activeSection, setActiveSection] = useState<'orders' | 'earnings' | 'map' | 'profile' | 'past-bookings' | 'vehicle'>('orders');
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const [showMap, setShowMap] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [shiftRefreshKey, setShiftRefreshKey] = useState(0);
  // Past bookings filters
  const [pastBookingTypeFilter, setPastBookingTypeFilter] = useState<string>('all');
  const [pastBookingDateFilter, setPastBookingDateFilter] = useState<string>('');
  const [pastBookingSearch, setPastBookingSearch] = useState<string>('');
  // Booking detail modal
  const [selectedBookingDetail, setSelectedBookingDetail] = useState<AppOrder | null>(null);

  const supabase = createClient();

  // Online/offline detection
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    setIsOnline(navigator.onLine);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // ─── Data Loading ──────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Refresh driver record
      const { data: driverData } = await supabase
        .from('drivers')
        .select('*')
        .eq('id', driver.id)
        .single();

      if (driverData) {
        setDriver((prev) => ({ ...prev, status: driverData.status }));
      }

      // Load assigned orders
      const { data: ordersData } = await supabase
        .from('orders')
        .select('*, drivers(*)')
        .eq('driver_id', driver.id)
        .order('booking_date', { ascending: false });

      if (ordersData) {
        setAllOrders(ordersData.map((row: any) => mapDbOrderToApp(row)));
      }

      // Load earnings data
      const { data: rateData } = await supabase
        .from('driver_rate_settings')
        .select('bonus_per_delivery, base_rate_per_hour')
        .single();

      const bonusPerDelivery = rateData?.bonus_per_delivery ?? 0.5;

      const now = new Date();
      const todayStr = getTodayStr();
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay());
      const weekStartStr = weekStart.toISOString().split('T')[0];
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];

      const { data: perfData } = await supabase
        .from('driver_performance_logs')
        .select('*')
        .eq('driver_id', driver.id)
        .gte('delivery_date', monthStart);

      const logs = perfData ?? [];
      const todayLogs = logs.filter((l: any) => l.delivery_date === todayStr);
      const weekLogs = logs.filter((l: any) => l.delivery_date >= weekStartStr);
      const monthLogs = logs;

      const successfulToday = todayLogs.filter((l: any) => l.was_successful).length;
      const successfulWeek = weekLogs.filter((l: any) => l.was_successful).length;
      const successfulMonth = monthLogs.filter((l: any) => l.was_successful).length;

      const totalDeliveries = monthLogs.length;
      const successfulTotal = monthLogs.filter((l: any) => l.was_successful).length;
      const completionRate = totalDeliveries > 0 ? Math.round((successfulTotal / totalDeliveries) * 100) : 0;

      const ratingsArr = monthLogs.filter((l: any) => l.customer_rating != null).map((l: any) => l.customer_rating);
      const avgRating = ratingsArr.length > 0
        ? Math.round((ratingsArr.reduce((a: number, b: number) => a + b, 0) / ratingsArr.length) * 10) / 10
        : 0;

      setEarnings({
        todayDeliveries: successfulToday,
        weekDeliveries: successfulWeek,
        monthDeliveries: successfulMonth,
        todayEarnings: parseFloat((successfulToday * bonusPerDelivery).toFixed(2)),
        weekEarnings: parseFloat((successfulWeek * bonusPerDelivery).toFixed(2)),
        monthEarnings: parseFloat((successfulMonth * bonusPerDelivery).toFixed(2)),
        avgRating,
        completionRate,
        bonusPerDelivery,
      });
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      setLoading(false);
    }
  }, [driver.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Real-time subscriptions
  useEffect(() => {
    const channel = supabase
      .channel('public-driver-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        loadData();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadData]);

  useEffect(() => {
    const channel = supabase
      .channel(`public-driver-self-${driver.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'drivers', filter: `id=eq.${driver.id}` },
        (payload) => {
          const updated = payload.new as any;
          setDriver((prev) => ({ ...prev, status: updated.status }));
          toast.info(`Availability updated to "${updated.status}" by dispatch.`);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [driver.id]);

  // ─── Availability Update ───────────────────────────────────────────────────

  const handleAvailabilityChange = async (newStatus: AvailabilityStatus) => {
    if (newStatus === driver.status) {
      setStatusDropdownOpen(false);
      return;
    }

    const activeOrders = allOrders.filter(
      (o) => o.status !== 'Booking Complete' && o.status !== 'Booking Cancelled'
    );
    if (newStatus === 'Off Duty' && activeOrders.length > 0) {
      toast.error(`You have ${activeOrders.length} active delivery${activeOrders.length > 1 ? 'ies' : ''} in progress.`);
      setStatusDropdownOpen(false);
      return;
    }

    setUpdatingStatus(true);
    setStatusDropdownOpen(false);
    try {
      const { error } = await supabase
        .from('drivers')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', driver.id);
      if (error) throw error;
      setDriver((prev) => ({ ...prev, status: newStatus }));
      toast.success(`Availability set to "${newStatus}"`);
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to update availability');
    } finally {
      setUpdatingStatus(false);
    }
  };

  // ─── Order Status Update ───────────────────────────────────────────────────

  const handleAdvanceOrderStatus = async (order: AppOrder, e: React.MouseEvent) => {
    e.stopPropagation();
    const nextStatus = NEXT_STATUS_VALUE[order.status];
    if (!nextStatus) return;

    setUpdatingOrderId(order.id);
    try {
      const { error } = await supabase
        .from('orders')
        .update({ status: nextStatus, updated_at: new Date().toISOString() })
        .eq('id', order.id);
      if (error) throw error;
      setAllOrders((prev) =>
        prev.map((o) => o.id === order.id ? { ...o, status: nextStatus } : o)
      );
      toast.success(`Order ${order.id} → ${nextStatus}`);
      if (nextStatus === 'Booking Complete') {
        loadData(); // refresh earnings
      }
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to update order status');
    } finally {
      setUpdatingOrderId(null);
    }
  };

  // ─── Derived State ─────────────────────────────────────────────────────────

  const today = getTodayStr();
  const todayOrders = allOrders.filter((o) => o.bookingDate === today);
  const displayOrders = activeTab === 'today' ? todayOrders : allOrders;
  const todayActive = todayOrders.filter(
    (o) => o.status !== 'Booking Complete' && o.status !== 'Booking Cancelled'
  ).length;
  const todayComplete = todayOrders.filter((o) => o.status === 'Booking Complete').length;
  const urgentCount = todayOrders.filter(isUrgent).length;
  const todayOutForDelivery = todayOrders.filter((o) => o.status === 'Booking Out For Delivery').length;

  const currentStyle = AVAILABILITY_STYLES[driver.status as AvailabilityStatus] ?? AVAILABILITY_STYLES['Off Duty'];

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: 'hsl(var(--background))' }}
    >
      {/* ── Top Header ── */}
      <div
        className="sticky top-0 z-30 border-b px-4 py-3"
        style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
      >
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <div className="flex items-center gap-2">
            <AppLogo size={28} />
            <span className="font-bold text-sm" style={{ color: 'hsl(var(--foreground))' }}>
              Driver Portal
            </span>
            {isOnline ? (
              <Wifi size={13} style={{ color: 'hsl(142 69% 35%)' }} />
            ) : (
              <WifiOff size={13} style={{ color: 'hsl(0 84% 60%)' }} />
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Availability Toggle — prominent */}
            <div className="relative">
              <button
                onClick={() => setStatusDropdownOpen((v) => !v)}
                disabled={updatingStatus}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border transition-all"
                style={{
                  backgroundColor: currentStyle.bg,
                  color: currentStyle.text,
                  borderColor: currentStyle.border,
                }}
              >
                {updatingStatus ? (
                  <Loader2 size={11} className="animate-spin" />
                ) : (
                  <span
                    className="w-2 h-2 rounded-full animate-pulse"
                    style={{ backgroundColor: currentStyle.dot }}
                  />
                )}
                {driver.status}
                <ChevronDown size={11} />
              </button>

              {statusDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setStatusDropdownOpen(false)} />
                  <div
                    className="absolute right-0 top-full mt-1 z-20 rounded-xl border shadow-lg overflow-hidden min-w-[160px]"
                    style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
                  >
                    <div className="px-3 py-2 border-b" style={{ borderColor: 'hsl(var(--border))' }}>
                      <p className="text-xs font-semibold" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        Set Availability
                      </p>
                    </div>
                    {AVAILABILITY_OPTIONS.map((opt) => {
                      const s = AVAILABILITY_STYLES[opt];
                      return (
                        <button
                          key={opt}
                          onClick={() => handleAvailabilityChange(opt)}
                          className="w-full flex items-center justify-center gap-2.5 px-3 py-2.5 text-xs text-left transition-colors hover:bg-secondary"
                          style={{ color: 'hsl(var(--foreground))' }}
                        >
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: s.dot }}
                          />
                          <span className="font-medium">{opt}</span>
                          {opt === driver.status && (
                            <CheckCircle2 size={12} className="ml-auto" style={{ color: 'hsl(var(--primary))' }} />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            <button
              onClick={onLogout}
              className="p-1.5 rounded-lg transition-colors hover:bg-secondary"
              title="Sign out"
            >
              <LogOut size={15} style={{ color: 'hsl(var(--muted-foreground))' }} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="max-w-lg mx-auto px-4 py-4 space-y-4 pb-24">

        {/* Driver Card */}
        <div
          className="rounded-2xl border p-4"
          style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
              style={{ backgroundColor: 'hsl(var(--primary))', color: 'white' }}
            >
              {driver.avatar || driver.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                {getGreeting()},
              </p>
              <p className="font-bold text-base leading-tight" style={{ color: 'hsl(var(--foreground))' }}>
                {driver.name}
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                {driver.vehicle} · {driver.plate}
              </p>
            </div>
            {driver.phone && (
              <a
                href={`tel:${driver.phone}`}
                className="p-2 rounded-lg transition-colors hover:bg-secondary"
                title="Call dispatch"
              >
                <Phone size={15} style={{ color: 'hsl(var(--muted-foreground))' }} />
              </a>
            )}
          </div>

          {/* Date + Status Row */}
          <div className="mt-3 flex items-center gap-2">
            <div
              className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg"
              style={{ backgroundColor: 'hsl(var(--secondary))' }}
            >
              <Calendar size={13} style={{ color: 'hsl(var(--primary))' }} />
              <span className="text-xs font-medium" style={{ color: 'hsl(var(--foreground))' }}>
                {new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
              </span>
            </div>
            {/* Prominent status badge */}
            <div
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg font-semibold text-xs"
              style={{ backgroundColor: currentStyle.bg, color: currentStyle.text }}
            >
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: currentStyle.dot }} />
              {driver.status}
            </div>
          </div>
        </div>

        {/* Clock In/Out Card — shown above KPI grid */}
        <ClockInOutCard driverId={driver.id} onShiftChange={() => setShiftRefreshKey((k) => k + 1)} />

        {/* KPI Grid */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Today's Orders", value: todayOrders.length, icon: Package, color: 'hsl(217 91% 60%)', bg: 'hsl(217 91% 60% / 0.1)' },
            { label: "Today's Deliveries", value: todayActive, icon: Truck, color: 'hsl(262 83% 58%)', bg: 'hsl(262 83% 58% / 0.1)' },
            { label: 'Completed', value: todayComplete, icon: CheckCircle2, color: 'hsl(142 69% 35%)', bg: 'hsl(142 69% 35% / 0.1)' },
            {
              label: "Today's Collections",
              value: urgentCount,
              icon: AlertCircle,
              color: urgentCount > 0 ? 'hsl(0 84% 60%)' : 'hsl(var(--muted-foreground))',
              bg: urgentCount > 0 ? 'hsl(0 84% 60% / 0.1)' : 'hsl(var(--secondary))',
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl border p-4 flex items-start gap-3"
              style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
            >
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                style={{ backgroundColor: stat.bg }}
              >
                <stat.icon size={18} style={{ color: stat.color }} />
              </div>
              <div>
                <p className="text-2xl font-bold leading-none" style={{ color: 'hsl(var(--foreground))' }}>
                  {loading ? '—' : stat.value}
                </p>
                <p className="text-xs mt-1 leading-tight" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  {stat.label}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Section Tabs */}
        <div
          className="flex gap-1 p-1 rounded-xl overflow-x-auto"
          style={{ backgroundColor: 'hsl(var(--secondary))' }}
        >
          {([
            { key: 'orders', label: 'Orders', icon: Package },
            { key: 'past-bookings', label: 'History', icon: History },
            { key: 'vehicle', label: 'Vehicle', icon: Car },
            { key: 'earnings', label: 'Earnings', icon: PoundSterling },
            { key: 'map', label: 'Map', icon: MapPin },
            { key: 'profile', label: 'Profile', icon: User },
          ] as const).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveSection(tab.key)}
              className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-medium transition-all shrink-0"
              style={{
                backgroundColor: activeSection === tab.key ? 'hsl(var(--card))' : 'transparent',
                color: activeSection === tab.key ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))',
                boxShadow: activeSection === tab.key ? '0 1px 3px hsl(var(--border))' : 'none',
                minWidth: '52px',
              }}
            >
              <tab.icon size={13} />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* ── ORDERS SECTION ── */}
        {activeSection === 'orders' && (
          <div className="space-y-3">
            {/* Sub-tab + Refresh */}
            <div className="flex items-center justify-between">
              <div className="flex gap-1 p-1 rounded-lg" style={{ backgroundColor: 'hsl(var(--secondary))' }}>
                {(['today', 'all'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className="px-3 py-1.5 rounded-md text-xs font-medium transition-all"
                    style={{
                      backgroundColor: activeTab === tab ? 'hsl(var(--card))' : 'transparent',
                      color: activeTab === tab ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))',
                    }}
                  >
                    {tab === 'today' ? `Today (${todayOrders.length})` : `All (${allOrders.length})`}
                  </button>
                ))}
              </div>
              <button
                onClick={loadData}
                disabled={loading}
                className="p-2 rounded-lg transition-colors hover:bg-secondary"
                title="Refresh"
              >
                <RefreshCw
                  size={14}
                  className={loading ? 'animate-spin' : ''}
                  style={{ color: 'hsl(var(--muted-foreground))' }}
                />
              </button>
            </div>

            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="rounded-xl border p-4 animate-pulse"
                    style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
                  >
                    <div className="h-4 rounded w-1/3 mb-3" style={{ backgroundColor: 'hsl(var(--secondary))' }} />
                    <div className="h-3 rounded w-2/3 mb-2" style={{ backgroundColor: 'hsl(var(--secondary))' }} />
                    <div className="h-8 rounded w-full" style={{ backgroundColor: 'hsl(var(--secondary))' }} />
                  </div>
                ))}
              </div>
            ) : displayOrders.length === 0 ? (
              <div
                className="rounded-xl border p-10 text-center"
                style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
              >
                <Package size={36} className="mx-auto mb-3" style={{ color: 'hsl(var(--muted-foreground))' }} />
                <p className="font-semibold text-sm" style={{ color: 'hsl(var(--foreground))' }}>
                  {activeTab === 'today' ? 'No deliveries today' : 'No orders assigned'}
                </p>
                <p className="text-xs mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  Check back later or view all orders.
                </p>
              </div>
            ) : (
              displayOrders.map((order) => {
                const nextStatusLabel = NEXT_STATUS_LABEL[order.status];
                const isComplete = order.status === 'Booking Complete';
                const isCancelled = order.status === 'Booking Cancelled';
                const isUpdating = updatingOrderId === order.id;
                const urgent = isUrgent(order);
                const accentColor = STATUS_ACCENT[order.status] ?? 'hsl(var(--primary))';

                return (
                  <div
                    key={order.id}
                    className="rounded-xl border overflow-hidden"
                    style={{
                      backgroundColor: 'hsl(var(--card))',
                      borderColor: urgent ? 'hsl(0 84% 60% / 0.4)' : 'hsl(var(--border))',
                    }}
                  >
                    {urgent && (
                      <div
                        className="flex items-center gap-2 px-4 py-1.5"
                        style={{ backgroundColor: 'hsl(0 84% 60% / 0.08)' }}
                      >
                        <AlertCircle size={12} style={{ color: 'hsl(0 84% 60%)' }} />
                        <span className="text-xs font-medium" style={{ color: 'hsl(0 84% 60%)' }}>
                          Urgent — delivery window approaching
                        </span>
                      </div>
                    )}

                    <div className="p-4">
                      {/* Header */}
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-bold text-sm" style={{ color: 'hsl(var(--foreground))' }}>
                              {order.id}
                            </span>
                            <StatusBadge status={order.status} />
                          </div>
                          {/* Progress bar */}
                          <div className="flex gap-0.5 mt-1.5">
                            {STATUS_FLOW.map((s, idx) => {
                              const currentIdx = STATUS_FLOW.indexOf(order.status);
                              return (
                                <div
                                  key={s}
                                  className="flex-1 h-1 rounded-full transition-all"
                                  style={{ backgroundColor: idx <= currentIdx ? accentColor : 'hsl(var(--secondary))' }}
                                />
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      {/* Customer Details */}
                      <div
                        className="rounded-lg p-3 mb-3 space-y-2"
                        style={{ backgroundColor: 'hsl(var(--secondary))' }}
                      >
                        <div className="flex items-center gap-2">
                          <User size={13} style={{ color: 'hsl(var(--primary))' }} />
                          <span className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
                            {order.customer.name}
                          </span>
                        </div>
                        {order.customer.phone && (
                          <a href={`tel:${order.customer.phone}`} className="flex items-center gap-2 group">
                            <Phone size={12} style={{ color: 'hsl(var(--primary))' }} />
                            <span className="text-xs font-medium group-hover:underline" style={{ color: 'hsl(var(--primary))' }}>
                              {order.customer.phone}
                            </span>
                          </a>
                        )}
                        {order.deliveryAddress && (
                          <div className="flex items-start gap-2">
                            <MapPin size={12} className="shrink-0 mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }} />
                            <p className="text-xs leading-snug" style={{ color: 'hsl(var(--muted-foreground))' }}>
                              {order.deliveryAddress.line1}
                              {order.deliveryAddress.line2 ? `, ${order.deliveryAddress.line2}` : ''}
                              {', '}{order.deliveryAddress.city}{', '}{order.deliveryAddress.postcode}
                            </p>
                          </div>
                        )}
                        <div className="flex items-center gap-1">
                          <Clock size={12} style={{ color: 'hsl(var(--muted-foreground))' }} />
                          <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                            {order.deliveryWindow} · {new Date(order.bookingDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                          </span>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      {!isComplete && !isCancelled && (
                        <div className="flex gap-2">
                          {nextStatusLabel && (
                            <button
                              onClick={(e) => handleAdvanceOrderStatus(order, e)}
                              disabled={isUpdating}
                              className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg font-semibold text-sm transition-all"
                              style={{ backgroundColor: accentColor, color: 'white', opacity: isUpdating ? 0.7 : 1 }}
                            >
                              {isUpdating ? (
                                <Loader2 size={14} className="animate-spin" />
                              ) : (
                                <>
                                  <ArrowRight size={14} />
                                  {nextStatusLabel}
                                </>
                              )}
                            </button>
                          )}
                          {order.deliveryAddress && (
                            <a
                              href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                                `${order.deliveryAddress.line1}, ${order.deliveryAddress.city}, ${order.deliveryAddress.postcode}`
                              )}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg font-medium text-sm transition-colors hover:bg-secondary border"
                              style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                            >
                              <Navigation size={14} style={{ color: 'hsl(var(--primary))' }} />
                              <span className="text-xs">Nav</span>
                            </a>
                          )}
                        </div>
                      )}

                      {isComplete && (
                        <div
                          className="flex items-center gap-2 py-2 px-3 rounded-lg"
                          style={{ backgroundColor: 'hsl(142 69% 35% / 0.1)' }}
                        >
                          <CheckCircle2 size={15} style={{ color: 'hsl(142 69% 35%)' }} />
                          <span className="text-sm font-medium" style={{ color: 'hsl(142 69% 35%)' }}>
                            Delivery Complete
                          </span>
                        </div>
                      )}

                      {isCancelled && (
                        <div
                          className="flex items-center gap-2 py-2 px-3 rounded-lg"
                          style={{ backgroundColor: 'hsl(0 84% 60% / 0.08)' }}
                        >
                          <AlertCircle size={15} style={{ color: 'hsl(0 84% 60%)' }} />
                          <span className="text-sm font-medium" style={{ color: 'hsl(0 84% 60%)' }}>
                            Booking Cancelled
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ── PAST BOOKINGS SECTION ── */}
        {activeSection === 'past-bookings' && (() => {
          const completedOrders = allOrders.filter(
            (o) => o.status === 'Booking Complete' || o.status === 'Booking Cancelled'
          );

          const bookingTypes = Array.from(new Set(
            completedOrders.map((o) => (o as any).bookingType ?? (o as any).booking_type ?? 'Delivery').filter(Boolean)
          ));

          const filtered = completedOrders.filter((o) => {
            const typeMatch = pastBookingTypeFilter === 'all' || ((o as any).bookingType ?? (o as any).booking_type ?? 'Delivery') === pastBookingTypeFilter;
            const dateMatch = !pastBookingDateFilter || o.bookingDate === pastBookingDateFilter;
            const searchMatch = !pastBookingSearch || 
              o.id.toLowerCase().includes(pastBookingSearch.toLowerCase()) ||
              o.customer.name.toLowerCase().includes(pastBookingSearch.toLowerCase()) ||
              (o.deliveryAddress?.postcode ?? '').toLowerCase().includes(pastBookingSearch.toLowerCase());
            return typeMatch && dateMatch && searchMatch;
          });

          return (
            <div className="space-y-4">
              <div>
                <h3 className="font-bold text-base" style={{ color: 'hsl(var(--foreground))' }}>Past Bookings</h3>
                <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  {completedOrders.length} completed or cancelled booking{completedOrders.length !== 1 ? 's' : ''}
                </p>
              </div>

              {/* Filters */}
              <div className="space-y-2">
                {/* Search */}
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'hsl(var(--muted-foreground))' }} />
                  <input
                    type="text"
                    value={pastBookingSearch}
                    onChange={(e) => setPastBookingSearch(e.target.value)}
                    placeholder="Search by order ID, customer, postcode..."
                    className="w-full text-sm pl-9 pr-3 py-2 rounded-lg border outline-none"
                    style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                  />
                  {pastBookingSearch && (
                    <button onClick={() => setPastBookingSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                      <X size={13} style={{ color: 'hsl(var(--muted-foreground))' }} />
                    </button>
                  )}
                </div>

                {/* Date + Type row */}
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Calendar size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'hsl(var(--muted-foreground))' }} />
                    <input
                      type="date"
                      value={pastBookingDateFilter}
                      onChange={(e) => setPastBookingDateFilter(e.target.value)}
                      className="w-full text-xs pl-8 pr-2 py-2 rounded-lg border outline-none"
                      style={{ backgroundColor: 'hsl(var(--card))', borderColor: pastBookingDateFilter ? 'hsl(var(--primary))' : 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                    />
                  </div>
                  <select
                    value={pastBookingTypeFilter}
                    onChange={(e) => setPastBookingTypeFilter(e.target.value)}
                    className="flex-1 text-xs px-2 py-2 rounded-lg border outline-none"
                    style={{ backgroundColor: 'hsl(var(--card))', borderColor: pastBookingTypeFilter !== 'all' ? 'hsl(var(--primary))' : 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                  >
                    <option value="all">All Types</option>
                    {bookingTypes.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>

                {/* Active filter summary */}
                {(pastBookingDateFilter || pastBookingTypeFilter !== 'all' || pastBookingSearch) && (
                  <div className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ backgroundColor: 'hsl(var(--primary) / 0.08)' }}>
                    <span className="text-xs font-medium" style={{ color: 'hsl(var(--primary))' }}>
                      {filtered.length} result{filtered.length !== 1 ? 's' : ''} found
                    </span>
                    <button
                      onClick={() => { setPastBookingDateFilter(''); setPastBookingTypeFilter('all'); setPastBookingSearch(''); }}
                      className="text-xs font-medium flex items-center gap-1"
                      style={{ color: 'hsl(var(--primary))' }}
                    >
                      <X size={11} /> Clear filters
                    </button>
                  </div>
                )}
              </div>

              {/* Results */}
              {filtered.length === 0 ? (
                <div className="rounded-xl border p-10 text-center" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
                  <History size={36} className="mx-auto mb-3" style={{ color: 'hsl(var(--muted-foreground))' }} />
                  <p className="font-semibold text-sm" style={{ color: 'hsl(var(--foreground))' }}>No past bookings found</p>
                  <p className="text-xs mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    {completedOrders.length === 0 ? 'Completed bookings will appear here.' : 'Try adjusting your filters.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filtered.map((order) => {
                    const isComplete = order.status === 'Booking Complete';
                    const bookingType = (order as any).bookingType ?? (order as any).booking_type ?? 'Delivery';
                    return (
                      <div
                        key={order.id}
                        className="rounded-xl border overflow-hidden cursor-pointer transition-all hover:shadow-sm"
                        style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
                        onClick={() => setSelectedBookingDetail(order)}
                      >
                        <div className="p-4">
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <span className="font-bold text-sm" style={{ color: 'hsl(var(--foreground))' }}>{order.id}</span>
                                <span
                                  className="text-xs px-2 py-0.5 rounded-full font-medium"
                                  style={{
                                    backgroundColor: isComplete ? 'hsl(142 69% 35% / 0.1)' : 'hsl(0 84% 60% / 0.1)',
                                    color: isComplete ? 'hsl(142 69% 35%)' : 'hsl(0 84% 60%)',
                                  }}
                                >
                                  {isComplete ? '✓ Complete' : '✕ Cancelled'}
                                </span>
                                <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: 'hsl(var(--secondary))', color: 'hsl(var(--muted-foreground))' }}>
                                  {bookingType}
                                </span>
                              </div>
                              <p className="text-sm font-medium" style={{ color: 'hsl(var(--foreground))' }}>{order.customer.name}</p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {order.deliveryAddress && (
                                <a
                                  href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${order.deliveryAddress.line1}, ${order.deliveryAddress.city}, ${order.deliveryAddress.postcode}`)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="p-1.5 rounded-lg transition-colors hover:bg-secondary border"
                                  style={{ borderColor: 'hsl(var(--border))' }}
                                  title="Navigate with Google Maps"
                                >
                                  <Navigation size={13} style={{ color: 'hsl(var(--primary))' }} />
                                </a>
                              )}
                              <button
                                onClick={(e) => { e.stopPropagation(); setSelectedBookingDetail(order); }}
                                className="p-1.5 rounded-lg transition-colors hover:bg-secondary border"
                                style={{ borderColor: 'hsl(var(--border))' }}
                                title="View details"
                              >
                                <Info size={13} style={{ color: 'hsl(var(--muted-foreground))' }} />
                              </button>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                            <div className="flex items-center gap-1">
                              <Calendar size={11} />
                              {new Date(order.bookingDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </div>
                            {order.deliveryAddress && (
                              <div className="flex items-center gap-1 min-w-0">
                                <MapPin size={11} className="shrink-0" />
                                <span className="truncate">{order.deliveryAddress.postcode}</span>
                              </div>
                            )}
                            {order.deliveryWindow && (
                              <div className="flex items-center gap-1">
                                <Clock size={11} />
                                {order.deliveryWindow}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

        {/* ── VEHICLE / SAFETY CHECKS SECTION ── */}
        {activeSection === 'vehicle' && (
          <SafetyCheckSection driverId={driver.id} />
        )}

        {/* ── EARNINGS SECTION ── */}
        {activeSection === 'earnings' && (
          <div className="space-y-4">
            {loading || !earnings ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="rounded-xl border p-4 animate-pulse h-20"
                    style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
                  />
                ))}
              </div>
            ) : (
              <>
                {/* Earnings Cards */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Today', deliveries: earnings.todayDeliveries, amount: earnings.todayEarnings },
                    { label: 'This Week', deliveries: earnings.weekDeliveries, amount: earnings.weekEarnings },
                    { label: 'This Month', deliveries: earnings.monthDeliveries, amount: earnings.monthEarnings },
                  ].map((period) => (
                    <div
                      key={period.label}
                      className="rounded-xl border p-3 text-center"
                      style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
                    >
                      <p className="text-xs mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        {period.label}
                      </p>
                      <p className="text-lg font-bold" style={{ color: 'hsl(var(--foreground))' }}>
                        £{period.amount.toFixed(2)}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        {period.deliveries} deliveries
                      </p>
                    </div>
                  ))}
                </div>

                {/* Performance Stats */}
                <div
                  className="rounded-xl border p-4 space-y-4"
                  style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
                >
                  <h3 className="font-semibold text-sm" style={{ color: 'hsl(var(--foreground))' }}>
                    Performance (This Month)
                  </h3>

                  {/* Completion Rate */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <TrendingUp size={13} style={{ color: 'hsl(142 69% 35%)' }} />
                        <span className="text-xs font-medium" style={{ color: 'hsl(var(--foreground))' }}>
                          Completion Rate
                        </span>
                      </div>
                      <span className="text-xs font-bold" style={{ color: 'hsl(142 69% 35%)' }}>
                        {earnings.completionRate}%
                      </span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'hsl(var(--secondary))' }}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${earnings.completionRate}%`,
                          backgroundColor: earnings.completionRate >= 90
                            ? 'hsl(142 69% 35%)'
                            : earnings.completionRate >= 70
                            ? 'hsl(38 92% 50%)'
                            : 'hsl(0 84% 60%)',
                        }}
                      />
                    </div>
                  </div>

                  {/* Average Rating */}
                  {earnings.avgRating > 0 && (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Star size={13} style={{ color: 'hsl(38 92% 50%)' }} />
                        <span className="text-xs font-medium" style={{ color: 'hsl(var(--foreground))' }}>
                          Avg Customer Rating
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-bold" style={{ color: 'hsl(var(--foreground))' }}>
                          {earnings.avgRating}
                        </span>
                        <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>/5</span>
                        <div className="flex gap-0.5 ml-1">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <Star
                              key={star}
                              size={10}
                              fill={star <= Math.round(earnings.avgRating) ? 'hsl(38 92% 50%)' : 'none'}
                              style={{ color: 'hsl(38 92% 50%)' }}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Bonus Rate */}
                  <div
                    className="flex items-center justify-between p-3 rounded-lg"
                    style={{ backgroundColor: 'hsl(var(--secondary))' }}
                  >
                    <div className="flex items-center gap-1.5">
                      <PoundSterling size={13} style={{ color: 'hsl(var(--primary))' }} />
                      <span className="text-xs font-medium" style={{ color: 'hsl(var(--foreground))' }}>
                        Bonus per Delivery
                      </span>
                    </div>
                    <span className="text-xs font-bold" style={{ color: 'hsl(var(--primary))' }}>
                      £{earnings.bonusPerDelivery.toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Monthly deliveries breakdown */}
                <div
                  className="rounded-xl border p-4"
                  style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
                >
                  <h3 className="font-semibold text-sm mb-3" style={{ color: 'hsl(var(--foreground))' }}>
                    All-Time Summary
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div
                      className="p-3 rounded-lg text-center"
                      style={{ backgroundColor: 'hsl(var(--secondary))' }}
                    >
                      <p className="text-xl font-bold" style={{ color: 'hsl(var(--foreground))' }}>
                        {allOrders.filter((o) => o.status === 'Booking Complete').length}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        Total Completed
                      </p>
                    </div>
                    <div
                      className="p-3 rounded-lg text-center"
                      style={{ backgroundColor: 'hsl(var(--secondary))' }}
                    >
                      <p className="text-xl font-bold" style={{ color: 'hsl(var(--foreground))' }}>
                        £{(allOrders.filter((o) => o.status === 'Booking Complete').length * earnings.bonusPerDelivery).toFixed(2)}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        Total Bonus Earned
                      </p>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── MAP SECTION ── */}
        {activeSection === 'map' && (
          <div
            className="rounded-xl border overflow-hidden"
            style={{ borderColor: 'hsl(var(--border))' }}
          >
            <div
              className="flex items-center justify-between px-4 py-3 border-b"
              style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
            >
              <div className="flex items-center gap-2">
                <Navigation size={16} style={{ color: 'hsl(var(--primary))' }} />
                <span className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
                  Delivery Route Map
                </span>
                {todayOutForDelivery > 0 && (
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{ backgroundColor: 'hsl(262 83% 58% / 0.12)', color: 'hsl(262 83% 58%)' }}
                  >
                    {todayOutForDelivery} en route
                  </span>
                )}
              </div>
              <button
                onClick={loadData}
                disabled={loading}
                className="p-1.5 rounded-lg transition-colors hover:bg-secondary"
              >
                <RefreshCw size={13} className={loading ? 'animate-spin' : ''} style={{ color: 'hsl(var(--muted-foreground))' }} />
              </button>
            </div>
            <DriverRouteMap
              orders={activeTab === 'today' ? todayOrders : allOrders}
              driverName={driver.name}
            />
          </div>
        )}

        {/* ── PROFILE SECTION ── */}
        {activeSection === 'profile' && (
          <DriverProfileSection
            driver={driver}
            onDriverUpdate={(updated) => setDriver(updated)}
            onLogout={onLogout}
          />
        )}

        {/* Booking Detail Modal */}
        {selectedBookingDetail && (
          <BookingDetailModal
            order={selectedBookingDetail}
            onClose={() => setSelectedBookingDetail(null)}
          />
        )}
      </div>
    </div>
  );
}

// ─── Root Component ───────────────────────────────────────────────────────────

export default function PublicDriverPortal() {
  const [driver, setDriver] = useState<(AppDriver & { access_code: string }) | null>(null);
  const supabase = createClient();

  // Restore session from Supabase auth on mount
  useEffect(() => {
    const restoreSession = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data } = await supabase
          .from('drivers')
          .select('*')
          .eq('auth_user_id', user.id)
          .eq('is_active', true)
          .single();

        if (data) {
          setDriver({
            id: data.id,
            name: data.name,
            phone: data.phone,
            vehicle: data.vehicle,
            plate: data.plate,
            status: data.status,
            avatar: data.avatar,
            access_code: data.access_code ?? '',
          });
        }
      } catch {}
    };
    restoreSession();
  }, []);

  const handleLogin = (d: AppDriver & { access_code: string }) => {
    setDriver(d);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setDriver(null);
  };

  if (!driver) {
    return <PinLoginScreen onLogin={handleLogin} />;
  }

  return <DriverDashboard driver={driver} onLogout={handleLogout} />;
}
