import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ─── Shortcode Population ─────────────────────────────────────────────────────

function populateShortcodes(template: string, data: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => data[key] ?? `{{${key}}}`);
}

// ─── Send via Twilio Edge Function ────────────────────────────────────────────

async function sendViaTwilio(params: {
  to: string;
  message: string;
}): Promise<{ success: boolean; messageSid?: string; error?: string }> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const edgeFnUrl = `${supabaseUrl}/functions/v1/send-sms`;

    const res = await fetch(edgeFnUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        to: params.to,
        message: params.message,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return { success: false, error: data?.error || 'Failed to send via Twilio' };
    }
    return { success: true, messageSid: data?.messageSid };
  } catch (err: any) {
    return { success: false, error: err?.message ?? 'Unknown error' };
  }
}

// ─── POST Handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      trigger_type,
      recipient_phone,
      shortcodes = {},
    } = body;

    if (!trigger_type || !recipient_phone) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: trigger_type, recipient_phone' },
        { status: 400 }
      );
    }

    // Fetch active SMS template for this trigger
    const { data: templates, error: fetchErr } = await supabaseAdmin
      .from('message_templates')
      .select('*')
      .eq('trigger_type', trigger_type)
      .eq('channel', 'sms')
      .eq('is_active', true)
      .limit(1);

    if (fetchErr) {
      return NextResponse.json({ success: false, error: fetchErr.message }, { status: 500 });
    }

    if (!templates || templates.length === 0) {
      return NextResponse.json({ success: true, skipped: true, reason: 'No active SMS template found' });
    }

    const template = templates[0];
    const populatedMessage = populateShortcodes(template.body || '', shortcodes);

    const result = await sendViaTwilio({
      to: recipient_phone,
      message: populatedMessage,
    });

    // Log the SMS alert
    await supabaseAdmin.from('sms_alert_logs').insert({
      template_id: template.id,
      trigger_type,
      channel: 'sms',
      recipient: recipient_phone,
      message: populatedMessage,
      status: result.success ? 'sent' : 'failed',
      error_message: result.error ?? null,
      message_sid: result.messageSid ?? null,
      order_id: shortcodes.order_id ?? null,
      metadata: shortcodes,
    });

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 500 });
    }

    return NextResponse.json({ success: true, messageSid: result.messageSid });
  } catch (err: any) {
    console.error('sms-alerts/send error:', err?.message ?? err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
