'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { mapDbOrderToApp, AppOrder, AppDriver } from '@/lib/services/ordersService';
import { toast } from 'sonner';
import {
  Truck, Package, CheckCircle2, Clock, MapPin, Phone, ChevronRight,
  RefreshCw, Loader2, ChevronDown, Camera, Navigation, AlertCircle,
  Calendar, User, ArrowRight, Filter, X, PackageCheck, PackageOpen,
} from 'lucide-react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import DriverOrderDetail from './DriverOrderDetail';
import dynamic from 'next/dynamic';
import DriverPODUpload from '@/app/driver-portal/components/DriverPODUpload';


const DriverRouteMap = dynamic(() => import('./DriverRouteMap'), { ssr: false });

// ─── Types ────────────────────────────────────────────────────────────────────

type AvailabilityStatus = 'Available' | 'On Route' | 'Off Duty';
type FilterTab = 'today-deliveries' | 'today-collections' | 'all';

const AVAILABILITY_OPTIONS: AvailabilityStatus[] = ['Available', 'On Route', 'Off Duty'];

const AVAILABILITY_STYLES: Record<AvailabilityStatus, { bg: string; text: string; dot: string }> = {
  Available: { bg: 'hsl(142 69% 35% / 0.12)', text: 'hsl(142 69% 35%)', dot: 'hsl(142 69% 35%)' },
  'On Route': { bg: 'hsl(262 83% 58% / 0.12)', text: 'hsl(262 83% 58%)', dot: 'hsl(262 83% 58%)' },
  'Off Duty': { bg: 'hsl(var(--secondary))', text: 'hsl(var(--muted-foreground))', dot: 'hsl(var(--muted-foreground))' },
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function isCollection(order: AppOrder): boolean {
  const type = (order as any).bookingType ?? (order as any).booking_type ?? '';
  return type.toLowerCase().includes('collection');
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DriverDashboardContent() {
  const [allOrders, setAllOrders] = useState<AppOrder[]>([]);
  const [driver, setDriver] = useState<AppDriver | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<FilterTab>('today-deliveries');
  const [showMap, setShowMap] = useState(false);
  const [podOrderId, setPodOrderId] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState<string>('');
  const [showDatePicker, setShowDatePicker] = useState(false);

  const supabase = createClient();

  // ─── Data Loading ──────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Not authenticated');
        return;
      }

      const { data: driverData } = await supabase
        .from('drivers')
        .select('*')
        .eq('auth_user_id', user.id)
        .single();

      if (driverData) {
        setDriver({
          id: driverData.id,
          name: driverData.name,
          phone: driverData.phone,
          vehicle: driverData.vehicle,
          plate: driverData.plate,
          status: driverData.status,
          avatar: driverData.avatar,
        });

        const { data: ordersData, error } = await supabase
          .from('orders')
          .select('*, drivers(*)')
          .eq('driver_id', driverData.id)
          .order('booking_date', { ascending: false });

        if (!error && ordersData) {
          setAllOrders(ordersData.map((row: any) => mapDbOrderToApp(row)));
        }
      } else {
        const { data: ordersData } = await supabase
          .from('orders')
          .select('*, drivers(*)')
          .order('booking_date', { ascending: false });
        if (ordersData) {
          setAllOrders(ordersData.map((row: any) => mapDbOrderToApp(row)));
        }
        toast.info('No driver profile linked. Showing all orders.');
      }
    } catch (err) {
      console.error('Dashboard load error:', err);
      toast.error('Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    const channel = supabase
      .channel('driver-dashboard-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => { loadData(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadData]);

  useEffect(() => {
    if (!driver?.id) return;
    const channel = supabase
      .channel(`driver-dashboard-self-${driver.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'drivers', filter: `id=eq.${driver.id}` },
        (payload) => {
          const updated = payload.new as any;
          setDriver((prev) => prev ? { ...prev, status: updated.status } : prev);
          toast.info(`Availability updated to "${updated.status}" by dispatch.`);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [driver?.id]);

  // ─── Availability Update ───────────────────────────────────────────────────

  const handleAvailabilityChange = async (newStatus: AvailabilityStatus) => {
    if (!driver || newStatus === driver.status) {
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
      const { error } = await supabase.from('drivers').update({ status: newStatus }).eq('id', driver.id);
      if (error) throw error;
      setDriver((prev) => prev ? { ...prev, status: newStatus } : prev);
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

    if (nextStatus === 'Booking Complete') {
      setPodOrderId(order.id);
      return;
    }

    setUpdatingOrderId(order.id);
    try {
      const { error } = await supabase
        .from('orders')
        .update({ status: nextStatus, updated_at: new Date().toISOString() })
        .eq('id', order.id);
      if (error) throw error;
      setAllOrders((prev) => prev.map((o) => o.id === order.id ? { ...o, status: nextStatus } : o));
      toast.success(`Order ${order.id} → ${nextStatus}`);
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to update order status');
    } finally {
      setUpdatingOrderId(null);
    }
  };

  // ─── Derived State ─────────────────────────────────────────────────────────

  const today = getTodayStr();

  const todayDeliveries = allOrders.filter((o) => o.bookingDate === today && !isCollection(o));
  const todayCollections = allOrders.filter((o) => o.bookingDate === today && isCollection(o));

  const getDisplayOrders = (): AppOrder[] => {
    let base: AppOrder[] = [];
    if (activeTab === 'today-deliveries') base = todayDeliveries;
    else if (activeTab === 'today-collections') base = todayCollections;
    else base = allOrders;

    if (dateFilter && activeTab === 'all') {
      base = base.filter((o) => o.bookingDate === dateFilter);
    }

    return base;
  };

  const displayOrders = getDisplayOrders();

  const todayActive = [...todayDeliveries, ...todayCollections].filter(
    (o) => o.status !== 'Booking Complete' && o.status !== 'Booking Cancelled'
  ).length;
  const todayComplete = [...todayDeliveries, ...todayCollections].filter((o) => o.status === 'Booking Complete').length;
  const urgentCount = [...todayDeliveries, ...todayCollections].filter(isUrgent).length;

  // ─── Detail View ───────────────────────────────────────────────────────────

  if (selectedOrderId) {
    const order = allOrders.find((o) => o.id === selectedOrderId);
    if (order) {
      return (
        <DriverOrderDetail
          order={order}
          onBack={() => setSelectedOrderId(null)}
          onStatusUpdate={(updated) => {
            setAllOrders((prev) => prev.map((o) => o.id === updated.id ? updated : o));
            setSelectedOrderId(null);
          }}
        />
      );
    }
  }

  // ─── POD Quick Capture ─────────────────────────────────────────────────────

  if (podOrderId) {
    const order = allOrders.find((o) => o.id === podOrderId);
    if (order) {
      const DriverPODUpload = require('./DriverPODUpload').default;
      return (
        <div className="space-y-4 animate-fade-in">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setPodOrderId(null)}
              className="p-2 rounded-lg transition-colors hover:bg-secondary"
            >
              <ChevronRight size={18} className="rotate-180" style={{ color: 'hsl(var(--foreground))' }} />
            </button>
            <div>
              <h2 className="font-bold text-base" style={{ color: 'hsl(var(--foreground))' }}>Proof of Delivery</h2>
              <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                {order.id} · {order.customer.name}
              </p>
            </div>
          </div>
          <DriverPODUpload
            order={order}
            onComplete={() => {
              setAllOrders((prev) => prev.map((o) => o.id === order.id ? { ...o, status: 'Booking Complete' } : o));
              setPodOrderId(null);
              toast.success('Proof of delivery submitted!');
            }}
          />
        </div>
      );
    }
  }

  // ─── Main Dashboard ────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 animate-fade-in">

      {/* ── Driver Header Card ── */}
      {driver && (
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
              <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>{getGreeting()},</p>
              <p className="font-bold text-base leading-tight" style={{ color: 'hsl(var(--foreground))' }}>{driver.name}</p>
              <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                {driver.vehicle} · {driver.plate}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="relative">
                <button
                  onClick={() => setStatusDropdownOpen((v) => !v)}
                  disabled={updatingStatus}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full transition-colors"
                  style={{
                    backgroundColor: AVAILABILITY_STYLES[driver.status as AvailabilityStatus]?.bg ?? 'hsl(var(--secondary))',
                    color: AVAILABILITY_STYLES[driver.status as AvailabilityStatus]?.text ?? 'hsl(var(--muted-foreground))',
                  }}
                >
                  {updatingStatus ? (
                    <Loader2 size={11} className="animate-spin" />
                  ) : (
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: AVAILABILITY_STYLES[driver.status as AvailabilityStatus]?.dot }} />
                  )}
                  {driver.status}
                  <ChevronDown size={11} />
                </button>
                {statusDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setStatusDropdownOpen(false)} />
                    <div
                      className="absolute right-0 top-full mt-1 z-20 rounded-xl border shadow-lg overflow-hidden min-w-[150px]"
                      style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
                    >
                      {AVAILABILITY_OPTIONS.map((opt) => (
                        <button
                          key={opt}
                          onClick={() => handleAvailabilityChange(opt)}
                          className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs text-left transition-colors hover:bg-secondary"
                          style={{ color: 'hsl(var(--foreground))' }}
                        >
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: AVAILABILITY_STYLES[opt].dot }} />
                          {opt}
                          {opt === driver.status && (
                            <CheckCircle2 size={12} className="ml-auto" style={{ color: 'hsl(var(--primary))' }} />
                          )}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <a href={`tel:${driver.phone}`} className="p-2 rounded-lg transition-colors hover:bg-secondary" title="Call dispatch">
                <Phone size={15} style={{ color: 'hsl(var(--muted-foreground))' }} />
              </a>
            </div>
          </div>

          {/* Date banner */}
          <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg" style={{ backgroundColor: 'hsl(var(--secondary))' }}>
            <Calendar size={13} style={{ color: 'hsl(var(--primary))' }} />
            <span className="text-xs font-medium" style={{ color: 'hsl(var(--foreground))' }}>
              {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
          </div>
        </div>
      )}

      {/* ── KPI Summary ── */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "Today\'s Deliveries", value: todayDeliveries.length, icon: PackageOpen, color: 'hsl(217 91% 60%)', bg: 'hsl(217 91% 60% / 0.1)' },
          { label: "Today\'s Collections", value: todayCollections.length, icon: PackageCheck, color: 'hsl(262 83% 58%)', bg: 'hsl(262 83% 58% / 0.1)' },
          { label: 'Active Now', value: todayActive, icon: Truck, color: 'hsl(38 92% 50%)', bg: 'hsl(38 92% 50% / 0.1)' },
          {
            label: 'Completed Today',
            value: todayComplete,
            icon: CheckCircle2,
            color: 'hsl(142 69% 35%)',
            bg: 'hsl(142 69% 35% / 0.1)',
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border p-4 flex items-start gap-3"
            style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
          >
            <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: stat.bg }}>
              <stat.icon size={18} style={{ color: stat.color }} />
            </div>
            <div>
              <p className="text-2xl font-bold leading-none" style={{ color: 'hsl(var(--foreground))' }}>
                {loading ? '—' : stat.value}
              </p>
              <p className="text-xs mt-1 leading-tight" style={{ color: 'hsl(var(--muted-foreground))' }}>{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Route Map Toggle ── */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'hsl(var(--border))' }}>
        <button
          onClick={() => setShowMap((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 transition-colors hover:bg-secondary"
          style={{ backgroundColor: 'hsl(var(--card))' }}
        >
          <div className="flex items-center gap-2">
            <Navigation size={16} style={{ color: 'hsl(var(--primary))' }} />
            <span className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>Route Map</span>
            {todayActive > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: 'hsl(262 83% 58% / 0.12)', color: 'hsl(262 83% 58%)' }}>
                {todayActive} active
              </span>
            )}
          </div>
          <ChevronDown
            size={16}
            className="transition-transform"
            style={{ color: 'hsl(var(--muted-foreground))', transform: showMap ? 'rotate(180deg)' : 'rotate(0deg)' }}
          />
        </button>
        {showMap && (
          <div className="border-t" style={{ borderColor: 'hsl(var(--border))' }}>
            <DriverRouteMap orders={displayOrders} driverName={driver?.name} />
          </div>
        )}
      </div>

      {/* ── Filter Tabs ── */}
      <div>
        {/* Tab Row */}
        <div className="flex items-center gap-2 mb-3">
          <div className="flex-1 flex gap-1 p-1 rounded-xl" style={{ backgroundColor: 'hsl(var(--secondary))' }}>
            {([
              { key: 'today-deliveries', label: `Deliveries (${todayDeliveries.length})`, icon: PackageOpen },
              { key: 'today-collections', label: `Collections (${todayCollections.length})`, icon: PackageCheck },
              { key: 'all', label: `All (${allOrders.length})`, icon: Package },
            ] as const).map((tab) => (
              <button
                key={tab.key}
                onClick={() => { setActiveTab(tab.key); if (tab.key !== 'all') setDateFilter(''); }}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-medium transition-all"
                style={{
                  backgroundColor: activeTab === tab.key ? 'hsl(var(--card))' : 'transparent',
                  color: activeTab === tab.key ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))',
                  boxShadow: activeTab === tab.key ? '0 1px 3px hsl(var(--border))' : 'none',
                }}
              >
                <tab.icon size={13} />
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden">{tab.key === 'today-deliveries' ? `Del (${todayDeliveries.length})` : tab.key === 'today-collections' ? `Col (${todayCollections.length})` : `All (${allOrders.length})`}</span>
              </button>
            ))}
          </div>

          {/* Refresh */}
          <button
            onClick={loadData}
            disabled={loading}
            className="p-2 rounded-lg transition-colors hover:bg-secondary"
            title="Refresh"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} style={{ color: 'hsl(var(--muted-foreground))' }} />
          </button>
        </div>

        {/* Date Filter (only on All tab) */}
        {activeTab === 'all' && (
          <div className="flex items-center gap-2 mb-3">
            <div className="flex items-center gap-2 flex-1">
              <Filter size={14} style={{ color: 'hsl(var(--muted-foreground))' }} />
              <span className="text-xs font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>Filter by date:</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="text-xs px-3 py-1.5 rounded-lg border outline-none transition-colors"
                style={{
                  backgroundColor: 'hsl(var(--card))',
                  borderColor: dateFilter ? 'hsl(var(--primary))' : 'hsl(var(--border))',
                  color: 'hsl(var(--foreground))',
                }}
              />
              {dateFilter && (
                <button
                  onClick={() => setDateFilter('')}
                  className="p-1.5 rounded-lg transition-colors hover:bg-secondary"
                  title="Clear date filter"
                >
                  <X size={13} style={{ color: 'hsl(var(--muted-foreground))' }} />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Active filter summary */}
        {(activeTab === 'today-deliveries' || activeTab === 'today-collections') && (
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-lg mb-3"
            style={{ backgroundColor: activeTab === 'today-deliveries' ? 'hsl(217 91% 60% / 0.08)' : 'hsl(262 83% 58% / 0.08)' }}
          >
            {activeTab === 'today-deliveries' ? (
              <PackageOpen size={13} style={{ color: 'hsl(217 91% 60%)' }} />
            ) : (
              <PackageCheck size={13} style={{ color: 'hsl(262 83% 58%)' }} />
            )}
            <span className="text-xs font-medium" style={{ color: activeTab === 'today-deliveries' ? 'hsl(217 91% 60%)' : 'hsl(262 83% 58%)' }}>
              {activeTab === 'today-deliveries' ? `Showing today's ${todayDeliveries.length} delivery order${todayDeliveries.length !== 1 ? 's' : ''}`
                : `Showing today's ${todayCollections.length} collection order${todayCollections.length !== 1 ? 's' : ''}`}
            </span>
          </div>
        )}

        {dateFilter && activeTab === 'all' && (
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-lg mb-3"
            style={{ backgroundColor: 'hsl(var(--primary) / 0.08)' }}
          >
            <Calendar size={13} style={{ color: 'hsl(var(--primary))' }} />
            <span className="text-xs font-medium" style={{ color: 'hsl(var(--primary))' }}>
              {displayOrders.length} order{displayOrders.length !== 1 ? 's' : ''} on {new Date(dateFilter + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          </div>
        )}

        {/* Loading Skeletons */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-xl border p-4 animate-pulse" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
                <div className="h-4 rounded w-1/3 mb-3" style={{ backgroundColor: 'hsl(var(--secondary))' }} />
                <div className="h-3 rounded w-2/3 mb-2" style={{ backgroundColor: 'hsl(var(--secondary))' }} />
                <div className="h-3 rounded w-1/2 mb-3" style={{ backgroundColor: 'hsl(var(--secondary))' }} />
                <div className="h-8 rounded w-full" style={{ backgroundColor: 'hsl(var(--secondary))' }} />
              </div>
            ))}
          </div>
        ) : displayOrders.length === 0 ? (
          <div
            className="rounded-xl border p-12 text-center"
            style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
          >
            {activeTab === 'today-deliveries' ? (
              <PackageOpen size={40} className="mx-auto mb-3" style={{ color: 'hsl(var(--muted-foreground))' }} />
            ) : activeTab === 'today-collections' ? (
              <PackageCheck size={40} className="mx-auto mb-3" style={{ color: 'hsl(var(--muted-foreground))' }} />
            ) : (
              <Package size={40} className="mx-auto mb-3" style={{ color: 'hsl(var(--muted-foreground))' }} />
            )}
            <p className="font-semibold text-sm" style={{ color: 'hsl(var(--foreground))' }}>
              {activeTab === 'today-deliveries' ? 'No deliveries today' :
               activeTab === 'today-collections'? 'No collections today' : dateFilter ?'No orders on this date' : 'No orders found'}
            </p>
            <p className="text-xs mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
              {activeTab === 'today-deliveries' ? 'No delivery orders assigned for today.' :
               activeTab === 'today-collections' ? 'No collection orders assigned for today.' :
               dateFilter ? 'Try a different date or clear the filter.' : 'No orders assigned to you yet.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {displayOrders.map((order) => {
              const nextStatusLabel = NEXT_STATUS_LABEL[order.status];
              const isComplete = order.status === 'Booking Complete';
              const isCancelled = order.status === 'Booking Cancelled';
              const isUpdating = updatingOrderId === order.id;
              const urgent = isUrgent(order);
              const accentColor = STATUS_ACCENT[order.status] ?? 'hsl(var(--primary))';
              const orderIsCollection = isCollection(order);

              return (
                <div
                  key={order.id}
                  className="rounded-xl border overflow-hidden"
                  style={{
                    backgroundColor: 'hsl(var(--card))',
                    borderColor: urgent ? 'hsl(0 84% 60% / 0.4)' : 'hsl(var(--border))',
                  }}
                >
                  {/* Urgent Banner */}
                  {urgent && (
                    <div className="flex items-center gap-2 px-4 py-1.5" style={{ backgroundColor: 'hsl(0 84% 60% / 0.08)' }}>
                      <AlertCircle size={12} style={{ color: 'hsl(0 84% 60%)' }} />
                      <span className="text-xs font-medium" style={{ color: 'hsl(0 84% 60%)' }}>
                        Urgent — delivery window approaching
                      </span>
                    </div>
                  )}

                  {/* Card Body */}
                  <div className="p-4">
                    {/* Header Row */}
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="font-bold text-sm" style={{ color: 'hsl(var(--foreground))' }}>{order.id}</span>
                          <StatusBadge status={order.status} />
                          {/* Booking type badge */}
                          <span
                            className="text-xs px-2 py-0.5 rounded-full font-medium"
                            style={{
                              backgroundColor: orderIsCollection ? 'hsl(262 83% 58% / 0.12)' : 'hsl(217 91% 60% / 0.12)',
                              color: orderIsCollection ? 'hsl(262 83% 58%)' : 'hsl(217 91% 60%)',
                            }}
                          >
                            {orderIsCollection ? '↑ Collection' : '↓ Delivery'}
                          </span>
                        </div>
                        {/* Status Progress Bar */}
                        <div className="flex gap-0.5 mt-1.5">
                          {STATUS_FLOW.map((s, idx) => {
                            const currentIdx = STATUS_FLOW.indexOf(order.status);
                            const filled = idx <= currentIdx;
                            return (
                              <div
                                key={s}
                                className="flex-1 h-1 rounded-full transition-all"
                                style={{ backgroundColor: filled ? accentColor : 'hsl(var(--secondary))' }}
                              />
                            );
                          })}
                        </div>
                      </div>
                      <button
                        onClick={() => setSelectedOrderId(order.id)}
                        className="p-1.5 rounded-lg transition-colors hover:bg-secondary shrink-0"
                        title="View full details"
                      >
                        <ChevronRight size={16} style={{ color: 'hsl(var(--muted-foreground))' }} />
                      </button>
                    </div>

                    {/* Customer Details */}
                    <div className="rounded-lg p-3 mb-3 space-y-2" style={{ backgroundColor: 'hsl(var(--secondary))' }}>
                      <div className="flex items-center gap-2">
                        <User size={13} style={{ color: 'hsl(var(--primary))' }} />
                        <span className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>{order.customer.name}</span>
                      </div>
                      {order.customer.phone && (
                        <a href={`tel:${order.customer.phone}`} className="flex items-center gap-2 group" onClick={(e) => e.stopPropagation()}>
                          <Phone size={12} style={{ color: 'hsl(var(--primary))' }} />
                          <span className="text-xs font-medium underline-offset-2 group-hover:underline" style={{ color: 'hsl(var(--primary))' }}>
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
                          {order.deliveryWindow}{' · '}
                          {new Date(order.bookingDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
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
                            ) : order.status === 'Booking Out For Delivery' ? (
                              <><Camera size={14} />Capture POD</>
                            ) : (
                              <><ArrowRight size={14} />{nextStatusLabel}</>
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
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg font-medium text-sm transition-colors hover:bg-secondary border"
                            style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                            title="Open in Google Maps"
                          >
                            <Navigation size={14} style={{ color: 'hsl(var(--primary))' }} />
                            <span className="text-xs">Navigate</span>
                          </a>
                        )}
                      </div>
                    )}

                    {isComplete && (
                      <div className="flex items-center gap-2 py-2 px-3 rounded-lg" style={{ backgroundColor: 'hsl(142 69% 35% / 0.1)' }}>
                        <CheckCircle2 size={15} style={{ color: 'hsl(142 69% 35%)' }} />
                        <span className="text-sm font-medium" style={{ color: 'hsl(142 69% 35%)' }}>
                          {orderIsCollection ? 'Collection Complete' : 'Delivery Complete'}
                        </span>
                        {order.pod?.completedAt && (
                          <span className="text-xs ml-auto" style={{ color: 'hsl(var(--muted-foreground))' }}>
                            {new Date(order.pod.completedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>
                    )}

                    {isCancelled && (
                      <div className="flex items-center gap-2 py-2 px-3 rounded-lg" style={{ backgroundColor: 'hsl(0 84% 60% / 0.08)' }}>
                        <AlertCircle size={15} style={{ color: 'hsl(0 84% 60%)' }} />
                        <span className="text-sm font-medium" style={{ color: 'hsl(0 84% 60%)' }}>Booking Cancelled</span>
                      </div>
                    )}
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
