-- Webhook Event Logs
-- Extends woocommerce_webhook_log with full event tracking: HTTP status, retry count, full payload

ALTER TABLE public.woocommerce_webhook_log
  ADD COLUMN IF NOT EXISTS http_status integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS retry_count integer DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS full_payload jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS event_type text GENERATED ALWAYS AS (topic) STORED,
  ADD COLUMN IF NOT EXISTS processed_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS error_message text DEFAULT NULL;

-- Index for retry count queries
CREATE INDEX IF NOT EXISTS idx_wc_webhook_log_retry ON public.woocommerce_webhook_log(retry_count);
CREATE INDEX IF NOT EXISTS idx_wc_webhook_log_http_status ON public.woocommerce_webhook_log(http_status);

-- Allow authenticated users to update (for resend/retry)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'woocommerce_webhook_log'
      AND policyname = 'Authenticated users can update woocommerce_webhook_log'
  ) THEN
    CREATE POLICY "Authenticated users can update woocommerce_webhook_log"
      ON public.woocommerce_webhook_log
      FOR UPDATE
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END;
$$;
