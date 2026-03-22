import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const orderId = params.id;

  const baseUrl = process.env.WC_BASE_URL;
  const consumerKey = process.env.WC_CONSUMER_KEY;
  const consumerSecret = process.env.WC_CONSUMER_SECRET;

  if (!baseUrl || !consumerKey || !consumerSecret) {
    return NextResponse.json(
      { error: 'WooCommerce credentials are not configured. Please set WC_BASE_URL, WC_CONSUMER_KEY, and WC_CONSUMER_SECRET in your environment variables.' },
      { status: 500 }
    );
  }

  const endpoint = `${baseUrl.replace(/\/$/, '')}/wp-json/wc/v3/orders/${orderId}`;
  const credentials = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');

  let wooResponse: Response;
  try {
    wooResponse = await fetch(endpoint, {
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/json',
      },
      // Don't cache — always fetch fresh order data
      cache: 'no-store',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Network error';
    return NextResponse.json(
      { error: `Failed to reach WooCommerce store: ${message}` },
      { status: 502 }
    );
  }

  if (!wooResponse.ok) {
    let errorBody: { message?: string } = {};
    try {
      errorBody = await wooResponse.json();
    } catch {
      // ignore parse error
    }
    return NextResponse.json(
      { error: errorBody.message ?? `WooCommerce returned status ${wooResponse.status}` },
      { status: wooResponse.status }
    );
  }

  const order = await wooResponse.json();

  // Map WooCommerce order fields to the shape the form expects
  const billing = order.billing ?? {};
  const shipping = order.shipping ?? {};

  // Prefer shipping address for delivery; fall back to billing
  const addressSource = shipping.address_1 ? shipping : billing;

  const lineItems = (order.line_items ?? []).map((item: {
    name?: string;
    sku?: string;
    quantity?: number;
    price?: string | number;
    subtotal?: string | number;
    total?: string | number;
    meta_data?: { key: string; value: string }[];
  }) => {
    // Derive unit price: prefer `price` field, fall back to subtotal / quantity
    const qty = Number(item.quantity) || 1;
    let unitPrice = 0;
    if (item.price !== undefined && item.price !== null) {
      unitPrice = Number(item.price);
    } else if (item.subtotal !== undefined) {
      unitPrice = Number(item.subtotal) / qty;
    } else if (item.total !== undefined) {
      unitPrice = Number(item.total) / qty;
    }

    // Attempt to derive a category from product meta (e.g. _product_type or category meta)
    const categoryMeta = (item.meta_data ?? []).find(
      (m: { key: string }) => m.key === '_product_type' || m.key === 'pa_category'
    );
    const category = categoryMeta?.value ?? 'Bouncy Castle';

    return {
      name: item.name ?? '',
      sku: item.sku ?? '',
      quantity: qty,
      unitPrice: parseFloat(unitPrice.toFixed(2)),
      category,
    };
  });

  // Determine payment method from WooCommerce payment_method
  const wooPaymentMethod = (order.payment_method ?? '').toLowerCase();
  let paymentMethod: 'Card' | 'Cash' | 'Unrecorded' = 'Unrecorded';
  if (wooPaymentMethod.includes('stripe') || wooPaymentMethod.includes('card') || wooPaymentMethod.includes('paypal')) {
    paymentMethod = 'Card';
  } else if (wooPaymentMethod.includes('cod') || wooPaymentMethod.includes('cash')) {
    paymentMethod = 'Cash';
  }

  const mapped = {
    customerName: `${billing.first_name ?? ''} ${billing.last_name ?? ''}`.trim(),
    customerEmail: billing.email ?? '',
    customerPhone: billing.phone ?? '',
    addressLine1: addressSource.address_1 ?? '',
    addressLine2: addressSource.address_2 ?? '',
    city: addressSource.city ?? '',
    county: addressSource.state ?? '',
    postcode: addressSource.postcode ?? '',
    paymentMethod,
    paymentAmount: order.total ?? '',
    products: lineItems,
    // Pass through raw WooCommerce status for reference
    wooStatus: order.status ?? '',
    wooOrderId: String(order.id ?? orderId),
  };

  return NextResponse.json(mapped);
}
