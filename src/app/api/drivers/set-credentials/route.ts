import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';

export const dynamic = 'force-dynamic';

function hashPassword(password: string): string {
  const salt = 'castle-driver-salt';
  return createHash('sha256').update(salt + password + salt).digest('hex');
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function restGet(path: string, useServiceRole = false) {
  const key = useServiceRole && SERVICE_ROLE_KEY && !SERVICE_ROLE_KEY.startsWith('your-') ? SERVICE_ROLE_KEY : ANON_KEY;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase GET error ${res.status}: ${text}`);
  }
  return res.json();
}

async function restPost(path: string, body: object, method = 'POST', useServiceRole = false) {
  const key = useServiceRole && SERVICE_ROLE_KEY && !SERVICE_ROLE_KEY.startsWith('your-') ? SERVICE_ROLE_KEY : ANON_KEY;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Prefer: method === 'POST' ? 'resolution=merge-duplicates,return=minimal' : 'return=minimal',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase ${method} error ${res.status}: ${text}`);
  }
  return res;
}

async function verifyAdminSession(request: NextRequest): Promise<boolean> {
  // Check Authorization header (Bearer token from Supabase Auth)
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${token}`,
      },
    });
    if (res.ok) {
      const user = await res.json();
      return !!user?.id;
    }
  }

  // Check cookie-based session (sb-* cookies set by Supabase Auth)
  const cookieHeader = request.headers.get('cookie') || '';
  const cookies = Object.fromEntries(
    cookieHeader.split(';').map((c) => {
      const [k, ...v] = c.trim().split('=');
      return [k, v.join('=')];
    })
  );

  // Try to find Supabase auth token in cookies
  const tokenKeys = Object.keys(cookies).filter(
    (k) => k.includes('auth-token') || k.startsWith('sb-')
  );

  for (const key of tokenKeys) {
    try {
      const val = decodeURIComponent(cookies[key]);
      const parsed = JSON.parse(val);
      const accessToken = parsed?.access_token || parsed?.[0]?.access_token;
      if (accessToken) {
        const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
          headers: {
            apikey: ANON_KEY,
            Authorization: `Bearer ${accessToken}`,
          },
        });
        if (res.ok) {
          const user = await res.json();
          if (user?.id) return true;
        }
      }
    } catch {
      // ignore parse errors
    }
  }

  return false;
}

export async function POST(request: NextRequest) {
  try {
    // Verify admin session
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

    const hasServiceRole =
      SERVICE_ROLE_KEY && !SERVICE_ROLE_KEY.startsWith('your-') && SERVICE_ROLE_KEY !== '';

    // Fetch driver record
    const drivers = await restGet(
      `drivers?id=eq.${encodeURIComponent(driverId)}&select=id,name,email,auth_user_id&limit=1`,
      true
    );
    const driver = Array.isArray(drivers) ? drivers[0] : null;
    if (!driver) {
      return NextResponse.json({ error: 'Driver not found' }, { status: 404 });
    }

    // ── Admin path: Supabase Auth via service role key ──────────────────────
    if (hasServiceRole) {
      const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY!, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      let authUserId: string;

      if (driver.auth_user_id) {
        const { data: updatedUser, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
          driver.auth_user_id,
          { email, password, email_confirm: true }
        );
        if (updateError) {
          return NextResponse.json(
            { error: 'Failed to update credentials: ' + updateError.message },
            { status: 400 }
          );
        }
        authUserId = updatedUser.user.id;
      } else {
        const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
        const existingUser = existingUsers?.users?.find((u) => u.email === email);

        if (existingUser) {
          const linkedDrivers = await restGet(
            `drivers?auth_user_id=eq.${encodeURIComponent(existingUser.id)}&select=id,name&limit=1`,
            true
          );
          const linkedDriver = Array.isArray(linkedDrivers) ? linkedDrivers[0] : null;

          if (linkedDriver && linkedDriver.id !== driverId) {
            return NextResponse.json(
              { error: `This email is already linked to driver: ${linkedDriver.name}` },
              { status: 409 }
            );
          }

          const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
            existingUser.id,
            { password, email_confirm: true }
          );
          if (updateError) {
            return NextResponse.json(
              { error: 'Failed to update password: ' + updateError.message },
              { status: 400 }
            );
          }
          authUserId = existingUser.id;
        } else {
          const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
          });
          if (createError) {
            return NextResponse.json(
              { error: 'Failed to create auth user: ' + createError.message },
              { status: 400 }
            );
          }
          authUserId = newUser.user.id;
        }
      }

      // Link auth_user_id and email to driver record
      await restPost(
        `drivers?id=eq.${encodeURIComponent(driverId)}`,
        { auth_user_id: authUserId, email },
        'PATCH',
        true
      );
    }

    // ── Always store credentials in driver_portal_credentials ───────────────
    const passwordHash = hashPassword(password);

    // Check if another driver already uses this email
    const existingCreds = await restGet(
      `driver_portal_credentials?email=eq.${encodeURIComponent(email)}&select=driver_id&limit=1`,
      true
    );
    const existingCred = Array.isArray(existingCreds) ? existingCreds[0] : null;

    if (existingCred && existingCred.driver_id !== driverId) {
      return NextResponse.json(
        { error: 'This email is already used by another driver' },
        { status: 409 }
      );
    }

    // Upsert credentials
    await restPost(
      `driver_portal_credentials`,
      { driver_id: driverId, email, password_hash: passwordHash },
      'POST',
      true
    );

    // Update driver email
    await restPost(
      `drivers?id=eq.${encodeURIComponent(driverId)}`,
      { email },
      'PATCH',
      true
    );

    return NextResponse.json({ success: true, message: 'Driver credentials set successfully' });
  } catch (err: any) {
    console.error('[set-credentials] error:', err);
    return NextResponse.json(
      { error: err?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
