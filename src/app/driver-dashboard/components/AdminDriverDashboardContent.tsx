'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import AppLayout from '@/components/AppLayout';
import { Truck, MapPin, Package, Wifi, WifiOff, RefreshCw, Navigation, Users, Activity,  } from 'lucide-react';
import { useMapsConfig, getTileLayerConfig } from '@/hooks/useMapsConfig';
import Icon from '@/components/ui/AppIcon';


// ─── Types ────────────────────────────────────────────────────────────────────

interface DriverInfo {
  id: string;
  name: string;
  vehicle: string;
  plate: string;
  status: string;
  phone: string;
}

interface DriverLocation {
  driver_id: string;
  latitude: number;
  longitude: number;
  heading: number | null;
  speed: number | null;
  recorded_at: string;
}

interface ActiveOrder {
  id: string;
  status: string;
  customer_name: string;
  delivery_address_line1: string | null;
  delivery_address_city: string | null;
  delivery_address_postcode: string | null;
}

interface DriverRow {
  driver: DriverInfo;
  location: DriverLocation | null;
  orders: ActiveOrder[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DRIVER_STATUS_COLOR: Record<string, string> = {
  'On Route': '#f97316',
  Available: '#22c55e',
  'Off Duty': '#94a3b8',
};

const DRIVER_STATUS_BG: Record<string, string> = {
  'On Route': 'rgba(249,115,22,0.12)',
  Available: 'rgba(34,197,94,0.12)',
  'Off Duty': 'rgba(148,163,184,0.12)',
};

const ACTIVE_ORDER_STATUSES = [
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

// ─── Map Component ────────────────────────────────────────────────────────────

interface DriverMapProps {
  drivers: DriverRow[];
  selectedDriverId: string | null;
  onSelectDriver: (id: string) => void;
}

function DriverMap({ drivers, selectedDriverId, onSelectDriver }: DriverMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const mapsConfig = useMapsConfig();

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;
    if (mapsConfig.loading) return;

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
        center: mapsConfig.defaultCenter,
        zoom: 11,
        zoomControl: true,
        attributionControl: true,
      });

      const tileConfig = getTileLayerConfig(mapsConfig.useGoogleMaps);
      L.tileLayer(tileConfig.url, {
        attribution: tileConfig.attribution,
        maxZoom: tileConfig.maxZoom,
        ...(tileConfig.subdomains ? { subdomains: tileConfig.subdomains } : {}),
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
  }, [mapsConfig.loading]);

  useEffect(() => {
    if (!mapInstanceRef.current) return;

    import('leaflet').then((leafletModule) => {
      const L = leafletModule.default;
      const map = mapInstanceRef.current;
      const bounds: [number, number][] = [];
      const activeIds = new Set<string>();

      drivers.forEach((row) => {
        const loc = row.location;
        if (!loc) return;

        activeIds.add(row.driver.id);
        const driverStatus = row.driver.status;
        const color = DRIVER_STATUS_COLOR[driverStatus] ?? '#94a3b8';
        const initials = row.driver.name.slice(0, 2).toUpperCase();
        const isSelected = row.driver.id === selectedDriverId;
        const orderCount = row.orders.length;

        const iconHtml = `
          <div style="position:relative;width:${isSelected ? 46 : 38}px;height:${isSelected ? 46 : 38}px;">
            <div style="
              width:${isSelected ? 46 : 38}px;height:${isSelected ? 46 : 38}px;
              border-radius:50%;background:${color};
              border:${isSelected ? '4px' : '3px'} solid ${isSelected ? '#8b5cf6' : 'white'};
              box-shadow:0 3px 10px rgba(0,0,0,0.35);
              display:flex;align-items:center;justify-content:center;
              font-size:${isSelected ? 13 : 11}px;font-weight:700;color:white;cursor:pointer;
            ">${initials}</div>
            ${orderCount > 0 ? `
              <div style="
                position:absolute;top:-4px;right:-4px;
                width:18px;height:18px;border-radius:50%;
                background:#3b82f6;border:2px solid white;
                display:flex;align-items:center;justify-content:center;
                font-size:9px;font-weight:800;color:white;
              ">${orderCount}</div>
            ` : ''}
            ${driverStatus === 'On Route' ? `
              <div style="
                position:absolute;bottom:0px;right:0px;
                width:11px;height:11px;border-radius:50%;
                background:#22c55e;border:2px solid white;
              "></div>
            ` : ''}
          </div>
        `;

        const driverIcon = L.divIcon({
          html: iconHtml,
          className: '',
          iconSize: [isSelected ? 46 : 38, isSelected ? 46 : 38],
          iconAnchor: [isSelected ? 23 : 19, isSelected ? 23 : 19],
        });

        const popupContent = `
          <div style="font-size:12px;min-width:170px;line-height:1.5;">
            <strong style="font-size:13px;">${row.driver.name}</strong><br/>
            <span style="color:#6b7280;">${row.driver.vehicle} · ${row.driver.plate}</span><br/>
            <span style="color:${color};font-weight:600;">● ${driverStatus}</span><br/>
            <span style="color:#374151;">📦 ${orderCount} active order${orderCount !== 1 ? 's' : ''}</span><br/>
            <span style="color:#9ca3af;font-size:10px;">Updated ${timeAgo(loc.recorded_at)}</span>
          </div>
        `;

        const existing = markersRef.current.get(row.driver.id);
        if (existing) {
          existing.setLatLng([loc.latitude, loc.longitude]);
          existing.setIcon(driverIcon);
          existing.setPopupContent(popupContent);
        } else {
          const marker = L.marker([loc.latitude, loc.longitude], { icon: driverIcon })
            .addTo(map)
            .bindPopup(popupContent)
            .on('click', () => onSelectDriver(row.driver.id));
          markersRef.current.set(row.driver.id, marker);
        }

        bounds.push([loc.latitude, loc.longitude]);
      });

      // Remove stale markers
      markersRef.current.forEach((marker, driverId) => {
        if (!activeIds.has(driverId)) {
          marker.remove();
          markersRef.current.delete(driverId);
        }
      });

      if (bounds.length > 0) {
        try {
          map.fitBounds(bounds, { padding: [60, 60], maxZoom: 14 });
        } catch {}
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
  const color = DRIVER_STATUS_COLOR[row.driver.status] ?? '#94a3b8';
  const bg = DRIVER_STATUS_BG[row.driver.status] ?? 'rgba(148,163,184,0.12)';
  const initials = row.driver.name.slice(0, 2).toUpperCase();
  const hasLocation = !!row.location;
  const orderCount = row.orders.length;

  return (
    <button
      onClick={onClick}
      className="w-full text-left p-3 rounded-xl border transition-all duration-150"
      style={{
        borderColor: isSelected ? 'hsl(var(--primary))' : 'hsl(var(--border))',
        backgroundColor: isSelected ? 'hsl(var(--primary) / 0.06)' : 'hsl(var(--card))',
        boxShadow: isSelected ? '0 0 0 2px hsl(var(--primary) / 0.2)' : undefined,
      }}
    >
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 relative"
          style={{ backgroundColor: color, color: 'white' }}
        >
          {initials}
          {/* Order count badge */}
          {orderCount > 0 && (
            <span
              className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold border-2"
              style={{ backgroundColor: '#3b82f6', color: 'white', borderColor: 'hsl(var(--card))' }}
            >
              {orderCount}
            </span>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-semibold truncate" style={{ color: 'hsl(var(--foreground))' }}>
              {row.driver.name}
            </span>
            <span
              className="ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0"
              style={{ backgroundColor: bg, color }}
            >
              {row.driver.status}
            </span>
          </div>

          <p className="text-[11px] truncate mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
            {row.driver.vehicle} · {row.driver.plate}
          </p>

          {/* Order count row */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <Package size={11} style={{ color: '#3b82f6' }} />
              <span className="text-[11px] font-semibold" style={{ color: '#3b82f6' }}>
                {orderCount} order{orderCount !== 1 ? 's' : ''}
              </span>
            </div>

            {hasLocation ? (
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" />
                <span className="text-[10px]" style={{ color: '#22c55e' }}>
                  Live · {timeAgo(row.location!.recorded_at)}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-400 inline-block" />
                <span className="text-[10px]" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  No GPS
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Active orders list */}
      {isSelected && row.orders.length > 0 && (
        <div className="mt-3 space-y-1.5 border-t pt-2.5" style={{ borderColor: 'hsl(var(--border))' }}>
          {row.orders.map((order) => (
            <div
              key={order.id}
              className="flex items-start gap-2 p-2 rounded-lg"
              style={{ backgroundColor: 'hsl(var(--secondary))' }}
            >
              <Package size={11} className="mt-0.5 shrink-0" style={{ color: '#3b82f6' }} />
              <div className="min-w-0">
                <p className="text-[11px] font-semibold truncate" style={{ color: 'hsl(var(--foreground))' }}>
                  {order.customer_name}
                </p>
                <p className="text-[10px] truncate" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  {[order.delivery_address_line1, order.delivery_address_city, order.delivery_address_postcode]
                    .filter(Boolean)
                    .join(', ')}
                </p>
                <span
                  className="text-[9px] font-semibold"
                  style={{ color: '#f97316' }}
                >
                  {order.status.replace('Booking ', '')}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </button>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AdminDriverDashboardContent() {
  const supabase = createClient();
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLive, setIsLive] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const channelRef = useRef<any>(null);

  const fetchData = useCallback(async () => {
    // 1. Fetch all drivers
    const { data: driversData, error: driversErr } = await supabase
      .from('drivers')
      .select('id, name, vehicle, plate, status, phone')
      .order('name');

    if (driversErr || !driversData) {
      setLoading(false);
      return;
    }

    // 2. Fetch latest driver locations
    const { data: locData } = await supabase
      .from('driver_locations')
      .select('driver_id, latitude, longitude, heading, speed, recorded_at')
      .order('recorded_at', { ascending: false });

    const latestLocByDriver = new Map<string, DriverLocation>();
    if (locData) {
      for (const loc of locData as DriverLocation[]) {
        if (!latestLocByDriver.has(loc.driver_id)) {
          latestLocByDriver.set(loc.driver_id, loc);
        }
      }
    }

    // 3. Fetch active orders grouped by driver
    const { data: ordersData } = await supabase
      .from('orders')
      .select('id, status, customer_name, delivery_address_line1, delivery_address_city, delivery_address_postcode, driver_id')
      .in('status', ACTIVE_ORDER_STATUSES)
      .not('driver_id', 'is', null);

    const ordersByDriver = new Map<string, ActiveOrder[]>();
    if (ordersData) {
      for (const order of ordersData as any[]) {
        if (!order.driver_id) continue;
        if (!ordersByDriver.has(order.driver_id)) {
          ordersByDriver.set(order.driver_id, []);
        }
        ordersByDriver.get(order.driver_id)!.push({
          id: order.id,
          status: order.status,
          customer_name: order.customer_name,
          delivery_address_line1: order.delivery_address_line1,
          delivery_address_city: order.delivery_address_city,
          delivery_address_postcode: order.delivery_address_postcode,
        });
      }
    }

    // 4. Merge into DriverRow[]
    const rows: DriverRow[] = (driversData as DriverInfo[]).map((driver) => ({
      driver,
      location: latestLocByDriver.get(driver.id) ?? null,
      orders: ordersByDriver.get(driver.id) ?? [],
    }));

    // Sort: drivers with location first, then by order count desc
    rows.sort((a, b) => {
      if (!!a.location !== !!b.location) return a.location ? -1 : 1;
      return b.orders.length - a.orders.length;
    });

    setDrivers(rows);
    setLastRefresh(new Date());
    setLoading(false);
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Realtime subscription
  useEffect(() => {
    if (!isLive) {
      channelRef.current?.unsubscribe();
      channelRef.current = null;
      return;
    }

    const channel = supabase
      .channel('driver-dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_locations' }, () => {
        fetchData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        fetchData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers' }, () => {
        fetchData();
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
    };
  }, [isLive, fetchData]);

  // Polling fallback every 30s
  useEffect(() => {
    if (!isLive) return;
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [isLive, fetchData]);

  // ── Derived stats ──────────────────────────────────────────────────────────
  const totalDrivers = drivers.length;
  const activeDrivers = drivers.filter((d) => d.driver.status !== 'Off Duty').length;
  const onRouteDrivers = drivers.filter((d) => d.driver.status === 'On Route').length;
  const liveDrivers = drivers.filter((d) => !!d.location).length;
  const totalActiveOrders = drivers.reduce((sum, d) => sum + d.orders.length, 0);

  const selectedDriver = drivers.find((d) => d.driver.id === selectedDriverId) ?? null;

  return (
    <AppLayout>
      <div className="flex flex-col h-full" style={{ backgroundColor: 'hsl(var(--background))' }}>
        {/* ── Header ── */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b shrink-0"
          style={{ borderColor: 'hsl(var(--border))' }}
        >
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'hsl(var(--foreground))' }}>
              Driver Dashboard
            </h1>
            <p className="text-sm mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Real-time driver locations, status, and active orders
            </p>
          </div>

          <div className="flex items-center gap-3">
            {lastRefresh && (
              <span className="text-xs hidden sm:block" style={{ color: 'hsl(var(--muted-foreground))' }}>
                Updated {timeAgo(lastRefresh.toISOString())}
              </span>
            )}
            <button
              onClick={() => setIsLive((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors"
              style={{
                borderColor: isLive ? '#22c55e' : 'hsl(var(--border))',
                backgroundColor: isLive ? 'rgba(34,197,94,0.1)' : 'hsl(var(--secondary))',
                color: isLive ? '#22c55e' : 'hsl(var(--muted-foreground))',
              }}
            >
              {isLive ? <Wifi size={13} /> : <WifiOff size={13} />}
              {isLive ? 'Live' : 'Paused'}
            </button>
            <button
              onClick={fetchData}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors"
              style={{
                borderColor: 'hsl(var(--border))',
                backgroundColor: 'hsl(var(--secondary))',
                color: 'hsl(var(--foreground))',
              }}
            >
              <RefreshCw size={13} />
              Refresh
            </button>
          </div>
        </div>

        {/* ── KPI Strip ── */}
        <div
          className="grid grid-cols-2 sm:grid-cols-5 gap-3 px-5 py-3 border-b shrink-0"
          style={{ borderColor: 'hsl(var(--border))' }}
        >
          {[
            { label: 'Total Drivers', value: totalDrivers, icon: Users, color: '#6366f1' },
            { label: 'Active', value: activeDrivers, icon: Activity, color: '#22c55e' },
            { label: 'On Route', value: onRouteDrivers, icon: Navigation, color: '#f97316' },
            { label: 'GPS Live', value: liveDrivers, icon: MapPin, color: '#3b82f6' },
            { label: 'Active Orders', value: totalActiveOrders, icon: Package, color: '#8b5cf6' },
          ].map(({ label, value, icon: Icon, color }) => (
            <div
              key={label}
              className="flex items-center gap-3 p-3 rounded-xl border"
              style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--card))' }}
            >
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                style={{ backgroundColor: `${color}18` }}
              >
                <Icon size={18} style={{ color }} />
              </div>
              <div>
                <p className="text-lg font-bold leading-none" style={{ color: 'hsl(var(--foreground))' }}>
                  {value}
                </p>
                <p className="text-[11px] mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  {label}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Main Content ── */}
        <div className="flex flex-1 overflow-hidden">
          {/* Driver List Sidebar */}
          <div
            className="w-80 shrink-0 flex flex-col border-r overflow-hidden"
            style={{ borderColor: 'hsl(var(--border))' }}
          >
            <div
              className="px-4 py-3 border-b shrink-0"
              style={{ borderColor: 'hsl(var(--border))' }}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
                  Active Drivers
                </h2>
                <span
                  className="text-xs px-2 py-0.5 rounded-full font-semibold"
                  style={{ backgroundColor: 'hsl(var(--secondary))', color: 'hsl(var(--muted-foreground))' }}
                >
                  {drivers.length}
                </span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {loading ? (
                <div className="flex items-center justify-center h-32">
                  <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'hsl(var(--primary))' }} />
                </div>
              ) : drivers.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 gap-2">
                  <Truck size={28} style={{ color: 'hsl(var(--muted-foreground))' }} />
                  <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    No drivers found
                  </p>
                </div>
              ) : (
                drivers.map((row) => (
                  <DriverCard
                    key={row.driver.id}
                    row={row}
                    isSelected={selectedDriverId === row.driver.id}
                    onClick={() =>
                      setSelectedDriverId((prev) =>
                        prev === row.driver.id ? null : row.driver.id
                      )
                    }
                  />
                ))
              )}
            </div>
          </div>

          {/* Map Area */}
          <div className="flex-1 relative overflow-hidden">
            {loading && drivers.length === 0 ? (
              <div
                className="absolute inset-0 flex items-center justify-center"
                style={{ backgroundColor: 'hsl(var(--secondary))' }}
              >
                <div className="flex flex-col items-center gap-3">
                  <div
                    className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin"
                    style={{ borderColor: 'hsl(var(--primary))' }}
                  />
                  <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    Loading map…
                  </p>
                </div>
              </div>
            ) : (
              <DriverMap
                drivers={drivers}
                selectedDriverId={selectedDriverId}
                onSelectDriver={(id) =>
                  setSelectedDriverId((prev) => (prev === id ? null : id))
                }
              />
            )}

            {/* Map Legend */}
            <div
              className="absolute bottom-4 left-4 p-3 rounded-xl border text-xs space-y-1.5 z-[1000]"
              style={{
                backgroundColor: 'hsl(var(--card) / 0.95)',
                borderColor: 'hsl(var(--border))',
                backdropFilter: 'blur(8px)',
              }}
            >
              <p className="font-semibold mb-2" style={{ color: 'hsl(var(--foreground))' }}>
                Legend
              </p>
              {[
                { label: 'On Route', color: '#f97316' },
                { label: 'Available', color: '#22c55e' },
                { label: 'Off Duty', color: '#94a3b8' },
              ].map(({ label, color }) => (
                <div key={label} className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  <span style={{ color: 'hsl(var(--foreground))' }}>{label}</span>
                </div>
              ))}
              <div className="flex items-center gap-2 pt-1 border-t" style={{ borderColor: 'hsl(var(--border))' }}>
                <div
                  className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold shrink-0"
                  style={{ backgroundColor: '#3b82f6', color: 'white' }}
                >
                  2
                </div>
                <span style={{ color: 'hsl(var(--foreground))' }}>Order count</span>
              </div>
            </div>

            {/* Selected driver detail overlay */}
            {selectedDriver && (
              <div
                className="absolute top-4 right-4 w-64 p-4 rounded-xl border z-[1000]"
                style={{
                  backgroundColor: 'hsl(var(--card) / 0.97)',
                  borderColor: 'hsl(var(--primary))',
                  backdropFilter: 'blur(8px)',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                }}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                    style={{
                      backgroundColor: DRIVER_STATUS_COLOR[selectedDriver.driver.status] ?? '#94a3b8',
                      color: 'white',
                    }}
                  >
                    {selectedDriver.driver.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate" style={{ color: 'hsl(var(--foreground))' }}>
                      {selectedDriver.driver.name}
                    </p>
                    <p className="text-[11px] truncate" style={{ color: 'hsl(var(--muted-foreground))' }}>
                      {selectedDriver.driver.vehicle} · {selectedDriver.driver.plate}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedDriverId(null)}
                    className="text-xs shrink-0"
                    style={{ color: 'hsl(var(--muted-foreground))' }}
                  >
                    ✕
                  </button>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>Status</span>
                    <span
                      className="text-xs font-semibold px-2 py-0.5 rounded-full"
                      style={{
                        backgroundColor: DRIVER_STATUS_BG[selectedDriver.driver.status] ?? 'rgba(148,163,184,0.12)',
                        color: DRIVER_STATUS_COLOR[selectedDriver.driver.status] ?? '#94a3b8',
                      }}
                    >
                      {selectedDriver.driver.status}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>Active Orders</span>
                    <span className="text-xs font-bold" style={{ color: '#3b82f6' }}>
                      {selectedDriver.orders.length}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>GPS</span>
                    {selectedDriver.location ? (
                      <span className="flex items-center gap-1 text-xs" style={{ color: '#22c55e' }}>
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" />
                        Live · {timeAgo(selectedDriver.location.recorded_at)}
                      </span>
                    ) : (
                      <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>No signal</span>
                    )}
                  </div>

                  {selectedDriver.driver.phone && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>Phone</span>
                      <span className="text-xs font-medium" style={{ color: 'hsl(var(--foreground))' }}>
                        {selectedDriver.driver.phone}
                      </span>
                    </div>
                  )}
                </div>

                {selectedDriver.orders.length > 0 && (
                  <div className="mt-3 pt-3 border-t space-y-1.5" style={{ borderColor: 'hsl(var(--border))' }}>
                    <p className="text-[11px] font-semibold" style={{ color: 'hsl(var(--muted-foreground))' }}>
                      ACTIVE ORDERS
                    </p>
                    {selectedDriver.orders.map((order) => (
                      <div
                        key={order.id}
                        className="p-2 rounded-lg"
                        style={{ backgroundColor: 'hsl(var(--secondary))' }}
                      >
                        <p className="text-[11px] font-semibold truncate" style={{ color: 'hsl(var(--foreground))' }}>
                          {order.customer_name}
                        </p>
                        <p className="text-[10px] truncate" style={{ color: 'hsl(var(--muted-foreground))' }}>
                          {[order.delivery_address_line1, order.delivery_address_city, order.delivery_address_postcode]
                            .filter(Boolean)
                            .join(', ')}
                        </p>
                        <span className="text-[9px] font-semibold" style={{ color: '#f97316' }}>
                          {order.status.replace('Booking ', '')}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
