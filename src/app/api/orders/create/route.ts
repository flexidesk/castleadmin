import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/server';
import sql from 'mssql';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      id,
      woo_order_id,
      customer_name,
      customer_email,
      customer_phone,
      booking_type,
      status,
      booking_date,
      delivery_window,
      collection_window,
      payment_method,
      payment_status,
      payment_amount,
      deposit_paid,
      amount_due,
      delivery_charge,
      products,
      notes,
      custom_fields,
      driver_id,
      delivery_address_line1,
      delivery_address_line2,
      delivery_address_city,
      delivery_address_county,
      delivery_address_postcode,
      delivery_address_notes,
    } = body;

    if (!id || !customer_name || !booking_date) {
      return NextResponse.json(
        { error: 'Missing required fields: id, customer_name, booking_date' },
        { status: 400 }
      );
    }

    const pool = await getPool();
    const request = pool.request();

    request.input('id', sql.NVarChar(100), id);
    request.input('woo_order_id', sql.NVarChar(100), woo_order_id ?? '');
    request.input('customer_name', sql.NVarChar(255), customer_name);
    request.input('customer_email', sql.NVarChar(255), customer_email ?? '');
    request.input('customer_phone', sql.NVarChar(50), customer_phone ?? '');
    request.input('booking_type', sql.NVarChar(50), booking_type ?? 'Delivery');
    request.input('status', sql.NVarChar(100), status ?? 'Booking Accepted');
    request.input('booking_date', sql.NVarChar(50), booking_date);
    request.input('delivery_window', sql.NVarChar(100), delivery_window ?? '');
    request.input('collection_window', sql.NVarChar(100), collection_window ?? null);
    request.input('payment_method', sql.NVarChar(50), payment_method ?? 'Unrecorded');
    request.input('payment_status', sql.NVarChar(50), payment_status ?? 'Unpaid');
    request.input('payment_amount', sql.Decimal(10, 2), payment_amount ?? 0);
    request.input('deposit_paid', sql.Decimal(10, 2), deposit_paid ?? null);
    request.input('amount_due', sql.Decimal(10, 2), amount_due ?? null);
    request.input('delivery_charge', sql.Decimal(10, 2), delivery_charge ?? null);
    request.input('products', sql.NVarChar(sql.MAX), JSON.stringify(products ?? []));
    request.input('notes', sql.NVarChar(sql.MAX), notes ?? null);
    request.input('custom_fields', sql.NVarChar(sql.MAX), JSON.stringify(custom_fields ?? {}));
    request.input('driver_id', sql.NVarChar(100), driver_id ?? null);
    request.input('delivery_address_line1', sql.NVarChar(255), delivery_address_line1 ?? null);
    request.input('delivery_address_line2', sql.NVarChar(255), delivery_address_line2 ?? null);
    request.input('delivery_address_city', sql.NVarChar(100), delivery_address_city ?? null);
    request.input('delivery_address_county', sql.NVarChar(100), delivery_address_county ?? null);
    request.input('delivery_address_postcode', sql.NVarChar(20), delivery_address_postcode ?? null);
    request.input('delivery_address_notes', sql.NVarChar(sql.MAX), delivery_address_notes ?? null);

    const now = new Date().toISOString();
    request.input('created_at', sql.NVarChar(50), now);
    request.input('updated_at', sql.NVarChar(50), now);

    const result = await request.query(`
      INSERT INTO [orders] (
        [id], [woo_order_id], [customer_name], [customer_email], [customer_phone],
        [booking_type], [status], [booking_date], [delivery_window], [collection_window],
        [payment_method], [payment_status], [payment_amount], [deposit_paid], [amount_due],
        [delivery_charge], [products], [notes], [custom_fields], [driver_id],
        [delivery_address_line1], [delivery_address_line2], [delivery_address_city],
        [delivery_address_county], [delivery_address_postcode], [delivery_address_notes],
        [created_at], [updated_at]
      )
      OUTPUT INSERTED.[id]
      VALUES (
        @id, @woo_order_id, @customer_name, @customer_email, @customer_phone,
        @booking_type, @status, @booking_date, @delivery_window, @collection_window,
        @payment_method, @payment_status, @payment_amount, @deposit_paid, @amount_due,
        @delivery_charge, @products, @notes, @custom_fields, @driver_id,
        @delivery_address_line1, @delivery_address_line2, @delivery_address_city,
        @delivery_address_county, @delivery_address_postcode, @delivery_address_notes,
        @created_at, @updated_at
      )
    `);

    const insertedId = result.recordset?.[0]?.id ?? id;

    return NextResponse.json({ id: insertedId }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Database error';
    console.error('[POST /api/orders/create] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
