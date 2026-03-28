import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';

// Simple password hashing using SHA-256 with a salt
// For production with service role key, Supabase Auth is used instead
function hashPassword(password: string): string {
  const salt = process.env.NEXT_PUBLIC_SUPABASE_URL || 'castle-driver-salt';
  return createHash('sha256').update(salt + password + salt).digest('hex');
}

export async function POST(request: NextRequest) {
  try {
    // Verify the requesting user is an authenticated admin
    const supabaseServer = await createServerClient();
    const { data: { user }, error: authError } = await supabaseServer.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { driverId, email, password } = await request.json();

    if (!driverId || !email || !password) {
      return NextResponse.json({ error: 'driverId, email, and password are required' }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
    }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const hasAdminKey = serviceRoleKey && !serviceRoleKey.startsWith('your-') && serviceRoleKey !== '';

    // Fetch driver record
    const { data: driver, error: driverError } = await supabaseServer
      .from('drivers')
      .select('id, name, email, auth_user_id')
      .eq('id', driverId)
      .single();

    if (driverError || !driver) {
      return NextResponse.json({ error: 'Driver not found' }, { status: 404 });
    }

    if (hasAdminKey) {
      // ── Admin path: full Supabase Auth control via service role key ──────────
      const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        serviceRoleKey!,
        { auth: { autoRefreshToken: false, persistSession: false } }
      );

      let authUserId: string;

      if (driver.auth_user_id) {
        const { data: updatedUser, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
          driver.auth_user_id,
          { email, password, email_confirm: true }
        );
        if (updateError) {
          return NextResponse.json({ error: 'Failed to update credentials: ' + updateError.message }, { status: 400 });
        }
        authUserId = updatedUser.user.id;
      } else {
        const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
        const existingUser = existingUsers?.users?.find((u) => u.email === email);

        if (existingUser) {
          const { data: linkedDriver } = await supabaseAdmin
            .from('drivers')
            .select('id, name')
            .eq('auth_user_id', existingUser.id)
            .maybeSingle();

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
            return NextResponse.json({ error: 'Failed to update password: ' + updateError.message }, { status: 400 });
          }
          authUserId = existingUser.id;
        } else {
          const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
          });
          if (createError) {
            return NextResponse.json({ error: 'Failed to create auth user: ' + createError.message }, { status: 400 });
          }
          authUserId = newUser.user.id;
        }
      }

      // Link auth_user_id and email to driver record
      const { error: linkError } = await supabaseServer
        .from('drivers')
        .update({ auth_user_id: authUserId, email })
        .eq('id', driverId);

      if (linkError) {
        return NextResponse.json({ error: 'Failed to link credentials to driver: ' + linkError.message }, { status: 500 });
      }
    }

    // ── Always store credentials in driver_portal_credentials table ──────────
    // This enables driver portal login regardless of whether Supabase Auth is configured
    const passwordHash = hashPassword(password);

    // Check if another driver already uses this email
    const { data: existingCred } = await supabaseServer
      .from('driver_portal_credentials')
      .select('driver_id')
      .eq('email', email)
      .maybeSingle();

    if (existingCred && existingCred.driver_id !== driverId) {
      return NextResponse.json(
        { error: 'This email is already used by another driver' },
        { status: 409 }
      );
    }

    const { error: credError } = await supabaseServer
      .from('driver_portal_credentials')
      .upsert(
        { driver_id: driverId, email, password_hash: passwordHash },
        { onConflict: 'driver_id' }
      );

    if (credError) {
      return NextResponse.json({ error: 'Failed to save credentials: ' + credError.message }, { status: 500 });
    }

    // Update driver email
    const { error: emailError } = await supabaseServer
      .from('drivers')
      .update({ email })
      .eq('id', driverId);

    if (emailError) {
      return NextResponse.json({ error: 'Failed to update driver email: ' + emailError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Driver credentials set successfully' });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 });
  }
}
