'use client';

import { useState, useEffect, useCallback } from 'react';
import { ordersService, AppOrder, AppDriver, mapDbOrderToApp } from '@/lib/services/ordersService';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { Truck, Package, MapPin, Clock, CheckCircle2, RefreshCw, ChevronRight, Phone, ChevronDown, Loader2 } from 'lucide-react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import DriverOrderDetail from './DriverOrderDetail';
import dynamic from 'next/dynamic';

const DriverRouteMap = dynamic(() => import('./DriverRouteMap'), { ssr: false });

const STATUS_FLOW = [
  'Booking Accepted',
  'Booking Assigned',
  'Booking Out For Delivery',
  'Booking Complete',
];

const STATUS_COLORS: Record<string, string> = {
  'Booking Accepted': 'hsl(38 92% 50%)',
  'Booking Assigned': 'hsl(217 91% 60%)',
  'Booking Out For Delivery': 'hsl(262 83% 58%)',
  'Booking Complete': 'hsl(142 69% 35%)',
  'Booking Cancelled': 'hsl(0 84% 60%)',
};

type AvailabilityStatus = 'Available' | 'On Route' | 'Off Duty';

const AVAILABILITY_OPTIONS: AvailabilityStatus[] = ['Available', 'On Route', 'Off Duty'];

const AVAILABILITY_STYLES: Record<AvailabilityStatus, { bg: string; text: string }> = {
  Available: { bg: 'hsl(142 69% 35% / 0.12)', text: 'hsl(142 69% 35%)' },
  'On Route': { bg: 'hsl(262 83% 58% / 0.12)', text: 'hsl(262 83% 58%)' },
  'Off Duty': { bg: 'hsl(var(--secondary))', text: 'hsl(var(--muted-foreground))' },
};

export default function DriverPortalContent() {
  const [orders, setOrders] = useState<AppOrder[]>([]);
  const [driver, setDriver] = useState<AppDriver | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'completed'>('active');
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const supabase = createClient();

  const loadDriverAndOrders = useCallback(async () => {
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

      let currentDriver: AppDriver | null = null;

      if (driverData) {
        currentDriver = {
          id: driverData.id,
          name: driverData.name,
          phone: driverData.phone,
          vehicle: driverData.vehicle,
          plate: driverData.plate,
          status: driverData.status,
          avatar: driverData.avatar,
        };
        setDriver(currentDriver);

        const { data: ordersData, error } = await supabase
          .from('orders')
          .select('*, drivers(*)')
          .eq('driver_id', driverData.id)
          .order('booking_date', { ascending: false });

        if (!error && ordersData) {
          const mapped = ordersData.map((row: any) => mapDbOrderToApp(row));
          setOrders(mapped);
        }
      } else {
        const allOrders = await ordersService.fetchAllOrders();
        setOrders(allOrders);
        toast.info('No driver profile linked. Showing all orders.');
      }
    } catch (err) {
      console.error('Driver portal load error:', err);
      toast.error('Failed to load orders');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDriverAndOrders();
  }, [loadDriverAndOrders]);

  // Real-time subscription for orders
  useEffect(() => {
    const channel = supabase
      .channel('driver-portal-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        loadDriverAndOrders();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [loadDriverAndOrders]);

  // Real-time subscription for this driver's own record (status changes from admin/staff)
  useEffect(() => {
    if (!driver?.id) return;

    const channel = supabase
      .channel(`driver-self-${driver.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'drivers', filter: `id=eq.${driver.id}` },
        (payload) => {
          const updated = payload.new as any;
          setDriver((prev) => prev ? { ...prev, status: updated.status } : prev);
          toast.info(`Your availability was updated to "${updated.status}" by dispatch.`);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [driver?.id]);

  // ─── Availability validation & update ────────────────────────────────────────

  const validateStatusChange = (newStatus: AvailabilityStatus): string | null => {
    const activeOrders = orders.filter(
      (o) => o.status !== 'Booking Complete' && o.status !== 'Booking Cancelled'
    );

    if (newStatus === 'Off Duty' && activeOrders.length > 0) {
      return `You have ${activeOrders.length} active delivery${activeOrders.length > 1 ? 'ies' : ''} in progress. Complete or reassign them before going Off Duty.`;
    }

    if (newStatus === 'Available' && driver?.status === 'On Route') {
      const outForDelivery = orders.filter((o) => o.status === 'Booking Out For Delivery');
      if (outForDelivery.length > 0) {
        return `You have ${outForDelivery.length} delivery${outForDelivery.length > 1 ? 'ies' : ''} currently out for delivery. Mark them complete before setting yourself as Available.`;
      }
    }

    return null;
  };

  const handleStatusChange = async (newStatus: AvailabilityStatus) => {
    if (!driver) return;
    if (newStatus === driver.status) {
      setStatusDropdownOpen(false);
      return;
    }

    const validationError = validateStatusChange(newStatus);
    if (validationError) {
      toast.error(validationError, { duration: 5000 });
      setStatusDropdownOpen(false);
      return;
    }

    setUpdatingStatus(true);
    setStatusDropdownOpen(false);

    try {
      const { error } = await supabase
        .from('drivers')
        .update({ status: newStatus })
        .eq('id', driver.id);

      if (error) throw error;

      setDriver((prev) => prev ? { ...prev, status: newStatus } : prev);
      toast.success(`Availability updated to "${newStatus}"`);
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to update availability');
    } finally {
      setUpdatingStatus(false);
    }
  };

  // ─── Derived state ────────────────────────────────────────────────────────────

  const filteredOrders = orders.filter((o) => {
    if (activeFilter === 'active') return o.status !== 'Booking Complete' && o.status !== 'Booking Cancelled';
    if (activeFilter === 'completed') return o.status === 'Booking Complete';
    return true;
  });

  const activeCount = orders.filter(o => o.status !== 'Booking Complete' && o.status !== 'Booking Cancelled').length;
  const completedCount = orders.filter(o => o.status === 'Booking Complete').length;

  if (selectedOrderId) {
    const order = orders.find(o => o.id === selectedOrderId);
    if (order) {
      return (
        <DriverOrderDetail
          order={order}
          onBack={() => setSelectedOrderId(null)}
          onStatusUpdate={(updatedOrder) => {
            setOrders(prev => prev.map(o => o.id === updatedOrder.id ? updatedOrder : o));
            setSelectedOrderId(null);
          }}
        />
      );
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Driver Info Card */}
      {driver && (
        <div
          className="rounded-xl border p-4 flex items-center gap-4"
          style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
        >
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
            style={{ backgroundColor: 'hsl(var(--primary))', color: 'white' }}
          >
            {driver.avatar || driver.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm" style={{ color: 'hsl(var(--foreground))' }}>{driver.name}</p>
            <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
              {driver.vehicle} · {driver.plate}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Availability Status Dropdown */}
            <div className="relative">
              <button
                onClick={() => setStatusDropdownOpen((v) => !v)}
                disabled={updatingStatus}
                className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full transition-colors"
                style={{
                  backgroundColor: AVAILABILITY_STYLES[driver.status as AvailabilityStatus]?.bg ?? 'hsl(var(--secondary))',
                  color: AVAILABILITY_STYLES[driver.status as AvailabilityStatus]?.text ?? 'hsl(var(--muted-foreground))',
                }}
                title="Change availability"
              >
                {updatingStatus ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : null}
                {driver.status}
                <ChevronDown size={12} />
              </button>

              {statusDropdownOpen && (
                <>
                  {/* Backdrop */}
                  <div className="fixed inset-0 z-10" onClick={() => setStatusDropdownOpen(false)} />
                  <div
                    className="absolute right-0 top-full mt-1 z-20 rounded-lg border shadow-lg overflow-hidden min-w-[140px]"
                    style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
                  >
                    {AVAILABILITY_OPTIONS.map((opt) => (
                      <button
                        key={opt}
                        onClick={() => handleStatusChange(opt)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors hover:bg-secondary"
                        style={{ color: 'hsl(var(--foreground))' }}
                      >
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: AVAILABILITY_STYLES[opt].text }}
                        />
                        {opt}
                        {opt === driver.status && (
                          <span className="ml-auto text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>✓</span>
                        )}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            <a
              href={`tel:${driver.phone}`}
              className="p-2 rounded-lg transition-colors hover:bg-secondary"
              title="Call dispatch"
            >
              <Phone size={15} style={{ color: 'hsl(var(--muted-foreground))' }} />
            </a>
          </div>
        </div>
      )}

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total', value: orders.length, icon: Package, color: 'hsl(217 91% 60%)' },
          { label: 'Active', value: activeCount, icon: Truck, color: 'hsl(262 83% 58%)' },
          { label: 'Completed', value: completedCount, icon: CheckCircle2, color: 'hsl(142 69% 35%)' },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border p-4 flex flex-col gap-1"
            style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
          >
            <stat.icon size={18} style={{ color: stat.color }} />
            <p className="text-2xl font-bold mt-1" style={{ color: 'hsl(var(--foreground))' }}>{stat.value}</p>
            <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Route Map */}
      <DriverRouteMap orders={orders} driverName={driver?.name} />

      {/* Filter Tabs + Refresh */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 p-1 rounded-lg" style={{ backgroundColor: 'hsl(var(--secondary))' }}>
          {(['active', 'completed', 'all'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setActiveFilter(f)}
              className="px-3 py-1.5 rounded-md text-xs font-medium transition-all capitalize"
              style={{
                backgroundColor: activeFilter === f ? 'hsl(var(--card))' : 'transparent',
                color: activeFilter === f ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))',
                boxShadow: activeFilter === f ? '0 1px 3px hsl(var(--border))' : 'none',
              }}
            >
              {f}
            </button>
          ))}
        </div>
        <button
          onClick={loadDriverAndOrders}
          className="p-2 rounded-lg transition-colors hover:bg-secondary"
          title="Refresh orders"
        >
          <RefreshCw size={15} style={{ color: 'hsl(var(--muted-foreground))' }} />
        </button>
      </div>

      {/* Orders List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-xl border p-4 animate-pulse"
              style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
            >
              <div className="h-4 rounded w-1/3 mb-2" style={{ backgroundColor: 'hsl(var(--secondary))' }} />
              <div className="h-3 rounded w-2/3 mb-1" style={{ backgroundColor: 'hsl(var(--secondary))' }} />
              <div className="h-3 rounded w-1/2" style={{ backgroundColor: 'hsl(var(--secondary))' }} />
            </div>
          ))}
        </div>
      ) : filteredOrders.length === 0 ? (
        <div
          className="rounded-xl border p-12 text-center"
          style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
        >
          <Package size={40} className="mx-auto mb-3" style={{ color: 'hsl(var(--muted-foreground))' }} />
          <p className="font-medium text-sm" style={{ color: 'hsl(var(--foreground))' }}>No orders found</p>
          <p className="text-xs mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
            {activeFilter === 'active' ? 'No active deliveries assigned to you.' : 'No orders in this category.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredOrders.map((order) => (
            <button
              key={order.id}
              onClick={() => setSelectedOrderId(order.id)}
              className="w-full text-left rounded-xl border p-4 transition-all hover:shadow-md group"
              style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="font-semibold text-sm" style={{ color: 'hsl(var(--foreground))' }}>
                      {order.id}
                    </span>
                    <StatusBadge status={order.status} />
                  </div>
                  <p className="text-sm font-medium truncate" style={{ color: 'hsl(var(--foreground))' }}>
                    {order.customer.name}
                  </p>
                  {order.deliveryAddress && (
                    <div className="flex items-start gap-1 mt-1">
                      <MapPin size={12} className="shrink-0 mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }} />
                      <p className="text-xs truncate" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        {order.deliveryAddress.line1}, {order.deliveryAddress.city}, {order.deliveryAddress.postcode}
                      </p>
                    </div>
                  )}
                  <div className="flex items-center gap-3 mt-2">
                    <div className="flex items-center gap-1">
                      <Clock size={11} style={{ color: 'hsl(var(--muted-foreground))' }} />
                      <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        {order.deliveryWindow}
                      </span>
                    </div>
                    <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                      {new Date(order.bookingDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                    </span>
                  </div>
                </div>
                <ChevronRight
                  size={18}
                  className="shrink-0 mt-1 transition-transform group-hover:translate-x-0.5"
                  style={{ color: 'hsl(var(--muted-foreground))' }}
                />
              </div>

              {/* Progress bar */}
              <div className="mt-3">
                <div className="flex gap-1">
                  {STATUS_FLOW.map((s, idx) => {
                    const currentIdx = STATUS_FLOW.indexOf(order.status);
                    const filled = idx <= currentIdx;
                    return (
                      <div
                        key={s}
                        className="flex-1 h-1 rounded-full transition-all"
                        style={{
                          backgroundColor: filled ? STATUS_COLORS[order.status] || 'hsl(var(--primary))' : 'hsl(var(--secondary))',
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
