'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Mail, MessageSquare, Plus, Pencil, Trash2, ToggleLeft, ToggleRight, ChevronDown, ChevronUp, X, Save, AlertCircle, Bell, Zap, Info, Send } from 'lucide-react';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

type Channel = 'email' | 'sms' | 'whatsapp';

type TriggerType =
  | 'new_assignment' |'delivery_failure' |'payment_issue' |'daily_summary' |'booking_accepted' |'booking_assigned' |'booking_out_for_delivery' |'booking_complete' |'custom';

interface MessageTemplate {
  id: string;
  name: string;
  channel: Channel;
  trigger_type: TriggerType;
  subject: string | null;
  body: string;
  is_active: boolean;
  is_admin_alert: boolean;
  description: string | null;
  created_at: string;
  updated_at: string;
}

interface TemplateFormData {
  name: string;
  channel: Channel;
  trigger_type: TriggerType;
  subject: string;
  body: string;
  is_active: boolean;
  is_admin_alert: boolean;
  description: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TRIGGER_LABELS: Record<TriggerType, string> = {
  new_assignment: 'New Assignment',
  delivery_failure: 'Delivery Failure',
  payment_issue: 'Payment Issue',
  daily_summary: 'Daily Summary Digest',
  booking_accepted: 'Booking Accepted',
  booking_assigned: 'Booking Assigned',
  booking_out_for_delivery: 'Out For Delivery',
  booking_complete: 'Booking Complete',
  custom: 'Custom',
};

const TRIGGER_COLORS: Record<TriggerType, string> = {
  new_assignment: 'bg-blue-100 text-blue-700',
  delivery_failure: 'bg-red-100 text-red-700',
  payment_issue: 'bg-orange-100 text-orange-700',
  daily_summary: 'bg-purple-100 text-purple-700',
  booking_accepted: 'bg-green-100 text-green-700',
  booking_assigned: 'bg-yellow-100 text-yellow-700',
  booking_out_for_delivery: 'bg-cyan-100 text-cyan-700',
  booking_complete: 'bg-emerald-100 text-emerald-700',
  custom: 'bg-gray-100 text-gray-700',
};

const SHORTCODES = [
  { code: '{{customer_name}}', description: 'Customer full name' },
  { code: '{{address}}', description: 'Delivery address' },
  { code: '{{items}}', description: 'Order items list' },
  { code: '{{status}}', description: 'Current order status' },
  { code: '{{order_id}}', description: 'Order / booking ID' },
  { code: '{{tracking_link}}', description: 'Customer tracking URL' },
  { code: '{{date}}', description: 'Current date' },
  { code: '{{total_bookings}}', description: 'Total bookings (digest)' },
  { code: '{{completed_bookings}}', description: 'Completed bookings (digest)' },
  { code: '{{failed_bookings}}', description: 'Failed bookings (digest)' },
  { code: '{{pending_bookings}}', description: 'Pending bookings (digest)' },
];

const EMPTY_FORM: TemplateFormData = {
  name: '',
  channel: 'email',
  trigger_type: 'custom',
  subject: '',
  body: '',
  is_active: true,
  is_admin_alert: false,
  description: '',
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function MessageTemplatesContent() {
  const supabase = createClient();

  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TemplateFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterChannel, setFilterChannel] = useState<'all' | Channel>('all');
  const [showShortcodes, setShowShortcodes] = useState(false);
  const [testSmsPhone, setTestSmsPhone] = useState<Record<string, string>>({});
  const [testingSmsId, setTestingSmsId] = useState<string | null>(null);
  const [testWhatsAppPhone, setTestWhatsAppPhone] = useState<Record<string, string>>({});
  const [testingWhatsAppId, setTestingWhatsAppId] = useState<string | null>(null);

  // ─── Fetch ──────────────────────────────────────────────────────────────────

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('message_templates')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('Failed to load templates');
    } else {
      setTemplates(data ?? []);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  // ─── Handlers ───────────────────────────────────────────────────────────────

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
    setShowShortcodes(false);
  };

  const openEdit = (t: MessageTemplate) => {
    setEditingId(t.id);
    setForm({
      name: t.name,
      channel: t.channel,
      trigger_type: t.trigger_type,
      subject: t.subject ?? '',
      body: t.body,
      is_active: t.is_active,
      is_admin_alert: t.is_admin_alert,
      description: t.description ?? '',
    });
    setShowForm(true);
    setShowShortcodes(false);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Template name is required'); return; }
    if (!form.body.trim()) { toast.error('Template body is required'); return; }
    if (form.channel === 'email' && !form.subject.trim()) { toast.error('Subject is required for email templates'); return; }

    setSaving(true);
    const payload = {
      name: form.name.trim(),
      channel: form.channel,
      trigger_type: form.trigger_type,
      subject: form.channel === 'email' ? form.subject.trim() : null,
      body: form.body.trim(),
      is_active: form.is_active,
      is_admin_alert: form.is_admin_alert,
      description: form.description.trim() || null,
    };

    let error;
    if (editingId) {
      ({ error } = await supabase.from('message_templates').update(payload).eq('id', editingId));
    } else {
      ({ error } = await supabase.from('message_templates').insert(payload));
    }

    if (error) {
      toast.error(error.message);
    } else {
      toast.success(editingId ? 'Template updated' : 'Template created');
      closeForm();
      fetchTemplates();
    }
    setSaving(false);
  };

  const handleToggleActive = async (t: MessageTemplate) => {
    const { error } = await supabase
      .from('message_templates')
      .update({ is_active: !t.is_active })
      .eq('id', t.id);

    if (error) {
      toast.error('Failed to update template');
    } else {
      toast.success(t.is_active ? 'Template disabled' : 'Template enabled');
      setTemplates((prev) =>
        prev.map((item) => (item.id === t.id ? { ...item, is_active: !t.is_active } : item))
      );
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('message_templates').delete().eq('id', id);
    if (error) {
      toast.error('Failed to delete template');
    } else {
      toast.success('Template deleted');
      setTemplates((prev) => prev.filter((t) => t.id !== id));
    }
    setDeleteConfirmId(null);
  };

  const insertShortcode = (code: string) => {
    setForm((prev) => ({ ...prev, body: prev.body + code }));
  };

  const handleTestSms = async (t: MessageTemplate) => {
    const phone = testSmsPhone[t.id]?.trim();
    if (!phone) {
      toast.error('Enter a phone number to test');
      return;
    }
    setTestingSmsId(t.id);
    try {
      const res = await fetch('/api/sms-alerts/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trigger_type: t.trigger_type,
          recipient_phone: phone,
          shortcodes: {
            customer_name: 'Test Customer',
            order_id: 'TEST-001',
            address: '123 Test Street',
            items: 'Bouncy Castle x1',
            status: 'Test',
            tracking_link: 'https://example.com/track/TEST-001',
            date: new Date().toLocaleDateString(),
          },
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Test SMS sent successfully!');
      } else if (data.skipped) {
        toast.info('No active SMS template found for this trigger');
      } else {
        toast.error(data.error || 'Failed to send test SMS');
      }
    } catch {
      toast.error('Failed to send test SMS');
    } finally {
      setTestingSmsId(null);
    }
  };

  const handleTestWhatsApp = async (t: MessageTemplate) => {
    const phone = testWhatsAppPhone[t.id]?.trim();
    if (!phone) {
      toast.error('Enter a phone number to test');
      return;
    }
    setTestingWhatsAppId(t.id);
    try {
      const res = await fetch('/api/whatsapp-alerts/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trigger_type: t.trigger_type,
          recipient_phone: phone,
          shortcodes: {
            customer_name: 'Test Customer',
            order_id: 'TEST-001',
            address: '123 Test Street',
            items: 'Bouncy Castle x1',
            status: 'Test',
            tracking_link: 'https://example.com/track/TEST-001',
            date: new Date().toLocaleDateString(),
          },
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Test WhatsApp message sent successfully!');
      } else if (data.skipped) {
        toast.info('No active WhatsApp template found for this trigger');
      } else {
        toast.error(data.error || 'Failed to send test WhatsApp message');
      }
    } catch {
      toast.error('Failed to send test WhatsApp message');
    } finally {
      setTestingWhatsAppId(null);
    }
  };

  // ─── Filtered Templates ──────────────────────────────────────────────────────

  const filtered = templates.filter((t) =>
    filterChannel === 'all' ? true : t.channel === filterChannel
  );

  const emailCount = templates.filter((t) => t.channel === 'email').length;
  const smsCount = templates.filter((t) => t.channel === 'sms').length;
  const whatsappCount = templates.filter((t) => t.channel === 'whatsapp').length;
  const activeCount = templates.filter((t) => t.is_active).length;

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'hsl(var(--foreground))' }}>
            Message Templates
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Manage email, SMS, and WhatsApp templates with dynamic shortcodes and trigger controls
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: 'hsl(var(--primary))' }}
        >
          <Plus size={16} />
          New Template
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: 'Total Templates', value: templates.length, icon: Mail, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Email Templates', value: emailCount, icon: Mail, color: 'text-indigo-600', bg: 'bg-indigo-50' },
          { label: 'SMS Templates', value: smsCount, icon: MessageSquare, color: 'text-green-600', bg: 'bg-green-50' },
          { label: 'WhatsApp Templates', value: whatsappCount, icon: MessageSquare, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Active', value: activeCount, icon: Zap, color: 'text-amber-600', bg: 'bg-amber-50' },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl p-4 flex items-center gap-3"
            style={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
          >
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${stat.bg}`}>
              <stat.icon size={20} className={stat.color} />
            </div>
            <div>
              <p className="text-xl font-bold" style={{ color: 'hsl(var(--foreground))' }}>{stat.value}</p>
              <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 flex-wrap">
        {(['all', 'email', 'sms', 'whatsapp'] as const).map((ch) => (
          <button
            key={ch}
            onClick={() => setFilterChannel(ch)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filterChannel === ch
                ? 'text-white' : 'hover:bg-secondary'
            }`}
            style={
              filterChannel === ch
                ? { backgroundColor: 'hsl(var(--primary))' }
                : { color: 'hsl(var(--muted-foreground))' }
            }
          >
            {ch === 'all' ? 'All' : ch === 'email' ? '✉️ Email' : ch === 'sms' ? '💬 SMS' : '💚 WhatsApp'}
          </button>
        ))}
      </div>

      {/* Templates List */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'hsl(var(--primary))' }} />
        </div>
      ) : filtered.length === 0 ? (
        <div
          className="rounded-xl p-12 text-center"
          style={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
        >
          <Mail size={40} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium" style={{ color: 'hsl(var(--foreground))' }}>No templates found</p>
          <p className="text-sm mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Create your first template to get started
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((t) => (
            <div
              key={t.id}
              className="rounded-xl overflow-hidden"
              style={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
            >
              {/* Card Header */}
              <div className="flex items-center gap-3 p-4">
                {/* Channel Icon */}
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                    t.channel === 'email' ? 'bg-blue-50' : t.channel === 'whatsapp' ? 'bg-emerald-50' : 'bg-green-50'
                  }`}
                >
                  {t.channel === 'email' ? (
                    <Mail size={18} className="text-blue-600" />
                  ) : t.channel === 'whatsapp' ? (
                    <MessageSquare size={18} className="text-emerald-600" />
                  ) : (
                    <MessageSquare size={18} className="text-green-600" />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm" style={{ color: 'hsl(var(--foreground))' }}>
                      {t.name}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TRIGGER_COLORS[t.trigger_type]}`}>
                      {TRIGGER_LABELS[t.trigger_type]}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      t.channel === 'email' ? 'bg-blue-100 text-blue-700' :
                      t.channel === 'whatsapp'? 'bg-emerald-100 text-emerald-700' : 'bg-green-100 text-green-700'
                    }`}>
                      {t.channel === 'email' ? '✉️ Email' : t.channel === 'whatsapp' ? '💚 WhatsApp' : '💬 SMS'}
                    </span>
                    {t.is_admin_alert && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-violet-100 text-violet-700 flex items-center gap-1">
                        <Bell size={10} /> Admin Alert
                      </span>
                    )}
                  </div>
                  {t.description && (
                    <p className="text-xs mt-0.5 truncate" style={{ color: 'hsl(var(--muted-foreground))' }}>
                      {t.description}
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  {/* Toggle Active */}
                  <button
                    onClick={() => handleToggleActive(t)}
                    className="p-1.5 rounded-lg transition-colors hover:bg-secondary"
                    title={t.is_active ? 'Disable template' : 'Enable template'}
                  >
                    {t.is_active ? (
                      <ToggleRight size={22} className="text-emerald-500" />
                    ) : (
                      <ToggleLeft size={22} style={{ color: 'hsl(var(--muted-foreground))' }} />
                    )}
                  </button>

                  {/* Edit */}
                  <button
                    onClick={() => openEdit(t)}
                    className="p-1.5 rounded-lg transition-colors hover:bg-secondary"
                    title="Edit template"
                  >
                    <Pencil size={15} style={{ color: 'hsl(var(--muted-foreground))' }} />
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => setDeleteConfirmId(t.id)}
                    className="p-1.5 rounded-lg transition-colors hover:bg-red-50"
                    title="Delete template"
                  >
                    <Trash2 size={15} className="text-red-500" />
                  </button>

                  {/* Expand */}
                  <button
                    onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}
                    className="p-1.5 rounded-lg transition-colors hover:bg-secondary"
                  >
                    {expandedId === t.id ? (
                      <ChevronUp size={16} style={{ color: 'hsl(var(--muted-foreground))' }} />
                    ) : (
                      <ChevronDown size={16} style={{ color: 'hsl(var(--muted-foreground))' }} />
                    )}
                  </button>
                </div>
              </div>

              {/* Expanded Body Preview */}
              {expandedId === t.id && (
                <div
                  className="px-4 pb-4 pt-0 border-t"
                  style={{ borderColor: 'hsl(var(--border))' }}
                >
                  {t.subject && (
                    <div className="mt-3 mb-2">
                      <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        Subject
                      </span>
                      <p className="text-sm mt-0.5" style={{ color: 'hsl(var(--foreground))' }}>{t.subject}</p>
                    </div>
                  )}
                  <div className="mt-2">
                    <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'hsl(var(--muted-foreground))' }}>
                      Body
                    </span>
                    <div
                      className="mt-1 p-3 rounded-lg text-sm font-mono whitespace-pre-wrap break-words"
                      style={{
                        backgroundColor: 'hsl(var(--secondary))',
                        color: 'hsl(var(--foreground))',
                        maxHeight: '200px',
                        overflowY: 'auto',
                      }}
                    >
                      {t.body}
                    </div>
                  </div>

                  {/* Test SMS Panel */}
                  {t.channel === 'sms' && (
                    <div className="mt-3 pt-3 border-t" style={{ borderColor: 'hsl(var(--border))' }}>
                      <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        Test SMS via Twilio
                      </p>
                      <div className="flex gap-2">
                        <input
                          type="tel"
                          placeholder="+1234567890"
                          value={testSmsPhone[t.id] ?? ''}
                          onChange={(e) =>
                            setTestSmsPhone((prev) => ({ ...prev, [t.id]: e.target.value }))
                          }
                          className="flex-1 px-3 py-1.5 rounded-lg text-sm border outline-none focus:ring-1"
                          style={{
                            backgroundColor: 'hsl(var(--background))',
                            borderColor: 'hsl(var(--border))',
                            color: 'hsl(var(--foreground))',
                          }}
                        />
                        <button
                          onClick={() => handleTestSms(t)}
                          disabled={testingSmsId === t.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                          style={{ backgroundColor: 'hsl(var(--primary))' }}
                        >
                          {testingSmsId === t.id ? (
                            <div className="w-3.5 h-3.5 border border-white border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Send size={13} />
                          )}
                          Send Test
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Test WhatsApp Panel */}
                  {t.channel === 'whatsapp' && (
                    <div className="mt-3 pt-3 border-t" style={{ borderColor: 'hsl(var(--border))' }}>
                      <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        Test WhatsApp via Twilio
                      </p>
                      <div className="flex gap-2">
                        <input
                          type="tel"
                          placeholder="+1234567890"
                          value={testWhatsAppPhone[t.id] ?? ''}
                          onChange={(e) =>
                            setTestWhatsAppPhone((prev) => ({ ...prev, [t.id]: e.target.value }))
                          }
                          className="flex-1 px-3 py-1.5 rounded-lg text-sm border outline-none focus:ring-1"
                          style={{
                            backgroundColor: 'hsl(var(--background))',
                            borderColor: 'hsl(var(--border))',
                            color: 'hsl(var(--foreground))',
                          }}
                        />
                        <button
                          onClick={() => handleTestWhatsApp(t)}
                          disabled={testingWhatsAppId === t.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                          style={{ backgroundColor: '#25D366' }}
                        >
                          {testingWhatsAppId === t.id ? (
                            <div className="w-3.5 h-3.5 border border-white border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Send size={13} />
                          )}
                          Send Test
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Delete Confirm */}
              {deleteConfirmId === t.id && (
                <div
                  className="px-4 py-3 border-t flex items-center justify-between gap-3"
                  style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--destructive) / 0.05)' }}
                >
                  <div className="flex items-center gap-2 text-sm" style={{ color: 'hsl(var(--destructive))' }}>
                    <AlertCircle size={15} />
                    Are you sure you want to delete this template?
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setDeleteConfirmId(null)}
                      className="px-3 py-1 text-xs rounded-lg hover:bg-secondary transition-colors"
                      style={{ color: 'hsl(var(--muted-foreground))' }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleDelete(t.id)}
                      className="px-3 py-1 text-xs rounded-lg text-white transition-opacity hover:opacity-90"
                      style={{ backgroundColor: 'hsl(var(--destructive))' }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ─── Create / Edit Modal ─────────────────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div
            className="w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh]"
            style={{ backgroundColor: 'hsl(var(--card))' }}
          >
            {/* Modal Header */}
            <div
              className="flex items-center justify-between px-6 py-4 border-b shrink-0"
              style={{ borderColor: 'hsl(var(--border))' }}
            >
              <h2 className="text-lg font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
                {editingId ? 'Edit Template' : 'New Template'}
              </h2>
              <button onClick={closeForm} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
                <X size={18} style={{ color: 'hsl(var(--muted-foreground))' }} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'hsl(var(--foreground))' }}>
                  Template Name *
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. New Assignment Alert"
                  className="w-full px-3 py-2 rounded-lg text-sm border outline-none focus:ring-2"
                  style={{
                    backgroundColor: 'hsl(var(--background))',
                    borderColor: 'hsl(var(--border))',
                    color: 'hsl(var(--foreground))',
                  }}
                />
              </div>

              {/* Channel + Trigger */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'hsl(var(--foreground))' }}>
                    Channel *
                  </label>
                  <select
                    value={form.channel}
                    onChange={(e) => setForm((p) => ({ ...p, channel: e.target.value as Channel }))}
                    className="w-full px-3 py-2 rounded-lg text-sm border outline-none"
                    style={{
                      backgroundColor: 'hsl(var(--background))',
                      borderColor: 'hsl(var(--border))',
                      color: 'hsl(var(--foreground))',
                    }}
                  >
                    <option value="email">✉️ Email</option>
                    <option value="sms">💬 SMS</option>
                    <option value="whatsapp">💚 WhatsApp</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'hsl(var(--foreground))' }}>
                    Trigger *
                  </label>
                  <select
                    value={form.trigger_type}
                    onChange={(e) => setForm((p) => ({ ...p, trigger_type: e.target.value as TriggerType }))}
                    className="w-full px-3 py-2 rounded-lg text-sm border outline-none"
                    style={{
                      backgroundColor: 'hsl(var(--background))',
                      borderColor: 'hsl(var(--border))',
                      color: 'hsl(var(--foreground))',
                    }}
                  >
                    {(Object.keys(TRIGGER_LABELS) as TriggerType[]).map((k) => (
                      <option key={k} value={k}>{TRIGGER_LABELS[k]}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Subject (email only) */}
              {form.channel === 'email' && (
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'hsl(var(--foreground))' }}>
                    Subject *
                  </label>
                  <input
                    type="text"
                    value={form.subject}
                    onChange={(e) => setForm((p) => ({ ...p, subject: e.target.value }))}
                    placeholder="e.g. New Booking Assigned – {{order_id}}"
                    className="w-full px-3 py-2 rounded-lg text-sm border outline-none"
                    style={{
                      backgroundColor: 'hsl(var(--background))',
                      borderColor: 'hsl(var(--border))',
                      color: 'hsl(var(--foreground))',
                    }}
                  />
                </div>
              )}

              {/* Body */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-medium" style={{ color: 'hsl(var(--foreground))' }}>
                    Body *
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowShortcodes((p) => !p)}
                    className="text-xs flex items-center gap-1 px-2 py-1 rounded-md hover:bg-secondary transition-colors"
                    style={{ color: 'hsl(var(--primary))' }}
                  >
                    <Info size={12} />
                    {showShortcodes ? 'Hide' : 'Show'} Shortcodes
                  </button>
                </div>

                {/* Shortcodes Panel */}
                {showShortcodes && (
                  <div
                    className="mb-2 p-3 rounded-lg border"
                    style={{ backgroundColor: 'hsl(var(--secondary))', borderColor: 'hsl(var(--border))' }}
                  >
                    <p className="text-xs font-semibold mb-2" style={{ color: 'hsl(var(--muted-foreground))' }}>
                      Click to insert shortcode into body:
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {SHORTCODES.map((sc) => (
                        <button
                          key={sc.code}
                          type="button"
                          onClick={() => insertShortcode(sc.code)}
                          title={sc.description}
                          className="text-xs px-2 py-1 rounded-md font-mono border hover:bg-primary hover:text-white transition-colors"
                          style={{
                            backgroundColor: 'hsl(var(--background))',
                            borderColor: 'hsl(var(--border))',
                            color: 'hsl(var(--primary))',
                          }}
                        >
                          {sc.code}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <textarea
                  value={form.body}
                  onChange={(e) => setForm((p) => ({ ...p, body: e.target.value }))}
                  rows={6}
                  placeholder={
                    form.channel === 'email' ?'<p>Hi {{customer_name}},</p><p>Your order {{order_id}} has been assigned...</p>' :'Hi {{customer_name}}, your order {{order_id}} is out for delivery! Track: {{tracking_link}}'
                  }
                  className="w-full px-3 py-2 rounded-lg text-sm border outline-none font-mono resize-y"
                  style={{
                    backgroundColor: 'hsl(var(--background))',
                    borderColor: 'hsl(var(--border))',
                    color: 'hsl(var(--foreground))',
                  }}
                />
                <p className="text-xs mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  {form.channel === 'email' ?'HTML is supported. Use shortcodes like {{customer_name}} for dynamic content.'
                    : form.channel === 'whatsapp' ?'Plain text only. WhatsApp supports *bold*, _italic_ formatting. Use shortcodes for dynamic content.' :'Plain text only. Use shortcodes for dynamic content.'}
                </p>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'hsl(var(--foreground))' }}>
                  Description (optional)
                </label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  placeholder="Brief description of when this template is used"
                  className="w-full px-3 py-2 rounded-lg text-sm border outline-none"
                  style={{
                    backgroundColor: 'hsl(var(--background))',
                    borderColor: 'hsl(var(--border))',
                    color: 'hsl(var(--foreground))',
                  }}
                />
              </div>

              {/* Toggles */}
              <div className="flex gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))}
                    className="w-4 h-4 rounded"
                  />
                  <span className="text-sm" style={{ color: 'hsl(var(--foreground))' }}>Active</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.is_admin_alert}
                    onChange={(e) => setForm((p) => ({ ...p, is_admin_alert: e.target.checked }))}
                    className="w-4 h-4 rounded"
                  />
                  <span className="text-sm" style={{ color: 'hsl(var(--foreground))' }}>Admin Alert</span>
                </label>
              </div>
            </div>

            {/* Modal Footer */}
            <div
              className="flex items-center justify-end gap-3 px-6 py-4 border-t shrink-0"
              style={{ borderColor: 'hsl(var(--border))' }}
            >
              <button
                onClick={closeForm}
                className="px-4 py-2 rounded-lg text-sm hover:bg-secondary transition-colors"
                style={{ color: 'hsl(var(--muted-foreground))' }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                style={{ backgroundColor: 'hsl(var(--primary))' }}
              >
                {saving ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Save size={15} />
                )}
                {editingId ? 'Save Changes' : 'Create Template'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
