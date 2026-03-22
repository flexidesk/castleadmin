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
} from 'lucide-react';
import { AppOrder as Order } from '@/lib/services/ordersService';
import { PaymentBadge } from '@/components/ui/StatusBadge';
import { createClient } from '@/lib/supabase/client';

interface Props {
  order: Order;
}

interface PaymentFormData {
  method: 'Card' | 'Cash';
  amount: string;
  notes: string;
}

export default function PaymentTab({ order }: Props) {
  const [isEditing, setIsEditing] = useState(order.payment.status === 'Unpaid');
  const [isSaving, setIsSaving] = useState(false);
  const [savedPayment, setSavedPayment] = useState(order.payment);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<PaymentFormData>({
    defaultValues: {
      method: order.payment.method === 'Unrecorded' ? 'Cash' : (order.payment.method as 'Card' | 'Cash'),
      amount: order.payment.amount.toFixed(2),
      notes: order.payment.notes || '',
    },
  });

  const selectedMethod = watch('method');

  const onSubmit = async (data: PaymentFormData) => {
    setIsSaving(true);
    try {
      const supabase = createClient();

      // Update payment on the order
      const { error: orderError } = await supabase
        .from('orders')
        .update({
          payment_status: 'Paid',
          payment_method: data.method,
          payment_amount: parseFloat(data.amount),
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
            amount: parseFloat(data.amount),
            notes: data.notes || null,
            allocated_at: new Date().toISOString(),
          });

        if (cashError) {
          console.warn('Cash allocation failed:', cashError.message);
          toast.warning('Payment recorded but cash allocation to driver failed');
        } else {
          toast.success(`£${parseFloat(data.amount).toFixed(2)} cash allocated to ${order.driver.name}'s pot`);
        }
      }

      setSavedPayment({
        status: 'Paid',
        method: data.method,
        amount: parseFloat(data.amount),
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

  return (
    <div className="max-w-2xl space-y-6">
      {/* Current payment status summary */}
      <div
        className="flex items-start gap-4 p-5 rounded-xl border"
        style={{
          borderColor: savedPayment.status === 'Paid' ?'hsl(142 69% 35% / 0.25)' :'hsl(var(--destructive) / 0.25)',
          backgroundColor: savedPayment.status === 'Paid' ?'hsl(142 69% 35% / 0.04)' :'hsl(var(--destructive) / 0.04)',
        }}
      >
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{
            backgroundColor: savedPayment.status === 'Paid' ?'hsl(142 69% 35% / 0.12)' :'hsl(var(--destructive) / 0.1)',
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
          <p className="text-2xl font-bold tabular-nums mt-1">
            £{savedPayment.amount.toFixed(2)}
          </p>
          {savedPayment.status === 'Paid' && savedPayment.recordedAt && (
            <p className="text-xs mt-1.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
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
                <label
                  key={method}
                  className="relative cursor-pointer"
                >
                  <input
                    type="radio"
                    value={method}
                    {...register('method', { required: true })}
                    className="sr-only"
                  />
                  <div
                    className="flex items-center gap-3 p-4 rounded-xl border-2 transition-all duration-150"
                    style={{
                      borderColor: selectedMethod === method
                        ? 'hsl(var(--primary))'
                        : 'hsl(var(--border))',
                      backgroundColor: selectedMethod === method
                        ? 'hsl(var(--primary) / 0.05)'
                        : 'hsl(var(--card))',
                    }}
                  >
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                      style={{
                        backgroundColor: selectedMethod === method
                          ? 'hsl(var(--primary) / 0.1)'
                          : 'hsl(var(--secondary))',
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
                      <CheckCircle2
                        size={16}
                        className="ml-auto shrink-0"
                        style={{ color: 'hsl(var(--primary))' }}
                      />
                    )}
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Amount */}
          <div>
            <label htmlFor="amount" className="label">
              Amount Received (£)
            </label>
            <p className="helper-text">Enter the exact amount received from the customer</p>
            <div className="relative mt-1">
              <span
                className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold"
                style={{ color: 'hsl(var(--muted-foreground))' }}
              >
                £
              </span>
              <input
                id="amount"
                type="number"
                step="0.01"
                min="0"
                className={`input-base pl-8 font-mono ${errors.amount ? 'input-error' : ''}`}
                {...register('amount', {
                  required: 'Amount is required',
                  min: { value: 0.01, message: 'Amount must be greater than £0' },
                  validate: (v) => !isNaN(parseFloat(v)) || 'Must be a valid amount',
                })}
              />
            </div>
            {errors.amount && (
              <p className="error-text">{errors.amount.message}</p>
            )}
          </div>

          {/* Notes */}
          <div>
            <label htmlFor="payment-notes" className="label">
              Payment Notes <span className="font-normal" style={{ color: 'hsl(var(--muted-foreground))' }}>(optional)</span>
            </label>
            <textarea
              id="payment-notes"
              rows={3}
              placeholder="e.g. Customer paid in full. Receipt issued."
              className="input-base resize-none"
              {...register('notes')}
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              className="btn-primary"
              disabled={isSaving}
            >
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
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setIsEditing(false)}
              disabled={isSaving}
            >
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
            <div
              className="rounded-xl border overflow-hidden"
              style={{ borderColor: 'hsl(var(--border))' }}
            >
              {[
                { label: 'Method', value: savedPayment.method },
                { label: 'Amount', value: `£${savedPayment.amount.toFixed(2)}` },
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
              ].map(({ label, value }) => (
                <div
                  key={label}
                  className="flex items-start justify-between px-4 py-3 border-b last:border-0"
                  style={{ borderColor: 'hsl(var(--border))' }}
                >
                  <span className="text-xs font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    {label}
                  </span>
                  <span className="text-sm font-medium text-right max-w-[60%]">{value}</span>
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