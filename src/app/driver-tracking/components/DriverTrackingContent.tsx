'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import AppLayout from '@/components/AppLayout';
import { MapPin, Navigation, Clock, Wifi, WifiOff, Truck, RefreshCw, Gauge, Route, User, Calendar, Coffee, CheckCircle2, Timer,  } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Driver {
  id: string;
  name: string;
  phone: string;
  vehicle: string;
  plate: string;
  status: string;
  auth_user_id: string | null;
}

interface Vehicle {
  id: string;
  registration: string;
  make: string;
  model: string;
  type: string;
  colour: string | null;
}

interface DriverLocation {
  driver_id: string;
  latitude: number;
  longitude: number;
  heading: number | null;
  speed: number | null;
  recorded_at: string;
}

interface DriverShift {
  id: string;
  driver_id: string;
  shift_date: string;
  start_time: string | null;
  end_time: string | null;
  clock_in: string | null;
  clock_out: string | null;
  break_minutes: number;
  shift_type: string;
  status: string;
  deliveries_completed: number;
  vehicle_id: string | null;
  vehicle?: Vehicle | null;
}

interface ActiveOrder {
  id: string;
  customer_name: string;
  status: string;
  delivery_address_line1: string | null;
  delivery_address_city: string | null;
  delivery_address_postcode: string | null;
  delivery_window: string | null;
  booking_date: string;
}

interface DriverRow {
  driver: Driver;
  location: DriverLocation | null;
  shift: DriverShift | null;
  activeOrder: ActiveOrder | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SHIFT_STATUS_COLOR: Record<string, string> = {
  active: '#22c55e',
  scheduled: '#3b82f6',
  completed: '#94a3b8',
  cancelled: '#ef4444',
};

const DRIVER_STATUS_COLOR: Record<string, string> = {
  'On Route': '#f97316',
  'Available': '#22c55e',
  'Off Duty': '#94a3b8',
};

const SHIFT_TYPE_LABEL: Record<string, string> = {
  regular: 'Regular',
  overtime: 'Overtime',
  weekend: 'Weekend',
  night: 'Night',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function formatShiftTime(time: string | null): string {
  if (!time) return '—';
  return time.slice(0, 5);
}

function calcShiftProgress(shift: DriverShift): number {
  if (!shift.start_time || !shift.end_time) return 0;
  const [sh, sm] = shift.start_time.split(':').map(Number);
  const [eh, em] = shift.end_time.split(':').map(Number);
  const now = new Date();
  const startMins = sh * 60 + sm;
  const endMins = eh * 60 + em;
  const nowMins = now.getHours() * 60 + now.getMinutes();
  if (nowMins <= startMins) return 0;
  if (nowMins >= endMins) return 100;
  return Math.round(((nowMins - startMins) / (endMins - startMins)) * 100);
}

function calcNetHours(shift: DriverShift): string {
  if (!shift.start_time || !shift.end_time) return '—';
  const [sh, sm] = shift.start_time.split(':').map(Number);
  const [eh, em] = shift.end_time.split(':').map(Number);
  const totalMins = (eh * 60 + em) - (sh * 60 + sm) - (shift.break_minutes || 0);
  if (totalMins <= 0) return '—';
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function parseETAMinutes(bookingDate: string, deliveryWindow: string | null): number | null {
  if (!deliveryWindow) return null;
  const match = deliveryWindow.match(/(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/);
  if (!match) return null;
  const [h, m] = match[2].split(':').map(Number);
  const d = new Date(bookingDate);
  d.setHours(h, m, 0, 0);
  const diffMs = d.getTime() - Date.now();
  return Math.floor(diffMs / 60000);
}

// ─── Map Component ────────────────────────────────────────────────────────────

interface TrackingMapProps {
  drivers: DriverRow[];
  selectedDriverId: string | null;
  onSelectDriver: (id: string) => void;
}

function TrackingMap({ drivers, selectedDriverId, onSelectDriver }: TrackingMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    import('leaflet').then((leafletModule) => {
      const L = leafletModule.default;
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });
      if (!mapRef.current || mapInstanceRef.current) return;
      const map = L.map(mapRef.current, {
        center: [51.505, -0.09],
        zoom: 10,
        zoomControl: true,
      });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);
      mapInstanceRef.current = map;
    });

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        markersRef.current.clear();
      }
    };
  }, []);

  useEffect(() => {
    if (!mapInstanceRef.current) return;
    import('leaflet').then((leafletModule) => {
      const L = leafletModule.default;
      const map = mapInstanceRef.current;
      const bounds: [number, number][] = [];
      const activeIds = new Set<string>();

      drivers.forEach(({ driver, location, shift }) => {
        if (!location) return;
        activeIds.add(driver.id);
        const isSelected = driver.id === selectedDriverId;
        const driverColor = DRIVER_STATUS_COLOR[driver.status] ?? '#94a3b8';
        const shiftColor = shift ? (SHIFT_STATUS_COLOR[shift.status] ?? '#94a3b8') : '#94a3b8';
        const initials = driver.name.slice(0, 2).toUpperCase();
        const speed = location.speed ? Math.round(location.speed) : 0;

        const iconHtml = `
          <div style="position:relative;">
            <div style="
              width:${isSelected ? 44 : 36}px;height:${isSelected ? 44 : 36}px;
              border-radius:50%;background:${driverColor};
              border:${isSelected ? '4px' : '3px'} solid ${isSelected ? '#8b5cf6' : 'white'};
              box-shadow:0 2px 10px rgba(0,0,0,0.35);
              display:flex;align-items:center;justify-content:center;
              font-size:11px;font-weight:700;color:white;cursor:pointer;
            ">${initials}</div>
            ${speed > 0 ? `<div style="position:absolute;bottom:-16px;left:50%;transform:translateX(-50%);background:#1e293b;color:white;font-size:9px;font-weight:600;padding:1px 5px;border-radius:8px;white-space:nowrap;">${speed} km/h</div>` : ''}
            <div style="position:absolute;top:-4px;right:-4px;width:10px;height:10px;border-radius:50%;background:${shiftColor};border:2px solid white;"></div>
          </div>
        `;

        const icon = L.divIcon({
          html: iconHtml,
          className: '',
          iconSize: [isSelected ? 44 : 36, isSelected ? 60 : 52],
          iconAnchor: [isSelected ? 22 : 18, isSelected ? 22 : 18],
        });

        const existing = markersRef.current.get(driver.id);
        if (existing) {
          existing.setLatLng([location.latitude, location.longitude]);
          existing.setIcon(icon);
        } else {
          const marker = L.marker([location.latitude, location.longitude], { icon })
            .addTo(map)
            .bindPopup(`
              <div style="font-size:12px;min-width:160px;">
                <strong>${driver.name}</strong><br/>
                <span style="color:#6b7280;">${driver.vehicle} · ${driver.plate}</span><br/>
                <span style="color:${driverColor};">● ${driver.status}</span><br/>
                ${speed > 0 ? `<span style="color:#374151;">🚗 ${speed} km/h</span>` : ''}
              </div>
            `)
            .on('click', () => onSelectDriver(driver.id));
          markersRef.current.set(driver.id, marker);
        }
        bounds.push([location.latitude, location.longitude]);
      });

      // Remove stale markers
      markersRef.current.forEach((marker, driverId) => {
        if (!activeIds.has(driverId)) {
          marker.remove();
          markersRef.current.delete(driverId);
        }
      });

      if (bounds.length > 0) {
        try { map.fitBounds(bounds, { padding: [60, 60], maxZoom: 14 }); } catch {}
      }
    });
  }, [drivers, selectedDriverId, onSelectDriver]);

  return (
    <>
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <div ref={mapRef} className="w-full h-full" style={{ minHeight: '400px' }} />
    </>
  );
}

// ─── Driver Card ──────────────────────────────────────────────────────────────

function DriverCard({
  row,
  isSelected,
  onClick,
}: {
  row: DriverRow;
  isSelected: boolean;
  onClick: () => void;
}) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 10000);
    return () => clearInterval(id);
  }, []);

  const { driver, location, shift, activeOrder } = row;
  const driverColor = DRIVER_STATUS_COLOR[driver.status] ?? '#94a3b8';
  const shiftProgress = shift ? calcShiftProgress(shift) : 0;
  const speed = location?.speed ? Math.round(location.speed) : 0;
  const etaMins = activeOrder ? parseETAMinutes(activeOrder.booking_date, activeOrder.delivery_window) : null;

  return (
    <button
      onClick={onClick}
      className="w-full text-left p-3 rounded-lg border transition-all"
      style={{
        borderColor: isSelected ? 'hsl(var(--primary))' : 'hsl(var(--border))',
        backgroundColor: isSelected ? 'hsl(var(--primary) / 0.05)' : 'hsl(var(--card))',
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
          style={{ backgroundColor: driverColor, color: 'white' }}
        >
          {driver.name.slice(0, 2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: 'hsl(var(--foreground))' }}>
            {driver.name}
          </p>
          <p className="text-[10px] truncate" style={{ color: 'hsl(var(--muted-foreground))' }}>
            {driver.vehicle} · {driver.plate}
          </p>
        </div>
        <span
          className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full shrink-0"
          style={{ backgroundColor: `${driverColor}20`, color: driverColor }}
        >
          {driver.status}
        </span>
      </div>

      {/* Speed + Location */}
      <div className="flex items-center gap-3 mb-2">
        <div className="flex items-center gap-1">
          <Gauge size={11} style={{ color: '#f97316' }} />
          <span className="text-[10px] font-mono font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
            {speed} km/h
          </span>
        </div>
        {location && (
          <div className="flex items-center gap-1">
            <MapPin size={11} style={{ color: 'hsl(var(--muted-foreground))' }} />
            <span className="text-[10px]" style={{ color: 'hsl(var(--muted-foreground))' }}>
              {timeAgo(location.recorded_at)}
            </span>
          </div>
        )}
        {!location && (
          <span className="text-[10px]" style={{ color: '#94a3b8' }}>No GPS signal</span>
        )}
      </div>

      {/* Shift info */}
      {shift ? (
        <div className="mb-2">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1">
              <Clock size={10} style={{ color: 'hsl(var(--muted-foreground))' }} />
              <span className="text-[10px]" style={{ color: 'hsl(var(--muted-foreground))' }}>
                {formatShiftTime(shift.start_time)} – {formatShiftTime(shift.end_time)}
              </span>
            </div>
            <span
              className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
              style={{
                backgroundColor: `${SHIFT_STATUS_COLOR[shift.status] ?? '#94a3b8'}20`,
                color: SHIFT_STATUS_COLOR[shift.status] ?? '#94a3b8',
              }}
            >
              {shift.status}
            </span>
          </div>
          {/* Progress bar */}
          <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'hsl(var(--secondary))' }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${shiftProgress}%`,
                backgroundColor: SHIFT_STATUS_COLOR[shift.status] ?? '#94a3b8',
              }}
            />
          </div>
          <div className="flex justify-between mt-0.5">
            <span className="text-[9px]" style={{ color: 'hsl(var(--muted-foreground))' }}>
              {shiftProgress}% complete
            </span>
            <span className="text-[9px]" style={{ color: 'hsl(var(--muted-foreground))' }}>
              {calcNetHours(shift)} total
            </span>
          </div>
        </div>
      ) : (
        <p className="text-[10px] mb-2" style={{ color: '#94a3b8' }}>No active shift today</p>
      )}

      {/* ETA */}
      {activeOrder && (
        <div
          className="flex items-center justify-between p-1.5 rounded"
          style={{ backgroundColor: 'hsl(var(--secondary))' }}
        >
          <div className="flex items-center gap-1 min-w-0">
            <Route size={10} style={{ color: '#8b5cf6' }} />
            <span className="text-[10px] truncate" style={{ color: 'hsl(var(--foreground))' }}>
              {activeOrder.customer_name}
            </span>
          </div>
          {etaMins !== null && (
            <span
              className="text-[9px] font-semibold shrink-0 ml-1"
              style={{ color: etaMins < 0 ? '#ef4444' : etaMins < 15 ? '#f97316' : '#22c55e' }}
            >
              {etaMins < 0 ? `Overdue ${Math.abs(etaMins)}m` : `ETA ${etaMins}m`}
            </span>
          )}
        </div>
      )}
    </button>
  );
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────

function DriverDetailPanel({ row }: { row: DriverRow }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 5000);
    return () => clearInterval(id);
  }, []);

  const { driver, location, shift, activeOrder } = row;
  const driverColor = DRIVER_STATUS_COLOR[driver.status] ?? '#94a3b8';
  const shiftProgress = shift ? calcShiftProgress(shift) : 0;
  const speed = location?.speed ? Math.round(location.speed) : 0;
  const heading = location?.heading ? Math.round(location.heading) : null;
  const etaMins = activeOrder ? parseETAMinutes(activeOrder.booking_date, activeOrder.delivery_window) : null;

  return (
    <div className="p-4 space-y-4">
      {/* Driver header */}
      <div className="flex items-center gap-3">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold"
          style={{ backgroundColor: driverColor, color: 'white' }}
        >
          {driver.name.slice(0, 2).toUpperCase()}
        </div>
        <div>
          <h3 className="font-semibold text-sm" style={{ color: 'hsl(var(--foreground))' }}>{driver.name}</h3>
          <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>{driver.phone}</p>
          <span
            className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
            style={{ backgroundColor: `${driverColor}20`, color: driverColor }}
          >
            {driver.status}
          </span>
        </div>
      </div>

      {/* Vehicle */}
      <div className="rounded-lg p-3 space-y-1.5" style={{ backgroundColor: 'hsl(var(--secondary))' }}>
        <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'hsl(var(--muted-foreground))' }}>
          Vehicle
        </p>
        <div className="flex items-center gap-2">
          <Truck size={14} style={{ color: 'hsl(var(--muted-foreground))' }} />
          <span className="text-sm font-medium" style={{ color: 'hsl(var(--foreground))' }}>
            {driver.vehicle}
          </span>
        </div>
        <p className="text-xs font-mono" style={{ color: 'hsl(var(--muted-foreground))' }}>{driver.plate}</p>
        {shift?.vehicle && (
          <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
            {shift.vehicle.make} {shift.vehicle.model} · {shift.vehicle.colour ?? ''}
          </p>
        )}
      </div>

      {/* Live telemetry */}
      <div className="rounded-lg p-3 space-y-2" style={{ backgroundColor: 'hsl(var(--secondary))' }}>
        <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'hsl(var(--muted-foreground))' }}>
          Live Telemetry
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded p-2 text-center" style={{ backgroundColor: 'hsl(var(--card))' }}>
            <Gauge size={16} className="mx-auto mb-1" style={{ color: '#f97316' }} />
            <p className="text-lg font-bold font-mono" style={{ color: 'hsl(var(--foreground))' }}>{speed}</p>
            <p className="text-[9px]" style={{ color: 'hsl(var(--muted-foreground))' }}>km/h</p>
          </div>
          <div className="rounded p-2 text-center" style={{ backgroundColor: 'hsl(var(--card))' }}>
            <Navigation size={16} className="mx-auto mb-1" style={{ color: '#3b82f6' }} />
            <p className="text-lg font-bold font-mono" style={{ color: 'hsl(var(--foreground))' }}>
              {heading !== null ? `${heading}°` : '—'}
            </p>
            <p className="text-[9px]" style={{ color: 'hsl(var(--muted-foreground))' }}>heading</p>
          </div>
        </div>
        {location && (
          <div className="flex items-center gap-1.5">
            <MapPin size={11} style={{ color: 'hsl(var(--muted-foreground))' }} />
            <span className="text-[10px]" style={{ color: 'hsl(var(--muted-foreground))' }}>
              {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}
            </span>
            <span className="ml-auto text-[10px]" style={{ color: 'hsl(var(--muted-foreground))' }}>
              {timeAgo(location.recorded_at)}
            </span>
          </div>
        )}
      </div>

      {/* Shift details */}
      {shift ? (
        <div className="rounded-lg p-3 space-y-2" style={{ backgroundColor: 'hsl(var(--secondary))' }}>
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Current Shift
            </p>
            <span
              className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
              style={{
                backgroundColor: `${SHIFT_STATUS_COLOR[shift.status] ?? '#94a3b8'}20`,
                color: SHIFT_STATUS_COLOR[shift.status] ?? '#94a3b8',
              }}
            >
              {shift.status} · {SHIFT_TYPE_LABEL[shift.shift_type] ?? shift.shift_type}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Clock size={12} style={{ color: 'hsl(var(--muted-foreground))' }} />
            <span className="text-xs" style={{ color: 'hsl(var(--foreground))' }}>
              {formatShiftTime(shift.start_time)} – {formatShiftTime(shift.end_time)}
            </span>
            <span className="ml-auto text-xs font-medium" style={{ color: 'hsl(var(--foreground))' }}>
              {calcNetHours(shift)}
            </span>
          </div>
          {shift.break_minutes > 0 && (
            <div className="flex items-center gap-2">
              <Coffee size={12} style={{ color: 'hsl(var(--muted-foreground))' }} />
              <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                {shift.break_minutes}m break
              </span>
            </div>
          )}
          {/* Progress */}
          <div>
            <div className="flex justify-between mb-1">
              <span className="text-[10px]" style={{ color: 'hsl(var(--muted-foreground))' }}>Shift progress</span>
              <span className="text-[10px] font-semibold" style={{ color: 'hsl(var(--foreground))' }}>{shiftProgress}%</span>
            </div>
            <div className="w-full h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'hsl(var(--border))' }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${shiftProgress}%`,
                  backgroundColor: SHIFT_STATUS_COLOR[shift.status] ?? '#94a3b8',
                }}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 size={12} style={{ color: '#22c55e' }} />
            <span className="text-xs" style={{ color: 'hsl(var(--foreground))' }}>
              {shift.deliveries_completed} deliveries completed
            </span>
          </div>
        </div>
      ) : (
        <div className="rounded-lg p-3 text-center" style={{ backgroundColor: 'hsl(var(--secondary))' }}>
          <Calendar size={20} className="mx-auto mb-1" style={{ color: '#94a3b8' }} />
          <p className="text-xs" style={{ color: '#94a3b8' }}>No active shift today</p>
        </div>
      )}

      {/* Active delivery */}
      {activeOrder ? (
        <div className="rounded-lg p-3 space-y-2" style={{ backgroundColor: 'hsl(var(--secondary))' }}>
          <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Active Delivery
          </p>
          <div className="flex items-center gap-2">
            <Route size={12} style={{ color: '#8b5cf6' }} />
            <span className="text-xs font-medium" style={{ color: 'hsl(var(--foreground))' }}>
              {activeOrder.customer_name}
            </span>
          </div>
          <p className="text-[10px]" style={{ color: 'hsl(var(--muted-foreground))' }}>
            {[activeOrder.delivery_address_line1, activeOrder.delivery_address_city, activeOrder.delivery_address_postcode].filter(Boolean).join(', ')}
          </p>
          {activeOrder.delivery_window && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <Timer size={11} style={{ color: '#f97316' }} />
                <span className="text-[10px]" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  {activeOrder.delivery_window}
                </span>
              </div>
              {etaMins !== null && (
                <span
                  className="text-xs font-bold"
                  style={{ color: etaMins < 0 ? '#ef4444' : etaMins < 15 ? '#f97316' : '#22c55e' }}
                >
                  {etaMins < 0 ? `Overdue ${Math.abs(etaMins)}m` : `ETA ${etaMins}m`}
                </span>
              )}
            </div>
          )}
          <p className="text-[10px] font-mono" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Order #{activeOrder.id}
          </p>
        </div>
      ) : (
        <div className="rounded-lg p-3 text-center" style={{ backgroundColor: 'hsl(var(--secondary))' }}>
          <Route size={20} className="mx-auto mb-1" style={{ color: '#94a3b8' }} />
          <p className="text-xs" style={{ color: '#94a3b8' }}>No active delivery</p>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DriverTrackingContent() {
  const supabase = createClient();
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [, setTick] = useState(0);

  // Tick every 30s for relative timestamps
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const today = new Date().toISOString().split('T')[0];

      // Fetch all drivers
      const { data: driverRows, error: dErr } = await supabase
        .from('drivers')
        .select('id, name, phone, vehicle, plate, status, auth_user_id')
        .order('name');

      if (dErr) throw dErr;

      // Fetch latest location per driver (most recent)
      const { data: locationRows } = await supabase
        .from('driver_locations')
        .select('driver_id, latitude, longitude, heading, speed, recorded_at')
        .order('recorded_at', { ascending: false });

      // Fetch today's shifts
      const { data: shiftRows } = await supabase
        .from('driver_shifts')
        .select('id, driver_id, shift_date, start_time, end_time, clock_in, clock_out, break_minutes, shift_type, status, deliveries_completed, vehicle_id, vehicle:vehicles(id, registration, make, model, type, colour)')
        .eq('shift_date', today)
        .in('status', ['active', 'scheduled']);

      // Fetch active orders assigned to drivers
      const { data: orderRows } = await supabase
        .from('orders')
        .select('id, customer_name, status, delivery_address_line1, delivery_address_city, delivery_address_postcode, delivery_window, booking_date, driver_id')
        .in('status', ['Booking Assigned', 'Booking Out For Delivery'])
        .not('driver_id', 'is', null);

      // Build latest location map (first occurrence = most recent due to ordering)
      const locationMap = new Map<string, DriverLocation>();
      (locationRows ?? []).forEach((loc: any) => {
        if (!locationMap.has(loc.driver_id)) {
          locationMap.set(loc.driver_id, loc);
        }
      });

      // Build shift map
      const shiftMap = new Map<string, DriverShift>();
      (shiftRows ?? []).forEach((s: any) => {
        if (!shiftMap.has(s.driver_id)) {
          shiftMap.set(s.driver_id, s);
        }
      });

      // Build active order map
      const orderMap = new Map<string, ActiveOrder>();
      (orderRows ?? []).forEach((o: any) => {
        if (o.driver_id && !orderMap.has(o.driver_id)) {
          orderMap.set(o.driver_id, o);
        }
      });

      const rows: DriverRow[] = (driverRows ?? []).map((d: any) => ({
        driver: d,
        location: locationMap.get(d.id) ?? null,
        shift: shiftMap.get(d.id) ?? null,
        activeOrder: orderMap.get(d.id) ?? null,
      }));

      setDrivers(rows);
      setLastUpdated(new Date());
      if (rows.length > 0 && !selectedDriverId) {
        setSelectedDriverId(rows[0].driver.id);
      }
    } catch (err) {
      console.error('Driver tracking fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [supabase, selectedDriverId]);

  useEffect(() => {
    fetchData();
  }, []);

  // Real-time subscription on driver_locations
  useEffect(() => {
    const channel = supabase
      .channel('driver-tracking-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'driver_locations' },
        () => {
          fetchData();
          setLastUpdated(new Date());
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'driver_shifts' },
        () => fetchData()
      )
      .subscribe((status) => {
        setConnected(status === 'SUBSCRIBED');
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, fetchData]);

  const selectedRow = drivers.find((r) => r.driver.id === selectedDriverId) ?? null;

  // Stats
  const activeDrivers = drivers.filter((r) => r.driver.status === 'On Route').length;
  const availableDrivers = drivers.filter((r) => r.driver.status === 'Available').length;
  const offDutyDrivers = drivers.filter((r) => r.driver.status === 'Off Duty').length;
  const driversWithLocation = drivers.filter((r) => r.location !== null).length;

  return (
    <AppLayout>
      <div className="flex flex-col h-full" style={{ backgroundColor: 'hsl(var(--background))' }}>
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b shrink-0"
          style={{ borderColor: 'hsl(var(--border))' }}
        >
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'hsl(var(--foreground))' }}>
              Driver Tracking
            </h1>
            <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Live driver locations, shift status &amp; route progress
            </p>
          </div>
          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                Updated {timeAgo(lastUpdated.toISOString())}
              </span>
            )}
            <div className="flex items-center gap-1.5">
              {connected ? (
                <Wifi size={14} style={{ color: '#22c55e' }} />
              ) : (
                <WifiOff size={14} style={{ color: '#ef4444' }} />
              )}
              <span
                className="text-xs font-medium"
                style={{ color: connected ? '#22c55e' : '#ef4444' }}
              >
                {connected ? 'Live' : 'Offline'}
              </span>
            </div>
            <button
              onClick={fetchData}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all hover:opacity-80"
              style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
            >
              <RefreshCw size={12} />
              Refresh
            </button>
          </div>
        </div>

        {/* Stats bar */}
        <div
          className="flex items-center gap-6 px-6 py-3 border-b shrink-0"
          style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--card))' }}
        >
          {[
            { label: 'Total Drivers', value: drivers.length, color: 'hsl(var(--foreground))' },
            { label: 'On Route', value: activeDrivers, color: '#f97316' },
            { label: 'Available', value: availableDrivers, color: '#22c55e' },
            { label: 'Off Duty', value: offDutyDrivers, color: '#94a3b8' },
            { label: 'GPS Active', value: driversWithLocation, color: '#3b82f6' },
          ].map((stat) => (
            <div key={stat.label} className="flex items-center gap-2">
              <span className="text-lg font-bold" style={{ color: stat.color }}>{stat.value}</span>
              <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>{stat.label}</span>
            </div>
          ))}
        </div>

        {/* Main content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Driver list */}
          <div
            className="w-72 shrink-0 flex flex-col border-r overflow-hidden"
            style={{ borderColor: 'hsl(var(--border))' }}
          >
            <div
              className="px-3 py-2 border-b text-xs font-semibold uppercase tracking-wider"
              style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}
            >
              Drivers ({drivers.length})
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {loading ? (
                <div className="flex items-center justify-center h-32">
                  <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'hsl(var(--primary))' }} />
                </div>
              ) : drivers.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 gap-2">
                  <User size={24} style={{ color: '#94a3b8' }} />
                  <p className="text-xs" style={{ color: '#94a3b8' }}>No drivers found</p>
                </div>
              ) : (
                drivers.map((row) => (
                  <DriverCard
                    key={row.driver.id}
                    row={row}
                    isSelected={selectedDriverId === row.driver.id}
                    onClick={() => setSelectedDriverId(row.driver.id)}
                  />
                ))
              )}
            </div>
          </div>

          {/* Map */}
          <div className="flex-1 relative overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'hsl(var(--primary))' }} />
              </div>
            ) : (
              <TrackingMap
                drivers={drivers}
                selectedDriverId={selectedDriverId}
                onSelectDriver={setSelectedDriverId}
              />
            )}
          </div>

          {/* Detail panel */}
          {selectedRow && (
            <div
              className="w-72 shrink-0 border-l overflow-y-auto"
              style={{ borderColor: 'hsl(var(--border))' }}
            >
              <div
                className="px-3 py-2 border-b text-xs font-semibold uppercase tracking-wider sticky top-0 z-10"
                style={{
                  borderColor: 'hsl(var(--border))',
                  color: 'hsl(var(--muted-foreground))',
                  backgroundColor: 'hsl(var(--card))',
                }}
              >
                Driver Details
              </div>
              <DriverDetailPanel row={selectedRow} />
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
