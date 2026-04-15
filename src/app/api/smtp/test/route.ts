import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { host, port, secure, user, pass, fromName, fromEmail, toEmail } = body;

    if (!host || !port || !user || !pass || !fromEmail || !toEmail) {
      return NextResponse.json(
        { success: false, error: 'Missing required SMTP fields' },
        { status: 400 }
      );
    }

    const transporter = nodemailer.createTransport({
      host,
      port: Number(port),
      secure: secure === true || secure === 'true',
      auth: { user, pass },
    });

    await transporter.verify();

    await transporter.sendMail({
      from: `"${fromName || 'CastleAdmin'}" <${fromEmail}>`,
      to: toEmail,
      subject: 'CastleAdmin — SMTP Test Email',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;border:1px solid #e5e7eb;border-radius:8px;">
          <h2 style="color:#6366f1;margin-top:0;">✅ SMTP Configuration Test</h2>
          <p style="color:#374151;">Your SMTP server is configured correctly and CastleAdmin can send emails successfully.</p>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;" />
          <p style="color:#6b7280;font-size:12px;">Server: ${host}:${port} | Secure: ${secure}</p>
        </div>
      `,
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('SMTP test error:', err?.message ?? err);
    return NextResponse.json({ success: false, error: err?.message ?? 'SMTP test failed' }, { status: 500 });
  }
}
