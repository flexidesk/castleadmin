'use client';

import { useEffect, useState, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import KPIBentoGrid from './components/KPIBentoGrid';
import BookingVolumeChart from './components/BookingVolumeChart';
import OrdersTable from './components/OrdersTable';
import DriverLocationMap from './components/DriverLocationMap';
import AlertsWidget from './components/AlertsWidget';
import DashboardAlertBanner from './components/DashboardAlertBanner';
import RouteOptimizationPanel from './components/RouteOptimizationPanel';
import { ordersService, AppDriver } from '@/lib/services/ordersService';
import { createClient } from '@/lib/supabase/client';
import { ChevronDown, LayoutDashboard, Map, Table2, BarChart2, Bell, Navigation } from 'lucide-react';
import Icon from '@/components/ui/AppIcon';


// Collapsible section wrapper for mobile
function CollapsibleSection({
  title,
  icon: Icon,
  defaultOpen = true,
  children,
}: {
  title: string;
  icon: React.ElementType;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="space-y-3">
      {/* Mobile toggle header — hidden on xl+ */}
      <button
        className="xl:hidden w-full flex items-center justify-between px-4 py-3 rounded-xl border touch-manipulation"
        style={{
          backgroundColor: 'hsl(var(--card))',
          borderColor: 'hsl(var(--border))',
        }}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          <Icon size={15} style={{ color: 'hsl(var(--primary))' }} />
          <span className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
            {title}
          </span>
        </div>
        <ChevronDown
          size={16}
          className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          style={{ color: 'hsl(var(--muted-foreground))' }}
        />
      </button>

      {/* Content: always visible on xl+, collapsible on mobile */}
      <div className={`${open ? 'block' : 'hidden'} xl:block`}>{children}</div>
    </div>
  );
}

export default function OrdersDashboardPage() {
  const [notificationCount, setNotificationCount] = useState(0);

  return (
    <AppLayout
      title="Bookings Dashboard"
      subtitle="Today's operations overview"
      notificationCount={notificationCount}
    >
      <div className="space-y-4 md:space-y-6">
        {/* Alert banner — always visible */}
        <DashboardAlertBanner onCountChange={setNotificationCount} />

        {/* KPI Grid */}
        <CollapsibleSection title="Key Metrics" icon={LayoutDashboard} defaultOpen={true}>
          <KPIBentoGrid />
        </CollapsibleSection>

        {/* Charts + Driver Status */}
        <CollapsibleSection title="Charts & Driver Status" icon={BarChart2} defaultOpen={true}>
          <div className="grid grid-cols-1 xl:grid-cols-3 2xl:grid-cols-3 gap-4 md:gap-6">
            <div className="xl:col-span-2">
              <BookingVolumeChart />
            </div>
            <div>
              <DriverStatusPanel />
            </div>
          </div>
        </CollapsibleSection>

        {/* Alerts */}
        <CollapsibleSection title="Alerts" icon={Bell} defaultOpen={true}>
          <AlertsWidget />
        </CollapsibleSection>

        {/* Route Optimisation */}
        <CollapsibleSection title="Route Optimisation" icon={Navigation} defaultOpen={true}>
          <RouteOptimizationPanel />
        </CollapsibleSection>

        {/* Live Driver Map */}
        <CollapsibleSection title="Live Driver Tracking" icon={Map} defaultOpen={true}>
          <DriverLocationMap />
        </CollapsibleSection>

        {/* Bookings Table */}
        <CollapsibleSection title="Bookings Table" icon={Table2} defaultOpen={true}>
          <OrdersTable />
        </CollapsibleSection>
      </div>
    </AppLayout>
  );
}

function DriverStatusPanel() {
  const [drivers, setDrivers] = useState<AppDriver[]>([]);
  const [loading, setLoading] = useState(true);

  const loadDrivers = useCallback(async () => {
    const data = await ordersService.fetchDrivers();
    setDrivers(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadDrivers();

    const supabase = createClient();
    const channel = supabase
      .channel('driver_status_panel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers' }, () => {
        loadDrivers();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [loadDrivers]);

  const statusColor: Record<string, string> = {
    Available: 'hsl(142 69% 35%)',
    'On Route': 'hsl(24 95% 53%)',
    'Off Duty': 'hsl(var(--muted-foreground))',
  };

  const statusBg: Record<string, string> = {
    Available: 'hsl(142 69% 35% / 0.1)',
    'On Route': 'hsl(24 95% 53% / 0.1)',
    'Off Duty': 'hsl(var(--muted) / 0.5)',
  };

  const availableCount = drivers.filter((d) => d.status === 'Available').length;

  return (
    <div className="card p-4 md:p-5 h-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
          Driver Status
        </h3>
        <span className="text-xs font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>
          {loading ? '—' : `${availableCount} available`}
        </span>
      </div>
      <div className="space-y-2.5">
        {loading
          ? Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg border" style={{ borderColor: 'hsl(var(--border))' }}>
                <div className="w-8 h-8 rounded-full animate-pulse" style={{ backgroundColor: 'hsl(var(--secondary))' }} />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 rounded animate-pulse w-3/4" style={{ backgroundColor: 'hsl(var(--secondary))' }} />
                  <div className="h-2.5 rounded animate-pulse w-1/2" style={{ backgroundColor: 'hsl(var(--secondary))' }} />
                </div>
                <div className="h-5 w-16 rounded-full animate-pulse" style={{ backgroundColor: 'hsl(var(--secondary))' }} />
              </div>
            ))
          : drivers.map((driver) => (
              <div key={driver.id} className="flex items-center gap-3 p-2.5 rounded-lg border" style={{ borderColor: 'hsl(var(--border))' }}>
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0"
                  style={{ backgroundColor: 'hsl(var(--primary) / 0.1)', color: 'hsl(var(--primary))' }}
                >
                  {driver.avatar}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{driver.name}</p>
                  <p className="text-[10px] truncate" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    {driver.vehicle} · {driver.plate}
                  </p>
                </div>
                <span
                  className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0"
                  style={{
                    backgroundColor: statusBg[driver.status] ?? 'hsl(var(--secondary))',
                    color: statusColor[driver.status] ?? 'hsl(var(--muted-foreground))',
                  }}
                >
                  {driver.status}
                </span>
              </div>
            ))}
      </div>
    </div>
  );
}