import { NextRequest, NextResponse } from 'next/server';
import { verify } from 'jsonwebtoken';
import { createClient } from '@/lib/db/server';
import { createHash, randomBytes } from 'crypto';

export const dynamic = 'force-dynamic';

const JWT_SECRET = process.env.JWT_SECRET || 'castleadmin-jwt-secret-change-in-production';

function hashPassword(password: string, salt: string): string {
  return createHash('sha256').update(salt + password + salt).digest('hex');
}

export async function PATCH(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.slice(7);
    let payload: any;
    try {
      payload = verify(token, JWT_SECRET);
    } catch {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
    }

    const { password, email } = await req.json();
    const db = await createClient();
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (password) {
      const salt = randomBytes(16).toString('hex');
      updates.password_hash = hashPassword(password, salt);
      updates.password_salt = salt;
    }

    if (email) {
      updates.email = email.toLowerCase().trim();
    }

    const { error } = await db
      .from('admin_users')
      .update(updates)
      .eq('id', payload.sub);

    if (error) {
      return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
    }

    const { data: users } = await db
      .from('admin_users')
      .select('id, email, full_name, role')
      .eq('id', payload.sub)
      .limit(1);

    const user = Array.isArray(users) ? users[0] : null;

    return NextResponse.json({ user });
  } catch (err: any) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
