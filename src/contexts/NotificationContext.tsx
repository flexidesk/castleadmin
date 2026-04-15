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
  const db = createClient();
  const [unreadCount, setUnreadCount] = useState(0);
  const toastedOrderEvents = useRef<Set<string>>(new Set());
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastOrdersRef = useRef<Map<string, OrderRow>>(new Map());
  const lastNotifCountRef = useRef<number>(0);

  // Load initial unread count
  useEffect(() => {
    const loadUnread = async () => {
      const { count } = await db
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('is_dismissed', false);
      if (count !== null) {
        setUnreadCount(count);
        lastNotifCountRef.current = count;
      }
    };
    loadUnread();
  }, []);

  const markAllRead = useCallback(async () => {
    setUnreadCount(0);
    await db
      .from('notifications')
      .update({ is_dismissed: true, dismissed_at: new Date().toISOString() })
      .eq('is_dismissed', false);
  }, []);

  // Poll for order changes and new notifications every 30 seconds
  useEffect(() => {
    const pollForChanges = async () => {
      try {
        // Poll recent orders for status changes
        const res = await fetch('/api/orders/recent?limit=30');
        if (res.ok) {
          const orders: OrderRow[] = await res.json();

          for (const order of orders) {
            const prev = lastOrdersRef.current.get(order.id);

            if (!prev) {
              // New order
              const key = `insert_${order.id}`;
              if (!toastedOrderEvents.current.has(key)) {
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
            } else {
              const name = order.customer_name || 'Unknown';

              // Driver assigned
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

              // Status changed
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
                    toast.info('📦 Status Updated', {
                      description: `Order #${order.id} for ${name}: ${statusLabel(order.status)}.`,
                      duration: 4000,
                    });
                  }
                  setUnreadCount((c) => c + 1);
                }
              }

              // Payment received
              if (order.payment_status === 'Paid' && prev.payment_status !== 'Paid') {
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

            lastOrdersRef.current.set(order.id, order);
          }
        }

        // Poll notification count
        const { count } = await db
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('is_dismissed', false);

        if (count !== null && count > lastNotifCountRef.current) {
          setUnreadCount(count);
          lastNotifCountRef.current = count;
        }
      } catch {}
    };

    pollIntervalRef.current = setInterval(pollForChanges, 30000);
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  return (
    <NotificationContext.Provider value={{ unreadCount, markAllRead }}>
      {children}
    </NotificationContext.Provider>
  );
}
