-- WooCommerce sync log table
CREATE TABLE IF NOT EXISTS public.woocommerce_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  synced_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  orders_fetched INTEGER NOT NULL DEFAULT 0,
  orders_upserted INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'success', -- 'success' | 'partial' | 'error'
  message TEXT
);

CREATE INDEX IF NOT EXISTS idx_woocommerce_sync_log_synced_at ON public.woocommerce_sync_log(synced_at DESC);

ALTER TABLE public.woocommerce_sync_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "woocommerce_sync_log_all" ON public.woocommerce_sync_log;
CREATE POLICY "woocommerce_sync_log_all"
  ON public.woocommerce_sync_log
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
