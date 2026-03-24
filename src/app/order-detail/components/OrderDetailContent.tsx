'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  ArrowLeft, ChevronRight, Edit3, Trash2, CheckCircle2, Truck, Clock, Circle,
  Package, CreditCard, FileImage, Calendar, AlertTriangle, RefreshCw, ExternalLink, ChevronDown,
  Search,
} from 'lucide-react';
import { StatusBadge, TypeBadge } from '@/components/ui/StatusBadge';
import type { BookingStatus } from '@/components/ui/StatusBadge';
import Modal from '@/components/ui/Modal';
import OrderDetailsTab from './OrderDetailsTab';
import PaymentTab from './PaymentTab';
import ProofOfDeliveryTab from './ProofOfDeliveryTab';
import { ordersService, AppOrder } from '@/lib/services/ordersService';
import Icon from '@/components/ui/AppIcon';
import { createClient } from '@/lib/supabase/client';


type TabKey = 'details' | 'payment' | 'pod';

const STATUS_FLOW: BookingStatus[] = [
  'Booking Accepted',
  'Booking Assigned',
  'Booking Out For Delivery',
  'Booking Complete',
];

const STATUS_ICONS: Record<BookingStatus, React.ElementType> = {
  'Booking Accepted': Clock,
  'Booking Assigned': Circle,
  'Booking Out For Delivery': Truck,
  'Booking Complete': CheckCircle2,
};

interface Props {
  orderId: string | null;
}

function OrderLookup() {
  const router = useRouter();
  const [allOrders, setAllOrders] = useState<AppOrder[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingOrders, setLoadingOrders] = useState(true);

  useEffect(() => {
    ordersService.fetchAllOrders().then((data) => {
      setAllOrders(data);
      setLoadingOrders(false);
    });
  }, []);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return allOrders;
    const q = searchQuery.toLowerCase();
    return allOrders.filter(
      (o) =>
        o.id.toLowerCase().includes(q) ||
        o.customer.name.toLowerCase().includes(q) ||
        o.customer.email?.toLowerCase().includes(q) ||
        o.customer.phone?.toLowerCase().includes(q) ||
        o.wooOrderId?.toLowerCase().includes(q) ||
        o.status?.toLowerCase().includes(q)
    );
  }, [allOrders, searchQuery]);

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="card p-6 md:p-8 flex flex-col items-center gap-4 text-center">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center"
          style={{ backgroundColor: 'hsl(var(--primary) / 0.1)' }}
        >
          <Search size={28} style={{ color: 'hsl(var(--primary))' }} />
        </div>
        <h2 className="text-lg font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
          Order Lookup
        </h2>
        <p className="text-sm max-w-md" style={{ color: 'hsl(var(--muted-foreground))' }}>
          Search by order ID, customer name, email, phone, or WooCommerce ID to view booking details.
        </p>
      </div>

      <div className="card overflow-hidden">
        <div className="p-4 border-b" style={{ borderColor: 'hsl(var(--border))' }}>
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2"
              style={{ color: 'hsl(var(--muted-foreground))' }}
            />
            <input
              type="text"
              placeholder="Search orders..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 rounded-lg border text-sm outline-none transition-colors focus:ring-2"
              style={{
                borderColor: 'hsl(var(--border))',
                backgroundColor: 'hsl(var(--background))',
                color: 'hsl(var(--foreground))',
              }}
              autoFocus
            />
          </div>
        </div>

        {loadingOrders ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-14 rounded-lg skeleton" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
              {searchQuery ? 'No orders match your search.' : 'No orders found.'}
            </p>
          </div>
        ) : (
          <div className="divide-y max-h-[60vh] overflow-y-auto" style={{ borderColor: 'hsl(var(--border))' }}>
            {filtered.slice(0, 50).map((o) => (
              <button
                key={o.id}
                onClick={() => router.push(`/order-detail?id=${o.id}`)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-secondary/50 transition-colors touch-manipulation"
              >
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: 'hsl(var(--primary) / 0.1)' }}
                >
                  <Package size={16} style={{ color: 'hsl(var(--primary))' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate" style={{ color: 'hsl(var(--foreground))' }}>
                      {o.customer.name}
                    </span>
                    <StatusBadge status={o.status as BookingStatus} />
                  </div>
                  <div className="flex items-center gap-2 text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    <span className="font-mono">{o.id}</span>
                    <span>·</span>
                    <span>
                      {new Date(o.bookingDate).toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                  </div>
                </div>
                <ChevronRight size={16} className="shrink-0" style={{ color: 'hsl(var(--muted-foreground))' }} />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function OrderDetailContent({ orderId }: Props) {
  const router = useRouter();
  const [order, setOrder] = useState<AppOrder | null>(null);
  const [loading, setLoading] = useState(!!orderId);
  const [notFound, setNotFound] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('details');
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<BookingStatus | null>(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [headerExpanded, setHeaderExpanded] = useState(true);
  const [actionsOpen, setActionsOpen] = useState(false);

  const loadOrder = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    const data = await ordersService.fetchOrderById(orderId);
    if (!data) {
      setNotFound(true);
    } else {
      setOrder(data);
    }
    setLoading(false);
  }, [orderId]);

  useEffect(() => {
    loadOrder();
  }, [loadOrder]);

  // ── Real-time subscription ───────────────────────────────────────────────────
  useEffect(() => {
    if (!orderId) return;

    const supabase = createClient();

    // Track previous field values to detect what changed
    let prevStatus: string | null = null;
    let prevDriverId: string | null = null;
    let prevPaymentStatus: string | null = null;

    const orderChannel = supabase
      .channel(`order_detail_rt_${orderId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` },
        async (payload) => {
          const next = payload.new as Record<string, unknown>;
          const prev = payload.old as Record<string, unknown>;

          const { data } = await supabase
            .from('orders')
            .select('*, drivers(*)')
            .eq('id', orderId)
            .single();

          if (data) {
            setOrder(data as unknown as AppOrder);

            // Status change
            if (prev.status !== next.status) {
              toast.info(`Status updated to "${next.status}"`, { duration: 5000 });
              prevStatus = next.status as string;
            }
            // Driver assignment change
            else if (prev.driver_id !== next.driver_id) {
              const driverName = (data as any)?.drivers?.name ?? 'a driver';
              if (next.driver_id) {
                toast.info(`Driver assigned: ${driverName}`, { duration: 5000 });
              } else {
                toast.info('Driver unassigned from this booking', { duration: 5000 });
              }
              prevDriverId = next.driver_id as string | null;
            }
            // Payment status change
            else if (prev.payment_status !== next.payment_status) {
              toast.info(`Payment status updated to "${next.payment_status}"`, { duration: 5000 });
              prevPaymentStatus = next.payment_status as string;
            }
            // POD uploaded
            else if (!prev.pod && next.pod) {
              toast.success('Proof of delivery uploaded', { duration: 5000 });
            }
            // Generic fallback
            else {
              toast.info('Booking details updated', { duration: 3000 });
            }
          }
        }
      )
      .subscribe();

    // Listen for the assigned driver's status changes
    const driverChannel = supabase
      .channel(`order_detail_driver_rt_${orderId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'drivers' },
        (payload) => {
          const prev = payload.old as Record<string, unknown>;
          const next = payload.new as Record<string, unknown>;

          // Only react if this is the driver assigned to this order
          setOrder((currentOrder) => {
            if (!currentOrder || currentOrder.driver?.id !== next.id) return currentOrder;

            if (prev.status !== next.status) {
              toast.info(`Driver ${next.name}: status → ${next.status}`, { duration: 5000 });
            }

            return {
              ...currentOrder,
              driver: currentOrder.driver
                ? {
                    ...currentOrder.driver,
                    status: next.status as 'Available' | 'On Route' | 'Off Duty',
                    name: (next.name as string) ?? currentOrder.driver.name,
                  }
                : currentOrder.driver,
            };
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(orderChannel);
      supabase.removeChannel(driverChannel);
    };
  }, [orderId]);

  // ── Derived values ───────────────────────────────────────────────────────────
  const currentStatus = (order?.status ?? 'Booking Accepted') as BookingStatus;
  const currentStatusIndex = STATUS_FLOW.indexOf(currentStatus);

  const handleAdvanceStatus = () => {
    if (currentStatusIndex < STATUS_FLOW.length - 1) {
      setPendingStatus(STATUS_FLOW[currentStatusIndex + 1]);
      setStatusModalOpen(true);
    }
  };

  const confirmStatusChange = async () => {
    if (!pendingStatus || !order) return;
    setIsUpdatingStatus(true);
    const ok = await ordersService.updateOrderStatus(order.id, pendingStatus);
    setIsUpdatingStatus(false);
    setStatusModalOpen(false);
    if (ok) {
      setOrder((prev) => prev ? { ...prev, status: pendingStatus } : prev);
      toast.success(`Status updated to "${pendingStatus}"`);

      // Send status notification email to customer (fire-and-forget)
      fetch('/api/orders/send-status-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerEmail: order.customer.email,
          customerName: order.customer.name,
          orderId: order.id,
          status: pendingStatus,
          bookingDate: order.bookingDate,
          deliveryWindow: order.deliveryWindow,
        }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.success) {
            toast.success(`Email notification sent to ${order.customer.email}`);
          } else {
            console.warn('Email notification failed:', data.error);
          }
        })
        .catch((err) => console.warn('Email notification error:', err));
    } else {
      toast.error('Failed to update status. Please try again.');
    }
    setPendingStatus(null);
  };

  const handleDelete = async () => {
    if (!order) return;
    const ok = await ordersService.deleteOrder(order.id);
    if (ok) {
      toast.success(`Booking ${order.id} deleted`);
      setDeleteModalOpen(false);
      router.push('/orders-dashboard');
    } else {
      toast.error('Failed to delete booking.');
    }
  };

  if (!orderId) {
    return <OrderLookup />;
  }

  if (loading) {
    return (
      <div className="space-y-5 animate-fade-in">
        <div className="h-4 w-48 rounded skeleton" />
        <div className="card p-4 md:p-6 space-y-4">
          <div className="flex gap-4">
            <div className="w-12 h-12 rounded-xl skeleton" />
            <div className="space-y-2 flex-1">
              <div className="h-5 w-48 rounded skeleton" />
              <div className="h-3 w-72 rounded skeleton" />
            </div>
          </div>
          <div className="h-12 rounded skeleton mt-4" />
        </div>
        <div className="card p-4 md:p-6">
          <div className="h-64 rounded skeleton" />
        </div>
      </div>
    );
  }

  // ── Not found ────────────────────────────────────────────────────────────────
  if (notFound || !order) {
    return (
      <div className="card p-8 md:p-12 flex flex-col items-center gap-4 text-center">
        <AlertTriangle size={40} style={{ color: 'hsl(var(--destructive))' }} />
        <h2 className="text-lg font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
          Order not found
        </h2>
        <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
          {orderId
            ? `No order with ID "${orderId}" exists in the database.`
            : 'No order ID was provided. Please navigate from the Orders Dashboard.'}
        </p>
        <button className="btn-secondary" onClick={() => router.push('/orders-dashboard')}>
          <ArrowLeft size={14} />
          Back to Orders Dashboard
        </button>
      </div>
    );
  }

  const tabs: Array<{ key: TabKey; label: string; icon: React.ElementType; badge?: string }> = [
    { key: 'details', label: 'Details', icon: Package },
    { key: 'payment', label: 'Payment', icon: CreditCard, badge: order.payment.status === 'Unpaid' ? '!' : undefined },
    { key: 'pod', label: 'Proof of Delivery', icon: FileImage, badge: !order.pod ? '!' : undefined },
  ];

  return (
    <div className="space-y-4 md:space-y-5 animate-fade-in">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
        <button
          onClick={() => router.push('/orders-dashboard')}
          className="hover:underline flex items-center gap-1 touch-manipulation py-1"
        >
          <ArrowLeft size={12} />
          Orders Dashboard
        </button>
        <ChevronRight size={12} />
        <span className="truncate max-w-[160px]" style={{ color: 'hsl(var(--foreground))' }}>{order.id}</span>
      </div>

      {/* Header card */}
      <div className="card overflow-hidden">
        {/* Mobile collapsible toggle */}
        <button
          className="md:hidden w-full flex items-center justify-between px-4 py-3 border-b touch-manipulation"
          style={{ borderColor: 'hsl(var(--border))' }}
          onClick={() => setHeaderExpanded((v) => !v)}
          aria-expanded={headerExpanded}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Package size={15} style={{ color: 'hsl(var(--primary))' }} />
            <span className="text-sm font-semibold truncate" style={{ color: 'hsl(var(--foreground))' }}>
              {order.customer.name}
            </span>
            <StatusBadge status={currentStatus} />
          </div>
          <ChevronDown
            size={16}
            className={`shrink-0 transition-transform duration-200 ${headerExpanded ? 'rotate-180' : ''}`}
            style={{ color: 'hsl(var(--muted-foreground))' }}
          />
        </button>

        <div className={`${headerExpanded ? 'block' : 'hidden'} md:block p-4 md:p-6`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            {/* Left: order identity */}
            <div className="flex items-start gap-3 md:gap-4 min-w-0">
              <div
                className="w-10 h-10 md:w-12 md:h-12 rounded-xl flex items-center justify-center shrink-0"
                style={{ backgroundColor: 'hsl(var(--primary) / 0.1)' }}
              >
                <Package size={20} style={{ color: 'hsl(var(--primary))' }} />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <h2 className="text-lg md:text-xl font-bold" style={{ color: 'hsl(var(--foreground))' }}>
                    {order.customer.name}
                  </h2>
                  <StatusBadge status={currentStatus} />
                  <TypeBadge type={order.type} />
                </div>
                <div className="flex flex-wrap items-center gap-2 md:gap-3 text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  <span className="font-mono font-medium" style={{ color: 'hsl(var(--primary))' }}>
                    {order.id}
                  </span>
                  <span className="hidden sm:inline">·</span>
                  <span className="hidden sm:inline font-mono">WooCommerce {order.wooOrderId}</span>
                  <span>·</span>
                  <span className="flex items-center gap-1">
                    <Calendar size={11} />
                    {new Date(order.bookingDate).toLocaleDateString('en-GB', {
                      weekday: 'short',
                      day: '2-digit',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </span>
                  <span>·</span>
                  <span>{order.deliveryWindow}</span>
                </div>
              </div>
            </div>

            {/* Right: action buttons — desktop inline, mobile dropdown */}
            <div className="w-full md:w-auto">
              {/* Desktop actions */}
              <div className="hidden md:flex items-center gap-2 flex-wrap">
                {currentStatusIndex < STATUS_FLOW.length - 1 && (
                  <button onClick={handleAdvanceStatus} className="btn-primary text-sm">
                    <ChevronRight size={15} />
                    Mark as {STATUS_FLOW[currentStatusIndex + 1].replace('Booking ', '')}
                  </button>
                )}
                <button
                  className="btn-secondary text-sm"
                  onClick={() => toast.info('Edit mode — coming soon')}
                >
                  <Edit3 size={14} />
                  Edit Booking
                </button>
                <button
                  className="btn-secondary text-sm"
                  onClick={() =>
                    window.open(
                      `https://yourstore.co.uk/wp-admin/post.php?post=${order.wooOrderId.replace('#', '')}&action=edit`,
                      '_blank'
                    )
                  }
                >
                  <ExternalLink size={14} />
                  WooCommerce
                </button>
                <button
                  className="p-2 rounded-lg border hover:bg-red-50 transition-colors"
                  style={{ borderColor: 'hsl(var(--border))' }}
                  onClick={() => setDeleteModalOpen(true)}
                  title="Delete this booking"
                  aria-label="Delete booking"
                >
                  <Trash2 size={14} style={{ color: 'hsl(var(--destructive))' }} />
                </button>
              </div>

              {/* Mobile actions — full-width touch-friendly buttons */}
              <div className="md:hidden space-y-2">
                {currentStatusIndex < STATUS_FLOW.length - 1 && (
                  <button
                    onClick={handleAdvanceStatus}
                    className="btn-primary text-sm w-full justify-center touch-manipulation"
                    style={{ minHeight: '44px' }}
                  >
                    <ChevronRight size={15} />
                    Mark as {STATUS_FLOW[currentStatusIndex + 1].replace('Booking ', '')}
                  </button>
                )}
                <div className="flex gap-2">
                  <button
                    className="btn-secondary text-sm flex-1 justify-center touch-manipulation"
                    style={{ minHeight: '44px' }}
                    onClick={() => toast.info('Edit mode — coming soon')}
                  >
                    <Edit3 size={14} />
                    Edit
                  </button>
                  <button
                    className="btn-secondary text-sm flex-1 justify-center touch-manipulation"
                    style={{ minHeight: '44px' }}
                    onClick={() =>
                      window.open(
                        `https://yourstore.co.uk/wp-admin/post.php?post=${order.wooOrderId.replace('#', '')}&action=edit`,
                        '_blank'
                      )
                    }
                  >
                    <ExternalLink size={14} />
                    WooCommerce
                  </button>
                  <button
                    className="p-3 rounded-lg border hover:bg-red-50 transition-colors touch-manipulation"
                    style={{ borderColor: 'hsl(var(--border))', minHeight: '44px', minWidth: '44px' }}
                    onClick={() => setDeleteModalOpen(true)}
                    aria-label="Delete booking"
                  >
                    <Trash2 size={16} style={{ color: 'hsl(var(--destructive))' }} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Status timeline */}
          <div className="mt-5 md:mt-6 pt-4 md:pt-5 border-t" style={{ borderColor: 'hsl(var(--border))' }}>
            {/* Desktop: horizontal timeline */}
            <div className="hidden sm:flex items-center gap-0">
              {STATUS_FLOW.map((status, i) => {
                const Icon = STATUS_ICONS[status];
                const isDone = i < currentStatusIndex;
                const isCurrent = i === currentStatusIndex;
                const isLast = i === STATUS_FLOW.length - 1;

                return (
                  <div key={status} className="flex items-center flex-1">
                    <div className="flex flex-col items-center gap-1.5">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all duration-300"
                        style={{
                          backgroundColor: isDone || isCurrent ? 'hsl(var(--primary))' : 'hsl(var(--card))',
                          borderColor: isDone || isCurrent ? 'hsl(var(--primary))' : 'hsl(var(--border))',
                        }}
                      >
                        <Icon
                          size={14}
                          style={{ color: isDone || isCurrent ? 'white' : 'hsl(var(--muted-foreground))' }}
                        />
                      </div>
                      <span
                        className="text-[10px] font-medium text-center leading-tight max-w-[70px]"
                        style={{
                          color: isCurrent
                            ? 'hsl(var(--primary))'
                            : isDone
                            ? 'hsl(var(--foreground))'
                            : 'hsl(var(--muted-foreground))',
                        }}
                      >
                        {status.replace('Booking ', '')}
                      </span>
                    </div>
                    {!isLast && (
                      <div
                        className="flex-1 h-0.5 mx-1 mb-5 transition-all duration-300"
                        style={{
                          backgroundColor: i < currentStatusIndex ? 'hsl(var(--primary))' : 'hsl(var(--border))',
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Mobile: compact vertical status steps */}
            <div className="sm:hidden space-y-2">
              {STATUS_FLOW.map((status, i) => {
                const Icon = STATUS_ICONS[status];
                const isDone = i < currentStatusIndex;
                const isCurrent = i === currentStatusIndex;

                return (
                  <div key={status} className="flex items-center gap-3">
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center border-2 shrink-0 transition-all duration-300"
                      style={{
                        backgroundColor: isDone || isCurrent ? 'hsl(var(--primary))' : 'hsl(var(--card))',
                        borderColor: isDone || isCurrent ? 'hsl(var(--primary))' : 'hsl(var(--border))',
                      }}
                    >
                      <Icon
                        size={12}
                        style={{ color: isDone || isCurrent ? 'white' : 'hsl(var(--muted-foreground))' }}
                      />
                    </div>
                    <span
                      className="text-xs font-medium"
                      style={{
                        color: isCurrent
                          ? 'hsl(var(--primary))'
                          : isDone
                          ? 'hsl(var(--foreground))'
                          : 'hsl(var(--muted-foreground))',
                      }}
                    >
                      {status.replace('Booking ', '')}
                    </span>
                    {isCurrent && (
                      <span
                        className="ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: 'hsl(var(--primary) / 0.1)', color: 'hsl(var(--primary))' }}
                      >
                        Current
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="card overflow-hidden">
        {/* Tab bar — horizontally scrollable on mobile */}
        <div
          className="flex border-b overflow-x-auto scrollbar-thin"
          style={{ borderColor: 'hsl(var(--border))' }}
        >
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`tab-item flex items-center gap-2 shrink-0 touch-manipulation ${activeTab === tab.key ? 'active' : ''}`}
                style={{ minHeight: '44px' }}
              >
                <Icon size={14} />
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden">{tab.label.split(' ')[0]}</span>
                {tab.badge && (
                  <span
                    className="w-4 h-4 rounded-full text-[10px] font-bold flex items-center justify-center"
                    style={{ backgroundColor: 'hsl(var(--destructive))', color: 'white' }}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="p-4 md:p-6">
          {activeTab === 'details' && <OrderDetailsTab order={order} />}
          {activeTab === 'payment' && <PaymentTab order={order} />}
          {activeTab === 'pod' && <ProofOfDeliveryTab order={order} />}
        </div>
      </div>

      {/* Delete confirm modal */}
      <Modal
        open={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title={`Delete Booking ${order.id}`}
        description="This action cannot be undone."
        size="sm"
      >
        <div className="space-y-4">
          <div
            className="flex items-start gap-3 p-4 rounded-lg border"
            style={{
              backgroundColor: 'hsl(var(--destructive) / 0.05)',
              borderColor: 'hsl(var(--destructive) / 0.2)',
            }}
          >
            <AlertTriangle size={18} style={{ color: 'hsl(var(--destructive))' }} className="shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium" style={{ color: 'hsl(var(--destructive))' }}>
                Permanently delete this booking?
              </p>
              <p className="text-xs mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
                Booking {order.id} for {order.customer.name} will be permanently removed.
                This will not affect the WooCommerce order.
              </p>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button className="btn-secondary touch-manipulation" style={{ minHeight: '44px' }} onClick={() => setDeleteModalOpen(false)}>
              Cancel
            </button>
            <button className="btn-danger touch-manipulation" style={{ minHeight: '44px' }} onClick={handleDelete}>
              <Trash2 size={14} />
              Delete Booking
            </button>
          </div>
        </div>
      </Modal>

      {/* Status advance confirm modal */}
      <Modal
        open={statusModalOpen}
        onClose={() => { setStatusModalOpen(false); setPendingStatus(null); }}
        title="Update Booking Status"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
            You are about to change the status of booking{' '}
            <span className="font-mono font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
              {order.id}
            </span>{' '}
            to:
          </p>
          {pendingStatus && (
            <div
              className="p-4 rounded-lg border text-center"
              style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--secondary))' }}
            >
              <StatusBadge status={pendingStatus} />
              <p className="text-xs mt-2" style={{ color: 'hsl(var(--muted-foreground))' }}>
                This will be recorded with timestamp and your user account.
              </p>
            </div>
          )}
          <div className="flex gap-2 justify-end">
            <button
              className="btn-secondary touch-manipulation"
              style={{ minHeight: '44px' }}
              onClick={() => { setStatusModalOpen(false); setPendingStatus(null); }}
            >
              Cancel
            </button>
            <button
              className="btn-primary touch-manipulation"
              style={{ minHeight: '44px' }}
              onClick={confirmStatusChange}
              disabled={isUpdatingStatus}
            >
              {isUpdatingStatus ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  Updating…
                </>
              ) : (
                <>
                  <CheckCircle2 size={14} />
                  Confirm Update
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}