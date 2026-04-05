import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';

export const dynamic = 'force-dynamic';

function hashPassword(password: string): string {
  const salt = process.env.NEXT_PUBLIC_SUPABASE_URL || 'castle-driver-salt';
  return createHash('sha256').update(salt + password + salt).digest('hex');
}

async function querySupabase(path: string, body?: object) {
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${path}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase error ${res.status}: ${text}`);
  }
  return res.json();
}

export async function POST(request: NextRequest) {
  try {
    let email: string | undefined;
    let password: string | undefined;

    try {
      const body = await request.json();
      email = body?.email;
      password = body?.password;
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const passwordHash = hashPassword(password);

    // Look up credentials via Supabase REST API directly
    const credUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/driver_portal_credentials?email=eq.${encodeURIComponent(normalizedEmail)}&select=driver_id,email,password_hash&limit=1`;
    const credRes = await fetch(credUrl, {
      headers: {
        'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`,
        'Accept': 'application/json',
      },
    });

    if (!credRes.ok) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    const creds = await credRes.json();
    const cred = Array.isArray(creds) ? creds[0] : null;

    if (!cred) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    if (passwordHash !== cred.password_hash) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    // Fetch driver details
    const driverUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/drivers?id=eq.${encodeURIComponent(cred.driver_id)}&select=id,name,email,status,vehicle,plate,avatar,phone&limit=1`;
    const driverRes = await fetch(driverUrl, {
      headers: {
        'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`,
        'Accept': 'application/json',
      },
    });

    if (!driverRes.ok) {
      return NextResponse.json({ error: 'Driver account not found' }, { status: 404 });
    }

    const drivers = await driverRes.json();
    const driver = Array.isArray(drivers) ? drivers[0] : null;

    if (!driver) {
      return NextResponse.json({ error: 'Driver account not found' }, { status: 404 });
    }

    // Create session token
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
    console.error('[portal-login] error:', err);
    return NextResponse.json(
      { error: err?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: NextRequest) {
  const response = NextResponse.json({ success: true });
  response.cookies.delete('driver_session');
  return response;
}
