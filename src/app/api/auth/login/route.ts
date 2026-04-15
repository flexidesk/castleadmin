import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/db/server';
import { createHash } from 'crypto';
import { sign } from 'jsonwebtoken';

export const dynamic = 'force-dynamic';

const JWT_SECRET = process.env.JWT_SECRET || 'castleadmin-jwt-secret-change-in-production';

function hashPassword(password: string, salt: string): string {
  return createHash('sha256').update(salt + password + salt).digest('hex');
}

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    const db = await createClient();
    const { data: users, error } = await db
      .from('admin_users')
      .select('id, email, password_hash, password_salt, full_name, role, is_active')
      .eq('email', email.toLowerCase().trim())
      .limit(1);

    if (error) {
      console.error('[auth/login] DB error:', error.message);
      return NextResponse.json({ error: 'Authentication service unavailable' }, { status: 503 });
    }

    const user = Array.isArray(users) ? users[0] : null;

    if (!user || !user.is_active) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    const passwordHash = hashPassword(password, user.password_salt || 'default-salt');
    if (passwordHash !== user.password_hash) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

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
        full_name: user.full_name,
        role: user.role,
        email_confirmed_at: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    console.error('[auth/login] error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
