import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'Castle Driver Portal',
  description: 'Manage your deliveries, update order status, and upload proof of delivery.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Driver Portal',
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    type: 'website',
    title: 'Castle Driver Portal',
    description: 'Manage your deliveries on the go.',
  },
};

export const viewport: Viewport = {
  themeColor: '#3b82f6',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function DriverPortalLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
