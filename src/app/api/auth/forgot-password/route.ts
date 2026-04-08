import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/db/server';

import { randomBytes } from 'crypto';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { email, redirectTo } = await req.json();

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const db = await createClient();
    const { data: users } = await db
      .from('admin_users')
      .select('id, email, full_name')
      .eq('email', email.toLowerCase().trim())
      .limit(1);

    const user = Array.isArray(users) ? users[0] : null;

    // Always return success to prevent email enumeration
    if (!user) {
      return NextResponse.json({ success: true });
    }

    // Generate reset token
    const resetToken = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

    await db.from('admin_users').update({
      reset_token: resetToken,
      reset_token_expires_at: expiresAt,
    }).eq('id', user.id);

    const baseUrl = redirectTo?.split('?')[0] || `${process.env.NEXT_PUBLIC_SITE_URL || ''}/reset-password`;
    const resetUrl = `${baseUrl}?token=${resetToken}`;

    // Send reset email via SMTP
    try {
      await fetch('/api/smtp/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: user.email,
          subject: 'Reset your CastleAdmin password',
          html: `
            <p>Hi ${user.full_name || 'there'},</p>
            <p>You requested a password reset for your CastleAdmin account.</p>
            <p><a href="${resetUrl}" style="background:#1e40af;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;">Reset Password</a></p>
            <p>This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
          `,
        }),
      });
    } catch {
      // Email send failure — still return success
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
