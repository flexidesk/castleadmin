import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/db/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '30');

    const db = await createClient();
    const { data, error } = await db
      .from('orders')
      .select('id, woo_order_id, customer_name, status, driver_id, payment_status, created_at, updated_at')
      .order('updated_at', { ascending: false })
      .limit(Math.min(limit, 100));

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (err: any) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
