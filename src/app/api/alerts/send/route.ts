import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/db/server';

function populateShortcodes(template: string, data: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => data[key] ?? `{{${key}}}`);
}

async function sendViaResend(params: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch('/api/smtp/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: params.to,
        subject: params.subject,
        html: params.html,
        from_name: 'CastleAdmin',
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return { success: false, error: data?.error || 'Failed to send email' };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message ?? 'Unknown error' };
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { trigger_type, recipient_email, shortcodes = {} } = body;

    if (!trigger_type || !recipient_email) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: trigger_type, recipient_email' },
        { status: 400 }
      );
    }

    const db = await createClient();

    const { data: templates, error: fetchErr } = await db
      .from('message_templates')
      .select('*')
      .eq('trigger_type', trigger_type)
      .eq('channel', 'email')
      .eq('is_active', true)
      .limit(1);

    if (fetchErr) {
      return NextResponse.json({ success: false, error: fetchErr.message }, { status: 500 });
    }

    if (!templates || templates.length === 0) {
      return NextResponse.json({ success: true, skipped: true, reason: 'No active template found' });
    }

    const template = templates[0];
    const populatedSubject = populateShortcodes(template.subject || '', shortcodes);
    const populatedBody = populateShortcodes(template.body || '', shortcodes);
    const html = populatedBody.startsWith('<') ? populatedBody : `<p>${populatedBody}</p>`;

    const result = await sendViaResend({ to: recipient_email, subject: populatedSubject, html });

    await db.from('email_alert_logs').insert({
      template_id: template.id,
      trigger_type,
      channel: 'email',
      recipient: recipient_email,
      subject: populatedSubject,
      status: result.success ? 'sent' : 'failed',
      error_message: result.error ?? null,
      order_id: shortcodes.order_id ?? null,
      metadata: JSON.stringify(shortcodes),
    });

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('alerts/send error:', err?.message ?? err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
