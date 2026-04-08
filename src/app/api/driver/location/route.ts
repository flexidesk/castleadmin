import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/db/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { driver_id, latitude, longitude, accuracy, heading, speed, timestamp } = body;

    if (!driver_id || latitude == null || longitude == null) {
      return NextResponse.json(
        { error: 'driver_id, latitude, and longitude are required' },
        { status: 400 }
      );
    }

    const db = await createClient();

    const { error } = await db.from('driver_locations').upsert(
      {
        driver_id,
        latitude,
        longitude,
        accuracy: accuracy ?? null,
        heading: heading ?? null,
        speed: speed ?? null,
        recorded_at: timestamp ? new Date(timestamp).toISOString() : new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'driver_id' }
    );

    if (error) {
      console.error('driver/location upsert error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('driver/location route error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
