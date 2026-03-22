'use client';

import { useState } from 'react';
import { AppOrder } from '@/lib/services/ordersService';
import { ordersService } from '@/lib/services/ordersService';
import { toast } from 'sonner';
import { ArrowLeft, MapPin, Clock, Package, Phone, MessageSquare, CheckCircle2, Truck, Navigation, FileCheck, ChevronRight,  } from 'lucide-react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import DriverPODUpload from './DriverPODUpload';
import Icon from '@/components/ui/AppIcon';


interface Props {
  order: AppOrder;
  onBack: () => void;
  onStatusUpdate: (updated: AppOrder) => void;
}

const STATUS_FLOW = [
  { key: 'Booking Accepted', label: 'Accepted', icon: CheckCircle2 },
  { key: 'Booking Assigned', label: 'Assigned', icon: Truck },
  { key: 'Booking Out For Delivery', label: 'Out for Delivery', icon: Navigation },
  { key: 'Booking Complete', label: 'Complete', icon: FileCheck },
];

type TabKey = 'details' | 'map' | 'pod';

export default function DriverOrderDetail({ order, onBack, onStatusUpdate }: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>('details');
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [currentOrder, setCurrentOrder] = useState<AppOrder>(order);

  const currentStatusIdx = STATUS_FLOW.findIndex(s => s.key === currentOrder.status);
  const nextStatus = currentStatusIdx < STATUS_FLOW.length - 1 ? STATUS_FLOW[currentStatusIdx + 1] : null;
  const isComplete = currentOrder.status === 'Booking Complete';

  const handleAdvanceStatus = async () => {
    if (!nextStatus) return;
    setUpdatingStatus(true);
    try {
      const ok = await ordersService.updateOrderStatus(currentOrder.id, nextStatus.key);
      if (ok) {
        const updated = { ...currentOrder, status: nextStatus.key };
        setCurrentOrder(updated);
        toast.success(`Status updated to "${nextStatus.key}"`);
        if (nextStatus.key === 'Booking Complete') {
          setActiveTab('pod');
        }
      } else {
        toast.error('Failed to update status');
      }
    } catch {
      toast.error('Failed to update status');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handlePODComplete = () => {
    const updated = { ...currentOrder, status: 'Booking Complete' };
    setCurrentOrder(updated);
    onStatusUpdate(updated);
    toast.success('Proof of delivery submitted successfully');
  };

  const mapAddress = currentOrder.deliveryAddress
    ? encodeURIComponent(
        `${currentOrder.deliveryAddress.line1}, ${currentOrder.deliveryAddress.city}, ${currentOrder.deliveryAddress.postcode}, UK`
      )
    : null;

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'details', label: 'Details' },
    { key: 'map', label: 'Map' },
    { key: 'pod', label: 'Proof of Delivery' },
  ];

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-2 rounded-lg transition-colors hover:bg-secondary"
        >
          <ArrowLeft size={18} style={{ color: 'hsl(var(--foreground))' }} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="font-bold text-lg" style={{ color: 'hsl(var(--foreground))' }}>
              {currentOrder.id}
            </h1>
            <StatusBadge status={currentOrder.status} />
          </div>
          <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
            {currentOrder.customer.name} · {new Date(currentOrder.bookingDate).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })}
          </p>
        </div>
      </div>

      {/* Status Progress */}
      <div
        className="rounded-xl border p-4"
        style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
      >
        <div className="flex items-center justify-between mb-3">
          {STATUS_FLOW.map((s, idx) => {
            const done = idx <= currentStatusIdx;
            const active = idx === currentStatusIdx;
            const Icon = s.icon;
            return (
              <div key={s.key} className="flex flex-col items-center gap-1 flex-1">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center transition-all"
                  style={{
                    backgroundColor: done ? 'hsl(var(--primary))' : 'hsl(var(--secondary))',
                    border: active ? '2px solid hsl(var(--primary))' : '2px solid transparent',
                  }}
                >
                  <Icon size={14} style={{ color: done ? 'white' : 'hsl(var(--muted-foreground))' }} />
                </div>
                <span
                  className="text-[10px] text-center leading-tight"
                  style={{ color: done ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))' }}
                >
                  {s.label}
                </span>
                {idx < STATUS_FLOW.length - 1 && (
                  <div
                    className="absolute"
                    style={{ display: 'none' }}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Advance Status Button */}
        {!isComplete && nextStatus && (
          <button
            onClick={handleAdvanceStatus}
            disabled={updatingStatus}
            className="w-full mt-2 py-2.5 px-4 rounded-lg font-semibold text-sm transition-all flex items-center justify-center gap-2"
            style={{
              backgroundColor: 'hsl(var(--primary))',
              color: 'white',
              opacity: updatingStatus ? 0.7 : 1,
            }}
          >
            {updatingStatus ? (
              <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
            ) : (
              <>
                <ChevronRight size={16} />
                Mark as: {nextStatus.label}
              </>
            )}
          </button>
        )}
        {isComplete && (
          <div
            className="flex items-center gap-2 mt-2 p-2.5 rounded-lg"
            style={{ backgroundColor: 'hsl(142 69% 35% / 0.1)' }}
          >
            <CheckCircle2 size={16} style={{ color: 'hsl(142 69% 35%)' }} />
            <span className="text-sm font-medium" style={{ color: 'hsl(142 69% 35%)' }}>
              Delivery Complete
            </span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-lg" style={{ backgroundColor: 'hsl(var(--secondary))' }}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className="flex-1 py-2 rounded-md text-xs font-medium transition-all"
            style={{
              backgroundColor: activeTab === tab.key ? 'hsl(var(--card))' : 'transparent',
              color: activeTab === tab.key ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))',
              boxShadow: activeTab === tab.key ? '0 1px 3px hsl(var(--border))' : 'none',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'details' && (
        <div className="space-y-3">
          {/* Customer Info */}
          <div
            className="rounded-xl border p-4 space-y-3"
            style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
          >
            <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Customer
            </h3>
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                style={{ backgroundColor: 'hsl(var(--secondary))' }}
              >
                {currentOrder.customer.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
              </div>
              <div>
                <p className="font-semibold text-sm" style={{ color: 'hsl(var(--foreground))' }}>
                  {currentOrder.customer.name}
                </p>
                <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  {currentOrder.customer.email}
                </p>
              </div>
            </div>
            <a
              href={`tel:${currentOrder.customer.phone}`}
              className="flex items-center gap-2 py-2 px-3 rounded-lg transition-colors hover:bg-secondary w-full"
            >
              <Phone size={14} style={{ color: 'hsl(var(--primary))' }} />
              <span className="text-sm font-medium" style={{ color: 'hsl(var(--primary))' }}>
                {currentOrder.customer.phone}
              </span>
            </a>
          </div>

          {/* Delivery Address */}
          {currentOrder.deliveryAddress && (
            <div
              className="rounded-xl border p-4 space-y-2"
              style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
            >
              <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'hsl(var(--muted-foreground))' }}>
                Delivery Address
              </h3>
              <div className="flex items-start gap-2">
                <MapPin size={15} className="shrink-0 mt-0.5" style={{ color: 'hsl(var(--primary))' }} />
                <div>
                  <p className="text-sm font-medium" style={{ color: 'hsl(var(--foreground))' }}>
                    {currentOrder.deliveryAddress.line1}
                  </p>
                  {currentOrder.deliveryAddress.line2 && (
                    <p className="text-sm" style={{ color: 'hsl(var(--foreground))' }}>
                      {currentOrder.deliveryAddress.line2}
                    </p>
                  )}
                  <p className="text-sm" style={{ color: 'hsl(var(--foreground))' }}>
                    {currentOrder.deliveryAddress.city}, {currentOrder.deliveryAddress.county}
                  </p>
                  <p className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
                    {currentOrder.deliveryAddress.postcode}
                  </p>
                  {currentOrder.deliveryAddress.notes && (
                    <div
                      className="flex items-start gap-1.5 mt-2 p-2 rounded-lg"
                      style={{ backgroundColor: 'hsl(38 92% 50% / 0.08)' }}
                    >
                      <MessageSquare size={12} className="shrink-0 mt-0.5" style={{ color: 'hsl(38 92% 50%)' }} />
                      <p className="text-xs" style={{ color: 'hsl(var(--foreground))' }}>
                        {currentOrder.deliveryAddress.notes}
                      </p>
                    </div>
                  )}
                </div>
              </div>
              <button
                onClick={() => setActiveTab('map')}
                className="w-full mt-1 py-2 px-3 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
                style={{ backgroundColor: 'hsl(var(--secondary))', color: 'hsl(var(--foreground))' }}
              >
                <Navigation size={13} />
                View on Map
              </button>
            </div>
          )}

          {/* Delivery Window */}
          <div
            className="rounded-xl border p-4"
            style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
          >
            <h3 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Schedule
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>Delivery Window</p>
                <div className="flex items-center gap-1 mt-0.5">
                  <Clock size={13} style={{ color: 'hsl(var(--primary))' }} />
                  <p className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
                    {currentOrder.deliveryWindow}
                  </p>
                </div>
              </div>
              {currentOrder.collectionWindow && (
                <div>
                  <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>Collection Window</p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <Clock size={13} style={{ color: 'hsl(var(--muted-foreground))' }} />
                    <p className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
                      {currentOrder.collectionWindow}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Products */}
          {currentOrder.products?.length > 0 && (
            <div
              className="rounded-xl border p-4"
              style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
            >
              <h3 className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: 'hsl(var(--muted-foreground))' }}>
                Items ({currentOrder.products.length})
              </h3>
              <div className="space-y-2">
                {currentOrder.products.map((p: any, i: number) => (
                  <div key={i} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Package size={13} className="shrink-0" style={{ color: 'hsl(var(--muted-foreground))' }} />
                      <span className="text-sm truncate" style={{ color: 'hsl(var(--foreground))' }}>
                        {p.name}
                      </span>
                    </div>
                    <span
                      className="text-xs font-medium shrink-0 px-1.5 py-0.5 rounded"
                      style={{ backgroundColor: 'hsl(var(--secondary))', color: 'hsl(var(--muted-foreground))' }}
                    >
                      x{p.quantity}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          {currentOrder.notes && (
            <div
              className="rounded-xl border p-4"
              style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
            >
              <h3 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'hsl(var(--muted-foreground))' }}>
                Notes
              </h3>
              <p className="text-sm" style={{ color: 'hsl(var(--foreground))' }}>{currentOrder.notes}</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'map' && (
        <div
          className="rounded-xl border overflow-hidden"
          style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
        >
          {mapAddress ? (
            <>
              <div className="p-3 border-b flex items-center gap-2" style={{ borderColor: 'hsl(var(--border))' }}>
                <MapPin size={15} style={{ color: 'hsl(var(--primary))' }} />
                <span className="text-sm font-medium" style={{ color: 'hsl(var(--foreground))' }}>
                  {currentOrder.deliveryAddress?.line1}, {currentOrder.deliveryAddress?.postcode}
                </span>
              </div>
              <div className="relative" style={{ height: '380px' }}>
                <iframe
                  title="Delivery location map"
                  width="100%"
                  height="100%"
                  style={{ border: 0 }}
                  src={`https://www.openstreetmap.org/export/embed.html?bbox=-1.5,52.5,-0.5,53.0&layer=mapnik&marker=52.6369,-1.1398`}
                  allowFullScreen
                />
                <div
                  className="absolute bottom-0 left-0 right-0 p-3 flex gap-2"
                  style={{ background: 'linear-gradient(to top, hsl(var(--card)), transparent)' }}
                >
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${mapAddress}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 py-2.5 rounded-lg text-xs font-semibold text-center transition-all"
                    style={{ backgroundColor: 'hsl(var(--primary))', color: 'white' }}
                  >
                    Open in Google Maps
                  </a>
                  <a
                    href={`https://maps.apple.com/?q=${mapAddress}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 py-2.5 rounded-lg text-xs font-semibold text-center transition-all"
                    style={{ backgroundColor: 'hsl(var(--secondary))', color: 'hsl(var(--foreground))' }}
                  >
                    Open in Apple Maps
                  </a>
                </div>
              </div>
            </>
          ) : (
            <div className="p-12 text-center">
              <MapPin size={36} className="mx-auto mb-3" style={{ color: 'hsl(var(--muted-foreground))' }} />
              <p className="text-sm font-medium" style={{ color: 'hsl(var(--foreground))' }}>No delivery address</p>
              <p className="text-xs mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
                This order does not have a delivery address.
              </p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'pod' && (
        <DriverPODUpload
          order={currentOrder}
          onComplete={handlePODComplete}
        />
      )}
    </div>
  );
}
