import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { createClient } from '@/lib/db/server';

export const dynamic = 'force-dynamic';

function hashPassword(password: string): string {
  const salt = 'castle-driver-salt';
  return createHash('sha256').update(salt + password + salt).digest('hex');
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

    const db = await createClient();

    const { data: creds, error: credErr } = await db
      .from('driver_portal_credentials')
      .select('driver_id, email, password_hash')
      .eq('email', normalizedEmail)
      .limit(1);

    if (credErr) {
      console.error('[portal-login] credential lookup error:', credErr.message);
      return NextResponse.json(
        { error: 'Authentication service unavailable', detail: credErr.message },
        { status: 503 }
      );
    }

    const cred = Array.isArray(creds) ? creds[0] : null;

    if (!cred) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    if (passwordHash !== cred.password_hash) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    const { data: drivers, error: driverErr } = await db
      .from('drivers')
      .select('id, name, email, status, vehicle, plate, avatar, phone')
      .eq('id', cred.driver_id)
      .limit(1);

    if (driverErr) {
      console.error('[portal-login] driver lookup error:', driverErr.message);
      return NextResponse.json(
        { error: 'Driver account lookup failed', detail: driverErr.message },
        { status: 503 }
      );
    }

    const driver = Array.isArray(drivers) ? drivers[0] : null;

    if (!driver) {
      return NextResponse.json({ error: 'Driver account not found' }, { status: 404 });
    }

    const sessionPayload = {
      driverId: driver.id,
      email: cred.email,
      name: driver.name,
      loginAt: Date.now(),
    };

    const sessionToken = Buffer.from(JSON.stringify(sessionPayload)).toString('base64');

    const response = NextResponse.json({
      success: true,
      driver: {
        id: driver.id,
        name: driver.name,
        email: driver.email ?? cred.email,
        status: driver.status,
        vehicle: driver.vehicle,
        plate: driver.plate,
        avatar: driver.avatar,
        phone: driver.phone,
      },
    });

    response.cookies.set('driver_session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    });

    return response;
  } catch (err: any) {
    console.error('[portal-login] unexpected error:', err);
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
