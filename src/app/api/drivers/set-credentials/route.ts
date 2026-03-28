import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';

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

    // Fetch driver record using server client (anon key is fine for reading)
    const { data: driver, error: driverError } = await supabaseServer
      .from('drivers')
      .select('id, name, email, auth_user_id')
      .eq('id', driverId)
      .single();

    if (driverError || !driver) {
      return NextResponse.json({ error: 'Driver not found' }, { status: 404 });
    }

    let authUserId: string;

    if (hasAdminKey) {
      // ── Admin path: full control via service role key ──────────────────────
      const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        serviceRoleKey!,
        { auth: { autoRefreshToken: false, persistSession: false } }
      );

      if (driver.auth_user_id) {
        // Update existing auth user
        const { data: updatedUser, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
          driver.auth_user_id,
          { email, password, email_confirm: true }
        );
        if (updateError) {
          return NextResponse.json({ error: 'Failed to update credentials: ' + updateError.message }, { status: 400 });
        }
        authUserId = updatedUser.user.id;
      } else {
        // Check if email already exists
        const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
        const existingUser = existingUsers?.users?.find((u) => u.email === email);

        if (existingUser) {
          // Check if linked to another driver
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

          // Update password and link
          const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
            existingUser.id,
            { password, email_confirm: true }
          );
          if (updateError) {
            return NextResponse.json({ error: 'Failed to update password: ' + updateError.message }, { status: 400 });
          }
          authUserId = existingUser.id;
        } else {
          // Create new auth user
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
    } else {
      // ── Fallback path: use signUp (no service role key required) ──────────
      // Create a temporary anon client for signUp
      const supabaseAnon = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
      );

      if (driver.auth_user_id) {
        // Cannot update existing auth user without admin key
        return NextResponse.json(
          { error: 'Updating existing driver credentials requires SUPABASE_SERVICE_ROLE_KEY to be configured in environment variables.' },
          { status: 500 }
        );
      }

      // Sign up the driver — creates auth account
      const { data: signUpData, error: signUpError } = await supabaseAnon.auth.signUp({
        email,
        password,
        options: {
          // Prevent auto sign-in of the admin session
          emailRedirectTo: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/callback`,
        },
      });

      if (signUpError) {
        if (signUpError.message?.toLowerCase().includes('already registered')) {
          return NextResponse.json(
            { error: 'An account with this email already exists. To update credentials, please configure SUPABASE_SERVICE_ROLE_KEY in your environment variables.' },
            { status: 409 }
          );
        }
        return NextResponse.json({ error: 'Failed to create driver account: ' + signUpError.message }, { status: 400 });
      }

      if (!signUpData.user) {
        return NextResponse.json({ error: 'Failed to create driver account — no user returned' }, { status: 400 });
      }

      authUserId = signUpData.user.id;
    }

    // Link auth_user_id and email to driver record
    const { error: linkError } = await supabaseServer
      .from('drivers')
      .update({ auth_user_id: authUserId, email })
      .eq('id', driverId);

    if (linkError) {
      return NextResponse.json({ error: 'Failed to link credentials to driver: ' + linkError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Driver credentials set successfully' });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 });
  }
}
