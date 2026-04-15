'use client';

import { useEffect, useRef, useCallback, useState } from 'react';

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

const MAX_RETRIES = 5;
const BASE_RETRY_DELAY_MS = 2000;

export function useDriverGps({ driverId, enabled = true, intervalMs = 30000 }: UseDriverGpsOptions) {
  const watchRef = useRef<number | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef(0);
  const isStartingRef = useRef(false);

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

    try {
      // Use the API route for location updates (works with any backend)
      const res = await fetch('/api/driver/location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driver_id: driverId,
          latitude: gpsData.latitude,
          longitude: gpsData.longitude,
          heading: gpsData.heading ?? null,
          speed: gpsData.speed ?? null,
          accuracy: gpsData.accuracy ?? null,
          timestamp: new Date().toISOString(),
        }),
      });

      if (!res.ok) {
        console.warn('[GPS] Location update failed:', res.status);
        queueForBackgroundSync(driverId, gpsData);
      }
    } catch (err) {
      console.warn('[GPS] Network error, queuing for background sync');
      queueForBackgroundSync(driverId, gpsData);
    }
  }, [driverId]);

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

  const stopTracking = useCallback(() => {
    if (watchRef.current !== null) {
      navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    }
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (retryTimeoutRef.current !== null) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    retryCountRef.current = 0;
    isStartingRef.current = false;
    setIsTracking(false);
  }, []);

  const scheduleRetry = useCallback((startFn: () => void) => {
    if (retryCountRef.current >= MAX_RETRIES) {
      console.warn('[GPS] Max retries reached. Giving up.');
      setError('GPS signal lost. Please check your device location settings and try again.');
      setIsTracking(false);
      isStartingRef.current = false;
      return;
    }

    const delay = Math.min(BASE_RETRY_DELAY_MS * Math.pow(2, retryCountRef.current), 60000);
    retryCountRef.current += 1;
    console.info(`[GPS] Retry ${retryCountRef.current}/${MAX_RETRIES} in ${delay}ms`);

    retryTimeoutRef.current = setTimeout(() => {
      retryTimeoutRef.current = null;
      startFn();
    }, delay);
  }, []);

  const startTracking = useCallback(() => {
    if (!driverId || !('geolocation' in navigator)) return;
    if (isStartingRef.current) return;
    isStartingRef.current = true;

    if (watchRef.current !== null) {
      navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    }
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    const handleWatchError = (err: GeolocationPositionError) => {
      if (err.code === err.PERMISSION_DENIED) {
        setPermissionState('denied');
        setError('Location permission denied. Please enable in browser settings.');
        stopTracking();
      } else if (err.code === err.POSITION_UNAVAILABLE) {
        setError('Location unavailable. Retrying…');
        if (watchRef.current !== null) {
          navigator.geolocation.clearWatch(watchRef.current);
          watchRef.current = null;
        }
        isStartingRef.current = false;
        scheduleRetry(startTracking);
      } else if (err.code === err.TIMEOUT) {
        setError('Location timed out. Retrying…');
        if (watchRef.current !== null) {
          navigator.geolocation.clearWatch(watchRef.current);
          watchRef.current = null;
        }
        isStartingRef.current = false;
        scheduleRetry(startTracking);
      }
    };

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        retryCountRef.current = 0;
        setError(null);
        broadcastLocation(pos);

        watchRef.current = navigator.geolocation.watchPosition(
          (watchPos) => {
            retryCountRef.current = 0;
            broadcastLocation(watchPos);
          },
          handleWatchError,
          { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
        );

        intervalRef.current = setInterval(() => {
          navigator.geolocation.getCurrentPosition(
            broadcastLocation,
            (err) => {
              if (err.code !== err.PERMISSION_DENIED) {
                console.warn('[GPS] Periodic fallback error:', err.message);
              }
            },
            { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
          );
        }, intervalMs);

        setIsTracking(true);
        isStartingRef.current = false;

        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.ready.then((reg) => {
            if ('periodicSync' in reg) {
              (reg as any).periodicSync.register('gps-periodic-sync', {
                minInterval: 60 * 1000,
              }).catch(() => {});
            }
          });
        }
      },
      (err) => {
        isStartingRef.current = false;
        if (err.code === err.PERMISSION_DENIED) {
          setPermissionState('denied');
          setError('Location permission denied. Please enable in browser settings.');
          setIsTracking(false);
        } else {
          setError('Unable to get GPS fix. Retrying…');
          scheduleRetry(startTracking);
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }, [driverId, broadcastLocation, stopTracking, scheduleRetry, intervalMs]);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!('geolocation' in navigator)) {
      setPermissionState('unsupported');
      setError('GPS is not supported on this device.');
      return false;
    }

    if ('permissions' in navigator) {
      try {
        const result = await navigator.permissions.query({ name: 'geolocation' });
        setPermissionState(result.state as 'prompt' | 'granted' | 'denied');

        if (result.state === 'denied') {
          setError('Location permission denied. Please enable in browser/device settings.');
          return false;
        }

        if (result.state === 'granted') {
          return true;
        }
      } catch {}
    }

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        () => {
          setPermissionState('granted');
          resolve(true);
        },
        (err) => {
          if (err.code === err.PERMISSION_DENIED) {
            setPermissionState('denied');
            setError('Location permission denied.');
          }
          resolve(false);
        },
        { timeout: 10000 }
      );
    });
  }, []);

  useEffect(() => {
    if (!enabled || !driverId) return;

    if ('permissions' in navigator) {
      navigator.permissions.query({ name: 'geolocation' }).then((result) => {
        setPermissionState(result.state as 'prompt' | 'granted' | 'denied');
        if (result.state === 'granted') {
          startTracking();
        }
        result.addEventListener('change', () => {
          setPermissionState(result.state as 'prompt' | 'granted' | 'denied');
          if (result.state === 'granted') {
            startTracking();
          } else if (result.state === 'denied') {
            stopTracking();
          }
        });
      }).catch(() => {});
    }

    return () => {
      stopTracking();
    };
  }, [enabled, driverId]);

  return {
    position,
    permissionState,
    isTracking,
    error,
    startTracking,
    stopTracking,
    requestPermission,
  };
}
