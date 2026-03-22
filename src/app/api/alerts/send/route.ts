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

// ─── Send via Resend Edge Function ────────────────────────────────────────────

async function sendViaResend(params: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const edgeFnUrl = `${supabaseUrl}/functions/v1/send-email`;

    const res = await fetch(edgeFnUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        to: params.to,
        subject: params.subject,
        html: params.html,
        from_name: 'CastleAdmin',
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return { success: false, error: data?.error || 'Failed to send via Resend' };
    }
    return { success: true };
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
      recipient_email,
      shortcodes = {},
    } = body;

    if (!trigger_type || !recipient_email) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: trigger_type, recipient_email' },
        { status: 400 }
      );
    }

    // Fetch active template for this trigger
    const { data: templates, error: fetchErr } = await supabaseAdmin
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
      // No active template — silently skip
      return NextResponse.json({ success: true, skipped: true, reason: 'No active template found' });
    }

    const template = templates[0];
    const populatedSubject = populateShortcodes(template.subject || '', shortcodes);
    const populatedBody = populateShortcodes(template.body || '', shortcodes);

    // Wrap plain body in HTML if not already wrapped
    const html = populatedBody.startsWith('<') ? populatedBody : `<p>${populatedBody}</p>`;

    const result = await sendViaResend({
      to: recipient_email,
      subject: populatedSubject,
      html,
    });

    // Log the alert
    await supabaseAdmin.from('email_alert_logs').insert({
      template_id: template.id,
      trigger_type,
      channel: 'email',
      recipient: recipient_email,
      subject: populatedSubject,
      status: result.success ? 'sent' : 'failed',
      error_message: result.error ?? null,
      order_id: shortcodes.order_id ?? null,
      metadata: shortcodes,
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
