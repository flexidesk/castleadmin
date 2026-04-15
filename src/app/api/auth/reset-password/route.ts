import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/db/server';
import { createHash } from 'crypto';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { token, password } = await req.json();

    if (!token || !password) {
      return NextResponse.json({ error: 'Token and password are required' }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }

    const db = await createClient();
    const { data: users } = await db
      .from('admin_users')
      .select('id, reset_token, reset_token_expires_at')
      .eq('reset_token', token)
      .limit(1);

    const user = Array.isArray(users) ? users[0] : null;

    if (!user) {
      return NextResponse.json({ error: 'Invalid or expired reset token' }, { status: 400 });
    }

    if (user.reset_token_expires_at && new Date(user.reset_token_expires_at) < new Date()) {
      return NextResponse.json({ error: 'Reset token has expired. Please request a new one.' }, { status: 400 });
    }

    const { randomBytes } = await import('crypto');
    const salt = randomBytes(16).toString('hex');
    const passwordHash = createHash('sha256').update(salt + password + salt).digest('hex');

    await db.from('admin_users').update({
      password_hash: passwordHash,
      password_salt: salt,
      reset_token: null,
      reset_token_expires_at: null,
      updated_at: new Date().toISOString(),
    }).eq('id', user.id);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
