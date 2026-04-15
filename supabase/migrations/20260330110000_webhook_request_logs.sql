-- Webhook Request Logs
-- Stores all incoming GET and POST requests to the generic webhook endpoint
-- for debugging, auditing, and monitoring purposes.

CREATE TABLE IF NOT EXISTS public.webhook_request_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  method        TEXT NOT NULL,                        -- 'GET' or 'POST'
  endpoint      TEXT NOT NULL DEFAULT '/api/woocommerce/webhook',
  payload       JSONB NOT NULL DEFAULT '{}',          -- query params (GET) or body (POST)
  http_status   INTEGER NOT NULL,                     -- response status code
  response      JSONB NOT NULL DEFAULT '{}',          -- response body returned
  ip_address    TEXT,                                 -- caller IP (if available)
  user_agent    TEXT,                                 -- caller user-agent
  duration_ms   INTEGER,                              -- processing time in milliseconds
  received_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_webhook_request_logs_received_at
  ON public.webhook_request_logs(received_at DESC);

CREATE INDEX IF NOT EXISTS idx_webhook_request_logs_method
  ON public.webhook_request_logs(method);

CREATE INDEX IF NOT EXISTS idx_webhook_request_logs_http_status
  ON public.webhook_request_logs(http_status);

-- Enable RLS
ALTER TABLE public.webhook_request_logs ENABLE ROW LEVEL SECURITY;

-- Authenticated users (admins) can read all logs
DROP POLICY IF EXISTS "Authenticated users can read webhook_request_logs" ON public.webhook_request_logs;
CREATE POLICY "Authenticated users can read webhook_request_logs"
  ON public.webhook_request_logs
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow service role / API routes to insert logs (anon insert for webhook endpoint)
DROP POLICY IF EXISTS "Service can insert webhook_request_logs" ON public.webhook_request_logs;
CREATE POLICY "Service can insert webhook_request_logs"
  ON public.webhook_request_logs
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);
