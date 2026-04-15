import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/db/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const driverId = searchParams.get('driver_id');
    const limit = parseInt(searchParams.get('limit') || '20');

    if (!driverId) {
      return NextResponse.json({ error: 'driver_id is required' }, { status: 400 });
    }

    const db = await createClient();
    const { data, error } = await db
      .from('orders')
      .select('id, woo_order_id, customer_name, status, driver_id, delivery_address_line1, updated_at')
      .eq('driver_id', driverId)
      .order('updated_at', { ascending: false })
      .limit(Math.min(limit, 50));

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (err: any) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
