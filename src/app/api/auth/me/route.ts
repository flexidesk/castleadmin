import { NextRequest, NextResponse } from 'next/server';
import { verify } from 'jsonwebtoken';
import { createClient } from '@/lib/db/server';

export const dynamic = 'force-dynamic';

const JWT_SECRET = process.env.JWT_SECRET || 'castleadmin-jwt-secret-change-in-production';

export async function GET(req: NextRequest) {
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

    const db = await createClient();
    const { data: users } = await db
      .from('admin_users')
      .select('id, email, full_name, role, is_active')
      .eq('id', payload.sub)
      .limit(1);

    const user = Array.isArray(users) ? users[0] : null;
    if (!user || !user.is_active) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    return NextResponse.json({
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      email_confirmed_at: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
