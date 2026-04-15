import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/db/server';
import { createHash } from 'crypto';
import { verify } from 'jsonwebtoken';

export const dynamic = 'force-dynamic';

const JWT_SECRET = process.env.JWT_SECRET || 'castleadmin-jwt-secret-change-in-production';

function hashPassword(password: string): string {
  const salt = 'castle-driver-salt';
  return createHash('sha256').update(salt + password + salt).digest('hex');
}

async function verifyAdminSession(request: NextRequest): Promise<boolean> {
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      const payload: any = verify(token, JWT_SECRET);
      return !!payload?.sub;
    } catch {}
  }

  // Check legacy Supabase cookies for backward compatibility
  const cookieHeader = request.headers.get('cookie') || '';
  const cookies = Object.fromEntries(
    cookieHeader.split(';').map((c) => {
      const [k, ...v] = c.trim().split('=');
      return [k, v.join('=')];
    })
  );

  const tokenKeys = Object.keys(cookies).filter(
    (k) => k.includes('auth-token') || k.startsWith('sb-')
  );

  for (const key of tokenKeys) {
    try {
      const val = decodeURIComponent(cookies[key]);
      const parsed = JSON.parse(val);
      const accessToken = parsed?.access_token || parsed?.[0]?.access_token;
      if (accessToken) {
        const payload = verify(accessToken, JWT_SECRET) as any;
        if (payload?.sub) return true;
      }
    } catch {}
  }

  return false;
}

export async function POST(request: NextRequest) {
  try {
    const isAdmin = await verifyAdminSession(request);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let driverId: string, email: string, password: string;
    try {
      const body = await request.json();
      driverId = body?.driverId;
      email = body?.email;
      password = body?.password;
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    if (!driverId || !email || !password) {
      return NextResponse.json({ error: 'driverId, email, and password are required' }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
    }

    const db = await createClient();

    const { data: drivers } = await db
      .from('drivers')
      .select('id, name, email')
      .eq('id', driverId)
      .limit(1);

    const driver = Array.isArray(drivers) ? drivers[0] : null;
    if (!driver) {
      return NextResponse.json({ error: 'Driver not found' }, { status: 404 });
    }

    const passwordHash = hashPassword(password);

    // Check if another driver already uses this email
    const { data: existingCreds } = await db
      .from('driver_portal_credentials')
      .select('driver_id')
      .eq('email', email.toLowerCase().trim())
      .limit(1);

    const existingCred = Array.isArray(existingCreds) ? existingCreds[0] : null;
    if (existingCred && existingCred.driver_id !== driverId) {
      return NextResponse.json(
        { error: 'This email is already used by another driver' },
        { status: 409 }
      );
    }

    // Check if credential row already exists for this driver
    const { data: existingDriverCreds } = await db
      .from('driver_portal_credentials')
      .select('driver_id')
      .eq('driver_id', driverId)
      .limit(1);

    const credExists = Array.isArray(existingDriverCreds) && existingDriverCreds.length > 0;

    if (credExists) {
      await db
        .from('driver_portal_credentials')
        .update({ email: email.toLowerCase().trim(), password_hash: passwordHash })
        .eq('driver_id', driverId);
    } else {
      await db.from('driver_portal_credentials').insert({
        driver_id: driverId,
        email: email.toLowerCase().trim(),
        password_hash: passwordHash,
      });
    }

    // Update driver email
    await db.from('drivers').update({ email: email.toLowerCase().trim() }).eq('id', driverId);

    return NextResponse.json({ success: true, message: 'Driver portal credentials updated successfully' });
  } catch (err: any) {
    console.error('[set-credentials] error:', err);
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 });
  }
}
