-- WooCommerce Webhook Log
-- Tracks all incoming webhook events from WooCommerce (order.created, order.updated, order.completed)

CREATE TABLE IF NOT EXISTS public.woocommerce_webhook_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  woo_order_id text NOT NULL,
  topic text NOT NULL,
  payload_summary jsonb DEFAULT '{}',
  received_at timestamptz DEFAULT now() NOT NULL
);

-- Index for quick lookups by order id and topic
CREATE INDEX IF NOT EXISTS idx_wc_webhook_log_order_id ON public.woocommerce_webhook_log(woo_order_id);
CREATE INDEX IF NOT EXISTS idx_wc_webhook_log_received_at ON public.woocommerce_webhook_log(received_at DESC);

-- RLS
ALTER TABLE public.woocommerce_webhook_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on woocommerce_webhook_log"
  ON public.woocommerce_webhook_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can read woocommerce_webhook_log"
  ON public.woocommerce_webhook_log
  FOR SELECT
  TO authenticated
  USING (true);
