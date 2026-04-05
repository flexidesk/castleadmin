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

// Retry config for failed GPS starts
const MAX_RETRIES = 5;
const BASE_RETRY_DELAY_MS = 2000;

export function useDriverGps({ driverId, enabled = true, intervalMs = 30000 }: UseDriverGpsOptions) {
  const supabase = createClient();
  const watchRef = useRef<number | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef(0);
  const isStartingRef = useRef(false); // guard against concurrent startTracking calls

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

  // scheduleRetry: exponential backoff retry for transient GPS failures
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
    if (isStartingRef.current) return; // prevent concurrent starts
    isStartingRef.current = true;

    // Clear any existing watchers before starting fresh
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
        // Clear current watch and retry
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

    // Fire an immediate getCurrentPosition to get a fast first fix and
    // ensure driver_locations is updated on app launch before watchPosition fires
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        retryCountRef.current = 0; // reset retry counter on success
        setError(null);
        broadcastLocation(pos); // immediate launch-time insert

        // Now start the continuous watch
        watchRef.current = navigator.geolocation.watchPosition(
          (watchPos) => {
            retryCountRef.current = 0;
            broadcastLocation(watchPos);
          },
          handleWatchError,
          { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
        );

        // Periodic fallback every intervalMs (ensures updates even if watchPosition stalls)
        intervalRef.current = setInterval(() => {
          navigator.geolocation.getCurrentPosition(
            broadcastLocation,
            (err) => {
              if (err.code !== err.PERMISSION_DENIED) {
                // Non-fatal periodic failure — just log, watchPosition handles retries
                console.warn('[GPS] Periodic fallback error:', err.message);
              }
            },
            { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
          );
        }, intervalMs);

        setIsTracking(true);
        isStartingRef.current = false;

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
      },
      (err) => {
        isStartingRef.current = false;
        if (err.code === err.PERMISSION_DENIED) {
          setPermissionState('denied');
          setError('Location permission denied. Please enable in browser settings.');
          setIsTracking(false);
        } else {
          // POSITION_UNAVAILABLE or TIMEOUT — retry
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

    // Check permission API if available
    if ('permissions' in navigator) {
      try {
        const result = await navigator.permissions.query({ name: 'geolocation' });
        setPermissionState(result.state as 'prompt' | 'granted' | 'denied');

        if (result.state === 'denied') {
          setError('Location permission denied. Please enable in browser/device settings.');
          return false;
        }

        // If already granted, no need to prompt — just return true
        if (result.state === 'granted') {
          return true;
        }

        // Listen for permission changes (e.g. user enables GPS in settings)
        result.addEventListener('change', () => {
          setPermissionState(result.state as 'prompt' | 'granted' | 'denied');
          if (result.state === 'denied') {
            setError('Location permission was revoked.');
            stopTracking();
          } else if (result.state === 'granted') {
            setError(null);
          }
        });
      } catch {
        // Permissions API not fully supported — proceed to prompt via getCurrentPosition
      }
    }

    // Prompt the user via getCurrentPosition
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setPermissionState('granted');
          setError(null);
          broadcastLocation(pos); // fire first location insert immediately on permission grant
          resolve(true);
        },
        (err) => {
          if (err.code === err.PERMISSION_DENIED) {
            setPermissionState('denied');
            setError('Location permission denied. Please enable in browser/device settings.');
          } else {
            setError('Could not get location. Please try again.');
          }
          resolve(false);
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    });
  }, [broadcastLocation, stopTracking]);

  // Auto-start on mount when enabled and driverId is available
  useEffect(() => {
    if (!enabled || !driverId) {
      stopTracking();
      return;
    }

    // Check current permission state first to avoid unnecessary prompts
    const initGps = async () => {
      if (!('geolocation' in navigator)) {
        setPermissionState('unsupported');
        return;
      }

      if ('permissions' in navigator) {
        try {
          const result = await navigator.permissions.query({ name: 'geolocation' });
          setPermissionState(result.state as 'prompt' | 'granted' | 'denied');

          if (result.state === 'denied') {
            setError('Location permission denied. Please enable in browser/device settings.');
            return;
          }

          if (result.state === 'granted') {
            // Permission already granted — start tracking immediately without re-prompting
            startTracking();
            return;
          }

          // 'prompt' state — don't auto-prompt on mount; wait for user interaction
          // The StatusBanner in the UI will guide the user to tap "Enable GPS"
          return;
        } catch {
          // Permissions API unavailable — fall through to attempt tracking
        }
      }

      // Permissions API not available — attempt to start (will prompt if needed)
      startTracking();
    };

    initGps();

    return () => stopTracking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, driverId]);

  return { position, permissionState, isTracking, error, requestPermission, startTracking, stopTracking };
}
