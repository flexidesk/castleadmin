'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface GpsPosition {
  latitude: number;
  longitude: number;
  heading: number | null;
  speed: number | null;
  accuracy: number | null;
}

interface UseDriverGpsOptions {
  driverId: string | null;
  enabled?: boolean;
  intervalMs?: number;
}

export function useDriverGps({ driverId, enabled = true, intervalMs = 30000 }: UseDriverGpsOptions) {
  const supabase = createClient();
  const watchRef = useRef<number | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const [position, setPosition] = useState<GpsPosition | null>(null);
  const [permissionState, setPermissionState] = useState<'prompt' | 'granted' | 'denied' | 'unsupported'>('prompt');
  const [isTracking, setIsTracking] = useState(false);

  const broadcastLocation = useCallback(async (pos: GeolocationPosition) => {
    if (!driverId) return;

    const gpsData: GpsPosition = {
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      heading: pos.coords.heading,
      speed: pos.coords.speed,
      accuracy: pos.coords.accuracy,
    };

    setPosition(gpsData);

    // Send to Supabase
    try {
      await supabase.from('driver_locations').insert({
        driver_id: driverId,
        latitude: gpsData.latitude,
        longitude: gpsData.longitude,
        heading: gpsData.heading ?? null,
        speed: gpsData.speed ?? null,
        accuracy: gpsData.accuracy ?? null,
        recorded_at: new Date().toISOString(),
      });
    } catch {
      // Queue for background sync if offline
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'QUEUE_GPS_UPDATE',
          payload: {
            driver_id: driverId,
            latitude: gpsData.latitude,
            longitude: gpsData.longitude,
            heading: gpsData.heading ?? null,
            speed: gpsData.speed ?? null,
            accuracy: gpsData.accuracy ?? null,
            recorded_at: new Date().toISOString(),
          },
        });
      }
    }
  }, [driverId, supabase]);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!('geolocation' in navigator)) {
      setPermissionState('unsupported');
      return false;
    }

    // Check permission API if available
    if ('permissions' in navigator) {
      try {
        const result = await navigator.permissions.query({ name: 'geolocation' });
        setPermissionState(result.state as 'prompt' | 'granted' | 'denied');
        if (result.state === 'denied') return false;

        result.addEventListener('change', () => {
          setPermissionState(result.state as 'prompt' | 'granted' | 'denied');
        });
      } catch {
        // Permissions API not fully supported
      }
    }

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        () => {
          setPermissionState('granted');
          resolve(true);
        },
        () => {
          setPermissionState('denied');
          resolve(false);
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  }, []);

  const startTracking = useCallback(() => {
    if (!driverId || !('geolocation' in navigator)) return;

    // Watch position for continuous updates
    watchRef.current = navigator.geolocation.watchPosition(
      broadcastLocation,
      () => { /* silent */ },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );

    // Periodic fallback every intervalMs
    intervalRef.current = setInterval(() => {
      navigator.geolocation.getCurrentPosition(
        broadcastLocation,
        () => { /* silent */ },
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
      );
    }, intervalMs);

    setIsTracking(true);

    // Register periodic background sync on Android Chrome
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((reg) => {
        if ('periodicSync' in reg) {
          (reg as any).periodicSync.register('gps-periodic-sync', {
            minInterval: 60 * 1000, // 1 minute minimum
          }).catch(() => {});
        }
      });
    }
  }, [driverId, broadcastLocation, intervalMs]);

  const stopTracking = useCallback(() => {
    if (watchRef.current !== null) {
      navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    }
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsTracking(false);
  }, []);

  useEffect(() => {
    if (!enabled || !driverId) {
      stopTracking();
      return;
    }

    requestPermission().then((granted) => {
      if (granted) startTracking();
    });

    return () => stopTracking();
  }, [enabled, driverId, startTracking, stopTracking, requestPermission]);

  return { position, permissionState, isTracking, requestPermission, startTracking, stopTracking };
}
