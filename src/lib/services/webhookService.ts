import { createClient } from '@/lib/supabase/client';

export interface WebhookConfig {
  id: string;
  name: string;
  url: string;
  method: 'GET' | 'POST';
  secret: string;
  events: string[];
  is_active: boolean;
  last_triggered_at?: string | null;
  last_status?: string | null;
}

export interface WebhookDelivery {
  id: string;
  webhook_id: string;
  event: string;
  payload: Record<string, unknown>;
  http_status: number | null;
  response_body: string | null;
  error_message: string | null;
  duration_ms: number | null;
  delivered_at: string;
}

async function generateSignature(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export const webhookService = {
  async fetchAll(): Promise<WebhookConfig[]> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('webhook_configs')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) {
      console.error('fetchWebhooks error:', error.message);
      return [];
    }
    return data ?? [];
  },

  async create(config: Omit<WebhookConfig, 'id'>): Promise<WebhookConfig | null> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('webhook_configs')
      .insert(config)
      .select()
      .single();
    if (error) {
      console.error('createWebhook error:', error.message);
      return null;
    }
    return data;
  },

  async update(id: string, updates: Partial<WebhookConfig>): Promise<boolean> {
    const supabase = createClient();
    const { error } = await supabase
      .from('webhook_configs')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id);
    return !error;
  },

  async remove(id: string): Promise<boolean> {
    const supabase = createClient();
    const { error } = await supabase.from('webhook_configs').delete().eq('id', id);
    return !error;
  },

  async deliver(webhookId: string, event: string, payload: Record<string, unknown>): Promise<WebhookDelivery | null> {
    const supabase = createClient();

    const { data: webhook } = await supabase
      .from('webhook_configs')
      .select('*')
      .eq('id', webhookId)
      .single();

    if (!webhook || !webhook.is_active) return null;

    const body = JSON.stringify({ event, data: payload, timestamp: new Date().toISOString() });
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
        method: webhook.method,
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
    }).eq('id', webhookId);

    const { data: delivery } = await supabase
      .from('webhook_deliveries')
      .insert({
        webhook_id: webhookId,
        event,
        payload,
        http_status: httpStatus,
        response_body: responseBody?.slice(0, 5000) ?? null,
        error_message: errorMessage,
        duration_ms: durationMs,
      })
      .select()
      .single();

    return delivery;
  },

  async fireEvent(event: string, payload: Record<string, unknown>): Promise<void> {
    const supabase = createClient();
    const { data: webhooks } = await supabase
      .from('webhook_configs')
      .select('id, events, is_active')
      .eq('is_active', true);

    if (!webhooks?.length) return;

    const matching = webhooks.filter(w => w.events.includes(event));
    await Promise.allSettled(matching.map(w => this.deliver(w.id, event, payload)));
  },

  async fetchDeliveries(webhookId?: string, limit = 50): Promise<WebhookDelivery[]> {
    const supabase = createClient();
    let query = supabase
      .from('webhook_deliveries')
      .select('*')
      .order('delivered_at', { ascending: false })
      .limit(limit);

    if (webhookId) query = query.eq('webhook_id', webhookId);

    const { data, error } = await query;
    if (error) {
      console.error('fetchDeliveries error:', error.message);
      return [];
    }
    return data ?? [];
  },
};
