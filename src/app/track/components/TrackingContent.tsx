'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Search, Package, Truck, CheckCircle2, XCircle, Clock, MapPin, RefreshCw, AlertCircle, Navigation, Wifi, WifiOff, Mail } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface TrackingOrder {
  id: string;
  customer_name: string;
  customer_email: string;
  status: string;
  booking_type: string;
  booking_date: string;
  delivery_window: string;
  delivery_address_line1: string | null;
  delivery_address_line2: string | null;
  delivery_address_city: string | null;
  delivery_address_postcode: string | null;
  driver_id: string | null;
  tracking_pin: string | null;
  updated_at: string;
}

interface TrackingDriver {
  id: string;
  name: string;
  vehicle: string;
  plate: string;
  status: string;
}

interface TrackingLocation {
  latitude: number;
  longitude: number;
  heading: number | null;
  recorded_at: string;
}

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_STEPS = [
  'Booking Accepted',
  'Booking Assigned',
  'Booking Out For Delivery',
  'Booking Complete',
];

const STATUS_META: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  'Booking Accepted':        { label: 'Order Accepted',      color: '#f59e0b', bg: '#fef3c7', icon: Package },
  'Booking Assigned':        { label: 'Driver Assigned',     color: '#3b82f6', bg: '#dbeafe', icon: Truck },
  'Booking Out For Delivery':{ label: 'Out for Delivery',    color: '#8b5cf6', bg: '#ede9fe', icon: Navigation },
  'Booking Complete':        { label: 'Delivered',           color: '#22c55e', bg: '#dcfce7', icon: CheckCircle2 },
  'Booking Cancelled':       { label: 'Cancelled',           color: '#ef4444', bg: '#fee2e2', icon: XCircle },
};

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

// ─── ETA Countdown ────────────────────────────────────────────────────────────

interface ETACountdownProps {
  bookingDate: string;
  deliveryWindow: string;
  status: string;
}

function ETACountdown({ bookingDate, deliveryWindow, status }: ETACountdownProps) {
  const [timeLeft, setTimeLeft] = useState<string | null>(null);
  const [isPast, setIsPast] = useState(false);

  useEffect(() => {
    if (status === 'Booking Complete' || status === 'Booking Cancelled') return;

    // Parse end of delivery window (e.g. "08:00 - 10:00" → 10:00)
    const windowMatch = deliveryWindow.match(/(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/);
    if (!windowMatch) return;

    const endTime = windowMatch[2]; // e.g. "10:00"
    const [endHour, endMin] = endTime.split(':').map(Number);
    const target = new Date(bookingDate);
    target.setHours(endHour, endMin, 0, 0);

    const tick = () => {
      const now = Date.now();
      const diff = target.getTime() - now;

      if (diff <= 0) {
        setIsPast(true);
        setTimeLeft(null);
        return;
      }

      const totalMins = Math.floor(diff / 60000);
      const hours = Math.floor(totalMins / 60);
      const mins = totalMins % 60;
      const secs = Math.floor((diff % 60000) / 1000);

      if (hours > 0) {
        setTimeLeft(`${hours}h ${mins}m`);
      } else if (totalMins > 0) {
        setTimeLeft(`${mins}m ${secs}s`);
      } else {
        setTimeLeft(`${secs}s`);
      }
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [bookingDate, deliveryWindow, status]);

  if (status === 'Booking Complete') {
    return (
      <span className="text-sm font-semibold" style={{ color: '#16a34a' }}>
        Delivered ✓
      </span>
    );
  }
  if (status === 'Booking Cancelled') {
    return (
      <span className="text-sm font-semibold" style={{ color: '#dc2626' }}>
        Cancelled
      </span>
    );
  }
  if (isPast) {
    return (
      <span className="text-sm font-semibold" style={{ color: 'hsl(var(--muted-foreground))' }}>
        Window passed
      </span>
    );
  }
  if (!timeLeft) {
    return (
      <span className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
        {deliveryWindow}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
        {deliveryWindow}
      </span>
      <span
        className="text-xs px-2 py-0.5 rounded-full font-mono font-bold"
        style={{ backgroundColor: '#fef3c7', color: '#92400e' }}
      >
        {timeLeft} left
      </span>
    </div>
  );
}

// ─── Map component (Leaflet, SSR-safe) ───────────────────────────────────────

interface TrackingMapProps {
  location: TrackingLocation;
  deliveryAddress: string;
}

function TrackingMap({ location, deliveryAddress }: TrackingMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const driverMarkerRef = useRef<any>(null);
  const destMarkerRef = useRef<any>(null);
  const [destCoords, setDestCoords] = useState<[number, number] | null>(null);

  // Geocode delivery address
  useEffect(() => {
    if (!deliveryAddress) return;
    fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(deliveryAddress)}&limit=1`,
      { headers: { 'Accept-Language': 'en', 'User-Agent': 'CastleAdminTracking/1.0' } }
    )
      .then((r) => r.json())
      .then((data) => {
        if (data?.[0]) setDestCoords([parseFloat(data[0].lat), parseFloat(data[0].lon)]);
      })
      .catch(() => {});
  }, [deliveryAddress]);

  // Init map
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;
    import('leaflet').then((L) => {
      // @ts-ignore
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      const map = L.map(mapRef.current!, { zoomControl: true, scrollWheelZoom: false });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
      }).addTo(map);
      mapInstanceRef.current = map;

      // Driver marker
      const driverIcon = L.divIcon({
        html: `<div style="background:#8b5cf6;width:36px;height:36px;border-radius:50%;border:3px solid white;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.3);">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M1 3h15v13H1z" stroke="white" stroke-width="1.5" fill="none"/><path d="M16 8h4l3 3v5h-7V8z" stroke="white" stroke-width="1.5" fill="none"/><circle cx="5.5" cy="18.5" r="2.5" fill="white"/><circle cx="18.5" cy="18.5" r="2.5" fill="white"/></svg>
        </div>`,
        className: '',
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });

      const driverMarker = L.marker([location.latitude, location.longitude], { icon: driverIcon })
        .addTo(map)
        .bindPopup('<b>Your Driver</b>');
      driverMarkerRef.current = driverMarker;

      map.setView([location.latitude, location.longitude], 13);
    });

    return () => {
      mapInstanceRef.current?.remove();
      mapInstanceRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update driver marker position
  useEffect(() => {
    if (!mapInstanceRef.current || !driverMarkerRef.current) return;
    driverMarkerRef.current.setLatLng([location.latitude, location.longitude]);
  }, [location.latitude, location.longitude]);

  // Add destination marker + fit bounds
  useEffect(() => {
    if (!mapInstanceRef.current || !destCoords) return;
    import('leaflet').then((L) => {
      if (destMarkerRef.current) {
        destMarkerRef.current.remove();
      }
      const destIcon = L.divIcon({
        html: `<div style="background:#ef4444;width:32px;height:32px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);"></div>`,
        className: '',
        iconSize: [32, 32],
        iconAnchor: [16, 32],
      });
      const destMarker = L.marker(destCoords, { icon: destIcon })
        .addTo(mapInstanceRef.current)
        .bindPopup('<b>Delivery Address</b>');
      destMarkerRef.current = destMarker;

      // Draw dashed line
      L.polyline([[location.latitude, location.longitude], destCoords], {
        color: '#8b5cf6', weight: 2, dashArray: '6 6', opacity: 0.7,
      }).addTo(mapInstanceRef.current);

      // Fit bounds
      const bounds = L.latLngBounds(
        [location.latitude, location.longitude],
        destCoords
      );
      mapInstanceRef.current.fitBounds(bounds, { padding: [40, 40] });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destCoords]);

  return (
    <>
      <link
        rel="stylesheet"
        href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
        crossOrigin=""
      />
      <div ref={mapRef} style={{ height: '280px', width: '100%', borderRadius: '12px', zIndex: 0 }} />
    </>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function TrackingContent() {
  const supabase = createClient();

  const [orderId, setOrderId] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<TrackingOrder | null>(null);
  const [driver, setDriver] = useState<TrackingDriver | null>(null);
  const [driverLocation, setDriverLocation] = useState<TrackingLocation | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // ── Lookup ──────────────────────────────────────────────────────────────────
  const handleLookup = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimId = orderId.trim().toUpperCase();
    const trimEmail = email.trim().toLowerCase();
    if (!trimId || !trimEmail) {
      setError('Please enter both your Order ID and email address.');
      return;
    }
    setLoading(true);
    setError(null);
    setOrder(null);
    setDriver(null);
    setDriverLocation(null);

    try {
      const { data: orderData, error: orderErr } = await supabase
        .from('orders')
        .select(
          'id, customer_name, customer_email, status, booking_type, booking_date, delivery_window, delivery_address_line1, delivery_address_line2, delivery_address_city, delivery_address_postcode, driver_id, tracking_pin, updated_at'
        )
        .eq('id', trimId)
        .ilike('customer_email', trimEmail)
        .maybeSingle();

      if (orderErr) {
        setError('An error occurred. Please try again.');
        return;
      }
      if (!orderData) {
        setError('No order found with that Order ID and email address. Please check your details and try again.');
        return;
      }

      setOrder(orderData);
      setLastRefresh(new Date());

      // Fetch driver info
      if (orderData.driver_id) {
        const { data: driverData } = await supabase
          .from('drivers')
          .select('id, name, vehicle, plate, status')
          .eq('id', orderData.driver_id)
          .maybeSingle();
        if (driverData) setDriver(driverData);

        // Fetch latest driver location
        const { data: locData } = await supabase
          .from('driver_locations')
          .select('latitude, longitude, heading, recorded_at')
          .eq('driver_id', orderData.driver_id)
          .order('recorded_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (locData) setDriverLocation(locData);
      }
    } finally {
      setLoading(false);
    }
  }, [orderId, email, supabase]);

  // ── Real-time subscription ──────────────────────────────────────────────────
  useEffect(() => {
    if (!order) return;

    const channel = supabase
      .channel(`tracking_${order.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${order.id}` },
        (payload) => {
          setOrder((prev) => prev ? { ...prev, ...(payload.new as Partial<TrackingOrder>) } : prev);
          setLastRefresh(new Date());
          setIsLive(true);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'driver_locations',
          filter: order.driver_id ? `driver_id=eq.${order.driver_id}` : undefined,
        },
        (payload) => {
          if (payload.new && (payload.new as any).latitude) {
            setDriverLocation({
              latitude: (payload.new as any).latitude,
              longitude: (payload.new as any).longitude,
              heading: (payload.new as any).heading ?? null,
              recorded_at: (payload.new as any).recorded_at,
            });
            setLastRefresh(new Date());
            setIsLive(true);
          }
        }
      )
      .subscribe();

    setIsLive(true);

    return () => {
      supabase.removeChannel(channel);
      setIsLive(false);
    };
  }, [order?.id, order?.driver_id, supabase]);

  // ── Derived values ──────────────────────────────────────────────────────────
  const statusMeta = order ? (STATUS_META[order.status] ?? STATUS_META['Booking Accepted']) : null;
  const currentStep = order ? STATUS_STEPS.indexOf(order.status) : -1;
  const isCancelled = order?.status === 'Booking Cancelled';

  const deliveryAddress = order
    ? [order.delivery_address_line1, order.delivery_address_line2, order.delivery_address_city, order.delivery_address_postcode]
        .filter(Boolean)
        .join(', ')
    : '';

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: 'hsl(var(--background))' }}
    >
      {/* Header */}
      <header
        className="border-b px-6 py-4 flex items-center gap-3"
        style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
      >
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: 'hsl(var(--primary))' }}
        >
          <Package size={20} color="white" />
        </div>
        <div>
          <h1 className="font-bold text-base" style={{ color: 'hsl(var(--foreground))' }}>
            Track Your Order
          </h1>
          <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Real-time delivery tracking
          </p>
        </div>
        {order && (
          <div className="ml-auto flex items-center gap-1.5">
            {isLive ? (
              <Wifi size={14} style={{ color: '#22c55e' }} />
            ) : (
              <WifiOff size={14} style={{ color: 'hsl(var(--muted-foreground))' }} />
            )}
            <span className="text-xs" style={{ color: isLive ? '#22c55e' : 'hsl(var(--muted-foreground))' }}>
              {isLive ? 'Live' : 'Offline'}
            </span>
            {lastRefresh && (
              <span className="text-xs ml-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
                · {timeAgo(lastRefresh.toISOString())}
              </span>
            )}
          </div>
        )}
      </header>

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-8 space-y-6">
        {/* Lookup form */}
        <div
          className="rounded-xl border p-6"
          style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
        >
          <h2 className="font-semibold text-sm mb-4" style={{ color: 'hsl(var(--foreground))' }}>
            Enter your tracking details
          </h2>
          <form onSubmit={handleLookup} className="space-y-3">
            <div>
              <label
                className="block text-xs font-medium mb-1"
                style={{ color: 'hsl(var(--muted-foreground))' }}
              >
                Order ID
              </label>
              <input
                type="text"
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
                placeholder="e.g. CA-1042"
                className="w-full px-3 py-2 rounded-lg border text-sm outline-none transition-all"
                style={{
                  backgroundColor: 'hsl(var(--background))',
                  borderColor: 'hsl(var(--border))',
                  color: 'hsl(var(--foreground))',
                }}
                autoComplete="off"
              />
            </div>
            <div>
              <label
                className="block text-xs font-medium mb-1"
                style={{ color: 'hsl(var(--muted-foreground))' }}
              >
                Email Address
              </label>
              <div className="relative">
                <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'hsl(var(--muted-foreground))' }} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full pl-9 pr-3 py-2 rounded-lg border text-sm outline-none transition-all"
                  style={{
                    backgroundColor: 'hsl(var(--background))',
                    borderColor: 'hsl(var(--border))',
                    color: 'hsl(var(--foreground))',
                  }}
                  autoComplete="email"
                />
              </div>
            </div>

            {error && (
              <div
                className="flex items-start gap-2 px-3 py-2.5 rounded-lg text-sm"
                style={{ backgroundColor: '#fee2e2', color: '#dc2626' }}
              >
                <AlertCircle size={15} className="shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all"
              style={{
                backgroundColor: loading ? 'hsl(var(--muted))' : 'hsl(var(--primary))',
                color: loading ? 'hsl(var(--muted-foreground))' : 'white',
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? (
                <>
                  <RefreshCw size={15} className="animate-spin" />
                  Looking up…
                </>
              ) : (
                <>
                  <Search size={15} />
                  Track Order
                </>
              )}
            </button>
          </form>
        </div>

        {/* Results */}
        {order && statusMeta && (
          <>
            {/* Status banner */}
            <div
              className="rounded-xl border p-5 flex items-center gap-4"
              style={{ backgroundColor: statusMeta.bg, borderColor: statusMeta.color + '40' }}
            >
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center shrink-0"
                style={{ backgroundColor: statusMeta.color + '20' }}
              >
                <statusMeta.icon size={24} style={{ color: statusMeta.color }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-base" style={{ color: statusMeta.color }}>
                  {statusMeta.label}
                </p>
                <p className="text-sm truncate" style={{ color: '#374151' }}>
                  Order #{order.id} · {order.customer_name}
                </p>
              </div>
              <button
                onClick={() => handleLookup()}
                className="shrink-0 p-2 rounded-lg transition-all hover:opacity-70"
                style={{ backgroundColor: statusMeta.color + '20' }}
                title="Refresh"
              >
                <RefreshCw size={15} style={{ color: statusMeta.color }} />
              </button>
            </div>

            {/* Progress stepper / Timeline */}
            {!isCancelled && (
              <div
                className="rounded-xl border p-5"
                style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
              >
                <h3 className="text-xs font-semibold uppercase tracking-wider mb-5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  Order Status Timeline
                </h3>
                {/* Horizontal stepper */}
                <div className="relative mb-6">
                  <div
                    className="absolute top-4 left-4 right-4 h-0.5"
                    style={{ backgroundColor: 'hsl(var(--border))' }}
                  />
                  <div
                    className="absolute top-4 left-4 h-0.5 transition-all duration-700"
                    style={{
                      backgroundColor: 'hsl(var(--primary))',
                      width: currentStep < 0 ? '0%' : `${(currentStep / (STATUS_STEPS.length - 1)) * (100 - (8 / 2))}%`,
                    }}
                  />
                  <div className="relative flex justify-between">
                    {STATUS_STEPS.map((step, idx) => {
                      const done = currentStep >= idx;
                      const active = currentStep === idx;
                      const meta = STATUS_META[step];
                      return (
                        <div key={step} className="flex flex-col items-center gap-1.5" style={{ width: '25%' }}>
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all duration-300 z-10"
                            style={{
                              backgroundColor: done ? 'hsl(var(--primary))' : 'hsl(var(--card))',
                              borderColor: done ? 'hsl(var(--primary))' : 'hsl(var(--border))',
                              boxShadow: active ? '0 0 0 4px hsl(var(--primary) / 0.2)' : 'none',
                            }}
                          >
                            {done ? (
                              <CheckCircle2 size={14} color="white" />
                            ) : (
                              <span className="text-xs font-bold" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                {idx + 1}
                              </span>
                            )}
                          </div>
                          <span
                            className="text-[10px] text-center leading-tight"
                            style={{ color: done ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))' }}
                          >
                            {meta?.label ?? step}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Vertical timeline detail */}
                <div className="space-y-0">
                  {STATUS_STEPS.map((step, idx) => {
                    const done = currentStep >= idx;
                    const active = currentStep === idx;
                    const meta = STATUS_META[step];
                    const isLast = idx === STATUS_STEPS.length - 1;
                    return (
                      <div key={step} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <div
                            className="w-3 h-3 rounded-full border-2 mt-1 shrink-0 transition-all"
                            style={{
                              backgroundColor: done ? 'hsl(var(--primary))' : 'hsl(var(--background))',
                              borderColor: done ? 'hsl(var(--primary))' : 'hsl(var(--border))',
                              boxShadow: active ? '0 0 0 3px hsl(var(--primary) / 0.2)' : 'none',
                            }}
                          />
                          {!isLast && (
                            <div
                              className="w-0.5 flex-1 mt-1"
                              style={{
                                backgroundColor: done && currentStep > idx ? 'hsl(var(--primary))' : 'hsl(var(--border))',
                                minHeight: '28px',
                              }}
                            />
                          )}
                        </div>
                        <div className="pb-4 flex-1">
                          <p
                            className="text-xs font-semibold"
                            style={{ color: done ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))' }}
                          >
                            {meta?.label ?? step}
                          </p>
                          {active && (
                            <p className="text-[11px] mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                              Current status · Updated {timeAgo(order.updated_at)}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Delivery info */}
            <div
              className="rounded-xl border divide-y"
              style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', '--tw-divide-opacity': 1 } as React.CSSProperties}
            >
              {/* ETA Countdown */}
              <div className="flex items-center gap-3 px-5 py-4">
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: 'hsl(var(--secondary))' }}
                >
                  <Clock size={16} style={{ color: 'hsl(var(--primary))' }} />
                </div>
                <div>
                  <p className="text-xs mb-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    Delivery Window / ETA
                  </p>
                  <ETACountdown
                    bookingDate={order.booking_date}
                    deliveryWindow={order.delivery_window}
                    status={order.status}
                  />
                  <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    {formatDate(order.booking_date)}
                  </p>
                </div>
              </div>

              {/* Delivery Address */}
              {deliveryAddress && (
                <div className="flex items-start gap-3 px-5 py-4">
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                    style={{ backgroundColor: 'hsl(var(--secondary))' }}
                  >
                    <MapPin size={16} style={{ color: 'hsl(var(--primary))' }} />
                  </div>
                  <div>
                    <p className="text-xs mb-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                      Delivery Address
                    </p>
                    <p className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
                      {order.delivery_address_line1}
                    </p>
                    {order.delivery_address_line2 && (
                      <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        {order.delivery_address_line2}
                      </p>
                    )}
                    <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                      {[order.delivery_address_city, order.delivery_address_postcode].filter(Boolean).join(', ')}
                    </p>
                  </div>
                </div>
              )}

              {/* Driver */}
              {driver && (
                <div className="flex items-center gap-3 px-5 py-4">
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: 'hsl(var(--secondary))' }}
                  >
                    <Truck size={16} style={{ color: 'hsl(var(--primary))' }} />
                  </div>
                  <div>
                    <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                      Your Driver
                    </p>
                    <p className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
                      {driver.name}
                    </p>
                    <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                      {driver.vehicle} · {driver.plate}
                    </p>
                  </div>
                  {driverLocation && (
                    <div className="ml-auto text-right">
                      <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        Last seen
                      </p>
                      <p className="text-xs font-medium" style={{ color: 'hsl(var(--foreground))' }}>
                        {timeAgo(driverLocation.recorded_at)}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Driver location map */}
            {driverLocation && order.status === 'Booking Out For Delivery' && (
              <div
                className="rounded-xl border overflow-hidden"
                style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
              >
                <div className="flex items-center gap-2 px-5 py-3 border-b" style={{ borderColor: 'hsl(var(--border))' }}>
                  <Navigation size={14} style={{ color: 'hsl(var(--primary))' }} />
                  <span className="text-xs font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
                    Driver Location
                  </span>
                  <span
                    className="ml-auto text-[10px] px-2 py-0.5 rounded-full font-medium"
                    style={{ backgroundColor: '#dcfce7', color: '#16a34a' }}
                  >
                    Live
                  </span>
                </div>
                <div className="p-3">
                  <TrackingMap location={driverLocation} deliveryAddress={deliveryAddress} />
                </div>
                <div className="px-5 py-3 border-t" style={{ borderColor: 'hsl(var(--border))' }}>
                  <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    Purple pin = driver · Red pin = your address · Map updates automatically
                  </p>
                </div>
              </div>
            )}

            {/* Completed / Cancelled state */}
            {(order.status === 'Booking Complete' || isCancelled) && (
              <div
                className="rounded-xl border p-5 text-center"
                style={{
                  backgroundColor: isCancelled ? '#fee2e2' : '#dcfce7',
                  borderColor: isCancelled ? '#fca5a5' : '#86efac',
                }}
              >
                {isCancelled ? (
                  <>
                    <XCircle size={32} style={{ color: '#dc2626', margin: '0 auto 8px' }} />
                    <p className="font-semibold text-sm" style={{ color: '#dc2626' }}>
                      This order has been cancelled.
                    </p>
                    <p className="text-xs mt-1" style={{ color: '#7f1d1d' }}>
                      Please contact us if you have any questions.
                    </p>
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={32} style={{ color: '#16a34a', margin: '0 auto 8px' }} />
                    <p className="font-semibold text-sm" style={{ color: '#16a34a' }}>
                      Your order has been delivered!
                    </p>
                    <p className="text-xs mt-1" style={{ color: '#14532d' }}>
                      Thank you for your order.
                    </p>
                  </>
                )}
              </div>
            )}
          </>
        )}

        {/* Help text when no order yet */}
        {!order && !loading && !error && (
          <div className="text-center py-8">
            <Package size={40} style={{ color: 'hsl(var(--muted-foreground))', margin: '0 auto 12px' }} />
            <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Your Order ID can be found in your confirmation email.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
