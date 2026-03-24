'use client';

import { useState, useEffect } from 'react';
import { Bell, RefreshCw } from 'lucide-react';

interface TopbarProps {
  sidebarCollapsed: boolean;
  title?: string;
  subtitle?: string;
  notificationCount?: number;
}

export default function Topbar({ sidebarCollapsed, title, subtitle, notificationCount = 0 }: TopbarProps) {
  const [searchFocused, setSearchFocused] = useState(false);
  const [dateStr, setDateStr] = useState('');

  useEffect(() => {
    setDateStr(
      new Date().toLocaleDateString('en-GB', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      })
    );
  }, []);

  return (
    <header
      className="fixed top-0 right-0 z-20 flex items-center gap-4 px-6 border-b transition-all duration-300"
      style={{
        left: sidebarCollapsed ? '64px' : '240px',
        height: '65px',
        backgroundColor: 'hsl(var(--card))',
        borderColor: 'hsl(var(--border))',
      }}
    >
      {/* Left: Page title */}
      <div className="flex-1 min-w-0">
        {title && (
          <div>
            <h1 className="text-lg font-semibold truncate" style={{ color: 'hsl(var(--foreground))' }}>
              {title}
            </h1>
            {subtitle && (
              <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                {subtitle}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-3">
        {/* Live indicator */}
        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full border" style={{ borderColor: 'hsl(var(--border))' }}>
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Live
          </span>
        </div>

        {/* Date */}
        <p className="hidden md:block text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
          {dateStr}
        </p>

        {/* Refresh */}
        <button
          className="p-2 rounded-lg hover:bg-secondary transition-all duration-150"
          title="Refresh data"
        >
          <RefreshCw size={16} style={{ color: 'hsl(var(--muted-foreground))' }} />
        </button>

        {/* Notifications */}
        <button
          className="relative p-2 rounded-lg hover:bg-secondary transition-all duration-150"
          title="Notifications"
        >
          <Bell size={16} style={{ color: 'hsl(var(--muted-foreground))' }} />
          {notificationCount > 0 ? (
            <span
              className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-[10px] font-bold leading-none px-1"
              style={{ backgroundColor: 'hsl(0 84% 45%)', color: '#fff' }}
            >
              {notificationCount > 99 ? '99+' : notificationCount}
            </span>
          ) : (
            <span
              className="absolute top-1 right-1 w-2 h-2 rounded-full"
              style={{ backgroundColor: 'hsl(var(--destructive))' }}
            />
          )}
        </button>
      </div>
    </header>
  );
}