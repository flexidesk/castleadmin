'use client';

import { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { Copy, Check, Webhook, ArrowDownToLine, ArrowUpFromLine, Lock, AlertCircle, CheckCircle2 } from 'lucide-react';

const WEBHOOK_URL = 'https://castleadmi7836.builtwithrocket.new/api/woocommerce/webhook';

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

function CodeBlock({ code, language = 'text' }: { code: string; language?: string }) {
  return (
    <div className="relative rounded-lg overflow-hidden" style={{ backgroundColor: 'hsl(var(--secondary))' }}>
      <div className="flex items-center justify-between px-4 py-2 border-b" style={{ borderColor: 'hsl(var(--border))' }}>
        <span className="text-xs font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>{language}</span>
        <CopyButton text={code} />
      </div>
      <pre className="p-4 text-sm overflow-x-auto" style={{ color: 'hsl(var(--foreground))' }}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

interface FieldRow {
  name: string;
  required: boolean;
  type: string;
  default?: string;
  description: string;
  allowed?: string;
}

function FieldTable({ fields }: { fields: FieldRow[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border" style={{ borderColor: 'hsl(var(--border))' }}>
      <table className="w-full text-sm">
        <thead>
          <tr style={{ backgroundColor: 'hsl(var(--secondary))' }}>
            <th className="text-left px-4 py-3 font-semibold" style={{ color: 'hsl(var(--foreground))' }}>Field Name</th>
            <th className="text-left px-4 py-3 font-semibold" style={{ color: 'hsl(var(--foreground))' }}>Required</th>
            <th className="text-left px-4 py-3 font-semibold" style={{ color: 'hsl(var(--foreground))' }}>Type</th>
            <th className="text-left px-4 py-3 font-semibold" style={{ color: 'hsl(var(--foreground))' }}>Default</th>
            <th className="text-left px-4 py-3 font-semibold" style={{ color: 'hsl(var(--foreground))' }}>Description</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((f, i) => (
            <tr
              key={f.name}
              className="border-t"
              style={{
                borderColor: 'hsl(var(--border))',
                backgroundColor: i % 2 === 0 ? 'transparent' : 'hsl(var(--secondary) / 0.3)',
              }}
            >
              <td className="px-4 py-3">
                <code
                  className="text-xs px-1.5 py-0.5 rounded font-mono"
                  style={{ backgroundColor: 'hsl(var(--primary) / 0.1)', color: 'hsl(var(--primary))' }}
                >
                  {f.name}
                </code>
              </td>
              <td className="px-4 py-3">
                {f.required ? (
                  <span className="flex items-center gap-1 text-xs font-medium" style={{ color: 'hsl(var(--destructive))' }}>
                    <AlertCircle size={12} /> Required
                  </span>
                ) : (
                  <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>Optional</span>
                )}
              </td>
              <td className="px-4 py-3">
                <span className="text-xs font-mono" style={{ color: 'hsl(var(--muted-foreground))' }}>{f.type}</span>
              </td>
              <td className="px-4 py-3">
                <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>{f.default ?? '—'}</span>
              </td>
              <td className="px-4 py-3 text-xs" style={{ color: 'hsl(var(--foreground))' }}>
                {f.description}
                {f.allowed && (
                  <div className="mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    Allowed: <span className="font-mono">{f.allowed}</span>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const GET_FIELDS: FieldRow[] = [
  { name: 'external_id', required: true, type: 'string', description: 'Unique ID from your system (e.g. ORDER-123). Used to prevent duplicate bookings.' },
  { name: 'customer_name', required: true, type: 'string', description: 'Full name of the customer.' },
  { name: 'customer_email', required: false, type: 'string', default: '', description: 'Customer email address.' },
  { name: 'customer_phone', required: false, type: 'string', default: '', description: 'Customer phone number.' },
  { name: 'booking_date', required: false, type: 'string (YYYY-MM-DD)', default: 'today', description: 'Delivery or booking date.' },
  { name: 'delivery_window', required: false, type: 'string', default: 'TBC', description: 'Time window string, e.g. "09:00-12:00".' },
  { name: 'booking_type', required: false, type: 'string', default: 'Delivery', description: 'Type of booking.', allowed: '"Delivery" | "Collection"' },
  { name: 'status', required: false, type: 'string', default: 'Booking Accepted', description: 'Initial booking status. Must be a valid status value.', allowed: 'See status values below' },
  { name: 'payment_method', required: false, type: 'string', default: 'Unrecorded', description: 'Payment method used.', allowed: '"Card" | "Cash" | "Unrecorded"' },
  { name: 'payment_status', required: false, type: 'string', default: 'Unpaid', description: 'Whether payment has been received.', allowed: '"Paid" | "Unpaid"' },
  { name: 'payment_amount', required: false, type: 'number', default: '0', description: 'Numeric total amount.' },
  { name: 'address_line1', required: false, type: 'string', description: 'Delivery address line 1.' },
  { name: 'address_line2', required: false, type: 'string', description: 'Delivery address line 2.' },
  { name: 'address_city', required: false, type: 'string', description: 'City.' },
  { name: 'address_county', required: false, type: 'string', description: 'County or state.' },
  { name: 'address_postcode', required: false, type: 'string', description: 'Postcode or ZIP code.' },
  { name: 'notes', required: false, type: 'string', description: 'Free-text notes for the booking.' },
];

const POST_FIELDS: FieldRow[] = [
  { name: 'external_id', required: true, type: 'string', description: 'Identifies the booking to update. Must match the external_id used when creating.' },
  { name: 'status', required: false, type: 'string', description: 'New booking status. Ignored if booking is already Out For Delivery, Delivered, or Completed.', allowed: 'See status values below' },
  { name: 'customer_name', required: false, type: 'string', description: 'Updated customer full name.' },
  { name: 'customer_email', required: false, type: 'string', description: 'Updated customer email address.' },
  { name: 'customer_phone', required: false, type: 'string', description: 'Updated customer phone number.' },
  { name: 'booking_date', required: false, type: 'string (YYYY-MM-DD)', description: 'Updated delivery or booking date.' },
  { name: 'delivery_window', required: false, type: 'string', description: 'Updated time window, e.g. "14:00-17:00".' },
  { name: 'booking_type', required: false, type: 'string', description: 'Updated booking type.', allowed: '"Delivery" | "Collection"' },
  { name: 'payment_method', required: false, type: 'string', description: 'Updated payment method.', allowed: '"Card" | "Cash" | "Unrecorded"' },
  { name: 'payment_status', required: false, type: 'string', description: 'Updated payment status.', allowed: '"Paid" | "Unpaid"' },
  { name: 'payment_amount', required: false, type: 'number', description: 'Updated total amount.' },
  { name: 'address_line1', required: false, type: 'string', description: 'Updated delivery address line 1.' },
  { name: 'address_line2', required: false, type: 'string', description: 'Updated delivery address line 2.' },
  { name: 'address_city', required: false, type: 'string', description: 'Updated city.' },
  { name: 'address_county', required: false, type: 'string', description: 'Updated county or state.' },
  { name: 'address_postcode', required: false, type: 'string', description: 'Updated postcode or ZIP.' },
  { name: 'notes', required: false, type: 'string', description: 'Updated free-text notes.' },
  { name: 'products', required: false, type: 'array', description: 'Array of product/item objects. Replaces existing products on the booking.' },
];

const PRODUCT_FIELDS: FieldRow[] = [
  { name: 'name', required: true, type: 'string', description: 'Product or item name.' },
  { name: 'id', required: false, type: 'number', description: 'Product ID from your system.' },
  { name: 'sku', required: false, type: 'string', description: 'Stock keeping unit code.' },
  { name: 'quantity', required: false, type: 'number', default: '1', description: 'Quantity ordered.' },
  { name: 'unitPrice', required: false, type: 'number', default: '0', description: 'Price per unit.' },
  { name: 'totalPrice', required: false, type: 'number', default: '0', description: 'Total line price.' },
  { name: 'category', required: false, type: 'string', description: 'Product category.' },
];

const GET_EXAMPLE = `GET ${WEBHOOK_URL}?external_id=ORDER-123&customer_name=Jane+Smith&customer_email=jane@example.com&booking_date=2026-04-01&delivery_window=09:00-12:00&address_postcode=SW1A+1AA&payment_method=Card&payment_status=Paid&payment_amount=150`;

const POST_EXAMPLE = `POST ${WEBHOOK_URL}
Content-Type: application/json

{
  "external_id": "ORDER-123",
  "status": "Booking Confirmed",
  "customer_name": "Jane Smith",
  "customer_email": "jane@example.com",
  "customer_phone": "07700900000",
  "booking_date": "2026-04-01",
  "delivery_window": "09:00-12:00",
  "booking_type": "Delivery",
  "payment_method": "Card",
  "payment_status": "Paid",
  "payment_amount": 150,
  "address_line1": "10 Downing Street",
  "address_line2": "",
  "address_city": "London",
  "address_county": "Greater London",
  "address_postcode": "SW1A 2AA",
  "notes": "Leave at front door",
  "products": [
    {
      "id": 1,
      "name": "Bouncy Castle",
      "sku": "BC-001",
      "quantity": 1,
      "unitPrice": 150.00,
      "totalPrice": 150.00,
      "category": "Bouncy Castle"
    }
  ]
}`;

const HMAC_EXAMPLE = `const crypto = require('crypto');
const secret = process.env.WC_WEBHOOK_SECRET;
const body = JSON.stringify(payload);
const signature = crypto
  .createHmac('sha256', secret)
  .update(body, 'utf8')
  .digest('base64');

fetch('${WEBHOOK_URL}', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Webhook-Signature': signature,
  },
  body,
});`;

const STATUS_VALUES = [
  { value: 'Booking Accepted', description: 'Initial state when booking is received' },
  { value: 'Booking Confirmed', description: 'Booking has been confirmed by operations' },
  { value: 'Booking Out For Delivery', description: 'Driver is en route — status updates locked' },
  { value: 'Booking Delivered', description: 'Items delivered — status updates locked' },
  { value: 'Booking Completed', description: 'Booking fully completed — status updates locked' },
  { value: 'Booking Cancelled', description: 'Booking has been cancelled' },
];

export default function WebhookGuideContent() {
  const [activeTab, setActiveTab] = useState<'get' | 'post'>('get');

  return (
    <AppLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-start gap-4">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: 'hsl(var(--primary) / 0.1)' }}
          >
            <Webhook size={24} style={{ color: 'hsl(var(--primary))' }} />
          </div>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'hsl(var(--foreground))' }}>
              Webhook Connection Guide
            </h1>
            <p className="mt-1 text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Connect any external system to create and update bookings via HTTP requests.
              This endpoint is platform-independent — works with WooCommerce, Shopify, custom apps, or any HTTP client.
            </p>
          </div>
        </div>

        {/* Endpoint URL */}
        <div className="rounded-xl border p-5 space-y-3" style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--card))' }}>
          <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: 'hsl(var(--muted-foreground))' }}>Endpoint URL</h2>
          <div className="flex items-center gap-3">
            <code
              className="flex-1 text-sm font-mono px-4 py-3 rounded-lg break-all"
              style={{ backgroundColor: 'hsl(var(--secondary))', color: 'hsl(var(--foreground))' }}
            >
              {WEBHOOK_URL}
            </code>
            <CopyButton text={WEBHOOK_URL} />
          </div>
          <div className="flex gap-3 flex-wrap">
            <span
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full"
              style={{ backgroundColor: 'hsl(142 76% 36% / 0.1)', color: 'hsl(142 76% 36%)' }}
            >
              <ArrowDownToLine size={12} /> GET — Create Booking
            </span>
            <span
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full"
              style={{ backgroundColor: 'hsl(var(--primary) / 0.1)', color: 'hsl(var(--primary))' }}
            >
              <ArrowUpFromLine size={12} /> POST — Update Booking
            </span>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex gap-1 p-1 rounded-lg w-fit" style={{ backgroundColor: 'hsl(var(--secondary))' }}>
          <button
            onClick={() => setActiveTab('get')}
            className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all"
            style={{
              backgroundColor: activeTab === 'get' ? 'hsl(var(--card))' : 'transparent',
              color: activeTab === 'get' ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))',
              boxShadow: activeTab === 'get' ? '0 1px 3px hsl(var(--foreground) / 0.1)' : 'none',
            }}
          >
            <ArrowDownToLine size={14} />
            GET — Create Booking
          </button>
          <button
            onClick={() => setActiveTab('post')}
            className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all"
            style={{
              backgroundColor: activeTab === 'post' ? 'hsl(var(--card))' : 'transparent',
              color: activeTab === 'post' ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))',
              boxShadow: activeTab === 'post' ? '0 1px 3px hsl(var(--foreground) / 0.1)' : 'none',
            }}
          >
            <ArrowUpFromLine size={14} />
            POST — Update Booking
          </button>
        </div>

        {/* GET Tab */}
        {activeTab === 'get' && (
          <div className="space-y-6">
            <div className="rounded-xl border p-5 space-y-4" style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--card))' }}>
              <div className="flex items-center gap-2">
                <span
                  className="text-xs font-bold px-2.5 py-1 rounded-md"
                  style={{ backgroundColor: 'hsl(142 76% 36% / 0.1)', color: 'hsl(142 76% 36%)' }}
                >
                  GET
                </span>
                <h2 className="text-base font-semibold" style={{ color: 'hsl(var(--foreground))' }}>Create a New Booking</h2>
              </div>
              <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                Send booking data as URL query parameters. If a booking with the same <code className="font-mono text-xs px-1 rounded" style={{ backgroundColor: 'hsl(var(--secondary))' }}>external_id</code> already exists, the request returns <code className="font-mono text-xs">200 already_exists</code> without creating a duplicate.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { label: '201 Created', desc: 'Booking successfully created', color: 'hsl(142 76% 36%)' },
                  { label: '200 Already Exists', desc: 'Booking with this external_id exists', color: 'hsl(var(--primary))' },
                  { label: '400 Bad Request', desc: 'Missing required parameters', color: 'hsl(var(--destructive))' },
                ].map((r) => (
                  <div key={r.label} className="rounded-lg p-3 border" style={{ borderColor: 'hsl(var(--border))' }}>
                    <p className="text-xs font-semibold" style={{ color: r.color }}>{r.label}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>{r.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>Query Parameters</h3>
              <FieldTable fields={GET_FIELDS} />
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>Example Request</h3>
              <CodeBlock code={GET_EXAMPLE} language="URL" />
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>Example Response</h3>
              <CodeBlock
                code={`{ "received": true, "action": "inserted", "orderId": "EXT-ORDER-123" }`}
                language="JSON"
              />
            </div>
          </div>
        )}

        {/* POST Tab */}
        {activeTab === 'post' && (
          <div className="space-y-6">
            <div className="rounded-xl border p-5 space-y-4" style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--card))' }}>
              <div className="flex items-center gap-2">
                <span
                  className="text-xs font-bold px-2.5 py-1 rounded-md"
                  style={{ backgroundColor: 'hsl(var(--primary) / 0.1)', color: 'hsl(var(--primary))' }}
                >
                  POST
                </span>
                <h2 className="text-base font-semibold" style={{ color: 'hsl(var(--foreground))' }}>Update an Existing Booking</h2>
              </div>
              <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                Send a JSON body with <code className="font-mono text-xs px-1 rounded" style={{ backgroundColor: 'hsl(var(--secondary))' }}>external_id</code> to identify the booking. Only include fields you want to update — all other fields remain unchanged. Set <code className="font-mono text-xs px-1 rounded" style={{ backgroundColor: 'hsl(var(--secondary))' }}>Content-Type: application/json</code>.
              </p>

              <div
                className="flex items-start gap-3 rounded-lg p-3 border"
                style={{ borderColor: 'hsl(var(--primary) / 0.3)', backgroundColor: 'hsl(var(--primary) / 0.05)' }}
              >
                <AlertCircle size={16} className="shrink-0 mt-0.5" style={{ color: 'hsl(var(--primary))' }} />
                <p className="text-xs" style={{ color: 'hsl(var(--foreground))' }}>
                  <strong>Status lock rule:</strong> If the booking is already <strong>Out For Delivery</strong>, <strong>Delivered</strong>, or <strong>Completed</strong>, the <code className="font-mono">status</code> field is ignored to protect active driver runs. All other fields (customer details, address, products, etc.) are still updated.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { label: '200 Updated', desc: 'Booking successfully updated', color: 'hsl(142 76% 36%)' },
                  { label: '200 Details Only', desc: 'Status locked — other fields updated', color: 'hsl(var(--primary))' },
                  { label: '404 Not Found', desc: 'No booking with this external_id', color: 'hsl(var(--destructive))' },
                ].map((r) => (
                  <div key={r.label} className="rounded-lg p-3 border" style={{ borderColor: 'hsl(var(--border))' }}>
                    <p className="text-xs font-semibold" style={{ color: r.color }}>{r.label}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>{r.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>Body Fields (JSON)</h3>
              <FieldTable fields={POST_FIELDS} />
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
                Products Array Fields
                <span className="ml-2 text-xs font-normal" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  (each item in the <code className="font-mono">products</code> array)
                </span>
              </h3>
              <FieldTable fields={PRODUCT_FIELDS} />
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>Example Request</h3>
              <CodeBlock code={POST_EXAMPLE} language="HTTP" />
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>Example Response</h3>
              <CodeBlock
                code={`{ "received": true, "action": "updated", "orderId": "EXT-ORDER-123" }`}
                language="JSON"
              />
            </div>
          </div>
        )}

        {/* Valid Status Values */}
        <div className="rounded-xl border p-5 space-y-4" style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--card))' }}>
          <h2 className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>Valid Status Values</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {STATUS_VALUES.map((s) => (
              <div key={s.value} className="flex items-start gap-3 rounded-lg p-3 border" style={{ borderColor: 'hsl(var(--border))' }}>
                <CheckCircle2 size={14} className="shrink-0 mt-0.5" style={{ color: 'hsl(var(--primary))' }} />
                <div>
                  <code className="text-xs font-mono font-semibold" style={{ color: 'hsl(var(--foreground))' }}>{s.value}</code>
                  <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>{s.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Security */}
        <div className="rounded-xl border p-5 space-y-4" style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--card))' }}>
          <div className="flex items-center gap-2">
            <Lock size={16} style={{ color: 'hsl(var(--primary))' }} />
            <h2 className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>Optional Security — HMAC Signature</h2>
          </div>
          <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
            To secure POST requests, set <code className="font-mono text-xs px-1 rounded" style={{ backgroundColor: 'hsl(var(--secondary))' }}>WC_WEBHOOK_SECRET</code> in your environment variables. When set, every POST request must include an <code className="font-mono text-xs px-1 rounded" style={{ backgroundColor: 'hsl(var(--secondary))' }}>X-Webhook-Signature</code> header containing an HMAC-SHA256 of the raw JSON body, base64-encoded. GET requests are not signature-verified.
          </p>
          <CodeBlock code={HMAC_EXAMPLE} language="JavaScript" />
        </div>
      </div>
    </AppLayout>
  );
}
