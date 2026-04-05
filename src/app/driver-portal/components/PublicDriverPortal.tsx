'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { AppOrder, AppDriver } from '@/lib/services/ordersService';
import { toast } from 'sonner';
import { Truck, Package, CheckCircle2, Clock, MapPin, Phone, RefreshCw, Loader2, Navigation, AlertCircle, Calendar, User, ArrowRight, PoundSterling, TrendingUp, Star, Shield, Timer, X, Mail, Lock, Eye, EyeOff, History, Car, Wrench, Search, CheckSquare, XCircle, Info, Camera, Trash2, CreditCard, FileCheck, XOctagon, Banknote, WifiOff, Bell, BellOff, BellRing, CheckCheck, Filter } from 'lucide-react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import AppLogo from '@/components/ui/AppLogo';
import { useBranding } from '@/contexts/BrandingContext';
import dynamic from 'next/dynamic';

const DriverRouteMap = dynamic(() => import('./DriverRouteMap'), { ssr: false });
import DriverPODUpload from './DriverPODUpload';
import { useDriverGps } from '@/hooks/useDriverGps';
import { useDriverPushNotifications } from '@/hooks/useDriverPushNotifications';

// ─── Types ────────────────────────────────────────────────────────────────────

type AvailabilityStatus = 'Available' | 'On Route' | 'Off Duty';

const AVAILABILITY_OPTIONS: AvailabilityStatus[] = ['Available', 'On Route', 'Off Duty'];

const AVAILABILITY_STYLES: Record<AvailabilityStatus, { bg: string; text: string; dot: string; border: string }> = {
  Available: {
    bg: 'hsl(142 69% 35% / 0.12)',
    text: 'hsl(142 69% 35%)',
    dot: 'hsl(142 69% 35%)',
    border: 'hsl(142 69% 35% / 0.3)',
  },
  'On Route': {
    bg: 'hsl(262 83% 58% / 0.12)',
    text: 'hsl(262 83% 58%)',
    dot: 'hsl(262 83% 58%)',
    border: 'hsl(262 83% 58% / 0.3)',
  },
  'Off Duty': {
    bg: 'hsl(var(--secondary))',
    text: 'hsl(var(--muted-foreground))',
    dot: 'hsl(var(--muted-foreground))',
    border: 'hsl(var(--border))',
  },
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

interface EarningsSummary {
  todayDeliveries: number;
  weekDeliveries: number;
  monthDeliveries: number;
  todayEarnings: number;
  weekEarnings: number;
  monthEarnings: number;
  avgRating: number;
  completionRate: number;
  bonusPerDelivery: number;
}

function getTodayStr(): string {
  return new Date().toISOString().split('T')[0];
}

function getTomorrowStr(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
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

// ─── Booking Detail Modal ─────────────────────────────────────────────────────

interface BookingDetailModalProps {
  order: AppOrder;
  driverId: string;
  onClose: () => void;
  onOrderUpdate?: (updated: AppOrder) => void;
}

function BookingDetailModal({ order, driverId, onClose, onOrderUpdate }: BookingDetailModalProps) {
  const supabase = createClient();
  const [activeTab, setActiveTab] = useState<'details' | 'payment' | 'pod'>('details');
  const [currentOrder, setCurrentOrder] = useState<AppOrder>(order);

  // Payment recording state
  const [payMethod, setPayMethod] = useState<'Cash' | 'Card'>('Cash');
  const [payAmount, setPayAmount] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [savingPayment, setSavingPayment] = useState(false);
  const [paymentRecorded, setPaymentRecorded] = useState(
    currentOrder.payment.status === 'Paid' || currentOrder.payment.status === 'paid'
  );
  const [isDeletingPayment, setIsDeletingPayment] = useState(false);
  const [showDeletePaymentConfirm, setShowDeletePaymentConfirm] = useState(false);

  const mapAddress = currentOrder.deliveryAddress
    ? encodeURIComponent(`${currentOrder.deliveryAddress.line1}, ${currentOrder.deliveryAddress.city}, ${currentOrder.deliveryAddress.postcode}, UK`)
    : null;

  const googleMapsDirectionsUrl = currentOrder.deliveryAddress
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
        `${currentOrder.deliveryAddress.line1}, ${currentOrder.deliveryAddress.city}, ${currentOrder.deliveryAddress.postcode}`
      )}`
    : null;

  const amountDue = Number(currentOrder.payment.totalDue ?? currentOrder.payment.amountDue ?? 0);

  const handleRecordPayment = async () => {
    const amount = parseFloat(payAmount);
    if (isNaN(amount) || amount < 0) {
      toast.error('Please enter a valid payment amount');
      return;
    }
    if (amount === 0 && amountDue > 0) {
      toast.error('Please enter the amount collected');
      return;
    }
    setSavingPayment(true);
    try {
      const newStatus: string = amount >= amountDue && amountDue > 0 ? 'Paid' : amount > 0 ? 'Paid' : 'Partial';
      const { error } = await supabase
        .from('orders')
        .update({
          payment_status: newStatus,
          payment_method: payMethod,
          payment_amount: amount,
          payment_recorded_at: new Date().toISOString(),
          payment_recorded_by: driverId,
          payment_notes: payNotes.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', currentOrder.id);

      if (error) throw error;

      // If payment method is Cash, allocate the amount to the driver's cash account
      if (payMethod === 'Cash' && amount > 0) {
        const { error: cashError } = await supabase
          .from('driver_cash_allocations')
          .insert({
            driver_id: driverId,
            order_id: String(currentOrder.id),
            amount,
            notes: payNotes.trim() || `Cash collected for order #${currentOrder.id}`,
            allocated_at: new Date().toISOString(),
          });
        if (cashError) {
          console.error('Failed to allocate cash to driver account:', cashError);
          toast.warning(`Payment recorded but cash allocation failed: ${cashError.message}`);
        }
      }

      const updated: AppOrder = {
        ...currentOrder,
        payment: {
          ...currentOrder.payment,
          status: newStatus,
          method: payMethod,
          amount,
        },
      };
      setCurrentOrder(updated);
      setPaymentRecorded(true);
      onOrderUpdate?.(updated);
      toast.success(`Payment of £${amount.toFixed(2)} recorded (${payMethod})`);
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to record payment');
    } finally {
      setSavingPayment(false);
    }
  };

  const handleDeletePayment = async () => {
    setIsDeletingPayment(true);
    try {
      const { error } = await supabase
        .from('orders')
        .update({
          payment_status: 'Unpaid',
          payment_method: null,
          delivery_charge: null,
          payment_amount: null,
          deposit_paid: null,
          amount_due: null,
          payment_notes: null,
          payment_recorded_at: null,
          payment_recorded_by: null,
        })
        .eq('id', currentOrder.id);

      if (error) throw error;

      const updated: AppOrder = {
        ...currentOrder,
        payment: {
          ...currentOrder.payment,
          status: 'Unpaid',
          method: 'Unrecorded',
          amount: 0,
          amountDue: 0,
          orderTotal: 0,
          depositPaid: 0,
          totalDue: 0,
          notes: '',
          recordedAt: undefined,
          recordedBy: undefined,
        },
      };
      setCurrentOrder(updated);
      setPaymentRecorded(false);
      setShowDeletePaymentConfirm(false);
      onOrderUpdate?.(updated);
      toast.success('Payment record removed');
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to remove payment record');
    } finally {
      setIsDeletingPayment(false);
    }
  };

  const handlePODComplete = () => {
    const updated: AppOrder = { ...currentOrder, status: 'Booking Complete' };
    setCurrentOrder(updated);
    onOrderUpdate?.(updated);
    toast.success('Proof of delivery submitted');
  };

  const modalTabs = [
    { key: 'details' as const, label: 'Details' },
    { key: 'payment' as const, label: 'Payment' },
    { key: 'pod' as const, label: 'POD' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div
        className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col"
        style={{ backgroundColor: 'hsl(var(--card))', maxHeight: '92vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0" style={{ borderColor: 'hsl(var(--border))' }}>
          <div>
            <h2 className="font-bold text-base" style={{ color: 'hsl(var(--foreground))' }}>{currentOrder.id}</h2>
            <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
              {new Date(currentOrder.bookingDate).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {googleMapsDirectionsUrl && (
              <a
                href={googleMapsDirectionsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={{ backgroundColor: 'hsl(var(--primary))', color: 'white' }}
                title="Navigate with Google Maps"
              >
                <Navigation size={13} />
                Navigate
              </a>
            )}
            <button onClick={onClose} className="p-2 rounded-lg transition-colors hover:bg-secondary">
              <X size={18} style={{ color: 'hsl(var(--foreground))' }} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-2 border-b shrink-0" style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--card))' }}>
          {modalTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className="flex-1 py-2 rounded-lg text-xs font-semibold transition-all"
              style={{
                backgroundColor: activeTab === tab.key ? 'hsl(var(--primary))' : 'hsl(var(--secondary))',
                color: activeTab === tab.key ? 'white' : 'hsl(var(--muted-foreground))',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto flex-1 p-4 space-y-4">

          {/* ── DETAILS TAB ── */}
          {activeTab === 'details' && (
            <>
              {/* Status */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>Status:</span>
                <span
                  className="text-xs font-semibold px-2 py-0.5 rounded-full"
                  style={{
                    backgroundColor: STATUS_ACCENT[currentOrder.status] ? `${STATUS_ACCENT[currentOrder.status]}20` : 'hsl(var(--secondary))',
                    color: STATUS_ACCENT[currentOrder.status] ?? 'hsl(var(--foreground))',
                  }}
                >
                  {currentOrder.status}
                </span>
                {(currentOrder as any).bookingType && (
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: 'hsl(var(--secondary))', color: 'hsl(var(--muted-foreground))' }}>
                    {(currentOrder as any).bookingType}
                  </span>
                )}
              </div>

              {/* Customer */}
              <div className="rounded-xl border p-3 space-y-2" style={{ borderColor: 'hsl(var(--border))' }}>
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'hsl(var(--muted-foreground))' }}>Customer</p>
                <div className="flex items-center gap-2">
                  <User size={14} style={{ color: 'hsl(var(--primary))' }} />
                  <span className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>{currentOrder.customer.name}</span>
                </div>
                {currentOrder.customer.email && (
                  <p className="text-xs pl-5" style={{ color: 'hsl(var(--muted-foreground))' }}>{currentOrder.customer.email}</p>
                )}
                {currentOrder.customer.phone && (
                  <a href={`tel:${currentOrder.customer.phone}`} className="flex items-center gap-2 pl-1">
                    <Phone size={13} style={{ color: 'hsl(var(--primary))' }} />
                    <span className="text-sm font-medium" style={{ color: 'hsl(var(--primary))' }}>{currentOrder.customer.phone}</span>
                  </a>
                )}
              </div>

              {/* Delivery Address */}
              {currentOrder.deliveryAddress && (
                <div className="rounded-xl border p-3 space-y-2" style={{ borderColor: 'hsl(var(--border))' }}>
                  <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'hsl(var(--muted-foreground))' }}>Delivery Address</p>
                  <div className="flex items-start gap-2">
                    <MapPin size={14} className="shrink-0 mt-0.5" style={{ color: 'hsl(var(--primary))' }} />
                    <div>
                      <p className="text-sm font-medium" style={{ color: 'hsl(var(--foreground))' }}>{currentOrder.deliveryAddress.line1}</p>
                      {currentOrder.deliveryAddress.line2 && <p className="text-sm" style={{ color: 'hsl(var(--foreground))' }}>{currentOrder.deliveryAddress.line2}</p>}
                      <p className="text-sm" style={{ color: 'hsl(var(--foreground))' }}>{currentOrder.deliveryAddress.city}{currentOrder.deliveryAddress.county ? `, ${currentOrder.deliveryAddress.county}` : ''}</p>
                      <p className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>{currentOrder.deliveryAddress.postcode}</p>
                      {currentOrder.deliveryAddress.notes && (
                        <p className="text-xs mt-1 italic" style={{ color: 'hsl(var(--muted-foreground))' }}>{currentOrder.deliveryAddress.notes}</p>
                      )}
                    </div>
                  </div>
                  {googleMapsDirectionsUrl && (
                    <a
                      href={googleMapsDirectionsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg font-semibold text-sm transition-all"
                      style={{ backgroundColor: 'hsl(var(--primary))', color: 'white' }}
                    >
                      <Navigation size={15} />
                      Navigate with Google Maps
                    </a>
                  )}
                </div>
              )}

              {/* Schedule */}
              <div className="rounded-xl border p-3 space-y-2" style={{ borderColor: 'hsl(var(--border))' }}>
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'hsl(var(--muted-foreground))' }}>Schedule</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>Booking Date</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <Calendar size={12} style={{ color: 'hsl(var(--primary))' }} />
                      <p className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
                        {new Date(currentOrder.bookingDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </p>
                    </div>
                  </div>
                  {currentOrder.deliveryWindow && (
                    <div>
                      <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>Delivery Window</p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <Clock size={12} style={{ color: 'hsl(var(--primary))' }} />
                        <p className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>{currentOrder.deliveryWindow}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Items */}
              {currentOrder.products?.length > 0 && (
                <div className="rounded-xl border p-3 space-y-2" style={{ borderColor: 'hsl(var(--border))' }}>
                  <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'hsl(var(--muted-foreground))' }}>Items ({currentOrder.products.length})</p>
                  <div className="space-y-1.5">
                    {currentOrder.products.map((p: any, i: number) => (
                      <div key={i} className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Package size={12} className="shrink-0" style={{ color: 'hsl(var(--muted-foreground))' }} />
                          <span className="text-sm truncate" style={{ color: 'hsl(var(--foreground))' }}>{p.name}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {(p.price != null || p.unit_price != null) && (
                            <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                              £{Number(p.price ?? p.unit_price ?? 0).toFixed(2)} ea
                            </span>
                          )}
                          <span className="text-xs font-medium px-1.5 py-0.5 rounded" style={{ backgroundColor: 'hsl(var(--secondary))', color: 'hsl(var(--muted-foreground))' }}>
                            x{p.quantity}
                          </span>
                          {(p.price != null || p.unit_price != null) && (
                            <span className="text-xs font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
                              £{(Number(p.price ?? p.unit_price ?? 0) * Number(p.quantity ?? 1)).toFixed(2)}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes */}
              {currentOrder.notes && (
                <div className="rounded-xl border p-3" style={{ borderColor: 'hsl(var(--border))' }}>
                  <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Notes</p>
                  <p className="text-sm" style={{ color: 'hsl(var(--foreground))' }}>{currentOrder.notes}</p>
                </div>
              )}
            </>
          )}

          {/* ── PAYMENT TAB ── */}
          {activeTab === 'payment' && (
            <div className="space-y-4">
              {/* Current Payment Status */}
              <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: 'hsl(var(--border))' }}>
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'hsl(var(--muted-foreground))' }}>Payment Summary</p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>Status</span>
                    <span
                      className="text-xs font-semibold px-2 py-0.5 rounded-full"
                      style={{
                        backgroundColor: (currentOrder.payment.status === 'paid' || currentOrder.payment.status === 'Paid') ? 'hsl(142 69% 35% / 0.12)'
                          : (currentOrder.payment.status === 'pending' || currentOrder.payment.status === 'Pending' || currentOrder.payment.status === 'Unpaid') ? 'hsl(38 92% 50% / 0.12)'
                          : 'hsl(var(--secondary))',
                        color: (currentOrder.payment.status === 'paid' || currentOrder.payment.status === 'Paid') ? 'hsl(142 69% 35%)'
                          : (currentOrder.payment.status === 'pending' || currentOrder.payment.status === 'Pending' || currentOrder.payment.status === 'Unpaid') ? 'hsl(38 92% 50%)'
                          : 'hsl(var(--muted-foreground))',
                      }}
                    >
                      {currentOrder.payment.status || 'Unpaid'}
                    </span>
                  </div>
                  {currentOrder.payment.method && currentOrder.payment.method !== 'Unrecorded' && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>Method</span>
                      <span className="text-xs font-medium capitalize" style={{ color: 'hsl(var(--foreground))' }}>{currentOrder.payment.method}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>Order Total</span>
                    <span className="text-xs font-semibold tabular-nums" style={{ color: 'hsl(var(--foreground))' }}>
                      £{Number(currentOrder.payment.orderTotal ?? currentOrder.payment.amount ?? 0).toFixed(2)}
                    </span>
                  </div>
                  {Number(currentOrder.payment.depositPaid ?? 0) > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>Deposit Paid</span>
                      <span className="text-xs font-semibold tabular-nums" style={{ color: 'hsl(142 69% 35%)' }}>
                        -£{Number(currentOrder.payment.depositPaid ?? 0).toFixed(2)}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: 'hsl(var(--border))' }}>
                    <span className="text-sm font-bold" style={{ color: 'hsl(var(--foreground))' }}>Amount Due</span>
                    <span
                      className="text-base font-bold tabular-nums"
                      style={{ color: amountDue > 0 ? 'hsl(0 84% 60%)' : 'hsl(142 69% 35%)' }}
                    >
                      £{amountDue.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Delete Payment Confirmation */}
              {showDeletePaymentConfirm && (
                <div
                  className="rounded-xl border p-4 space-y-3"
                  style={{ borderColor: 'hsl(0 84% 60% / 0.4)', backgroundColor: 'hsl(0 84% 60% / 0.05)' }}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: 'hsl(0 84% 60% / 0.1)' }}>
                      <Trash2 size={16} style={{ color: 'hsl(0 84% 60%)' }} />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>Remove Payment Record?</p>
                      <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        This will reset the payment status to <strong>Unpaid</strong>. This cannot be undone.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleDeletePayment}
                      disabled={isDeletingPayment}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg font-semibold text-xs transition-all"
                      style={{ backgroundColor: 'hsl(0 84% 60%)', color: 'white', opacity: isDeletingPayment ? 0.7 : 1 }}
                    >
                      {isDeletingPayment ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                      {isDeletingPayment ? 'Removing…' : 'Yes, Remove'}
                    </button>
                    <button
                      onClick={() => setShowDeletePaymentConfirm(false)}
                      disabled={isDeletingPayment}
                      className="flex-1 py-2 rounded-lg font-medium text-xs transition-colors"
                      style={{ backgroundColor: 'hsl(var(--secondary))', color: 'hsl(var(--foreground))' }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Record Payment Form */}
              {paymentRecorded ? (
                <div
                  className="rounded-xl border p-5 text-center space-y-2"
                  style={{ borderColor: 'hsl(142 69% 35% / 0.3)', backgroundColor: 'hsl(142 69% 35% / 0.06)' }}
                >
                  <CheckCircle2 size={32} className="mx-auto" style={{ color: 'hsl(142 69% 35%)' }} />
                  <p className="font-semibold text-sm" style={{ color: 'hsl(142 69% 28%)' }}>Payment Recorded</p>
                  <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    {currentOrder.payment.method && currentOrder.payment.method !== 'Unrecorded' ? `${currentOrder.payment.method} · ` : ''}
                    £{Number(currentOrder.payment.amount ?? 0).toFixed(2)}
                  </p>
                  {!showDeletePaymentConfirm && (
                    <button
                      onClick={() => setShowDeletePaymentConfirm(true)}
                      className="flex items-center justify-center gap-1.5 mx-auto mt-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                      style={{ backgroundColor: 'hsl(0 84% 60% / 0.1)', color: 'hsl(0 84% 60%)' }}
                    >
                      <Trash2 size={12} />
                      Remove Payment Record
                    </button>
                  )}
                </div>
              ) : (
                <div className="rounded-xl border p-4 space-y-4" style={{ borderColor: 'hsl(var(--border))' }}>
                  <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'hsl(var(--muted-foreground))' }}>Record Payment Collected</p>

                  {/* Payment Method */}
                  <div>
                    <label className="text-xs font-medium block mb-2" style={{ color: 'hsl(var(--muted-foreground))' }}>Payment Method</label>
                    <div className="flex gap-2">
                      {(['Cash', 'Card'] as const).map((method) => (
                        <button
                          key={method}
                          onClick={() => setPayMethod(method)}
                          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all"
                          style={{
                            backgroundColor: payMethod === method ? 'hsl(var(--primary))' : 'hsl(var(--secondary))',
                            color: payMethod === method ? 'white' : 'hsl(var(--muted-foreground))',
                          }}
                        >
                          {method === 'Cash' ? <PoundSterling size={14} /> : <CreditCard size={14} />}
                          {method}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Amount */}
                  <div>
                    <label className="text-xs font-medium block mb-1.5" style={{ color: 'hsl(var(--muted-foreground))' }}>Amount Collected (£)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold" style={{ color: 'hsl(var(--muted-foreground))' }}>£</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={payAmount}
                        onChange={(e) => setPayAmount(e.target.value)}
                        placeholder={amountDue > 0 ? amountDue.toFixed(2) : '0.00'}
                        className="w-full text-sm pl-7 pr-3 py-2.5 rounded-lg border outline-none"
                        style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                      />
                    </div>
                    {amountDue > 0 && (
                      <button
                        onClick={() => setPayAmount(amountDue.toFixed(2))}
                        className="mt-1.5 text-xs font-medium"
                        style={{ color: 'hsl(var(--primary))' }}
                      >
                        Use full amount due (£{amountDue.toFixed(2)})
                      </button>
                    )}
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="text-xs font-medium block mb-1.5" style={{ color: 'hsl(var(--muted-foreground))' }}>Notes (optional)</label>
                    <input
                      type="text"
                      value={payNotes}
                      onChange={(e) => setPayNotes(e.target.value)}
                      placeholder="e.g. Customer paid exact change"
                      className="w-full text-sm px-3 py-2.5 rounded-lg border outline-none"
                      style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                    />
                  </div>

                  <button
                    onClick={handleRecordPayment}
                    disabled={savingPayment || !payAmount}
                    className="w-full py-3 rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-2"
                    style={{
                      backgroundColor: 'hsl(var(--primary))',
                      color: 'white',
                      opacity: savingPayment || !payAmount ? 0.6 : 1,
                    }}
                  >
                    {savingPayment ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <CheckSquare size={15} />
                    )}
                    {savingPayment ? 'Recording...' : 'Record Payment'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── POD TAB ── */}
          {activeTab === 'pod' && (
            <DriverPODUpload
              order={currentOrder}
              onComplete={handlePODComplete}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Safety Check Component ───────────────────────────────────────────────────

const INTERIM_CHECKS = [
  'Indicators Check', 'Headlights Check', 'Tyres Check',
  'Driver Seatbelt', 'Fuel Check', 'Mirrors Check', 'Warning Lights',
];

const FULL_CHECKS = [
  ...INTERIM_CHECKS,
  'Oil Check', 'Screen Wash Check', 'Coolant Check', 'Braking Check',
  'Fog Lights Check', 'Full Seatbelt Check', 'Wipers Check', 'Horn Check',
  'Passenger Safety Equipment', 'Hazard Warning Lights', 'Bodywork Check',
];

type CheckResult = 'good' | 'needs_attention' | 'immediate' | null;

interface SafetyCheckSectionProps {
  driverId: string;
}

function SafetyCheckSection({ driverId }: SafetyCheckSectionProps) {
  const supabase = createClient();
  const [vehicles, setVehicles] = useState<Array<{ id: string; registration: string; make: string; model: string }>>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('');
  const [inspectionType, setInspectionType] = useState<'interim' | 'full'>('interim');
  const [checkResults, setCheckResults] = useState<Record<string, CheckResult>>({});
  const [checkImages, setCheckImages] = useState<Record<string, { file: File; preview: string } | null>>({});
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [pastInspections, setPastInspections] = useState<any[]>([]);
  const [loadingInspections, setLoadingInspections] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const checks = inspectionType === 'interim' ? INTERIM_CHECKS : FULL_CHECKS;

  const loadInspections = useCallback(async () => {
    // Load ALL inspections (all drivers) so history is shared
    const { data: inspData } = await supabase
      .from('vehicle_inspections')
      .select('*, vehicles(registration, make, model), drivers(name)')
      .order('created_at', { ascending: false })
      .limit(50);
    if (inspData) setPastInspections(inspData);
    setLoadingInspections(false);
  }, [supabase]);

  useEffect(() => {
    const load = async () => {
      const { data: vehiclesData } = await supabase
        .from('vehicles')
        .select('id, registration, make, model')
        .eq('is_active', true)
        .order('registration');
      if (vehiclesData) setVehicles(vehiclesData);
      await loadInspections();
    };
    load();
  }, [driverId, loadInspections]);

  const handleResultChange = (check: string, result: CheckResult) => {
    setCheckResults((prev) => ({ ...prev, [check]: result }));
  };

  const handleImageSelect = (check: string, file: File) => {
    const preview = URL.createObjectURL(file);
    setCheckImages((prev) => ({ ...prev, [check]: { file, preview } }));
  };

  const handleImageRemove = (check: string) => {
    setCheckImages((prev) => {
      const existing = prev[check];
      if (existing) URL.revokeObjectURL(existing.preview);
      return { ...prev, [check]: null };
    });
    if (fileInputRefs.current[check]) {
      fileInputRefs.current[check]!.value = '';
    }
  };

  const uploadCheckImage = async (check: string, inspectionId: string): Promise<{ url: string; name: string } | null> => {
    const img = checkImages[check];
    if (!img) return null;
    const ext = img.file.name.split('.').pop() ?? 'jpg';
    const path = `${inspectionId}/${check.replace(/\s+/g, '_')}_${Date.now()}.${ext}`;
    const { data, error } = await supabase.storage
      .from('safety-check-images')
      .upload(path, img.file, { upsert: true });
    if (error) return null;
    const { data: urlData } = supabase.storage.from('safety-check-images').getPublicUrl(data.path);
    return { url: urlData.publicUrl, name: img.file.name };
  };

  const handleSubmit = async () => {
    if (!selectedVehicleId) {
      toast.error('Please select a vehicle');
      return;
    }
    const incomplete = checks.filter((c) => !checkResults[c]);
    if (incomplete.length > 0) {
      toast.error(`Please complete all checks (${incomplete.length} remaining)`);
      return;
    }

    setSubmitting(true);
    try {
      const hasImmediate = checks.some((c) => checkResults[c] === 'immediate');
      const hasAttention = checks.some((c) => checkResults[c] === 'needs_attention');
      const overallResult = hasImmediate ? 'fail' : hasAttention ? 'advisory' : 'pass';

      const { data: inspection, error: inspError } = await supabase
        .from('vehicle_inspections')
        .insert({
          vehicle_id: selectedVehicleId,
          driver_id: driverId,
          inspection_type: inspectionType,
          scheduled_date: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          status: 'completed',
          overall_result: overallResult,
          notes,
        })
        .select()
        .single();

      if (inspError) throw inspError;

      // Upload images and insert check items
      const items = await Promise.all(
        checks.map(async (check, idx) => {
          const imgResult = await uploadCheckImage(check, inspection.id);
          return {
            inspection_id: inspection.id,
            check_name: check,
            result: checkResults[check],
            notes: null,
            image_url: imgResult?.url ?? null,
            image_name: imgResult?.name ?? null,
            sort_order: idx,
          };
        })
      );

      await supabase.from('vehicle_inspection_items').insert(items);

      toast.success('Safety check submitted successfully!');
      setShowForm(false);
      setCheckResults({});
      setCheckImages({});
      setNotes('');
      setSelectedVehicleId('');

      await loadInspections();
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to submit safety check');
    } finally {
      setSubmitting(false);
    }
  };

  const resultConfig = {
    good: { label: 'Good', bg: 'hsl(142 69% 35%)', light: 'hsl(142 69% 35% / 0.1)', text: 'hsl(142 69% 35%)' },
    needs_attention: { label: 'Advisory', bg: 'hsl(38 92% 50%)', light: 'hsl(38 92% 50% / 0.1)', text: 'hsl(38 92% 50%)' },
    immediate: { label: 'Fail', bg: 'hsl(0 84% 60%)', light: 'hsl(0 84% 60% / 0.1)', text: 'hsl(0 84% 60%)' },
  };

  const overallResultLabel = (result: string | null) => {
    if (result === 'pass') return { label: 'Pass', color: 'hsl(142 69% 35%)', bg: 'hsl(142 69% 35% / 0.1)' };
    if (result === 'advisory') return { label: 'Advisory', color: 'hsl(38 92% 50%)', bg: 'hsl(38 92% 50% / 0.1)' };
    if (result === 'fail') return { label: 'Fail', color: 'hsl(0 84% 60%)', bg: 'hsl(0 84% 60% / 0.1)' };
    return { label: result ?? '—', color: 'hsl(var(--muted-foreground))', bg: 'hsl(var(--secondary))' };
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-base" style={{ color: 'hsl(var(--foreground))' }}>Vehicle Safety Checks</h3>
          <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>Complete pre-drive safety inspections</p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-all"
          style={{ backgroundColor: 'hsl(var(--primary))', color: 'white' }}
        >
          {showForm ? <X size={14} /> : <Wrench size={14} />}
          {showForm ? 'Cancel' : 'New Check'}
        </button>
      </div>

      {/* New Check Form */}
      {showForm && (
        <div className="rounded-xl border p-4 space-y-4" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
          {/* Vehicle Select */}
          <div>
            <label className="text-xs font-semibold block mb-1.5" style={{ color: 'hsl(var(--muted-foreground))' }}>Vehicle</label>
            <select
              value={selectedVehicleId}
              onChange={(e) => setSelectedVehicleId(e.target.value)}
              className="w-full text-sm px-3 py-2 rounded-lg border outline-none"
              style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
            >
              <option value="">Select vehicle...</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>{v.registration} — {v.make} {v.model}</option>
              ))}
            </select>
          </div>

          {/* Inspection Type */}
          <div>
            <label className="text-xs font-semibold block mb-1.5" style={{ color: 'hsl(var(--muted-foreground))' }}>Check Type</label>
            <div className="flex gap-2">
              {(['interim', 'full'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => { setInspectionType(t); setCheckResults({}); setCheckImages({}); }}
                  className="flex-1 py-2 rounded-lg text-xs font-medium capitalize transition-all"
                  style={{
                    backgroundColor: inspectionType === t ? 'hsl(var(--primary))' : 'hsl(var(--secondary))',
                    color: inspectionType === t ? 'white' : 'hsl(var(--muted-foreground))',
                  }}
                >
                  {t} ({t === 'interim' ? INTERIM_CHECKS.length : FULL_CHECKS.length} checks)
                </button>
              ))}
            </div>
          </div>

          {/* Check Items */}
          <div className="space-y-2">
            <p className="text-xs font-semibold" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Checks ({Object.keys(checkResults).length}/{checks.length} completed)
            </p>
            {checks.map((check) => {
              const result = checkResults[check];
              const img = checkImages[check];
              return (
                <div
                  key={check}
                  className="rounded-lg p-3 space-y-2"
                  style={{
                    backgroundColor: result ? resultConfig[result].light : 'hsl(var(--secondary))',
                    border: `1px solid ${result ? resultConfig[result].bg + '40' : 'transparent'}`,
                  }}
                >
                  <p className="text-sm font-medium" style={{ color: 'hsl(var(--foreground))' }}>{check}</p>
                  <div className="flex gap-2">
                    {(['good', 'needs_attention', 'immediate'] as const).map((r) => (
                      <button
                        key={r}
                        onClick={() => handleResultChange(check, r)}
                        className="flex-1 py-1.5 rounded-md text-xs font-semibold transition-all"
                        style={{
                          backgroundColor: result === r ? resultConfig[r].bg : 'hsl(var(--card))',
                          color: result === r ? 'white' : 'hsl(var(--muted-foreground))',
                          border: `1px solid ${result === r ? resultConfig[r].bg : 'hsl(var(--border))'}`,
                        }}
                      >
                        {resultConfig[r].label}
                      </button>
                    ))}
                  </div>
                  {/* Image upload for this check item */}
                  <div className="flex items-center gap-2">
                    {img ? (
                      <div className="flex items-center gap-2 flex-1">
                        <img
                          src={img.preview}
                          alt={`${check} photo`}
                          className="w-12 h-12 rounded-lg object-cover border"
                          style={{ borderColor: 'hsl(var(--border))' }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs truncate font-medium" style={{ color: 'hsl(var(--foreground))' }}>{img.file.name}</p>
                          <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>{(img.file.size / 1024).toFixed(0)} KB</p>
                        </div>
                        <button
                          onClick={() => handleImageRemove(check)}
                          className="p-1.5 rounded-lg transition-colors hover:bg-secondary shrink-0"
                          title="Remove image"
                        >
                          <Trash2 size={13} style={{ color: 'hsl(0 84% 60%)' }} />
                        </button>
                      </div>
                    ) : (
                      <label className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors hover:bg-secondary border"
                        style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}>
                        <Camera size={12} />
                        Add Photo
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="hidden"
                          ref={(el) => { fileInputRefs.current[check] = el; }}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleImageSelect(check, file);
                          }}
                        />
                      </label>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-semibold block mb-1.5" style={{ color: 'hsl(var(--muted-foreground))' }}>Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Any additional notes..."
              className="w-full text-sm px-3 py-2.5 rounded-lg border outline-none resize-none"
              style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
            />
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full py-3 rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-2"
            style={{ backgroundColor: 'hsl(var(--primary))', color: 'white', opacity: submitting ? 0.7 : 1 }}
          >
            {submitting ? <Loader2 size={15} className="animate-spin" /> : <CheckSquare size={15} />}
            {submitting ? 'Submitting...' : 'Submit Safety Check'}
          </button>
        </div>
      )}

      {/* Past Inspections — all drivers */}
      <div>
        <p className="text-xs font-semibold mb-2" style={{ color: 'hsl(var(--muted-foreground))' }}>All Safety Check History</p>
        {loadingInspections ? (
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <div key={i} className="rounded-xl border p-4 animate-pulse" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
                <div className="h-4 rounded w-1/2 mb-2" style={{ backgroundColor: 'hsl(var(--secondary))' }} />
                <div className="h-3 rounded w-1/3" style={{ backgroundColor: 'hsl(var(--secondary))' }} />
              </div>
            ))}
          </div>
        ) : pastInspections.length === 0 ? (
          <div className="rounded-xl border p-8 text-center" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
            <Shield size={32} className="mx-auto mb-2" style={{ color: 'hsl(var(--muted-foreground))' }} />
            <p className="text-sm font-medium" style={{ color: 'hsl(var(--foreground))' }}>No safety checks yet</p>
            <p className="text-xs mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Complete your first pre-drive check above.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {pastInspections.map((insp) => {
              const res = overallResultLabel(insp.overall_result);
              const driverName = (insp.drivers as any)?.name;
              return (
                <div key={insp.id} className="rounded-xl border p-3 flex items-center gap-3" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: res.bg }}>
                    {insp.overall_result === 'pass' ? (
                      <CheckCircle2 size={18} style={{ color: res.color }} />
                    ) : insp.overall_result === 'fail' ? (
                      <XCircle size={18} style={{ color: res.color }} />
                    ) : (
                      <AlertCircle size={18} style={{ color: res.color }} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
                        {(insp.vehicles as any)?.registration ?? 'Unknown Vehicle'}
                      </p>
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium capitalize" style={{ backgroundColor: res.bg, color: res.color }}>
                        {res.label}
                      </span>
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                      {insp.inspection_type === 'interim' ? 'Interim' : 'Full'} check ·{' '}
                      {new Date(insp.completed_at ?? insp.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      {driverName ? ` · ${driverName}` : ''}
                    </p>
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

// ─── Email/Password Login Screen ──────────────────────────────────────────────

interface EmailLoginProps {
  onLogin: (driver: AppDriver & { access_code: string }) => void;
}

function PinLoginScreen({ onLogin }: EmailLoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { logoUrl, appName } = useBranding();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/drivers/portal-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error || 'Invalid email or password. Please try again.');
        return;
      }

      const { driver: d } = json;
      onLogin({
        id: d.id,
        name: d.name,
        phone: d.phone,
        vehicle: d.vehicle,
        plate: d.plate,
        status: d.status,
        avatar: d.avatar,
        access_code: d.access_code ?? '',
      });
    } catch (err: any) {
      setError(err?.message || 'Invalid email or password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-12"
      style={{ backgroundColor: 'hsl(var(--background))' }}
    >
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center gap-3 mb-4">
            <AppLogo size={40} src={logoUrl ?? '/favicon.ico'} className="max-w-[100px]" />
            <span className="text-2xl font-bold" style={{ color: 'hsl(var(--primary))' }}>
              {appName}
            </span>
          </div>
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-full mb-4 text-sm font-medium"
            style={{ backgroundColor: 'hsl(var(--primary) / 0.1)', color: 'hsl(var(--primary))' }}
          >
            <Truck size={14} />
            Driver Portal
          </div>
          <h1 className="text-xl font-semibold text-center" style={{ color: 'hsl(var(--foreground))' }}>
            Driver Sign In
          </h1>
          <p className="mt-1 text-sm text-center" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Sign in to view and manage your assigned orders
          </p>
        </div>

        {/* Card */}
        <div className="card p-6 shadow-sm">
          {error && (
            <div
              className="flex items-start gap-3 p-3 rounded-lg mb-4 text-sm"
              style={{
                backgroundColor: 'hsl(var(--destructive) / 0.08)',
                color: 'hsl(var(--destructive))',
                border: '1px solid hsl(var(--destructive) / 0.2)',
              }}
            >
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label className="label">Email address</label>
              <div className="relative">
                <span
                  className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: 'hsl(var(--muted-foreground))' }}
                >
                  <Mail size={16} />
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="input-base pl-9"
                  autoComplete="email"
                  autoFocus
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="label">Password</label>
              <div className="relative">
                <span
                  className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: 'hsl(var(--muted-foreground))' }}
                >
                  <Lock size={16} />
                </span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="input-base pl-9 pr-10"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: 'hsl(var(--foreground))' }}
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !email.trim() || !password.trim()}
              className="btn-primary w-full justify-center py-2.5"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Signing in…
                </>
              ) : (
                <>
                  <Shield size={16} />
                  Sign in as Driver
                </>
              )}
            </button>
          </form>
        </div>

        <p className="mt-5 text-center text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
          Admin?{' '}
          <a
            href="/login"
            className="font-medium transition-colors hover:underline"
            style={{ color: 'hsl(var(--primary))' }}
          >
            Sign in to Admin Dashboard
          </a>
        </p>
      </div>
    </div>
  );
}

// ─── Clock In/Out Types ───────────────────────────────────────────────────────

interface ActiveShift {
  id: string;
  clock_in: string;
  break_minutes: number;
  pay_type: string;
  shift_type: string;
}

// ─── Clock In/Out Component ───────────────────────────────────────────────────

function ClockInOutCard({
  driverId,
  onShiftChange,
}: {
  driverId: string;
  onShiftChange: () => void;
}) {
  const supabase = createClient();
  const [activeShift, setActiveShift] = useState<ActiveShift | null>(null);
  const [loadingShift, setLoadingShift] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [elapsed, setElapsed] = useState('');
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [endNotes, setEndNotes] = useState('');
  const [deliveriesCount, setDeliveriesCount] = useState('0');
  const [showPayTypeModal, setShowPayTypeModal] = useState(false);
  const [shiftType, setShiftType] = useState<'regular' | 'overtime'>('regular');
  const [hourlyRate, setHourlyRate] = useState('');
  const [fixedAmount, setFixedAmount] = useState('');
  const [perDeliveryRate, setPerDeliveryRate] = useState('');

  const loadActiveShift = useCallback(async () => {
    setLoadingShift(true);
    try {
      const { data } = await supabase
        .from('driver_shifts')
        .select('id, clock_in, break_minutes, pay_type, shift_type')
        .eq('driver_id', driverId)
        .is('clock_out', null)
        .order('clock_in', { ascending: false })
        .limit(1)
        .maybeSingle();
      setActiveShift(data ?? null);
    } catch {
      // silent
    } finally {
      setLoadingShift(false);
    }
  }, [driverId, supabase]);

  useEffect(() => { loadActiveShift(); }, [loadActiveShift]);

  // Elapsed timer
  useEffect(() => {
    if (!activeShift) { setElapsed(''); return; }
    const update = () => {
      const ms = Date.now() - new Date(activeShift.clock_in).getTime();
      const totalMins = Math.floor(ms / 60000) - (activeShift.break_minutes || 0);
      const h = Math.floor(Math.max(0, totalMins) / 60);
      const m = Math.max(0, totalMins) % 60;
      setElapsed(`${h}h ${m.toString().padStart(2, '0')}m`);
    };
    update();
    const id = setInterval(update, 60000);
    return () => clearInterval(id);
  }, [activeShift]);

  const handleClockIn = async () => {
    setProcessing(true);
    try {
      const { error } = await supabase.from('driver_shifts').insert({
        driver_id: driverId,
        clock_in: new Date().toISOString(),
pay_type: 'hourly',
        shift_type: shiftType,
        hourly_rate: null,
        fixed_amount: null,
        per_delivery_rate: null,
        break_minutes: 0,
        status: 'active',
      });
      if (error) throw error;
      toast.success('Clocked in successfully!');
      setShowPayTypeModal(false);
      await loadActiveShift();
      onShiftChange();
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to clock in');
    } finally {
      setProcessing(false);
    }
  };

  const handleClockOut = async () => {
    if (!activeShift) return;
    setProcessing(true);
    try {
      const clockIn = new Date(activeShift.clock_in);
      const clockOut = new Date();
      const durationMs = clockOut.getTime() - clockIn.getTime();
      const durationHrs = Math.max(0, durationMs / 3600000 - (activeShift.break_minutes || 0) / 60);
      let grossPay: number | null = null;
      const { data: shiftFull } = await supabase
        .from('driver_shifts')
        .select('hourly_rate, fixed_amount, per_delivery_rate')
        .eq('id', activeShift.id)
        .single();
      if (shiftFull) {
        if (activeShift.pay_type === 'hourly' && shiftFull.hourly_rate) {
          grossPay = durationHrs * Number(shiftFull.hourly_rate);
        } else if (activeShift.pay_type === 'fixed' && shiftFull.fixed_amount) {
          grossPay = Number(shiftFull.fixed_amount);
        } else if (activeShift.pay_type === 'per_delivery' && shiftFull.per_delivery_rate) {
          grossPay = Number(deliveriesCount || 0) * Number(shiftFull.per_delivery_rate);
        }
      }
      const { error } = await supabase.from('driver_shifts').update({
        clock_out: clockOut.toISOString(),
        deliveries_completed: Number(deliveriesCount) || 0,
        notes: endNotes || null,
        gross_pay: grossPay,
        status: 'completed',
      }).eq('id', activeShift.id);
      if (error) throw error;
      toast.success('Clocked out successfully!');
      setShowNotesModal(false);
      setEndNotes('');
      setDeliveriesCount('0');
      await loadActiveShift();
      onShiftChange();
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to clock out');
    } finally {
      setProcessing(false);
    }
  };

  if (loadingShift) {
    return (
      <div className="rounded-xl border p-4 animate-pulse" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
        <div className="h-4 rounded w-1/3 mb-2" style={{ backgroundColor: 'hsl(var(--secondary))' }} />
        <div className="h-8 rounded w-full" style={{ backgroundColor: 'hsl(var(--secondary))' }} />
      </div>
    );
  }

  return (
    <div className="rounded-xl border p-4" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Timer size={15} style={{ color: 'hsl(var(--primary))' }} />
          <span className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>Shift Tracker</span>
        </div>
        {activeShift && elapsed && (
          <span className="text-sm font-bold" style={{ color: 'hsl(142 69% 35%)' }}>{elapsed}</span>
        )}
      </div>

      {activeShift ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 px-4 py-1.5" style={{ backgroundColor: 'hsl(142 69% 35% / 0.1)' }}>
            <CheckCircle2 size={14} style={{ color: 'hsl(142 69% 35%)' }} />
            <span className="text-xs font-medium" style={{ color: 'hsl(142 69% 35%)' }}>
              On shift since {new Date(activeShift.clock_in).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          <button
            onClick={() => setShowNotesModal(true)}
            disabled={processing}
            className="w-full py-2.5 rounded-lg font-semibold text-sm transition-all flex items-center justify-center gap-2"
            style={{ backgroundColor: 'hsl(0 84% 60%)', color: 'white', opacity: processing ? 0.7 : 1 }}
          >
            {processing ? <Loader2 size={14} className="animate-spin" /> : <Timer size={14} />}
            Clock Out
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowPayTypeModal(true)}
          disabled={processing}
          className="w-full py-2.5 rounded-lg font-semibold text-sm transition-all flex items-center justify-center gap-2"
          style={{ backgroundColor: 'hsl(var(--primary))', color: 'white', opacity: processing ? 0.7 : 1 }}
        >
          {processing ? <Loader2 size={14} className="animate-spin" /> : <Timer size={14} />}
          Clock In
        </button>
      )}

      {/* Clock Out Modal */}
      {showNotesModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="w-full sm:max-w-sm rounded-2xl p-5 space-y-4" style={{ backgroundColor: 'hsl(var(--card))' }}>
            <h3 className="font-bold text-base" style={{ color: 'hsl(var(--foreground))' }}>Clock Out</h3>
            <div>
              <label className="text-xs font-medium block mb-1.5" style={{ color: 'hsl(var(--muted-foreground))' }}>Deliveries completed</label>
              <input
                type="number"
                min="0"
                value={deliveriesCount}
                onChange={(e) => setDeliveriesCount(e.target.value)}
                className="w-full text-sm px-3 py-2.5 rounded-lg border outline-none"
                style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
              />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1.5" style={{ color: 'hsl(var(--muted-foreground))' }}>Notes (optional)</label>
              <textarea
                value={endNotes}
                onChange={(e) => setEndNotes(e.target.value)}
                rows={3}
                placeholder="Any notes for this shift..."
                className="w-full text-sm px-3 py-2.5 rounded-lg border outline-none resize-none"
                style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
              />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowNotesModal(false)} className="flex-1 py-2 rounded-lg font-medium text-sm" style={{ backgroundColor: 'hsl(var(--secondary))', color: 'hsl(var(--foreground))' }}>Cancel</button>
              <button onClick={handleClockOut} disabled={processing} className="flex-1 py-2.5 rounded-lg font-semibold text-sm flex items-center justify-center gap-2" style={{ backgroundColor: 'hsl(0 84% 60%)', color: 'white', opacity: processing ? 0.7 : 1 }}>
                {processing ? <Loader2 size={14} className="animate-spin" /> : null}
                Confirm Clock Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clock In Modal */}
      {showPayTypeModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="w-full sm:max-w-sm rounded-2xl p-5 space-y-4" style={{ backgroundColor: 'hsl(var(--card))' }}>
            <h3 className="font-bold text-base" style={{ color: 'hsl(var(--foreground))' }}>Clock In</h3>
            <div>
              <label className="text-xs font-semibold block mb-1.5" style={{ color: 'hsl(var(--muted-foreground))' }}>Shift Type</label>
              <div className="flex gap-2">
                {(['regular', 'overtime'] as const).map((t) => (
                  <button key={t} onClick={() => setShiftType(t)} className="flex-1 py-2 rounded-lg text-xs font-medium capitalize transition-all"
                    style={{ backgroundColor: shiftType === t ? 'hsl(var(--primary))' : 'hsl(var(--secondary))', color: shiftType === t ? 'white' : 'hsl(var(--muted-foreground))' }}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowPayTypeModal(false)} className="flex-1 py-2 rounded-lg font-medium text-sm" style={{ backgroundColor: 'hsl(var(--secondary))', color: 'hsl(var(--foreground))' }}>Cancel</button>
              <button onClick={handleClockIn} disabled={processing} className="flex-1 py-2.5 rounded-lg font-semibold text-sm flex items-center justify-center gap-2" style={{ backgroundColor: 'hsl(var(--primary))', color: 'white', opacity: processing ? 0.7 : 1 }}>
                {processing ? <Loader2 size={14} className="animate-spin" /> : null}
                Clock In
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Driver Profile Section ───────────────────────────────────────────────────

interface DriverProfileSectionProps {
  driver: AppDriver & { access_code: string };
  onDriverUpdate: (updated: AppDriver & { access_code: string }) => void;
  onLogout: () => void;
  earnings: EarningsSummary | null;
  pastShifts: any[];
  driverPayments: any[];
  allOrders: AppOrder[];
  loadingData: boolean;
}

function DriverProfileSection({ driver, onDriverUpdate, onLogout, earnings, pastShifts, driverPayments, allOrders, loadingData }: DriverProfileSectionProps) {
  const supabase = createClient();
  const [editing, setEditing] = useState(false);
  const [phone, setPhone] = useState(driver.phone ?? '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.from('drivers').update({ phone, updated_at: new Date().toISOString() }).eq('id', driver.id);
      if (error) throw error;
      onDriverUpdate({ ...driver, phone });
      setEditing(false);
      toast.success('Profile updated');
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* ── Profile Card ── */}
      <div className="rounded-xl border p-4" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold shrink-0" style={{ backgroundColor: 'hsl(var(--primary))', color: 'white' }}>
            {driver.avatar || driver.name.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
              {getGreeting()},
            </p>
            <p className="font-bold text-base leading-tight" style={{ color: 'hsl(var(--foreground))' }}>
              {driver.name}
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
              {driver.vehicle} · {driver.plate}
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between px-3 py-2.5 rounded-lg" style={{ backgroundColor: 'hsl(var(--secondary))' }}>
            <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>Status</span>
            <span className="text-xs font-semibold" style={{ color: 'hsl(var(--foreground))' }}>{driver.status}</span>
          </div>
          <div className="flex items-center justify-between px-3 py-2.5 rounded-lg" style={{ backgroundColor: 'hsl(var(--secondary))' }}>
            <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>Phone</span>
            {editing ? (
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="text-xs font-semibold text-right bg-transparent outline-none border-b"
                style={{ color: 'hsl(var(--foreground))', borderColor: 'hsl(var(--primary))' }}
              />
            ) : (
              <span className="text-xs font-semibold" style={{ color: 'hsl(var(--foreground))' }}>{driver.phone || '—'}</span>
            )}
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          {editing ? (
            <>
              <button onClick={() => setEditing(false)} className="flex-1 py-2 rounded-lg text-sm font-medium" style={{ backgroundColor: 'hsl(var(--secondary))', color: 'hsl(var(--foreground))' }}>Cancel</button>
              <button onClick={handleSave} disabled={saving} className="flex-1 py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2" style={{ backgroundColor: 'hsl(var(--primary))', color: 'white', opacity: saving ? 0.7 : 1 }}>
                {saving ? <Loader2 size={13} className="animate-spin" /> : null}
                Save
              </button>
            </>
          ) : (
            <button onClick={() => setEditing(true)} className="flex-1 py-2 rounded-lg text-sm font-medium" style={{ backgroundColor: 'hsl(var(--secondary))', color: 'hsl(var(--foreground))' }}>
              Edit Profile
            </button>
          )}
        </div>
      </div>

      {/* ── Earnings Section ── */}
      {loadingData || !earnings ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-xl border p-4 animate-pulse h-20"
              style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
            />
          ))}
        </div>
      ) : (
        <>
          {/* Earnings Cards */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Today', deliveries: earnings.todayDeliveries, amount: earnings.todayEarnings },
              { label: 'This Week', deliveries: earnings.weekDeliveries, amount: earnings.weekEarnings },
              { label: 'This Month', deliveries: earnings.monthDeliveries, amount: earnings.monthEarnings },
            ].map((period) => (
              <div
                key={period.label}
                className="rounded-xl border p-3 text-center"
                style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
              >
                <p className="text-2xl font-bold leading-none" style={{ color: 'hsl(var(--foreground))' }}>
                  £{period.amount.toFixed(2)}
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  {period.deliveries} deliveries
                </p>
              </div>
            ))}
          </div>

          {/* Performance Stats */}
          <div
            className="rounded-xl border p-4 space-y-4"
            style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
          >
            <h3 className="font-semibold text-sm" style={{ color: 'hsl(var(--foreground))' }}>
              Performance (This Month)
            </h3>

            {/* Completion Rate */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  <TrendingUp size={13} style={{ color: 'hsl(142 69% 35%)' }} />
                  <span className="text-xs font-medium" style={{ color: 'hsl(var(--foreground))' }}>
                    Completion Rate
                  </span>
                </div>
                <span className="text-xs font-bold" style={{ color: 'hsl(142 69% 35%)' }}>
                  {earnings.completionRate}%
                </span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'hsl(var(--secondary))' }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${earnings.completionRate}%`,
                    backgroundColor: earnings.completionRate >= 90
                      ? 'hsl(142 69% 35%)'
                      : earnings.completionRate >= 70
                      ? 'hsl(38 92% 50%)'
                      : 'hsl(0 84% 60%)',
                  }}
                />
              </div>
            </div>

            {/* Average Rating */}
            {earnings.avgRating > 0 && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Star size={13} style={{ color: 'hsl(38 92% 50%)' }} />
                  <span className="text-xs font-medium" style={{ color: 'hsl(var(--foreground))' }}>
                    Avg Customer Rating
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-xs font-bold" style={{ color: 'hsl(var(--foreground))' }}>
                    {earnings.avgRating}
                  </span>
                  <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>/5</span>
                  <div className="flex gap-0.5 ml-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        size={10}
                        fill={star <= Math.round(earnings.avgRating) ? 'hsl(38 92% 50%)' : 'none'}
                        style={{ color: 'hsl(38 92% 50%)' }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Bonus Rate */}
            <div
              className="flex items-center justify-between p-3 rounded-lg"
              style={{ backgroundColor: 'hsl(var(--secondary))' }}
            >
              <div className="flex items-center gap-1.5">
                <PoundSterling size={13} style={{ color: 'hsl(var(--primary))' }} />
                <span className="text-xs font-medium" style={{ color: 'hsl(var(--foreground))' }}>
                  Bonus per Delivery
                </span>
              </div>
              <span className="text-xs font-bold" style={{ color: 'hsl(var(--primary))' }}>
                £{earnings.bonusPerDelivery.toFixed(2)}
              </span>
            </div>
          </div>

          {/* All-Time Summary */}
          <div
            className="rounded-xl border p-4"
            style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
          >
            <h3 className="font-semibold text-sm mb-3" style={{ color: 'hsl(var(--foreground))' }}>
              All-Time Summary
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg text-center" style={{ backgroundColor: 'hsl(var(--secondary))' }}>
                <p className="text-xs mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Total Completed</p>
                <p className="text-base font-bold" style={{ color: 'hsl(var(--foreground))' }}>
                  {allOrders.filter((o) => o.status === 'Booking Complete').length}
                </p>
              </div>
              <div className="p-3 rounded-lg text-center" style={{ backgroundColor: 'hsl(var(--secondary))' }}>
                <p className="text-xs mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Total Bonus Earned</p>
                <p className="text-base font-bold" style={{ color: 'hsl(var(--foreground))' }}>
                  £{(allOrders.filter((o) => o.status === 'Booking Complete').length * earnings.bonusPerDelivery).toFixed(2)}
                </p>
              </div>
            </div>
          </div>

          {/* Payment Summary */}
          {(() => {
            const totalGrossPay = pastShifts.reduce((sum, s) => sum + (Number(s.gross_pay) || 0), 0);
            const totalPaid = driverPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
            const amountDue = Math.max(0, totalGrossPay - totalPaid);
            return (
              <div
                className="rounded-xl border p-4"
                style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
              >
                <h3 className="font-semibold text-sm mb-3" style={{ color: 'hsl(var(--foreground))' }}>
                  Payment Summary
                </h3>
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 rounded-lg text-center" style={{ backgroundColor: 'hsl(var(--secondary))' }}>
                    <p className="text-xs mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Gross Pay</p>
                    <p className="text-base font-bold" style={{ color: 'hsl(var(--foreground))' }}>£{totalGrossPay.toFixed(2)}</p>
                  </div>
                  <div className="p-3 rounded-lg text-center" style={{ backgroundColor: 'hsl(var(--secondary))' }}>
                    <p className="text-xs mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Total Paid</p>
                    <p className="text-base font-bold" style={{ color: 'hsl(142 69% 35%)' }}>£{totalPaid.toFixed(2)}</p>
                  </div>
                  <div className="p-3 rounded-lg text-center" style={{ backgroundColor: amountDue > 0 ? 'hsl(38 92% 50% / 0.12)' : 'hsl(142 69% 35% / 0.1)' }}>
                    <p className="text-xs mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Amount Due</p>
                    <p className="text-base font-bold" style={{ color: amountDue > 0 ? 'hsl(38 92% 50%)' : 'hsl(142 69% 35%)' }}>£{amountDue.toFixed(2)}</p>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Past Shifts */}
          <div
            className="rounded-xl border p-4"
            style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
          >
            <h3 className="font-semibold text-sm mb-3" style={{ color: 'hsl(var(--foreground))' }}>
              Past Shifts
            </h3>
            {pastShifts.length === 0 ? (
              <p className="text-xs text-center py-4" style={{ color: 'hsl(var(--muted-foreground))' }}>
                No shifts recorded yet.
              </p>
            ) : (
              <div className="space-y-2">
                {pastShifts.map((shift) => {
                  const clockIn = new Date(shift.clock_in);
                  const clockOut = shift.clock_out ? new Date(shift.clock_out) : null;
                  const durationMs = clockOut ? clockOut.getTime() - clockIn.getTime() : null;
                  const durationHrs = durationMs ? (durationMs / 3600000 - (shift.break_minutes || 0) / 60) : null;
                  return (
                    <div
                      key={shift.id}
                      className="flex items-start justify-between gap-3 p-3 rounded-lg"
                      style={{ backgroundColor: 'hsl(var(--secondary))' }}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-xs font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
                            {clockIn.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </span>
                          <span
                            className="text-xs px-2 py-0.5 rounded-full font-medium"
                            style={{
                              backgroundColor: shift.shift_type === 'overtime' ? 'hsl(262 83% 58% / 0.15)' : 'hsl(217 91% 60% / 0.12)',
                              color: shift.shift_type === 'overtime' ? 'hsl(262 83% 58%)' : 'hsl(217 91% 60%)',
                            }}
                          >
                            {shift.shift_type}
                          </span>
                          {shift.is_manual && (
                            <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}>
                              manual
                            </span>
                          )}
                        </div>
                        <p className="text-xs mt-0.5 truncate" style={{ color: 'hsl(var(--muted-foreground))' }}>
                          {clockIn.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                          {clockOut ? ` – ${clockOut.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : ' (ongoing)'}
                          {durationHrs !== null && ` · ${durationHrs.toFixed(1)}h`}
                          {shift.break_minutes > 0 && ` (${shift.break_minutes}m break)`}
                        </p>
                        {shift.notes && (
                          <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                            {shift.notes}
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        {shift.gross_pay != null ? (
                          <p className="text-sm font-bold" style={{ color: 'hsl(var(--foreground))' }}>
                            £{Number(shift.gross_pay).toFixed(2)}
                          </p>
                        ) : (
                          <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>—</p>
                        )}
                        <p className="text-xs capitalize" style={{ color: 'hsl(var(--muted-foreground))' }}>
                          {shift.pay_type}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Payment History */}
          <div
            className="rounded-xl border p-4"
            style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
          >
            <h3 className="font-semibold text-sm mb-3" style={{ color: 'hsl(var(--foreground))' }}>
              Payment History
            </h3>
            {driverPayments.length === 0 ? (
              <p className="text-xs text-center py-4" style={{ color: 'hsl(var(--muted-foreground))' }}>
                No payments recorded yet.
              </p>
            ) : (
              <div className="space-y-2">
                {driverPayments.map((payment) => (
                  <div
                    key={payment.id}
                    className="flex items-start justify-between gap-3 p-3 rounded-lg"
                    style={{ backgroundColor: 'hsl(var(--secondary))' }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
                        {new Date(payment.payment_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </p>
                      <p className="text-xs capitalize mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        {payment.payment_method.replace(/_/g, ' ')}
                        {payment.reference ? ` · Ref: ${payment.reference}` : ''}
                      </p>
                      {payment.period_start && payment.period_end && (
                        <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                          Period: {new Date(payment.period_start).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} – {new Date(payment.period_end).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                        </p>
                      )}
                      {payment.notes && (
                        <p className="text-xs mt-0.5 truncate" style={{ color: 'hsl(var(--muted-foreground))' }}>
                          {payment.notes}
                        </p>
                      )}
                    </div>
                    <p className="text-sm font-bold shrink-0" style={{ color: 'hsl(142 69% 35%)' }}>
                      £{Number(payment.amount).toFixed(2)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      <button
        onClick={onLogout}
        className="w-full py-3 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2"
        style={{ backgroundColor: 'hsl(0 84% 60% / 0.1)', color: 'hsl(0 84% 60%)', border: '1px solid hsl(0 84% 60% / 0.2)' }}
      >
        Sign Out
      </button>
    </div>
  );
}

// ─── Earnings Section Component ──────────────────────────────────────────────

interface EarningsSectionProps {
  earnings: EarningsSummary | null;
  pastShifts: any[];
  driverPayments: any[];
  allOrders: AppOrder[];
  loadingData: boolean;
}

function EarningsSection({ earnings, pastShifts, driverPayments, allOrders, loadingData }: EarningsSectionProps) {
  // Calculate hourly earnings from shifts
  const totalHoursWorked = pastShifts.reduce((sum, s) => {
    if (!s.clock_out) return sum;
    const durationMs = new Date(s.clock_out).getTime() - new Date(s.clock_in).getTime();
    const hrs = Math.max(0, durationMs / 3600000 - (s.break_minutes || 0) / 60);
    return sum + hrs;
  }, 0);

  const totalGrossPay = pastShifts.reduce((sum, s) => sum + (Number(s.gross_pay) || 0), 0);
  const avgHourlyRate = totalHoursWorked > 0 ? totalGrossPay / totalHoursWorked : 0;

  // This week's shifts
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const weekShifts = pastShifts.filter((s) => new Date(s.clock_in) >= weekStart);
  const weekHours = weekShifts.reduce((sum, s) => {
    if (!s.clock_out) return sum;
    const durationMs = new Date(s.clock_out).getTime() - new Date(s.clock_in).getTime();
    return sum + Math.max(0, durationMs / 3600000 - (s.break_minutes || 0) / 60);
  }, 0);
  const weekPay = weekShifts.reduce((sum, s) => sum + (Number(s.gross_pay) || 0), 0);

  // This month's shifts
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const monthShifts = pastShifts.filter((s) => new Date(s.clock_in) >= monthStart);
  const monthHours = monthShifts.reduce((sum, s) => {
    if (!s.clock_out) return sum;
    const durationMs = new Date(s.clock_out).getTime() - new Date(s.clock_in).getTime();
    return sum + Math.max(0, durationMs / 3600000 - (s.break_minutes || 0) / 60);
  }, 0);
  const monthPay = monthShifts.reduce((sum, s) => sum + (Number(s.gross_pay) || 0), 0);

  const totalPaid = driverPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const amountDue = Math.max(0, totalGrossPay - totalPaid);

  if (loadingData) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border p-4 animate-pulse h-20" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Hourly Earnings Summary */}
      <div className="rounded-2xl border p-4 space-y-3" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
        <div className="flex items-center gap-2 mb-1">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'hsl(142 69% 35% / 0.12)' }}>
            <PoundSterling size={16} style={{ color: 'hsl(142 69% 35%)' }} />
          </div>
          <h3 className="font-bold text-sm" style={{ color: 'hsl(var(--foreground))' }}>Hourly Earnings</h3>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'This Week', hours: weekHours, pay: weekPay },
            { label: 'This Month', hours: monthHours, pay: monthPay },
            { label: 'All Time', hours: totalHoursWorked, pay: totalGrossPay },
          ].map((period) => (
            <div key={period.label} className="rounded-xl p-3 text-center" style={{ backgroundColor: 'hsl(var(--secondary))' }}>
              <p className="text-lg font-bold leading-none" style={{ color: 'hsl(142 69% 35%)' }}>
                £{period.pay.toFixed(2)}
              </p>
              <p className="text-xs mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
                {period.hours.toFixed(1)}h
              </p>
              <p className="text-xs font-medium mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>{period.label}</p>
            </div>
          ))}
        </div>
        {avgHourlyRate > 0 && (
          <div className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ backgroundColor: 'hsl(var(--primary) / 0.08)' }}>
            <span className="text-xs font-medium" style={{ color: 'hsl(var(--foreground))' }}>Avg Hourly Rate</span>
            <span className="text-sm font-bold" style={{ color: 'hsl(var(--primary))' }}>£{avgHourlyRate.toFixed(2)}/hr</span>
          </div>
        )}
      </div>

      {/* Delivery Earnings */}
      {earnings && (
        <div className="rounded-2xl border p-4 space-y-3" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'hsl(217 91% 60% / 0.12)' }}>
              <Truck size={16} style={{ color: 'hsl(217 91% 60%)' }} />
            </div>
            <h3 className="font-bold text-sm" style={{ color: 'hsl(var(--foreground))' }}>Delivery Earnings</h3>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Today', deliveries: earnings.todayDeliveries, amount: earnings.todayEarnings },
              { label: 'This Week', deliveries: earnings.weekDeliveries, amount: earnings.weekEarnings },
              { label: 'This Month', deliveries: earnings.monthDeliveries, amount: earnings.monthEarnings },
            ].map((period) => (
              <div key={period.label} className="rounded-xl p-3 text-center" style={{ backgroundColor: 'hsl(var(--secondary))' }}>
                <p className="text-lg font-bold leading-none" style={{ color: 'hsl(var(--foreground))' }}>
                  £{period.amount.toFixed(2)}
                </p>
                <p className="text-xs mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  {period.deliveries} {period.deliveries === 1 ? 'delivery' : 'deliveries'}
                </p>
                <p className="text-xs font-medium mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>{period.label}</p>
              </div>
            ))}
          </div>
          {/* Completion Rate */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5">
                <TrendingUp size={13} style={{ color: 'hsl(142 69% 35%)' }} />
                <span className="text-xs font-medium" style={{ color: 'hsl(var(--foreground))' }}>Completion Rate</span>
              </div>
              <span className="text-xs font-bold" style={{ color: 'hsl(142 69% 35%)' }}>{earnings.completionRate}%</span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'hsl(var(--secondary))' }}>
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${earnings.completionRate}%`,
                  backgroundColor: earnings.completionRate >= 90 ? 'hsl(142 69% 35%)' : earnings.completionRate >= 70 ? 'hsl(38 92% 50%)' : 'hsl(0 84% 60%)',
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Payment Summary */}
      <div className="rounded-2xl border p-4" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
        <h3 className="font-semibold text-sm mb-3" style={{ color: 'hsl(var(--foreground))' }}>Payment Summary</h3>
        <div className="grid grid-cols-3 gap-2">
          <div className="p-3 rounded-lg text-center" style={{ backgroundColor: 'hsl(var(--secondary))' }}>
            <p className="text-xs mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Gross Pay</p>
            <p className="text-base font-bold" style={{ color: 'hsl(var(--foreground))' }}>£{totalGrossPay.toFixed(2)}</p>
          </div>
          <div className="p-3 rounded-lg text-center" style={{ backgroundColor: 'hsl(var(--secondary))' }}>
            <p className="text-xs mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Total Paid</p>
            <p className="text-base font-bold" style={{ color: 'hsl(142 69% 35%)' }}>£{totalPaid.toFixed(2)}</p>
          </div>
          <div className="p-3 rounded-lg text-center" style={{ backgroundColor: amountDue > 0 ? 'hsl(38 92% 50% / 0.12)' : 'hsl(142 69% 35% / 0.1)' }}>
            <p className="text-xs mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Amount Due</p>
            <p className="text-base font-bold" style={{ color: amountDue > 0 ? 'hsl(38 92% 50%)' : 'hsl(142 69% 35%)' }}>£{amountDue.toFixed(2)}</p>
          </div>
        </div>
      </div>

      {/* Past Shifts */}
      <div className="rounded-2xl border p-4" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
        <h3 className="font-semibold text-sm mb-3" style={{ color: 'hsl(var(--foreground))' }}>Past Shifts</h3>
        {pastShifts.length === 0 ? (
          <div className="text-center py-6">
            <Clock size={32} className="mx-auto mb-2" style={{ color: 'hsl(var(--muted-foreground))' }} />
            <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>No shifts recorded yet. Use Clock In to start tracking.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {pastShifts.map((shift) => {
              const clockIn = new Date(shift.clock_in);
              const clockOut = shift.clock_out ? new Date(shift.clock_out) : null;
              const durationMs = clockOut ? clockOut.getTime() - clockIn.getTime() : null;
              const durationHrs = durationMs ? (durationMs / 3600000 - (shift.break_minutes || 0) / 60) : null;
              return (
                <div key={shift.id} className="flex items-start justify-between gap-3 p-3 rounded-lg" style={{ backgroundColor: 'hsl(var(--secondary))' }}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <span className="text-xs font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
                        {clockIn.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </span>
                      <span
                        className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{
                          backgroundColor: shift.shift_type === 'overtime' ? 'hsl(262 83% 58% / 0.15)' : 'hsl(217 91% 60% / 0.12)',
                          color: shift.shift_type === 'overtime' ? 'hsl(262 83% 58%)' : 'hsl(217 91% 60%)',
                        }}
                      >
                        {shift.shift_type ?? 'regular'}
                      </span>
                      {shift.pay_type && (
                        <span className="text-xs px-1.5 py-0.5 rounded-full capitalize" style={{ backgroundColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}>
                          {shift.pay_type}
                        </span>
                      )}
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                      {clockIn.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                      {clockOut ? ` – ${clockOut.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : ' (ongoing)'}
                      {durationHrs !== null && ` · ${durationHrs.toFixed(1)}h`}
                      {shift.break_minutes > 0 && ` (${shift.break_minutes}m break)`}
                    </p>
                    {shift.notes && (
                      <p className="text-xs mt-0.5 truncate" style={{ color: 'hsl(var(--muted-foreground))' }}>{shift.notes}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    {shift.gross_pay != null ? (
                      <p className="text-sm font-bold" style={{ color: 'hsl(142 69% 35%)' }}>£{Number(shift.gross_pay).toFixed(2)}</p>
                    ) : durationHrs !== null && shift.hourly_rate ? (
                      <p className="text-sm font-bold" style={{ color: 'hsl(var(--foreground))' }}>£{(durationHrs * Number(shift.hourly_rate)).toFixed(2)}</p>
                    ) : (
                      <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>—</p>
                    )}
                    {shift.hourly_rate && (
                      <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>£{Number(shift.hourly_rate).toFixed(2)}/hr</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Payment History */}
      <div className="rounded-2xl border p-4" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
        <h3 className="font-semibold text-sm mb-3" style={{ color: 'hsl(var(--foreground))' }}>Payment History</h3>
        {driverPayments.length === 0 ? (
          <p className="text-xs text-center py-4" style={{ color: 'hsl(var(--muted-foreground))' }}>No payments recorded yet.</p>
        ) : (
          <div className="space-y-2">
            {driverPayments.map((payment) => (
              <div key={payment.id} className="flex items-start justify-between gap-3 p-3 rounded-lg" style={{ backgroundColor: 'hsl(var(--secondary))' }}>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
                    {new Date(payment.payment_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </p>
                  <p className="text-xs capitalize mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    {(payment.payment_method ?? '').replace(/_/g, ' ')}
                    {payment.reference ? ` · Ref: ${payment.reference}` : ''}
                  </p>
                  {payment.notes && (
                    <p className="text-xs mt-0.5 truncate" style={{ color: 'hsl(var(--muted-foreground))' }}>{payment.notes}</p>
                  )}
                </div>
                <p className="text-sm font-bold shrink-0" style={{ color: 'hsl(142 69% 35%)' }}>£{Number(payment.amount).toFixed(2)}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Cash Management Section ──────────────────────────────────────────────────

interface CashSectionProps {
  driverId: string;
  loadingData: boolean;
  cashAllocations: any[];
  onRefresh: () => void;
}

function CashSection({ driverId, loadingData, cashAllocations, onRefresh }: CashSectionProps) {
  const supabase = createClient();

  const totalCash = cashAllocations.reduce((sum, a) => sum + Number(a.amount || 0), 0);

  if (loadingData) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border p-4 animate-pulse h-16" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Card */}
      <div className="rounded-2xl border p-4" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'hsl(142 69% 35% / 0.12)' }}>
            <Banknote size={20} style={{ color: 'hsl(142 69% 35%)' }} />
          </div>
          <div>
            <p className="font-bold text-sm" style={{ color: 'hsl(var(--foreground))' }}>Cash Management</p>
            <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>Cash collected from customers</p>
          </div>
          <button onClick={onRefresh} className="ml-auto p-2 rounded-lg transition-colors hover:bg-secondary">
            <RefreshCw size={14} style={{ color: 'hsl(var(--muted-foreground))' }} />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-xl text-center" style={{ backgroundColor: 'hsl(142 69% 35% / 0.08)' }}>
            <p className="text-2xl font-bold" style={{ color: 'hsl(142 69% 35%)' }}>£{totalCash.toFixed(2)}</p>
            <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>Total Cash Held</p>
          </div>
          <div className="p-3 rounded-xl text-center" style={{ backgroundColor: 'hsl(var(--secondary))' }}>
            <p className="text-2xl font-bold" style={{ color: 'hsl(var(--foreground))' }}>{cashAllocations.length}</p>
            <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>Transactions</p>
          </div>
        </div>
      </div>

      {/* Cash Allocations List */}
      <div className="rounded-2xl border p-4" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
        <h3 className="font-semibold text-sm mb-3" style={{ color: 'hsl(var(--foreground))' }}>Cash Records</h3>
        {cashAllocations.length === 0 ? (
          <div className="text-center py-8">
            <Banknote size={36} className="mx-auto mb-2" style={{ color: 'hsl(var(--muted-foreground))' }} />
            <p className="text-sm font-medium" style={{ color: 'hsl(var(--foreground))' }}>No cash records</p>
            <p className="text-xs mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Cash collected from orders will appear here. Record payment via the order details.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {cashAllocations.map((alloc) => (
              <div key={alloc.id} className="rounded-xl overflow-hidden border" style={{ borderColor: 'hsl(var(--border))' }}>
                <div className="flex items-start gap-3 p-3" style={{ backgroundColor: 'hsl(var(--secondary))' }}>
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: 'hsl(142 69% 35% / 0.12)' }}>
                    <Banknote size={14} style={{ color: 'hsl(142 69% 35%)' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-bold" style={{ color: 'hsl(142 69% 35%)' }}>£{Number(alloc.amount).toFixed(2)}</p>
                    </div>
                    {alloc.order_id && (
                      <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>Order: {alloc.order_id}</p>
                    )}
                    {alloc.notes && (
                      <p className="text-xs mt-0.5 truncate" style={{ color: 'hsl(var(--muted-foreground))' }}>{alloc.notes}</p>
                    )}
                    <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                      {new Date(alloc.allocated_at ?? alloc.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                      {' · '}
                      {new Date(alloc.allocated_at ?? alloc.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── GPS & Notifications Status Banner ───────────────────────────────────────

interface StatusBannerProps {
  gpsTracking: boolean;
  gpsPermission: string;
  pushPermission: string;
  onRequestGps: () => void;
  onRequestPush: () => void;
}

function StatusBanner({ gpsTracking, gpsPermission, pushPermission, onRequestGps, onRequestPush }: StatusBannerProps) {
  const gpsOk = gpsTracking && gpsPermission === 'granted';
  const pushOk = pushPermission === 'granted';

  if (gpsOk && pushOk) return null;

  return (
    <div className="space-y-2">
      {!gpsOk && (
        <button
          onClick={onRequestGps}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-colors hover:bg-secondary"
          style={{
            backgroundColor: gpsPermission === 'denied' ? 'hsl(0 84% 60% / 0.06)' : 'hsl(38 92% 50% / 0.08)',
            borderColor: gpsPermission === 'denied' ? 'hsl(0 84% 60% / 0.3)' : 'hsl(38 92% 50% / 0.3)',
          }}
        >
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: gpsPermission === 'denied' ? 'hsl(0 84% 60% / 0.12)' : 'hsl(38 92% 50% / 0.12)' }}>
            {gpsTracking ? <Navigation size={15} style={{ color: 'hsl(142 69% 35%)' }} /> : <WifiOff size={15} style={{ color: gpsPermission === 'denied' ? 'hsl(0 84% 60%)' : 'hsl(38 92% 50%)' }} />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold" style={{ color: gpsPermission === 'denied' ? 'hsl(0 84% 60%)' : 'hsl(38 92% 50%)' }}>
              {gpsPermission === 'denied' ? 'GPS Blocked' : gpsTracking ? 'GPS Active' : 'Enable GPS Tracking'}
            </p>
            <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
              {gpsPermission === 'denied' ? 'Allow location in browser settings to enable tracking' : 'Tap to start broadcasting your location'}
            </p>
          </div>
          {gpsPermission !== 'denied' && (
            <span className="text-xs font-semibold px-2 py-1 rounded-lg" style={{ backgroundColor: 'hsl(38 92% 50%)', color: 'white' }}>Enable</span>
          )}
        </button>
      )}
      {!pushOk && (
        <button
          onClick={onRequestPush}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-colors hover:bg-secondary"
          style={{
            backgroundColor: pushPermission === 'denied' ? 'hsl(0 84% 60% / 0.06)' : 'hsl(217 91% 60% / 0.08)',
            borderColor: pushPermission === 'denied' ? 'hsl(0 84% 60% / 0.3)' : 'hsl(217 91% 60% / 0.3)',
          }}
        >
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: pushPermission === 'denied' ? 'hsl(0 84% 60% / 0.12)' : 'hsl(217 91% 60% / 0.12)' }}>
            {pushPermission === 'denied' ? <BellOff size={15} style={{ color: 'hsl(0 84% 60%)' }} /> : <Bell size={15} style={{ color: 'hsl(217 91% 60%)' }} />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold" style={{ color: pushPermission === 'denied' ? 'hsl(0 84% 60%)' : 'hsl(217 91% 60%)' }}>
              {pushPermission === 'denied' ? 'Notifications Blocked' : 'Enable Notifications'}
            </p>
            <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
              {pushPermission === 'denied' ? 'Allow notifications in browser settings' : 'Get alerted when new orders are assigned'}
            </p>
          </div>
          {pushPermission !== 'denied' && (
            <span className="text-xs font-semibold px-2 py-1 rounded-lg" style={{ backgroundColor: 'hsl(217 91% 60%)', color: 'white' }}>Enable</span>
          )}
        </button>
      )}
    </div>
  );
}

// ─── Notifications Section ────────────────────────────────────────────────────

interface DriverNotification {
  id: string;
  alert_type: string;
  title: string;
  message: string;
  order_id: string | null;
  is_dismissed: boolean;
  dismissed_at: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

const NOTIF_TYPE_STYLES: Record<string, { color: string; bg: string; label: string }> = {
  overdue: { color: 'hsl(0 84% 60%)', bg: 'hsl(0 84% 60% / 0.1)', label: 'Overdue' },
  pending_payment: { color: 'hsl(38 92% 50%)', bg: 'hsl(38 92% 50% / 0.1)', label: 'Payment' },
  unassigned: { color: 'hsl(217 91% 60%)', bg: 'hsl(217 91% 60% / 0.1)', label: 'Unassigned' },
  driver_shift_reminder: { color: 'hsl(262 83% 58%)', bg: 'hsl(262 83% 58% / 0.1)', label: 'Shift' },
  payment_notification: { color: 'hsl(142 69% 35%)', bg: 'hsl(142 69% 35% / 0.1)', label: 'Payment' },
  admin_alert: { color: 'hsl(0 84% 60%)', bg: 'hsl(0 84% 60% / 0.1)', label: 'Alert' },
};

function formatNotifTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

interface NotificationsSectionProps {
  driverId: string;
}

function NotificationsSection({ driverId }: NotificationsSectionProps) {
  const supabase = createClient();
  const [notifications, setNotifications] = useState<DriverNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread' | 'read'>('all');
  const [dismissingId, setDismissingId] = useState<string | null>(null);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('driver_id', driverId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (!error && data) {
        setNotifications(data as DriverNotification[]);
      }
    } catch {}
    setLoading(false);
  }, [driverId, supabase]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const handleDismiss = async (id: string) => {
    setDismissingId(id);
    try {
      await supabase
        .from('notifications')
        .update({ is_dismissed: true, dismissed_at: new Date().toISOString() })
        .eq('id', id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_dismissed: true, dismissed_at: new Date().toISOString() } : n))
      );
    } catch {}
    setDismissingId(null);
  };

  const handleDismissAll = async () => {
    const unread = notifications.filter((n) => !n.is_dismissed);
    if (unread.length === 0) return;
    try {
      const ids = unread.map((n) => n.id);
      await supabase
        .from('notifications')
        .update({ is_dismissed: true, dismissed_at: new Date().toISOString() })
        .in('id', ids);
      setNotifications((prev) =>
        prev.map((n) => ids.includes(n.id) ? { ...n, is_dismissed: true, dismissed_at: new Date().toISOString() } : n)
      );
    } catch {}
  };

  const filtered = notifications.filter((n) => {
    if (filter === 'unread') return !n.is_dismissed;
    if (filter === 'read') return n.is_dismissed;
    return true;
  });

  const unreadCount = notifications.filter((n) => !n.is_dismissed).length;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-bold" style={{ color: 'hsl(var(--foreground))' }}>Notifications</h2>
          {unreadCount > 0 && (
            <span
              className="text-xs font-bold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: 'hsl(0 84% 60%)', color: 'white' }}
            >
              {unreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              onClick={handleDismissAll}
              className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors"
              style={{ backgroundColor: 'hsl(var(--secondary))', color: 'hsl(var(--muted-foreground))' }}
            >
              <CheckCheck size={12} />
              Mark all read
            </button>
          )}
          <button
            onClick={loadNotifications}
            disabled={loading}
            className="p-2 rounded-lg transition-colors hover:bg-secondary"
            title="Refresh"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} style={{ color: 'hsl(var(--muted-foreground))' }} />
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-1 p-1 rounded-lg" style={{ backgroundColor: 'hsl(var(--secondary))' }}>
        {(['all', 'unread', 'read'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="flex-1 py-1.5 rounded-md text-xs font-medium transition-all capitalize"
            style={{
              backgroundColor: filter === f ? 'hsl(var(--card))' : 'transparent',
              color: filter === f ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))',
            }}
          >
            {f === 'all' ? `All (${notifications.length})` : f === 'unread' ? `Unread (${unreadCount})` : `Read (${notifications.length - unreadCount})`}
          </button>
        ))}
      </div>

      {/* Notifications List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin" style={{ color: 'hsl(var(--muted-foreground))' }} />
        </div>
      ) : filtered.length === 0 ? (
        <div
          className="rounded-xl border p-10 text-center"
          style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
        >
          <BellRing size={36} className="mx-auto mb-3" style={{ color: 'hsl(var(--muted-foreground))' }} />
          <p className="font-semibold text-sm" style={{ color: 'hsl(var(--foreground))' }}>
            {filter === 'unread' ? 'No unread notifications' : filter === 'read' ? 'No read notifications' : 'No notifications yet'}
          </p>
          <p className="text-xs mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
            {filter === 'all' ? 'Notifications from dispatch will appear here.' : 'Switch to "All" to see all notifications.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((notif) => {
            const typeStyle = NOTIF_TYPE_STYLES[notif.alert_type] ?? { color: 'hsl(var(--muted-foreground))', bg: 'hsl(var(--secondary))', label: notif.alert_type };
            return (
              <div
                key={notif.id}
                className="rounded-xl border p-4 transition-all"
                style={{
                  backgroundColor: 'hsl(var(--card))',
                  borderColor: notif.is_dismissed ? 'hsl(var(--border))' : typeStyle.color + '55',
                  opacity: notif.is_dismissed ? 0.7 : 1,
                }}
              >
                <div className="flex items-start gap-3">
                  {/* Icon */}
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                    style={{ backgroundColor: typeStyle.bg }}
                  >
                    <Bell size={16} style={{ color: typeStyle.color }} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold leading-tight" style={{ color: 'hsl(var(--foreground))' }}>
                          {notif.title}
                        </p>
                        <span
                          className="text-xs font-medium px-1.5 py-0.5 rounded-md"
                          style={{ backgroundColor: typeStyle.bg, color: typeStyle.color }}
                        >
                          {typeStyle.label}
                        </span>
                        {!notif.is_dismissed && (
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: typeStyle.color }}
                          />
                        )}
                      </div>
                      <span className="text-xs shrink-0" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        {formatNotifTime(notif.created_at)}
                      </span>
                    </div>

                    <p className="text-xs mt-1 leading-relaxed" style={{ color: 'hsl(var(--muted-foreground))' }}>
                      {notif.message}
                    </p>

                    {notif.order_id && (
                      <p className="text-xs mt-1.5 font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        Order: <span style={{ color: 'hsl(var(--foreground))' }}>#{notif.order_id}</span>
                      </p>
                    )}

                    {notif.metadata && Object.keys(notif.metadata).length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {Object.entries(notif.metadata).map(([k, v]) => (
                          <span
                            key={k}
                            className="text-xs px-2 py-0.5 rounded-md"
                            style={{ backgroundColor: 'hsl(var(--secondary))', color: 'hsl(var(--muted-foreground))' }}
                          >
                            {k}: {String(v)}
                          </span>
                        ))}
                      </div>
                    )}

                    {!notif.is_dismissed && (
                      <button
                        onClick={() => handleDismiss(notif.id)}
                        disabled={dismissingId === notif.id}
                        className="mt-2.5 flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg transition-colors"
                        style={{ backgroundColor: 'hsl(var(--secondary))', color: 'hsl(var(--muted-foreground))' }}
                      >
                        {dismissingId === notif.id ? (
                          <Loader2 size={10} className="animate-spin" />
                        ) : (
                          <CheckCircle2 size={10} />
                        )}
                        Mark as read
                      </button>
                    )}

                    {notif.is_dismissed && notif.dismissed_at && (
                      <p className="text-xs mt-1.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        Read {formatNotifTime(notif.dismissed_at)}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main Driver Dashboard (after login) ──────────────────────────────────────

function DriverDashboard({
  driver: initialDriver,
  onLogout,
}: {
  driver: AppDriver & { access_code: string };
  onLogout: () => void;
}) {
  const supabase = createClient();
  const { logoUrl } = useBranding();
  const [driver, setDriver] = useState(initialDriver);
  const [allOrders, setAllOrders] = useState<AppOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<'orders' | 'past-bookings' | 'vehicle' | 'map' | 'profile' | 'loading' | 'earnings' | 'cash' | 'notifications'>('orders');
  const [activeTab, setActiveTab] = useState<'today' | 'tomorrow' | 'all'>('today');
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [selectedBookingDetail, setSelectedBookingDetail] = useState<AppOrder | null>(null);
  const [pastBookingSearch, setPastBookingSearch] = useState('');
  const [pastBookingDateFilter, setPastBookingDateFilter] = useState('');
  const [pastBookingTypeFilter, setPastBookingTypeFilter] = useState('all');
  const [shiftRefreshKey, setShiftRefreshKey] = useState(0);
  const [earnings, setEarnings] = useState<EarningsSummary | null>(null);
  const [pastShifts, setPastShifts] = useState<any[]>([]);
  const [driverPayments, setDriverPayments] = useState<any[]>([]);
  const [cashAllocations, setCashAllocations] = useState<any[]>([]);
  const [vehicleLoadingDate, setVehicleLoadingDate] = useState<string>(getTodayStr());

  // ── Delivery Failed state ──────────────────────────────────────────────────
  const [failedOrderId, setFailedOrderId] = useState<string | null>(null);
  const [failureReason, setFailureReason] = useState('');
  const [failureNotes, setFailureNotes] = useState('');
  const [submittingFailure, setSubmittingFailure] = useState(false);

  // ─── GPS Tracking (via dedicated hook with background sync) ─────────────────
  const { isTracking: gpsTracking, permissionState: gpsPermission, requestPermission: requestGpsPermission } = useDriverGps({
    driverId: driver.id,
    enabled: true,
    intervalMs: 30000,
  });

  // ─── Push Notifications (driver-specific) ──────────────────────────────────
  const { subscribe: subscribePush, permissionState: pushPermission } = useDriverPushNotifications({
    driverId: driver.id,
    driverName: driver.name,
  });

  // Request push permission on first interaction
  useEffect(() => {
    if (pushPermission === 'default') {
      const handleFirstInteraction = () => {
        subscribePush();
        document.removeEventListener('click', handleFirstInteraction);
      };
      document.addEventListener('click', handleFirstInteraction, { once: true });
      return () => document.removeEventListener('click', handleFirstInteraction);
    }
  }, [pushPermission, subscribePush]);

  const handleRequestGps = useCallback(async () => {
    // requestPermission checks current state; if already granted it returns true immediately.
    // startTracking is called separately to avoid double-starting the watcher.
    const granted = await requestGpsPermission();
    if (granted) {
      toast.success('GPS tracking enabled');
    } else {
      toast.error('GPS permission denied. Please enable location access in your browser settings.');
    }
  }, [requestGpsPermission]);

  const handleRequestPush = useCallback(async () => {
    const result = await subscribePush();
    if (result) {
      toast.success('Notifications enabled');
    } else {
      toast.error('Notification permission denied. Please enable in browser settings.');
    }
  }, [subscribePush]);

  // ─── Data Loading ──────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: ordersData, error: ordersError } = await supabase
        .from('orders')
        .select('*, drivers(*)')
        .eq('driver_id', driver.id)
        .order('booking_date', { ascending: false });

      if (!ordersError && ordersData) {
        const { mapDbOrderToApp } = await import('@/lib/services/ordersService');
        setAllOrders(ordersData.map((row: any) => mapDbOrderToApp(row)));
      }

      // Load earnings summary
      const today = getTodayStr();
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

      const { data: completedOrders } = await supabase
        .from('orders')
        .select('booking_date, payment_amount')
        .eq('driver_id', driver.id)
        .eq('status', 'Booking Complete');

      const { data: allDriverOrders } = await supabase
        .from('orders')
        .select('booking_date, status')
        .eq('driver_id', driver.id);

      const todayCompleted = (completedOrders ?? []).filter((o: any) => o.booking_date === today);
      const weekCompleted = (completedOrders ?? []).filter((o: any) => new Date(o.booking_date) >= weekStart);
      const monthCompleted = (completedOrders ?? []).filter((o: any) => new Date(o.booking_date) >= monthStart);

      const totalOrders = (allDriverOrders ?? []).length;
      const totalCompleted = (completedOrders ?? []).length;

      setEarnings({
        todayDeliveries: todayCompleted.length,
        weekDeliveries: weekCompleted.length,
        monthDeliveries: monthCompleted.length,
        todayEarnings: todayCompleted.reduce((s: number, o: any) => s + Number(o.payment_amount ?? 0), 0),
        weekEarnings: weekCompleted.reduce((s: number, o: any) => s + Number(o.payment_amount ?? 0), 0),
        monthEarnings: monthCompleted.reduce((s: number, o: any) => s + Number(o.payment_amount ?? 0), 0),
        avgRating: 0,
        completionRate: totalOrders > 0 ? Math.round((totalCompleted / totalOrders) * 100) : 0,
        bonusPerDelivery: 0,
      });

      // Load past shifts
      const { data: shiftsData } = await supabase
        .from('driver_shifts')
        .select('*')
        .eq('driver_id', driver.id)
        .not('clock_out', 'is', null)
        .order('clock_in', { ascending: false })
        .limit(20);
      setPastShifts(shiftsData ?? []);

      // Load driver payments
      const { data: paymentsData } = await supabase
        .from('driver_payments')
        .select('*')
        .eq('driver_id', driver.id)
        .order('payment_date', { ascending: false })
        .limit(20);
      setDriverPayments(paymentsData ?? []);

      // Load cash allocations
      const { data: cashData } = await supabase
        .from('driver_cash_allocations')
        .select('*')
        .eq('driver_id', driver.id)
        .order('allocated_at', { ascending: false })
        .limit(50);
      setCashAllocations(cashData ?? []);
    } catch (err) {
      console.error('Driver portal load error:', err);
    } finally {
      setLoading(false);
    }
  }, [driver.id, supabase]);

  useEffect(() => { loadData(); }, [loadData]);

  // ─── Live Location Tracking ─────────────────────────────────────────────────
  // GPS tracking is handled by useDriverGps hook above

  // ─── Order Status Update ───────────────────────────────────────────────────

  const handleAdvanceOrderStatus = async (order: AppOrder, e: React.MouseEvent) => {
    e.stopPropagation();
    const nextStatus = (order as any)._overrideNextStatus ?? NEXT_STATUS_VALUE[order.status];
    if (!nextStatus) return;

    // Block job completion until POD has been submitted
    if (nextStatus === 'Booking Complete') {
      const podSubmitted = !!(order as any).pod?.completedAt;
      if (!podSubmitted) {
        toast.error('Proof of delivery must be completed before marking this job as complete. Please open the job details and submit the POD first.');
        return;
      }
    }

    setUpdatingOrderId(order.id);
    try {
      const { error } = await supabase
        .from('orders')
        .update({ status: nextStatus, updated_at: new Date().toISOString() })
        .eq('id', order.id);
      if (error) throw error;
      setAllOrders((prev) =>
        prev.map((o) => o.id === order.id ? { ...o, status: nextStatus } : o)
      );
      toast.success(`Order ${order.id} → ${nextStatus}`);
      if (nextStatus === 'Booking Complete') {
        loadData(); // refresh earnings
      }
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to update order status');
    } finally {
      setUpdatingOrderId(null);
    }
  };

  // ─── Delivery Failed Handler ───────────────────────────────────────────────

  const handleDeliveryFailed = async () => {
    if (!failedOrderId) return;
    if (!failureReason.trim()) {
      toast.error('Please provide a reason for the delivery failure');
      return;
    }
    setSubmittingFailure(true);
    try {
      const { error } = await supabase
        .from('orders')
        .update({
          status: 'Booking Failed',
          failure_reason: failureReason.trim(),
          failure_notes: failureNotes.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', failedOrderId);

      if (error) throw error;

      setAllOrders((prev) =>
        prev.map((o) =>
          o.id === failedOrderId
            ? { ...o, status: 'Booking Failed', failure_reason: failureReason.trim(), failure_notes: failureNotes.trim() || null } as any
            : o
        )
      );
      toast.success('Delivery marked as failed');
      setFailedOrderId(null);
      setFailureReason('');
      setFailureNotes('');
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to update order');
    } finally {
      setSubmittingFailure(false);
    }
  };

  // ── Derived State ─────────────────────────────────────────────────────────

  const today = getTodayStr();
  const tomorrow = getTomorrowStr();
  const todayOrders = allOrders.filter((o) => o.bookingDate === today && o.status !== 'Booking Complete' && o.status !== 'Booking Cancelled');
  const tomorrowOrders = allOrders.filter((o) => o.bookingDate === tomorrow);
  const displayOrders = activeTab === 'today' ? todayOrders : activeTab === 'tomorrow' ? tomorrowOrders : allOrders;
  const todayActive = todayOrders.filter(
    (o) => o.status !== 'Booking Complete' && o.status !== 'Booking Cancelled'
  ).length;
  const todayComplete = todayOrders.filter((o) => o.status === 'Booking Complete').length;
  const urgentCount = todayOrders.filter(isUrgent).length;
  const todayOutForDelivery = todayOrders.filter((o) => o.status === 'Booking Out For Delivery').length;

  const currentStyle = AVAILABILITY_STYLES[driver.status as AvailabilityStatus] ?? AVAILABILITY_STYLES['Off Duty'];

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: 'hsl(var(--background))' }}
    >
      {/* ── Top Header ── */}
      <div
        className="sticky top-0 z-30 border-b px-4 py-3"
        style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
      >
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: currentStyle.bg }}>
              <Timer size={16} style={{ color: currentStyle.text }} />
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
                Driver Portal
              </p>
            </div>
          </div>
          <AppLogo size={28} src={logoUrl ?? '/favicon.ico'} className="max-w-[100px]" />
        </div>
      </div>

      {/* ── Content ── */}
      <div className="max-w-lg mx-auto px-4 py-4 space-y-4 pb-24">

        {/* Driver Card */}
        <div
          className="rounded-2xl border p-4"
          style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
        >
          <div className="flex items-center gap-3 mb-4">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
              style={{ backgroundColor: 'hsl(var(--primary))', color: 'white' }}
            >
              {driver.avatar || driver.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                {getGreeting()},
              </p>
              <p className="font-bold text-base leading-tight" style={{ color: 'hsl(var(--foreground))' }}>
                {driver.name}
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                {driver.vehicle} · {driver.plate}
              </p>
            </div>
            {driver.phone && (
              <a
                href={`tel:${driver.phone}`}
                className="p-2 rounded-lg transition-colors hover:bg-secondary"
                title="Call dispatch"
              >
                <Phone size={15} style={{ color: 'hsl(var(--primary))' }} />
              </a>
            )}
          </div>

          {/* Date + Status Row */}
          <div className="mt-3 flex items-center gap-2">
            <div
              className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg"
              style={{ backgroundColor: 'hsl(var(--secondary))' }}
            >
              <Calendar size={13} style={{ color: 'hsl(var(--primary))' }} />
              <span className="text-xs" style={{ color: 'hsl(var(--foreground))' }}>
                {new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
              </span>
            </div>
            {/* Prominent status badge */}
            <div
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg font-semibold text-xs"
              style={{ backgroundColor: currentStyle.bg, color: currentStyle.text }}
            >
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: currentStyle.dot }} />
              {driver.status}
            </div>
          </div>
        </div>

        <ClockInOutCard driverId={driver.id} onShiftChange={() => setShiftRefreshKey((k) => k + 1)} />

        {/* KPI Grid */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Today's Jobs", value: todayOrders.length, icon: Package, color: 'hsl(217 91% 60%)', bg: 'hsl(217 91% 60% / 0.1)' },
            { label: "Today's Deliveries", value: todayActive, icon: Truck, color: 'hsl(262 83% 58%)', bg: 'hsl(262 83% 58% / 0.1)' },
            { label: 'Completed', value: todayComplete, icon: CheckCircle2, color: 'hsl(142 69% 35%)', bg: 'hsl(142 69% 35% / 0.1)' },
            {
              label: "Today's Collections",
              value: urgentCount,
              icon: AlertCircle,
              color: urgentCount > 0 ? 'hsl(0 84% 60%)' : 'hsl(var(--muted-foreground))',
              bg: urgentCount > 0 ? 'hsl(0 84% 60% / 0.1)' : 'hsl(var(--secondary))',
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl border p-4 flex items-start gap-3"
              style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
            >
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                style={{ backgroundColor: stat.bg }}
              >
                <stat.icon size={18} style={{ color: stat.color }} />
              </div>
              <div>
                <p className="text-2xl font-bold leading-none" style={{ color: 'hsl(var(--foreground))' }}>
                  {loading ? '—' : stat.value}
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  {stat.label}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Section Tabs */}
        <div
          className="flex gap-1 p-1 rounded-xl overflow-x-auto"
          style={{ backgroundColor: 'hsl(var(--secondary))' }}
        >
          {([
            { key: 'orders', label: 'Orders', icon: Package },
            { key: 'past-bookings', label: 'History', icon: History },
            { key: 'loading', label: 'Loading', icon: Truck },
            { key: 'earnings', label: 'Earnings', icon: PoundSterling },
            { key: 'cash', label: 'Cash', icon: Banknote },
            { key: 'vehicle', label: 'Vehicle', icon: Car },
            { key: 'map', label: 'Map', icon: MapPin },
            { key: 'notifications', label: 'Alerts', icon: Bell },
            { key: 'profile', label: 'Profile', icon: User },
          ] as const).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveSection(tab.key)}
              className="flex-1 flex items-center justify-center gap-1 py-2.5 rounded-lg text-sm font-medium transition-all shrink-0"
              style={{
                backgroundColor: activeSection === tab.key ? 'hsl(var(--card))' : 'transparent',
                color: activeSection === tab.key ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))',
                boxShadow: activeSection === tab.key ? '0 1px 3px hsl(var(--border))' : 'none',
                minWidth: '52px',
              }}
            >
              <tab.icon size={13} />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* ── GPS & PUSH STATUS BANNER ── */}
        {activeSection === 'orders' && (
          <StatusBanner
            gpsTracking={gpsTracking}
            gpsPermission={gpsPermission}
            pushPermission={pushPermission}
            onRequestGps={handleRequestGps}
            onRequestPush={handleRequestPush}
          />
        )}

        {/* ── VEHICLE LOADING SECTION ── */}
        {activeSection === 'loading' && (() => {
          const loadingOrders = allOrders.filter((o) => o.bookingDate === vehicleLoadingDate);
          const totalItems = loadingOrders.reduce((sum, o) => sum + (o.products?.length ?? 0), 0);
          const totalQty = loadingOrders.reduce((sum, o) =>
            sum + (o.products ?? []).reduce((s: number, p: any) => s + Number(p.quantity ?? p.qty ?? 1), 0), 0);

          return (
            <div className="space-y-4">
              {/* Header + Date Picker */}
              <div className="rounded-2xl border p-4 space-y-3" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: 'hsl(262 83% 58% / 0.12)' }}>
                    <Truck size={18} style={{ color: 'hsl(262 83% 58%)' }} />
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-sm" style={{ color: 'hsl(var(--foreground))' }}>Vehicle Loading</p>
                    <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>Items booked for loading by date</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar size={14} style={{ color: 'hsl(var(--primary))' }} />
                  <input
                    type="date"
                    value={vehicleLoadingDate}
                    onChange={(e) => setVehicleLoadingDate(e.target.value)}
                    className="flex-1 text-sm px-3 py-2 rounded-lg border outline-none transition-colors"
                    style={{ backgroundColor: 'hsl(var(--secondary))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                  />
                  <button
                    onClick={() => setVehicleLoadingDate(getTodayStr())}
                    className="px-3 py-2 rounded-lg text-xs font-medium transition-colors"
                    style={{
                      backgroundColor: vehicleLoadingDate === getTodayStr() ? 'hsl(var(--primary))' : 'hsl(var(--secondary))',
                      color: vehicleLoadingDate === getTodayStr() ? 'white' : 'hsl(var(--muted-foreground))',
                    }}
                  >
                    Today
                  </button>
                  <button
                    onClick={() => setVehicleLoadingDate(getTomorrowStr())}
                    className="px-3 py-2 rounded-lg text-xs font-medium transition-colors"
                    style={{
                      backgroundColor: vehicleLoadingDate === getTomorrowStr() ? 'hsl(var(--primary))' : 'hsl(var(--secondary))',
                      color: vehicleLoadingDate === getTomorrowStr() ? 'white' : 'hsl(var(--muted-foreground))',
                    }}
                  >
                    Tomorrow
                  </button>
                </div>
              </div>

              {/* Summary Pills */}
              {loadingOrders.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'Orders', value: loadingOrders.length, color: 'hsl(217 91% 60%)', bg: 'hsl(217 91% 60% / 0.1)' },
                    { label: 'Line Items', value: totalItems, color: 'hsl(262 83% 58%)', bg: 'hsl(262 83% 58% / 0.1)' },
                    { label: 'Total Qty', value: totalQty, color: 'hsl(142 69% 35%)', bg: 'hsl(142 69% 35% / 0.1)' },
                  ].map((s) => (
                    <div key={s.label} className="rounded-xl border p-3 text-center" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
                      <p className="text-xl font-bold" style={{ color: s.color }}>{s.value}</p>
                      <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>{s.label}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Date label */}
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ backgroundColor: 'hsl(var(--secondary))' }}>
                <Calendar size={13} style={{ color: 'hsl(var(--primary))' }} />
                <span className="text-xs font-medium" style={{ color: 'hsl(var(--foreground))' }}>
                  {new Date(vehicleLoadingDate + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                  {' · '}{loadingOrders.length} order{loadingOrders.length !== 1 ? 's' : ''}
                </span>
              </div>

              {/* Orders with items */}
              {loading ? (
                <div className="space-y-3">
                  {[1, 2].map((i) => (
                    <div key={i} className="rounded-xl border p-4 animate-pulse" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
                      <div className="h-4 rounded w-1/3 mb-3" style={{ backgroundColor: 'hsl(var(--secondary))' }} />
                      <div className="h-3 rounded w-2/3 mb-2" style={{ backgroundColor: 'hsl(var(--secondary))' }} />
                      <div className="h-3 rounded w-1/2" style={{ backgroundColor: 'hsl(var(--secondary))' }} />
                    </div>
                  ))}
                </div>
              ) : loadingOrders.length === 0 ? (
                <div className="rounded-xl border p-10 text-center" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
                  <Package size={36} className="mx-auto mb-3" style={{ color: 'hsl(var(--muted-foreground))' }} />
                  <p className="font-semibold text-sm" style={{ color: 'hsl(var(--foreground))' }}>No orders for this date</p>
                  <p className="text-xs mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    No bookings have been assigned for the selected date.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {loadingOrders.map((order, idx) => {
                    const products: any[] = order.products ?? [];
                    const isDelivery = !((order as any).bookingType ?? (order as any).booking_type ?? '').toLowerCase().includes('collection');
                    return (
                      <div key={order.id} className="rounded-xl border overflow-hidden" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
                        {/* Order Header */}
                        <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--secondary))' }}>
                          <div
                            className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                            style={{ backgroundColor: 'hsl(var(--primary))', color: 'white' }}
                          >
                            {idx + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-sm" style={{ color: 'hsl(var(--foreground))' }}>{order.id}</span>
                              <span
                                className="text-xs px-2 py-0.5 rounded-full font-medium"
                                style={{
                                  backgroundColor: isDelivery ? 'hsl(217 91% 60% / 0.12)' : 'hsl(262 83% 58% / 0.12)',
                                  color: isDelivery ? 'hsl(217 91% 60%)' : 'hsl(262 83% 58%)',
                                }}
                              >
                                {isDelivery ? '↓ Delivery' : '↑ Collection'}
                              </span>
                              <StatusBadge status={order.status} />
                            </div>
                            <p className="text-xs mt-0.5 truncate" style={{ color: 'hsl(var(--muted-foreground))' }}>
                              {order.customer.name}
                              {order.deliveryWindow ? ` · ${order.deliveryWindow}` : ''}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-xs font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
                              {products.length} item{products.length !== 1 ? 's' : ''}
                            </p>
                            <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                              Qty: {products.reduce((s: number, p: any) => s + Number(p.quantity ?? p.qty ?? 1), 0)}
                            </p>
                          </div>
                        </div>

                        {/* Products List */}
                        {products.length === 0 ? (
                          <div className="px-4 py-3 flex items-center gap-2">
                            <Info size={13} style={{ color: 'hsl(var(--muted-foreground))' }} />
                            <span className="text-xs italic" style={{ color: 'hsl(var(--muted-foreground))' }}>No item details available for this order</span>
                          </div>
                        ) : (
                          <div className="divide-y" style={{ borderColor: 'hsl(var(--border))' }}>
                            {products.map((product: any, pIdx: number) => {
                              const name = product.name ?? product.product_name ?? product.title ?? `Item ${pIdx + 1}`;
                              const qty = Number(product.quantity ?? product.qty ?? 1);
                              const sku = product.sku ?? product.product_sku ?? null;
                              const meta = product.meta_data ?? product.meta ?? [];
                              return (
                                <div key={pIdx} className="flex items-start gap-3 px-4 py-3">
                                  <div
                                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold"
                                    style={{ backgroundColor: 'hsl(var(--primary) / 0.1)', color: 'hsl(var(--primary))' }}
                                  >
                                    {qty}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold leading-snug" style={{ color: 'hsl(var(--foreground))' }}>{name}</p>
                                    {sku && (
                                      <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>SKU: {sku}</p>
                                    )}
                                    {Array.isArray(meta) && meta.length > 0 && (
                                      <div className="flex flex-wrap gap-1 mt-1">
                                        {meta.slice(0, 4).map((m: any, mi: number) => (
                                          <span
                                            key={mi}
                                            className="text-xs px-1.5 py-0.5 rounded"
                                            style={{ backgroundColor: 'hsl(var(--secondary))', color: 'hsl(var(--muted-foreground))' }}
                                          >
                                            {m.display_key ?? m.key}: {m.display_value ?? m.value}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                  <div className="shrink-0">
                                    <span
                                      className="text-xs px-2 py-1 rounded-lg font-semibold"
                                      style={{ backgroundColor: 'hsl(142 69% 35% / 0.1)', color: 'hsl(142 69% 35%)' }}
                                    >
                                      ×{qty}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Delivery Address */}
                        {order.deliveryAddress && (
                          <div className="flex items-start gap-2 px-4 py-2.5 border-t" style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--secondary) / 0.5)' }}>
                            <MapPin size={12} className="shrink-0 mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }} />
                            <p className="text-xs leading-snug" style={{ color: 'hsl(var(--muted-foreground))' }}>
                              {order.deliveryAddress.line1}{order.deliveryAddress.line2 ? `, ${order.deliveryAddress.line2}` : ''}, {order.deliveryAddress.city}, {order.deliveryAddress.postcode}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

        {/* ── EARNINGS SECTION ── */}
        {activeSection === 'earnings' && (
          <EarningsSection
            earnings={earnings}
            pastShifts={pastShifts}
            driverPayments={driverPayments}
            allOrders={allOrders}
            loadingData={loading}
          />
        )}

        {/* ── CASH MANAGEMENT SECTION ── */}
        {activeSection === 'cash' && (
          <CashSection
            driverId={driver.id}
            loadingData={loading}
            cashAllocations={cashAllocations}
            onRefresh={loadData}
          />
        )}

        {/* ── ORDERS SECTION ── */}
        {activeSection === 'orders' && (
          <div className="space-y-3">
            {/* Sub-tab + Refresh */}
            <div className="flex items-center justify-between">
              <div className="flex gap-1 p-1 rounded-lg" style={{ backgroundColor: 'hsl(var(--secondary))' }}>
                {(['today', 'tomorrow', 'all'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className="px-3 py-1.5 rounded-md text-xs font-medium transition-all"
                    style={{
                      backgroundColor: activeTab === tab ? 'hsl(var(--card))' : 'transparent',
                      color: activeTab === tab ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))',
                    }}
                  >
                    {tab === 'today' ? `Today (${todayOrders.length})` : tab === 'tomorrow' ? `Tomorrow (${tomorrowOrders.length})` : `All (${allOrders.length})`}
                  </button>
                ))}
              </div>
              <button
                onClick={loadData}
                disabled={loading}
                className="p-2 rounded-lg transition-colors hover:bg-secondary"
                title="Refresh"
              >
                <RefreshCw
                  size={14}
                  className={loading ? 'animate-spin' : ''}
                  style={{ color: 'hsl(var(--muted-foreground))' }}
                />
              </button>
            </div>

            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="rounded-xl border p-4 animate-pulse"
                    style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
                  >
                    <div className="h-4 rounded w-1/3 mb-3" style={{ backgroundColor: 'hsl(var(--secondary))' }} />
                    <div className="h-3 rounded w-2/3 mb-2" style={{ backgroundColor: 'hsl(var(--secondary))' }} />
                    <div className="h-8 rounded w-full" style={{ backgroundColor: 'hsl(var(--secondary))' }} />
                  </div>
                ))}
              </div>
            ) : displayOrders.length === 0 ? (
              <div
                className="rounded-xl border p-10 text-center"
                style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
              >
                <Package size={36} className="mx-auto mb-3" style={{ color: 'hsl(var(--muted-foreground))' }} />
                <p className="font-semibold text-sm" style={{ color: 'hsl(var(--foreground))' }}>
                  {activeTab === 'today' ? 'No active orders today' : activeTab === 'tomorrow' ? 'No orders tomorrow' : 'No orders assigned'}
                </p>
                <p className="text-xs mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  {activeTab === 'today' ? 'Completed orders are shown in Past Bookings.' : activeTab === 'tomorrow' ? 'No orders have been assigned for tomorrow yet.' : 'Check back later or view all orders.'}
                </p>
              </div>
            ) : (
              displayOrders.map((order) => {
                const nextStatusLabel = order.status === 'Booking Accepted' ?'Start'
                  : NEXT_STATUS_LABEL[order.status];
                const nextStatusOverride = order.status === 'Booking Accepted' ?'Booking Out For Delivery'
                  : undefined;
                const orderWithOverride = nextStatusOverride ? { ...order, _overrideNextStatus: nextStatusOverride } as any : order;
                const isAssigned = order.status === 'Booking Accepted' || order.status === 'Booking Assigned';
                const isComplete = order.status === 'Booking Complete';
                const isCancelled = order.status === 'Booking Cancelled';
                const isFailed = order.status === 'Booking Failed';
                const isUpdating = updatingOrderId === order.id;
                const urgent = isUrgent(order);
                const accentColor = STATUS_ACCENT[order.status] ?? 'hsl(var(--primary))';

                return (
                  <div
                    key={order.id}
                    className="rounded-xl border overflow-hidden"
                    style={{
                      backgroundColor: 'hsl(var(--card))',
                      borderColor: urgent ? 'hsl(0 84% 60% / 0.4)' : 'hsl(var(--border))',
                    }}
                  >
                    {urgent && (
                      <div
                        className="flex items-center gap-2 px-4 py-1.5"
                        style={{ backgroundColor: 'hsl(0 84% 60% / 0.08)' }}
                      >
                        <AlertCircle size={12} style={{ color: 'hsl(0 84% 60%)' }} />
                        <span className="text-xs font-medium" style={{ color: 'hsl(0 84% 60%)' }}>
                          Urgent — delivery window approaching
                        </span>
                      </div>
                    )}

                    <div className="p-4">
                      {/* Header */}
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-bold text-sm" style={{ color: 'hsl(var(--foreground))' }}>
                              {order.id}
                            </span>
                            <StatusBadge status={order.status} />
                          </div>
                          {/* Progress bar */}
                          <div className="flex gap-0.5 mt-1.5">
                            {STATUS_FLOW.map((s, idx) => {
                              const currentIdx = STATUS_FLOW.indexOf(order.status);
                              return (
                                <div
                                  key={s}
                                  className="flex-1 h-1 rounded-full transition-all"
                                  style={{ backgroundColor: idx <= currentIdx ? accentColor : 'hsl(var(--secondary))' }}
                                />
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      {/* Customer Details */}
                      <div
                        className="rounded-lg p-3 mb-3 space-y-2"
                        style={{ backgroundColor: 'hsl(var(--secondary))' }}
                      >
                        <div className="flex items-center gap-2">
                          <User size={13} style={{ color: 'hsl(var(--primary))' }} />
                          <span className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
                            {order.customer.name}
                          </span>
                        </div>
                        {order.customer.phone && (
                          <a href={`tel:${order.customer.phone}`} className="flex items-center gap-2 group">
                            <Phone size={12} style={{ color: 'hsl(var(--primary))' }} />
                            <span className="text-xs font-medium group-hover:underline" style={{ color: 'hsl(var(--primary))' }}>
                              {order.customer.phone}
                            </span>
                          </a>
                        )}
                        {order.deliveryAddress && (
                          <div className="flex items-start gap-2">
                            <MapPin size={12} className="shrink-0 mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }} />
                            <p className="text-xs leading-snug" style={{ color: 'hsl(var(--muted-foreground))' }}>
                              {order.deliveryAddress.line1}{order.deliveryAddress.line2 ? `, ${order.deliveryAddress.line2}` : ''}, {order.deliveryAddress.city}, {order.deliveryAddress.postcode}
                            </p>
                          </div>
                        )}
                        <div className="flex items-center gap-1">
                          <Clock size={12} style={{ color: 'hsl(var(--muted-foreground))' }} />
                          <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                            {order.deliveryWindow} · {new Date(order.bookingDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                          </span>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      {!isComplete && !isCancelled && !isFailed && (
                        <div className="flex gap-2">
                          {nextStatusLabel && (
                            <button
                              onClick={(e) => handleAdvanceOrderStatus(orderWithOverride, e)}
                              disabled={isUpdating}
                              className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg font-semibold text-sm transition-all"
                              style={{ backgroundColor: accentColor, color: 'white', opacity: isUpdating ? 0.7 : 1 }}
                            >
                              {isUpdating ? (
                                <Loader2 size={14} className="animate-spin" />
                              ) : (
                                <>
                                  <ArrowRight size={14} />
                                  {nextStatusLabel}
                                </>
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
                              className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg font-medium text-sm transition-colors hover:bg-secondary border"
                              style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                              title="Navigate with Google Maps"
                            >
                              <Navigation size={14} style={{ color: 'hsl(var(--primary))' }} />
                              <span className="text-xs">Nav</span>
                            </a>
                          )}
                          <button
                            onClick={() => setSelectedBookingDetail(order)}
                            className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg font-medium text-sm transition-colors hover:bg-secondary border"
                            style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                            title="View booking details"
                          >
                            <Info size={14} style={{ color: 'hsl(var(--muted-foreground))' }} />
                            <span className="text-xs">Details</span>
                          </button>
                          {/* Delivery Failed Button */}
                          <button
                            onClick={(e) => { e.stopPropagation(); setFailedOrderId(order.id); setFailureReason(''); setFailureNotes(''); }}
                            disabled={isUpdating}
                            className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg font-medium text-sm transition-colors border"
                            style={{ borderColor: 'hsl(0 84% 60% / 0.4)', color: 'hsl(0 84% 60%)', backgroundColor: 'hsl(0 84% 60% / 0.06)' }}
                            title="Mark delivery as failed"
                          >
                            <XOctagon size={14} />
                            <span className="text-xs">Failed</span>
                          </button>
                        </div>
                      )}

                      {isComplete && (
                        <div className="flex items-center gap-2">
                          <div
                            className="flex-1 flex items-center gap-2 py-2 px-3 rounded-lg"
                            style={{ backgroundColor: 'hsl(142 69% 35% / 0.1)' }}
                          >
                            <CheckCircle2 size={15} style={{ color: 'hsl(142 69% 35%)' }} />
                            <span className="text-sm font-medium" style={{ color: 'hsl(142 69% 35%)' }}>
                              Delivery Complete
                            </span>
                          </div>
                          {order.deliveryAddress && (
                            <a
                              href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                                `${order.deliveryAddress.line1}, ${order.deliveryAddress.city}, ${order.deliveryAddress.postcode}`
                              )}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg font-medium text-sm transition-colors hover:bg-secondary border"
                              style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                              title="Navigate with Google Maps"
                            >
                              <Navigation size={14} style={{ color: 'hsl(var(--primary))' }} />
                              <span className="text-xs">Nav</span>
                            </a>
                          )}
                          <button
                            onClick={() => setSelectedBookingDetail(order)}
                            className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg font-medium text-sm transition-colors hover:bg-secondary border"
                            style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                            title="View booking details"
                          >
                            <Info size={14} style={{ color: 'hsl(var(--muted-foreground))' }} />
                            <span className="text-xs">Details</span>
                          </button>
                          {order.deliveryAddress && (
                            <a
                              href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                                `${order.deliveryAddress.line1}, ${order.deliveryAddress.city}, ${order.deliveryAddress.postcode}`
                              )}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg font-medium text-sm transition-colors hover:bg-secondary border"
                              style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                              title="Navigate with Google Maps"
                            >
                              <Navigation size={14} style={{ color: 'hsl(var(--primary))' }} />
                              <span className="text-xs">Nav</span>
                            </a>
                          )}
                          <button
                            onClick={() => setSelectedBookingDetail(order)}
                            className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg font-medium text-sm transition-colors hover:bg-secondary border"
                            style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                            title="Submit POD"
                          >
                            <FileCheck size={14} style={{ color: 'hsl(var(--muted-foreground))' }} />
                            <span className="text-xs">POD</span>
                          </button>
                        </div>
                      )}

                      {isCancelled && (
                        <div className="flex items-center gap-2">
                          <div
                            className="flex-1 flex items-center gap-2 py-2 px-3 rounded-lg"
                            style={{ backgroundColor: 'hsl(0 84% 60% / 0.08)' }}
                          >
                            <AlertCircle size={15} style={{ color: 'hsl(0 84% 60%)' }} />
                            <span className="text-sm font-medium" style={{ color: 'hsl(0 84% 60%)' }}>
                              Booking Cancelled
                            </span>
                          </div>
                          {order.deliveryAddress && (
                            <a
                              href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                                `${order.deliveryAddress.line1}, ${order.deliveryAddress.city}, ${order.deliveryAddress.postcode}`
                              )}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg font-medium text-sm transition-colors hover:bg-secondary border"
                              style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                              title="Navigate with Google Maps"
                            >
                              <Navigation size={14} style={{ color: 'hsl(var(--primary))' }} />
                              <span className="text-xs">Nav</span>
                            </a>
                          )}
                          <button
                            onClick={() => setSelectedBookingDetail(order)}
                            className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg font-medium text-sm transition-colors hover:bg-secondary border"
                            style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                            title="View booking details"
                          >
                            <Info size={14} style={{ color: 'hsl(var(--muted-foreground))' }} />
                            <span className="text-xs">Details</span>
                          </button>
                        </div>
                      )}

                      {isFailed && (
                        <div className="flex items-center gap-2 py-2 px-3 rounded-lg" style={{ backgroundColor: 'hsl(0 84% 60% / 0.08)' }}>
                          <XOctagon size={15} style={{ color: 'hsl(0 84% 60%)' }} />
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium" style={{ color: 'hsl(0 84% 60%)' }}>Delivery Failed</span>
                            {(order as any).failure_reason && (
                              <p className="text-xs mt-0.5 truncate" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                {(order as any).failure_reason}
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ── PAST BOOKINGS SECTION ── */}
        {activeSection === 'past-bookings' && (() => {
          const completedOrders = allOrders.filter(
            (o) => o.status === 'Booking Complete' || o.status === 'Booking Cancelled'
          );

          const bookingTypes = Array.from(new Set(
            completedOrders.map((o) => (o as any).bookingType ?? (o as any).booking_type ?? 'Delivery').filter(Boolean)
          ));

          const filtered = completedOrders.filter((o) => {
            const typeMatch = pastBookingTypeFilter === 'all' || ((o as any).bookingType ?? (o as any).booking_type ?? 'Delivery') === pastBookingTypeFilter;
            const dateMatch = !pastBookingDateFilter || o.bookingDate === pastBookingDateFilter;
            const searchMatch = !pastBookingSearch || 
              o.id.toLowerCase().includes(pastBookingSearch.toLowerCase()) ||
              o.customer.name.toLowerCase().includes(pastBookingSearch.toLowerCase()) ||
              (o.deliveryAddress?.postcode ?? '').toLowerCase().includes(pastBookingSearch.toLowerCase());
            return typeMatch && dateMatch && searchMatch;
          });

          return (
            <div className="space-y-4">
              <div>
                <h3 className="font-bold text-base" style={{ color: 'hsl(var(--foreground))' }}>Past Bookings</h3>
                <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  {completedOrders.length} completed or cancelled booking{completedOrders.length !== 1 ? 's' : ''}
                </p>
              </div>

              {/* Filters */}
              <div className="space-y-2">
                {/* Search */}
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'hsl(var(--muted-foreground))' }} />
                  <input
                    type="text"
                    value={pastBookingSearch}
                    onChange={(e) => setPastBookingSearch(e.target.value)}
                    placeholder="Search by order ID, customer, postcode..."
                    className="w-full text-sm pl-9 pr-3 py-2 rounded-lg border outline-none"
                    style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                  />
                  {pastBookingSearch && (
                    <button onClick={() => setPastBookingSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                      <X size={13} style={{ color: 'hsl(var(--muted-foreground))' }} />
                    </button>
                  )}
                </div>

                {/* Date + Type row */}
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Calendar size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'hsl(var(--muted-foreground))' }} />
                    <input
                      type="date"
                      value={pastBookingDateFilter}
                      onChange={(e) => setPastBookingDateFilter(e.target.value)}
                      className="w-full text-xs pl-8 pr-2 py-2 rounded-lg border outline-none"
                      style={{ backgroundColor: 'hsl(var(--card))', borderColor: pastBookingDateFilter ? 'hsl(var(--primary))' : 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                    />
                  </div>
                  <select
                    value={pastBookingTypeFilter}
                    onChange={(e) => setPastBookingTypeFilter(e.target.value)}
                    className="flex-1 text-xs px-2 py-2 rounded-lg border outline-none"
                    style={{ backgroundColor: 'hsl(var(--card))', borderColor: pastBookingTypeFilter !== 'all' ? 'hsl(var(--primary))' : 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                  >
                    <option value="all">All Types</option>
                    {bookingTypes.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>

                {/* Active filter summary */}
                {(pastBookingDateFilter || pastBookingTypeFilter !== 'all' || pastBookingSearch) && (
                  <div className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ backgroundColor: 'hsl(var(--primary) / 0.08)' }}>
                    <span className="text-xs font-medium" style={{ color: 'hsl(var(--primary))' }}>
                      {filtered.length} result{filtered.length !== 1 ? 's' : ''} found
                    </span>
                    <button
                      onClick={() => { setPastBookingDateFilter(''); setPastBookingTypeFilter('all'); setPastBookingSearch(''); }}
                      className="text-xs font-medium flex items-center gap-1"
                      style={{
                        color: 'hsl(var(--primary))',
                      }}
                    >
                      <X size={11} /> Clear filters
                    </button>
                  </div>
                )}
              </div>

              {/* Results */}
              {filtered.length === 0 ? (
                <div className="rounded-xl border p-10 text-center" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
                  <History size={36} className="mx-auto mb-3" style={{ color: 'hsl(var(--muted-foreground))' }} />
                  <p className="font-semibold text-sm" style={{ color: 'hsl(var(--foreground))' }}>No past bookings found</p>
                  <p className="text-xs mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    {completedOrders.length === 0 ? 'Completed bookings will appear here.' : 'Try adjusting your filters.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filtered.map((order) => {
                    const isComplete = order.status === 'Booking Complete';
                    const bookingType = (order as any).bookingType ?? (order as any).booking_type ?? 'Delivery';
                    return (
                      <div
                        key={order.id}
                        className="rounded-xl border overflow-hidden cursor-pointer transition-all hover:shadow-sm"
                        style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
                        onClick={() => setSelectedBookingDetail(order)}
                      >
                        <div className="p-4">
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-semibold" style={{ color: 'hsl(var(--foreground))' }}>{order.id}</span>
                                <span
                                  className="text-xs px-2 py-0.5 rounded-full font-medium"
                                  style={{
                                    backgroundColor: isComplete ? 'hsl(142 69% 35% / 0.1)' : 'hsl(0 84% 60% / 0.1)',
                                    color: isComplete ? 'hsl(142 69% 35%)' : 'hsl(0 84% 60%)',
                                  }}
                                >
                                  {isComplete ? '✓ Complete' : '✕ Cancelled'}
                                </span>
                                <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: 'hsl(var(--secondary))', color: 'hsl(var(--muted-foreground))' }}>
                                  {bookingType}
                                </span>
                              </div>
                              <p className="text-sm font-medium" style={{ color: 'hsl(var(--foreground))' }}>{order.customer.name}</p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {order.deliveryAddress && (
                                <a
                                  href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${order.deliveryAddress.line1}, ${order.deliveryAddress.city}, ${order.deliveryAddress.postcode}`)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="p-1.5 rounded-lg transition-colors hover:bg-secondary border"
                                  style={{ borderColor: 'hsl(var(--border))' }}
                                  title="Navigate with Google Maps"
                                >
                                  <Navigation size={13} style={{ color: 'hsl(var(--primary))' }} />
                                </a>
                              )}
                              <button
                                onClick={(e) => { e.stopPropagation(); setSelectedBookingDetail(order); }}
                                className="p-1.5 rounded-lg transition-colors hover:bg-secondary border"
                                style={{ borderColor: 'hsl(var(--border))' }}
                                title="View details"
                              >
                                <Info size={13} style={{ color: 'hsl(var(--muted-foreground))' }} />
                              </button>
                              {isComplete && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); setSelectedBookingDetail(order); }}
                                  className="p-1.5 rounded-lg transition-colors hover:bg-secondary border"
                                  style={{ borderColor: 'hsl(var(--border))' }}
                                  title="Submit POD"
                                >
                                  <FileCheck size={13} style={{ color: 'hsl(var(--muted-foreground))' }} />
                                </button>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-3 text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                            <div className="flex items-center gap-1">
                              <Calendar size={11} />
                              {new Date(order.bookingDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </div>
                            {order.deliveryAddress && (
                              <div className="flex items-center gap-1 min-w-0">
                                <MapPin size={11} className="shrink-0" />
                                <span className="truncate">{order.deliveryAddress.postcode}</span>
                              </div>
                            )}
                            {order.deliveryWindow && (
                              <div className="flex items-center gap-1">
                                <Clock size={11} />
                                {order.deliveryWindow}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

        {/* ── VEHICLE / SAFETY CHECKS SECTION ── */}
        {activeSection === 'vehicle' && (
          <SafetyCheckSection driverId={driver.id} />
        )}

        {/* ── MAP SECTION ── */}
        {activeSection === 'map' && (
          <div
            className="rounded-xl border p-4"
            style={{ borderColor: 'hsl(var(--border))' }}
          >
            <div
              className="flex items-center justify-between px-4 py-3 border-b"
              style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
            >
              <div className="flex items-center gap-2">
                <Navigation size={16} style={{ color: 'hsl(var(--primary))' }} />
                <span className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
                  Delivery Route Map
                </span>
                {todayOutForDelivery > 0 && (
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{ backgroundColor: 'hsl(262 83% 58% / 0.12)', color: 'hsl(262 83% 58%)' }}
                  >
                    {todayOutForDelivery} en route
                  </span>
                )}
              </div>
              <button
                onClick={loadData}
                disabled={loading}
                className="p-1.5 rounded-lg transition-colors hover:bg-secondary"
              >
                <RefreshCw size={13} className={loading ? 'animate-spin' : ''} style={{ color: 'hsl(var(--muted-foreground))' }} />
              </button>
            </div>
            <DriverRouteMap
              orders={activeTab === 'today' ? todayOrders : activeTab === 'tomorrow' ? tomorrowOrders : allOrders}
              driverName={driver.name}
            />
          </div>
        )}

        {/* ── NOTIFICATIONS SECTION ── */}
        {activeSection === 'notifications' && (
          <NotificationsSection driverId={driver.id} />
        )}

        {/* ── PROFILE SECTION ── */}
        {activeSection === 'profile' && (
          <DriverProfileSection
            driver={driver}
            onDriverUpdate={(updated) => setDriver(updated)}
            onLogout={onLogout}
            earnings={earnings}
            pastShifts={pastShifts}
            driverPayments={driverPayments}
            allOrders={allOrders}
            loadingData={loading}
          />
        )}

        {/* ── Delivery Failed Modal ── */}
        {failedOrderId && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
            <div
              className="w-full sm:max-w-sm rounded-2xl overflow-hidden"
              style={{ backgroundColor: 'hsl(var(--card))' }}
            >
              {/* Header */}
              <div
                className="flex items-center justify-between px-4 py-3 border-b"
                style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(0 84% 60% / 0.06)' }}
              >
                <div className="flex items-center gap-2">
                  <XOctagon size={18} style={{ color: 'hsl(0 84% 60%)' }} />
                  <h3 className="font-bold text-base" style={{ color: 'hsl(0 84% 60%)' }}>Delivery Failed</h3>
                </div>
                <button
                  onClick={() => { setFailedOrderId(null); setFailureReason(''); setFailureNotes(''); }}
                  className="p-1.5 rounded-lg transition-colors hover:bg-secondary"
                >
                  <X size={16} style={{ color: 'hsl(var(--muted-foreground))' }} />
                </button>
              </div>

              {/* Body */}
              <div className="p-4 space-y-4">
                <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  Order <strong style={{ color: 'hsl(var(--foreground))' }}>{failedOrderId}</strong> will be marked as <strong style={{ color: 'hsl(0 84% 60%)' }}>Booking Failed</strong>. Please provide a reason.
                </p>

                {/* Reason */}
                <div>
                  <label className="text-xs font-semibold block mb-1.5" style={{ color: 'hsl(var(--foreground))' }}>
                    Reason <span style={{ color: 'hsl(0 84% 60%)' }}>*</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    {[
                      'Not home / No answer',
                      'Access issue',
                      'Wrong address',
                      'Customer refused',
                      'Item damaged',
                      'Other',
                    ].map((r) => (
                      <button
                        key={r}
                        onClick={() => setFailureReason(r)}
                        className="py-2 px-3 rounded-lg text-xs font-medium text-left transition-all"
                        style={{
                          backgroundColor: failureReason === r ? 'hsl(0 84% 60%)' : 'hsl(var(--secondary))',
                          color: failureReason === r ? 'white' : 'hsl(var(--foreground))',
                        }}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    value={failureReason}
                    onChange={(e) => setFailureReason(e.target.value)}
                    placeholder="Or type a custom reason…"
                    className="w-full text-sm px-3 py-2.5 rounded-lg border outline-none"
                    style={{ backgroundColor: 'hsl(var(--card))', borderColor: failureReason ? 'hsl(0 84% 60% / 0.5)' : 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                  />
                </div>

                {/* Additional Notes */}
                <div>
                  <label className="text-xs font-semibold block mb-1.5" style={{ color: 'hsl(var(--foreground))' }}>Additional Notes (optional)</label>
                  <textarea
                    value={failureNotes}
                    onChange={(e) => setFailureNotes(e.target.value)}
                    rows={2}
                    placeholder="Any extra details for dispatch…"
                    className="w-full text-sm px-3 py-2.5 rounded-lg border outline-none resize-none"
                    style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                  />
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <button
                    onClick={() => { setFailedOrderId(null); setFailureReason(''); setFailureNotes(''); }}
                    disabled={submittingFailure}
                    className="flex-1 py-2.5 rounded-lg font-medium text-sm transition-colors"
                    style={{ backgroundColor: 'hsl(var(--secondary))', color: 'hsl(var(--foreground))' }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDeliveryFailed}
                    disabled={submittingFailure || !failureReason.trim()}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg font-semibold text-sm transition-all"
                    style={{
                      backgroundColor: 'hsl(0 84% 60%)',
                      color: 'white',
                      opacity: submittingFailure || !failureReason.trim() ? 0.6 : 1,
                    }}
                  >
                    {submittingFailure ? <Loader2 size={14} className="animate-spin" /> : <XOctagon size={14} />}
                    {submittingFailure ? 'Saving…' : 'Confirm Failed'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Booking Detail Modal */}
        {selectedBookingDetail && (
          <BookingDetailModal
            order={selectedBookingDetail}
            driverId={driver.id}
            onClose={() => setSelectedBookingDetail(null)}
            onOrderUpdate={(updated) => {
              setAllOrders(allOrders.map(o => o.id === updated.id ? updated : o));
              setSelectedBookingDetail(updated);
            }}
          />
        )}
      </div>
    </div>
  );
}

// ─── Root Component ───────────────────────────────────────────────────────────

export default function PublicDriverPortal() {
  const [driver, setDriver] = useState<(AppDriver & { access_code: string }) | null>(null);
  const supabase = createClient();

  // Restore session from cookie-based driver session on mount
  useEffect(() => {
    const restoreSession = async () => {
      try {
        // Check for cookie-based driver session via a lightweight API call
        const res = await fetch('/api/drivers/portal-login/session', { method: 'GET' });
        if (res.ok) {
          const json = await res.json();
          if (json.driver) {
            setDriver({
              id: json.driver.id,
              name: json.driver.name,
              phone: json.driver.phone,
              vehicle: json.driver.vehicle,
              plate: json.driver.plate,
              status: json.driver.status,
              avatar: json.driver.avatar,
              access_code: json.driver.access_code ?? '',
            });
            return;
          }
        }
      } catch {}
    };
    restoreSession();
  }, []);

  const handleLogin = (d: AppDriver & { access_code: string }) => {
    setDriver(d);
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/drivers/portal-login', { method: 'DELETE' });
    } catch {}
    setDriver(null);
  };

  if (!driver) {
    return <PinLoginScreen onLogin={handleLogin} />;
  }

  return <DriverDashboard driver={driver} onLogout={handleLogout} />;
}
