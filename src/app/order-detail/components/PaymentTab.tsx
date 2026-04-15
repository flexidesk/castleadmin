'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import {
  CreditCard,
  Banknote,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Edit3,
  Lock,
  PiggyBank,
  Receipt,
  Truck,
  ShoppingCart,
  Trash2,
} from 'lucide-react';
import { AppOrder as Order } from '@/lib/services/ordersService';
import { PaymentBadge } from '@/components/ui/StatusBadge';
import { createClient } from '@/lib/supabase/client';

interface Props {
  order: Order;
}

interface PaymentFormData {
  method: 'Card' | 'Cash';
  deliveryCharge: string;
  orderTotal: string;
  depositPaid: string;
  totalDue: string;
  notes: string;
}

export default function PaymentTab({ order }: Props) {
  const [isEditing, setIsEditing] = useState(order.payment.status === 'Unpaid');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [savedPayment, setSavedPayment] = useState(order.payment);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<PaymentFormData>({
    defaultValues: {
      method: order.payment.method === 'Unrecorded' ? 'Cash' : (order.payment.method as 'Card' | 'Cash'),
      deliveryCharge: (order.payment.deliveryCharge ?? 0).toFixed(2),
      orderTotal: (order.payment.orderTotal ?? order.payment.amount ?? 0).toFixed(2),
      depositPaid: (order.payment.depositPaid ?? 0).toFixed(2),
      totalDue: (order.payment.totalDue ?? order.payment.amountDue ?? 0).toFixed(2),
      notes: order.payment.notes || '',
    },
  });

  const selectedMethod = watch('method');
  const watchedDeliveryCharge = watch('deliveryCharge');
  const watchedOrderTotal = watch('orderTotal');
  const watchedDeposit = watch('depositPaid');

  // Auto-calculate total due when relevant fields change
  const recalcTotalDue = (field: 'deliveryCharge' | 'orderTotal' | 'depositPaid', value: string) => {
    const deliveryCharge = field === 'deliveryCharge' ? parseFloat(value) || 0 : parseFloat(watchedDeliveryCharge) || 0;
    const orderTotal = field === 'orderTotal' ? parseFloat(value) || 0 : parseFloat(watchedOrderTotal) || 0;
    const deposit = field === 'depositPaid' ? parseFloat(value) || 0 : parseFloat(watchedDeposit) || 0;
    const due = Math.max(0, orderTotal - deposit);
    setValue('totalDue', due.toFixed(2));
  };

  const onSubmit = async (data: PaymentFormData) => {
    setIsSaving(true);
    try {
      const supabase = createClient();
      const deliveryChargeVal = parseFloat(data.deliveryCharge) || 0;
      const orderTotalVal = parseFloat(data.orderTotal) || 0;
      const depositPaidVal = parseFloat(data.depositPaid) || 0;
      const totalDueVal = parseFloat(data.totalDue) || 0;

      const { error: orderError } = await supabase
        .from('orders')
        .update({
          payment_status: 'Paid',
          payment_method: data.method,
          delivery_charge: deliveryChargeVal,
          payment_amount: orderTotalVal,
          deposit_paid: depositPaidVal,
          amount_due: totalDueVal,
          payment_notes: data.notes || null,
          payment_recorded_at: new Date().toISOString(),
          payment_recorded_by: 'Admin',
        })
        .eq('id', order.id);

      if (orderError) throw orderError;

      // If cash payment and driver is assigned, allocate to driver cash pot
      if (data.method === 'Cash' && order.driver?.id) {
        const { error: cashError } = await supabase
          .from('driver_cash_allocations')
          .insert({
            driver_id: order.driver.id,
            order_id: order.id,
            amount: orderTotalVal,
            notes: data.notes || null,
            allocated_at: new Date().toISOString(),
          });

        if (cashError) {
          console.warn('Cash allocation failed:', cashError.message);
          toast.warning('Payment recorded but cash allocation to driver failed');
        } else {
          toast.success(`£${orderTotalVal.toFixed(2)} cash allocated to ${order.driver.name}'s pot`);
        }
      }

      setSavedPayment({
        ...savedPayment,
        status: 'Paid',
        method: data.method,
        deliveryCharge: deliveryChargeVal,
        orderTotal: orderTotalVal,
        depositPaid: depositPaidVal,
        totalDue: totalDueVal,
        amount: orderTotalVal,
        amountDue: totalDueVal,
        notes: data.notes,
        recordedAt: new Date().toISOString(),
        recordedBy: 'Admin',
      });
      setIsEditing(false);
      if (data.method !== 'Cash' || !order.driver?.id) {
        toast.success('Payment recorded successfully');
      }
    } catch (err: any) {
      toast.error('Failed to record payment: ' + (err?.message ?? 'Unknown error'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeletePayment = async () => {
    setIsDeleting(true);
    try {
      const supabase = createClient();

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
        .eq('id', order.id);

      if (error) throw error;

      setSavedPayment({
        ...savedPayment,
        status: 'Unpaid',
        method: 'Unrecorded',
        deliveryCharge: 0,
        orderTotal: 0,
        depositPaid: 0,
        totalDue: 0,
        amount: 0,
        amountDue: 0,
        notes: '',
        recordedAt: undefined,
        recordedBy: undefined,
      });
      setShowDeleteConfirm(false);
      setIsEditing(true);
      toast.success('Payment record deleted successfully');
    } catch (err: any) {
      toast.error('Failed to delete payment record: ' + (err?.message ?? 'Unknown error'));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      {/* Delete confirmation dialog */}
      {showDeleteConfirm && (
        <div
          className="flex items-start gap-4 p-5 rounded-xl border"
          style={{ borderColor: 'hsl(var(--destructive) / 0.4)', backgroundColor: 'hsl(var(--destructive) / 0.05)' }}
        >
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: 'hsl(var(--destructive) / 0.1)' }}
          >
            <Trash2 size={18} style={{ color: 'hsl(var(--destructive))' }} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold mb-1" style={{ color: 'hsl(var(--foreground))' }}>
              Delete Payment Record?
            </p>
            <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
              This will permanently remove all payment details for this order and reset the status to <strong>Unpaid</strong>. This action cannot be undone.
            </p>
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleDeletePayment}
                disabled={isDeleting}
                className="btn-primary text-xs py-1.5 px-3"
                style={{ backgroundColor: 'hsl(var(--destructive))', borderColor: 'hsl(var(--destructive))' }}
              >
                {isDeleting ? (
                  <>
                    <RefreshCw size={12} className="animate-spin" />
                    Deleting…
                  </>
                ) : (
                  <>
                    <Trash2 size={12} />
                    Yes, Delete
                  </>
                )}
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
                className="btn-secondary text-xs py-1.5 px-3"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Current payment status summary */}
      <div
        className="flex items-start gap-4 p-5 rounded-xl border"
        style={{
          borderColor: savedPayment.status === 'Paid' ? 'hsl(142 69% 35% / 0.25)' : 'hsl(var(--destructive) / 0.25)',
          backgroundColor: savedPayment.status === 'Paid' ? 'hsl(142 69% 35% / 0.04)' : 'hsl(var(--destructive) / 0.04)',
        }}
      >
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{
            backgroundColor: savedPayment.status === 'Paid' ? 'hsl(142 69% 35% / 0.12)' : 'hsl(var(--destructive) / 0.1)',
          }}
        >
          {savedPayment.status === 'Paid' ? (
            <CheckCircle2 size={20} style={{ color: 'hsl(142 69% 30%)' }} />
          ) : (
            <AlertTriangle size={20} style={{ color: 'hsl(var(--destructive))' }} />
          )}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <PaymentBadge status={savedPayment.status} method={savedPayment.method} />
          </div>
          {/* Payment summary row */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 mt-2">
            <div className="flex items-center gap-1.5">
              <Truck size={12} style={{ color: 'hsl(var(--muted-foreground))' }} />
              <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>Delivery Charge:</span>
              <span className="text-xs font-semibold tabular-nums">£{(savedPayment.deliveryCharge ?? 0).toFixed(2)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <ShoppingCart size={12} style={{ color: 'hsl(var(--muted-foreground))' }} />
              <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>Order Total:</span>
              <span className="text-xs font-semibold tabular-nums">£{(savedPayment.orderTotal ?? savedPayment.amount ?? 0).toFixed(2)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <PiggyBank size={12} style={{ color: 'hsl(142 69% 35%)' }} />
              <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>Deposit Paid:</span>
              <span className="text-xs font-semibold tabular-nums" style={{ color: 'hsl(142 69% 30%)' }}>£{(savedPayment.depositPaid ?? 0).toFixed(2)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Receipt size={12} style={{ color: (savedPayment.totalDue ?? savedPayment.amountDue ?? 0) > 0 ? 'hsl(var(--destructive))' : 'hsl(142 69% 35%)' }} />
              <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>Total Due:</span>
              <span
                className="text-xs font-semibold tabular-nums"
                style={{ color: (savedPayment.totalDue ?? savedPayment.amountDue ?? 0) > 0 ? 'hsl(var(--destructive))' : 'hsl(142 69% 30%)' }}
              >
                £{(savedPayment.totalDue ?? savedPayment.amountDue ?? 0).toFixed(2)}
              </span>
            </div>
          </div>
          {savedPayment.status === 'Paid' && savedPayment.recordedAt && (
            <p className="text-xs mt-2" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Recorded by {savedPayment.recordedBy} on{' '}
              {new Date(savedPayment.recordedAt).toLocaleDateString('en-GB', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          )}
          {savedPayment.status === 'Paid' && savedPayment.method === 'Cash' && order.driver && (
            <p className="text-xs mt-1 flex items-center gap-1" style={{ color: 'hsl(142 69% 35%)' }}>
              <Banknote size={11} />
              Cash allocated to {order.driver.name}&apos;s pot
            </p>
          )}
          {savedPayment.status === 'Unpaid' && (
            <p className="text-xs mt-1" style={{ color: 'hsl(var(--destructive))' }}>
              Payment has not been recorded for this booking
            </p>
          )}
        </div>
        {savedPayment.status === 'Paid' && !isEditing && (
          <button
            onClick={() => setIsEditing(true)}
            className="btn-secondary text-xs py-1.5 px-3 shrink-0"
          >
            <Edit3 size={12} />
            Edit
          </button>
        )}
        {savedPayment.status === 'Paid' && !isEditing && (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="btn-secondary text-xs py-1.5 px-3 shrink-0"
            style={{ color: 'hsl(var(--destructive))', borderColor: 'hsl(var(--destructive) / 0.4)' }}
          >
            <Trash2 size={12} />
            Delete
          </button>
        )}
      </div>

      {/* Cash driver notice */}
      {isEditing && order.driver && (
        <div
          className="flex items-start gap-3 p-3 rounded-xl text-xs"
          style={{ backgroundColor: 'hsl(142 69% 35% / 0.06)', border: '1px solid hsl(142 69% 35% / 0.2)' }}
        >
          <Banknote size={14} style={{ color: 'hsl(142 69% 35%)', marginTop: 1 }} />
          <p style={{ color: 'hsl(142 69% 30%)' }}>
            If <strong>Cash</strong> is selected, the amount will be automatically allocated to{' '}
            <strong>{order.driver.name}</strong>&apos;s cash pot.
          </p>
        </div>
      )}

      {/* Payment form */}
      {isEditing ? (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <h3 className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
            Record Payment
          </h3>

          {/* Payment method toggle */}
          <div>
            <label className="label">Payment Method</label>
            <p className="helper-text mb-3">Select how the customer is paying for this booking</p>
            <div className="grid grid-cols-2 gap-3">
              {(['Card', 'Cash'] as const).map((method) => (
                <label key={method} className="relative cursor-pointer">
                  <input
                    type="radio"
                    value={method}
                    {...register('method', { required: true })}
                    className="sr-only"
                  />
                  <div
                    className="flex items-center gap-3 p-4 rounded-xl border-2 transition-all duration-150"
                    style={{
                      borderColor: selectedMethod === method ? 'hsl(var(--primary))' : 'hsl(var(--border))',
                      backgroundColor: selectedMethod === method ? 'hsl(var(--primary) / 0.05)' : 'hsl(var(--card))',
                    }}
                  >
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                      style={{
                        backgroundColor: selectedMethod === method ? 'hsl(var(--primary) / 0.1)' : 'hsl(var(--secondary))',
                      }}
                    >
                      {method === 'Card' ? (
                        <CreditCard size={18} style={{ color: selectedMethod === method ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))' }} />
                      ) : (
                        <Banknote size={18} style={{ color: selectedMethod === method ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))' }} />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{method}</p>
                      <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        {method === 'Card' ? 'Card machine / online' : 'Cash on delivery'}
                      </p>
                    </div>
                    {selectedMethod === method && (
                      <CheckCircle2 size={16} className="ml-auto shrink-0" style={{ color: 'hsl(var(--primary))' }} />
                    )}
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Delivery Charge & Order Total — side by side */}
          <div className="grid grid-cols-2 gap-4">
            {/* Delivery Charge */}
            <div>
              <label htmlFor="deliveryCharge" className="label flex items-center gap-1.5">
                <Truck size={13} style={{ color: 'hsl(var(--primary))' }} />
                Delivery Charge (£)
              </label>
              <p className="helper-text">Charge for delivery service</p>
              <div className="relative mt-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  £
                </span>
                <input
                  id="deliveryCharge"
                  type="number"
                  step="0.01"
                  min="0"
                  className={`input-base pl-8 font-mono ${errors.deliveryCharge ? 'input-error' : ''}`}
                  {...register('deliveryCharge', {
                    min: { value: 0, message: 'Cannot be negative' },
                    onChange: (e) => recalcTotalDue('deliveryCharge', e.target.value),
                  })}
                />
              </div>
              {errors.deliveryCharge && <p className="error-text">{errors.deliveryCharge.message}</p>}
            </div>

            {/* Order Total */}
            <div>
              <label htmlFor="orderTotal" className="label flex items-center gap-1.5">
                <ShoppingCart size={13} style={{ color: 'hsl(var(--primary))' }} />
                Order Total (£)
              </label>
              <p className="helper-text">Total value of the order</p>
              <div className="relative mt-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  £
                </span>
                <input
                  id="orderTotal"
                  type="number"
                  step="0.01"
                  min="0"
                  className={`input-base pl-8 font-mono ${errors.orderTotal ? 'input-error' : ''}`}
                  {...register('orderTotal', {
                    required: 'Order total is required',
                    min: { value: 0.01, message: 'Amount must be greater than £0' },
                    validate: (v) => !isNaN(parseFloat(v)) || 'Must be a valid amount',
                    onChange: (e) => recalcTotalDue('orderTotal', e.target.value),
                  })}
                />
              </div>
              {errors.orderTotal && <p className="error-text">{errors.orderTotal.message}</p>}
            </div>
          </div>

          {/* Deposit Paid & Total Due — side by side */}
          <div className="grid grid-cols-2 gap-4">
            {/* Deposit Paid */}
            <div>
              <label htmlFor="depositPaid" className="label flex items-center gap-1.5">
                <PiggyBank size={13} style={{ color: 'hsl(142 69% 35%)' }} />
                Deposit Paid (£)
              </label>
              <p className="helper-text">Amount already paid as deposit</p>
              <div className="relative mt-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  £
                </span>
                <input
                  id="depositPaid"
                  type="number"
                  step="0.01"
                  min="0"
                  className="input-base pl-8 font-mono"
                  {...register('depositPaid', {
                    min: { value: 0, message: 'Cannot be negative' },
                    onChange: (e) => recalcTotalDue('depositPaid', e.target.value),
                  })}
                />
              </div>
              {errors.depositPaid && <p className="error-text">{errors.depositPaid.message}</p>}
            </div>

            {/* Total Due */}
            <div>
              <label htmlFor="totalDue" className="label flex items-center gap-1.5">
                <Receipt size={13} style={{ color: 'hsl(var(--destructive))' }} />
                Total Due (£)
              </label>
              <p className="helper-text">Remaining balance to collect</p>
              <div className="relative mt-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  £
                </span>
                <input
                  id="totalDue"
                  type="number"
                  step="0.01"
                  min="0"
                  className="input-base pl-8 font-mono"
                  {...register('totalDue', {
                    min: { value: 0, message: 'Cannot be negative' },
                  })}
                />
              </div>
              {errors.totalDue && <p className="error-text">{errors.totalDue.message}</p>}
              <p className="text-[10px] mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
                Auto-calculated from total − deposit
              </p>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label htmlFor="payment-notes" className="label">
              Payment Notes <span className="font-normal" style={{ color: 'hsl(var(--muted-foreground))' }}>(optional)</span>
            </label>
            <textarea
              id="payment-notes"
              rows={3}
              placeholder="e.g. Customer paid deposit online. Balance due on delivery."
              className="input-base resize-none"
              {...register('notes')}
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button type="submit" className="btn-primary" disabled={isSaving}>
              {isSaving ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  Recording…
                </>
              ) : (
                <>
                  <CheckCircle2 size={14} />
                  Record Payment
                </>
              )}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setIsEditing(false)} disabled={isSaving}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        savedPayment.status === 'Paid' && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
              Payment Details
            </h3>
            <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'hsl(var(--border))' }}>
              {[
                { label: 'Method', value: savedPayment.method },
                { label: 'Delivery Charge', value: `£${(savedPayment.deliveryCharge ?? 0).toFixed(2)}` },
                { label: 'Order Total', value: `£${(savedPayment.orderTotal ?? savedPayment.amount ?? 0).toFixed(2)}` },
                { label: 'Deposit Paid', value: `£${(savedPayment.depositPaid ?? 0).toFixed(2)}` },
                {
                  label: 'Total Due',
                  value: `£${(savedPayment.totalDue ?? savedPayment.amountDue ?? 0).toFixed(2)}`,
                  highlight: (savedPayment.totalDue ?? savedPayment.amountDue ?? 0) > 0,
                },
                {
                  label: 'Recorded At',
                  value: savedPayment.recordedAt
                    ? new Date(savedPayment.recordedAt).toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: 'long',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : '—',
                },
                { label: 'Recorded By', value: savedPayment.recordedBy || '—' },
                { label: 'Notes', value: savedPayment.notes || 'No notes recorded' },
              ].map(({ label, value, highlight }) => (
                <div
                  key={label}
                  className="flex items-start justify-between px-4 py-3 border-b last:border-0"
                  style={{ borderColor: 'hsl(var(--border))' }}
                >
                  <span className="text-xs font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    {label}
                  </span>
                  <span
                    className="text-sm font-medium text-right max-w-[60%]"
                    style={{ color: highlight ? 'hsl(var(--destructive))' : undefined }}
                  >
                    {value}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-1.5 text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
              <Lock size={11} />
              Payment record is locked. Click Edit to modify.
            </div>
          </div>
        )
      )}
    </div>
  );
}