'use client';

import { useEffect, useState, useCallback } from 'react';
import { MapPin, Truck, Clock, ChevronDown, ChevronUp, RefreshCw, User, Package, AlertCircle, CheckCircle2, Navigation } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { ordersService, AppOrder, AppDriver } from '@/lib/services/ordersService';
import Icon from '@/components/ui/AppIcon';


// ─── Types ────────────────────────────────────────────────────────────────────

interface ZoneGroup {
  zone: string;
  color: string;
  orders: AppOrder[];
  suggestedDriver: AppDriver | null;
  estimatedMinutes: number;
}

interface DriverWithZone extends AppDriver {
  zone?: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ZONE_COLORS: Record<string, string> = {
  'North': '#6366f1',
  'South': '#10b981',
  'East': '#f59e0b',
  'West': '#ef4444',
  'Central': '#8b5cf6',
  'Unknown': '#6b7280',
};

function deriveZoneFromPostcode(postcode: string | undefined): string {
  if (!postcode) return 'Unknown';
  const pc = postcode.trim().toUpperCase();
  // UK postcode area prefix → zone mapping (simplified)
  const area = pc.replace(/[^A-Z]/g, '').slice(0, 2);
  const northAreas = ['LS', 'BD', 'HG', 'YO', 'HX', 'WF', 'HD', 'HU', 'DN', 'S', 'SK'];
  const southAreas = ['SO', 'PO', 'BN', 'TN', 'CT', 'ME', 'DA', 'BR', 'CR', 'SM', 'KT', 'GU', 'RH', 'RG', 'SL', 'HP'];
  const eastAreas = ['CO', 'IP', 'NR', 'PE', 'CB', 'SG', 'AL', 'EN', 'CM', 'SS', 'RM', 'IG', 'E', 'EC'];
  const westAreas = ['BS', 'BA', 'TA', 'EX', 'PL', 'TQ', 'TR', 'GL', 'HR', 'WR', 'DY', 'WV', 'TF', 'SY', 'LL', 'SA', 'CF', 'NP', 'SW', 'W', 'TW', 'UB', 'SL'];
  const centralAreas = ['B', 'CV', 'NN', 'MK', 'OX', 'SP', 'ST', 'DE', 'NG', 'LE', 'LN', 'WS', 'WN'];

  if (northAreas.some(a => area.startsWith(a))) return 'North';
  if (southAreas.some(a => area.startsWith(a))) return 'South';
  if (eastAreas.some(a => area.startsWith(a))) return 'East';
  if (westAreas.some(a => area.startsWith(a))) return 'West';
  if (centralAreas.some(a => area.startsWith(a))) return 'Central';
  return 'Unknown';
}

function estimateETA(orderCount: number, deliveryWindow: string): number {
  // Base: 20 min per stop + 15 min transit between stops
  const baseMinutes = orderCount * 35;
  // Adjust for delivery window urgency
  if (deliveryWindow?.toLowerCase().includes('am')) return Math.max(baseMinutes - 10, 20);
  if (deliveryWindow?.toLowerCase().includes('pm')) return baseMinutes + 15;
  return baseMinutes;
}

function getZoneColor(zone: string): string {
  return ZONE_COLORS[zone] ?? ZONE_COLORS['Unknown'];
}

function formatETA(minutes: number): string {
  if (minutes < 60) return `~${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `~${h}h ${m}m` : `~${h}h`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ZoneCard({ group, drivers, onAssign }: {
  group: ZoneGroup;
  drivers: DriverWithZone[];
  onAssign: (orderId: string, driverId: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [assigning, setAssigning] = useState<string | null>(null);
  const zoneColor = getZoneColor(group.zone);
  const availableDrivers = drivers.filter(d => d.status === 'Available');
  const unassignedOrders = group.orders.filter(o => !o.driver);
  const assignedOrders = group.orders.filter(o => o.driver);

  const handleAssign = async (orderId: string, driverId: string) => {
    setAssigning(orderId);
    await onAssign(orderId, driverId);
    setAssigning(null);
  };

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ borderColor: `${zoneColor}40`, backgroundColor: 'hsl(var(--card))' }}
    >
      {/* Zone Header */}
      <button
        className="w-full flex items-center justify-between px-4 py-3 text-left"
        style={{ backgroundColor: `${zoneColor}10` }}
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-3 h-3 rounded-full shrink-0"
            style={{ backgroundColor: zoneColor }}
          />
          <span className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
            {group.zone} Zone
          </span>
          <span
            className="text-xs font-medium px-2 py-0.5 rounded-full"
            style={{ backgroundColor: `${zoneColor}20`, color: zoneColor }}
          >
            {group.orders.length} {group.orders.length === 1 ? 'delivery' : 'deliveries'}
          </span>
          {unassignedOrders.length > 0 && (
            <span
              className="text-xs font-medium px-2 py-0.5 rounded-full"
              style={{ backgroundColor: 'hsl(0 84% 55% / 0.1)', color: 'hsl(0 84% 45%)' }}
            >
              {unassignedOrders.length} unassigned
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {/* ETA */}
          <div className="flex items-center gap-1.5 text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
            <Clock size={12} />
            <span>{formatETA(group.estimatedMinutes)}</span>
          </div>
          {/* Suggested driver */}
          {group.suggestedDriver && (
            <div className="hidden sm:flex items-center gap-1.5 text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
              <User size={12} />
              <span>{group.suggestedDriver.name}</span>
            </div>
          )}
          {expanded ? (
            <ChevronUp size={14} style={{ color: 'hsl(var(--muted-foreground))' }} />
          ) : (
            <ChevronDown size={14} style={{ color: 'hsl(var(--muted-foreground))' }} />
          )}
        </div>
      </button>

      {/* Zone Body */}
      {expanded && (
        <div className="divide-y" style={{ borderColor: 'hsl(var(--border))' }}>
          {group.orders.map((order) => (
            <div key={order.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              {/* Order info */}
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                  style={{ backgroundColor: `${zoneColor}15` }}
                >
                  <Package size={13} style={{ color: zoneColor }} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
                      #{order.wooOrderId || order.id.slice(0, 8)}
                    </span>
                    <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                      {order.customer.name}
                    </span>
                    <span
                      className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                      style={{ backgroundColor: 'hsl(var(--secondary))', color: 'hsl(var(--muted-foreground))' }}
                    >
                      {order.deliveryWindow}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <MapPin size={10} style={{ color: 'hsl(var(--muted-foreground))' }} />
                    <span className="text-[11px] truncate" style={{ color: 'hsl(var(--muted-foreground))' }}>
                      {order.deliveryAddress?.line1
                        ? `${order.deliveryAddress.line1}${order.deliveryAddress.postcode ? `, ${order.deliveryAddress.postcode}` : ''}`
                        : 'No address'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Driver assignment */}
              <div className="flex items-center gap-2 shrink-0">
                {order.driver ? (
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 size={13} style={{ color: 'hsl(142 69% 35%)' }} />
                    <span className="text-xs font-medium" style={{ color: 'hsl(142 69% 35%)' }}>
                      {order.driver.name}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <AlertCircle size={13} style={{ color: 'hsl(38 92% 50%)' }} />
                    <select
                      className="text-xs rounded-lg border px-2 py-1 outline-none focus:ring-1"
                      style={{
                        borderColor: 'hsl(var(--border))',
                        backgroundColor: 'hsl(var(--background))',
                        color: 'hsl(var(--foreground))',
                        minWidth: '130px',
                      }}
                      defaultValue=""
                      disabled={assigning === order.id}
                      onChange={(e) => {
                        if (e.target.value) handleAssign(order.id, e.target.value);
                      }}
                    >
                      <option value="" disabled>
                        {assigning === order.id ? 'Assigning…' : 'Assign driver'}
                      </option>
                      {group.suggestedDriver && (
                        <optgroup label="Suggested">
                          <option value={group.suggestedDriver.id}>
                            ★ {group.suggestedDriver.name}
                          </option>
                        </optgroup>
                      )}
                      {availableDrivers.filter(d => d.id !== group.suggestedDriver?.id).length > 0 && (
                        <optgroup label="Available">
                          {availableDrivers
                            .filter(d => d.id !== group.suggestedDriver?.id)
                            .map(d => (
                              <option key={d.id} value={d.id}>{d.name}</option>
                            ))}
                        </optgroup>
                      )}
                    </select>
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Zone summary footer */}
          <div
            className="px-4 py-2 flex items-center justify-between"
            style={{ backgroundColor: 'hsl(var(--secondary) / 0.3)' }}
          >
            <div className="flex items-center gap-4 text-[11px]" style={{ color: 'hsl(var(--muted-foreground))' }}>
              <span className="flex items-center gap-1">
                <CheckCircle2 size={10} style={{ color: 'hsl(142 69% 35%)' }} />
                {assignedOrders.length} assigned
              </span>
              <span className="flex items-center gap-1">
                <AlertCircle size={10} style={{ color: 'hsl(38 92% 50%)' }} />
                {unassignedOrders.length} pending
              </span>
            </div>
            <div className="flex items-center gap-1 text-[11px]" style={{ color: 'hsl(var(--muted-foreground))' }}>
              <Navigation size={10} />
              <span>ETA: {formatETA(group.estimatedMinutes)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function RouteOptimizationPanel() {
  const [orders, setOrders] = useState<AppOrder[]>([]);
  const [drivers, setDrivers] = useState<DriverWithZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    const [allOrders, allDrivers] = await Promise.all([
      ordersService.fetchAllOrders(),
      ordersService.fetchDrivers(),
    ]);

    // Fetch driver zones from DB
    const supabase = createClient();
    const { data: driverRows } = await supabase
      .from('drivers')
      .select('id, zone')
      .in('id', allDrivers.map(d => d.id));

    const zoneMap: Record<string, string | null> = {};
    driverRows?.forEach((r: { id: string; zone: string | null }) => {
      zoneMap[r.id] = r.zone;
    });

    const driversWithZone: DriverWithZone[] = allDrivers.map(d => ({
      ...d,
      zone: zoneMap[d.id] ?? null,
    }));

    setDrivers(driversWithZone);

    // Filter to today's delivery orders only
    const todayStr = new Date().toISOString().split('T')[0];
    const todayDeliveries = allOrders.filter(
      o => o.bookingDate === todayStr && o.type === 'Delivery'
    );
    setOrders(todayDeliveries);
    setLastRefreshed(new Date());
    setLoading(false);
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  useEffect(() => {
    loadData();

    const supabase = createClient();
    const channel = supabase
      .channel('route_optimization_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        loadData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers' }, () => {
        loadData();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [loadData]);

  // Assign driver to order
  const handleAssign = async (orderId: string, driverId: string) => {
    const ok = await ordersService.assignDriver(orderId, driverId);
    if (ok) {
      setOrders(prev =>
        prev.map(o => {
          if (o.id !== orderId) return o;
          const driver = drivers.find(d => d.id === driverId);
          return { ...o, driver: driver ?? o.driver };
        })
      );
    }
  };

  // Group orders by zone
  const zoneGroups: ZoneGroup[] = (() => {
    const grouped: Record<string, AppOrder[]> = {};
    orders.forEach(order => {
      const zone = deriveZoneFromPostcode(order.deliveryAddress?.postcode);
      if (!grouped[zone]) grouped[zone] = [];
      grouped[zone].push(order);
    });

    return Object.entries(grouped)
      .sort(([, a], [, b]) => b.length - a.length)
      .map(([zone, zoneOrders]) => {
        // Suggest driver: prefer driver whose zone matches, then first available
        const availableDrivers = drivers.filter(d => d.status === 'Available');
        const zoneMatchDriver = availableDrivers.find(
          d => d.zone?.toLowerCase() === zone.toLowerCase()
        );
        const suggestedDriver = zoneMatchDriver ?? availableDrivers[0] ?? null;

        return {
          zone,
          color: getZoneColor(zone),
          orders: zoneOrders.sort((a, b) => a.deliveryWindow.localeCompare(b.deliveryWindow)),
          suggestedDriver,
          estimatedMinutes: estimateETA(zoneOrders.length, zoneOrders[0]?.deliveryWindow ?? ''),
        };
      });
  })();

  const totalOrders = orders.length;
  const assignedCount = orders.filter(o => o.driver).length;
  const unassignedCount = totalOrders - assignedCount;
  const availableDriverCount = drivers.filter(d => d.status === 'Available').length;

  return (
    <div className="card p-4 md:p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: 'hsl(var(--primary) / 0.1)' }}
          >
            <Navigation size={16} style={{ color: 'hsl(var(--primary))' }} />
          </div>
          <div>
            <h3 className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
              Route Optimisation
            </h3>
            <p className="text-[11px]" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Today's deliveries grouped by zone
            </p>
          </div>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing || loading}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors"
          style={{
            borderColor: 'hsl(var(--border))',
            color: 'hsl(var(--muted-foreground))',
            backgroundColor: 'hsl(var(--secondary) / 0.5)',
          }}
        >
          <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {[
          { label: 'Total Deliveries', value: totalOrders, icon: Package, color: 'hsl(var(--primary))' },
          { label: 'Assigned', value: assignedCount, icon: CheckCircle2, color: 'hsl(142 69% 35%)' },
          { label: 'Unassigned', value: unassignedCount, icon: AlertCircle, color: unassignedCount > 0 ? 'hsl(38 92% 45%)' : 'hsl(var(--muted-foreground))' },
          { label: 'Available Drivers', value: availableDriverCount, icon: Truck, color: 'hsl(213 79% 45%)' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div
            key={label}
            className="rounded-lg border p-3 flex flex-col gap-1"
            style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--secondary) / 0.3)' }}
          >
            <div className="flex items-center gap-1.5">
              <Icon size={12} style={{ color }} />
              <span className="text-[10px] font-medium uppercase tracking-wide" style={{ color: 'hsl(var(--muted-foreground))' }}>
                {label}
              </span>
            </div>
            {loading ? (
              <div className="h-6 w-8 rounded animate-pulse" style={{ backgroundColor: 'hsl(var(--secondary))' }} />
            ) : (
              <span className="text-xl font-bold tabular-nums" style={{ color }}>
                {value}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Zone groups */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div
              key={i}
              className="h-16 rounded-xl animate-pulse"
              style={{ backgroundColor: 'hsl(var(--secondary))' }}
            />
          ))}
        </div>
      ) : zoneGroups.length === 0 ? (
        <div
          className="rounded-xl border border-dashed flex flex-col items-center justify-center py-10 gap-2"
          style={{ borderColor: 'hsl(var(--border))' }}
        >
          <MapPin size={28} style={{ color: 'hsl(var(--muted-foreground))' }} />
          <p className="text-sm font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>
            No deliveries scheduled for today
          </p>
          <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Delivery orders will appear here grouped by zone
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {zoneGroups.map(group => (
            <ZoneCard
              key={group.zone}
              group={group}
              drivers={drivers}
              onAssign={handleAssign}
            />
          ))}
        </div>
      )}

      {/* Footer */}
      {!loading && zoneGroups.length > 0 && (
        <div className="mt-3 flex items-center justify-between">
          <p className="text-[11px]" style={{ color: 'hsl(var(--muted-foreground))' }}>
            {zoneGroups.length} zone{zoneGroups.length !== 1 ? 's' : ''} · Last updated {lastRefreshed?.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) ?? '—'}
          </p>
          <div className="flex items-center gap-1 text-[11px]" style={{ color: 'hsl(var(--muted-foreground))' }}>
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            Live
          </div>
        </div>
      )}
    </div>
  );
}
