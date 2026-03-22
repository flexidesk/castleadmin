'use client';

import PublicDriverPortal from './components/PublicDriverPortal';
import PWAInstallPrompt from './components/PWAInstallPrompt';

export default function DriverPortalPage() {
  return (
    <>
      <PublicDriverPortal />
      <PWAInstallPrompt />
    </>
  );
}
