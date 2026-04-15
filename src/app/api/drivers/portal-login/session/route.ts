import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/db/server';

export async function GET(request: NextRequest) {
  try {
    const sessionCookie = request.cookies.get('driver_session');
    if (!sessionCookie?.value) {
      return NextResponse.json({ driver: null }, { status: 200 });
    }

    let sessionData: any;
    try {
      sessionData = JSON.parse(Buffer.from(sessionCookie.value, 'base64').toString('utf-8'));
    } catch {
      return NextResponse.json({ driver: null }, { status: 200 });
    }

    const maxAge = 7 * 24 * 60 * 60 * 1000;
    if (!sessionData.loginAt || Date.now() - sessionData.loginAt > maxAge) {
      const response = NextResponse.json({ driver: null }, { status: 200 });
      response.cookies.delete('driver_session');
      return response;
    }

    const db = await createClient();
    const { data: drivers, error } = await db
      .from('drivers')
      .select('id, name, email, status, vehicle, plate, avatar, phone, access_code')
      .eq('id', sessionData.driverId)
      .eq('is_active', true)
      .limit(1);

    const driver = Array.isArray(drivers) ? drivers[0] : null;

    if (error || !driver) {
      const response = NextResponse.json({ driver: null }, { status: 200 });
      response.cookies.delete('driver_session');
      return response;
    }

    return NextResponse.json({ driver });
  } catch (err: any) {
    return NextResponse.json({ driver: null }, { status: 200 });
  }
}
