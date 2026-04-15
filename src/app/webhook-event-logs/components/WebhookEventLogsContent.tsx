'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  RefreshCw,
  Search,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  Loader2,
  Webhook,
  Eye,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

interface WebhookEvent {
  id: string;
  woo_order_id: string;
  topic: string;
  payload_summary: Record<string, unknown>;
  full_payload: Record<string, unknown> | null;
  http_status: number | null;
  retry_count: number;
  error_message: string | null;
  received_at: string;
  processed_at: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

function getStatusColor(status: number | null): string {
  if (!status) return 'bg-gray-100 text-gray-600';
  if (status >= 200 && status < 300) return 'bg-green-100 text-green-700';
  if (status >= 400 && status < 500) return 'bg-orange-100 text-orange-700';
  if (status >= 500) return 'bg-red-100 text-red-700';
  return 'bg-gray-100 text-gray-600';
}

function HttpStatusBadge({ status }: { status: number | null }) {
  const color = getStatusColor(status);
  const icon =
    !status ? <Clock size={11} /> :
    status >= 200 && status < 300 ? <CheckCircle2 size={11} /> :
    <XCircle size={11} />;

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${color}`}>
      {icon}
      {status ?? 'Pending'}
    </span>
  );
}

function EventTypeBadge({ topic }: { topic: string }) {
  const colorMap: Record<string, string> = {
    'order.created': 'bg-blue-100 text-blue-700',
    'order.updated': 'bg-purple-100 text-purple-700',
    'order.deleted': 'bg-red-100 text-red-700',
    'order.restored': 'bg-teal-100 text-teal-700',
    'order.completed': 'bg-green-100 text-green-700',
  };
  const cls = colorMap[topic] ?? 'bg-gray-100 text-gray-600';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {topic}
    </span>
  );
}

// ─── Payload Modal ────────────────────────────────────────────────────────────

function PayloadModal({ event, onClose }: { event: WebhookEvent; onClose: () => void }) {
  const payload = event.full_payload ?? event.payload_summary ?? {};
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div
        className="relative w-full max-w-2xl max-h-[80vh] flex flex-col rounded-xl shadow-2xl overflow-hidden"
        style={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'hsl(var(--border))' }}>
          <div>
            <h3 className="font-semibold text-sm" style={{ color: 'hsl(var(--foreground))' }}>
              Payload Preview
            </h3>
            <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Order #{event.woo_order_id} · {event.topic}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-secondary transition-colors"
            style={{ color: 'hsl(var(--muted-foreground))' }}
          >
            <X size={16} />
          </button>
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
            {JSON.stringify(payload, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

export default function WebhookEventLogsContent() {
  const supabase = createClient();

  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [filterTopic, setFilterTopic] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [previewEvent, setPreviewEvent] = useState<WebhookEvent | null>(null);

  const fetchEvents = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      let query = supabase
        .from('woocommerce_webhook_log')
        .select('*', { count: 'exact' })
        .order('received_at', { ascending: false })
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

      if (search.trim()) {
        query = query.ilike('woo_order_id', `%${search.trim()}%`);
      }
      if (filterTopic) {
        query = query.eq('topic', filterTopic);
      }
      if (filterStatus === 'success') {
        query = query.gte('http_status', 200).lt('http_status', 300);
      } else if (filterStatus === 'error') {
        query = query.gte('http_status', 400);
      } else if (filterStatus === 'pending') {
        query = query.is('http_status', null);
      }

      const { data, count, error } = await query;
      if (error) throw error;

      setEvents((data as WebhookEvent[]) ?? []);
      setTotal(count ?? 0);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load webhook events');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [page, search, filterTopic, filterStatus]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel('webhook_event_logs_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'woocommerce_webhook_log' }, () => {
        fetchEvents();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchEvents]);

  const handleResend = async (event: WebhookEvent) => {
    setResendingId(event.id);
    try {
      // Increment retry count and clear http_status to mark as pending
      const { error } = await supabase
        .from('woocommerce_webhook_log')
        .update({
          retry_count: (event.retry_count ?? 0) + 1,
          http_status: null,
          processed_at: null,
          error_message: null,
        })
        .eq('id', event.id);

      if (error) throw error;

      toast.success(`Resend queued for Order #${event.woo_order_id}`);
      fetchEvents(true);
    } catch (err) {
      console.error(err);
      toast.error('Failed to queue resend');
    } finally {
      setResendingId(null);
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const topics = ['order.created', 'order.updated', 'order.deleted', 'order.restored', 'order.completed'];

  return (
    <div className="flex-1 flex flex-col min-h-0 p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: 'hsl(var(--primary) / 0.1)' }}
          >
            <Webhook size={18} style={{ color: 'hsl(var(--primary))' }} />
          </div>
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'hsl(var(--foreground))' }}>
              Webhook Event Logs
            </h1>
            <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Timestamped history of all incoming webhook events
            </p>
          </div>
        </div>
        <button
          onClick={() => fetchEvents(true)}
          disabled={refreshing}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-secondary"
          style={{ color: 'hsl(var(--muted-foreground))' }}
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div
        className="flex flex-wrap items-center gap-3 p-4 rounded-xl"
        style={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
      >
        {/* Search */}
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'hsl(var(--muted-foreground))' }} />
          <input
            type="text"
            placeholder="Search by Order ID…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-8 pr-3 py-2 text-sm rounded-lg outline-none"
            style={{
              backgroundColor: 'hsl(var(--secondary))',
              color: 'hsl(var(--foreground))',
              border: '1px solid hsl(var(--border))',
            }}
          />
        </div>

        {/* Topic filter */}
        <select
          value={filterTopic}
          onChange={(e) => { setFilterTopic(e.target.value); setPage(1); }}
          className="px-3 py-2 text-sm rounded-lg outline-none"
          style={{
            backgroundColor: 'hsl(var(--secondary))',
            color: 'hsl(var(--foreground))',
            border: '1px solid hsl(var(--border))',
          }}
        >
          <option value="">All Event Types</option>
          {topics.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        {/* Status filter */}
        <select
          value={filterStatus}
          onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
          className="px-3 py-2 text-sm rounded-lg outline-none"
          style={{
            backgroundColor: 'hsl(var(--secondary))',
            color: 'hsl(var(--foreground))',
            border: '1px solid hsl(var(--border))',
          }}
        >
          <option value="">All Statuses</option>
          <option value="success">Success (2xx)</option>
          <option value="error">Error (4xx/5xx)</option>
          <option value="pending">Pending</option>
        </select>

        <span className="text-xs ml-auto" style={{ color: 'hsl(var(--muted-foreground))' }}>
          {total} event{total !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      <div
        className="flex-1 rounded-xl overflow-hidden"
        style={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
      >
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 size={24} className="animate-spin" style={{ color: 'hsl(var(--primary))' }} />
          </div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3">
            <AlertCircle size={32} style={{ color: 'hsl(var(--muted-foreground))' }} />
            <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>No webhook events found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid hsl(var(--border))' }}>
                  {['Timestamp', 'Order ID', 'Event Type', 'Payload Preview', 'HTTP Status', 'Retries', 'Actions'].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide"
                      style={{ color: 'hsl(var(--muted-foreground))' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {events.map((event, idx) => {
                  const payloadKeys = Object.keys(event.payload_summary ?? {});
                  const payloadPreview = payloadKeys.length > 0
                    ? payloadKeys.slice(0, 3).join(', ') + (payloadKeys.length > 3 ? ` +${payloadKeys.length - 3} more` : '')
                    : '—';

                  return (
                    <tr
                      key={event.id}
                      className="transition-colors hover:bg-secondary/50"
                      style={{
                        borderBottom: idx < events.length - 1 ? '1px solid hsl(var(--border))' : 'none',
                      }}
                    >
                      {/* Timestamp */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-xs font-mono" style={{ color: 'hsl(var(--foreground))' }}>
                          {formatDateTime(event.received_at)}
                        </span>
                      </td>

                      {/* Order ID */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="font-medium text-xs" style={{ color: 'hsl(var(--foreground))' }}>
                          #{event.woo_order_id}
                        </span>
                      </td>

                      {/* Event Type */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <EventTypeBadge topic={event.topic} />
                      </td>

                      {/* Payload Preview */}
                      <td className="px-4 py-3 max-w-[200px]">
                        <span
                          className="text-xs truncate block"
                          style={{ color: 'hsl(var(--muted-foreground))' }}
                          title={payloadPreview}
                        >
                          {payloadPreview}
                        </span>
                        {event.error_message && (
                          <span className="text-xs text-red-500 truncate block" title={event.error_message}>
                            {event.error_message}
                          </span>
                        )}
                      </td>

                      {/* HTTP Status */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <HttpStatusBadge status={event.http_status} />
                      </td>

                      {/* Retry Count */}
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        <span
                          className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                            event.retry_count > 0 ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-500'
                          }`}
                        >
                          {event.retry_count}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setPreviewEvent(event)}
                            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors hover:bg-secondary"
                            style={{ color: 'hsl(var(--muted-foreground))' }}
                            title="View payload"
                          >
                            <Eye size={12} />
                            View
                          </button>
                          <button
                            onClick={() => handleResend(event)}
                            disabled={resendingId === event.id}
                            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors"
                            style={{
                              backgroundColor: 'hsl(var(--primary) / 0.1)',
                              color: 'hsl(var(--primary))',
                            }}
                            title="Resend / retry"
                          >
                            {resendingId === event.id ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <RotateCcw size={12} />
                            )}
                            Resend
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Page {page} of {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1.5 rounded-lg transition-colors hover:bg-secondary disabled:opacity-40"
              style={{ color: 'hsl(var(--foreground))' }}
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-1.5 rounded-lg transition-colors hover:bg-secondary disabled:opacity-40"
              style={{ color: 'hsl(var(--foreground))' }}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Payload Modal */}
      {previewEvent && (
        <PayloadModal event={previewEvent} onClose={() => setPreviewEvent(null)} />
      )}
    </div>
  );
}
