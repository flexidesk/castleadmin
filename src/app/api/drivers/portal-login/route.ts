import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createHash } from 'crypto';
import { cookies } from 'next/headers';

function hashPassword(password: string): string {
  const salt = process.env.NEXT_PUBLIC_SUPABASE_URL || 'castle-driver-salt';
  return createHash('sha256').update(salt + password + salt).digest('hex');
}

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    const supabase = await createServerClient();

    // Look up credentials
    const { data: cred, error: credError } = await supabase
      .from('driver_portal_credentials')
      .select('driver_id, email, password_hash')
      .eq('email', email.toLowerCase().trim())
      .maybeSingle();

    if (credError || !cred) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    const passwordHash = hashPassword(password);
    if (passwordHash !== cred.password_hash) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    // Fetch driver details
    const { data: driver, error: driverError } = await supabase
      .from('drivers')
      .select('id, name, email, status, vehicle, plate, avatar, phone')
      .eq('id', cred.driver_id)
      .single();

    if (driverError || !driver) {
      return NextResponse.json({ error: 'Driver account not found' }, { status: 404 });
    }

    // Create a session token (simple JWT-like structure stored in cookie)
    const sessionData = {
      driverId: driver.id,
      email: cred.email,
      name: driver.name,
      loginAt: Date.now(),
    };

    const sessionToken = Buffer.from(JSON.stringify(sessionData)).toString('base64');

    const response = NextResponse.json({
      success: true,
      driver: {
        id: driver.id,
        name: driver.name,
        email: driver.email,
        status: driver.status,
        vehicle: driver.vehicle,
        plate: driver.plate,
        avatar: driver.avatar,
        phone: driver.phone,
      },
    });

    // Set session cookie (7 days)
    response.cookies.set('driver_session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    });

    return response;
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const response = NextResponse.json({ success: true });
  response.cookies.delete('driver_session');
  return response;
}
