import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/db/server';
import { createHash, randomBytes } from 'crypto';
import { sign } from 'jsonwebtoken';

export const dynamic = 'force-dynamic';

const JWT_SECRET = process.env.JWT_SECRET || 'castleadmin-jwt-secret-change-in-production';

function hashPassword(password: string, salt: string): string {
  return createHash('sha256').update(salt + password + salt).digest('hex');
}

export async function POST(req: NextRequest) {
  try {
    const { email, password, full_name } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }

    const db = await createClient();

    // Check if email already exists
    const { data: existing } = await db
      .from('admin_users')
      .select('id')
      .eq('email', email.toLowerCase().trim())
      .limit(1);

    if (Array.isArray(existing) && existing.length > 0) {
      return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 });
    }

    const salt = randomBytes(16).toString('hex');
    const passwordHash = hashPassword(password, salt);
    const id = randomBytes(16).toString('hex');

    const { data: newUser, error } = await db
      .from('admin_users')
      .insert({
        id,
        email: email.toLowerCase().trim(),
        password_hash: passwordHash,
        password_salt: salt,
        full_name: full_name || '',
        role: 'admin',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .single();

    if (error) {
      console.error('[auth/register] DB error:', error.message);
      return NextResponse.json({ error: 'Failed to create account' }, { status: 500 });
    }

    const user = newUser || { id, email: email.toLowerCase().trim(), full_name, role: 'admin' };

    const token = sign(
      {
        sub: user.id,
        email: user.email,
        role: user.role || 'admin',
        iat: Math.floor(Date.now() / 1000),
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return NextResponse.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name || full_name,
        role: user.role || 'admin',
        email_confirmed_at: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    console.error('[auth/register] error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
