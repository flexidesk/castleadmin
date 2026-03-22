'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import AppLayout from '@/components/AppLayout';
import { MapPin, Navigation, Clock, Wifi, WifiOff, Package, RefreshCw, Truck, CheckCircle2, XCircle, Search, Filter,  } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BookingRow {
  id: string;
  customer_name: string;
  status: string;
  booking_type: string;
  booking_date: string;
  delivery_window: string | null;
  delivery_address_line1: string | null;
  delivery_address_line2: string | null;
  delivery_address_city: string | null;
  delivery_address_postcode: string | null;
  driver_id: string | null;
  driver?: {
    name: string;
    vehicle: string;
    plate: string;
    status: string;
  } | null;
  driverLocation?: {
    latitude: number;
    longitude: number;
    heading: number | null;
    recorded_at: string;
  } | null;
}

interface DriverLocation {
  driver_id: string;
  latitude: number;
  longitude: number;
  heading: number | null;
  recorded_at: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, string> = {
  'Booking Accepted':         '#f59e0b',
  'Booking Assigned':         '#3b82f6',
  'Booking Out For Delivery': '#8b5cf6',
  'Booking Complete':         '#22c55e',
  'Booking Cancelled':        '#ef4444',
};

const STATUS_ICON: Record<string, React.ElementType> = {
  'Booking Accepted':         Clock,
  'Booking Assigned':         Truck,
  'Booking Out For Delivery': Navigation,
  'Booking Complete':         CheckCircle2,
  'Booking Cancelled':        XCircle,
};

const DRIVER_STATUS_COLOR: Record<string, string> = {
  'On Route':  '#f97316',
  'Available': '#22c55e',
  'Off Duty':  '#94a3b8',
};

const ACTIVE_STATUSES = [
  'Booking Accepted',
  'Booking Assigned',
  'Booking Out For Delivery',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function formatAddress(booking: BookingRow): string {
  return [
    booking.delivery_address_line1,
    booking.delivery_address_line2,
    booking.delivery_address_city,
    booking.delivery_address_postcode,
  ]
    .filter(Boolean)
    .join(', ');
}

function parseWindowEnd(bookingDate: string, deliveryWindow: string | null): Date | null {
  if (!deliveryWindow) return null;
  const match = deliveryWindow.match(/(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/);
  if (!match) return null;
  const [h, m] = match[2].split(':').map(Number);
  const d = new Date(bookingDate);
  d.setHours(h, m, 0, 0);
  return d;
}

// ─── ETA Countdown ────────────────────────────────────────────────────────────

function ETABadge({ bookingDate, deliveryWindow }: { bookingDate: string; deliveryWindow: string | null }) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const target = parseWindowEnd(bookingDate, deliveryWindow);
  if (!target) return <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>{deliveryWindow ?? '—'}</span>;

  const diffMs = target.getTime() - Date.now();
  const overdue = diffMs < 0;
  const abs = Math.abs(diffMs);
  const totalMins = Math.floor(abs / 60000);
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  const label = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;

  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>{deliveryWindow}</span>
      <span
        className="text-[10px] font-mono font-semibold"
        style={{ color: overdue ? '#ef4444' : '#f97316' }}
      >
        {overdue ? `Overdue ${label}` : `ETA ${label}`}
      </span>
    </div>
  );
}

// ─── Map Component ────────────────────────────────────────────────────────────

interface LiveMapProps {
  bookings: BookingRow[];
  selectedBookingId: string | null;
  onSelectBooking: (id: string) => void;
}

function LiveMap({ bookings, selectedBookingId, onSelectBooking }: LiveMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const driverMarkersRef = useRef<Map<string, any>>(new Map());
  const destMarkersRef = useRef<Map<string, any>>(new Map());
  const geocodedRef = useRef<Set<string>>(new Set());

  // Init map
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
        attributionControl: true,
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
        driverMarkersRef.current.clear();
        destMarkersRef.current.clear();
        geocodedRef.current.clear();
      }
    };
  }, []);

  // Update markers when bookings change
  useEffect(() => {
    if (!mapInstanceRef.current || bookings.length === 0) return;

    import('leaflet').then((leafletModule) => {
      const L = leafletModule.default;
      const map = mapInstanceRef.current;
      const bounds: [number, number][] = [];
      const activeDriverIds = new Set<string>();
      const activeBookingIds = new Set<string>();

      bookings.forEach((booking) => {
        const loc = booking.driverLocation;
        if (!loc || !booking.driver_id) return;

        activeDriverIds.add(booking.driver_id);
        activeBookingIds.add(booking.id);

        const driverStatus = booking.driver?.status ?? 'Off Duty';
        const color = DRIVER_STATUS_COLOR[driverStatus] ?? '#94a3b8';
        const initials = (booking.driver?.name?.slice(0, 2) ?? '??').toUpperCase();
        const isSelected = booking.id === selectedBookingId;

        // Driver marker
        const iconHtml = `
          <div style="
            width:${isSelected ? 42 : 36}px;height:${isSelected ? 42 : 36}px;
            border-radius:50%;background:${color};
            border:${isSelected ? '4px' : '3px'} solid ${isSelected ? '#8b5cf6' : 'white'};
            box-shadow:0 2px 8px rgba(0,0,0,0.3);
            display:flex;align-items:center;justify-content:center;
            font-size:11px;font-weight:700;color:white;cursor:pointer;
          ">${initials}</div>
        `;

        const driverIcon = L.divIcon({
          html: iconHtml,
          className: '',
          iconSize: [isSelected ? 42 : 36, isSelected ? 42 : 36],
          iconAnchor: [isSelected ? 21 : 18, isSelected ? 21 : 18],
        });

        const existing = driverMarkersRef.current.get(booking.driver_id);
        if (existing) {
          existing.setLatLng([loc.latitude, loc.longitude]);
          existing.setIcon(driverIcon);
        } else {
          const marker = L.marker([loc.latitude, loc.longitude], { icon: driverIcon })
            .addTo(map)
            .bindPopup(`
              <div style="font-size:12px;min-width:160px;">
                <strong>${booking.driver?.name ?? 'Driver'}</strong><br/>
                <span style="color:#6b7280;">${booking.driver?.vehicle ?? ''} · ${booking.driver?.plate ?? ''}</span><br/>
                <span style="color:${color};">● ${driverStatus}</span><br/>
                <span style="color:#374151;">📦 ${booking.customer_name}</span>
              </div>
            `)
            .on('click', () => onSelectBooking(booking.id));
          driverMarkersRef.current.set(booking.driver_id, marker);
        }

        bounds.push([loc.latitude, loc.longitude]);

        // Destination pin — geocode once per booking
        const address = formatAddress(booking);
        if (address && !geocodedRef.current.has(booking.id)) {
          geocodedRef.current.add(booking.id);
          const query = booking.delivery_address_postcode || booking.delivery_address_city || address;

          fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`, {
            headers: { 'User-Agent': 'CastleAdminTracking/1.0' },
          })
            .then((r) => r.json())
            .then((results: any[]) => {
              if (!results?.length || !mapInstanceRef.current) return;
              const destLat = parseFloat(results[0].lat);
              const destLon = parseFloat(results[0].lon);

              const destIcon = L.divIcon({
                html: `<div style="width:28px;height:28px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#3b82f6;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;"><span style="transform:rotate(45deg);font-size:12px;">📦</span></div>`,
                className: '',
                iconSize: [28, 34],
                iconAnchor: [14, 34],
              });

              const destMarker = L.marker([destLat, destLon], { icon: destIcon })
                .addTo(mapInstanceRef.current)
                .bindPopup(`
                  <div style="font-size:12px;min-width:160px;">
                    <strong>${booking.customer_name}</strong><br/>
                    <span style="color:#6b7280;">${address}</span><br/>
                    ${booking.delivery_window ? `<span style="color:#f97316;">⏱ ${booking.delivery_window}</span>` : ''}
                  </div>
                `);

              destMarkersRef.current.set(booking.id, destMarker);

              // Draw dashed line from driver to destination
              if (loc) {
                L.polyline([[loc.latitude, loc.longitude], [destLat, destLon]], {
                  color: '#8b5cf6', weight: 2, dashArray: '6 6', opacity: 0.6,
                }).addTo(mapInstanceRef.current);
              }
            })
            .catch(() => {});
        }
      });

      // Remove stale markers
      driverMarkersRef.current.forEach((marker, driverId) => {
        if (!activeDriverIds.has(driverId)) {
          marker.remove();
          driverMarkersRef.current.delete(driverId);
        }
      });
      destMarkersRef.current.forEach((marker, bookingId) => {
        if (!activeBookingIds.has(bookingId)) {
          marker.remove();
          destMarkersRef.current.delete(bookingId);
        }
      });

      if (bounds.length > 0) {
        try {
          map.fitBounds(bounds, { padding: [60, 60], maxZoom: 14 });
        } catch {}
      }
    });
  }, [bookings, selectedBookingId, onSelectBooking]);

  return (
    <>
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <div ref={mapRef} className="w-full h-full" style={{ minHeight: '400px' }} />
    </>
  );
}

// ─── Booking Row Card ─────────────────────────────────────────────────────────

function BookingCard({
  booking,
  isSelected,
  onClick,
}: {
  booking: BookingRow;
  isSelected: boolean;
  onClick: () => void;
}) {
  const StatusIcon = STATUS_ICON[booking.status] ?? Package;
  const statusColor = STATUS_COLOR[booking.status] ?? '#94a3b8';
  const driverColor = DRIVER_STATUS_COLOR[booking.driver?.status ?? 'Off Duty'] ?? '#94a3b8';
  const hasLocation = !!booking.driverLocation;

  return (
    <button
      onClick={onClick}
      className="w-full text-left p-3 rounded-lg border transition-all"
      style={{
        borderColor: isSelected ? 'hsl(var(--primary))' : 'hsl(var(--border))',
        backgroundColor: isSelected ? 'hsl(var(--primary) / 0.05)' : 'hsl(var(--card))',
      }}
    >
      {/* Top row */}
      <div className="flex items-center gap-2 mb-1.5">
        <StatusIcon size={13} style={{ color: statusColor, flexShrink: 0 }} />
        <span className="text-xs font-semibold truncate" style={{ color: 'hsl(var(--foreground))' }}>
          {booking.id}
        </span>
        <span
          className="ml-auto text-[9px] font-semibold px-1.5 py-0.5 rounded-full shrink-0"
          style={{ backgroundColor: `${statusColor}20`, color: statusColor }}
        >
          {booking.status.replace('Booking ', '')}
        </span>
      </div>

      {/* Customer */}
      <p className="text-xs truncate mb-1" style={{ color: 'hsl(var(--foreground))' }}>
        👤 {booking.customer_name}
      </p>

      {/* Address */}
      {formatAddress(booking) && (
        <p className="text-[10px] truncate mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
          📍 {formatAddress(booking)}
        </p>
      )}

      {/* Driver */}
      {booking.driver ? (
        <div className="flex items-center gap-1.5 mt-1">
          <div
            className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold shrink-0"
            style={{ backgroundColor: driverColor, color: 'white' }}
          >
            {booking.driver.name.slice(0, 1).toUpperCase()}
          </div>
          <span className="text-[10px] truncate" style={{ color: 'hsl(var(--muted-foreground))' }}>
            {booking.driver.name} · {booking.driver.plate}
          </span>
          <span
            className="ml-auto text-[9px] font-semibold px-1 py-0.5 rounded-full shrink-0"
            style={{ backgroundColor: `${driverColor}20`, color: driverColor }}
          >
            {booking.driver.status}
          </span>
        </div>
      ) : (
        <p className="text-[10px] mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
          No driver assigned
        </p>
      )}

      {/* ETA + live indicator */}
      <div className="flex items-center justify-between mt-1.5">
        {booking.delivery_window ? (
          <ETABadge bookingDate={booking.booking_date} deliveryWindow={booking.delivery_window} />
        ) : (
          <span />
        )}
        {hasLocation && (
          <span className="flex items-center gap-0.5 text-[9px]" style={{ color: '#22c55e' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" />
            Live
          </span>
        )}
      </div>

      {/* Location freshness */}
      {booking.driverLocation && (
        <p className="text-[9px] mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
          Updated {timeAgo(booking.driverLocation.recorded_at)}
        </p>
      )}
    </button>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

const STATUS_FILTER_OPTIONS = [
  { label: 'Active', value: 'active' },
  { label: 'All', value: 'all' },
  { label: 'Accepted', value: 'Booking Accepted' },
  { label: 'Assigned', value: 'Booking Assigned' },
  { label: 'Out for Delivery', value: 'Booking Out For Delivery' },
  { label: 'Complete', value: 'Booking Complete' },
  { label: 'Cancelled', value: 'Booking Cancelled' },
];

export default function AdminLiveTrackingContent() {
  const supabase = createClient();

  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLive, setIsLive] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [showFilterMenu, setShowFilterMenu] = useState(false);

  // ── Fetch all bookings + driver locations ──────────────────────────────────
  const fetchBookings = useCallback(async () => {
    // 1. Fetch bookings with driver info
    const { data: ordersData, error: ordersErr } = await supabase
      .from('orders')
      .select(`
        id, customer_name, status, booking_type, booking_date, delivery_window,
        delivery_address_line1, delivery_address_line2, delivery_address_city, delivery_address_postcode,
        driver_id,
        driver:drivers(name, vehicle, plate, status)
      `)
      .order('booking_date', { ascending: false })
      .limit(200);

    if (ordersErr || !ordersData) {
      setLoading(false);
      return;
    }

    // 2. Fetch latest driver locations
    const { data: locData } = await supabase
      .from('driver_locations')
      .select('driver_id, latitude, longitude, heading, recorded_at')
      .order('recorded_at', { ascending: false });

    // Build a map of latest location per driver
    const latestLocByDriver = new Map<string, DriverLocation>();
    if (locData) {
      for (const loc of locData as DriverLocation[]) {
        if (!latestLocByDriver.has(loc.driver_id)) {
          latestLocByDriver.set(loc.driver_id, loc);
        }
      }
    }

    // Merge location into bookings
    const merged: BookingRow[] = (ordersData as any[]).map((order) => ({
      ...order,
      driver: Array.isArray(order.driver) ? order.driver[0] ?? null : order.driver ?? null,
      driverLocation: order.driver_id ? latestLocByDriver.get(order.driver_id) ?? null : null,
    }));

    setBookings(merged);
    setLastRefresh(new Date());
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  // ── Real-time subscription ─────────────────────────────────────────────────
  useEffect(() => {
    if (!isLive) return;

    const channel = supabase
      .channel('admin-live-tracking-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_locations' }, () => {
        fetchBookings();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        fetchBookings();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [isLive, fetchBookings, supabase]);

  // ── Filtered bookings ──────────────────────────────────────────────────────
  const filteredBookings = bookings.filter((b) => {
    const matchesStatus =
      statusFilter === 'all'
        ? true
        : statusFilter === 'active'
        ? ACTIVE_STATUSES.includes(b.status)
        : b.status === statusFilter;

    const q = search.toLowerCase();
    const matchesSearch =
      !q ||
      b.id.toLowerCase().includes(q) ||
      b.customer_name.toLowerCase().includes(q) ||
      (b.driver?.name ?? '').toLowerCase().includes(q) ||
      (b.delivery_address_postcode ?? '').toLowerCase().includes(q);

    return matchesStatus && matchesSearch;
  });

  // Bookings with live location (for map)
  const bookingsWithLocation = filteredBookings.filter((b) => b.driverLocation);

  // Stats
  const activeCount = bookings.filter((b) => ACTIVE_STATUSES.includes(b.status)).length;
  const liveCount = bookings.filter((b) => b.driverLocation && ACTIVE_STATUSES.includes(b.status)).length;
  const outForDeliveryCount = bookings.filter((b) => b.status === 'Booking Out For Delivery').length;

  const selectedBooking = bookings.find((b) => b.id === selectedBookingId) ?? null;

  return (
    <AppLayout>
      <div className="flex flex-col h-full" style={{ backgroundColor: 'hsl(var(--background))' }}>
        {/* Page Header */}
        <div
          className="flex items-center justify-between px-4 md:px-6 py-4 border-b shrink-0"
          style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: 'hsl(var(--primary))' }}
            >
              <Navigation size={18} color="white" />
            </div>
            <div>
              <h1 className="font-bold text-base" style={{ color: 'hsl(var(--foreground))' }}>
                Live Tracking
              </h1>
              <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                All bookings with real-time driver locations
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Live indicator */}
            <div className="flex items-center gap-1.5">
              {isLive ? (
                <Wifi size={14} style={{ color: '#22c55e' }} />
              ) : (
                <WifiOff size={14} style={{ color: 'hsl(var(--muted-foreground))' }} />
              )}
              <span className="text-xs" style={{ color: isLive ? '#22c55e' : 'hsl(var(--muted-foreground))' }}>
                {isLive ? 'Live' : 'Paused'}
              </span>
              {lastRefresh && (
                <span className="text-xs hidden sm:inline" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  · {timeAgo(lastRefresh.toISOString())}
                </span>
              )}
            </div>

            <button
              onClick={() => setIsLive((v) => !v)}
              className="text-xs px-3 py-1.5 rounded-md border transition-colors"
              style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}
            >
              {isLive ? 'Pause' : 'Resume'}
            </button>

            <button
              onClick={fetchBookings}
              className="p-1.5 rounded-md border transition-colors hover:bg-secondary"
              title="Refresh"
              style={{ borderColor: 'hsl(var(--border))' }}
            >
              <RefreshCw size={14} style={{ color: 'hsl(var(--muted-foreground))' }} />
            </button>
          </div>
        </div>

        {/* KPI Strip */}
        <div
          className="flex items-center gap-4 px-4 md:px-6 py-2.5 border-b shrink-0 overflow-x-auto"
          style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
        >
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#f59e0b' }} />
            <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
              <strong style={{ color: 'hsl(var(--foreground))' }}>{activeCount}</strong> active
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#8b5cf6' }} />
            <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
              <strong style={{ color: 'hsl(var(--foreground))' }}>{outForDeliveryCount}</strong> out for delivery
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: '#22c55e' }} />
            <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
              <strong style={{ color: 'hsl(var(--foreground))' }}>{liveCount}</strong> with live GPS
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
              <strong style={{ color: 'hsl(var(--foreground))' }}>{bookings.length}</strong> total bookings
            </span>
          </div>
        </div>

        {/* Main content: map + list */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left: Booking List */}
          <div
            className="w-full md:w-80 lg:w-96 flex flex-col border-r shrink-0 overflow-hidden"
            style={{ borderColor: 'hsl(var(--border))' }}
          >
            {/* Search + Filter */}
            <div
              className="p-3 border-b space-y-2 shrink-0"
              style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--card))' }}
            >
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'hsl(var(--muted-foreground))' }} />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search bookings, customers, drivers…"
                  className="w-full pl-8 pr-3 py-1.5 rounded-md border text-xs outline-none"
                  style={{
                    backgroundColor: 'hsl(var(--background))',
                    borderColor: 'hsl(var(--border))',
                    color: 'hsl(var(--foreground))',
                  }}
                />
              </div>

              {/* Status filter pills */}
              <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                {STATUS_FILTER_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setStatusFilter(opt.value)}
                    className="shrink-0 text-[10px] font-medium px-2.5 py-1 rounded-full border transition-all"
                    style={{
                      borderColor: statusFilter === opt.value ? 'hsl(var(--primary))' : 'hsl(var(--border))',
                      backgroundColor: statusFilter === opt.value ? 'hsl(var(--primary))' : 'transparent',
                      color: statusFilter === opt.value ? 'white' : 'hsl(var(--muted-foreground))',
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Booking cards */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw size={20} className="animate-spin" style={{ color: 'hsl(var(--muted-foreground))' }} />
                </div>
              ) : filteredBookings.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2">
                  <Package size={32} style={{ color: 'hsl(var(--muted-foreground))' }} />
                  <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>No bookings found</p>
                </div>
              ) : (
                filteredBookings.map((booking) => (
                  <BookingCard
                    key={booking.id}
                    booking={booking}
                    isSelected={selectedBookingId === booking.id}
                    onClick={() => setSelectedBookingId(selectedBookingId === booking.id ? null : booking.id)}
                  />
                ))
              )}
            </div>

            {/* Footer count */}
            <div
              className="px-3 py-2 border-t shrink-0"
              style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--card))' }}
            >
              <p className="text-[10px]" style={{ color: 'hsl(var(--muted-foreground))' }}>
                Showing {filteredBookings.length} of {bookings.length} bookings
              </p>
            </div>
          </div>

          {/* Right: Map */}
          <div className="hidden md:flex flex-1 flex-col relative overflow-hidden">
            {bookingsWithLocation.length === 0 && !loading && (
              <div
                className="absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-none"
                style={{ backgroundColor: 'hsl(var(--background) / 0.7)' }}
              >
                <MapPin size={40} style={{ color: 'hsl(var(--muted-foreground))' }} />
                <p className="text-sm mt-2" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  No live driver locations available
                </p>
                <p className="text-xs mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  Locations appear when drivers are active
                </p>
              </div>
            )}
            <LiveMap
              bookings={bookingsWithLocation}
              selectedBookingId={selectedBookingId}
              onSelectBooking={setSelectedBookingId}
            />

            {/* Selected booking overlay */}
            {selectedBooking && (
              <div
                className="absolute bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-72 rounded-xl border p-3 shadow-lg"
                style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
                    {selectedBooking.id}
                  </span>
                  <button
                    onClick={() => setSelectedBookingId(null)}
                    className="text-xs px-2 py-0.5 rounded"
                    style={{ color: 'hsl(var(--muted-foreground))' }}
                  >
                    ✕
                  </button>
                </div>
                <p className="text-xs mb-1" style={{ color: 'hsl(var(--foreground))' }}>
                  👤 {selectedBooking.customer_name}
                </p>
                {formatAddress(selectedBooking) && (
                  <p className="text-[10px] mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    📍 {formatAddress(selectedBooking)}
                  </p>
                )}
                {selectedBooking.driver && (
                  <p className="text-[10px] mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    🚚 {selectedBooking.driver.name} · {selectedBooking.driver.plate}
                  </p>
                )}
                {selectedBooking.delivery_window && (
                  <ETABadge
                    bookingDate={selectedBooking.booking_date}
                    deliveryWindow={selectedBooking.delivery_window}
                  />
                )}
                {selectedBooking.driverLocation && (
                  <p className="text-[9px] mt-1" style={{ color: '#22c55e' }}>
                    ● Live · Updated {timeAgo(selectedBooking.driverLocation.recorded_at)}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
