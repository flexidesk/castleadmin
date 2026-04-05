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
  const [error, setError] = useState<string | null>(null);

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
    setError(null);

    // Upsert latest location — keeps one current row per driver for live tracking display
    // Also insert a history record for the full location log
    try {
      // Insert into history log
      const { error: insertError } = await supabase.from('driver_locations').insert({
        driver_id: driverId,
        latitude: gpsData.latitude,
        longitude: gpsData.longitude,
        heading: gpsData.heading ?? null,
        speed: gpsData.speed ?? null,
        accuracy: gpsData.accuracy ?? null,
        recorded_at: new Date().toISOString(),
      });

      if (insertError) {
        console.warn('[GPS] Supabase insert error:', insertError.message);
        // Queue for background sync if offline
        queueForBackgroundSync(driverId, gpsData);
      }
    } catch (err) {
      console.warn('[GPS] Network error, queuing for background sync');
      queueForBackgroundSync(driverId, gpsData);
    }
  }, [driverId, supabase]);

  const queueForBackgroundSync = (dId: string, gpsData: GpsPosition) => {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'QUEUE_GPS_UPDATE',
        payload: {
          driver_id: dId,
          latitude: gpsData.latitude,
          longitude: gpsData.longitude,
          heading: gpsData.heading ?? null,
          speed: gpsData.speed ?? null,
          accuracy: gpsData.accuracy ?? null,
          recorded_at: new Date().toISOString(),
        },
      });
    }
  };

  const handleGpsError = useCallback((err: GeolocationPositionError) => {
    if (err.code === err.PERMISSION_DENIED) {
      setPermissionState('denied');
      setError('Location permission denied. Please enable in browser settings.');
      setIsTracking(false);
    } else if (err.code === err.POSITION_UNAVAILABLE) {
      setError('Location unavailable. Ensure GPS is enabled on your device.');
    } else if (err.code === err.TIMEOUT) {
      setError('Location request timed out. Retrying...');
    }
  }, []);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!('geolocation' in navigator)) {
      setPermissionState('unsupported');
      setError('GPS is not supported on this device.');
      return false;
    }

    // Check permission API if available
    if ('permissions' in navigator) {
      try {
        const result = await navigator.permissions.query({ name: 'geolocation' });
        setPermissionState(result.state as 'prompt' | 'granted' | 'denied');

        if (result.state === 'denied') {
          setError('Location permission denied. Please enable in browser/device settings.');
          return false;
        }

        // Listen for permission changes (e.g. user enables GPS in settings)
        result.addEventListener('change', () => {
          setPermissionState(result.state as 'prompt' | 'granted' | 'denied');
          if (result.state === 'denied') {
            setError('Location permission was revoked.');
            setIsTracking(false);
          }
        });
      } catch {
        // Permissions API not fully supported — proceed to prompt via getCurrentPosition
      }
    }

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setPermissionState('granted');
          setError(null);
          broadcastLocation(pos);
          resolve(true);
        },
        (err) => {
          handleGpsError(err);
          resolve(false);
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    });
  }, [broadcastLocation, handleGpsError]);

  const startTracking = useCallback(() => {
    if (!driverId || !('geolocation' in navigator)) return;

    // Clear any existing watchers
    if (watchRef.current !== null) {
      navigator.geolocation.clearWatch(watchRef.current);
    }
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
    }

    // Watch position for continuous updates
    watchRef.current = navigator.geolocation.watchPosition(
      broadcastLocation,
      handleGpsError,
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
    );

    // Periodic fallback every intervalMs (ensures updates even if watchPosition stalls)
    intervalRef.current = setInterval(() => {
      navigator.geolocation.getCurrentPosition(
        broadcastLocation,
        handleGpsError,
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
      );
    }, intervalMs);

    setIsTracking(true);

    // Register periodic background sync on Android Chrome
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((reg) => {
        if ('periodicSync' in reg) {
          (reg as any).periodicSync.register('gps-periodic-sync', {
            minInterval: 60 * 1000,
          }).catch(() => {});
        }
      });
    }
  }, [driverId, broadcastLocation, handleGpsError, intervalMs]);

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

  return { position, permissionState, isTracking, error, requestPermission, startTracking, stopTracking };
}
