'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import AppLogo from '@/components/ui/AppLogo';
import { LayoutDashboard, PackageSearch, Plus, Truck, Users, MapPin, BarChart3, Settings, ChevronLeft, ChevronRight, Bell, LogOut, Smartphone, TrendingUp, ClipboardList, Search, ShieldCheck, FileText, PoundSterling, Mail, History, CalendarClock, Radio, Layers, Wallet, Webhook } from 'lucide-react';
import Icon from '@/components/ui/AppIcon';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  badge?: number;
  group?: string;
}

const navItems: NavItem[] = [
  { label: 'Bookings Dashboard', href: '/orders-dashboard', icon: LayoutDashboard, group: 'Operations' },
  { label: 'Create Booking', href: '/create-order', icon: Plus, group: 'Operations' },
  { label: 'Booking Detail', href: '/order-detail', icon: PackageSearch, group: 'Operations' },
  { label: 'Live Tracking', href: '/admin-live-tracking', icon: MapPin, badge: 3, group: 'Operations' },
  { label: 'Driver Tracking', href: '/driver-tracking', icon: Radio, group: 'Operations' },
  { label: 'Customer Tracking', href: '/track', icon: Search, group: 'Operations' },
  { label: 'Driver Portal', href: '/driver-portal', icon: Smartphone, group: 'Fleet' },
  { label: 'Driver Performance', href: '/driver-performance', icon: TrendingUp, group: 'Fleet' },
  { label: 'Driver Earnings', href: '/driver-earnings', icon: PoundSterling, group: 'Fleet' },
  { label: 'Cash Management', href: '/cash-management', icon: Wallet, group: 'Fleet' },
  { label: 'Driver Shifts', href: '/driver-shifts', icon: CalendarClock, group: 'Fleet' },
  { label: 'Drivers', href: '/drivers', icon: Truck, group: 'Fleet' },
  { label: 'Delivery Zones', href: '/delivery-zones', icon: Layers, group: 'Fleet' },
  { label: 'Staff', href: '/staff', icon: Users, group: 'Fleet' },
  { label: 'Driver Management', href: '/driver-management', icon: Truck, group: 'Fleet' },
  { label: 'Customers', href: '/customer-management', icon: Users, group: 'Fleet' },
  { label: 'Activity Log', href: '/activity-log', icon: ClipboardList, group: 'Reports' },
  { label: 'Analytics', href: '/analytics', icon: BarChart3, group: 'Reports' },
  { label: 'Reports', href: '/reports', icon: FileText, group: 'Reports' },
  { label: 'Notifications', href: '/notifications', icon: Bell, group: 'Reports' },
  { label: 'Message Templates', href: '/message-templates', icon: Mail, group: 'Reports' },
  { label: 'Alert History', href: '/alert-history', icon: History, group: 'Reports' },
  { label: 'Webhook Event Logs', href: '/webhook-event-logs', icon: Webhook, group: 'Reports' },
  { label: 'Admin Users', href: '/admin-users', icon: ShieldCheck, group: 'System' },
  { label: 'Settings', href: '/settings', icon: Settings, group: 'System' },
];

const groups = ['Operations', 'Fleet', 'Reports', 'System'];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOut } = useAuth();

  const handleSignOut = async () => {
    try {
      await signOut();
      toast.success('Signed out successfully');
      router.push('/login');
      router.refresh();
    } catch {
      toast.error('Failed to sign out');
    }
  };

  const userInitials = user?.user_metadata?.full_name
    ? user.user_metadata.full_name
        .split(' ')
        .map((n: string) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : user?.email?.slice(0, 2).toUpperCase() ?? 'SA';

  const userName = user?.user_metadata?.full_name || user?.email || 'Admin User';
  const userRole = 'Operations Manager';

  return (
    <aside
      className="fixed left-0 top-0 h-full z-30 flex flex-col border-r transition-all duration-300 ease-in-out"
      style={{
        width: collapsed ? '64px' : '240px',
        backgroundColor: 'hsl(var(--card))',
        borderColor: 'hsl(var(--border))',
      }}
    >
      {/* Logo */}
      <div
        className="flex items-center border-b px-3 py-4 overflow-hidden"
        style={{ borderColor: 'hsl(var(--border))', minHeight: '65px' }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <AppLogo size={32} />
          {!collapsed && (
            <span
              className="font-semibold text-base whitespace-nowrap overflow-hidden transition-all duration-300"
              style={{ color: 'hsl(var(--primary))' }}
            >
              CastleAdmin
            </span>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3 scrollbar-thin">
        {groups.map((group) => {
          const items = navItems.filter((i) => i.group === group);
          return (
            <div key={group} className="mb-1">
              {!collapsed && (
                <p
                  className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest"
                  style={{ color: 'hsl(var(--muted-foreground))' }}
                >
                  {group}
                </p>
              )}
              {collapsed && group !== 'Operations' && (
                <div className="mx-3 my-2 border-t" style={{ borderColor: 'hsl(var(--border))' }} />
              )}
              {items.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href || (item.href !== '/orders-dashboard' && pathname.startsWith(item.href));
                const isExactActive = pathname === item.href;

                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    className={`sidebar-nav-item mx-2 my-0.5 group relative ${isExactActive ? 'active' : ''}`}
                    style={collapsed ? { justifyContent: 'center', padding: '10px' } : {}}
                    title={collapsed ? item.label : undefined}
                  >
                    <Icon size={18} className="shrink-0" />
                    {!collapsed && (
                      <span className="flex-1 truncate">{item.label}</span>
                    )}
                    {!collapsed && item.badge && (
                      <span
                        className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                        style={{
                          backgroundColor: 'hsl(var(--destructive) / 0.1)',
                          color: 'hsl(var(--destructive))',
                        }}
                      >
                        {item.badge}
                      </span>
                    )}
                    {collapsed && item.badge && (
                      <span
                        className="absolute top-1 right-1 w-2 h-2 rounded-full"
                        style={{ backgroundColor: 'hsl(var(--destructive))' }}
                      />
                    )}
                    {/* Tooltip for collapsed */}
                    {collapsed && (
                      <div
                        className="absolute left-full ml-2 px-2 py-1 rounded-md text-xs font-medium whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-150 z-50"
                        style={{
                          backgroundColor: 'hsl(var(--foreground))',
                          color: 'hsl(var(--background))',
                        }}
                      >
                        {item.label}
                        {item.badge ? ` (${item.badge})` : ''}
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="border-t p-2 space-y-1" style={{ borderColor: 'hsl(var(--border))' }}>
        <Link
          href="/notifications"
          className="sidebar-nav-item w-full group relative"
          style={collapsed ? { justifyContent: 'center', padding: '10px' } : {}}
          title={collapsed ? 'Notifications' : undefined}
        >
          <Bell size={18} className="shrink-0" />
          {!collapsed && <span className="flex-1 text-left">Notifications</span>}
          {collapsed && (
            <div
              className="absolute left-full ml-2 px-2 py-1 rounded-md text-xs font-medium whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-150 z-50"
              style={{ backgroundColor: 'hsl(var(--foreground))', color: 'hsl(var(--background))' }}
            >
              Notifications
            </div>
          )}
        </Link>

        {!collapsed && (
          <div
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg"
            style={{ backgroundColor: 'hsl(var(--secondary))' }}
          >
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0"
              style={{ backgroundColor: 'hsl(var(--primary))', color: 'white' }}
            >
              {userInitials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold truncate">{userName}</p>
              <p className="text-[10px] truncate" style={{ color: 'hsl(var(--muted-foreground))' }}>
                {userRole}
              </p>
            </div>
            <button onClick={handleSignOut} className="shrink-0 hover:text-destructive transition-colors" title="Sign out">
              <LogOut size={14} />
            </button>
          </div>
        )}

        {collapsed && (
          <button
            className="sidebar-nav-item w-full group relative"
            style={{ justifyContent: 'center', padding: '10px' }}
            title={userName}
          >
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold"
              style={{ backgroundColor: 'hsl(var(--primary))', color: 'white' }}
            >
              {userInitials}
            </div>
            <div
              className="absolute left-full ml-2 px-2 py-1 rounded-md text-xs font-medium whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-150 z-50"
              style={{ backgroundColor: 'hsl(var(--foreground))', color: 'hsl(var(--background))' }}
            >
              {userName}
            </div>
          </button>
        )}

        {/* Collapse toggle */}
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-center p-2 rounded-lg transition-all duration-150 hover:bg-secondary"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <ChevronRight size={16} style={{ color: 'hsl(var(--muted-foreground))' }} />
          ) : (
            <div className="flex items-center gap-2 w-full px-1">
              <ChevronLeft size={16} style={{ color: 'hsl(var(--muted-foreground))' }} />
              <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                Collapse
              </span>
            </div>
          )}
        </button>
      </div>
    </aside>
  );
}