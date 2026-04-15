import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/db/server';

function populateShortcodes(template: string, data: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => data[key] ?? `{{${key}}}`);
}

async function sendViaWhatsApp(params: {
  to: string;
  message: string;
}): Promise<{ success: boolean; messageSid?: string; error?: string }> {
  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_WHATSAPP_NUMBER;

    if (!accountSid || !authToken || !fromNumber ||
        accountSid.startsWith('your-') || authToken.startsWith('your-')) {
      return { success: false, error: 'Twilio WhatsApp not configured' };
    }

    const to = params.to.startsWith('whatsapp:') ? params.to : `whatsapp:${params.to}`;
    const from = fromNumber.startsWith('whatsapp:') ? fromNumber : `whatsapp:${fromNumber}`;

    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
        },
        body: new URLSearchParams({ To: to, From: from, Body: params.message }),
      }
    );

    const data = await res.json();
    if (!res.ok) {
      return { success: false, error: data?.message || 'Failed to send WhatsApp message' };
    }
    return { success: true, messageSid: data?.sid };
  } catch (err: any) {
    return { success: false, error: err?.message ?? 'Unknown error' };
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { trigger_type, recipient_phone, shortcodes = {} } = body;

    if (!trigger_type || !recipient_phone) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: trigger_type, recipient_phone' },
        { status: 400 }
      );
    }

    const db = await createClient();

    const { data: templates, error: fetchErr } = await db
      .from('message_templates')
      .select('*')
      .eq('trigger_type', trigger_type)
      .eq('channel', 'whatsapp')
      .eq('is_active', true)
      .limit(1);

    if (fetchErr) {
      return NextResponse.json({ success: false, error: fetchErr.message }, { status: 500 });
    }

    if (!templates || templates.length === 0) {
      return NextResponse.json({ success: true, skipped: true, reason: 'No active WhatsApp template found' });
    }

    const template = templates[0];
    const populatedMessage = populateShortcodes(template.body || '', shortcodes);

    const result = await sendViaWhatsApp({ to: recipient_phone, message: populatedMessage });

    await db.from('sms_alert_logs').insert({
      template_id: template.id,
      trigger_type,
      channel: 'whatsapp',
      recipient: recipient_phone,
      message: populatedMessage,
      status: result.success ? 'sent' : 'failed',
      error_message: result.error ?? null,
      message_sid: result.messageSid ?? null,
      order_id: shortcodes.order_id ?? null,
      metadata: JSON.stringify(shortcodes),
    });

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 500 });
    }

    return NextResponse.json({ success: true, messageSid: result.messageSid });
  } catch (err: any) {
    console.error('whatsapp-alerts/send error:', err?.message ?? err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
