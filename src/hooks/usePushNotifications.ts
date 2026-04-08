'use client';

import { useEffect, useRef, useCallback } from 'react';

interface OrderPayload {
  id: string;
  customer_name: string;
  status: string;
  driver_id: string | null;
  total_price?: number;
  payment_status?: string;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function sendPushNotification(payload: {
  title: string;
  body: string;
  tag?: string;
  data?: Record<string, unknown>;
}) {
  try {
    await fetch('/api/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    // Silently ignore push send errors
  }
}

export function usePushNotifications() {
  const subscribedRef = useRef(false);
  const completionToastedRef = useRef<Set<string>>(new Set());
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastOrdersRef = useRef<Map<string, OrderPayload>>(new Map());

  const subscribe = useCallback(async () => {
    if (subscribedRef.current) return;
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) return;

    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return;

      const res = await fetch('/api/push/vapid-public-key');
      if (!res.ok) return;
      const { publicKey } = await res.json();
      if (!publicKey) return;

      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }

      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription),
      });

      subscribedRef.current = true;
    } catch {
      // Silently ignore subscription errors
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        subscribe();
      } else if (Notification.permission === 'default') {
        const handleInteraction = () => {
          subscribe();
          window.removeEventListener('click', handleInteraction);
        };
        window.addEventListener('click', handleInteraction, { once: true });
        return () => window.removeEventListener('click', handleInteraction);
      }
    }
  }, [subscribe]);

  // Poll for order changes every 30 seconds (replaces Supabase Realtime)
  useEffect(() => {
    const pollOrders = async () => {
      try {
        const res = await fetch('/api/orders/recent?limit=20');
        if (!res.ok) return;
        const orders: OrderPayload[] = await res.json();

        for (const order of orders) {
          const prev = lastOrdersRef.current.get(order.id);

          if (!prev) {
            // New order
            if (order.driver_id && order.status === 'Booking Accepted') {
              sendPushNotification({
                title: '🚚 New Order Assigned',
                body: `Order #${order.id} for ${order.customer_name || 'Customer'} has been assigned to a driver.`,
                tag: `order-assigned-${order.id}`,
                data: { orderId: order.id, type: 'order_assigned' },
              });
            }
          } else {
            // Status change
            if (order.status !== prev.status) {
              const statusMessages: Record<string, { title: string; emoji: string }> = {
                'Booking Out For Delivery': { title: 'Out for Delivery', emoji: '🚛' },
                'Booking Complete': { title: 'Delivery Complete', emoji: '✅' },
                'Booking Cancelled': { title: 'Order Cancelled', emoji: '❌' },
                'Booking Confirmed': { title: 'Order Confirmed', emoji: '📋' },
              };
              const statusInfo = statusMessages[order.status];
              if (statusInfo && !completionToastedRef.current.has(`${order.id}-${order.status}`)) {
                completionToastedRef.current.add(`${order.id}-${order.status}`);
                sendPushNotification({
                  title: `${statusInfo.emoji} ${statusInfo.title}`,
                  body: `Order #${order.id} for ${order.customer_name || 'Customer'} — status changed to ${order.status}.`,
                  tag: `status-${order.id}-${order.status}`,
                  data: { orderId: order.id, type: 'status_change', status: order.status },
                });
              }
            }
          }

          lastOrdersRef.current.set(order.id, order);
        }
      } catch {
        // Silently ignore poll errors
      }
    };

    pollIntervalRef.current = setInterval(pollOrders, 30000);
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  return { subscribe };
}
