'use client';

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';

interface OrderPayload {
  id: string;
  customer_name: string;
  status: string;
  driver_id: string | null;
  booking_date: string;
  delivery_window: string;
}

// Parse a delivery_window like "09:00 - 11:00" and return the end time as a Date
function parseWindowEnd(bookingDate: string, deliveryWindow: string): Date | null {
  try {
    // delivery_window format: "HH:MM - HH:MM" or "HH:MM-HH:MM"
    const parts = deliveryWindow.split(/[-–]/).map((s) => s.trim());
    const endTime = parts[parts.length - 1]; // e.g. "11:00"
    const [hours, minutes] = endTime.split(':').map(Number);
    if (isNaN(hours) || isNaN(minutes)) return null;
    const dt = new Date(bookingDate);
    dt.setHours(hours, minutes, 0, 0);
    return dt;
  } catch {
    return null;
  }
}

export default function ToastNotificationProvider() {
  const supabase = createClient();
  // Track which order IDs we've already toasted for delay to avoid repeat toasts
  const delayToastedRef = useRef<Set<string>>(new Set());
  // Track which order IDs we've already toasted for completion
  const completionToastedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    // ── Channel 1: Delivery completions & unassigned bookings (INSERT + UPDATE) ──
    const ordersChannel = supabase
      .channel('toast_orders_changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders' },
        (payload) => {
          const order = payload.new as OrderPayload;
          // Unassigned booking: newly inserted with no driver assigned
          if (!order.driver_id && order.status === 'Booking Accepted') {
            toast.warning('Unassigned Booking', {
              description: `Booking #${order.id} for ${order.customer_name || 'Unknown'} has no driver assigned.`,
              duration: 6000,
            });
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders' },
        (payload) => {
          const order = payload.new as OrderPayload;
          const prev = payload.old as Partial<OrderPayload>;

          // Delivery completion toast
          if (
            order.status === 'Booking Complete' &&
            prev.status !== 'Booking Complete' &&
            !completionToastedRef.current.has(order.id)
          ) {
            completionToastedRef.current.add(order.id);
            toast.success('Delivery Complete', {
              description: `Booking #${order.id} for ${order.customer_name || 'Unknown'} has been delivered.`,
              duration: 5000,
            });
          }

          // Unassigned booking: driver removed from a booking
          if (
            order.driver_id === null &&
            prev.driver_id !== null &&
            order.status !== 'Booking Complete' &&
            order.status !== 'Booking Cancelled'
          ) {
            toast.warning('Unassigned Booking', {
              description: `Booking #${order.id} for ${order.customer_name || 'Unknown'} is now unassigned.`,
              duration: 6000,
            });
          }
        }
      )
      .subscribe();

    // ── Channel 2: ETA delay polling — check on-route orders every 60 seconds ──
    const checkDelays = async () => {
      try {
        const { data, error } = await supabase
          .from('orders')
          .select('id, customer_name, status, driver_id, booking_date, delivery_window')
          .eq('status', 'Booking Out For Delivery')
          .not('driver_id', 'is', null);

        if (error || !data) return;

        const now = new Date();
        data.forEach((order: OrderPayload) => {
          if (delayToastedRef.current.has(order.id)) return;
          if (!order.delivery_window || !order.booking_date) return;

          const windowEnd = parseWindowEnd(order.booking_date, order.delivery_window);
          if (!windowEnd) return;

          if (now > windowEnd) {
            delayToastedRef.current.add(order.id);
            const overdueMins = Math.round((now.getTime() - windowEnd.getTime()) / 60000);
            toast.error('Driver Delay — ETA Exceeded', {
              description: `Booking #${order.id} for ${order.customer_name || 'Unknown'} is ${overdueMins} min overdue (window: ${order.delivery_window}).`,
              duration: 8000,
            });
          }
        });
      } catch {
        // Silently ignore polling errors
      }
    };

    // Run immediately on mount, then every 60 seconds
    checkDelays();
    const delayInterval = setInterval(checkDelays, 60_000);

    return () => {
      supabase.removeChannel(ordersChannel);
      clearInterval(delayInterval);
    };
  }, []);

  return null;
}
