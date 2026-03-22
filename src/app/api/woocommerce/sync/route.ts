import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// WooCommerce statuses that map to "Booking Accepted" in our system
const PENDING_STATUSES = ['pending', 'processing', 'on-hold'];

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

function mapWooPaymentMethod(wooMethod: string): 'Card' | 'Cash' | 'Unrecorded' {
  const m = (wooMethod ?? '').toLowerCase();
  if (m.includes('stripe') || m.includes('card') || m.includes('paypal') || m.includes('bacs')) return 'Card';
  if (m.includes('cod') || m.includes('cash')) return 'Cash';
  return 'Unrecorded';
}

function extractDeliveryDate(order: WooOrder): string {
  // Try common WooCommerce delivery date meta keys
  const dateKeys = [
    '_delivery_date',
    'delivery_date',
    '_order_delivery_date',
    'order_delivery_date',
    'jckwds_date',
    '_jckwds_date',
  ];
  for (const key of dateKeys) {
    const meta = order.meta_data?.find((m) => m.key === key);
    if (meta?.value) {
      // Normalize to YYYY-MM-DD
      const d = new Date(meta.value);
      if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
      // Try DD/MM/YYYY format
      const parts = meta.value.split('/');
      if (parts.length === 3) {
        const iso = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        const d2 = new Date(iso);
        if (!isNaN(d2.getTime())) return iso;
      }
      return meta.value;
    }
  }
  // Fall back to order creation date
  return order.date_created ? order.date_created.split('T')[0] : new Date().toISOString().split('T')[0];
}

function extractDeliveryWindow(order: WooOrder): string {
  const windowKeys = [
    '_delivery_time_frame',
    'delivery_time_frame',
    '_order_delivery_time',
    'order_delivery_time',
    'jckwds_time',
    '_jckwds_time',
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
      const v = meta.value.toLowerCase();
      if (v.includes('collect')) return 'Collection';
    }
  }
  // If shipping address is empty, likely a collection
  if (!order.shipping?.address_1 && !order.billing?.address_1) return 'Collection';
  return 'Delivery';
}

export async function POST(_req: NextRequest) {
  const baseUrl = process.env.WC_BASE_URL;
  const consumerKey = process.env.WC_CONSUMER_KEY;
  const consumerSecret = process.env.WC_CONSUMER_SECRET;

  if (!baseUrl || !consumerKey || !consumerSecret) {
    return NextResponse.json(
      { error: 'WooCommerce credentials not configured. Set WC_BASE_URL, WC_CONSUMER_KEY, WC_CONSUMER_SECRET.' },
      { status: 500 }
    );
  }

  const supabase = await createClient();
  const credentials = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
  const apiBase = `${baseUrl.replace(/\/$/, '')}/wp-json/wc/v3`;

  let allOrders: WooOrder[] = [];
  let page = 1;
  const perPage = 100;

  // Paginate through all pending/processing orders
  while (true) {
    const statusParam = PENDING_STATUSES.join(',');
    const url = `${apiBase}/orders?status=${statusParam}&per_page=${perPage}&page=${page}&orderby=date&order=desc`;

    let res: Response;
    try {
      res = await fetch(url, {
        headers: { Authorization: `Basic ${credentials}` },
        cache: 'no-store',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Network error';
      return NextResponse.json({ error: `Failed to reach WooCommerce: ${msg}` }, { status: 502 });
    }

    if (!res.ok) {
      let errBody: { message?: string } = {};
      try { errBody = await res.json(); } catch { /* ignore */ }
      return NextResponse.json(
        { error: errBody.message ?? `WooCommerce returned ${res.status}` },
        { status: res.status }
      );
    }

    const batch: WooOrder[] = await res.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    allOrders = allOrders.concat(batch);
    if (batch.length < perPage) break;
    page++;
  }

  if (allOrders.length === 0) {
    // Log sync run with 0 new orders
    await supabase.from('woocommerce_sync_log').insert({
      orders_fetched: 0,
      orders_upserted: 0,
      status: 'success',
      message: 'No pending orders found in WooCommerce',
    });
    return NextResponse.json({ synced: 0, message: 'No pending orders found' });
  }

  // Map WooCommerce orders to our orders table schema
  const rows = allOrders.map((order) => {
    const billing = order.billing ?? {};
    const shipping = order.shipping ?? {};
    const addressSource = shipping.address_1 ? shipping : billing;
    const bookingType = extractBookingType(order);
    const paymentMethod = mapWooPaymentMethod(order.payment_method);
    const paymentStatus = paymentMethod === 'Unrecorded' ? 'Unpaid' : 'Paid';

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
      status: 'Booking Accepted',
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
  });

  // Upsert into orders table — skip rows that already exist with a non-Accepted status
  // (don't overwrite orders that have been assigned/dispatched)
  let upsertedCount = 0;
  const errors: string[] = [];

  for (const row of rows) {
    // Check if order already exists with a progressed status
    const { data: existing } = await supabase
      .from('orders')
      .select('id, status')
      .eq('woo_order_id', row.woo_order_id)
      .maybeSingle();

    if (existing) {
      // Only update if still at Booking Accepted (don't overwrite dispatched orders)
      if (existing.status === 'Booking Accepted') {
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
          })
          .eq('id', existing.id);
        if (error) errors.push(`Update ${row.woo_order_id}: ${error.message}`);
        else upsertedCount++;
      }
      // Skip orders that have progressed beyond Booking Accepted
    } else {
      // New order — insert
      const { error } = await supabase.from('orders').insert(row);
      if (error) errors.push(`Insert ${row.woo_order_id}: ${error.message}`);
      else upsertedCount++;
    }
  }

  // Log the sync run
  await supabase.from('woocommerce_sync_log').insert({
    orders_fetched: allOrders.length,
    orders_upserted: upsertedCount,
    status: errors.length === 0 ? 'success' : 'partial',
    message: errors.length > 0 ? errors.slice(0, 5).join('; ') : null,
  });

  return NextResponse.json({
    synced: upsertedCount,
    fetched: allOrders.length,
    errors: errors.length,
    message: `Synced ${upsertedCount} of ${allOrders.length} orders from WooCommerce`,
  });
}

// GET — return last sync status
export async function GET(_req: NextRequest) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('woocommerce_sync_log')
    .select('*')
    .order('synced_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? { status: 'never_synced' });
}
