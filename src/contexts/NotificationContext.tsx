'use client';

import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';

interface NotificationContextValue {
  unreadCount: number;
  markAllRead: () => void;
}

const NotificationContext = createContext<NotificationContextValue>({
  unreadCount: 0,
  markAllRead: () => {},
});

export function useNotifications() {
  return useContext(NotificationContext);
}

interface OrderRow {
  id: string;
  customer_name?: string;
  status?: string;
  driver_id?: string | null;
  payment_status?: string;
}

// Human-readable status labels
function statusLabel(status: string): string {
  const map: Record<string, string> = {
    'Booking Accepted': 'Accepted',
    'Booking Confirmed': 'Confirmed',
    'Booking Out For Delivery': 'Out for Delivery',
    'Booking Complete': 'Delivered',
    'Booking Cancelled': 'Cancelled',
  };
  return map[status] ?? status;
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const [unreadCount, setUnreadCount] = useState(0);
  const toastedOrderEvents = useRef<Set<string>>(new Set());

  // Load initial unread count from notifications table
  useEffect(() => {
    const loadUnread = async () => {
      const { count } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('is_dismissed', false);
      if (count !== null) setUnreadCount(count);
    };
    loadUnread();
  }, []);

  const markAllRead = useCallback(async () => {
    setUnreadCount(0);
    await supabase
      .from('notifications')
      .update({ is_dismissed: true, dismissed_at: new Date().toISOString() })
      .eq('is_dismissed', false);
  }, []);

  useEffect(() => {
    // ── Real-time: orders table — new assignments, status changes, payment ──
    const ordersChannel = supabase
      .channel('notif_ctx_orders')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders' },
        (payload) => {
          const order = payload.new as OrderRow;
          const key = `insert_${order.id}`;
          if (toastedOrderEvents.current.has(key)) return;
          toastedOrderEvents.current.add(key);

          const name = order.customer_name || 'Unknown';

          if (order.driver_id) {
            toast.info('🚗 New Order Assigned', {
              description: `Order #${order.id} for ${name} has been assigned to a driver.`,
              duration: 6000,
            });
          } else {
            toast.warning('📋 New Order — Unassigned', {
              description: `Order #${order.id} for ${name} needs a driver assigned.`,
              duration: 6000,
            });
          }
          setUnreadCount((c) => c + 1);
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders' },
        (payload) => {
          const order = payload.new as OrderRow;
          const prev = payload.old as Partial<OrderRow>;
          const name = order.customer_name || 'Unknown';

          // ── Driver assigned ──
          if (order.driver_id && !prev.driver_id) {
            const key = `assigned_${order.id}_${order.driver_id}`;
            if (!toastedOrderEvents.current.has(key)) {
              toastedOrderEvents.current.add(key);
              toast.info('🚗 Driver Assigned', {
                description: `Order #${order.id} for ${name} has been assigned to a driver.`,
                duration: 5000,
              });
              setUnreadCount((c) => c + 1);
            }
          }

          // ── Status changed ──
          if (order.status && order.status !== prev.status) {
            const key = `status_${order.id}_${order.status}`;
            if (!toastedOrderEvents.current.has(key)) {
              toastedOrderEvents.current.add(key);

              if (order.status === 'Booking Complete') {
                toast.success('✅ Order Delivered', {
                  description: `Order #${order.id} for ${name} is now ${statusLabel(order.status)}.`,
                  duration: 5000,
                });
              } else if (order.status === 'Booking Cancelled') {
                toast.error('❌ Order Cancelled', {
                  description: `Order #${order.id} for ${name} has been cancelled.`,
                  duration: 5000,
                });
              } else if (order.status === 'Booking Out For Delivery') {
                toast.info('🚚 Out for Delivery', {
                  description: `Order #${order.id} for ${name} is now out for delivery.`,
                  duration: 5000,
                });
              } else {
                toast.info(`📦 Status Updated`, {
                  description: `Order #${order.id} for ${name}: ${statusLabel(order.status)}.`,
                  duration: 4000,
                });
              }
              setUnreadCount((c) => c + 1);
            }
          }

          // ── Payment received ──
          if (
            order.payment_status === 'Paid' &&
            prev.payment_status !== 'Paid'
          ) {
            const key = `payment_${order.id}_paid`;
            if (!toastedOrderEvents.current.has(key)) {
              toastedOrderEvents.current.add(key);
              toast.success('💳 Payment Received', {
                description: `Payment recorded for Order #${order.id} (${name}).`,
                duration: 5000,
              });
              setUnreadCount((c) => c + 1);
            }
          }
        }
      )
      .subscribe();

    // ── Real-time: notifications table inserts (system-generated alerts) ──
    const notifChannel = supabase
      .channel('notif_ctx_notifications')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        () => {
          setUnreadCount((c) => c + 1);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ordersChannel);
      supabase.removeChannel(notifChannel);
    };
  }, []);

  return (
    <NotificationContext.Provider value={{ unreadCount, markAllRead }}>
      {children}
    </NotificationContext.Provider>
  );
}
