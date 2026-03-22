-- WooCommerce integration settings table
CREATE TABLE IF NOT EXISTS public.woocommerce_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_url TEXT NOT NULL DEFAULT '',
  consumer_key TEXT NOT NULL DEFAULT '',
  consumer_secret TEXT NOT NULL DEFAULT '',
  is_connected BOOLEAN NOT NULL DEFAULT false,
  last_tested_at TIMESTAMPTZ,
  last_test_status TEXT,
  last_test_message TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_woocommerce_settings_id ON public.woocommerce_settings(id);

ALTER TABLE public.woocommerce_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "woocommerce_settings_all" ON public.woocommerce_settings;
CREATE POLICY "woocommerce_settings_all"
  ON public.woocommerce_settings
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Seed one row so the form always has a record to update
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.woocommerce_settings LIMIT 1) THEN
    INSERT INTO public.woocommerce_settings (store_url, consumer_key, consumer_secret, is_connected)
    VALUES ('', '', '', false);
  END IF;
END $$;
