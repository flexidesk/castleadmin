import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function generateSignature(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function POST(request: NextRequest) {
  try {
    const { event, data, webhook_id } = await request.json();
    if (!event || !data) {
      return NextResponse.json({ error: 'Missing event or data' }, { status: 400 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let matching: any[];

    if (webhook_id) {
      const { data: single } = await supabase
        .from('webhook_configs')
        .select('*')
        .eq('id', webhook_id)
        .single();
      matching = single ? [single] : [];
    } else {
      const { data: webhooks } = await supabase
        .from('webhook_configs')
        .select('*')
        .eq('is_active', true);

      if (!webhooks?.length) {
        return NextResponse.json({ fired: 0, message: 'No active webhooks' });
      }
      matching = webhooks.filter((w: any) => w.events?.includes(event));
    }

    if (!matching.length) {
      return NextResponse.json({ fired: 0, message: `No webhooks matched` });
    }

    const results = await Promise.allSettled(matching.map(async (webhook: any) => {
      const body = JSON.stringify({ event, data, timestamp: new Date().toISOString() });
      const start = Date.now();
      let httpStatus: number | null = null;
      let responseBody: string | null = null;
      let errorMessage: string | null = null;

      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (webhook.secret) {
          headers['X-Webhook-Signature'] = await generateSignature(body, webhook.secret);
        }
        headers['X-Webhook-Event'] = event;

        const res = await fetch(webhook.url, {
          method: webhook.method || 'POST',
          headers,
          body: webhook.method === 'POST' ? body : undefined,
          signal: AbortSignal.timeout(10000),
        });
        httpStatus = res.status;
        responseBody = await res.text().catch(() => null);
      } catch (err: unknown) {
        errorMessage = err instanceof Error ? err.message : 'Unknown error';
      }

      const durationMs = Date.now() - start;

      await supabase.from('webhook_configs').update({
        last_triggered_at: new Date().toISOString(),
        last_status: httpStatus ? `${httpStatus}` : 'failed',
      }).eq('id', webhook.id);

      await supabase.from('webhook_deliveries').insert({
        webhook_id: webhook.id,
        event,
        payload: data,
        http_status: httpStatus,
        response_body: responseBody?.slice(0, 5000) ?? null,
        error_message: errorMessage,
        duration_ms: durationMs,
      });

      return { webhook_id: webhook.id, name: webhook.name, status: httpStatus, error: errorMessage };
    }));

    const fired = results.filter(r => r.status === 'fulfilled').length;
    return NextResponse.json({ fired, total: matching.length, results: results.map(r => r.status === 'fulfilled' ? (r as any).value : { error: (r as any).reason?.message }) });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
