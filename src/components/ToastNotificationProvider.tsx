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
    const parts = deliveryWindow.split(/[-–]/).map((s) => s.trim());
    const endTime = parts[parts.length - 1];
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
  const delayToastedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    // ── ETA delay polling — check on-route orders every 60 seconds ──
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
            toast.error('⏰ Driver Delay — ETA Exceeded', {
              description: `Order #${order.id} for ${order.customer_name || 'Unknown'} is ${overdueMins} min overdue (window: ${order.delivery_window}).`,
              duration: 8000,
            });
          }
        });
      } catch {
        // Silently ignore polling errors
      }
    };

    checkDelays();
    const delayInterval = setInterval(checkDelays, 60_000);

    return () => {
      clearInterval(delayInterval);
    };
  }, []);

  return null;
}
