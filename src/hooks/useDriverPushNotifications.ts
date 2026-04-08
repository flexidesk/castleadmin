'use client';

import { useEffect, useRef, useCallback, useState } from 'react';

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

function playAssignmentAlert() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const playTone = (freq: number, start: number, duration: number, gain = 0.4) => {
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();
      osc.connect(gainNode);
      gainNode.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
      gainNode.gain.setValueAtTime(0, ctx.currentTime + start);
      gainNode.gain.linearRampToValueAtTime(gain, ctx.currentTime + start + 0.02);
      gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + start + duration);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + duration + 0.05);
    };
    playTone(880, 0, 0.18);
    playTone(1100, 0.22, 0.18);
    playTone(1320, 0.44, 0.28);
    setTimeout(() => ctx.close(), 1200);
  } catch {
    // Audio not available
  }
}

async function showPushNotification(title: string, options: NotificationOptions) {
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
    } catch {}
  }
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, options);
  }
}

export function useDriverPushNotifications({ driverId, driverName }: UseDriverPushOptions) {
  const subscribedRef = useRef(false);
  const [permissionState, setPermissionState] = useState<NotificationPermission | 'unsupported'>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [newAssignmentCount, setNewAssignmentCount] = useState(0);
  const mountedRef = useRef(true);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastOrdersRef = useRef<Map<string, any>>(new Map());

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

      const saveRes = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...subscription.toJSON(),
          driver_id: driverId,
          driver_name: driverName,
          context: 'driver_portal',
        }),
      });

      if (!saveRes.ok) {
        console.warn('Push subscription could not be saved to server');
        return false;
      }

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
    } catch {}
  }, []);

  const clearNewAssignments = useCallback(() => {
    setNewAssignmentCount(0);
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPermissionState(Notification.permission);
    }
  }, []);

  useEffect(() => {
    if (!driverId) return;
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission === 'granted' || Notification.permission === 'default') {
      subscribe();
    }
  }, [driverId, subscribe]);

  // Poll for new driver orders every 15 seconds (replaces Supabase Realtime)
  useEffect(() => {
    if (!driverId || !isSubscribed) return;

    mountedRef.current = true;

    const pollDriverOrders = async () => {
      if (!mountedRef.current) return;
      try {
        const res = await fetch(`/api/driver/orders?driver_id=${driverId}&limit=20`);
        if (!res.ok) return;
        const orders: any[] = await res.json();

        for (const order of orders) {
          const prev = lastOrdersRef.current.get(order.id);

          const wasJustAssigned =
            (!prev?.driver_id || prev.driver_id !== driverId) && order.driver_id === driverId;

          if (wasJustAssigned) {
            playAssignmentAlert();
            setNewAssignmentCount((c) => c + 1);

            if ('Notification' in window && Notification.permission === 'granted') {
              await showPushNotification('🚚 New Booking Assigned', {
                body: `Order #${order.woo_order_id || order.id} — ${order.delivery_address_line1 || 'See app for details'}`,
                icon: '/icons/icon-192x192.png',
                badge: '/icons/icon-72x72.png',
                tag: `new-order-${order.id}`,
                data: { orderId: order.id, url: `/driver-portal?order=${order.id}` },
              });
            }
          } else if (prev && order.status !== prev.status) {
            const statusMessages: Record<string, string> = {
              'Booking Cancelled': '❌ Order Cancelled',
              'Booking Assigned': '📋 Order Assigned to You',
            };
            const title = statusMessages[order.status];
            if (title && 'Notification' in window && Notification.permission === 'granted') {
              await showPushNotification(title, {
                body: `Order #${order.woo_order_id || order.id} — ${order.status}`,
                icon: '/icons/icon-192x192.png',
                badge: '/icons/icon-72x72.png',
                tag: `status-${order.id}`,
                data: { orderId: order.id, url: `/driver-portal?order=${order.id}` },
              });
            }
          }

          lastOrdersRef.current.set(order.id, order);
        }
      } catch {}
    };

    pollDriverOrders();
    pollIntervalRef.current = setInterval(pollDriverOrders, 15000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && mountedRef.current) {
        pollDriverOrders();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const handleOnline = () => {
      if (mountedRef.current) pollDriverOrders();
    };
    window.addEventListener('online', handleOnline);

    return () => {
      mountedRef.current = false;
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
    };
  }, [driverId, isSubscribed]);

  return { subscribe, unsubscribe, permissionState, isSubscribed, newAssignmentCount, clearNewAssignments };
}
