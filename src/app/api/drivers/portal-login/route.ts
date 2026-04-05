import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';

export const dynamic = 'force-dynamic';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

// Use service role key if available and not a placeholder, otherwise fall back to anon key
function getApiKey(): string {
  if (SERVICE_KEY && !SERVICE_KEY.startsWith('your-') && SERVICE_KEY.length > 20) {
    return SERVICE_KEY;
  }
  return ANON_KEY;
}

function hashPassword(password: string): string {
  const salt = 'castle-driver-salt';
  return createHash('sha256').update(salt + password + salt).digest('hex');
}

async function dbGet(path: string): Promise<any[]> {
  const key = getApiKey();
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
      'Cache-Control': 'no-cache',
    },
  });

  const text = await res.text();

  if (!res.ok) {
    throw new Error(`DB query failed (${res.status}): ${text}`);
  }

  try {
    const data = JSON.parse(text);
    return Array.isArray(data) ? data : [];
  } catch {
    throw new Error(`DB returned non-JSON: ${text.slice(0, 200)}`);
  }
}

export async function POST(request: NextRequest) {
  try {
    // Parse body
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

    // ── Step 1: Look up credentials ──────────────────────────────────────────
    let creds: any[];
    try {
      creds = await dbGet(
        `driver_portal_credentials?email=eq.${encodeURIComponent(normalizedEmail)}&select=driver_id,email,password_hash&limit=1`
      );
    } catch (err: any) {
      console.error('[portal-login] credential lookup error:', err.message);
      return NextResponse.json(
        { error: 'Authentication service unavailable', detail: err.message },
        { status: 503 }
      );
    }

    const cred = creds[0] ?? null;

    if (!cred) {
      // Return generic message to avoid email enumeration
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    // ── Step 2: Verify password hash ─────────────────────────────────────────
    if (passwordHash !== cred.password_hash) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    // ── Step 3: Fetch driver record ───────────────────────────────────────────
    let drivers: any[];
    try {
      drivers = await dbGet(
        `drivers?id=eq.${encodeURIComponent(cred.driver_id)}&select=id,name,email,status,vehicle,plate,avatar,phone&limit=1`
      );
    } catch (err: any) {
      console.error('[portal-login] driver lookup error:', err.message);
      return NextResponse.json(
        { error: 'Driver account lookup failed', detail: err.message },
        { status: 503 }
      );
    }

    const driver = drivers[0] ?? null;

    if (!driver) {
      return NextResponse.json({ error: 'Driver account not found' }, { status: 404 });
    }

    // ── Step 4: Build session token ───────────────────────────────────────────
    const sessionPayload = {
      driverId: driver.id,
      email: cred.email,
      name: driver.name,
      loginAt: Date.now(),
    };

    const sessionToken = Buffer.from(JSON.stringify(sessionPayload)).toString('base64');

    // ── Step 5: Return response with session cookie ───────────────────────────
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
      maxAge: 60 * 60 * 24 * 7, // 7 days
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
