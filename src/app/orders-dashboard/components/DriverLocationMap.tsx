'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { MapPin, Navigation, Clock, Wifi, WifiOff, Maximize2, Minimize2, Package, ChevronDown, ChevronUp, X } from 'lucide-react';

interface OrderInfo {
  id: string;
  status: string;
  customer_name: string;
  delivery_address_line1: string | null;
  delivery_address_line2: string | null;
  delivery_address_city: string | null;
  delivery_address_postcode: string | null;
  booking_date: string | null;
  delivery_window: string | null;
}

interface DriverLocation {
  id: string;
  driver_id: string;
  order_id: string | null;
  latitude: number;
  longitude: number;
  heading: number | null;
  speed: number | null;
  recorded_at: string;
  driver?: {
    name: string;
    vehicle: string;
    plate: string;
    status: string;
    avatar: string;
  };
  order?: OrderInfo | null;
}

const STATUS_COLOR: Record<string, string> = {
  'On Route': '#f97316',
  Available: '#22c55e',
  'Off Duty': '#94a3b8',
};

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

/** Parse "HH:MM - HH:MM" window and return the end time as a Date on the given booking date */
function parseWindowEnd(bookingDate: string | null, deliveryWindow: string | null): Date | null {
  if (!bookingDate || !deliveryWindow) return null;
  // e.g. "09:00 - 11:00" or "14:00-16:00"
  const match = deliveryWindow.match(/(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/);
  if (!match) return null;
  const endTime = match[2]; // "11:00"
  const [hours, minutes] = endTime.split(':').map(Number);
  const d = new Date(bookingDate);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

function formatCountdown(targetDate: Date): { label: string; overdue: boolean } {
  const diffMs = targetDate.getTime() - Date.now();
  const overdue = diffMs < 0;
  const abs = Math.abs(diffMs);
  const totalMins = Math.floor(abs / 60000);
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hrs > 0) {
    return { label: `${overdue ? '-' : ''}${hrs}h ${mins}m`, overdue };
  }
  return { label: `${overdue ? '-' : ''}${mins}m`, overdue };
}

function formatAddress(order: OrderInfo): string {
  return [
    order.delivery_address_line1,
    order.delivery_address_line2,
    order.delivery_address_city,
    order.delivery_address_postcode,
  ]
    .filter(Boolean)
    .join(', ');
}

/** ETA countdown component that ticks every second */
function ETACountdown({ bookingDate, deliveryWindow }: { bookingDate: string | null; deliveryWindow: string | null }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const target = parseWindowEnd(bookingDate, deliveryWindow);
  if (!target) return <span style={{ color: 'hsl(var(--muted-foreground))' }}>No ETA</span>;

  const { label, overdue } = formatCountdown(target);
  return (
    <span
      className="font-mono font-semibold text-[10px]"
      style={{ color: overdue ? '#ef4444' : '#f97316' }}
    >
      {overdue ? `Overdue ${label}` : `ETA ${label}`}
    </span>
  );
}

export default function DriverLocationMap() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const driverMarkersRef = useRef<Map<string, any>>(new Map());
  const destMarkersRef = useRef<Map<string, any>>(new Map()); // destination pins keyed by order_id
  const [locations, setLocations] = useState<DriverLocation[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<DriverLocation | null>(null);
  const [isLive, setIsLive] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  // Mobile: sidebar shown as bottom sheet
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const supabase = createClient();

  const fetchLocations = useCallback(async () => {
    const { data, error } = await supabase
      .from('driver_locations')
      .select(`
        *,
        driver:drivers(name, vehicle, plate, status, avatar),
        order:orders(id, status, customer_name, delivery_address_line1, delivery_address_line2, delivery_address_city, delivery_address_postcode, booking_date, delivery_window)
      `)
      .order('recorded_at', { ascending: false });

    if (error || !data) return;

    // Keep only the latest location per driver
    const latestByDriver = new Map<string, DriverLocation>();
    for (const loc of data as DriverLocation[]) {
      if (!latestByDriver.has(loc.driver_id)) {
        latestByDriver.set(loc.driver_id, loc);
      }
    }
    setLocations(Array.from(latestByDriver.values()));
    setLoading(false);
  }, []);

  // Initialize Leaflet map
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
        zoom: 12,
        zoomControl: true,
        attributionControl: true,
        tap: true,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      mapInstanceRef.current = map;
      fetchLocations();
    });

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update driver markers + destination pins when locations change
  useEffect(() => {
    if (!mapInstanceRef.current || locations.length === 0) return;

    import('leaflet').then((leafletModule) => {
      const L = leafletModule.default;
      const map = mapInstanceRef.current;
      const bounds: [number, number][] = [];
      const activeOrderIds = new Set<string>();

      locations.forEach((loc) => {
        const driverStatus = loc.driver?.status ?? 'Off Duty';
        const color = STATUS_COLOR[driverStatus] ?? '#94a3b8';
        const initials = (loc.driver?.avatar || loc.driver?.name?.slice(0, 2) || '??').toUpperCase();

        // --- Driver marker ---
        const iconHtml = `
          <div style="
            width:36px;height:36px;border-radius:50%;
            background:${color};border:3px solid white;
            box-shadow:0 2px 8px rgba(0,0,0,0.3);
            display:flex;align-items:center;justify-content:center;
            font-size:11px;font-weight:700;color:white;
            cursor:pointer;position:relative;
          ">
            ${initials}
            ${driverStatus === 'On Route' ? `<span style="position:absolute;bottom:-2px;right:-2px;width:10px;height:10px;background:#22c55e;border-radius:50%;border:2px solid white;"></span>` : ''}
          </div>
        `;

        const driverIcon = L.divIcon({
          html: iconHtml,
          className: '',
          iconSize: [36, 36],
          iconAnchor: [18, 18],
        });

        const existing = driverMarkersRef.current.get(loc.driver_id);
        if (existing) {
          existing.setLatLng([loc.latitude, loc.longitude]);
          existing.setIcon(driverIcon);
        } else {
          const marker = L.marker([loc.latitude, loc.longitude], { icon: driverIcon })
            .addTo(map)
            .on('click', () => {
              setSelectedDriver(loc);
              setSidebarOpen(true);
            });
          driverMarkersRef.current.set(loc.driver_id, marker);
        }

        bounds.push([loc.latitude, loc.longitude]);

        // --- Destination pin for on-route bookings ---
        if (driverStatus === 'On Route' && loc.order && loc.order_id) {
          activeOrderIds.add(loc.order_id);

          // Geocode via Nominatim using postcode + city as a rough pin
          const address = formatAddress(loc.order);
          if (address && !destMarkersRef.current.has(loc.order_id)) {
            const postcode = loc.order.delivery_address_postcode;
            const city = loc.order.delivery_address_city;
            const query = postcode || city || address;

            fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`)
              .then((r) => r.json())
              .then((results: any[]) => {
                if (!results || results.length === 0) return;
                const { lat, lon } = results[0];
                const destLat = parseFloat(lat);
                const destLon = parseFloat(lon);

                const destIconHtml = `
                  <div style="
                    display:flex;flex-direction:column;align-items:center;
                  ">
                    <div style="
                      width:28px;height:28px;border-radius:50% 50% 50% 0;
                      transform:rotate(-45deg);
                      background:#3b82f6;border:2px solid white;
                      box-shadow:0 2px 6px rgba(0,0,0,0.35);
                      display:flex;align-items:center;justify-content:center;
                    ">
                      <span style="transform:rotate(45deg);font-size:12px;">📦</span>
                    </div>
                  </div>
                `;

                const destIcon = L.divIcon({
                  html: destIconHtml,
                  className: '',
                  iconSize: [28, 34],
                  iconAnchor: [14, 34],
                });

                if (!mapInstanceRef.current) return;
                const destMarker = L.marker([destLat, destLon], { icon: destIcon })
                  .addTo(mapInstanceRef.current)
                  .bindPopup(`
                    <div style="font-size:12px;min-width:160px;">
                      <strong>${loc.order?.customer_name ?? 'Customer'}</strong><br/>
                      <span style="color:#6b7280;">${address}</span><br/>
                      ${loc.order?.delivery_window ? `<span style="color:#f97316;">⏱ ${loc.order.delivery_window}</span>` : ''}
                    </div>
                  `);

                destMarkersRef.current.set(loc.order_id!, destMarker);
              })
              .catch(() => {/* silently ignore geocoding failures */});
          }
        }
      });

      // Remove destination markers for orders no longer active
      destMarkersRef.current.forEach((marker, orderId) => {
        if (!activeOrderIds.has(orderId)) {
          marker.remove();
          destMarkersRef.current.delete(orderId);
        }
      });

      if (bounds.length > 0 && !selectedDriver) {
        try {
          map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
        } catch {}
      }
    });
  }, [locations]);

  // Real-time subscription for driver_locations AND orders
  useEffect(() => {
    if (!isLive) return;

    const channel = supabase
      .channel('driver-map-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_locations' }, () => {
        fetchLocations();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, () => {
        fetchLocations();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [isLive, fetchLocations]);

  const onRouteLocations = locations.filter((l) => l.driver?.status === 'On Route');
  const onRouteCount = onRouteLocations.length;
  const availableCount = locations.filter((l) => l.driver?.status === 'Available').length;

  // Driver list card — shared between sidebar and bottom sheet
  const DriverCard = ({ loc }: { loc: DriverLocation }) => {
    const isSelected = selectedDriver?.driver_id === loc.driver_id;
    const color = STATUS_COLOR[loc.driver?.status ?? 'Off Duty'] ?? '#94a3b8';
    const isOnRoute = loc.driver?.status === 'On Route';
    const address = loc.order ? formatAddress(loc.order) : null;

    return (
      <button
        key={loc.driver_id}
        onClick={() => {
          setSelectedDriver(isSelected ? null : loc);
          if (!isSelected && mapInstanceRef.current) {
            mapInstanceRef.current.setView([loc.latitude, loc.longitude], 15);
          }
          // Close bottom sheet on mobile after selecting
          if (window.innerWidth < 768) setSidebarOpen(false);
        }}
        className="w-full text-left p-3 rounded-lg border transition-all touch-manipulation"
        style={{
          borderColor: isSelected ? 'hsl(var(--primary))' : 'hsl(var(--border))',
          backgroundColor: isSelected ? 'hsl(var(--primary) / 0.05)' : 'transparent',
          minHeight: '44px',
        }}
      >
        <div className="flex items-center gap-2 mb-1">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
            style={{ backgroundColor: color, color: 'white' }}
          >
            {(loc.driver?.avatar || loc.driver?.name?.slice(0, 2) || '??').toUpperCase()}
          </div>
          <span className="text-xs font-medium truncate" style={{ color: 'hsl(var(--foreground))' }}>
            {loc.driver?.name ?? 'Unknown'}
          </span>
          <span
            className="ml-auto text-[9px] font-semibold px-1.5 py-0.5 rounded-full shrink-0"
            style={{ backgroundColor: `${color}20`, color }}
          >
            {loc.driver?.status ?? 'Unknown'}
          </span>
        </div>
        <div className="pl-9 space-y-0.5">
          <p className="text-[10px] truncate" style={{ color: 'hsl(var(--muted-foreground))' }}>
            {loc.driver?.vehicle} · {loc.driver?.plate}
          </p>
          {isOnRoute && address && (
            <div className="flex items-start gap-0.5">
              <Package size={8} className="mt-0.5 shrink-0" style={{ color: '#3b82f6' }} />
              <p className="text-[9px] leading-tight" style={{ color: 'hsl(var(--muted-foreground))' }}>
                {address}
              </p>
            </div>
          )}
          {isOnRoute && loc.order && (
            <div className="flex items-center gap-0.5">
              <Clock size={8} style={{ color: '#f97316' }} />
              <ETACountdown
                bookingDate={loc.order.booking_date}
                deliveryWindow={loc.order.delivery_window}
              />
            </div>
          )}
          {loc.order && (
            <p className="text-[9px] truncate" style={{ color: 'hsl(var(--muted-foreground))' }}>
              👤 {loc.order.customer_name}
            </p>
          )}
          <p className="flex items-center gap-0.5 text-[9px]" style={{ color: 'hsl(var(--muted-foreground))' }}>
            <Clock size={8} />
            {timeAgo(loc.recorded_at)}
          </p>
        </div>
      </button>
    );
  };

  return (
    <div
      className={`card overflow-hidden flex flex-col transition-all duration-300 ${expanded ? 'fixed inset-2 md:inset-4 z-50' : ''}`}
      style={{ height: expanded ? 'auto' : undefined }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 md:px-4 py-3 border-b shrink-0"
        style={{ borderColor: 'hsl(var(--border))' }}
      >
        <div className="flex items-center gap-2">
          <Navigation size={16} style={{ color: 'hsl(var(--primary))' }} />
          <h3 className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
            Live Driver Tracking
          </h3>
          <span
            className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full"
            style={{
              backgroundColor: isLive ? 'hsl(142 69% 35% / 0.1)' : 'hsl(var(--secondary))',
              color: isLive ? 'hsl(142 69% 35%)' : 'hsl(var(--muted-foreground))',
            }}
          >
            {isLive ? <Wifi size={9} /> : <WifiOff size={9} />}
            {isLive ? 'Live' : 'Paused'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-3 text-[11px]" style={{ color: 'hsl(var(--muted-foreground))' }}>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full inline-block" style={{ background: '#f97316' }} />
              {onRouteCount} on route
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full inline-block" style={{ background: '#22c55e' }} />
              {availableCount} available
            </span>
          </div>

          {/* Mobile: show driver count + toggle bottom sheet */}
          <button
            className="sm:hidden flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-md border touch-manipulation"
            style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
            onClick={() => setSidebarOpen((v) => !v)}
          >
            <MapPin size={12} />
            {locations.length} drivers
            {sidebarOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>

          <button
            onClick={() => setIsLive((v) => !v)}
            className="text-[11px] px-2.5 py-1.5 rounded-md border transition-colors touch-manipulation"
            style={{
              borderColor: 'hsl(var(--border))',
              color: 'hsl(var(--muted-foreground))',
              backgroundColor: 'transparent',
              minHeight: '32px',
            }}
          >
            {isLive ? 'Pause' : 'Resume'}
          </button>

          <button
            onClick={() => setExpanded((v) => !v)}
            className="p-2 rounded-md transition-colors hover:bg-secondary touch-manipulation"
            title={expanded ? 'Collapse map' : 'Expand map'}
            style={{ minHeight: '32px', minWidth: '32px' }}
          >
            {expanded ? (
              <Minimize2 size={14} style={{ color: 'hsl(var(--muted-foreground))' }} />
            ) : (
              <Maximize2 size={14} style={{ color: 'hsl(var(--muted-foreground))' }} />
            )}
          </button>
        </div>
      </div>

      {/* Map + Desktop Sidebar */}
      <div className="flex flex-1 min-h-0 overflow-hidden" style={{ height: expanded ? 'calc(100vh - 200px)' : '420px' }}>
        {/* Map */}
        <div className="relative flex-1 min-w-0">
          <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
          <div ref={mapRef} className="w-full h-full" style={{ minHeight: '300px' }} />

          {loading && (
            <div
              className="absolute inset-0 flex items-center justify-center"
              style={{ backgroundColor: 'hsl(var(--card) / 0.8)' }}
            >
              <div className="flex flex-col items-center gap-2">
                <div
                  className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
                  style={{ borderColor: 'hsl(var(--primary))' }}
                />
                <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  Loading map…
                </span>
              </div>
            </div>
          )}

          {/* Map legend */}
          {!loading && (
            <div
              className="absolute bottom-3 left-3 flex flex-col gap-1 text-[10px] px-2.5 py-2 rounded-lg"
              style={{ backgroundColor: 'hsl(var(--card) / 0.92)', border: '1px solid hsl(var(--border))' }}
            >
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white" style={{ background: '#f97316' }}>D</div>
                <span style={{ color: 'hsl(var(--foreground))' }}>Driver</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-4 rounded-full flex items-center justify-center" style={{ background: '#3b82f6' }}>📦</div>
                <span style={{ color: 'hsl(var(--foreground))' }}>Destination</span>
              </div>
            </div>
          )}
        </div>

        {/* Desktop sidebar — hidden on mobile (md:block) */}
        <div
          className="hidden md:block w-56 shrink-0 border-l overflow-y-auto"
          style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--card))' }}
        >
          {loading ? (
            <div className="p-3 space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 rounded-lg animate-pulse" style={{ backgroundColor: 'hsl(var(--secondary))' }} />
              ))}
            </div>
          ) : locations.length === 0 ? (
            <div className="p-4 text-center">
              <MapPin size={24} className="mx-auto mb-2" style={{ color: 'hsl(var(--muted-foreground))' }} />
              <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>No active drivers</p>
            </div>
          ) : (
            <div className="p-2 space-y-1.5">
              {locations.map((loc) => (
                <DriverCard key={loc.driver_id} loc={loc} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Mobile bottom sheet driver list */}
      {sidebarOpen && (
        <div
          className="md:hidden border-t"
          style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--card))' }}
        >
          {/* Bottom sheet handle + header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b" style={{ borderColor: 'hsl(var(--border))' }}>
            <span className="text-xs font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
              Active Drivers ({locations.length})
            </span>
            <button
              className="p-1.5 rounded-md touch-manipulation"
              onClick={() => setSidebarOpen(false)}
              style={{ minHeight: '32px', minWidth: '32px' }}
            >
              <X size={14} style={{ color: 'hsl(var(--muted-foreground))' }} />
            </button>
          </div>
          <div className="p-3 grid grid-cols-1 gap-2 max-h-64 overflow-y-auto">
            {loading ? (
              [1, 2].map((i) => (
                <div key={i} className="h-20 rounded-lg animate-pulse" style={{ backgroundColor: 'hsl(var(--secondary))' }} />
              ))
            ) : locations.length === 0 ? (
              <div className="py-6 text-center">
                <MapPin size={24} className="mx-auto mb-2" style={{ color: 'hsl(var(--muted-foreground))' }} />
                <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>No active drivers</p>
              </div>
            ) : (
              locations.map((loc) => <DriverCard key={loc.driver_id} loc={loc} />)
            )}
          </div>
        </div>
      )}

      {/* ETA summary bar */}
      {!loading && onRouteLocations.length > 0 && (
        <div
          className="shrink-0 border-t px-3 md:px-4 py-2 overflow-x-auto"
          style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--primary) / 0.03)' }}
        >
          <div className="flex items-center gap-1 mb-1">
            <Clock size={11} style={{ color: '#f97316' }} />
            <span className="text-[10px] font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
              On-Route ETA
            </span>
          </div>
          <div className="flex gap-2 flex-wrap">
            {onRouteLocations.map((loc) => (
              <div
                key={loc.driver_id}
                className="flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-md border"
                style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--card))' }}
              >
                <div
                  className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white shrink-0"
                  style={{ background: '#f97316' }}
                >
                  {(loc.driver?.avatar || loc.driver?.name?.slice(0, 2) || '?').toUpperCase()}
                </div>
                <span className="font-medium" style={{ color: 'hsl(var(--foreground))' }}>
                  {loc.driver?.name?.split(' ')[0] ?? 'Driver'}
                </span>
                <span style={{ color: 'hsl(var(--muted-foreground))' }}>→</span>
                {loc.order ? (
                  <ETACountdown bookingDate={loc.order.booking_date} deliveryWindow={loc.order.delivery_window} />
                ) : (
                  <span style={{ color: 'hsl(var(--muted-foreground))' }}>No booking</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Selected driver detail bar */}
      {selectedDriver && (
        <div
          className="shrink-0 border-t px-3 md:px-4 py-2.5 flex flex-wrap items-center gap-3 text-xs"
          style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--primary) / 0.04)' }}
        >
          <Navigation size={13} style={{ color: 'hsl(var(--primary))' }} />
          <span className="font-medium" style={{ color: 'hsl(var(--foreground))' }}>
            {selectedDriver.driver?.name}
          </span>
          {selectedDriver.speed != null && (
            <span style={{ color: 'hsl(var(--muted-foreground))' }}>
              {Math.round(selectedDriver.speed)} km/h
            </span>
          )}
          {selectedDriver.heading != null && (
            <span className="hidden sm:inline" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Heading {Math.round(selectedDriver.heading)}°
            </span>
          )}
          {selectedDriver.order && selectedDriver.driver?.status === 'On Route' && (
            <span className="flex items-center gap-1 truncate max-w-[200px]" style={{ color: 'hsl(var(--muted-foreground))' }}>
              <Package size={11} />
              {formatAddress(selectedDriver.order)}
            </span>
          )}
          {selectedDriver.order && selectedDriver.driver?.status === 'On Route' && (
            <span className="flex items-center gap-1">
              <Clock size={11} style={{ color: '#f97316' }} />
              <ETACountdown
                bookingDate={selectedDriver.order.booking_date}
                deliveryWindow={selectedDriver.order.delivery_window}
              />
            </span>
          )}
          <button
            onClick={() => setSelectedDriver(null)}
            className="ml-auto p-1.5 rounded-md touch-manipulation"
            style={{ color: 'hsl(var(--muted-foreground))', minHeight: '32px', minWidth: '32px' }}
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
