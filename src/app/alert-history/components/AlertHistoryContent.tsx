'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Mail,
  MessageSquare,
  RefreshCw,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AlertLog {
  id: string;
  template_id: string | null;
  trigger_type: string;
  channel: 'email' | 'sms' | 'whatsapp';
  recipient: string;
  subject: string | null;
  message?: string | null;
  status: string;
  error_message: string | null;
  order_id: string | null;
  message_sid?: string | null;
  metadata: Record<string, string> | null;
  sent_at: string;
  template_name?: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TRIGGER_LABELS: Record<string, string> = {
  new_assignment: 'New Assignment',
  delivery_failure: 'Delivery Failure',
  payment_issue: 'Payment Issue',
  daily_summary: 'Daily Summary',
  booking_accepted: 'Booking Accepted',
  booking_assigned: 'Booking Assigned',
  booking_out_for_delivery: 'Out for Delivery',
  booking_complete: 'Booking Complete',
  custom: 'Custom',
};

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { icon: React.ReactNode; cls: string; label: string }> = {
    sent: {
      icon: <CheckCircle2 size={12} />,
      cls: 'bg-green-100 text-green-700',
      label: 'Sent',
    },
    delivered: {
      icon: <CheckCircle2 size={12} />,
      cls: 'bg-green-100 text-green-700',
      label: 'Delivered',
    },
    failed: {
      icon: <XCircle size={12} />,
      cls: 'bg-red-100 text-red-700',
      label: 'Failed',
    },
    pending: {
      icon: <Clock size={12} />,
      cls: 'bg-yellow-100 text-yellow-700',
      label: 'Pending',
    },
    retrying: {
      icon: <RotateCcw size={12} />,
      cls: 'bg-blue-100 text-blue-700',
      label: 'Retrying',
    },
  };
  const cfg = map[status] ?? {
    icon: <AlertCircle size={12} />,
    cls: 'bg-gray-100 text-gray-600',
    label: status,
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.cls}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

function ChannelBadge({ channel }: { channel: 'email' | 'sms' | 'whatsapp' }) {
  if (channel === 'email') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
        <Mail size={11} /> Email
      </span>
    );
  }
  if (channel === 'whatsapp') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">
        <MessageSquare size={11} /> WhatsApp
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-50 text-purple-700">
      <MessageSquare size={11} /> SMS
    </span>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

export default function AlertHistoryContent() {
  const supabase = createClient();

  const [logs, setLogs] = useState<AlertLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [channelFilter, setChannelFilter] = useState<'all' | 'email' | 'sms' | 'whatsapp'>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [triggerFilter, setTriggerFilter] = useState<string>('all');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch email logs
      let emailQuery = supabase
        .from('email_alert_logs')
        .select('id, template_id, trigger_type, channel, recipient, subject, status, error_message, order_id, metadata, sent_at', { count: 'exact' });

      // Fetch SMS + WhatsApp logs (both stored in sms_alert_logs)
      let smsQuery = supabase
        .from('sms_alert_logs')
        .select('id, template_id, trigger_type, channel, recipient, message, status, error_message, order_id, message_sid, metadata, sent_at', { count: 'exact' });

      const [emailRes, smsRes] = await Promise.all([emailQuery, smsQuery]);

      const emailLogs: AlertLog[] = (emailRes.data ?? []).map((r: any) => ({ ...r, channel: 'email' as const }));
      const smsAndWaLogs: AlertLog[] = (smsRes.data ?? []).map((r: any) => ({
        ...r,
        channel: (r.channel === 'whatsapp' ? 'whatsapp' : 'sms') as 'sms' | 'whatsapp',
      }));

      // Fetch template names
      const templateIds = [...new Set([...emailLogs, ...smsAndWaLogs].map((l) => l.template_id).filter(Boolean))];
      let templateMap: Record<string, string> = {};
      if (templateIds.length > 0) {
        const { data: templates } = await supabase
          .from('message_templates')
          .select('id, name')
          .in('id', templateIds as string[]);
        (templates ?? []).forEach((t: any) => {
          templateMap[t.id] = t.name;
        });
      }

      let combined: AlertLog[] = [...emailLogs, ...smsAndWaLogs].map((l) => ({
        ...l,
        template_name: l.template_id ? templateMap[l.template_id] ?? null : null,
      }));

      // Client-side filters
      if (channelFilter !== 'all') combined = combined.filter((l) => l.channel === channelFilter);
      if (statusFilter !== 'all') combined = combined.filter((l) => l.status === statusFilter);
      if (triggerFilter !== 'all') combined = combined.filter((l) => l.trigger_type === triggerFilter);
      if (search.trim()) {
        const q = search.toLowerCase();
        combined = combined.filter(
          (l) =>
            l.recipient.toLowerCase().includes(q) ||
            (l.order_id ?? '').toLowerCase().includes(q) ||
            (l.subject ?? '').toLowerCase().includes(q) ||
            (l.template_name ?? '').toLowerCase().includes(q)
        );
      }

      // Sort by sent_at desc
      combined.sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime());

      setTotal(combined.length);
      setLogs(combined.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE));
    } catch (err) {
      console.error('Failed to fetch alert logs', err);
      toast.error('Failed to load alert history');
    } finally {
      setLoading(false);
    }
  }, [channelFilter, statusFilter, triggerFilter, search, page]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [channelFilter, statusFilter, triggerFilter, search]);

  const handleRetry = async (log: AlertLog) => {
    setRetryingId(log.id);
    try {
      let endpoint: string;
      let body: object;

      if (log.channel === 'email') {
        endpoint = '/api/alerts/send';
        body = {
          trigger_type: log.trigger_type,
          recipient_email: log.recipient,
          shortcodes: log.metadata ?? {},
        };
      } else if (log.channel === 'whatsapp') {
        endpoint = '/api/whatsapp-alerts/send';
        body = {
          trigger_type: log.trigger_type,
          recipient_phone: log.recipient,
          shortcodes: log.metadata ?? {},
        };
      } else {
        endpoint = '/api/sms-alerts/send';
        body = {
          trigger_type: log.trigger_type,
          recipient_phone: log.recipient,
          shortcodes: log.metadata ?? {},
        };
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        const channelLabel = log.channel === 'email' ? 'Email' : log.channel === 'whatsapp' ? 'WhatsApp' : 'SMS';
        toast.success(`${channelLabel} resent successfully`);
        fetchLogs();
      } else {
        toast.error(`Retry failed: ${data.error ?? 'Unknown error'}`);
      }
    } catch {
      toast.error('Retry request failed');
    } finally {
      setRetryingId(null);
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'hsl(var(--foreground))' }}>
            Alert History
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Sent email, SMS, and WhatsApp alert logs with delivery status and retry options
          </p>
        </div>
        <button
          onClick={fetchLogs}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-secondary"
          style={{ color: 'hsl(var(--muted-foreground))' }}
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Sent', value: total, color: 'hsl(var(--primary))' },
          {
            label: 'Delivered',
            value: logs.filter((l) => l.status === 'sent' || l.status === 'delivered').length,
            color: '#16a34a',
          },
          { label: 'Failed', value: logs.filter((l) => l.status === 'failed').length, color: '#dc2626' },
          { label: 'This Page', value: logs.length, color: 'hsl(var(--muted-foreground))' },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-xl border p-4"
            style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
          >
            <p className="text-xs font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>
              {s.label}
            </p>
            <p className="text-2xl font-bold mt-1" style={{ color: s.color }}>
              {s.value}
            </p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div
        className="rounded-xl border p-4 flex flex-wrap gap-3 items-center"
        style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
      >
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'hsl(var(--muted-foreground))' }} />
          <input
            type="text"
            placeholder="Search recipient, order ID, subject…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg border text-sm outline-none focus:ring-2"
            style={{
              backgroundColor: 'hsl(var(--background))',
              borderColor: 'hsl(var(--border))',
              color: 'hsl(var(--foreground))',
            }}
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Filter size={14} style={{ color: 'hsl(var(--muted-foreground))' }} />
          <select
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value as any)}
            className="px-3 py-2 rounded-lg border text-sm outline-none"
            style={{
              backgroundColor: 'hsl(var(--background))',
              borderColor: 'hsl(var(--border))',
              color: 'hsl(var(--foreground))',
            }}
          >
            <option value="all">All Channels</option>
            <option value="email">Email</option>
            <option value="sms">SMS</option>
            <option value="whatsapp">WhatsApp</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border text-sm outline-none"
            style={{
              backgroundColor: 'hsl(var(--background))',
              borderColor: 'hsl(var(--border))',
              color: 'hsl(var(--foreground))',
            }}
          >
            <option value="all">All Statuses</option>
            <option value="sent">Sent</option>
            <option value="delivered">Delivered</option>
            <option value="failed">Failed</option>
            <option value="pending">Pending</option>
          </select>

          <select
            value={triggerFilter}
            onChange={(e) => setTriggerFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border text-sm outline-none"
            style={{
              backgroundColor: 'hsl(var(--background))',
              borderColor: 'hsl(var(--border))',
              color: 'hsl(var(--foreground))',
            }}
          >
            <option value="all">All Triggers</option>
            {Object.entries(TRIGGER_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div
        className="rounded-xl border overflow-hidden"
        style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
      >
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={28} className="animate-spin" style={{ color: 'hsl(var(--primary))' }} />
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Mail size={40} style={{ color: 'hsl(var(--muted-foreground))' }} />
            <p className="text-sm font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>
              No alert logs found
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr
                  className="border-b text-xs font-semibold uppercase tracking-wide"
                  style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}
                >
                  <th className="px-4 py-3 text-left">Timestamp</th>
                  <th className="px-4 py-3 text-left">Channel</th>
                  <th className="px-4 py-3 text-left">Recipient</th>
                  <th className="px-4 py-3 text-left">Trigger</th>
                  <th className="px-4 py-3 text-left">Template</th>
                  <th className="px-4 py-3 text-left">Subject / Message</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <>
                    <tr
                      key={log.id}
                      className="border-b transition-colors hover:bg-secondary/40 cursor-pointer"
                      style={{ borderColor: 'hsl(var(--border))' }}
                      onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                    >
                      <td className="px-4 py-3 whitespace-nowrap" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        {formatDateTime(log.sent_at)}
                      </td>
                      <td className="px-4 py-3">
                        <ChannelBadge channel={log.channel} />
                      </td>
                      <td className="px-4 py-3 max-w-[160px] truncate font-medium" style={{ color: 'hsl(var(--foreground))' }}>
                        {log.recipient}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-secondary" style={{ color: 'hsl(var(--foreground))' }}>
                          {TRIGGER_LABELS[log.trigger_type] ?? log.trigger_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 max-w-[140px] truncate text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        {log.template_name ?? <span className="italic">—</span>}
                      </td>
                      <td className="px-4 py-3 max-w-[200px] truncate text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        {log.channel === 'email' ? (log.subject ?? '—') : (log.message ?? '—')}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={log.status} />
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRetry(log);
                          }}
                          disabled={retryingId === log.id}
                          title="Retry sending"
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-secondary disabled:opacity-50"
                          style={{ color: 'hsl(var(--primary))' }}
                        >
                          {retryingId === log.id ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <RotateCcw size={12} />
                          )}
                          Retry
                        </button>
                      </td>
                    </tr>
                    {expandedId === log.id && (
                      <tr key={`${log.id}-expanded`} style={{ backgroundColor: 'hsl(var(--secondary) / 0.4)' }}>
                        <td colSpan={8} className="px-6 py-4">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                            <div className="space-y-1.5">
                              <p className="font-semibold text-sm" style={{ color: 'hsl(var(--foreground))' }}>
                                Log Details
                              </p>
                              <p style={{ color: 'hsl(var(--muted-foreground))' }}>
                                <span className="font-medium">Log ID:</span> {log.id}
                              </p>
                              {log.order_id && (
                                <p style={{ color: 'hsl(var(--muted-foreground))' }}>
                                  <span className="font-medium">Order ID:</span> {log.order_id}
                                </p>
                              )}
                              {log.message_sid && (
                                <p style={{ color: 'hsl(var(--muted-foreground))' }}>
                                  <span className="font-medium">Twilio SID:</span> {log.message_sid}
                                </p>
                              )}
                              {log.error_message && (
                                <p className="text-red-600">
                                  <span className="font-medium">Error:</span> {log.error_message}
                                </p>
                              )}
                            </div>
                            {log.metadata && Object.keys(log.metadata).length > 0 && (
                              <div className="space-y-1.5">
                                <p className="font-semibold text-sm" style={{ color: 'hsl(var(--foreground))' }}>
                                  Shortcode Data
                                </p>
                                {Object.entries(log.metadata).map(([k, v]) => (
                                  <p key={k} style={{ color: 'hsl(var(--muted-foreground))' }}>
                                    <span className="font-medium">{k}:</span> {String(v)}
                                  </p>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div
            className="flex items-center justify-between px-4 py-3 border-t"
            style={{ borderColor: 'hsl(var(--border))' }}
          >
            <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="p-1.5 rounded-lg hover:bg-secondary disabled:opacity-40 transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-xs font-medium">
                {page + 1} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="p-1.5 rounded-lg hover:bg-secondary disabled:opacity-40 transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
