'use client';

import { useEffect } from 'react';
import PublicDriverPortal from './components/PublicDriverPortal';
import PWAInstallPrompt from './components/PWAInstallPrompt';

function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    navigator.serviceWorker?.register('/sw.js', { scope: '/driver-portal/' })?.then((registration) => {
        // Check for updates
        registration?.addEventListener('updatefound', () => {
          const newWorker = registration?.installing;
          if (newWorker) {
            newWorker?.addEventListener('statechange', () => {
              if (newWorker?.state === 'installed' && navigator.serviceWorker?.controller) {
                // New SW available — send skip waiting
                newWorker?.postMessage({ type: 'SKIP_WAITING' });
              }
            });
          }
        });
      })?.catch(() => {
        // SW registration failed silently
      });
  }, []);

  return null;
}

export default function DriverPortalPage() {
  return (
    <>
      <ServiceWorkerRegistrar />
      <PublicDriverPortal />
      <PWAInstallPrompt />
    </>
  );
}
