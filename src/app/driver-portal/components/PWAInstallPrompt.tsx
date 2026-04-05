'use client';

import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type Platform = 'android-chrome' | 'ios' | 'other';

function detectPlatform(): Platform {
  if (typeof window === 'undefined') return 'other';
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  if (/android/.test(ua)) return 'android-chrome';
  return 'other';
}

function isRunningAsPwa(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true
  );
}

interface PermissionStatus {
  notifications: NotificationPermission | 'unsupported';
  geolocation: 'granted' | 'denied' | 'prompt' | 'unsupported';
}

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [platform, setPlatform] = useState<Platform>('other');
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [showPermissionsDialog, setShowPermissionsDialog] = useState(false);
  const [permissions, setPermissions] = useState<PermissionStatus>({
    notifications: 'default',
    geolocation: 'prompt',
  });
  const [requestingPermissions, setRequestingPermissions] = useState(false);

  // Check current permission states
  const checkPermissions = async (): Promise<PermissionStatus> => {
    const status: PermissionStatus = {
      notifications: 'default',
      geolocation: 'prompt',
    };

    // Notifications
    if (!('Notification' in window)) {
      status.notifications = 'unsupported';
    } else {
      status.notifications = Notification.permission;
    }

    // Geolocation
    if (!('geolocation' in navigator)) {
      status.geolocation = 'unsupported';
    } else if ('permissions' in navigator) {
      try {
        const geo = await navigator.permissions.query({ name: 'geolocation' });
        status.geolocation = geo.state as 'granted' | 'denied' | 'prompt';
      } catch {
        status.geolocation = 'prompt';
      }
    }

    return status;
  };

  const requestAllPermissions = async () => {
    setRequestingPermissions(true);
    try {
      // Request notifications
      if ('Notification' in window && Notification.permission === 'default') {
        await Notification.requestPermission();
      }

      // Request geolocation (triggers browser prompt)
      if ('geolocation' in navigator) {
        await new Promise<void>((resolve) => {
          navigator.geolocation.getCurrentPosition(
            () => resolve(),
            () => resolve(),
            { enableHighAccuracy: true, timeout: 10000 }
          );
        });
      }

      // Re-check after requesting
      const updated = await checkPermissions();
      setPermissions(updated);
    } finally {
      setRequestingPermissions(false);
      setShowPermissionsDialog(false);
    }
  };

  useEffect(() => {
    const p = detectPlatform();
    setPlatform(p);

    const pwa = isRunningAsPwa();
    setIsInstalled(pwa);

    // On app launch (especially as PWA), check permissions and prompt if needed
    const initPermissions = async () => {
      const current = await checkPermissions();
      setPermissions(current);

      const needsNotifications = current.notifications === 'default';
      const needsGeolocation = current.geolocation === 'prompt';

      // Show permissions dialog if any permission hasn't been asked yet
      if ((needsNotifications || needsGeolocation) && !sessionStorage.getItem('permissions-asked')) {
        // Small delay so the page renders first
        setTimeout(() => setShowPermissionsDialog(true), 1500);
      }
    };

    initPermissions();

    if (pwa) return; // Already installed — don't show install banner

    // Check if dismissed this session
    if (sessionStorage.getItem('pwa-banner-dismissed')) return;

    if (p === 'ios') {
      setTimeout(() => setShowBanner(true), 4000);
      return;
    }

    // Android Chrome: listen for native install prompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setTimeout(() => setShowBanner(true), 3000);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
    setShowBanner(false);
  };

  const handleDismiss = () => {
    setShowBanner(false);
    setShowIosGuide(false);
    sessionStorage.setItem('pwa-banner-dismissed', 'true');
  };

  const handlePermissionsDismiss = () => {
    setShowPermissionsDialog(false);
    sessionStorage.setItem('permissions-asked', 'true');
  };

  // ── Permissions Dialog ──────────────────────────────────────────────────────
  if (showPermissionsDialog) {
    const notifGranted = permissions.notifications === 'granted';
    const geoGranted = permissions.geolocation === 'granted';

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
        <div
          className="rounded-2xl shadow-2xl p-6 w-full max-w-sm"
          style={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
        >
          <div className="text-center mb-5">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3"
              style={{ backgroundColor: 'hsl(var(--primary) / 0.15)' }}
            >
              <svg className="w-7 h-7" style={{ color: 'hsl(var(--primary))' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h2 className="text-base font-bold" style={{ color: 'hsl(var(--foreground))' }}>
              Enable Required Permissions
            </h2>
            <p className="text-xs mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
              The Driver Portal needs these permissions to work correctly
            </p>
          </div>

          <div className="space-y-3 mb-5">
            {/* Notifications */}
            <div
              className="flex items-start gap-3 p-3 rounded-xl"
              style={{ backgroundColor: 'hsl(var(--secondary))' }}
            >
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                style={{ backgroundColor: notifGranted ? 'hsl(142 69% 35% / 0.15)' : 'hsl(38 92% 50% / 0.15)' }}
              >
                <svg className="w-5 h-5" style={{ color: notifGranted ? 'hsl(142 69% 35%)' : 'hsl(38 92% 50%)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>Push Notifications</p>
                <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  Get notified instantly when a new booking is assigned to you
                </p>
                {notifGranted && (
                  <span className="text-xs font-medium" style={{ color: 'hsl(142 69% 35%)' }}>✓ Granted</span>
                )}
                {permissions.notifications === 'denied' && (
                  <span className="text-xs font-medium" style={{ color: 'hsl(0 84% 60%)' }}>✗ Denied — enable in browser settings</span>
                )}
              </div>
            </div>

            {/* Geolocation */}
            <div
              className="flex items-start gap-3 p-3 rounded-xl"
              style={{ backgroundColor: 'hsl(var(--secondary))' }}
            >
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                style={{ backgroundColor: geoGranted ? 'hsl(142 69% 35% / 0.15)' : 'hsl(217 91% 60% / 0.15)' }}
              >
                <svg className="w-5 h-5" style={{ color: geoGranted ? 'hsl(142 69% 35%)' : 'hsl(217 91% 60%)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>GPS Location</p>
                <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  Share your real-time location with dispatch for live tracking
                </p>
                {geoGranted && (
                  <span className="text-xs font-medium" style={{ color: 'hsl(142 69% 35%)' }}>✓ Granted</span>
                )}
                {permissions.geolocation === 'denied' && (
                  <span className="text-xs font-medium" style={{ color: 'hsl(0 84% 60%)' }}>✗ Denied — enable in device settings</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {(permissions.notifications === 'default' || permissions.geolocation === 'prompt') && (
              <button
                onClick={requestAllPermissions}
                disabled={requestingPermissions}
                className="w-full py-3 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2"
                style={{ backgroundColor: 'hsl(var(--primary))', color: 'white' }}
              >
                {requestingPermissions ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Requesting...
                  </>
                ) : (
                  'Allow Permissions'
                )}
              </button>
            )}
            <button
              onClick={handlePermissionsDismiss}
              className="w-full py-2.5 rounded-xl text-sm transition-colors"
              style={{ color: 'hsl(var(--muted-foreground))' }}
            >
              {notifGranted && geoGranted ? 'Continue' : 'Skip for now'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (isInstalled) return null;

  // iOS guide modal
  if (platform === 'ios' && showBanner && showIosGuide) {
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center p-4 bg-black/50">
        <div className="bg-slate-800 text-white rounded-2xl shadow-2xl p-5 w-full max-w-sm">
          <div className="flex items-center justify-between mb-4">
            <p className="font-bold text-base">Install Driver Portal</p>
            <button onClick={handleDismiss} className="text-slate-400 hover:text-white">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <ol className="space-y-3 text-sm text-slate-300">
            <li className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center shrink-0 mt-0.5">1</span>
              <span>Tap the <strong className="text-white">Share</strong> button at the bottom of your browser</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center shrink-0 mt-0.5">2</span>
              <span>Scroll down and tap <strong className="text-white">"Add to Home Screen"</strong></span>
            </li>
            <li className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center shrink-0 mt-0.5">3</span>
              <span>Tap <strong className="text-white">Add</strong> to install the app</span>
            </li>
          </ol>
          <button
            onClick={handleDismiss}
            className="mt-4 w-full bg-blue-600 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-blue-700 transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    );
  }

  if (!showBanner) return null;

  // Android Chrome: native install prompt
  if (platform === 'android-chrome' && deferredPrompt) {
    return (
      <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-sm">
        <div className="bg-blue-600 text-white rounded-xl shadow-2xl p-4 flex items-start gap-3">
          <div className="flex-shrink-0 w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">Install Driver Portal</p>
            <p className="text-xs text-blue-100 mt-0.5">Add to your home screen for GPS tracking &amp; push notifications</p>
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleInstall}
                className="bg-white text-blue-600 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
              >
                Install
              </button>
              <button
                onClick={handleDismiss}
                className="text-blue-100 text-xs px-3 py-1.5 rounded-lg hover:text-white transition-colors"
              >
                Not now
              </button>
            </div>
          </div>
          <button onClick={handleDismiss} className="flex-shrink-0 text-blue-200 hover:text-white">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  // iOS: show install hint banner
  if (platform === 'ios') {
    return (
      <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-sm">
        <div className="bg-slate-800 text-white rounded-xl shadow-2xl p-4 flex items-start gap-3">
          <div className="flex-shrink-0 w-10 h-10 bg-blue-600/30 rounded-lg flex items-center justify-center">
            <svg className="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">Install Driver Portal</p>
            <p className="text-xs text-slate-400 mt-0.5">Add to your home screen for the best experience</p>
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => setShowIosGuide(true)}
                className="bg-blue-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors"
              >
                How to install
              </button>
              <button
                onClick={handleDismiss}
                className="text-slate-400 text-xs px-3 py-1.5 rounded-lg hover:text-white transition-colors"
              >
                Not now
              </button>
            </div>
          </div>
          <button onClick={handleDismiss} className="flex-shrink-0 text-slate-500 hover:text-white">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  return null;
}
