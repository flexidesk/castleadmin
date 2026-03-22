'use client';

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Search, ChevronUp, ChevronDown, ChevronsUpDown, Eye, Edit3, Trash2, Plus, Download, ChevronLeft, ChevronRight, Truck, X, CheckSquare, Square, FileText, FileSpreadsheet, Calendar, User, RefreshCw } from 'lucide-react';
import { ordersService, AppOrder } from '@/lib/services/ordersService';
import { createClient } from '@/lib/supabase/client';
import { StatusBadge, TypeBadge, PaymentBadge } from '@/components/ui/StatusBadge';
import type { BookingStatus } from '@/components/ui/StatusBadge';

type SortKey = 'wooOrderId' | 'customer' | 'bookingDate' | 'status' | 'payment';
type SortDir = 'asc' | 'desc';

const STATUS_TABS: Array<{ label: string; value: BookingStatus | 'All' }> = [
  { label: 'All Bookings', value: 'All' },
  { label: 'Accepted', value: 'Booking Accepted' },
  { label: 'Assigned', value: 'Booking Assigned' },
  { label: 'Out For Delivery', value: 'Booking Out For Delivery' },
  { label: 'Complete', value: 'Booking Complete' },
];

export default function OrdersTable() {
  const router = useRouter();
  const [orders, setOrders] = useState<AppOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeStatus, setActiveStatus] = useState<BookingStatus | 'All'>('All');
  const [sortKey, setSortKey] = useState<SortKey>('bookingDate');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(8);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [driverFilter, setDriverFilter] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  // WooCommerce sync state
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<{ status: string; synced_at: string; orders_upserted: number; orders_fetched: number; message: string | null } | null>(null);

  // Close export dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const loadOrders = useCallback(async () => {
    const data = await ordersService.fetchAllOrders();
    setOrders(data);
    setLoading(false);
  }, []);

  const fetchLastSyncStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/woocommerce/sync');
      if (res.ok) {
        const data = await res.json();
        if (data && data.status !== 'never_synced') setLastSync(data);
      }
    } catch {
      // silent — sync status is non-critical
    }
  }, []);

  const runSync = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const res = await fetch('/api/woocommerce/sync', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        toast.error(`Sync failed: ${data.error ?? 'Unknown error'}`);
      } else {
        if (data.synced > 0) {
          toast.success(`WooCommerce sync: ${data.synced} order${data.synced !== 1 ? 's' : ''} imported`);
          await loadOrders();
        } else {
          toast.info(data.message ?? 'No new orders to sync');
        }
        await fetchLastSyncStatus();
      }
    } catch (err) {
      toast.error('Sync failed: network error');
    } finally {
      setSyncing(false);
    }
  }, [syncing, loadOrders, fetchLastSyncStatus]);

  useEffect(() => {
    loadOrders();
    fetchLastSyncStatus();

    const supabase = createClient();

    const channel = supabase
      .channel('orders_dashboard_rt')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders' },
        async (payload) => {
          const { data } = await supabase
            .from('orders')
            .select('*, drivers(*)')
            .eq('id', payload.new.id)
            .single();
          if (data) {
            const mapped = ordersService['mapRow']?.(data) ?? data;
            setOrders((prev) => {
              if (prev.some((o) => o.id === payload.new.id)) return prev;
              return [mapped as AppOrder, ...prev];
            });
            toast.success(`New booking received: ${payload.new.id}`, { duration: 5000 });
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders' },
        async (payload) => {
          const prev = payload.old as Record<string, unknown>;
          const next = payload.new as Record<string, unknown>;

          const { data } = await supabase
            .from('orders')
            .select('*, drivers(*)')
            .eq('id', next.id)
            .single();

          if (data) {
            const mapped = data as AppOrder;
            setOrders((prevOrders) =>
              prevOrders.map((o) => (o.id === next.id ? (mapped as AppOrder) : o))
            );

            // Show specific toast based on what changed
            if (prev.status !== next.status) {
              toast.info(
                `Booking ${next.id}: status changed to "${next.status}"`,
                { duration: 5000 }
              );
            } else if (prev.driver_id !== next.driver_id) {
              const driverName = (data as any)?.drivers?.name ?? 'a driver';
              if (next.driver_id) {
                toast.info(`Booking ${next.id}: assigned to ${driverName}`, { duration: 5000 });
              } else {
                toast.info(`Booking ${next.id}: driver unassigned`, { duration: 5000 });
              }
            } else if (prev.payment_status !== next.payment_status) {
              toast.info(
                `Booking ${next.id}: payment status → ${next.payment_status}`,
                { duration: 5000 }
              );
            }
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'orders' },
        (payload) => {
          setOrders((prev) => prev.filter((o) => o.id !== payload.old.id));
          toast.info(`Booking ${payload.old.id} was removed`, { duration: 4000 });
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'drivers' },
        async (payload) => {
          const prev = payload.old as Record<string, unknown>;
          const next = payload.new as Record<string, unknown>;
          if (prev.status !== next.status) {
            toast.info(`Driver ${next.name}: status → ${next.status}`, { duration: 4000 });
            // Refresh orders to reflect updated driver info
            loadOrders();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadOrders, fetchLastSyncStatus, runSync]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  const filtered = useMemo(() => {
    let result = [...orders];
    if (activeStatus !== 'All') result = result.filter((o) => o.status === activeStatus);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (o) =>
          o.customer.name.toLowerCase().includes(q) ||
          o.wooOrderId.toLowerCase().includes(q) ||
          o.id.toLowerCase().includes(q) ||
          o.deliveryAddress?.postcode?.toLowerCase().includes(q) ||
          o.customer.phone.includes(q)
      );
    }
    if (dateFrom) result = result.filter((o) => o.bookingDate >= dateFrom);
    if (dateTo) result = result.filter((o) => o.bookingDate <= dateTo);
    if (driverFilter) {
      if (driverFilter === '__unassigned__') {
        result = result.filter((o) => !o.driver);
      } else {
        result = result.filter((o) => o.driver?.id === driverFilter);
      }
    }

    result.sort((a, b) => {
      let aVal = '';
      let bVal = '';
      if (sortKey === 'customer') { aVal = a.customer.name; bVal = b.customer.name; }
      else if (sortKey === 'status') { aVal = a.status; bVal = b.status; }
      else if (sortKey === 'payment') { aVal = a.payment.status; bVal = b.payment.status; }
      else if (sortKey === 'bookingDate') { aVal = a.bookingDate; bVal = b.bookingDate; }
      else { aVal = a.wooOrderId; bVal = b.wooOrderId; }
      return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    });
    return result;
  }, [orders, activeStatus, search, sortKey, sortDir, dateFrom, dateTo, driverFilter]);

  const totalPages = Math.ceil(filtered.length / perPage);
  const paged = filtered.slice((page - 1) * perPage, page * perPage);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === paged.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(paged.map((o) => o.id)));
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    const results = await Promise.all(ids.map((id) => ordersService.deleteOrder(id)));
    const deleted = results.filter(Boolean).length;
    if (deleted > 0) {
      setOrders((prev) => prev.filter((o) => !selectedIds.has(o.id)));
      toast.success(`${deleted} booking${deleted > 1 ? 's' : ''} deleted`);
    } else {
      toast.error('Failed to delete selected bookings');
    }
    setSelectedIds(new Set());
  };

  const handleDeleteRow = async (order: AppOrder) => {
    const ok = await ordersService.deleteOrder(order.id);
    if (ok) {
      setOrders((prev) => prev.filter((o) => o.id !== order.id));
      toast.success(`Booking ${order.id} deleted`);
    } else {
      toast.error(`Failed to delete booking ${order.id}`);
    }
  };

  const exportCSV = () => {
    setExportOpen(false);
    const rows = filtered;
    if (rows.length === 0) { toast.error('No bookings match current filters'); return; }

    const headers = ['Order ID', 'WooCommerce ID', 'Customer Name', 'Customer Phone', 'Type', 'Booking Date', 'Delivery Window', 'Status', 'Payment Status', 'Payment Method', 'Amount (£)', 'Driver', 'Address', 'Postcode'];
    const csvRows = [
      headers.join(','),
      ...rows.map((o) => [
        `"${o.id}"`,
        `"${o.wooOrderId}"`,
        `"${o.customer.name}"`,
        `"${o.customer.phone}"`,
        `"${o.type}"`,
        `"${o.bookingDate}"`,
        `"${o.deliveryWindow ?? ''}"`,
        `"${o.status}"`,
        `"${o.payment.status}"`,
        `"${o.payment.method}"`,
        o.payment.amount.toFixed(2),
        `"${o.driver?.name ?? 'Unassigned'}"`,
        `"${o.deliveryAddress?.line1 ?? ''}"`,
        `"${o.deliveryAddress?.postcode ?? ''}"`,
      ].join(',')),
    ];
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const dateLabel = (dateFrom || dateTo) ? `_${dateFrom || ''}${dateTo ? `_to_${dateTo}` : ''}` : '';
    const statusLabel = activeStatus !== 'All' ? `_${activeStatus.replace(/\s+/g, '-')}` : '';
    a.download = `bookings${statusLabel}${dateLabel}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} booking${rows.length !== 1 ? 's' : ''} to CSV`);
  };

  const exportPDF = () => {
    setExportOpen(false);
    const rows = filtered;
    if (rows.length === 0) { toast.error('No bookings match current filters'); return; }

    const filterLabel = [
      activeStatus !== 'All' ? `Status: ${activeStatus}` : '',
      dateFrom ? `From: ${dateFrom}` : '',
      dateTo ? `To: ${dateTo}` : '',
      driverFilter && driverFilter !== '__unassigned__' ? `Driver: ${uniqueDrivers.find(d => d.id === driverFilter)?.name ?? driverFilter}` : '',
      driverFilter === '__unassigned__' ? 'Driver: Unassigned' : '',
    ].filter(Boolean).join(' | ') || 'All Bookings';

    const tableRows = rows.map((o) => `
      <tr>
        <td>${o.id}</td>
        <td>${o.customer.name}</td>
        <td>${o.bookingDate}</td>
        <td>${o.status}</td>
        <td>${o.payment.status}</td>
        <td>£${o.payment.amount.toFixed(2)}</td>
        <td>${o.driver?.name ?? 'Unassigned'}</td>
        <td>${o.deliveryAddress?.postcode ?? '—'}</td>
      </tr>`).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Bookings Export</title>
    <style>
      body{font-family:Arial,sans-serif;font-size:11px;margin:20px;color:#111}
      h2{margin-bottom:4px;font-size:16px}
      p.meta{color:#666;font-size:10px;margin-bottom:12px}
      table{width:100%;border-collapse:collapse}
      th{background:#f3f4f6;text-align:left;padding:6px 8px;font-size:10px;text-transform:uppercase;letter-spacing:.05em;border-bottom:2px solid #e5e7eb}
      td{padding:5px 8px;border-bottom:1px solid #e5e7eb;vertical-align:top}
      tr:nth-child(even) td{background:#f9fafb}
    </style></head><body>
    <h2>Bookings Export</h2>
    <p class="meta">Filters: ${filterLabel} &nbsp;|&nbsp; Total: ${rows.length} bookings &nbsp;|&nbsp; Generated: ${new Date().toLocaleString('en-GB')}</p>
    <table>
      <thead><tr><th>Booking ID</th><th>Customer</th><th>Date</th><th>Status</th><th>Payment</th><th>Amount</th><th>Driver</th><th>Postcode</th></tr></thead>
      <tbody>${tableRows}</tbody>
    </table></body></html>`;

    const win = window.open('', '_blank');
    if (!win) { toast.error('Pop-up blocked — please allow pop-ups and try again'); return; }
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
    toast.success(`PDF print dialog opened for ${rows.length} order${rows.length !== 1 ? 's' : ''}`);
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ChevronsUpDown size={12} style={{ color: 'hsl(var(--muted-foreground))' }} />;
    return sortDir === 'asc'
      ? <ChevronUp size={12} style={{ color: 'hsl(var(--primary))' }} />
      : <ChevronDown size={12} style={{ color: 'hsl(var(--primary))' }} />;
  };

  // Unique drivers list derived from orders
  const uniqueDrivers = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    orders.forEach((o) => {
      if (o.driver?.id && o.driver?.name) {
        map.set(o.driver.id, { id: o.driver.id, name: o.driver.name });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [orders]);

  const hasActiveFilters = search || dateFrom || dateTo || driverFilter || activeStatus !== 'All';

  const formatSyncTime = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) + ' ' + d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    } catch { return iso; }
  };

  return (
    <div className="card overflow-hidden" suppressHydrationWarning>
      {/* WooCommerce Sync Bar */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b" style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--primary) / 0.02)' }}>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: lastSync?.status === 'success' ? '#22c55e' : lastSync?.status === 'partial' ? '#f59e0b' : 'hsl(var(--muted-foreground))' }} />
          <span className="text-xs font-medium" style={{ color: 'hsl(var(--foreground))' }}>WooCommerce Sync</span>
          {lastSync ? (
            <span className="text-xs truncate" style={{ color: 'hsl(var(--muted-foreground))' }}>
              {lastSync.status === 'success' || lastSync.status === 'partial'
                ? `Last synced ${formatSyncTime(lastSync.synced_at)} · ${lastSync.orders_upserted} order${lastSync.orders_upserted !== 1 ? 's' : ''} imported`
                : `Last sync: ${lastSync.message ?? 'unknown'}`}
            </span>
          ) : (
            <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>Never synced · webhook-driven approach</span>
          )}
        </div>
        <button
          onClick={runSync}
          disabled={syncing}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border font-medium transition-all disabled:opacity-60"
          style={{
            borderColor: 'hsl(var(--primary) / 0.4)',
            color: 'hsl(var(--primary))',
            backgroundColor: 'hsl(var(--primary) / 0.06)',
          }}
          title="Pull pending orders from WooCommerce"
        >
          <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'Syncing…' : 'Sync Now'}
        </button>
      </div>

      {/* Table header controls */}
      <div className="p-4 border-b flex flex-wrap items-center gap-3" style={{ borderColor: 'hsl(var(--border))' }}>
        <div className="flex-1 min-w-[200px] relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'hsl(var(--muted-foreground))' }} />
          <input
            type="text"
            placeholder="Search by name, WooCommerce ID, postcode…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="input-base pl-9 text-sm"
          />
        </div>

        {/* Date range picker */}
        <div className="flex items-center gap-2">
          <div className="relative flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--background))' }}>
            <Calendar size={13} style={{ color: 'hsl(var(--muted-foreground))' }} />
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              className="bg-transparent text-sm outline-none w-[120px]"
              style={{ color: dateFrom ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))' }}
              title="From date"
            />
            <span className="text-xs px-1" style={{ color: 'hsl(var(--muted-foreground))' }}>→</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              className="bg-transparent text-sm outline-none w-[120px]"
              style={{ color: dateTo ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))' }}
              title="To date"
            />
            {(dateFrom || dateTo) && (
              <button
                onClick={() => { setDateFrom(''); setDateTo(''); setPage(1); }}
                className="ml-1 p-0.5 rounded hover:bg-secondary transition-colors"
                title="Clear date range"
              >
                <X size={11} style={{ color: 'hsl(var(--muted-foreground))' }} />
              </button>
            )}
          </div>
        </div>

        {/* Driver filter */}
        <div className="relative flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm" style={{ borderColor: driverFilter ? 'hsl(var(--primary))' : 'hsl(var(--border))', backgroundColor: driverFilter ? 'hsl(var(--primary) / 0.05)' : 'hsl(var(--background))' }}>
          <User size={13} style={{ color: driverFilter ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))' }} />
          <select
            value={driverFilter}
            onChange={(e) => { setDriverFilter(e.target.value); setPage(1); }}
            className="bg-transparent text-sm outline-none pr-1 cursor-pointer"
            style={{ color: driverFilter ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))' }}
          >
            <option value="">All Drivers</option>
            <option value="__unassigned__">Unassigned</option>
            {uniqueDrivers.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          {driverFilter && (
            <button
              onClick={() => { setDriverFilter(''); setPage(1); }}
              className="ml-1 p-0.5 rounded hover:bg-secondary transition-colors"
              title="Clear driver filter"
            >
              <X size={11} style={{ color: 'hsl(var(--primary))' }} />
            </button>
          )}
        </div>

        <button onClick={() => router.push('/create-order')} className="btn-primary text-sm ml-auto">
          <Plus size={15} /> New Booking
        </button>

        {/* Export dropdown */}
        <div className="relative" ref={exportRef}>
          <button
            className="btn-secondary text-sm flex items-center gap-1.5"
            onClick={() => setExportOpen((v) => !v)}
            aria-haspopup="true"
            aria-expanded={exportOpen}
          >
            <Download size={14} />
            Export
            <ChevronDown size={12} className={`transition-transform duration-150 ${exportOpen ? 'rotate-180' : ''}`} />
          </button>

          {exportOpen && (
            <div
              className="absolute right-0 top-full mt-1.5 w-52 rounded-lg border shadow-lg z-30 overflow-hidden"
              style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))' }}
            >
              <div className="px-3 py-2 border-b" style={{ borderColor: 'hsl(var(--border))' }}>
                <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  Export filtered bookings
                </p>
                <p className="text-[10px] mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  {filtered.length} booking{filtered.length !== 1 ? 's' : ''} · {activeStatus !== 'All' ? activeStatus : 'All statuses'}{dateFrom ? ` · ${dateFrom}` : ''}{dateTo ? ` → ${dateTo}` : ''}
                </p>
              </div>
              <button
                onClick={exportCSV}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-secondary transition-colors text-left"
                style={{ color: 'hsl(var(--foreground))' }}
              >
                <FileSpreadsheet size={15} style={{ color: 'hsl(var(--primary))' }} />
                <div>
                  <p className="font-medium text-sm">Export as CSV</p>
                  <p className="text-[10px]" style={{ color: 'hsl(var(--muted-foreground))' }}>Spreadsheet-compatible</p>
                </div>
              </button>
              <button
                onClick={exportPDF}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-secondary transition-colors text-left border-t"
                style={{ color: 'hsl(var(--foreground))', borderColor: 'hsl(var(--border))' }}
              >
                <FileText size={15} style={{ color: 'hsl(var(--destructive))' }} />
                <div>
                  <p className="font-medium text-sm">Export as PDF</p>
                  <p className="text-[10px]" style={{ color: 'hsl(var(--muted-foreground))' }}>Print-ready layout</p>
                </div>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Active filter chips */}
      {(dateFrom || dateTo || driverFilter) && (
        <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b" style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--primary) / 0.03)' }}>
          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'hsl(var(--muted-foreground))' }}>Active filters:</span>
          {(dateFrom || dateTo) && (
            <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium" style={{ backgroundColor: 'hsl(var(--primary) / 0.1)', color: 'hsl(var(--primary))' }}>
              <Calendar size={10} />
              {dateFrom && dateTo ? `${dateFrom} → ${dateTo}` : dateFrom ? `From ${dateFrom}` : `Until ${dateTo}`}
              <button onClick={() => { setDateFrom(''); setDateTo(''); setPage(1); }} className="ml-0.5 hover:opacity-70">
                <X size={10} />
              </button>
            </span>
          )}
          {driverFilter && (
            <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium" style={{ backgroundColor: 'hsl(var(--primary) / 0.1)', color: 'hsl(var(--primary))' }}>
              <User size={10} />
              {driverFilter === '__unassigned__' ? 'Unassigned' : uniqueDrivers.find(d => d.id === driverFilter)?.name ?? 'Driver'}
              <button onClick={() => { setDriverFilter(''); setPage(1); }} className="ml-0.5 hover:opacity-70">
                <X size={10} />
              </button>
            </span>
          )}
          <button
            onClick={() => { setDateFrom(''); setDateTo(''); setDriverFilter(''); setPage(1); }}
            className="text-[10px] ml-auto underline"
            style={{ color: 'hsl(var(--muted-foreground))' }}
          >
            Clear all
          </button>
        </div>
      )}

      {/* Status filter tabs */}
      <div className="flex items-center gap-0 border-b overflow-x-auto scrollbar-thin px-4" style={{ borderColor: 'hsl(var(--border))' }}>
        {STATUS_TABS.map((tab) => {
          const count = tab.value === 'All'
            ? orders.length
            : orders.filter((o) => o.status === tab.value).length;
          return (
            <button
              key={tab.value}
              onClick={() => { setActiveStatus(tab.value); setPage(1); }}
              className={`tab-item flex items-center gap-1.5 ${activeStatus === tab.value ? 'active' : ''}`}
            >
              {tab.label}
              <span
                className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                style={{
                  backgroundColor:
                    activeStatus === tab.value
                      ? 'hsl(var(--primary) / 0.12)'
                      : 'hsl(var(--secondary))',
                  color:
                    activeStatus === tab.value
                      ? 'hsl(var(--primary))'
                      : 'hsl(var(--muted-foreground))',
                }}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div
          className="flex items-center gap-3 px-4 py-2.5 border-b text-sm animate-slide-up"
          style={{ backgroundColor: 'hsl(var(--primary) / 0.05)', borderColor: 'hsl(var(--primary) / 0.2)' }}
        >
          <span className="font-medium" style={{ color: 'hsl(var(--primary))' }}>{selectedIds.size} selected</span>
          <button className="btn-danger text-xs py-1 px-3" onClick={handleBulkDelete}>
            <Trash2 size={12} /> Delete selected
          </button>
          <button className="btn-secondary text-xs py-1 px-3" onClick={() => toast.success(`Assigned ${selectedIds.size} bookings`)}>
            <Truck size={12} /> Bulk assign driver
          </button>
          <button className="ml-auto text-xs" style={{ color: 'hsl(var(--muted-foreground))' }} onClick={() => setSelectedIds(new Set())}>
            Clear selection
          </button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full min-w-[1100px]">
          <thead>
            <tr style={{ backgroundColor: 'hsl(var(--secondary) / 0.5)' }}>
              <th className="w-10 px-4 py-3 text-left">
                <button onClick={toggleAll} className="flex items-center">
                  {selectedIds.size === paged.length && paged.length > 0
                    ? <CheckSquare size={15} style={{ color: 'hsl(var(--primary))' }} />
                    : <Square size={15} style={{ color: 'hsl(var(--muted-foreground))' }} />}
                </button>
              </th>
              {[
                { key: 'wooOrderId', label: 'Order ID' },
                { key: 'customer', label: 'Customer' },
                { key: null, label: 'Type' },
                { key: null, label: 'Products' },
                { key: null, label: 'Address' },
                { key: null, label: 'Driver' },
                { key: 'bookingDate', label: 'Date / Window' },
                { key: 'status', label: 'Status' },
                { key: 'payment', label: 'Payment' },
                { key: null, label: 'Actions' },
              ].map(({ key, label }) => (
                <th
                  key={label}
                  className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider"
                  style={{ color: 'hsl(var(--muted-foreground))' }}
                >
                  {key ? (
                    <button className="flex items-center gap-1 hover:text-foreground transition-colors" onClick={() => handleSort(key as SortKey)}>
                      {label} <SortIcon col={key as SortKey} />
                    </button>
                  ) : label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-t" style={{ borderColor: 'hsl(var(--border))' }}>
                  {Array.from({ length: 11 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 rounded animate-pulse" style={{ backgroundColor: 'hsl(var(--secondary))', width: j === 0 ? '20px' : '80%' }} />
                    </td>
                  ))}
                </tr>
              ))
            ) : paged.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-4 py-16 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <Search size={32} style={{ color: 'hsl(var(--muted-foreground))' }} />
                    <p className="text-sm font-medium" style={{ color: 'hsl(var(--foreground))' }}>No bookings match your filters</p>
                    <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>Try adjusting the status tab, search, date range, or driver filter</p>
                    <button className="btn-secondary text-xs mt-2" onClick={() => { setSearch(''); setActiveStatus('All'); setDateFrom(''); setDateTo(''); setDriverFilter(''); }}>
                      Clear all filters
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              paged.map((order, idx) => (
                <tr
                  key={order.id}
                  className="group border-t hover:bg-secondary/40 transition-colors duration-100"
                  style={{
                    borderColor: 'hsl(var(--border))',
                    backgroundColor: selectedIds.has(order.id)
                      ? 'hsl(var(--primary) / 0.04)'
                      : idx % 2 === 1 ? 'hsl(var(--secondary) / 0.2)' : undefined,
                  }}
                >
                  {/* Checkbox */}
                  <td className="px-4 py-3">
                    <button onClick={() => toggleSelect(order.id)}>
                      {selectedIds.has(order.id)
                        ? <CheckSquare size={15} style={{ color: 'hsl(var(--primary))' }} />
                        : <Square size={15} style={{ color: 'hsl(var(--muted-foreground))' }} />}
                    </button>
                  </td>

                  {/* Order ID */}
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-mono text-xs font-medium" style={{ color: 'hsl(var(--primary))' }}>{order.id}</p>
                      <p className="font-mono text-[10px]" style={{ color: 'hsl(var(--muted-foreground))' }}>WC {order.wooOrderId}</p>
                    </div>
                  </td>

                  {/* Customer */}
                  <td className="px-4 py-3">
                    <div>
                      <p className="text-sm font-medium">{order.customer.name}</p>
                      <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>{order.customer.phone}</p>
                    </div>
                  </td>

                  {/* Type */}
                  <td className="px-4 py-3"><TypeBadge type={order.type} /></td>

                  {/* Products */}
                  <td className="px-4 py-3 max-w-[180px]">
                    <p className="text-sm truncate" title={order.products?.[0]?.name}>{order.products?.[0]?.name}</p>
                    {order.products?.length > 1 && (
                      <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>+{order.products.length - 1} item{order.products.length - 1 > 1 ? 's' : ''}</p>
                    )}
                  </td>

                  {/* Address */}
                  <td className="px-4 py-3 max-w-[160px]">
                    {order.type === 'Delivery' && order.deliveryAddress ? (
                      <div>
                        <p className="text-sm truncate">{order.deliveryAddress.line1}</p>
                        <p className="text-xs font-mono" style={{ color: 'hsl(var(--muted-foreground))' }}>{order.deliveryAddress.postcode}</p>
                      </div>
                    ) : (
                      <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>Collection</p>
                    )}
                  </td>

                  {/* Driver */}
                  <td className="px-4 py-3">
                    {order.driver ? (
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0" style={{ backgroundColor: 'hsl(var(--primary) / 0.1)', color: 'hsl(var(--primary))' }}>
                          {order.driver.avatar}
                        </div>
                        <span className="text-xs font-medium truncate max-w-[80px]">{order.driver.name.split(' ')[0]}</span>
                      </div>
                    ) : (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: 'hsl(var(--destructive) / 0.1)', color: 'hsl(var(--destructive))' }}>
                        Unassigned
                      </span>
                    )}
                  </td>

                  {/* Date / Window */}
                  <td className="px-4 py-3">
                    <p className="text-xs font-medium">
                      {new Date(order.bookingDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                    </p>
                    <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>{order.deliveryWindow}</p>
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3">
                    <StatusBadge status={order.status as any} />
                  </td>

                  {/* Payment */}
                  <td className="px-4 py-3">
                    <PaymentBadge status={order.payment.status as any} method={order.payment.method as any} />
                    <p className="text-xs font-mono mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>£{order.payment.amount.toFixed(2)}</p>
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                      <button onClick={() => router.push(`/order-detail?id=${order.id}`)} className="p-1.5 rounded-md hover:bg-secondary transition-colors relative group/btn" title="View order details" aria-label="View order details">
                        <Eye size={14} style={{ color: 'hsl(var(--primary))' }} />
                        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-0.5 rounded text-[10px] font-medium whitespace-nowrap opacity-0 pointer-events-none group-hover/btn:opacity-100 transition-opacity z-10" style={{ backgroundColor: 'hsl(var(--foreground))', color: 'hsl(var(--background))' }}>View</span>
                      </button>
                      <button className="p-1.5 rounded-md hover:bg-secondary transition-colors relative group/btn" title="Edit booking" aria-label="Edit booking" onClick={() => toast.info(`Edit booking ${order.id}`)}>
                        <Edit3 size={14} style={{ color: 'hsl(var(--muted-foreground))' }} />
                        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-0.5 rounded text-[10px] font-medium whitespace-nowrap opacity-0 pointer-events-none group-hover/btn:opacity-100 transition-opacity z-10" style={{ backgroundColor: 'hsl(var(--foreground))', color: 'hsl(var(--background))' }}>Edit</span>
                      </button>
                      <button className="p-1.5 rounded-md hover:bg-red-50 transition-colors relative group/btn" title="Delete booking" aria-label="Delete booking" onClick={() => handleDeleteRow(order)}>
                        <Trash2 size={14} style={{ color: 'hsl(var(--destructive))' }} />
                        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-0.5 rounded text-[10px] font-medium whitespace-nowrap opacity-0 pointer-events-none group-hover/btn:opacity-100 transition-opacity z-10" style={{ backgroundColor: 'hsl(var(--foreground))', color: 'hsl(var(--background))' }}>Delete</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t" style={{ borderColor: 'hsl(var(--border))' }}>
        <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
          Showing{' '}
          <span className="font-medium" style={{ color: 'hsl(var(--foreground))' }}>
            {Math.min((page - 1) * perPage + 1, filtered.length)}–{Math.min(page * perPage, filtered.length)}
          </span>{' '}
          of{' '}
          <span className="font-medium" style={{ color: 'hsl(var(--foreground))' }}>{filtered.length}</span>{' '}
          bookings
        </p>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>Rows per page</span>
            <select
              value={perPage}
              onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}
              className="input-base text-xs py-1 w-16"
            >
              {[5, 8, 10, 20, 50].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1.5 rounded-md border disabled:opacity-40 hover:bg-secondary transition-colors"
              style={{ borderColor: 'hsl(var(--border))' }}
              aria-label="Previous page"
            >
              <ChevronLeft size={14} />
            </button>

            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              const pageNum = i + 1;
              return (
                <button
                  key={pageNum}
                  onClick={() => setPage(pageNum)}
                  className="w-7 h-7 rounded-md text-xs font-medium transition-all duration-150"
                  style={{
                    backgroundColor: page === pageNum ? 'hsl(var(--primary))' : 'transparent',
                    color: page === pageNum ? 'white' : 'hsl(var(--muted-foreground))',
                  }}
                >
                  {pageNum}
                </button>
              );
            })}

            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages || totalPages === 0}
              className="p-1.5 rounded-md border disabled:opacity-40 hover:bg-secondary transition-colors"
              style={{ borderColor: 'hsl(var(--border))' }}
              aria-label="Next page"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}