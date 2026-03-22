import React from 'react';
import { CheckCircle2, Clock, Truck, PackageCheck, Circle } from 'lucide-react';
import Icon from '@/components/ui/AppIcon';


export type BookingStatus = 'Booking Accepted' | 'Booking Assigned' | 'Booking Out For Delivery' | 'Booking Complete';
export type BookingType = 'Delivery' | 'Collection';
export type PaymentStatus = 'Paid' | 'Unpaid' | 'Partial';
export type PaymentMethod = 'Card' | 'Cash' | 'Unrecorded';

interface StatusBadgeProps {
  status: BookingStatus;
}

interface TypeBadgeProps {
  type: BookingType;
}

interface PaymentBadgeProps {
  status: PaymentStatus;
  method?: PaymentMethod;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const config: Record<BookingStatus, { className: string; icon: React.ElementType; label: string }> = {
    'Booking Accepted': {
      className: 'badge badge-accepted',
      icon: Clock,
      label: 'Accepted',
    },
    'Booking Assigned': {
      className: 'badge badge-assigned',
      icon: Circle,
      label: 'Assigned',
    },
    'Booking Out For Delivery': {
      className: 'badge badge-outfordelivery',
      icon: Truck,
      label: 'Out For Delivery',
    },
    'Booking Complete': {
      className: 'badge badge-complete',
      icon: CheckCircle2,
      label: 'Complete',
    },
  };

  const { className, icon: Icon, label } = config[status];

  return (
    <span className={className}>
      <Icon size={10} />
      {label}
    </span>
  );
}

export function TypeBadge({ type }: TypeBadgeProps) {
  return (
    <span className={`badge ${type === 'Delivery' ? 'badge-delivery' : 'badge-collection'}`}>
      {type === 'Delivery' ? (
        <Truck size={10} />
      ) : (
        <PackageCheck size={10} />
      )}
      {type}
    </span>
  );
}

export function PaymentBadge({ status, method }: PaymentBadgeProps) {
  return (
    <div className="flex items-center gap-1">
      <span className={`badge ${status === 'Paid' ? 'badge-paid' : status === 'Partial' ? 'badge-assigned' : 'badge-unpaid'}`}>
        {status}
      </span>
      {method && method !== 'Unrecorded' && (
        <span className={`badge ${method === 'Cash' ? 'badge-cash' : 'badge-card'}`}>
          {method}
        </span>
      )}
    </div>
  );
}