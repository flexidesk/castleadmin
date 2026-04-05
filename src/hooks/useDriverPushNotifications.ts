'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

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

// ── Audio alert ────────────────────────────────────────────────────────────────
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
    // Three ascending tones: pleasant "ding-ding-ding"
    playTone(880, 0, 0.18);
    playTone(1100, 0.22, 0.18);
    playTone(1320, 0.44, 0.28);
    // Auto-close context after alert
    setTimeout(() => ctx.close(), 1200);
  } catch {
    // Audio not available — silent fallback
  }
}

// ── Push notification via service worker ──────────────────────────────────────
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
    } catch {
      // Fall through
    }
  }
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, options);
  }
}

// ── Reconnection constants ─────────────────────────────────────────────────────
const RECONNECT_BASE_MS = 2_000;
const RECONNECT_MAX_MS = 60_000;
const RECONNECT_JITTER_MS = 500;

export function useDriverPushNotifications({ driverId, driverName }: UseDriverPushOptions) {
  const supabase = createClient();
  const subscribedRef = useRef(false);
  const [permissionState, setPermissionState] = useState<NotificationPermission | 'unsupported'>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [newAssignmentCount, setNewAssignmentCount] = useState(0);

  // Reconnection state
  const channelRef = useRef<RealtimeChannel | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  // ── Subscribe to push ──────────────────────────────────────────────────────
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
        console.warn('Push subscription could not be saved to server:', await saveRes.text().catch(() => ''));
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
    } catch {
      // Silent
    }
  }, []);

  const clearNewAssignments = useCallback(() => {
    setNewAssignmentCount(0);
  }, []);

  // ── Check permission on mount ──────────────────────────────────────────────
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPermissionState(Notification.permission);
    }
  }, []);

  // ── Auto-subscribe when driver available ──────────────────────────────────
  useEffect(() => {
    if (!driverId) return;
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission === 'granted' || Notification.permission === 'default') {
      subscribe();
    }
  }, [driverId, subscribe]);

  // ── Realtime subscription with reconnection logic ─────────────────────────
  const setupChannel = useCallback(() => {
    if (!driverId || !mountedRef.current) return;

    // Tear down existing channel first
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const handleNewAssignment = async (order: any, prev?: any) => {
      if (typeof window === 'undefined') return;

      const wasJustAssigned =
        (!prev?.driver_id || prev.driver_id !== driverId) && order.driver_id === driverId;

      if (wasJustAssigned) {
        // Audio alert
        playAssignmentAlert();

        // Badge increment
        setNewAssignmentCount((c) => c + 1);

        // Push notification
        if ('Notification' in window && Notification.permission === 'granted') {
          await showPushNotification('🚚 New Booking Assigned', {
            body: `Order #${order.woo_order_id || order.id} — ${order.delivery_address_line1 || 'See app for details'}`,
            icon: '/icons/icon-192x192.png',
            badge: '/icons/icon-72x72.png',
            tag: `new-order-${order.id}`,
            data: { orderId: order.id, url: `/driver-portal?order=${order.id}` },
          });
        }
        return;
      }

      // Status change notifications (non-assignment)
      if (prev && order.status !== prev.status) {
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
    };

    const channel = supabase
      .channel(`driver-push-${driverId}-${Date.now()}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `driver_id=eq.${driverId}` },
        async (payload) => {
          await handleNewAssignment(payload.new as any, payload.old as any);
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders', filter: `driver_id=eq.${driverId}` },
        async (payload) => {
          await handleNewAssignment(payload.new as any);
        }
      )
      .subscribe((status) => {
        if (!mountedRef.current) return;

        if (status === 'SUBSCRIBED') {
          // Successfully connected — reset backoff
          reconnectAttemptRef.current = 0;
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          // Schedule reconnect with exponential backoff + jitter
          if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);

          const attempt = reconnectAttemptRef.current;
          const backoff = Math.min(
            RECONNECT_BASE_MS * Math.pow(2, attempt) + Math.random() * RECONNECT_JITTER_MS,
            RECONNECT_MAX_MS
          );
          reconnectAttemptRef.current = attempt + 1;

          reconnectTimerRef.current = setTimeout(() => {
            if (mountedRef.current) setupChannel();
          }, backoff);
        }
      });

    channelRef.current = channel;
  }, [driverId, supabase]);

  useEffect(() => {
    if (!driverId || !isSubscribed) return;

    mountedRef.current = true;
    setupChannel();

    // Visibility change: reconnect when tab becomes visible again
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && mountedRef.current) {
        setupChannel();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Online event: reconnect when network restored
    const handleOnline = () => {
      if (mountedRef.current) {
        reconnectAttemptRef.current = 0; // Reset backoff on network restore
        setupChannel();
      }
    };
    window.addEventListener('online', handleOnline);

    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
    };
  }, [driverId, isSubscribed, setupChannel, supabase]);

  return { subscribe, unsubscribe, permissionState, isSubscribed, newAssignmentCount, clearNewAssignments };
}
