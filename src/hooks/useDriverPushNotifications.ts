'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

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

interface UseDriverPushOptions {
  driverId: string | null;
  driverName?: string;
}

async function showPushNotification(title: string, options: NotificationOptions) {
  // Prefer service worker notification (works in background) over Notification API
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(title, {
        ...options,
        requireInteraction: true,
        vibrate: [200, 100, 200, 100, 200],
        silent: false,
      } as NotificationOptions);
      return;
    } catch {
      // Fall through to Notification API
    }
  }
  // Fallback for when service worker is not available
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, options);
  }
}

export function useDriverPushNotifications({ driverId, driverName }: UseDriverPushOptions) {
  const supabase = createClient();
  const subscribedRef = useRef(false);
  const [permissionState, setPermissionState] = useState<NotificationPermission | 'unsupported'>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (subscribedRef.current) return true;
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      setPermissionState('unsupported');
      return false;
    }

    try {
      const permission = await Notification.requestPermission();
      setPermissionState(permission);
      if (permission !== 'granted') return false;

      const res = await fetch('/api/push/vapid-public-key');
      if (!res.ok) return false;
      const { publicKey } = await res.json();
      if (!publicKey || publicKey === 'your-vapid-public-key-here') {
        // VAPID not configured — still mark subscribed so realtime notifications work
        subscribedRef.current = true;
        setIsSubscribed(true);
        return true;
      }

      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }

      // Save subscription with driver context
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...subscription.toJSON(),
          driver_id: driverId,
          driver_name: driverName,
          context: 'driver_portal',
        }),
      });

      subscribedRef.current = true;
      setIsSubscribed(true);
      return true;
    } catch {
      return false;
    }
  }, [driverId, driverName]);

  const unsubscribe = useCallback(async () => {
    try {
      if (!('serviceWorker' in navigator)) return;
      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }
      subscribedRef.current = false;
      setIsSubscribed(false);
    } catch {
      // Silent
    }
  }, []);

  // Check current permission state on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPermissionState(Notification.permission);
    }
  }, []);

  // Auto-subscribe when driver is available — request permission if not yet granted
  useEffect(() => {
    if (!driverId) return;

    if (typeof window === 'undefined' || !('Notification' in window)) return;

    if (Notification.permission === 'granted') {
      // Already granted — subscribe immediately
      subscribe();
    } else if (Notification.permission === 'default') {
      // Not yet asked — request permission and subscribe
      subscribe();
    }
    // If 'denied', do nothing — user must change in browser settings
  }, [driverId, subscribe]);

  // Listen for new order assignments for this driver via Supabase realtime
  // This handles both server-sent push (when app is open) and background push (via SW)
  useEffect(() => {
    if (!driverId || !isSubscribed) return;

    const channel = supabase
      .channel(`driver-push-${driverId}`)
      .on(
        'postgres_changes',
        // Listen for UPDATE events — assignments happen when driver_id is set on an existing order
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `driver_id=eq.${driverId}` },
        async (payload) => {
          const order = payload.new as any;
          const prev = payload.old as any;

          if (typeof window === 'undefined' || !('Notification' in window)) return;
          if (Notification.permission !== 'granted') return;

          // New assignment: driver_id was just set (prev had no driver or different driver)
          const wasJustAssigned =
            (!prev?.driver_id || prev.driver_id !== driverId) && order.driver_id === driverId;

          if (wasJustAssigned) {
            await showPushNotification('🚚 New Booking Assigned', {
              body: `Order #${order.woo_order_id || order.id} — ${order.delivery_address_line1 || 'See app for details'}`,
              icon: '/icons/icon-192x192.png',
              badge: '/icons/icon-72x72.png',
              tag: `new-order-${order.id}`,
              data: { orderId: order.id, url: `/driver-portal?order=${order.id}` },
            });
            return;
          }

          // Status change notifications
          if (order.status !== prev?.status) {
            const statusMessages: Record<string, string> = {
              'Booking Cancelled': '❌ Order Cancelled',
              'Booking Assigned': '📋 Order Assigned to You',
            };
            const title = statusMessages[order.status];
            if (title) {
              await showPushNotification(title, {
                body: `Order #${order.woo_order_id || order.id} — ${order.status}`,
                icon: '/icons/icon-192x192.png',
                badge: '/icons/icon-72x72.png',
                tag: `status-${order.id}`,
                data: { orderId: order.id, url: `/driver-portal?order=${order.id}` },
              });
            }
          }
        }
      )
      .on(
        'postgres_changes',
        // Also listen for INSERT in case a new order is created directly assigned to this driver
        { event: 'INSERT', schema: 'public', table: 'orders', filter: `driver_id=eq.${driverId}` },
        async (payload) => {
          const order = payload.new as any;
          if (typeof window === 'undefined' || !('Notification' in window)) return;
          if (Notification.permission !== 'granted') return;

          await showPushNotification('🚚 New Booking Assigned', {
            body: `Order #${order.woo_order_id || order.id} — ${order.delivery_address_line1 || 'See app for details'}`,
            icon: '/icons/icon-192x192.png',
            badge: '/icons/icon-72x72.png',
            tag: `new-order-${order.id}`,
            data: { orderId: order.id, url: `/driver-portal?order=${order.id}` },
          });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [driverId, isSubscribed, supabase]);

  return { subscribe, unsubscribe, permissionState, isSubscribed };
}
