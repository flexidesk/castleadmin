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
    if (!serviceRoleKey || serviceRoleKey.startsWith('your-') || serviceRoleKey === '') {
      return NextResponse.json({ error: 'Server configuration error: SUPABASE_SERVICE_ROLE_KEY is not configured. Please set a valid service role key in your environment variables.' }, { status: 500 });
    }

    // Create admin client with service role key
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Check if driver already has an auth_user_id
    const { data: driver, error: driverError } = await supabaseAdmin
      .from('drivers')
      .select('id, name, email, auth_user_id')
      .eq('id', driverId)
      .single();

    if (driverError) {
      if (driverError.message?.toLowerCase().includes('jwt') || driverError.message?.toLowerCase().includes('invalid') || driverError.message?.toLowerCase().includes('unauthorized')) {
        return NextResponse.json({ error: 'Server configuration error: invalid SUPABASE_SERVICE_ROLE_KEY. Please set a valid service role key.' }, { status: 500 });
      }
      return NextResponse.json({ error: 'Driver not found: ' + driverError.message }, { status: 404 });
    }

    if (!driver) {
      return NextResponse.json({ error: 'Driver not found' }, { status: 404 });
    }

    let authUserId: string;

    if (driver.auth_user_id) {
      // Update existing auth user's email and password
      const { data: updatedUser, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
        driver.auth_user_id,
        { email, password, email_confirm: true }
      );

      if (updateError) {
        return NextResponse.json({ error: 'Failed to update credentials: ' + updateError.message }, { status: 400 });
      }

      authUserId = updatedUser.user.id;
    } else {
      // Check if an auth user with this email already exists
      const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
      const existingUser = existingUsers?.users?.find((u) => u.email === email);

      if (existingUser) {
        // Check if this auth user is already linked to another driver
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

        // Update password for existing user and link
        const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
          existingUser.id,
          { password, email_confirm: true }
        );
        if (updateError) {
          return NextResponse.json({ error: 'Failed to update password: ' + updateError.message }, { status: 400 });
        }
        authUserId = existingUser.id;
      } else {
        // Create a new auth user
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

    // Update driver record with auth_user_id and email
    const { error: linkError } = await supabaseAdmin
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
