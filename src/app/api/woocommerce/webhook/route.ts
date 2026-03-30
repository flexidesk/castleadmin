/**
 * Generic Booking Webhook Endpoint
 * ─────────────────────────────────────────────────────────────────────────────
 * This endpoint is INDEPENDENT of WooCommerce. It accepts bookings from any
 * external system (e-commerce platforms, booking tools, custom apps, etc.)
 * using a simple JSON format over HTTP.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * HOW TO CONNECT — CREATE A BOOKING (GET)
 * ─────────────────────────────────────────────────────────────────────────────
 * Method : GET
 * URL    : https://castleadmi7836.builtwithrocket.new/api/woocommerce/webhook
 *
 * Pass booking data as query parameters:
 *
 *   Required:
 *     external_id        Unique ID from your system (e.g. "ORDER-123")
 *     customer_name      Full name of the customer
 *
 *   Optional:
 *     customer_email     Customer email address
 *     customer_phone     Customer phone number
 *     booking_date       Delivery/booking date  (YYYY-MM-DD, default: today)
 *     delivery_window    Time window string      (e.g. "09:00-12:00", default: "TBC")
 *     booking_type       "Delivery" or "Collection" (default: "Delivery")
 *     status             Internal status string  (default: "Booking Accepted")
 *     payment_method     "Card", "Cash", or "Unrecorded" (default: "Unrecorded")
 *     payment_status     "Paid" or "Unpaid"      (default: "Unpaid")
 *     payment_amount     Numeric total           (default: 0)
 *     address_line1      Delivery address line 1
 *     address_line2      Delivery address line 2
 *     address_city       City
 *     address_county     County / state
 *     address_postcode   Postcode / ZIP
 *     notes              Free-text notes
 *
 * Example:
 *   GET /api/woocommerce/webhook
 *     ?external_id=ORDER-123
 *     &customer_name=Jane+Smith
 *     &customer_email=jane@example.com
 *     &booking_date=2026-04-01
 *     &delivery_window=09:00-12:00
 *     &address_postcode=SW1A+1AA
 *     &payment_method=Card
 *     &payment_status=Paid
 *     &payment_amount=150
 *
 * Response (201 Created):
 *   { "received": true, "action": "inserted", "orderId": "EXT-ORDER-123" }
 *
 * Response (200 Already Exists):
 *   { "received": true, "action": "already_exists", "orderId": "EXT-ORDER-123" }
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * HOW TO CONNECT — UPDATE A BOOKING (POST)
 * ─────────────────────────────────────────────────────────────────────────────
 * Method       : POST
 * URL          : https://castleadmi7836.builtwithrocket.new/api/woocommerce/webhook
 * Content-Type : application/json
 *
 * Body (all fields optional except external_id):
 * {
 *   "external_id":      "ORDER-123",        // REQUIRED — identifies the booking
 *   "status":           "Booking Accepted", // optional — new internal status
 *   "customer_name":    "Jane Smith",
 *   "customer_email":   "jane@example.com",
 *   "customer_phone":   "07700900000",
 *   "booking_date":     "2026-04-01",
 *   "delivery_window":  "09:00-12:00",
 *   "booking_type":     "Delivery",
 *   "payment_method":   "Card",
 *   "payment_status":   "Paid",
 *   "payment_amount":   150,
 *   "address_line1":    "10 Downing Street",
 *   "address_line2":    "",
 *   "address_city":     "London",
 *   "address_county":   "Greater London",
 *   "address_postcode": "SW1A 2AA",
 *   "notes":            "Leave at front door",
 *   "products": [
 *     {
 *       "id":         1,
 *       "name":       "Bouncy Castle",
 *       "sku":        "BC-001",
 *       "quantity":   1,
 *       "unitPrice":  150.00,
 *       "totalPrice": 150.00,
 *       "category":   "Bouncy Castle"
 *     }
 *   ]
 * }
 *
 * Allowed internal status values:
 *   "Booking Accepted" | "Booking Confirmed" | "Booking Out For Delivery" *"Booking Delivered" | "Booking Completed" | "Booking Cancelled"
 *
 * Update rules:
 *   • If the booking is already "Booking Out For Delivery", "Booking Delivered",
 *     or "Booking Completed", the status field is ignored (driver run in progress).
 *     All other fields are still updated.
 *   • If external_id is not found, a 404 is returned.
 *
 * Response (200 Updated):
 *   { "received": true, "action": "updated", "orderId": "EXT-ORDER-123" }
 *
 * Response (200 Details-only update — status locked):
 *   { "received": true, "action": "updated_details_only",
 *     "reason": "Status kept as \"Booking Out For Delivery\" — driver run in progress",
 *     "orderId": "EXT-ORDER-123" }
 *
 * Response (404 Not Found):
 *   { "error": "Booking not found for external_id: ORDER-123" }
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * OPTIONAL SECURITY — WEBHOOK SECRET
 * ─────────────────────────────────────────────────────────────────────────────
 * Set WC_WEBHOOK_SECRET in your .env file.
 * When set, POST requests must include the header:
 *   X-Webhook-Signature: <HMAC-SHA256 of raw body, base64-encoded>
 * GET requests are not signature-verified (they carry no sensitive payload).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createHmac } from 'crypto';

// ─── Types ────────────────────────────────────────────────────────────────────

interface IncomingProduct {
  id?: number;
  name: string;
  sku?: string;
  quantity?: number;
  unitPrice?: number;
  totalPrice?: number;
  category?: string;
}

interface PostPayload {
  external_id: string;
  status?: string;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  booking_date?: string;
  delivery_window?: string;
  booking_type?: 'Delivery' | 'Collection';
  payment_method?: 'Card' | 'Cash' | 'Unrecorded';
  payment_status?: 'Paid' | 'Unpaid';
  payment_amount?: number;
  address_line1?: string;
  address_line2?: string;
  address_city?: string;
  address_county?: string;
  address_postcode?: string;
  notes?: string;
  products?: IncomingProduct[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const VALID_STATUSES = new Set([
  'Booking Accepted',
  'Booking Confirmed',
  'Booking Out For Delivery',
  'Booking Delivered',
  'Booking Completed',
  'Booking Cancelled',
]);

/**
 * Internal statuses that represent an active driver run.
 * Status updates are ignored when the order is in one of these states.
 */
const LOCKED_STATUSES = new Set([
  'Booking Out For Delivery',
  'Booking Delivered',
  'Booking Completed',
]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function today(): string {
  return new Date().toISOString().split('T')[0];
}

function verifySignature(rawBody: string, signature: string, secret: string): boolean {
  const hmac = createHmac('sha256', secret);
  hmac.update(rawBody, 'utf8');
  return hmac.digest('base64') === signature;
}

// ─── GET — Create a booking ───────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;

  const external_id = p.get('external_id');
  const customer_name = p.get('customer_name');

  // Verification ping — no parameters provided, just confirm the endpoint is alive
  if (!external_id && !customer_name) {
    return NextResponse.json(
      { received: true, status: 'ok', message: 'Webhook endpoint is active' },
      { status: 200 }
    );
  }

  if (!external_id || !customer_name) {
    return NextResponse.json(
      { error: 'Missing required query parameters: external_id, customer_name' },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  // Prevent duplicates
  const { data: existing } = await supabase
    .from('orders')
    .select('id')
    .eq('woo_order_id', `EXT-${external_id}`)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { received: true, action: 'already_exists', orderId: existing.id },
      { status: 200 }
    );
  }

  const payment_method = (p.get('payment_method') ?? 'Unrecorded') as 'Card' | 'Cash' | 'Unrecorded';
  const payment_status = (p.get('payment_status') ?? 'Unpaid') as 'Paid' | 'Unpaid';
  const booking_type = (p.get('booking_type') ?? 'Delivery') as 'Delivery' | 'Collection';
  const status = VALID_STATUSES.has(p.get('status') ?? '') ? p.get('status')! : 'Booking Accepted';
  const orderId = `EXT-${external_id}`;

  const row = {
    id: orderId,
    woo_order_id: `EXT-${external_id}`,
    customer_name,
    customer_email: p.get('customer_email') ?? '',
    customer_phone: p.get('customer_phone') ?? '',
    booking_type,
    status,
    delivery_address_line1: p.get('address_line1') ?? null,
    delivery_address_line2: p.get('address_line2') ?? null,
    delivery_address_city: p.get('address_city') ?? null,
    delivery_address_county: p.get('address_county') ?? null,
    delivery_address_postcode: p.get('address_postcode') ?? null,
    delivery_address_notes: null,
    driver_id: null,
    booking_date: p.get('booking_date') ?? today(),
    delivery_window: p.get('delivery_window') ?? 'TBC',
    collection_window: null,
    payment_status,
    payment_method,
    payment_amount: parseFloat(p.get('payment_amount') ?? '0') || 0,
    products: [],
    notes: p.get('notes') ?? null,
    custom_fields: {},
  };

  const { error } = await supabase.from('orders').insert(row);
  if (error) {
    return NextResponse.json({ received: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ received: true, action: 'inserted', orderId }, { status: 201 });
}

// ─── POST — Update a booking ──────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.WC_WEBHOOK_SECRET;
  let body: PostPayload;

  if (webhookSecret && webhookSecret !== 'your-woocommerce-webhook-secret-here') {
    const signature = req.headers.get('x-webhook-signature');
    if (!signature) {
      return NextResponse.json({ error: 'Missing X-Webhook-Signature header' }, { status: 401 });
    }
    const rawBody = await req.text();
    if (!verifySignature(rawBody, signature, webhookSecret)) {
      return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
    }
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
  } else {
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
  }

  const { external_id } = body;
  if (!external_id) {
    return NextResponse.json({ error: 'Missing required field: external_id' }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from('orders')
    .select('id, status')
    .eq('woo_order_id', `EXT-${external_id}`)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json(
      { error: `Booking not found for external_id: ${external_id}` },
      { status: 404 }
    );
  }

  // Build update payload from provided fields only
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.customer_name !== undefined) updates.customer_name = body.customer_name;
  if (body.customer_email !== undefined) updates.customer_email = body.customer_email;
  if (body.customer_phone !== undefined) updates.customer_phone = body.customer_phone;
  if (body.booking_date !== undefined) updates.booking_date = body.booking_date;
  if (body.delivery_window !== undefined) updates.delivery_window = body.delivery_window;
  if (body.booking_type !== undefined) updates.booking_type = body.booking_type;
  if (body.payment_method !== undefined) updates.payment_method = body.payment_method;
  if (body.payment_status !== undefined) updates.payment_status = body.payment_status;
  if (body.payment_amount !== undefined) updates.payment_amount = body.payment_amount;
  if (body.address_line1 !== undefined) updates.delivery_address_line1 = body.address_line1;
  if (body.address_line2 !== undefined) updates.delivery_address_line2 = body.address_line2;
  if (body.address_city !== undefined) updates.delivery_address_city = body.address_city;
  if (body.address_county !== undefined) updates.delivery_address_county = body.address_county;
  if (body.address_postcode !== undefined) updates.delivery_address_postcode = body.address_postcode;
  if (body.notes !== undefined) updates.notes = body.notes;
  if (body.products !== undefined) updates.products = body.products;

  // Status update — skip if driver run is in progress
  const isLocked = LOCKED_STATUSES.has(existing.status);
  if (body.status !== undefined && VALID_STATUSES.has(body.status) && !isLocked) {
    updates.status = body.status;
  }

  const { error } = await supabase.from('orders').update(updates).eq('id', existing.id);
  if (error) {
    return NextResponse.json({ received: false, error: error.message }, { status: 500 });
  }

  if (isLocked && body.status !== undefined) {
    return NextResponse.json({
      received: true,
      action: 'updated_details_only',
      reason: `Status kept as "${existing.status}" — driver run in progress`,
      orderId: existing.id,
    });
  }

  return NextResponse.json({ received: true, action: 'updated', orderId: existing.id });
}
