/**
 * WooCommerce Webhook Endpoint
 * ─────────────────────────────────────────────────────────────────────────────
 * GET  /api/woocommerce/webhook
 *   WooCommerce sends a GET ping when a webhook is first registered to verify
 *   the endpoint is reachable. Responds with 200 OK.
 *
 * POST /api/woocommerce/webhook
 *   Receives WooCommerce webhook events.
 *   Supported topics:
 *     • order.created  → inserts a new order (if not already present)
 *     • order.updated  → updates order details AND maps WC status → internal status
 *     • order.deleted  → marks order as cancelled
 *     • order.restored → re-activates a previously cancelled order
 *
 *   Signature verification:
 *     Set WC_WEBHOOK_SECRET in .env to the same secret configured in WooCommerce.
 *     If the env var is absent the signature check is skipped (useful for dev).
 *
 *   Status mapping (WooCommerce → internal):
 *     pending     → Booking Accepted
 *     processing  → Booking Accepted
 *     on-hold     → Booking Accepted
 *     completed   → Booking Completed
 *     cancelled   → Booking Cancelled
 *     refunded    → Booking Cancelled
 *     failed      → Booking Cancelled
 *
 *   Update rules:
 *     • order.created  : always inserts (upsert on woo_order_id)
 *     • order.updated  : updates customer/address/product fields AND status
 *                        UNLESS the internal order is already Out For Delivery
 *                        or Delivered (driver has started the run — don't regress)
 *     • order.deleted  : sets status → Booking Cancelled
 *     • order.restored : sets status → Booking Accepted
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createHmac } from 'crypto';

// ─── Types ────────────────────────────────────────────────────────────────────

interface WooLineItem {
  id: number;
  name: string;
  sku: string;
  quantity: number;
  price: string;
  subtotal: string;
  total: string;
  meta_data: { key: string; value: string }[];
}

interface WooOrder {
  id: number;
  status: string;
  date_created: string;
  total: string;
  payment_method: string;
  billing: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    address_1: string;
    address_2: string;
    city: string;
    state: string;
    postcode: string;
  };
  shipping: {
    address_1: string;
    address_2: string;
    city: string;
    state: string;
    postcode: string;
  };
  line_items: WooLineItem[];
  meta_data: { key: string; value: string }[];
}

// ─── Status mapping ───────────────────────────────────────────────────────────

const WOO_STATUS_MAP: Record<string, string> = {
  pending: 'Booking Accepted',
  processing: 'Booking Accepted',
  'on-hold': 'Booking Accepted',
  completed: 'Booking Completed',
  cancelled: 'Booking Cancelled',
  refunded: 'Booking Cancelled',
  failed: 'Booking Cancelled',
};

/**
 * Internal statuses that represent an active driver run.
 * We do NOT regress these when WooCommerce sends an update.
 */
const LOCKED_STATUSES = new Set([
  'Booking Out For Delivery',
  'Booking Delivered',
  'Booking Completed',
]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mapWooPaymentMethod(wooMethod: string): 'Card' | 'Cash' | 'Unrecorded' {
  const m = (wooMethod ?? '').toLowerCase();
  if (m.includes('stripe') || m.includes('card') || m.includes('paypal') || m.includes('bacs')) return 'Card';
  if (m.includes('cod') || m.includes('cash')) return 'Cash';
  return 'Unrecorded';
}

function extractDeliveryDate(order: WooOrder): string {
  const dateKeys = [
    '_delivery_date', 'delivery_date', '_order_delivery_date', 'order_delivery_date',
    'jckwds_date', '_jckwds_date',
  ];
  for (const key of dateKeys) {
    const meta = order.meta_data?.find((m) => m.key === key);
    if (meta?.value) {
      const d = new Date(meta.value);
      if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
      const parts = meta.value.split('/');
      if (parts.length === 3) {
        const iso = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        const d2 = new Date(iso);
        if (!isNaN(d2.getTime())) return iso;
      }
      return meta.value;
    }
  }
  return order.date_created ? order.date_created.split('T')[0] : new Date().toISOString().split('T')[0];
}

function extractDeliveryWindow(order: WooOrder): string {
  const windowKeys = [
    '_delivery_time_frame', 'delivery_time_frame', '_order_delivery_time', 'order_delivery_time',
    'jckwds_time', '_jckwds_time',
  ];
  for (const key of windowKeys) {
    const meta = order.meta_data?.find((m) => m.key === key);
    if (meta?.value) return meta.value;
  }
  return 'TBC';
}

function extractBookingType(order: WooOrder): 'Delivery' | 'Collection' {
  const typeKeys = ['_booking_type', 'booking_type', '_order_type', 'order_type'];
  for (const key of typeKeys) {
    const meta = order.meta_data?.find((m) => m.key === key);
    if (meta?.value) {
      if (meta.value.toLowerCase().includes('collect')) return 'Collection';
    }
  }
  if (!order.shipping?.address_1 && !order.billing?.address_1) return 'Collection';
  return 'Delivery';
}

function mapWooOrderToRow(order: WooOrder) {
  const billing = order.billing ?? {};
  const shipping = order.shipping ?? {};
  const addressSource = shipping.address_1 ? shipping : billing;
  const bookingType = extractBookingType(order);
  const paymentMethod = mapWooPaymentMethod(order.payment_method);
  const paymentStatus = paymentMethod === 'Unrecorded' ? 'Unpaid' : 'Paid';
  const internalStatus = WOO_STATUS_MAP[order.status] ?? 'Booking Accepted';

  const products = (order.line_items ?? []).map((item) => {
    const qty = Number(item.quantity) || 1;
    let unitPrice = 0;
    if (item.price !== undefined) unitPrice = Number(item.price);
    else if (item.subtotal) unitPrice = Number(item.subtotal) / qty;
    else if (item.total) unitPrice = Number(item.total) / qty;

    const categoryMeta = (item.meta_data ?? []).find(
      (m) => m.key === '_product_type' || m.key === 'pa_category'
    );

    return {
      id: item.id,
      name: item.name ?? '',
      sku: item.sku ?? '',
      quantity: qty,
      unitPrice: parseFloat(unitPrice.toFixed(2)),
      totalPrice: parseFloat((unitPrice * qty).toFixed(2)),
      category: categoryMeta?.value ?? 'Bouncy Castle',
    };
  });

  return {
    id: `WC-${order.id}`,
    woo_order_id: String(order.id),
    customer_name: `${billing.first_name ?? ''} ${billing.last_name ?? ''}`.trim() || 'Unknown',
    customer_email: billing.email ?? '',
    customer_phone: billing.phone ?? '',
    booking_type: bookingType,
    status: internalStatus,
    delivery_address_line1: addressSource.address_1 ?? null,
    delivery_address_line2: addressSource.address_2 ?? null,
    delivery_address_city: addressSource.city ?? null,
    delivery_address_county: addressSource.state ?? null,
    delivery_address_postcode: addressSource.postcode ?? null,
    delivery_address_notes: null,
    driver_id: null,
    booking_date: extractDeliveryDate(order),
    delivery_window: extractDeliveryWindow(order),
    collection_window: null,
    payment_status: paymentStatus,
    payment_method: paymentMethod,
    payment_amount: parseFloat(order.total ?? '0'),
    products,
    notes: null,
    custom_fields: {},
  };
}

// ─── Signature verification ───────────────────────────────────────────────────

function verifySignature(rawBody: string, signature: string, secret: string): boolean {
  const hmac = createHmac('sha256', secret);
  hmac.update(rawBody, 'utf8');
  const expected = hmac.digest('base64');
  return signature === expected;
}

// ─── GET — webhook verification ping ─────────────────────────────────────────

/**
 * WooCommerce pings this endpoint with a GET request when you first save a
 * webhook in the WooCommerce admin. It expects a 200 response.
 */
export async function GET() {
  return NextResponse.json(
    { status: 'ok', message: 'Castle Admin webhook endpoint is active.' },
    { status: 200 }
  );
}

// ─── POST — receive webhook events ───────────────────────────────────────────

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.WC_WEBHOOK_SECRET;
  const topic = req.headers.get('x-wc-webhook-topic') ?? '';

  let order: WooOrder;

  if (webhookSecret && webhookSecret !== 'your-woocommerce-webhook-secret-here') {
    // Signature verification required — read raw body first
    const signature = req.headers.get('x-wc-webhook-signature');
    if (!signature) {
      return NextResponse.json({ error: 'Missing webhook signature' }, { status: 401 });
    }
    const rawBody = await req.text();
    if (!verifySignature(rawBody, signature, webhookSecret)) {
      return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
    }
    try {
      order = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
  } else {
    // No secret configured — parse body directly (dev / testing mode)
    try {
      order = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
  }

  return handleWebhookEvent(topic, order);
}

// ─── Core event handler ───────────────────────────────────────────────────────

async function handleWebhookEvent(topic: string, order: WooOrder) {
  const supabase = await createClient();

  // Log every incoming event
  await supabase.from('woocommerce_webhook_log').insert({
    woo_order_id: String(order.id),
    topic,
    payload_summary: {
      woo_status: order.status,
      total: order.total,
      customer: `${order.billing?.first_name ?? ''} ${order.billing?.last_name ?? ''}`.trim(),
    },
  });

  // ── order.deleted ──────────────────────────────────────────────────────────
  if (topic === 'order.deleted') {
    const { data: existing } = await supabase
      .from('orders')
      .select('id, status')
      .eq('woo_order_id', String(order.id))
      .maybeSingle();

    if (!existing) {
      return NextResponse.json({ received: true, processed: false, reason: 'Order not found locally' });
    }

    await supabase
      .from('orders')
      .update({ status: 'Booking Cancelled', updated_at: new Date().toISOString() })
      .eq('id', existing.id);

    return NextResponse.json({ received: true, processed: true, action: 'cancelled', orderId: existing.id });
  }

  // ── order.restored ─────────────────────────────────────────────────────────
  if (topic === 'order.restored') {
    const { data: existing } = await supabase
      .from('orders')
      .select('id')
      .eq('woo_order_id', String(order.id))
      .maybeSingle();

    if (!existing) {
      // Treat as a new order
      const row = mapWooOrderToRow(order);
      const { error } = await supabase.from('orders').insert(row);
      if (error) {
        return NextResponse.json({ received: true, processed: false, error: error.message }, { status: 500 });
      }
      return NextResponse.json({ received: true, processed: true, action: 'inserted', orderId: row.id });
    }

    await supabase
      .from('orders')
      .update({ status: 'Booking Accepted', updated_at: new Date().toISOString() })
      .eq('id', existing.id);

    return NextResponse.json({ received: true, processed: true, action: 'restored', orderId: existing.id });
  }

  // ── order.created / order.updated (and any other order.* topics) ───────────
  const isOrderTopic = topic.startsWith('order.');
  if (!isOrderTopic) {
    return NextResponse.json({ received: true, processed: false, reason: 'Non-order topic ignored' });
  }

  // Only import recognised WooCommerce statuses
  const importableStatuses = ['pending', 'processing', 'on-hold', 'completed', 'cancelled', 'refunded', 'failed'];
  if (!importableStatuses.includes(order.status)) {
    return NextResponse.json({
      received: true,
      processed: false,
      reason: `WooCommerce status "${order.status}" is not handled`,
    });
  }

  const row = mapWooOrderToRow(order);

  // Check if order already exists locally
  const { data: existing } = await supabase
    .from('orders')
    .select('id, status')
    .eq('woo_order_id', row.woo_order_id)
    .maybeSingle();

  // ── New order ──────────────────────────────────────────────────────────────
  if (!existing) {
    const { error } = await supabase.from('orders').insert(row);
    if (error) {
      return NextResponse.json({ received: true, processed: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ received: true, processed: true, action: 'inserted', orderId: row.id });
  }

  // ── Existing order — update ────────────────────────────────────────────────
  // Don't regress orders that are already out for delivery or completed
  if (LOCKED_STATUSES.has(existing.status)) {
    // Still update non-status fields (customer details, products) but keep status
    const { error } = await supabase
      .from('orders')
      .update({
        customer_name: row.customer_name,
        customer_email: row.customer_email,
        customer_phone: row.customer_phone,
        booking_date: row.booking_date,
        delivery_window: row.delivery_window,
        payment_amount: row.payment_amount,
        payment_method: row.payment_method,
        payment_status: row.payment_status,
        products: row.products,
        delivery_address_line1: row.delivery_address_line1,
        delivery_address_line2: row.delivery_address_line2,
        delivery_address_city: row.delivery_address_city,
        delivery_address_county: row.delivery_address_county,
        delivery_address_postcode: row.delivery_address_postcode,
        updated_at: new Date().toISOString(),
        // status intentionally NOT updated — driver run is in progress
      })
      .eq('id', existing.id);

    if (error) {
      return NextResponse.json({ received: true, processed: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({
      received: true,
      processed: true,
      action: 'updated_details_only',
      reason: `Status kept as "${existing.status}" — driver run in progress`,
      orderId: existing.id,
    });
  }

  // Order is still in a pre-dispatch state — update everything including status
  const { error } = await supabase
    .from('orders')
    .update({
      customer_name: row.customer_name,
      customer_email: row.customer_email,
      customer_phone: row.customer_phone,
      booking_date: row.booking_date,
      delivery_window: row.delivery_window,
      payment_amount: row.payment_amount,
      payment_method: row.payment_method,
      payment_status: row.payment_status,
      products: row.products,
      delivery_address_line1: row.delivery_address_line1,
      delivery_address_line2: row.delivery_address_line2,
      delivery_address_city: row.delivery_address_city,
      delivery_address_county: row.delivery_address_county,
      delivery_address_postcode: row.delivery_address_postcode,
      status: row.status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', existing.id);

  if (error) {
    return NextResponse.json({ received: true, processed: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    received: true,
    processed: true,
    action: 'updated',
    newStatus: row.status,
    orderId: existing.id,
  });
}
