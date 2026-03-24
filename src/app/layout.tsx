import type { Metadata } from 'next';
import '../styles/tailwind.css';
import { Toaster } from 'sonner';
import { AuthProvider } from '@/contexts/AuthContext';

export const metadata: Metadata = {
  title: 'CastleAdmin — Bouncy Castle Delivery Management',
  description:
    'Operations dashboard for managing bouncy castle delivery bookings, drivers, and proof of delivery.',
  icons: {
    icon: '/favicon.ico',
    apple: '/icons/icon-192x192.png',
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
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />

        <script type="module" async src="https://static.rocket.new/rocket-web.js?_cfg=https%3A%2F%2Fcastleadmi7836back.builtwithrocket.new&_be=https%3A%2F%2Fappanalytics.rocket.new&_v=0.1.17" />
        <script type="module" defer src="https://static.rocket.new/rocket-shot.js?v=0.0.2" /></head>
      <body className="font-sans antialiased" suppressHydrationWarning>
        <AuthProvider>
          {children}
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

        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.getRegistrations().then(function(regs) {
                    regs.forEach(function(r) {
                      if (r.scope === location.origin + '/') r.unregister();
                    });
                  });
                  navigator.serviceWorker.register('/sw.js', { scope: '/driver-portal' })
                    .then(function(reg) { console.log('SW registered:', reg.scope); })
                    .catch(function(err) { console.log('SW registration failed:', err); });
                });
              }
            `,
          }}
        />
</body>
    </html>
  );
}