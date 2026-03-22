'use client';

import { useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

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
  const supabase = createClient();
  const subscribedRef = useRef(false);
  const completionToastedRef = useRef<Set<string>>(new Set());

  const subscribe = useCallback(async () => {
    if (subscribedRef.current) return;
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) return;

    try {
      // Request notification permission
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return;

      // Get VAPID public key
      const res = await fetch('/api/push/vapid-public-key');
      if (!res.ok) return;
      const { publicKey } = await res.json();
      if (!publicKey) return;

      // Get service worker registration
      const registration = await navigator.serviceWorker.ready;

      // Check for existing subscription
      let subscription = await registration.pushManager.getSubscription();

      // Create new subscription if none exists
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }

      // Save subscription to server
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
    // Auto-subscribe when hook mounts (if permission already granted)
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        subscribe();
      } else if (Notification.permission === 'default') {
        // Subscribe on first user interaction
        const handleInteraction = () => {
          subscribe();
          window.removeEventListener('click', handleInteraction);
        };
        window.addEventListener('click', handleInteraction, { once: true });
        return () => window.removeEventListener('click', handleInteraction);
      }
    }
  }, [subscribe]);

  useEffect(() => {
    const ordersChannel = supabase
      .channel('push_orders_changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders' },
        (payload) => {
          const order = payload.new as OrderPayload;

          // New order assignment notification
          if (order.driver_id && order.status === 'Booking Accepted') {
            sendPushNotification({
              title: '🚚 New Order Assigned',
              body: `Order #${order.id} for ${order.customer_name || 'Customer'} has been assigned to a driver.`,
              tag: `order-assigned-${order.id}`,
              data: { orderId: order.id, type: 'order_assigned' },
            });
          }

          // Unassigned new order
          if (!order.driver_id && order.status === 'Booking Accepted') {
            sendPushNotification({
              title: '⚠️ Unassigned Order',
              body: `New order #${order.id} for ${order.customer_name || 'Customer'} needs a driver.`,
              tag: `order-unassigned-${order.id}`,
              data: { orderId: order.id, type: 'order_unassigned' },
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

          // Driver assignment change
          if (order.driver_id && !prev.driver_id) {
            sendPushNotification({
              title: '🚚 Driver Assigned',
              body: `Order #${order.id} for ${order.customer_name || 'Customer'} has been assigned to a driver.`,
              tag: `driver-assigned-${order.id}`,
              data: { orderId: order.id, type: 'driver_assigned' },
            });
          }

          // Status change notifications
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

          // Payment update notifications
          if (order.payment_status && order.payment_status !== prev.payment_status) {
            const paymentMessages: Record<string, string> = {
              paid: '💳 Payment Received',
              refunded: '↩️ Payment Refunded',
              failed: '⚠️ Payment Failed',
            };
            const paymentTitle = paymentMessages[order.payment_status];
            if (paymentTitle) {
              sendPushNotification({
                title: paymentTitle,
                body: `Payment status updated for order #${order.id} (${order.customer_name || 'Customer'}).`,
                tag: `payment-${order.id}-${order.payment_status}`,
                data: { orderId: order.id, type: 'payment_update', paymentStatus: order.payment_status },
              });
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ordersChannel);
    };
  }, []);

  return { subscribe };
}
