'use client';

import { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import ToastNotificationProvider from './ToastNotificationProvider';
import { usePushNotifications } from '@/hooks/usePushNotifications';

interface AppLayoutProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  notificationCount?: number;
}

export default function AppLayout({ children, title, subtitle, notificationCount }: AppLayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Enable browser push notifications for orders, status changes, and payments
  usePushNotifications();

  // Collapse on smaller screens automatically
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) {
        setCollapsed(true);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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