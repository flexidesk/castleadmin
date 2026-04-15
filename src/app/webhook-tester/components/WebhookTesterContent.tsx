'use client';

import { useState, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import {
  Send,
  Plus,
  Trash2,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  CheckCircle2,
  Clock,
  Zap,
  FlaskConical,
  ArrowDownToLine,
  ArrowUpFromLine,
  RefreshCw,
} from 'lucide-react';

const WEBHOOK_DISPLAY_URL = '/api/woocommerce/webhook';

interface KeyValuePair {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
}

interface ValidationError {
  field: string;
  message: string;
}

interface TestResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: unknown;
  duration: number;
  timestamp: string;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md transition-colors"
      style={{
        backgroundColor: copied ? 'hsl(var(--primary) / 0.15)' : 'hsl(var(--secondary))',
        color: copied ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
      }}
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function StatusBadge({ status }: { status: number }) {
  const isSuccess = status >= 200 && status < 300;
  const isRedirect = status >= 300 && status < 400;
  const isClientError = status >= 400 && status < 500;
  const isServerError = status >= 500;

  let bg = 'hsl(var(--muted))';
  let color = 'hsl(var(--muted-foreground))';

  if (isSuccess) { bg = 'hsl(142 76% 36% / 0.15)'; color = 'hsl(142 76% 36%)'; }
  else if (isRedirect) { bg = 'hsl(38 92% 50% / 0.15)'; color = 'hsl(38 92% 50%)'; }
  else if (isClientError || isServerError) { bg = 'hsl(0 84% 60% / 0.15)'; color = 'hsl(0 84% 60%)'; }

  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold" style={{ backgroundColor: bg, color }}>
      {isSuccess ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
      {status}
    </span>
  );
}

const GET_PRESETS = [
  {
    label: 'Verification Ping',
    description: 'Test that the webhook endpoint is reachable',
    params: [],
  },
  {
    label: 'Create Booking',
    description: 'Create a new booking via GET parameters',
    params: [
      { key: 'external_id', value: 'TEST-001' },
      { key: 'customer_name', value: 'John Smith' },
      { key: 'customer_email', value: 'john@example.com' },
      { key: 'customer_phone', value: '07700900000' },
      { key: 'booking_date', value: new Date().toISOString().split('T')[0] },
      { key: 'booking_type', value: 'Standard' },
      { key: 'payment_method', value: 'card' },
      { key: 'payment_status', value: 'paid' },
      { key: 'payment_amount', value: '49.99' },
      { key: 'delivery_address', value: '10 Downing Street, London, SW1A 2AA' },
    ],
  },
];

const POST_PRESETS = [
  {
    label: 'Update Status',
    description: 'Update booking status to Processing',
    body: {
      external_id: 'TEST-001',
      status: 'Booking Accepted',
    },
  },
  {
    label: 'Full Update',
    description: 'Update booking with all common fields',
    body: {
      external_id: 'TEST-001',
      status: 'Out For Delivery',
      customer_name: 'John Smith',
      customer_email: 'john@example.com',
      customer_phone: '07700900000',
      delivery_address: '10 Downing Street, London, SW1A 2AA',
      notes: 'Leave at door',
      products: [
        { name: 'Widget A', sku: 'WGT-001', quantity: 2, price: 24.99 },
      ],
    },
  },
];

function generateId() {
  return Math.random().toString(36).slice(2, 9);
}

export default function WebhookTesterContent() {
  const [method, setMethod] = useState<'GET' | 'POST'>('GET');
  const [queryParams, setQueryParams] = useState<KeyValuePair[]>([
    { id: generateId(), key: '', value: '', enabled: true },
  ]);
  const [postBody, setPostBody] = useState('{\n  \n}');
  const [postBodyError, setPostBodyError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<TestResponse | null>(null);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [showHeaders, setShowHeaders] = useState(false);
  const [showPresets, setShowPresets] = useState(false);

  const buildDisplayUrl = useCallback(() => {
    const enabled = queryParams.filter(p => p.enabled && p.key.trim());
    if (enabled.length === 0) return WEBHOOK_DISPLAY_URL;
    const qs = enabled.map(p => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`).join('&');
    return `${WEBHOOK_DISPLAY_URL}?${qs}`;
  }, [queryParams]);

  const addParam = () => {
    setQueryParams(prev => [...prev, { id: generateId(), key: '', value: '', enabled: true }]);
  };

  const removeParam = (id: string) => {
    setQueryParams(prev => prev.filter(p => p.id !== id));
  };

  const updateParam = (id: string, field: 'key' | 'value' | 'enabled', value: string | boolean) => {
    setQueryParams(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
  };

  const validatePostBody = (raw: string): { valid: boolean; parsed?: unknown; error?: string } => {
    try {
      const parsed = JSON.parse(raw);
      return { valid: true, parsed };
    } catch (e) {
      return { valid: false, error: (e as Error).message };
    }
  };

  const handlePostBodyChange = (val: string) => {
    setPostBody(val);
    const result = validatePostBody(val);
    setPostBodyError(result.valid ? null : result.error ?? 'Invalid JSON');
  };

  const validatePayloadStructure = (parsed: unknown): ValidationError[] => {
    const errors: ValidationError[] = [];
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      errors.push({ field: 'root', message: 'Payload must be a JSON object' });
      return errors;
    }
    const obj = parsed as Record<string, unknown>;

    if (!obj.external_id) errors.push({ field: 'external_id', message: 'Required field missing' });

    const validStatuses = ['Booking Accepted', 'Booking Completed', 'Booking Cancelled', 'Out For Delivery', 'Delivered', 'Pending'];
    if (obj.status && !validStatuses.includes(obj.status as string)) {
      errors.push({ field: 'status', message: `Invalid status. Valid: ${validStatuses.join(', ')}` });
    }

    const validPaymentMethods = ['card', 'cash', 'bank_transfer', 'other'];
    if (obj.payment_method && !validPaymentMethods.includes(obj.payment_method as string)) {
      errors.push({ field: 'payment_method', message: `Invalid payment_method. Valid: ${validPaymentMethods.join(', ')}` });
    }

    const validPaymentStatuses = ['paid', 'unpaid', 'partial', 'refunded'];
    if (obj.payment_status && !validPaymentStatuses.includes(obj.payment_status as string)) {
      errors.push({ field: 'payment_status', message: `Invalid payment_status. Valid: ${validPaymentStatuses.join(', ')}` });
    }

    if (obj.payment_amount !== undefined && isNaN(Number(obj.payment_amount))) {
      errors.push({ field: 'payment_amount', message: 'Must be a numeric value' });
    }

    if (obj.booking_date && !/^\d{4}-\d{2}-\d{2}$/.test(obj.booking_date as string)) {
      errors.push({ field: 'booking_date', message: 'Must be YYYY-MM-DD format' });
    }

    if (obj.products !== undefined) {
      if (!Array.isArray(obj.products)) {
        errors.push({ field: 'products', message: 'Must be an array' });
      } else {
        (obj.products as unknown[]).forEach((item, i) => {
          if (typeof item !== 'object' || item === null) {
            errors.push({ field: `products[${i}]`, message: 'Each product must be an object' });
          }
        });
      }
    }

    return errors;
  };

  const sendRequest = async () => {
    setLoading(true);
    setResponse(null);
    setValidationErrors([]);

    if (method === 'POST') {
      const result = validatePostBody(postBody);
      if (!result.valid) {
        setPostBodyError(result.error ?? 'Invalid JSON');
        setLoading(false);
        return;
      }
      const structureErrors = validatePayloadStructure(result.parsed);
      if (structureErrors.length > 0) {
        setValidationErrors(structureErrors);
      }
    }

    const start = Date.now();

    try {
      const enabledParams = queryParams.filter(p => p.enabled && p.key.trim());
      const qp: Record<string, string> = {};
      enabledParams.forEach(p => { qp[p.key] = p.value; });

      const proxyBody: Record<string, unknown> = { method };
      if (method === 'GET') {
        proxyBody.queryParams = qp;
      } else {
        proxyBody.postBody = JSON.parse(postBody);
      }

      const res = await fetch('/api/webhook-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(proxyBody),
      });

      const data = await res.json();
      const duration = Date.now() - start;

      setResponse({
        status: data.status,
        statusText: data.statusText,
        headers: data.headers ?? {},
        body: data.body,
        duration: data.duration ?? duration,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      setResponse({
        status: 0,
        statusText: 'Network Error',
        headers: {},
        body: { error: (err as Error).message },
        duration: Date.now() - start,
        timestamp: new Date().toISOString(),
      });
    } finally {
      setLoading(false);
    }
  };

  const applyGetPreset = (preset: typeof GET_PRESETS[0]) => {
    setQueryParams(
      preset.params.length > 0
        ? preset.params.map(p => ({ id: generateId(), key: p.key, value: p.value, enabled: true }))
        : [{ id: generateId(), key: '', value: '', enabled: true }]
    );
    setShowPresets(false);
  };

  const applyPostPreset = (preset: typeof POST_PRESETS[0]) => {
    setPostBody(JSON.stringify(preset.body, null, 2));
    setPostBodyError(null);
    setShowPresets(false);
  };

  const formatBody = () => {
    try {
      setPostBody(JSON.stringify(JSON.parse(postBody), null, 2));
      setPostBodyError(null);
    } catch {
      // keep as-is
    }
  };

  const responseBodyString = response
    ? typeof response.body === 'string'
      ? response.body
      : JSON.stringify(response.body, null, 2)
    : '';

  return (
    <AppLayout>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl" style={{ backgroundColor: 'hsl(var(--primary) / 0.1)' }}>
            <FlaskConical size={22} style={{ color: 'hsl(var(--primary))' }} />
          </div>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'hsl(var(--foreground))' }}>Webhook Tester</h1>
            <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Send test requests to the webhook endpoint and preview responses
            </p>
          </div>
        </div>

        {/* Request Builder */}
        <div className="rounded-xl border" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
          {/* Method + URL bar */}
          <div className="p-4 border-b flex items-center gap-3 flex-wrap" style={{ borderColor: 'hsl(var(--border))' }}>
            {/* Method selector */}
            <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: 'hsl(var(--border))' }}>
              {(['GET', 'POST'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => { setMethod(m); setShowPresets(false); }}
                  className="px-4 py-2 text-sm font-semibold transition-colors"
                  style={{
                    backgroundColor: method === m ? (m === 'GET' ? 'hsl(142 76% 36% / 0.15)' : 'hsl(var(--primary) / 0.15)') : 'transparent',
                    color: method === m ? (m === 'GET' ? 'hsl(142 76% 36%)' : 'hsl(var(--primary))') : 'hsl(var(--muted-foreground))',
                  }}
                >
                  {m === 'GET' ? <ArrowDownToLine size={14} className="inline mr-1.5" /> : <ArrowUpFromLine size={14} className="inline mr-1.5" />}
                  {m}
                </button>
              ))}
            </div>

            {/* URL display */}
            <div
              className="flex-1 min-w-0 px-3 py-2 rounded-lg text-sm font-mono truncate border"
              style={{
                backgroundColor: 'hsl(var(--secondary))',
                borderColor: 'hsl(var(--border))',
                color: 'hsl(var(--muted-foreground))',
              }}
            >
              {buildDisplayUrl()}
            </div>

            {/* Presets button */}
            <div className="relative">
              <button
                onClick={() => setShowPresets(v => !v)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border transition-colors"
                style={{
                  borderColor: 'hsl(var(--border))',
                  color: 'hsl(var(--muted-foreground))',
                  backgroundColor: 'hsl(var(--secondary))',
                }}
              >
                <Zap size={14} />
                Presets
                {showPresets ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              {showPresets && (
                <div
                  className="absolute right-0 top-full mt-1 w-64 rounded-xl border shadow-lg z-20 overflow-hidden"
                  style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
                >
                  {(method === 'GET' ? GET_PRESETS : POST_PRESETS).map((preset, i) => (
                    <button
                      key={i}
                      onClick={() => method === 'GET' ? applyGetPreset(preset as typeof GET_PRESETS[0]) : applyPostPreset(preset as typeof POST_PRESETS[0])}
                      className="w-full text-left px-4 py-3 hover:bg-opacity-50 transition-colors border-b last:border-b-0"
                      style={{ borderColor: 'hsl(var(--border))' }}
                    >
                      <div className="text-sm font-medium" style={{ color: 'hsl(var(--foreground))' }}>{preset.label}</div>
                      <div className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>{preset.description}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Send button */}
            <button
              onClick={sendRequest}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-60"
              style={{
                backgroundColor: 'hsl(var(--primary))',
                color: 'hsl(var(--primary-foreground))',
              }}
            >
              {loading ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
              {loading ? 'Sending…' : 'Send Request'}
            </button>
          </div>

          {/* GET params / POST body */}
          <div className="p-4">
            {method === 'GET' ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>Query Parameters</h3>
                  <button
                    onClick={addParam}
                    className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md transition-colors"
                    style={{ backgroundColor: 'hsl(var(--secondary))', color: 'hsl(var(--muted-foreground))' }}
                  >
                    <Plus size={12} /> Add Parameter
                  </button>
                </div>

                {/* Header row */}
                <div className="grid grid-cols-[24px_1fr_1fr_32px] gap-2 px-1">
                  <div />
                  <span className="text-xs font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>Key</span>
                  <span className="text-xs font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>Value</span>
                  <div />
                </div>

                {queryParams.map(param => (
                  <div key={param.id} className="grid grid-cols-[24px_1fr_1fr_32px] gap-2 items-center">
                    <input
                      type="checkbox"
                      checked={param.enabled}
                      onChange={e => updateParam(param.id, 'enabled', e.target.checked)}
                      className="w-4 h-4 rounded accent-primary"
                    />
                    <input
                      type="text"
                      value={param.key}
                      onChange={e => updateParam(param.id, 'key', e.target.value)}
                      placeholder="parameter_name"
                      className="px-3 py-2 rounded-lg text-sm border font-mono"
                      style={{
                        backgroundColor: 'hsl(var(--secondary))',
                        borderColor: 'hsl(var(--border))',
                        color: 'hsl(var(--foreground))',
                      }}
                    />
                    <input
                      type="text"
                      value={param.value}
                      onChange={e => updateParam(param.id, 'value', e.target.value)}
                      placeholder="value"
                      className="px-3 py-2 rounded-lg text-sm border font-mono"
                      style={{
                        backgroundColor: 'hsl(var(--secondary))',
                        borderColor: 'hsl(var(--border))',
                        color: 'hsl(var(--foreground))',
                      }}
                    />
                    <button
                      onClick={() => removeParam(param.id)}
                      className="p-1.5 rounded-md transition-colors hover:opacity-80"
                      style={{ color: 'hsl(var(--muted-foreground))' }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
                    Request Body <span className="text-xs font-normal ml-1" style={{ color: 'hsl(var(--muted-foreground))' }}>application/json</span>
                  </h3>
                  <button
                    onClick={formatBody}
                    className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md transition-colors"
                    style={{ backgroundColor: 'hsl(var(--secondary))', color: 'hsl(var(--muted-foreground))' }}
                  >
                    <RefreshCw size={12} /> Format JSON
                  </button>
                </div>
                <div className="relative">
                  <textarea
                    value={postBody}
                    onChange={e => handlePostBodyChange(e.target.value)}
                    rows={12}
                    spellCheck={false}
                    className="w-full px-4 py-3 rounded-lg text-sm border font-mono resize-y"
                    style={{
                      backgroundColor: 'hsl(var(--secondary))',
                      borderColor: postBodyError ? 'hsl(0 84% 60%)' : 'hsl(var(--border))',
                      color: 'hsl(var(--foreground))',
                    }}
                  />
                  {postBodyError && (
                    <div className="flex items-center gap-1.5 mt-1.5 text-xs" style={{ color: 'hsl(0 84% 60%)' }}>
                      <AlertCircle size={12} />
                      {postBodyError}
                    </div>
                  )}
                </div>

                {/* Payload validation errors */}
                {validationErrors.length > 0 && (
                  <div className="rounded-lg border p-3 space-y-1.5" style={{ backgroundColor: 'hsl(0 84% 60% / 0.08)', borderColor: 'hsl(0 84% 60% / 0.3)' }}>
                    <div className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: 'hsl(0 84% 60%)' }}>
                      <AlertCircle size={14} />
                      Payload Validation Warnings ({validationErrors.length})
                    </div>
                    {validationErrors.map((err, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs" style={{ color: 'hsl(0 84% 60%)' }}>
                        <span className="font-mono font-semibold shrink-0">{err.field}:</span>
                        <span>{err.message}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Response Panel */}
        {response && (
          <div className="rounded-xl border" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
            {/* Response meta */}
            <div className="p-4 border-b flex items-center gap-4 flex-wrap" style={{ borderColor: 'hsl(var(--border))' }}>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>Response</span>
                <StatusBadge status={response.status} />
                {response.statusText && (
                  <span className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>{response.statusText}</span>
                )}
              </div>
              <div className="flex items-center gap-1.5 text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                <Clock size={12} />
                {response.duration}ms
              </div>
              <div className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                {new Date(response.timestamp).toLocaleTimeString()}
              </div>
              <div className="ml-auto">
                <CopyButton text={responseBodyString} />
              </div>
            </div>

            {/* Response body */}
            <div className="p-4 space-y-3">
              <div
                className="rounded-lg p-4 overflow-x-auto"
                style={{ backgroundColor: 'hsl(var(--secondary))' }}
              >
                <pre className="text-sm font-mono whitespace-pre-wrap" style={{ color: 'hsl(var(--foreground))' }}>
                  {responseBodyString}
                </pre>
              </div>

              {/* Response headers (collapsible) */}
              <div>
                <button
                  onClick={() => setShowHeaders(v => !v)}
                  className="flex items-center gap-1.5 text-xs font-medium transition-colors"
                  style={{ color: 'hsl(var(--muted-foreground))' }}
                >
                  {showHeaders ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  Response Headers ({Object.keys(response.headers).length})
                </button>
                {showHeaders && (
                  <div className="mt-2 rounded-lg overflow-hidden border" style={{ borderColor: 'hsl(var(--border))' }}>
                    {Object.entries(response.headers).map(([key, value]) => (
                      <div
                        key={key}
                        className="grid grid-cols-[200px_1fr] text-xs border-b last:border-b-0 px-3 py-2"
                        style={{ borderColor: 'hsl(var(--border))' }}
                      >
                        <span className="font-mono font-semibold" style={{ color: 'hsl(var(--primary))' }}>{key}</span>
                        <span className="font-mono truncate" style={{ color: 'hsl(var(--foreground))' }}>{value}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!response && !loading && (
          <div
            className="rounded-xl border border-dashed flex flex-col items-center justify-center py-16 gap-3"
            style={{ borderColor: 'hsl(var(--border))' }}
          >
            <div className="p-3 rounded-full" style={{ backgroundColor: 'hsl(var(--secondary))' }}>
              <Send size={20} style={{ color: 'hsl(var(--muted-foreground))' }} />
            </div>
            <p className="text-sm font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Configure your request and click <strong>Send Request</strong> to see the response
            </p>
            <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Use the Presets dropdown to quickly load example payloads
            </p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
