'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import ToastNotificationProvider from './ToastNotificationProvider';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useAuth } from '@/contexts/AuthContext';

interface AppLayoutProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  notificationCount?: number;
}

export default function AppLayout({ children, title, subtitle, notificationCount }: AppLayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, loading } = useAuth();
  const router = useRouter();

  usePushNotifications();

  useEffect(() => {
    if (window.innerWidth < 1024) {
      setCollapsed(true);
    }
    setMounted(true);

    const handleResize = () => {
      if (window.innerWidth < 1024) {
        setCollapsed(true);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [loading, user, router]);

  if (!mounted || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'hsl(var(--background))' }}>
        <div className="flex flex-col items-center gap-3">
          <svg className="animate-spin h-8 w-8" style={{ color: 'hsl(var(--primary))' }} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>Loading...</span>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'hsl(var(--background))' }}>
      <ToastNotificationProvider />
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      <Topbar sidebarCollapsed={collapsed} title={title} subtitle={subtitle} notificationCount={notificationCount} />

      <main
        className="transition-all duration-300 pt-[65px]"
        style={{ marginLeft: collapsed ? '64px' : '240px' }}
      >
        <div className="px-6 lg:px-8 xl:px-10 2xl:px-12 py-6 max-w-screen-2xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}