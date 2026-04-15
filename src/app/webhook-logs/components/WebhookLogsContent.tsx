'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import AppLayout from '@/components/AppLayout';
import {
  RefreshCw,
  Search,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  FileText,
  Eye,
  X,
  Clock,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

interface WebhookLog {
  id: string;
  method: string;
  endpoint: string;
  payload: Record<string, unknown>;
  http_status: number;
  response: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string | null;
  duration_ms: number | null;
  received_at: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function getStatusColor(status: number): string {
  if (status >= 200 && status < 300) return 'bg-green-100 text-green-700';
  if (status >= 400 && status < 500) return 'bg-orange-100 text-orange-700';
  if (status >= 500) return 'bg-red-100 text-red-700';
  return 'bg-gray-100 text-gray-600';
}

function StatusBadge({ status }: { status: number }) {
  const color = getStatusColor(status);
  const icon =
    status >= 200 && status < 300 ? <CheckCircle2 size={11} /> :
    status >= 500 ? <AlertCircle size={11} /> :
    <XCircle size={11} />;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${color}`}>
      {icon}
      {status}
    </span>
  );
}

function MethodBadge({ method }: { method: string }) {
  const isGet = method === 'GET';
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold tracking-wide ${
        isGet ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
      }`}
    >
      {method}
    </span>
  );
}

// ─── Detail Modal ─────────────────────────────────────────────────────────────

function DetailModal({ log, onClose }: { log: WebhookLog; onClose: () => void }) {
  const [tab, setTab] = useState<'payload' | 'response'>('payload');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
    >
      <div
        className="relative w-full max-w-2xl max-h-[85vh] flex flex-col rounded-xl shadow-2xl overflow-hidden"
        style={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: 'hsl(var(--border))' }}
        >
          <div className="flex items-center gap-3">
            <MethodBadge method={log.method} />
            <div>
              <p className="text-xs font-mono" style={{ color: 'hsl(var(--muted-foreground))' }}>
                {log.endpoint}
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                {formatDateTime(log.received_at)}
                {log.duration_ms != null && (
                  <span className="ml-2 inline-flex items-center gap-1">
                    <Zap size={10} />
                    {log.duration_ms}ms
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={log.http_status} />
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-secondary transition-colors"
              style={{ color: 'hsl(var(--muted-foreground))' }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Meta row */}
        {(log.ip_address || log.user_agent) && (
          <div
            className="px-5 py-2 text-xs border-b flex gap-4 flex-wrap"
            style={{
              borderColor: 'hsl(var(--border))',
              color: 'hsl(var(--muted-foreground))',
              backgroundColor: 'hsl(var(--secondary))',
            }}
          >
            {log.ip_address && <span>IP: <span className="font-mono">{log.ip_address}</span></span>}
            {log.user_agent && (
              <span className="truncate max-w-xs">UA: <span className="font-mono">{log.user_agent}</span></span>
            )}
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b" style={{ borderColor: 'hsl(var(--border))' }}>
          {(['payload', 'response'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-5 py-2.5 text-sm font-medium capitalize transition-colors ${
                tab === t
                  ? 'border-b-2 border-primary' :'hover:bg-secondary'
              }`}
              style={{
                color: tab === t ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
                borderColor: tab === t ? 'hsl(var(--primary))' : 'transparent',
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-4">
          <pre
            className="text-xs rounded-lg p-4 overflow-auto"
            style={{
              backgroundColor: 'hsl(var(--secondary))',
              color: 'hsl(var(--foreground))',
              fontFamily: 'monospace',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}
          >
            {JSON.stringify(tab === 'payload' ? log.payload : log.response, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

const PAGE_SIZE = 25;

export default function WebhookLogsContent() {
  const supabase = createClient();

  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [filterMethod, setFilterMethod] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedLog, setSelectedLog] = useState<WebhookLog | null>(null);

  const fetchLogs = useCallback(
    async (showRefresh = false) => {
      if (showRefresh) setRefreshing(true);
      else setLoading(true);

      try {
        let query = supabase
          .from('webhook_request_logs')
          .select('*', { count: 'exact' })
          .order('received_at', { ascending: false })
          .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

        if (filterMethod) {
          query = query.eq('method', filterMethod);
        }

        if (filterStatus === 'success') {
          query = query.gte('http_status', 200).lt('http_status', 300);
        } else if (filterStatus === 'client_error') {
          query = query.gte('http_status', 400).lt('http_status', 500);
        } else if (filterStatus === 'server_error') {
          query = query.gte('http_status', 500);
        }

        const { data, count, error } = await query;
        if (error) throw error;

        setLogs((data as WebhookLog[]) ?? []);
        setTotal(count ?? 0);
      } catch (err) {
        console.error(err);
        toast.error('Failed to load webhook logs');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [page, filterMethod, filterStatus]
  );

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel('webhook_request_logs_realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'webhook_request_logs' },
        () => {
          if (page === 1) fetchLogs();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchLogs, page]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [filterMethod, filterStatus, search]);

  const filteredLogs = search.trim()
    ? logs.filter((l) => {
        const q = search.toLowerCase();
        return (
          l.method.toLowerCase().includes(q) ||
          String(l.http_status).includes(q) ||
          l.ip_address?.toLowerCase().includes(q) ||
          JSON.stringify(l.payload).toLowerCase().includes(q) ||
          JSON.stringify(l.response).toLowerCase().includes(q)
        );
      })
    : logs;

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const successCount = logs.filter((l) => l.http_status >= 200 && l.http_status < 300).length;
  const errorCount = logs.filter((l) => l.http_status >= 400).length;
  const avgDuration =
    logs.filter((l) => l.duration_ms != null).length > 0
      ? Math.round(
          logs.filter((l) => l.duration_ms != null).reduce((a, l) => a + (l.duration_ms ?? 0), 0) /
            logs.filter((l) => l.duration_ms != null).length
        )
      : null;

  return (
    <AppLayout>
    <div className="flex-1 flex flex-col min-h-0 p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: 'hsl(var(--primary) / 0.1)' }}
          >
            <FileText size={18} style={{ color: 'hsl(var(--primary))' }} />
          </div>
          <div>
            <h1 className="text-lg font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
              Webhook Logs
            </h1>
            <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
              All incoming requests to <span className="font-mono">/api/woocommerce/webhook</span>
            </p>
          </div>
        </div>
        <button
          onClick={() => fetchLogs(true)}
          disabled={refreshing}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-secondary"
          style={{ color: 'hsl(var(--muted-foreground))' }}
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Requests', value: total, icon: <FileText size={14} />, color: 'text-blue-600' },
          { label: 'Success (2xx)', value: successCount, icon: <CheckCircle2 size={14} />, color: 'text-green-600' },
          { label: 'Errors (4xx/5xx)', value: errorCount, icon: <XCircle size={14} />, color: 'text-red-600' },
          {
            label: 'Avg Duration',
            value: avgDuration != null ? `${avgDuration}ms` : '—',
            icon: <Clock size={14} />,
            color: 'text-purple-600',
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl p-4"
            style={{
              backgroundColor: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
            }}
          >
            <div className={`flex items-center gap-1.5 text-xs font-medium mb-1 ${stat.color}`}>
              {stat.icon}
              {stat.label}
            </div>
            <p className="text-xl font-bold" style={{ color: 'hsl(var(--foreground))' }}>
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div
        className="rounded-xl p-4 flex flex-wrap gap-3 items-center"
        style={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
      >
        <div className="relative flex-1 min-w-[180px]">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: 'hsl(var(--muted-foreground))' }}
          />
          <input
            type="text"
            placeholder="Search payload, response, IP…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border outline-none focus:ring-2 focus:ring-primary/30"
            style={{
              backgroundColor: 'hsl(var(--background))',
              borderColor: 'hsl(var(--border))',
              color: 'hsl(var(--foreground))',
            }}
          />
        </div>

        <select
          value={filterMethod}
          onChange={(e) => setFilterMethod(e.target.value)}
          className="px-3 py-2 text-sm rounded-lg border outline-none"
          style={{
            backgroundColor: 'hsl(var(--background))',
            borderColor: 'hsl(var(--border))',
            color: 'hsl(var(--foreground))',
          }}
        >
          <option value="">All Methods</option>
          <option value="GET">GET</option>
          <option value="POST">POST</option>
        </select>

        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-3 py-2 text-sm rounded-lg border outline-none"
          style={{
            backgroundColor: 'hsl(var(--background))',
            borderColor: 'hsl(var(--border))',
            color: 'hsl(var(--foreground))',
          }}
        >
          <option value="">All Statuses</option>
          <option value="success">2xx Success</option>
          <option value="client_error">4xx Client Error</option>
          <option value="server_error">5xx Server Error</option>
        </select>
      </div>

      {/* Table */}
      <div
        className="rounded-xl overflow-hidden flex-1"
        style={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
      >
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin" style={{ color: 'hsl(var(--primary))' }} />
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <FileText size={32} style={{ color: 'hsl(var(--muted-foreground))' }} />
            <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
              No webhook logs found
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr
                  className="text-xs font-semibold uppercase tracking-wide"
                  style={{
                    backgroundColor: 'hsl(var(--secondary))',
                    color: 'hsl(var(--muted-foreground))',
                    borderBottom: '1px solid hsl(var(--border))',
                  }}
                >
                  <th className="px-4 py-3 text-left">Timestamp</th>
                  <th className="px-4 py-3 text-left">Method</th>
                  <th className="px-4 py-3 text-left">Endpoint</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Duration</th>
                  <th className="px-4 py-3 text-left">IP Address</th>
                  <th className="px-4 py-3 text-left">Payload Preview</th>
                  <th className="px-4 py-3 text-center">Details</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log, idx) => (
                  <tr
                    key={log.id}
                    className="transition-colors hover:bg-secondary/50"
                    style={{
                      borderBottom:
                        idx < filteredLogs.length - 1
                          ? '1px solid hsl(var(--border))'
                          : 'none',
                    }}
                  >
                    <td
                      className="px-4 py-3 text-xs font-mono whitespace-nowrap"
                      style={{ color: 'hsl(var(--muted-foreground))' }}
                    >
                      {formatDateTime(log.received_at)}
                    </td>
                    <td className="px-4 py-3">
                      <MethodBadge method={log.method} />
                    </td>
                    <td
                      className="px-4 py-3 text-xs font-mono max-w-[160px] truncate"
                      style={{ color: 'hsl(var(--foreground))' }}
                    >
                      {log.endpoint}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={log.http_status} />
                    </td>
                    <td
                      className="px-4 py-3 text-xs"
                      style={{ color: 'hsl(var(--muted-foreground))' }}
                    >
                      {log.duration_ms != null ? (
                        <span className="inline-flex items-center gap-1">
                          <Zap size={10} />
                          {log.duration_ms}ms
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td
                      className="px-4 py-3 text-xs font-mono"
                      style={{ color: 'hsl(var(--muted-foreground))' }}
                    >
                      {log.ip_address ?? '—'}
                    </td>
                    <td
                      className="px-4 py-3 text-xs font-mono max-w-[200px] truncate"
                      style={{ color: 'hsl(var(--muted-foreground))' }}
                    >
                      {Object.keys(log.payload).length > 0
                        ? Object.entries(log.payload)
                            .slice(0, 2)
                            .map(([k, v]) => `${k}=${String(v)}`)
                            .join(', ') + (Object.keys(log.payload).length > 2 ? '…' : '')
                        : <span className="italic">empty</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => setSelectedLog(log)}
                        className="p-1.5 rounded-lg hover:bg-secondary transition-colors"
                        style={{ color: 'hsl(var(--primary))' }}
                        title="View details"
                      >
                        <Eye size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1.5 rounded-lg hover:bg-secondary transition-colors disabled:opacity-40"
              style={{ color: 'hsl(var(--foreground))' }}
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-xs px-2" style={{ color: 'hsl(var(--foreground))' }}>
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-1.5 rounded-lg hover:bg-secondary transition-colors disabled:opacity-40"
              style={{ color: 'hsl(var(--foreground))' }}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {selectedLog && (
        <DetailModal log={selectedLog} onClose={() => setSelectedLog(null)} />
      )}
    </div>
    </AppLayout>
  );
}
