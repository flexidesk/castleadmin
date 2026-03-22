'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  ArrowRight,
  RefreshCw,
  Filter,
  Search,
  Package,
  Truck,
  Clock,
  User,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import Icon from '@/components/ui/AppIcon';


// ─── Types ────────────────────────────────────────────────────────────────────

interface ActivityLog {
  id: string;
  entity_type: 'order' | 'driver';
  entity_id: string;
  entity_label: string | null;
  action: string;
  field_changed: string | null;
  old_value: string | null;
  new_value: string | null;
  changed_by: string | null;
  changed_by_user_id: string | null;
  notes: string | null;
  created_at: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ACTION_LABELS: Record<string, string> = {
  status_changed: 'Status Changed',
  driver_assigned: 'Driver Assigned',
  availability_changed: 'Availability Changed',
  payment_updated: 'Payment Updated',
  pod_submitted: 'POD Submitted',
  order_created: 'Order Created',
  order_cancelled: 'Order Cancelled',
};

const STATUS_COLORS: Record<string, string> = {
  'Booking Accepted': 'bg-blue-100 text-blue-700',
  'Booking Assigned': 'bg-purple-100 text-purple-700',
  'Booking Out For Delivery': 'bg-yellow-100 text-yellow-700',
  'Booking Complete': 'bg-green-100 text-green-700',
  'Booking Cancelled': 'bg-red-100 text-red-700',
  Available: 'bg-green-100 text-green-700',
  'On Route': 'bg-yellow-100 text-yellow-700',
  'Off Duty': 'bg-gray-100 text-gray-600',
  Paid: 'bg-green-100 text-green-700',
  Unpaid: 'bg-red-100 text-red-700',
  Partial: 'bg-orange-100 text-orange-700',
};

function StatusPill({ value }: { value: string | null }) {
  if (!value) return <span className="text-sm italic" style={{ color: 'hsl(var(--muted-foreground))' }}>—</span>;
  const cls = STATUS_COLORS[value] ?? 'bg-gray-100 text-gray-600';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {value}
    </span>
  );
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const PAGE_SIZE = 20;

// ─── Component ────────────────────────────────────────────────────────────────

export default function ActivityLogContent() {
  const supabase = createClient();

  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'order' | 'driver'>('all');
  const [filterAction, setFilterAction] = useState('all');
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let query = supabase
        .from('activity_logs')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      if (filterType !== 'all') query = query.eq('entity_type', filterType);
      if (filterAction !== 'all') query = query.eq('action', filterAction);
      if (search.trim()) {
        query = query.or(
          `entity_label.ilike.%${search}%,changed_by.ilike.%${search}%,entity_id.ilike.%${search}%`
        );
      }

      const { data, error: err, count } = await query;
      if (err) throw err;
      setLogs((data as ActivityLog[]) ?? []);
      setTotalCount(count ?? 0);
      setLastUpdated(new Date());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load activity logs');
    } finally {
      setLoading(false);
    }
  }, [supabase, page, filterType, filterAction, search]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel('activity_logs_realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_logs' }, () => {
        if (page === 0) fetchLogs();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase, page, fetchLogs]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const handleSearchChange = (val: string) => {
    setSearch(val);
    setPage(0);
  };

  const handleFilterType = (val: 'all' | 'order' | 'driver') => {
    setFilterType(val);
    setPage(0);
  };

  const handleFilterAction = (val: string) => {
    setFilterAction(val);
    setPage(0);
  };

  // ─── Stats ─────────────────────────────────────────────────────────────────
  const orderCount = logs.filter((l) => l.entity_type === 'order').length;
  const driverCount = logs.filter((l) => l.entity_type === 'driver').length;

  return (
    <div className="space-y-5">
      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Events', value: totalCount, icon: Clock, color: 'hsl(var(--primary))' },
          { label: 'Order Events', value: orderCount, icon: Package, color: '#8b5cf6' },
          { label: 'Driver Events', value: driverCount, icon: Truck, color: '#f59e0b' },
          { label: 'This Page', value: logs.length, icon: Filter, color: '#10b981' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div
            key={label}
            className="rounded-xl border p-4 flex items-center gap-3"
            style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
          >
            <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${color}18` }}>
              <Icon size={18} style={{ color }} />
            </div>
            <div>
              <p className="text-xl font-bold" style={{ color: 'hsl(var(--foreground))' }}>{value}</p>
              <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div
        className="rounded-xl border p-4 flex flex-col sm:flex-row gap-3 items-start sm:items-center"
        style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
      >
        {/* Search */}
        <div className="relative flex-1 min-w-0">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'hsl(var(--muted-foreground))' }} />
          <input
            type="text"
            placeholder="Search by order, driver, or user…"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border outline-none focus:ring-2"
            style={{
              backgroundColor: 'hsl(var(--background))',
              borderColor: 'hsl(var(--border))',
              color: 'hsl(var(--foreground))',
            }}
          />
        </div>

        {/* Entity type filter */}
        <div className="flex gap-1 rounded-lg border p-1" style={{ borderColor: 'hsl(var(--border))' }}>
          {(['all', 'order', 'driver'] as const).map((t) => (
            <button
              key={t}
              onClick={() => handleFilterType(t)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all capitalize ${
                filterType === t ? 'text-white' : ''
              }`}
              style={
                filterType === t
                  ? { backgroundColor: 'hsl(var(--primary))' }
                  : { color: 'hsl(var(--muted-foreground))' }
              }
            >
              {t === 'all' ? 'All' : t === 'order' ? 'Orders' : 'Drivers'}
            </button>
          ))}
        </div>

        {/* Action filter */}
        <select
          value={filterAction}
          onChange={(e) => handleFilterAction(e.target.value)}
          className="text-sm rounded-lg border px-3 py-2 outline-none"
          style={{
            backgroundColor: 'hsl(var(--background))',
            borderColor: 'hsl(var(--border))',
            color: 'hsl(var(--foreground))',
          }}
        >
          <option value="all">All Actions</option>
          {Object.entries(ACTION_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>

        {/* Refresh */}
        <button
          onClick={fetchLogs}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-all hover:bg-secondary"
          style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Log table */}
      <div
        className="rounded-xl border overflow-hidden"
        style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3 border-b"
          style={{ borderColor: 'hsl(var(--border))' }}
        >
          <h2 className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
            Activity Events
          </h2>
          {lastUpdated && (
            <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Updated {formatRelativeTime(lastUpdated.toISOString())}
            </span>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="px-5 py-4 text-sm text-red-600 bg-red-50 border-b" style={{ borderColor: 'hsl(var(--border))' }}>
            {error}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="divide-y" style={{ borderColor: 'hsl(var(--border))' }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="px-5 py-4 flex items-center gap-4 animate-pulse">
                <div className="w-8 h-8 rounded-full bg-gray-200 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-gray-200 rounded w-1/3" />
                  <div className="h-3 bg-gray-200 rounded w-1/2" />
                </div>
                <div className="h-3 bg-gray-200 rounded w-20" />
              </div>
            ))}
          </div>
        )}

        {/* Empty */}
        {!loading && !error && logs.length === 0 && (
          <div className="px-5 py-16 text-center">
            <Clock size={32} className="mx-auto mb-3 opacity-30" style={{ color: 'hsl(var(--muted-foreground))' }} />
            <p className="text-sm font-medium" style={{ color: 'hsl(var(--foreground))' }}>No activity found</p>
            <p className="text-xs mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Try adjusting your filters or check back later
            </p>
          </div>
        )}

        {/* Rows */}
        {!loading && logs.length > 0 && (
          <div className="divide-y" style={{ borderColor: 'hsl(var(--border))' }}>
            {logs.map((log) => (
              <div key={log.id} className="px-5 py-4 flex items-start gap-4 hover:bg-secondary/30 transition-colors">
                {/* Icon */}
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                  style={{
                    backgroundColor: log.entity_type === 'order' ? '#8b5cf618' : '#f59e0b18',
                  }}
                >
                  {log.entity_type === 'order' ? (
                    <Package size={15} style={{ color: '#8b5cf6' }} />
                  ) : (
                    <Truck size={15} style={{ color: '#f59e0b' }} />
                  )}
                </div>

                {/* Main content */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    {/* Entity label */}
                    <span className="text-sm font-semibold truncate" style={{ color: 'hsl(var(--foreground))' }}>
                      {log.entity_label ?? log.entity_id}
                    </span>
                    {/* Action badge */}
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                      style={{
                        backgroundColor: 'hsl(var(--secondary))',
                        color: 'hsl(var(--foreground))',
                      }}
                    >
                      {ACTION_LABELS[log.action] ?? log.action}
                    </span>
                  </div>

                  {/* Before → After */}
                  {(log.old_value !== null || log.new_value !== null) && (
                    <div className="flex items-center gap-2 flex-wrap mt-1">
                      <StatusPill value={log.old_value} />
                      <ArrowRight size={13} style={{ color: 'hsl(var(--muted-foreground))' }} />
                      <StatusPill value={log.new_value} />
                      {log.field_changed && (
                        <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                          ({log.field_changed})
                        </span>
                      )}
                    </div>
                  )}

                  {/* Changed by + timestamp */}
                  <div className="flex items-center gap-3 mt-1.5">
                    {log.changed_by && (
                      <span className="flex items-center gap-1 text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        <User size={11} />
                        {log.changed_by}
                      </span>
                    )}
                    <span className="flex items-center gap-1 text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                      <Clock size={11} />
                      <span title={formatDateTime(log.created_at)}>{formatRelativeTime(log.created_at)}</span>
                      <span className="hidden sm:inline">· {formatDateTime(log.created_at)}</span>
                    </span>
                  </div>

                  {log.notes && (
                    <p className="text-xs mt-1 italic" style={{ color: 'hsl(var(--muted-foreground))' }}>
                      {log.notes}
                    </p>
                  )}
                </div>

                {/* Entity type chip */}
                <span
                  className="shrink-0 text-xs px-2 py-0.5 rounded-full font-medium capitalize hidden sm:inline-flex"
                  style={{
                    backgroundColor: log.entity_type === 'order' ? '#8b5cf618' : '#f59e0b18',
                    color: log.entity_type === 'order' ? '#8b5cf6' : '#f59e0b',
                  }}
                >
                  {log.entity_type}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div
            className="flex items-center justify-between px-5 py-3 border-t"
            style={{ borderColor: 'hsl(var(--border))' }}
          >
            <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} of {totalCount}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="p-1.5 rounded-lg border disabled:opacity-40 hover:bg-secondary transition-colors"
                style={{ borderColor: 'hsl(var(--border))' }}
              >
                <ChevronLeft size={14} />
              </button>
              <span className="text-xs font-medium" style={{ color: 'hsl(var(--foreground))' }}>
                {page + 1} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="p-1.5 rounded-lg border disabled:opacity-40 hover:bg-secondary transition-colors"
                style={{ borderColor: 'hsl(var(--border))' }}
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
