import type { Metadata } from 'next';
import '../styles/tailwind.css';
import { Toaster } from 'sonner';
import { AuthProvider } from '@/contexts/AuthContext';
import { BrandingProvider } from '@/contexts/BrandingContext';

export const metadata: Metadata = {
  title: 'CastleAdmin — Bouncy Castle Delivery Management',
  description:
    'Operations dashboard for managing bouncy castle delivery bookings, drivers, and proof of delivery.',
  icons: {
    icon: '/assets/images/6d6fa2b6-1585-446c-829f-98f77a217c48-e1773489759386-rkhuhl202e5c61bjljl69lmhxq0maylfx3zbtm0qdm-1775404153876.ico',
    apple: '/assets/images/6d6fa2b6-1585-446c-829f-98f77a217c48-e1773489759386-rkhuhl202e5c61bjljl69lmhxq0maylfx3zbtm0qdm-1775404153876.ico',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Driver Portal" />
        <link rel="apple-touch-icon" href="/assets/images/6d6fa2b6-1585-446c-829f-98f77a217c48-e1773489759386-rkhuhl202e5c61bjljl69lmhxq0maylfx3zbtm0qdm-1775404153876.ico" />

        <script type="module" async src="https://static.rocket.new/rocket-web.js?_cfg=https%3A%2F%2Fcastleadmi7836back.builtwithrocket.new&_be=https%3A%2F%2Fappanalytics.rocket.new&_v=0.1.17" />
        <script type="module" defer src="https://static.rocket.new/rocket-shot.js?v=0.0.2" /></head>
      <body className="font-sans antialiased" suppressHydrationWarning>
        <AuthProvider>
          <BrandingProvider>
          {children}
          </BrandingProvider>
          <Toaster
            position="bottom-right"
            richColors
            closeButton
            toastOptions={{
              duration: 3500,
              classNames: {
                toast: 'font-sans text-sm',
              },
            }}
          />
        </AuthProvider>
</body>
    </html>
  );
}